const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId } = require("../utils/helpers");
const { generateInvoicePdf } = require("../utils/invoicePdf");

const router = express.Router();
router.use(requireAuth);

// Same visibility rule as /sales-orders: traced via sales_order_id -> quotation_id -> owner.
// Subscription-billed invoices have no sales_order_id at all (no quotation to trace ownership
// through), so — same leniency as everywhere else in this pass — they stay visible to everyone
// rather than becoming invisible to whoever should be collecting on them.
router.get("/", async (req, res) => {
  const isSalesExecOnly = req.user.roles.includes("sales_exec") && !isAdminLike(req.user.roles) && !req.user.roles.includes("sales_manager");
  const invoices = isSalesExecOnly
    ? await query(
        `SELECT inv.* FROM invoices inv
         LEFT JOIN sales_orders so ON so.id = inv.sales_order_id
         LEFT JOIN quotations q ON q.id = so.quotation_id
         WHERE inv.sales_order_id IS NULL OR q.owner = ? OR q.owner IS NULL
         ORDER BY inv.created_at DESC`,
        [req.user.id]
      )
    : await query("SELECT * FROM invoices ORDER BY created_at DESC");
  const payments = await query("SELECT * FROM invoice_payments ORDER BY paid_at DESC");
  res.json(invoices.map((inv) => ({
    ...inv,
    email_cc: inv.email_cc || [],
    payments: payments.filter((p) => p.invoice_id === inv.id),
  })));
});

// Real server-side A4 PDF (PDFKit), same pattern as quotations' /:id/pdf. An invoice only stores a
// rolled-up amount, so its line items are traced back through the sales order to the quotation it
// was converted from (subscription-billed invoices have neither — nothing to trace, so no items).
router.get("/:id/pdf", async (req, res) => {
  const [row] = await query("SELECT * FROM invoices WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const payments = await query("SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_at", [row.id]);
  const [items] = row.sales_order_id
    ? await query(
        `SELECT q.items FROM sales_orders so LEFT JOIN quotations q ON q.id = so.quotation_id WHERE so.id = ?`,
        [row.sales_order_id]
      )
    : [];
  // Same rule as sales orders' PDF: only Accounts/Admin get the clean original, everyone else gets
  // it watermarked "INTERNAL USE ONLY".
  const internalOnly = !(isAdminLike(req.user.roles) || req.user.roles.includes("accounts"));
  generateInvoicePdf({ ...row, items: items?.items || [], payments, internalOnly }, res);
});

router.post("/:id/payments", requireRole(["accounts", "admin_like"]), async (req, res) => {
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
