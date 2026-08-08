const express = require("express");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, nextSequentialId, today, findOrCreateCustomer } = require("../utils/helpers");
const { checkExistingData } = require("./dataManager.routes").internal;
const { nextSlaDeadline } = require("../utils/officeHours");

const router = express.Router();
router.use(requireAuth);

// Lead Assignment Manager (and Sales Manager/Admin-tier) see every lead; everyone else only their own.
const canManageAllLeads = (roles) => isAdminLike(roles) || roles.includes("sales_manager") || roles.includes("lead_manager");
// Only the Lead Manager role (or Admin-tier, as everywhere else in this app) brings in leads for
// central distribution — a Sales Manager can see everything but no longer creates unassigned/
// distributable leads or assigns them; their own new-lead-button use is just their own pipeline.
const canDistributeLeads = (roles) => isAdminLike(roles) || roles.includes("lead_manager");

router.get("/", async (req, res) => {
  const isAdmin = canManageAllLeads(req.user.roles);
  const rows = isAdmin
    ? await query("SELECT * FROM leads ORDER BY created_at DESC")
    : await query("SELECT * FROM leads WHERE owner = ? ORDER BY created_at DESC", [req.user.id]);
  // Placeholders are expanded explicitly: query() wraps pool.execute() (prepared statements),
  // which — unlike pool.query() — does NOT turn a single array param into IN (?,?,...). Passing
  // the array as one `?` silently matches nothing, so every lead came back with no follow-ups.
  const leadIds = rows.map((r) => r.id);
  const followUps = leadIds.length
    ? await query(`SELECT * FROM lead_followups WHERE lead_id IN (${leadIds.map(() => "?").join(",")}) ORDER BY at DESC`, leadIds)
    : [];
  res.json(rows.map((r) => ({ ...r, followUps: followUps.filter((f) => f.lead_id === r.id) })));
});

