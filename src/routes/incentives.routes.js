const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");
const { nextId } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

router.get("/rules", async (req, res) => {
  res.json(await query("SELECT * FROM incentive_rules"));
});

router.post("/rules", requireRole(["admin_like"]), async (req, res) => {
  const b = req.body;
  const id = nextId("IR");
  await query("INSERT INTO incentive_rules (id, role, period, metric, amount) VALUES (?,?,?,?,?)", [id, b.role, b.period, b.metric, b.amount]);
  res.status(201).json({ id });
});

router.patch("/rules/:id", requireRole(["admin_like"]), async (req, res) => {
  const b = req.body;
  await query("UPDATE incentive_rules SET role=?, period=?, metric=?, amount=? WHERE id=?", [b.role, b.period, b.metric, b.amount, req.params.id]);
  res.json({ ok: true });
});

router.delete("/rules/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM incentive_rules WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Computes incentive earned per employee, summed across all their roles. Government Fee is
// always excluded from qualifying activity — mirrors the business-volume exclusion rule.
router.get("/earned/:userId", async (req, res) => {
  const [user] = await query("SELECT roles FROM users WHERE id = ?", [req.params.userId]);
  if (!user) return res.status(404).json({ error: "Not found" });
  const roles = JSON.parse(user.roles);

  const [{ dealsWon }] = await query(
    `SELECT COUNT(*) AS dealsWon FROM deals d
     WHERE d.owner = ? AND d.stage = 'Won'
       AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.deal_id = d.id AND q.fee_type = 'Government Fee')`,
    [req.params.userId]
  );
  const [{ jobsDone }] = await query(
    `SELECT COUNT(*) AS jobsDone FROM job_cards j JOIN job_card_assignees a ON a.job_card_id = j.id WHERE a.user_id = ? AND j.status = 'Completed'`,
    [req.params.userId]
  );
  const [{ paymentsCollected }] = await query(
    `SELECT COUNT(*) AS paymentsCollected FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id
     WHERE p.recorded_by = ? AND i.fee_type != 'Government Fee'`,
    [req.params.userId]
  );

  const rules = await query("SELECT * FROM incentive_rules WHERE role IN (?)", [roles]);
  let total = 0;
  for (const rule of rules) {
    const count = rule.role === "sales_exec" || rule.role === "sales_manager" ? dealsWon : rule.role === "ops_member" ? jobsDone : rule.role === "accounts" ? paymentsCollected : 0;
    total += count * Number(rule.amount);
  }
  res.json({ userId: req.params.userId, total, dealsWon, jobsDone, paymentsCollected });
});

module.exports = router;
