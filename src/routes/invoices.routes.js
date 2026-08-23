const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId } = require("../utils/helpers");
const { generateInvoicePdf } = require("../utils/invoicePdf");

const router = express.Router();
router.use(requireAuth);

// Admin-tier, Sales/Ops Manager, Accounts, and Viewer see every invoice — Accounts processes
// every client's invoice as part of the job and doesn't "own" a quotation the way a sales rep
// does, so scoping them like everyone else would leave them seeing almost nothing.
// Everyone else is traced via sales_order_id -> quotation_id -> owner (same as /sales-orders), or
// via being assigned to the job card the sales order eventually produced — that lets an Ops/PRO
// worker see the invoice for a job they're actually doing, since they never "own" the originating
// quotation either. Subscription-billed invoices have no sales_order_id at all (no quotation to
// trace ownership through), so those fall back to the invoiced customer's most recent deal owner —
// same derivation used for Customers & Subscriptions — instead of the old blanket "show to
// everyone", which let every sales rep see every customer's subscription invoices regardless of
// whose customer it actually was.
router.get("/", async (req, res) => {
  const canSeeAll = isAdminLike(req.user.roles) || req.user.roles.includes("viewer") || req.user.roles.includes("sales_manager") || req.user.roles.includes("ops_manager") || req.user.roles.includes("accounts");
  let invoices;
  if (canSeeAll) {
    invoices = await query("SELECT * FROM invoices ORDER BY created_at DESC");
  } else {
    const rows = await query(
      `SELECT inv.*, q.owner AS quotation_owner FROM invoices inv
       LEFT JOIN sales_orders so ON so.id = inv.sales_order_id
       LEFT JOIN quotations q ON q.id = so.quotation_id
       ORDER BY inv.created_at DESC`
    );
    const assignedSalesOrderIds = new Set(
      (await query(
        `SELECT DISTINCT jc.sales_order_id FROM job_cards jc
         JOIN job_card_assignees jca ON jca.job_card_id = jc.id
         WHERE jca.user_id = ? AND jc.sales_order_id IS NOT NULL`,
        [req.user.id]
      )).map((r) => r.sales_order_id)
    );
    const deals = await query("SELECT customer, owner FROM deals ORDER BY created_at DESC");
    const dealOwnerFor = (customerName) => deals.find((d) => d.customer === customerName)?.owner || null;
    invoices = rows
      .filter((r) =>
        r.quotation_owner === req.user.id ||
        assignedSalesOrderIds.has(r.sales_order_id) ||
        (!r.sales_order_id && dealOwnerFor(r.customer) === req.user.id)
      )
      .map(({ quotation_owner, ...rest }) => rest);
  }
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
  const { amount, mode, paidAt } = req.body;
  // paidAt lets Accounts record when a payment was actually received (e.g. logging it a day or
  // two late, or reconciling an older bank statement) instead of always stamping "now" — falls
  // back to the current moment when not given, same as before this existed.
  await query("INSERT INTO invoice_payments (id, invoice_id, amount, mode, recorded_by, paid_at) VALUES (?,?,?,?,?,COALESCE(?, NOW()))", [nextId("PMT"), req.params.id, amount, mode, req.user.id, paidAt || null]);

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
