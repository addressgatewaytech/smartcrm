// Employee Task Management — internal only, no link to customers/quotations/invoices/financials.
// Mirrors the job_cards pattern (jobCards.routes.js): id/status/priority + a status_log audit
// trail, with the department-manager-tier roles able to create/assign/approve and the assignee
// driving their own task through Accepted -> In Progress -> Pending Approval.
const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, nextSequentialId } = require("../utils/helpers");
const { withTransaction } = require("../config/db");
const { requireRoleOrApprovalTypeDesignation, approverAudience } = require("../utils/designationApproval");
const { CONTENT_STAGES } = require("../utils/contentStages");
const { generateTaskPdf } = require("../utils/taskPdf");

const router = express.Router();
router.use(requireAuth);

// "Manager" for this module means any department-lead-tier role, not a single dedicated role —
// the same set that can create/assign job cards' equivalent leadership actions elsewhere.
const MANAGER_ROLES = ["admin_like", "sales_manager", "ops_manager", "hr"];

// A regular user only sees their own task activity (assigned to them, or created by them, which
// covers a manager seeing the tasks they personally handed out) — only admin-tier sees every task
// in the company. Action endpoints below (accept/progress/submit/approve/reject/edit/delete) have
// their own separate gating and are unaffected by this.
router.get("/", async (req, res) => {
  const rows = await query("SELECT * FROM tasks ORDER BY created_at DESC");
  const logs = await query("SELECT * FROM task_status_log ORDER BY at ASC");
  const stages = await query("SELECT * FROM task_content_stages ORDER BY task_id ASC, stage_index ASC");
  let out = rows.map((r) => ({
    ...r,
    statusLog: logs.filter((l) => l.task_id === r.id),
    contentStages: stages.filter((s) => s.task_id === r.id),
  }));
  if (!isAdminLike(req.user.roles)) {
    out = out.filter((t) => t.assigned_to === req.user.id || t.created_by === req.user.id);
  }
  res.json(out);
});

router.post("/", requireRole(MANAGER_ROLES), async (req, res) => {
  const { title, description, priority, dueDate, assignedTo, department } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  if (!assignedTo) return res.status(400).json({ error: "assignedTo is required" });
  const id = await withTransaction((conn) => nextSequentialId(conn, "AGBSTK", "task"));
  await query(
    `INSERT INTO tasks (id, title, description, priority, status, due_date, assigned_to, department, created_by) VALUES (?,?,?,?, 'Assigned', ?,?,?,?)`,
    [id, title.trim(), description || null, priority || "Normal", dueDate || null, assignedTo, department || null, req.user.id]
  );
  await query("INSERT INTO task_status_log (task_id, status, by_user) VALUES (?, 'Assigned', ?)", [id, req.user.id]);
  // A Content Creator's task automatically gets the 9-stage production tracker — runs alongside
  // the status workflow above, not instead of it. No opt-in checkbox: every task assigned to this
  // role is tracked this way.
  const [assignee] = await query("SELECT roles FROM users WHERE id = ?", [assignedTo]);
  if (assignee?.roles?.includes("content_creator")) {
    const params = CONTENT_STAGES.flatMap((_, i) => [id, i]);
    await query(`INSERT INTO task_content_stages (task_id, stage_index) VALUES ${CONTENT_STAGES.map(() => "(?,?)").join(",")}`, params);
  }
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'task_assigned', ?, ?, ?)",
    [nextId("NT"), "New task assigned", `${id} — ${title.trim()} — due ${dueDate || "no due date"}.`, JSON.stringify([assignedTo])]);
  res.status(201).json({ id });
});

router.patch("/:id", requireRole(MANAGER_ROLES), async (req, res) => {
  const { title, description, priority, dueDate, assignedTo, department } = req.body;
  const [task] = await query("SELECT status FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Not found" });
  if (task.status === "Completed") return res.status(400).json({ error: "A completed task can't be edited" });
  await query(
    `UPDATE tasks SET title=COALESCE(?,title), description=COALESCE(?,description), priority=COALESCE(?,priority),
       due_date=COALESCE(?,due_date), assigned_to=COALESCE(?,assigned_to), department=COALESCE(?,department) WHERE id = ?`,
    [title || null, description || null, priority || null, dueDate || null, assignedTo || null, department || null, req.params.id]
  );
  res.json({ ok: true });
});

