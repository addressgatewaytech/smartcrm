const express = require("express");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, daysFromNow } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

// Same visibility rule as /leads and /deals: a sales_exec only sees sales orders created from
// their own quotations (joined via quotation_id -> quotations.owner); managers/admins see all.
router.get("/", async (req, res) => {
  const isSalesExecOnly = req.user.roles.includes("sales_exec") && !isAdminLike(req.user.roles) && !req.user.roles.includes("sales_manager");
  const rows = isSalesExecOnly
    ? await query(
        `SELECT so.* FROM sales_orders so
         LEFT JOIN quotations q ON q.id = so.quotation_id
         WHERE q.owner = ? OR q.owner IS NULL
         ORDER BY so.created_at DESC`,
        [req.user.id]
      )
    : await query("SELECT * FROM sales_orders ORDER BY created_at DESC");
  res.json(rows);
});

// Onboard client: generates the Invoice and the first Job Card (normal path — starts at "Created",
// unlike a directly-created job card which starts at "Pending Approval"; see jobCards.routes.js).
router.post("/:id/onboard", async (req, res) => {
  const result = await withTransaction(async (conn) => {
    const [[so]] = await conn.execute("SELECT * FROM sales_orders WHERE id = ?", [req.params.id]);
    if (!so) throw new Error("Sales order not found");

    const invoiceId = nextId("INV");
    await conn.execute(
      `INSERT INTO invoices (id, sales_order_id, customer, fee_type, amount, professional_fee_amount, status, due_date) VALUES (?,?,?,?,?,?, 'Sent', ?)`,
      [invoiceId, so.id, so.customer, so.fee_type, so.amount, so.professional_fee_amount, daysFromNow(14)]
    );

    const jobId = nextId("JC");
    const [[tpl]] = await conn.execute("SELECT steps FROM checklist_templates WHERE service = ?", [so.service]);
    const steps = tpl ? tpl.steps : [];
    const checklist = steps.map((label, i) => ({ id: `CI-${i}`, label, done: false }));
    await conn.execute(
      `INSERT INTO job_cards (id, sales_order_id, customer, service, status, priority, target_date, checklist, created_by) VALUES (?,?,?,?, 'Created', 'Normal', ?, ?, ?)`,
      [jobId, so.id, so.customer, so.service, daysFromNow(10), JSON.stringify(checklist), req.user.id]
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