router.post("/", async (req, res) => {
  const b = req.body;
  const id = await withTransaction((conn) => nextSequentialId(conn, "AGBSLS", "lead"));
  // A rep adding their own lead always owns it immediately (their pipeline, no SLA — the SLA
  // exists to hold sales reps to a fast first response on leads someone else handed them). A
  // Lead Manager/admin bringing in a company lead leaves it unassigned by default — it lands in
  // the Lead Assignment Manager queue and only starts its SLA clock once it actually gets an
  // owner (here, if one was given up front, or later via /:id/assign).
  const distributing = canDistributeLeads(req.user.roles);
  const owner = distributing ? (b.owner || null) : (b.owner || req.user.id);
  // SLA only kicks in on an actual hand-off — a distributor creating a lead and immediately
  // assigning it to someone else. A Lead Manager/admin adding a lead for their own pipeline via
  // the regular Leads page (owner defaults to themselves) is no different from any other user
  // doing the same — self-owned, no SLA.
  const assignedAt = distributing && owner && owner !== req.user.id ? new Date() : null;
  const slaDueAt = assignedAt ? nextSlaDeadline(assignedAt) : null;

  // Every lead gets a Customer profile from day one — reusing an existing one (matched by
  // name, or by phone/email under a different name) instead of creating a duplicate, and
  // persisting the link so this lead's `company` text stays reconciled with that Customer
  // forever (see customers.routes.js PATCH's rename cascade).
  const { customerId, duplicateOf } = await findOrCreateCustomer(query, { name: b.company, phone: b.phone, email: b.email, contact: b.name, ownerId: owner });

  await query(
    `INSERT INTO leads (id, name, company, phone, email, reference, source, service, owner, status, next_follow_up, created_by, assigned_at, sla_due_at, customer_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, b.name, b.company, b.phone || null, b.email || null, b.reference || null, b.source || null, b.service || null, owner, "New", b.nextFollowUp || null, req.user.id, assignedAt, slaDueAt, customerId]
  );
  await query("INSERT INTO activity_log (text) VALUES (?)", [`New lead ${id} — ${b.company}`]);

  // Data Manager integration: notify if this lead matches an existing outreach data record.
  await checkExistingData({ id, company: b.company, email: b.email, phone: b.phone });

  res.status(201).json({ id, customerId, duplicateOf });
});

// A sales_exec (or Ops team member — they now see/manage their own leads too, e.g. one they added
// via the Dashboard's quick-add) may only modify their own lead, even if they somehow know another
// lead's id — GET already keeps them from seeing it, but nothing previously stopped a direct API call.
const isSalesExecOnly = (roles) => (roles.includes("sales_exec") || roles.includes("ops_manager") || roles.includes("ops_member")) && !isAdminLike(roles) && !roles.includes("sales_manager");
async function assertOwnsOrAdmin(req, res) {
  if (!isSalesExecOnly(req.user.roles)) return true;
  const [lead] = await query("SELECT owner FROM leads WHERE id = ?", [req.params.id]);
  if (lead && lead.owner && lead.owner !== req.user.id) {
    res.status(403).json({ error: "You can only modify your own leads" });
    return false;
  }
  return true;
}

router.patch("/:id", async (req, res) => {
  if (!(await assertOwnsOrAdmin(req, res))) return;
  const b = req.body;
  const fields = [];
  const params = [];
  for (const [col, key] of [["name", "name"], ["company", "company"], ["phone", "phone"], ["email", "email"], ["reference", "reference"], ["source", "source"], ["service", "service"], ["status", "status"], ["next_follow_up", "nextFollowUp"]]) {
    if (b[key] !== undefined) { fields.push(`${col} = ?`); params.push(b[key]); }
  }
  // Editing the company name means it may now belong to a different (or new) Customer profile —
  // re-resolve rather than leaving customer_id pointed at the old one.
  if (b.company !== undefined) {
    const { customerId } = await findOrCreateCustomer(query, { name: b.company, phone: b.phone, email: b.email, ownerId: req.user.id });
    fields.push("customer_id = ?"); params.push(customerId);
  }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE leads SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

// Assign or reassign a lead — restarts the SLA clock from this moment (a lead reassigned to a
// new owner gets a fresh 5-minute window, not the original owner's now-irrelevant deadline).
router.post("/:id/assign", requireRole(["lead_manager", "admin_like"]), async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId is required" });
  const assignedAt = new Date();
  const slaDueAt = nextSlaDeadline(assignedAt);
  const result = await query(
    "UPDATE leads SET owner = ?, assigned_at = ?, sla_due_at = ?, sla_violated = 0 WHERE id = ?",
    [userId, assignedAt, slaDueAt, req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: "Not found" });
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'lead_assigned', ?, ?, ?)",
    [nextId("NT"), "Lead assigned to you", `${req.params.id} has been assigned to you — first follow-up is due by ${slaDueAt.toISOString()}.`, JSON.stringify([userId])]);
  res.json({ ok: true, assignedAt, slaDueAt });
});

router.post("/:id/follow-up", async (req, res) => {
  const { note, status, nextFollowUp } = req.body;
  await query("INSERT INTO lead_followups (id, lead_id, note, outcome) VALUES (?,?,?,?)", [nextId("FU"), req.params.id, note, status]);
  await query("UPDATE leads SET status = COALESCE(?, status), next_follow_up = ? WHERE id = ?", [status || null, nextFollowUp || null, req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/convert-to-deal", async (req, res) => {
  const { value } = req.body;
  const result = await withTransaction(async (conn) => {
    const [[lead]] = await conn.execute("SELECT * FROM leads WHERE id = ?", [req.params.id]);
    if (!lead) throw new Error("Lead not found");
    await conn.execute("UPDATE leads SET status = 'Converted' WHERE id = ?", [req.params.id]);
    const dealId = await nextSequentialId(conn, "AGBSDS", "deal");
    await conn.execute(
      `INSERT INTO deals (id, lead_id, customer, service, value, owner, stage, expected_close, customer_id) VALUES (?,?,?,?,?,?,?,?,?)`,
      [dealId, lead.id, lead.company, lead.service, value || 0, lead.owner, "Open", (() => { const d = new Date(); d.setDate(d.getDate() + 21); return d.toISOString().slice(0, 10); })(), lead.customer_id]
    );
    return dealId;
  });
  res.status(201).json({ dealId: result });
});

router.delete("/:id", async (req, res) => {
  if (!(await assertOwnsOrAdmin(req, res))) return;
  await query("DELETE FROM leads WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
