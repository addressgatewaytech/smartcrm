const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");
const { nextId, daysFromNow } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

// --- Plan catalog (admin-extensible: Growth Partner Program, Office Space Assistance, ...) --
router.get("/plans", async (req, res) => {
  const plans = await query("SELECT * FROM subscription_plans");
  const tiers = await query("SELECT * FROM subscription_tiers");
  res.json(plans.map((p) => ({
    ...p,
    terms: p.terms || [],
    tiers: tiers.filter((t) => t.plan_name === p.name).map((t) => ({ ...t, extra_features: t.extra_features || [] })),
  })));
});

router.post("/plans", requireRole(["admin_like", "data_manager"]), async (req, res) => {
  const { name, description } = req.body;
  await query("INSERT INTO subscription_plans (name, description, terms) VALUES (?,?,'[]')", [name, description || ""]);
  await query("INSERT INTO subscription_tiers (plan_name, tier_name, annual_fee) VALUES (?, 'Standard', 0)", [name]);
  res.status(201).json({ ok: true });
});

router.patch("/plans/:name", requireRole(["admin_like"]), async (req, res) => {
  const b = req.body;
  const fields = [];
  const params = [];
  if (b.description !== undefined) { fields.push("description = ?"); params.push(b.description); }
  if (b.terms !== undefined) { fields.push("terms = ?"); params.push(JSON.stringify(b.terms)); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.name);
  await query(`UPDATE subscription_plans SET ${fields.join(", ")} WHERE name = ?`, params);
  res.json({ ok: true });
});

router.delete("/plans/:name", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM subscription_plans WHERE name = ?", [req.params.name]);
  res.json({ ok: true });
});

router.put("/plans/:name/tiers/:tierName", requireRole(["admin_like"]), async (req, res) => {
  const b = req.body;
  await query(
    `UPDATE subscription_tiers SET annual_fee=?, company_size=?, transactions_included=?, hukoomi_services=?,
       training_sessions=?, training_rate=?, training_team_members=?, legal_advising=?, dedicated_pro=?, translation_pages=?, extra_features=?
     WHERE plan_name = ? AND tier_name = ?`,
    [b.annualFee || 0, b.companySize || null, b.transactionsIncluded ?? null, b.hukoomiServices || null, b.trainingSessions ?? null,
      b.trainingRate ?? null, b.trainingTeamMembers ?? null, b.legalAdvising ?? null, b.dedicatedPro ? 1 : 0, b.translationPages ?? null,
      JSON.stringify(b.extraFeatures || []), req.params.name, req.params.tierName]
  );
  res.json({ ok: true });
});

router.post("/plans/:name/tiers", requireRole(["admin_like"]), async (req, res) => {
  await query("INSERT INTO subscription_tiers (plan_name, tier_name, annual_fee) VALUES (?,?,0)", [req.params.name, req.body.tierName]);
  res.status(201).json({ ok: true });
});

router.delete("/plans/:name/tiers/:tierName", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM subscription_tiers WHERE plan_name = ? AND tier_name = ?", [req.params.name, req.params.tierName]);
  res.json({ ok: true });
});

// --- Customer subscriptions -----------------------------------------------------------------
// Helper: "transactions used" is ALWAYS computed live from job_cards — never stored.
// A job card counts if created on/after the subscription's current startDate, and its status
// is neither Cancelled nor Pending Approval (unapproved/cancelled work was never really done).
async function transactionsUsed(customerName, startDate) {
  const [{ cnt }] = await query(
    `SELECT COUNT(*) AS cnt FROM job_cards WHERE customer = ? AND created_at >= ? AND status NOT IN ('Cancelled','Pending Approval')`,
    [customerName, startDate]
  );
  return cnt;
}

router.get("/", async (req, res) => {
  const rows = await query("SELECT * FROM customer_subscriptions ORDER BY created_at DESC");
  const withUsage = await Promise.all(rows.map(async (s) => ({ ...s, transactionsUsed: await transactionsUsed(s.customer, s.start_date) })));
  res.json(withUsage);
});

router.post("/", async (req, res) => {
  const b = req.body;
  const id = nextId("SUB");
  const [tier] = await query("SELECT annual_fee FROM subscription_tiers WHERE plan_name = ? AND tier_name = ?", [b.plan, b.tier]);
  const startDate = b.startDate || daysFromNow(0);
  const expiryDate = new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear() + 1)).toISOString().slice(0, 10);

  await query(
    `INSERT INTO customer_subscriptions (id, customer_id, customer, plan_name, tier_name, annual_fee, start_date, expiry_date, status) VALUES (?,?,?,?,?,?,?,?, 'Active')`,
    [id, b.customerId, b.customer, b.plan, b.tier, tier.annual_fee, startDate, expiryDate]
  );

  if (b.alsoInvoice) {
    await query(`INSERT INTO invoices (id, customer, fee_type, amount, status, due_date, subscription_id) VALUES (?,?, 'Professional Fee', ?, 'Sent', ?, ?)`,
      [nextId("INV"), b.customer, tier.annual_fee, daysFromNow(14), id]);
  }
  res.status(201).json({ id });
});

router.post("/:id/renew", async (req, res) => {
  const startDate = req.body.startDate || daysFromNow(0);
  const expiryDate = new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear() + 1)).toISOString().slice(0, 10);
  await query(
    `UPDATE customer_subscriptions SET start_date=?, expiry_date=?, status='Active', training_sessions_used=0, legal_advising_used=0, translation_pages_used=0 WHERE id=?`,
    [startDate, expiryDate, req.params.id]
  );
  if (req.body.alsoInvoice) {
    const [sub] = await query("SELECT customer, annual_fee FROM customer_subscriptions WHERE id = ?", [req.params.id]);
    await query(`INSERT INTO invoices (id, customer, fee_type, amount, status, due_date, subscription_id) VALUES (?,?, 'Professional Fee', ?, 'Sent', ?, ?)`,
      [nextId("INV"), sub.customer, sub.annual_fee, daysFromNow(14), req.params.id]);
  }
  res.json({ ok: true });
});

router.patch("/:id", async (req, res) => {
  const b = req.body;
  const fields = [];
  const params = [];
  if (b.plan !== undefined) { fields.push("plan_name = ?"); params.push(b.plan); }
  if (b.tier !== undefined) { fields.push("tier_name = ?"); params.push(b.tier); }
  if (b.annualFee !== undefined) { fields.push("annual_fee = ?"); params.push(b.annualFee); }
  if (b.startDate !== undefined) { fields.push("start_date = ?"); params.push(b.startDate); }
  if (b.expiryDate !== undefined) { fields.push("expiry_date = ?"); params.push(b.expiryDate); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE customer_subscriptions SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await query("DELETE FROM customer_subscriptions WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/cancel", async (req, res) => {
  await query("UPDATE customer_subscriptions SET status = 'Cancelled' WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/log-usage", async (req, res) => {
  const { field, amount } = req.body; // field: training_sessions_used | legal_advising_used | translation_pages_used
  const allowed = ["training_sessions_used", "legal_advising_used", "translation_pages_used"];
  if (!allowed.includes(field)) return res.status(400).json({ error: "Invalid field" });
  await query(`UPDATE customer_subscriptions SET ${field} = GREATEST(0, ${field} + ?) WHERE id = ?`, [amount, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
