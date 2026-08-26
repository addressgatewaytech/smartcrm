const express = require("express");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, nextSequentialId, daysFromNow } = require("../utils/helpers");
const { generateSalesOrderPdf } = require("../utils/salesOrderPdf");

const router = express.Router();
router.use(requireAuth);

// Admin-tier, Sales/Ops Manager, and Accounts see every sales order — Accounts processes every
// client's sales order as part of the job and doesn't "own" a quotation the way a sales rep does,
// so scoping them like everyone else would leave them seeing almost nothing.
// Everyone else only sees sales orders created from their own quotations (joined via quotation_id
// -> quotations.owner), or ones tied to a job card they're assigned to — that second path is what
// lets an Ops/PRO worker see the sales order for a job they're actually doing, since they never
// "own" the originating quotation either.
router.get("/", async (req, res) => {
  const canSeeAll = isAdminLike(req.user.roles) || req.user.roles.includes("viewer") || req.user.roles.includes("sales_manager") || req.user.roles.includes("ops_manager") || req.user.roles.includes("accounts");
  const rows = canSeeAll
    ? await query("SELECT * FROM sales_orders ORDER BY created_at DESC")
    : await query(
        `SELECT DISTINCT so.* FROM sales_orders so
         LEFT JOIN quotations q ON q.id = so.quotation_id
         LEFT JOIN job_cards jc ON jc.sales_order_id = so.id
         LEFT JOIN job_card_assignees jca ON jca.job_card_id = jc.id
         WHERE q.owner = ? OR q.owner IS NULL OR jca.user_id = ?
         ORDER BY so.created_at DESC`,
        [req.user.id, req.user.id]
      );
  res.json(rows);
});

// Real server-side A4 PDF (PDFKit), same pattern as quotations' /:id/pdf. The sales order itself
// only stores a rolled-up amount, so the actual line items are pulled from the quotation it was
// converted from — the client expects to see the same item breakdown they already saw on the quote.
router.get("/:id/pdf", async (req, res) => {
  const [row] = await query("SELECT * FROM sales_orders WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const [invoice] = await query("SELECT id FROM invoices WHERE sales_order_id = ?", [row.id]);
  const [quotation] = row.quotation_id ? await query("SELECT items FROM quotations WHERE id = ?", [row.quotation_id]) : [];
  // Only Accounts/Admin get the clean, downloadable original — every other role (sales, ops, ...)
  // gets the same document watermarked "INTERNAL USE ONLY", since this is for their own reference
  // only, not something meant to leave the building as-is.
  const internalOnly = !(isAdminLike(req.user.roles) || req.user.roles.includes("accounts"));
  generateSalesOrderPdf({ ...row, items: quotation?.items || [], onboarded: !!invoice, internalOnly }, res);
});

// Onboard client: generates the Invoice and the first Job Card (normal path — starts at "Created",
// unlike a directly-created job card which starts at "Pending Approval"; see jobCards.routes.js).
// Restricted to Accounts/Admin — sales orders and invoices are financial documents only Accounts
// should be creating; a sales user's role in this flow ends at marking the quotation Client Accepted.
router.post("/:id/onboard", requireRole(["accounts", "admin_like"]), async (req, res) => {
  const result = await withTransaction(async (conn) => {
    const [[so]] = await conn.execute("SELECT * FROM sales_orders WHERE id = ?", [req.params.id]);
    if (!so) throw new Error("Sales order not found");

    const invoiceId = await nextSequentialId(conn, "AGBSIN", "invoice");
    await conn.execute(
      `INSERT INTO invoices (id, sales_order_id, customer, service, fee_type, amount, professional_fee_amount, status, due_date, customer_id) VALUES (?,?,?,?,?,?,?, 'Sent', ?, ?)`,
      [invoiceId, so.id, so.customer, so.service, so.fee_type, so.amount, so.professional_fee_amount, daysFromNow(14), so.customer_id]
    );

    const jobId = await nextSequentialId(conn, "AGBSJC", "job_card");
    const [[tpl]] = await conn.execute("SELECT steps FROM checklist_templates WHERE service = ?", [so.service]);
    const steps = tpl ? tpl.steps : [];
    const checklist = steps.map((label, i) => ({ id: `CI-${i}`, label, done: false }));
    await conn.execute(
      `INSERT INTO job_cards (id, sales_order_id, customer, service, status, priority, target_date, checklist, created_by, customer_id, package_tier) VALUES (?,?,?,?, 'Created', 'Normal', ?, ?, ?, ?, ?)`,
      [jobId, so.id, so.customer, so.service, daysFromNow(10), JSON.stringify(checklist), req.user.id, so.customer_id, so.package_tier || null]
    );
    await conn.execute("INSERT INTO job_card_status_log (job_card_id, status, by_user) VALUES (?, 'Created', ?)", [jobId, req.user.id]);

    return { invoiceId, jobId };
  });
  res.status(201).json(result);
});

// Admin-only cleanup path for mistaken/test sales orders. Invoices and job cards referencing this
// order have ON DELETE SET NULL foreign keys (see schema.sql), so they're kept, just unlinked —
// this only removes the sales order itself, not everything downstream of it.
router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM sales_orders WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
