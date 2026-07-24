const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");
const { nextId } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const invoices = await query("SELECT * FROM invoices ORDER BY created_at DESC");
  const payments = await query("SELECT * FROM invoice_payments ORDER BY paid_at DESC");
  res.json(invoices.map((inv) => ({
    ...inv,
    email_cc: inv.email_cc || [],
    payments: payments.filter((p) => p.invoice_id === inv.id),
  })));
});

router.post("/:id/payments", async (req, res) => {
  const { amount, mode } = req.body;
  await query("INSERT INTO invoice_payments (id, invoice_id, amount, mode, recorded_by) VALUES (?,?,?,?,?)", [nextId("PMT"), req.params.id, amount, mode, req.user.id]);

  const [invoice] = await query("SELECT amount FROM invoices WHERE id = ?", [req.params.id]);
  const [{ total_paid }] = await query("SELECT COALESCE(SUM(amount),0) AS total_paid FROM invoice_payments WHERE invoice_id = ?", [req.params.id]);
  const status = Number(total_paid) >= Number(invoice.amount) ? "Paid" : Number(total_paid) > 0 ? "Partially Paid" : "Sent";
  await query("UPDATE invoices SET status = ? WHERE id = ?", [status, req.params.id]);
  res.json({ ok: true, status });
});

router.delete("/:id/payments/:paymentId", async (req, res) => {
  await query("DELETE FROM invoice_payments WHERE id = ? AND invoice_id = ?", [req.params.paymentId, req.params.id]);
  const [invoice] = await query("SELECT amount FROM invoices WHERE id = ?", [req.params.id]);
  const [{ total_paid }] = await query("SELECT COALESCE(SUM(amount),0) AS total_paid FROM invoice_payments WHERE invoice_id = ?", [req.params.id]);
  const status = Number(total_paid) >= Number(invoice.amount) ? "Paid" : Number(total_paid) > 0 ? "Partially Paid" : "Sent";
  await query("UPDATE invoices SET status = ? WHERE id = ?", [status, req.params.id]);
  res.json({ ok: true, status });
});

router.post("/:id/emailed", async (req, res) => {
  const { cc } = req.body;
  await query("UPDATE invoices SET emailed_to_client = 1, emailed_at = NOW(), email_cc = ? WHERE id = ?", [JSON.stringify(cc || []), req.params.id]);
  res.json({ ok: true });
});

// Admin-only cleanup path for mistaken/test invoices — payments cascade automatically (see schema.sql).
router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM invoices WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