router.post("/:id/accept", async (req, res) => {
  const [task] = await query("SELECT assigned_to, status FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Not found" });
  if (task.assigned_to !== req.user.id && !isAdminLike(req.user.roles)) return res.status(403).json({ error: "Only the assignee can accept this task" });
  if (task.status !== "Assigned") return res.status(400).json({ error: "Only a newly assigned task can be accepted" });
  await query("UPDATE tasks SET status = 'Accepted' WHERE id = ?", [req.params.id]);
  await query("INSERT INTO task_status_log (task_id, status, by_user) VALUES (?, 'Accepted', ?)", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// Any progress update (percentage and/or a work note) also moves an Accepted task into In
// Progress — the first update from the assignee is a reasonable "I've started" signal.
router.post("/:id/progress", async (req, res) => {
  const { progressPct, note } = req.body;
  const [task] = await query("SELECT assigned_to, status FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Not found" });
  if (task.assigned_to !== req.user.id && !isAdminLike(req.user.roles)) return res.status(403).json({ error: "Only the assignee can update progress" });
  if (!["Accepted", "In Progress", "Rejected"].includes(task.status)) return res.status(400).json({ error: "This task isn't in a state that can be updated" });
  const clamped = progressPct === undefined ? null : Math.max(0, Math.min(100, Number(progressPct)));
  await query(
    `UPDATE tasks SET status = 'In Progress', progress_pct = COALESCE(?, progress_pct) WHERE id = ?`,
    [clamped, req.params.id]
  );
  await query("INSERT INTO task_status_log (task_id, status, by_user, note) VALUES (?, 'In Progress', ?, ?)", [req.params.id, req.user.id, note || null]);
  res.json({ ok: true });
});

router.post("/:id/submit-for-approval", async (req, res) => {
  const [task] = await query("SELECT assigned_to, status, title FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Not found" });
  if (task.assigned_to !== req.user.id && !isAdminLike(req.user.roles)) return res.status(403).json({ error: "Only the assignee can submit this task" });
  if (!["Accepted", "In Progress", "Rejected"].includes(task.status)) return res.status(400).json({ error: "This task isn't in a state that can be submitted" });
  await query("UPDATE tasks SET status = 'Pending Approval', submitted_at = NOW() WHERE id = ?", [req.params.id]);
  await query("INSERT INTO task_status_log (task_id, status, by_user) VALUES (?, 'Pending Approval', ?)", [req.params.id, req.user.id]);
  // Notify admin-tier only — not the full MANAGER_ROLES set. Task assignment already went to just
  // the assignee; this is the mirror case (approval-needed goes to just admin-tier), even though
  // MANAGER_ROLES (sales/ops manager, HR) can still act as an approver if they check in directly —
  // this only narrows who gets proactively pinged.
  const audience = await approverAudience("task_approval", ["super_admin", "admin", "admin_exec"]);
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'task_approval', ?, ?, ?)",
    [nextId("NT"), "Task submitted for approval", `${req.params.id} — ${task.title} — ready for review.`, JSON.stringify(audience)]);
  res.json({ ok: true });
});

router.post("/:id/approve", requireRoleOrApprovalTypeDesignation(MANAGER_ROLES, "task_approval"), async (req, res) => {
  const [task] = await query("SELECT assigned_to, title, status FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Not found" });
  if (task.status !== "Pending Approval") return res.status(400).json({ error: "Only a task pending approval can be approved" });
  await query("UPDATE tasks SET status = 'Completed', progress_pct = 100, decided_by = ?, decided_at = NOW() WHERE id = ?", [req.user.id, req.params.id]);
  await query("INSERT INTO task_status_log (task_id, status, by_user) VALUES (?, 'Completed', ?)", [req.params.id, req.user.id]);
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'task_approval', ?, ?, ?)",
    [nextId("NT"), "Task approved", `${req.params.id} — ${task.title} — approved and marked complete.`, JSON.stringify([task.assigned_to])]);
  res.json({ ok: true });
});

router.post("/:id/reject", requireRoleOrApprovalTypeDesignation(MANAGER_ROLES, "task_approval"), async (req, res) => {
  const { reason } = req.body;
  const [task] = await query("SELECT assigned_to, title, status FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Not found" });
  if (task.status !== "Pending Approval") return res.status(400).json({ error: "Only a task pending approval can be rejected" });
  await query("UPDATE tasks SET status = 'Rejected', decided_by = ?, decided_at = NOW(), rejection_reason = ? WHERE id = ?", [req.user.id, reason || null, req.params.id]);
  await query("INSERT INTO task_status_log (task_id, status, by_user, note) VALUES (?, 'Rejected', ?, ?)", [req.params.id, req.user.id, reason || null]);
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'task_approval', ?, ?, ?)",
    [nextId("NT"), "Task sent back", `${req.params.id} — ${task.title} — rejected${reason ? `: ${reason}` : ""}.`, JSON.stringify([task.assigned_to])]);
  res.json({ ok: true });
});

// --- Content Creator 9-stage production tracker -------------------------------------------
// Runs alongside the status workflow above — a task still goes through Assigned/Accepted/.../
// Completed independently of how far along its content-production stages are.

