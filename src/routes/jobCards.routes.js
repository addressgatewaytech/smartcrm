const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, daysFromNow } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const isOpsMember = req.user.roles.includes("ops_member") && !isAdminLike(req.user.roles) && !req.user.roles.includes("ops_manager");
  // Traces each job card back through its sales order -> quotation -> deal -> lead to find who
  // originally brought in the business — distinct from job_cards.created_by, which is whoever
  // triggered onboarding/direct-creation, not necessarily the original lead owner. Job cards
  // created directly (no sales_order_id) have no lead lineage, so this comes back NULL for them.
  const rows = await query(`
    SELECT jc.*, u.name AS lead_creator_name
    FROM job_cards jc
    LEFT JOIN sales_orders so ON so.id = jc.sales_order_id
    LEFT JOIN quotations q ON q.id = so.quotation_id
    LEFT JOIN deals d ON d.id = q.deal_id
    LEFT JOIN leads l ON l.id = d.lead_id
    LEFT JOIN users u ON u.id = l.owner
    ORDER BY jc.created_at DESC
  `);
  const assignees = await query("SELECT * FROM job_card_assignees");
  const logs = await query("SELECT * FROM job_card_status_log ORDER BY at ASC");
  let out = rows.map((r) => ({
    ...r,
    checklist: r.checklist || [],
    assignees: assignees.filter((a) => a.job_card_id === r.id).map((a) => a.user_id),
    statusLog: logs.filter((l) => l.job_card_id === r.id),
  }));
  if (isOpsMember) out = out.filter((j) => j.assignees.includes(req.user.id));
  res.json(out);
});

// Direct creation — bypasses the quotation pipeline. Starts at "Pending Approval", requires
// Accounts (or Admin-tier) sign-off before Operations can assign anyone. Restricted to the
// same roles the prototype allows: sales/ops leadership + admin tier.
router.post("/direct", requireRole(["sales_manager", "sales_exec", "ops_manager", "admin_like"]), async (req, res) => {
  const { customer, service, description } = req.body;
  const id = nextId("JC");
  const [tpl] = await query("SELECT steps FROM checklist_templates WHERE service = ?", [service]);
  const steps = tpl ? tpl.steps : [];
  const checklist = steps.map((label, i) => ({ id: `CI-${i}`, label, done: false }));

  await query(
    `INSERT INTO job_cards (id, customer, service, description, status, priority, target_date, checklist, created_by) VALUES (?,?,?,?, 'Pending Approval', 'Normal', ?, ?, ?)`,
    [id, customer, service, description || null, daysFromNow(7), JSON.stringify(checklist), req.user.id]
  );
  await query("INSERT INTO job_card_status_log (job_card_id, status, by_user) VALUES (?, 'Pending Approval', ?)", [id, req.user.id]);
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'approval', ?, ?, ?)",
    [nextId("NT"), "Job card awaiting approval", `${id} for ${customer} (${service}) needs Accounts approval before Operations can assign it.`, JSON.stringify(["super_admin", "admin", "admin_exec", "accounts"])]);

  res.status(201).json({ id });
});

router.post("/:id/approve", requireRole(["accounts", "admin_like"]), async (req, res) => {
  await query("UPDATE job_cards SET status = 'Created' WHERE id = ? AND status = 'Pending Approval'", [req.params.id]);
  await query("INSERT INTO job_card_status_log (job_card_id, status, by_user, note) VALUES (?, 'Created', ?, 'Approved by Accounts')", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

router.post("/:id/reject", requireRole(["accounts", "admin_like"]), async (req, res) => {
  const { reason } = req.body;
  await query("UPDATE job_cards SET status = 'Cancelled', cancel_reason = ? WHERE id = ? AND status = 'Pending Approval'", [reason, req.params.id]);
  await query("INSERT INTO job_card_status_log (job_card_id, status, by_user, note) VALUES (?, 'Cancelled', ?, ?)", [req.params.id, req.user.id, reason]);
  res.json({ ok: true });
});

router.post("/:id/assign", requireRole(["ops_manager", "admin_like"]), async (req, res) => {
  const { assignees } = req.body; // array of userIds
  await query("DELETE FROM job_card_assignees WHERE job_card_id = ?", [req.params.id]);
  for (const uid of assignees || []) await query("INSERT INTO job_card_assignees (job_card_id, user_id) VALUES (?,?)", [req.params.id, uid]);
  await query("UPDATE job_cards SET status = IF(status = 'Created', 'Assigned', status) WHERE id = ?", [req.params.id]);
  await query("INSERT INTO job_card_status_log (job_card_id, status, by_user) VALUES (?, 'Assigned', ?)", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

router.post("/:id/status", async (req, res) => {
  const { status, reason } = req.body; // "On Hold" | "In Progress" | "Completed" | "Cancelled"
  if (status === "Completed") {
    const [job] = await query("SELECT checklist FROM job_cards WHERE id = ?", [req.params.id]);
    const checklist = job.checklist || [];
    if (checklist.length > 0 && checklist.some((c) => !c.done)) return res.status(400).json({ error: "All checklist items must be completed first" });
  }
  await query("UPDATE job_cards SET status = ?, cancel_reason = ? WHERE id = ?", [status, status === "Cancelled" ? reason : null, req.params.id]);
  await query("INSERT INTO job_card_status_log (job_card_id, status, by_user, note) VALUES (?,?,?,?)", [req.params.id, status, req.user.id, reason || null]);
  res.json({ ok: true });
});

router.patch("/:id", async (req, res) => {
  const { priority, targetDate } = req.body;
  await query("UPDATE job_cards SET priority = COALESCE(?, priority), target_date = COALESCE(?, target_date) WHERE id = ?", [priority || null, targetDate || null, req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/checklist", async (req, res) => {
  const [job] = await query("SELECT checklist FROM job_cards WHERE id = ?", [req.params.id]);
  const checklist = job.checklist || [];
  if (req.body.itemId) {
    // toggle or remove
    const updated = req.body.remove
      ? checklist.filter((c) => c.id !== req.body.itemId)
      : checklist.map((c) => (c.id === req.body.itemId ? { ...c, done: !c.done } : c));
    await query("UPDATE job_cards SET checklist = ? WHERE id = ?", [JSON.stringify(updated), req.params.id]);
  } else if (req.body.label) {
    checklist.push({ id: `CI-${Date.now()}`, label: req.body.label, done: false });
    await query("UPDATE job_cards SET checklist = ? WHERE id = ?", [JSON.stringify(checklist), req.params.id]);
  }
  res.json({ ok: true });
});

// Admin-only hard delete — for cleaning up test/mistaken job cards. Child rows (assignees,
// status log) cascade via FK ON DELETE CASCADE.
router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM job_cards WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
