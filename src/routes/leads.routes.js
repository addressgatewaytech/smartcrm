const express = require("express");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { isAdminLike } = require("../middleware/roles");
const { nextId, nextSequentialId, today } = require("../utils/helpers");
const { checkExistingData } = require("./dataManager.routes").internal;

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const isAdmin = isAdminLike(req.user.roles) || req.user.roles.includes("sales_manager");
  const rows = isAdmin
    ? await query("SELECT * FROM leads ORDER BY created_at DESC")
    : await query("SELECT * FROM leads WHERE owner = ? ORDER BY created_at DESC", [req.user.id]);
  const followUps = await query("SELECT * FROM lead_followups WHERE lead_id IN (?) ORDER BY at DESC", [rows.map((r) => r.id).length ? rows.map((r) => r.id) : [""]]);
  res.json(rows.map((r) => ({ ...r, followUps: followUps.filter((f) => f.lead_id === r.id) })));
});

// Finds a Customer that already matches this lead (by company name, or by phone/email
// belonging to a different-named customer) rather than creating a duplicate profile; only
// creates a new Customer when nothing matches. Returns { customerId, duplicateOf } — duplicateOf
// is set (existing customer name) only when the match came from phone/email, not name, so the
// frontend can surface "this looks like an existing customer" instead of silently merging.
async function findOrCreateCustomerForLead(b) {
  const [byName] = await query("SELECT id, name FROM customers WHERE LOWER(name) = LOWER(?)", [b.company]);
  if (byName) return { customerId: byName.id, duplicateOf: null };

  const dupConditions = [];
  const dupParams = [];
  if (b.phone) { dupConditions.push("phone = ?"); dupParams.push(b.phone); }
  if (b.email) { dupConditions.push("email = ?"); dupParams.push(b.email); }
  if (dupConditions.length) {
    const [byContact] = await query(`SELECT id, name FROM customers WHERE ${dupConditions.join(" OR ")} LIMIT 1`, dupParams);
    if (byContact) return { customerId: byContact.id, duplicateOf: byContact.name };
  }

  const customerId = nextId("CU");
  await query("INSERT INTO customers (id, name, type, contact, phone, email) VALUES (?,?,?,?,?,?)",
    [customerId, b.company, "Company", b.name || null, b.phone || null, b.email || null]);
  return { customerId, duplicateOf: null };
}

router.post("/", async (req, res) => {
  const b = req.body;
  const id = await withTransaction((conn) => nextSequentialId(conn, "AGBSLS", "lead"));
  await query(
    `INSERT INTO leads (id, name, company, phone, email, reference, source, service, owner, status, next_follow_up)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, b.name, b.company, b.phone || null, b.email || null, b.reference || null, b.source || null, b.service || null, b.owner || req.user.id, "New", b.nextFollowUp || null]
  );
  await query("INSERT INTO activity_log (text) VALUES (?)", [`New lead ${id} — ${b.company}`]);

  // Data Manager integration: notify if this lead matches an existing outreach data record.
  await checkExistingData({ id, company: b.company, email: b.email, phone: b.phone });

  // Every lead gets a Customer profile from day one — reusing an existing one (matched by
  // name, or by phone/email under a different name) instead of creating a duplicate.
  const { customerId, duplicateOf } = await findOrCreateCustomerForLead(b);

  res.status(201).json({ id, customerId, duplicateOf });
});

router.patch("/:id", async (req, res) => {
  const b = req.body;
  const fields = [];
  const params = [];
  for (const [col, key] of [["name", "name"], ["company", "company"], ["phone", "phone"], ["email", "email"], ["reference", "reference"], ["source", "source"], ["service", "service"], ["status", "status"], ["next_follow_up", "nextFollowUp"]]) {
    if (b[key] !== undefined) { fields.push(`${col} = ?`); params.push(b[key]); }
  }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE leads SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
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
      `INSERT INTO deals (id, lead_id, customer, service, value, owner, stage, expected_close) VALUES (?,?,?,?,?,?,?,?)`,
      [dealId, lead.id, lead.company, lead.service, value || 0, lead.owner, "Open", (() => { const d = new Date(); d.setDate(d.getDate() + 21); return d.toISOString().slice(0, 10); })()]
    );
    return dealId;
  });
  res.status(201).json({ dealId: result });
});

router.delete("/:id", async (req, res) => {
  await query("DELETE FROM leads WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