// Target dates are the content creator's own production schedule (e.g. stage 4, "Location &
// Schedule", is literally where the shoot date gets set) — the assignee sets them, or a manager/
// admin can on their behalf. Deliberately not restricted to MANAGER_ROLES only.
router.patch("/:id/content-stages/:idx/target", async (req, res) => {
  const idx = Number(req.params.idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= CONTENT_STAGES.length) return res.status(400).json({ error: "Invalid stage" });
  const { targetDate } = req.body;
  const [task] = await query("SELECT assigned_to FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Not found" });
  const canSet = task.assigned_to === req.user.id || isAdminLike(req.user.roles) || MANAGER_ROLES.some((r) => r !== "admin_like" && req.user.roles.includes(r));
  if (!canSet) return res.status(403).json({ error: "You don't have permission to set this stage's schedule" });
  await query("UPDATE task_content_stages SET target_date = ? WHERE task_id = ? AND stage_index = ?", [targetDate || null, req.params.id, idx]);
  res.json({ ok: true });
});

// Advances the tracker by completing the current (lowest incomplete) stage — sequential and
// assignee-only, mirroring /accept and /progress above. Admin-tier bypasses sequencing via the
// override endpoint below instead of this one.
router.post("/:id/content-stages/advance", async (req, res) => {
  const [task] = await query("SELECT assigned_to FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Not found" });
  if (task.assigned_to !== req.user.id && !isAdminLike(req.user.roles)) return res.status(403).json({ error: "Only the assignee can advance this task's stage" });
  const [current] = await query(
    "SELECT stage_index FROM task_content_stages WHERE task_id = ? AND completed_at IS NULL ORDER BY stage_index ASC LIMIT 1",
    [req.params.id]
  );
  if (!current) return res.status(400).json({ error: "All stages are already complete" });
  await query("UPDATE task_content_stages SET completed_at = NOW(), completed_by = ? WHERE task_id = ? AND stage_index = ?", [req.user.id, req.params.id, current.stage_index]);
  res.json({ ok: true, stageIndex: current.stage_index });
});

// Admin-only bypass — sets or clears any stage's completion directly, out of sequence, to correct
// a mistake (same reasoning as the Job Card admin status override).
router.post("/:id/content-stages/:idx/override", requireRole(["admin_like"]), async (req, res) => {
  const idx = Number(req.params.idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= CONTENT_STAGES.length) return res.status(400).json({ error: "Invalid stage" });
  const { completedAt } = req.body; // ISO date string, or null/undefined to clear
  await query("UPDATE task_content_stages SET completed_at = ?, completed_by = ? WHERE task_id = ? AND stage_index = ?",
    [completedAt || null, completedAt ? req.user.id : null, req.params.id, idx]);
  res.json({ ok: true });
});

// Free-text notes any user with visibility into this task can add — keeps a running, documented
// history alongside the automatic status/content-stage entries. Same pattern as Job Cards' comment
// endpoint: no dedicated comments table, just a task_status_log row with status='Comment'.
router.post("/:id/comment", async (req, res) => {
  const { note } = req.body;
  if (!note?.trim()) return res.status(400).json({ error: "Comment can't be empty" });
  await query("INSERT INTO task_status_log (task_id, status, by_user, note) VALUES (?, 'Comment', ?, ?)", [req.params.id, req.user.id, note.trim()]);
  res.status(201).json({ ok: true });
});

// Real server-side A4 PDF (PDFKit, branded like every other document PDF in the app) — full
// details, the content-production tracker if this task has one, and the complete activity log.
router.get("/:id/pdf", async (req, res) => {
  const [task] = await query("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Not found" });
  const statusLog = await query("SELECT * FROM task_status_log WHERE task_id = ? ORDER BY at ASC", [req.params.id]);
  const contentStages = await query("SELECT * FROM task_content_stages WHERE task_id = ? ORDER BY stage_index ASC", [req.params.id]);
  const [assignee] = task.assigned_to ? await query("SELECT name FROM users WHERE id = ?", [task.assigned_to]) : [null];
  const byUserIds = [...new Set(statusLog.map((l) => l.by_user).filter(Boolean))];
  const byUsers = byUserIds.length ? await query(`SELECT id, name FROM users WHERE id IN (${byUserIds.map(() => "?").join(",")})`, byUserIds) : [];
  const nameOf = (id) => byUsers.find((u) => u.id === id)?.name || null;
  generateTaskPdf({
    ...task,
    assigneeName: assignee?.name || null,
    statusLog: statusLog.map((l) => ({ ...l, byName: nameOf(l.by_user) })),
    contentStages,
  }, res);
});

// Admin-only hard delete — for cleaning up test/mistaken tasks. task_status_log/task_content_stages
// cascade via FK.
router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM tasks WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
