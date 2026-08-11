const express = require("express");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { isAdminLike } = require("../middleware/roles");
const { nextSequentialId, findOrCreateCustomer } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

// Same visibility rule as /leads: a sales_exec (or Ops team member, who now sees/manages their own
// pipeline the same way once they've added a lead) only sees their own deals; sales managers and
// admins see everyone's. (A deal with no owner shouldn't normally exist — POST always sets one —
// but "OR owner IS NULL" is kept for parity with /leads in case of legacy/imported rows.)
const isSalesExecOnly = (roles) => (roles.includes("sales_exec") || roles.includes("ops_manager") || roles.includes("ops_member")) && !isAdminLike(roles) && !roles.includes("sales_manager");

router.get("/", async (req, res) => {
  const rows = isSalesExecOnly(req.user.roles)
    ? await query("SELECT * FROM deals WHERE owner = ? OR owner IS NULL ORDER BY created_at DESC", [req.user.id])
    : await query("SELECT * FROM deals ORDER BY created_at DESC");
  res.json(rows);
});

router.post("/", async (req, res) => {
  const b = req.body;
  const id = await withTransaction((conn) => nextSequentialId(conn, "AGBSDS", "deal"));
  // Inherit the customer link from the lead this deal came from (already resolved there); a
  // directly-created deal (no leadId — "New Deal" modal's free-text/datalist customer field)
  // resolves/creates its own Customer link the same way a lead does.
  let customerId = null;
  const owner = b.owner || req.user.id;
  if (b.leadId) {
    const [lead] = await query("SELECT customer_id FROM leads WHERE id = ?", [b.leadId]);
    customerId = lead?.customer_id || null;
  }
  if (!customerId) {
    ({ customerId } = await findOrCreateCustomer(query, { name: b.customer, ownerId: owner }));
  }
  // value always starts at 0 — it's no longer a manually-typed estimate. It's kept in sync with
  // the deal's latest quotation's real Professional Fee total by quotations.routes.js instead
  // (0 here since a brand-new deal has no quotation yet).
  await query(
    `INSERT INTO deals (id, lead_id, customer, service, value, owner, stage, expected_close, customer_id) VALUES (?,?,?,?,0,?,?,?,?)`,
    [id, b.leadId || null, b.customer, b.service || null, owner, b.stage || "Open", b.expectedClose || null, customerId]
  );
  res.status(201).json({ id });
});

// A sales_exec may only modify their own deal, even if they somehow know another deal's id —
// GET already keeps them from seeing it, but nothing previously stopped a direct API call.
async function assertOwnsOrAdmin(req, res) {
  if (!isSalesExecOnly(req.user.roles)) return true;
  const [deal] = await query("SELECT owner FROM deals WHERE id = ?", [req.params.id]);
  if (deal && deal.owner && deal.owner !== req.user.id) {
    res.status(403).json({ error: "You can only modify your own deals" });
    return false;
  }
  return true;
}

router.patch("/:id", async (req, res) => {
  if (!(await assertOwnsOrAdmin(req, res))) return;
  const b = req.body;
  const fields = [];
  const params = [];
  // "value" is deliberately not editable here — it's always synced from the deal's latest
  // quotation (see quotations.routes.js), never a manually-typed figure.
  for (const [col, key] of [["customer", "customer"], ["service", "service"], ["stage", "stage"], ["expected_close", "expectedClose"]]) {
    if (b[key] !== undefined) { fields.push(`${col} = ?`); params.push(b[key]); }
  }
  // Reassigning ownership is an admin-only correction — a sales_exec editing their own deal must
  // never be able to hand it to someone else through this same endpoint.
  if (b.owner !== undefined && isAdminLike(req.user.roles)) { fields.push("owner = ?"); params.push(b.owner); }
  // Editing the customer name means it may now belong to a different (or new) Customer profile.
  if (b.customer !== undefined) {
    const { customerId } = await findOrCreateCustomer(query, { name: b.customer, ownerId: req.user.id });
    fields.push("customer_id = ?"); params.push(customerId);
  }
  // Stamps the moment a deal actually closes — the Dashboard's "today's closed deals" section
  // reads this, not created_at, since a deal is often created well before it's won.
  if (b.stage === "Won") fields.push("won_at = NOW()");
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE deals SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  if (!(await assertOwnsOrAdmin(req, res))) return;
  await query("DELETE FROM deals WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
