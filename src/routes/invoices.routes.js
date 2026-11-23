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
  // Needed for Sales Person resolution below regardless of scoping branch, and reused by the
  // non-canSeeAll branch's own visibility trace (sales_order_id -> quotation_id -> owner, falling
  // back to the invoiced customer's most recent deal owner for subscription-billed invoices).
  const salesOrders = await query("SELECT id, quotation_id FROM sales_orders");
  const quotations = await query("SELECT id, owner FROM quotations");
  const deals = await query("SELECT customer, owner FROM deals ORDER BY created_at DESC");
  const users = await query("SELECT id, name FROM users");
  const dealOwnerFor = (customerName) => deals.find((d) => d.customer === customerName)?.owner || null;
  const ownerForInvoice = (inv) => {
    const so = salesOrders.find((s) => s.id === inv.sales_order_id);
    if (so) return quotations.find((q) => q.id === so.quotation_id)?.owner || null;
    return dealOwnerFor(inv.customer);
  };

  let invoices;
  if (canSeeAll) {
    invoices = await query("SELECT * FROM invoices ORDER BY created_at DESC");
  } else {
    const rows = await query("SELECT * FROM invoices ORDER BY created_at DESC");
    const assignedSalesOrderIds = new Set(
      (await query(
        `SELECT DISTINCT jc.sales_order_id FROM job_cards jc
         JOIN job_card_assignees jca ON jca.job_card_id = jc.id
         WHERE jca.user_id = ? AND jc.sales_order_id IS NOT NULL`,
        [req.user.id]
      )).map((r) => r.sales_order_id)
    );
    invoices = rows.filter((r) => ownerForInvoice(r) === req.user.id || assignedSalesOrderIds.has(r.sales_order_id));
  }
  const payments = await query("SELECT * FROM invoice_payments ORDER BY paid_at DESC");
  res.json(invoices.map((inv) => ({
    ...inv,
    email_cc: inv.email_cc || [],
    payments: payments.filter((p) => p.invoice_id === inv.id),
    salesPerson: users.find((u) => u.id === ownerForInvoice(inv))?.name || null,
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
  // An invoice that bills only the Professional Fee (amount == its professional fee amount, i.e.
  // not mixed) shouldn't list the quotation's Government Fee lines under a total that doesn't
  // include them. Same line classification as quotationPdf.js; falls back to every line if
  // filtering would leave nothing to show.
  const amount = Number(row.amount || 0);
  const profFee = Number(row.professional_fee_amount ?? amount);
  const isMixed = Math.max(0, amount - profFee) > 0.005 && profFee > 0.005;
  const isGovFeeLine = (it) => {
    if (it.feeType) return it.feeType === "Government Fee";
    const cat = (it.category || "").toLowerCase();
    if (cat.includes("government")) return true;
    if (cat.includes("professional")) return false;
    return row.fee_type === "Government Fee";
  };
  let invoiceItems = items?.items || [];
  if (!isMixed && row.fee_type === "Professional Fee") {
    const proOnly = invoiceItems.filter((it) => !isGovFeeLine(it));
    if (proOnly.length) invoiceItems = proOnly;
  }
  generateInvoicePdf({ ...row, items: invoiceItems, payments, internalOnly }, res);
});

// A payment on a Mixed (Professional + Government Fee) invoice can be split between the two —
// pfAmount/gfAmount from the client, required to add up to `amount`. A pure invoice of either
// kind never asks the client for a split; it's resolved here instead, so old frontend builds (or
// any other caller) that never sends pfAmount/gfAmount still behave exactly as before.
function resolveFeeSplit({ amount, professionalFeeAmount, invoiceAmount, pfAmount, gfAmount }) {
  const profFee = Number(professionalFeeAmount || 0);
  const govFee = Math.max(0, Number(invoiceAmount) - profFee);
  const isMixed = profFee > 0.005 && govFee > 0.005;
  if (!isMixed) return profFee > 0 ? { pf: Number(amount), gf: 0 } : { pf: 0, gf: Number(amount) };
  const pf = Number(pfAmount) || 0;
  const gf = Number(gfAmount) || 0;
  if (Math.abs(pf + gf - Number(amount)) > 0.01) return null;
  return { pf, gf };
}

// A refund (money going back to the client) is stored as this exact same kind of row, just with a
// negative amount — every balance/collected figure across the app already sums these payment rows,
// so a refund nets itself out everywhere automatically with no separate accounting path. Reusing
// correction_note to hold the required reason, since a brand-new refund row has no updated_at yet
// to distinguish it from an actual later correction (see PaymentHistoryModal's own reading of this).
router.post("/:id/payments", requireRole(["accounts", "admin_like"]), async (req, res) => {
  const { amount, mode, paidAt, pfAmount, gfAmount, nextPaymentAmount, nextPaymentDate, isRefund, reason } = req.body;
  if (isRefund && !reason?.trim()) return res.status(400).json({ error: "A reason is required for a refund" });
  const [invoice] = await query("SELECT amount, professional_fee_amount FROM invoices WHERE id = ?", [req.params.id]);
  if (!invoice) return res.status(404).json({ error: "Not found" });
  const sign = isRefund ? -1 : 1;
  const signedAmount = sign * Math.abs(Number(amount) || 0);
  const signedPf = pfAmount !== undefined ? sign * Math.abs(Number(pfAmount) || 0) : undefined;
  const signedGf = gfAmount !== undefined ? sign * Math.abs(Number(gfAmount) || 0) : undefined;
  const split = resolveFeeSplit({ amount: signedAmount, professionalFeeAmount: invoice.professional_fee_amount, invoiceAmount: invoice.amount, pfAmount: signedPf, gfAmount: signedGf });
  if (!split) return res.status(400).json({ error: `Professional Fee + Government Fee portions must add up to the ${isRefund ? "refund" : "payment"} amount` });
  // paidAt lets Accounts record when a payment was actually received (e.g. logging it a day or
  // two late, or reconciling an older bank statement) instead of always stamping "now" — falls
  // back to the current moment when not given, same as before this existed.
  await query(
    "INSERT INTO invoice_payments (id, invoice_id, amount, pf_amount, gf_amount, mode, recorded_by, paid_at, correction_note) VALUES (?,?,?,?,?,?,?,COALESCE(?, NOW()),?)",
    [nextId("PMT"), req.params.id, signedAmount, split.pf, split.gf, mode, req.user.id, paidAt || null, isRefund ? reason.trim() : null]
  );

  // The "next payment due" reminder is set from here (Record Payment) alongside recording the
  // payment that led to it, or independently via PATCH /:id/next-payment — both just overwrite
  // whatever was there before. Only touched when actually sent, so recording a payment without
  // naming a next one leaves an existing reminder alone.
  if (nextPaymentAmount !== undefined || nextPaymentDate !== undefined) {
    await query("UPDATE invoices SET next_payment_amount = ?, next_payment_date = ? WHERE id = ?",
      [nextPaymentAmount || null, nextPaymentDate || null, req.params.id]);
  }

  const [{ total_paid }] = await query("SELECT COALESCE(SUM(amount),0) AS total_paid FROM invoice_payments WHERE invoice_id = ?", [req.params.id]);
  const status = Number(total_paid) >= Number(invoice.amount) ? "Paid" : Number(total_paid) > 0 ? "Partially Paid" : "Sent";
  await query("UPDATE invoices SET status = ? WHERE id = ?", [status, req.params.id]);
  res.json({ ok: true, status });
});

// Correcting a payment already recorded (wrong amount/mode/date typed in) — a comment explaining
// why is required so there's always a reason on record for a payment changing after the fact.
router.patch("/:id/payments/:paymentId", requireRole(["accounts", "admin_like"]), async (req, res) => {
  const { amount, mode, paidAt, note, pfAmount, gfAmount } = req.body;
  if (!note || !note.trim()) return res.status(400).json({ error: "A comment explaining the correction is required" });
  const [invoice] = await query("SELECT amount, professional_fee_amount FROM invoices WHERE id = ?", [req.params.id]);
  if (!invoice) return res.status(404).json({ error: "Not found" });
  const split = resolveFeeSplit({ amount, professionalFeeAmount: invoice.professional_fee_amount, invoiceAmount: invoice.amount, pfAmount, gfAmount });
  if (!split) return res.status(400).json({ error: "Professional Fee + Government Fee portions must add up to the payment amount" });
  await query(
    "UPDATE invoice_payments SET amount = ?, pf_amount = ?, gf_amount = ?, mode = ?, paid_at = COALESCE(?, paid_at), correction_note = ?, updated_by = ?, updated_at = NOW() WHERE id = ? AND invoice_id = ?",
    [amount, split.pf, split.gf, mode, paidAt || null, note.trim(), req.user.id, req.params.paymentId, req.params.id]
  );
  const [{ total_paid }] = await query("SELECT COALESCE(SUM(amount),0) AS total_paid FROM invoice_payments WHERE invoice_id = ?", [req.params.id]);
  const status = Number(total_paid) >= Number(invoice.amount) ? "Paid" : Number(total_paid) > 0 ? "Partially Paid" : "Sent";
  await query("UPDATE invoices SET status = ? WHERE id = ?", [status, req.params.id]);
  res.json({ ok: true, status });
});

// Standalone edit of the "next payment due" reminder — e.g. after a call with the client agreeing
// a new date, with no new payment to record yet. Record Payment above can also set this in the
// same request when there is one.
router.patch("/:id/next-payment", requireRole(["accounts", "admin_like"]), async (req, res) => {
  const { nextPaymentAmount, nextPaymentDate } = req.body;
  await query("UPDATE invoices SET next_payment_amount = ?, next_payment_date = ? WHERE id = ?", [nextPaymentAmount || null, nextPaymentDate || null, req.params.id]);
  res.json({ ok: true });
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

// Backdating — Accounts/Admin correcting the recorded date to match when the invoice actually
// happened (e.g. entering an older paper record, or fixing a data-entry mistake), same reasoning
// as this invoice's own payments' paidAt override.
router.patch("/:id", requireRole(["accounts", "admin_like"]), async (req, res) => {
  const { createdAt } = req.body;
  if (!createdAt) return res.status(400).json({ error: "createdAt is required" });
  await query("UPDATE invoices SET created_at = ? WHERE id = ?", [createdAt, req.params.id]);
  res.json({ ok: true });
});

// Admin-only cleanup path for mistaken/test invoices — payments cascade automatically (see schema.sql).
router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM invoices WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
