const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { today } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

// Sales Daily Tasks is Sales-department + admin-oversight only — same predicate used throughout
// the app (Dashboard's isSalesRole, SalesPersonReport, DataByUserTab) rather than the free-text
// employees.dept column, which carries no authorization meaning.
const canView = (roles) => isAdminLike(roles) || roles.includes("sales_exec") || roles.includes("sales_manager");
router.use((req, res, next) => (canView(req.user.roles) ? next() : res.status(403).json({ error: "You do not have permission to perform this action" })));

router.get("/definitions", async (req, res) => {
  const rows = await query("SELECT * FROM sales_task_definitions ORDER BY sort_order");
  res.json(rows);
});

// The one global, admin-editable knob per activity — not per-user.
router.patch("/definitions/:id", requireRole(["admin_like"]), async (req, res) => {
  const { target } = req.body;
  if (target == null || Number(target) < 0) return res.status(400).json({ error: "target must be a non-negative number" });
  await query("UPDATE sales_task_definitions SET target = ? WHERE id = ?", [target, req.params.id]);
  res.json({ ok: true });
});

// A plain sales_exec sees only their own log rows; sales_manager/admin see everyone's — same
// "load the whole collection, filter client-side" pattern as most of this app's other GETs.
router.get("/logs", async (req, res) => {
  const isManagerOrAdmin = isAdminLike(req.user.roles) || req.user.roles.includes("sales_manager");
  const rows = isManagerOrAdmin
    ? await query("SELECT * FROM sales_task_daily_log")
    : await query("SELECT * FROM sales_task_daily_log WHERE user_id = ?", [req.user.id]);
  res.json(rows);
});

async function loadManualDef(taskDefId, res) {
  const [def] = await query("SELECT * FROM sales_task_definitions WHERE id = ?", [taskDefId]);
  if (!def) { res.status(404).json({ error: "Not found" }); return null; }
  if (def.source !== "Manual") { res.status(400).json({ error: "This activity is calculated automatically and can't be logged manually" }); return null; }
  return def;
}

// +1 (or +delta) to today's count — the everyday "logged one" action.
router.post("/logs/:taskDefId/increment", async (req, res) => {
  const def = await loadManualDef(req.params.taskDefId, res);
  if (!def) return;
  const delta = Number.isFinite(Number(req.body.delta)) ? Number(req.body.delta) : 1;
  await query(
    `INSERT INTO sales_task_daily_log (user_id, task_def_id, activity_date, completed_count) VALUES (?,?,?,GREATEST(0,?))
     ON DUPLICATE KEY UPDATE completed_count = GREATEST(0, completed_count + ?)`,
    [req.user.id, req.params.taskDefId, today(), delta, delta]
  );
  res.json({ ok: true });
});

// Sets today's count to an exact value (a correction, not an increment).
router.patch("/logs/:taskDefId", async (req, res) => {
  const def = await loadManualDef(req.params.taskDefId, res);
  if (!def) return;
  const count = Math.max(0, Number(req.body.count) || 0);
  await query(
    `INSERT INTO sales_task_daily_log (user_id, task_def_id, activity_date, completed_count) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE completed_count = VALUES(completed_count)`,
    [req.user.id, req.params.taskDefId, today(), count]
  );
  res.json({ ok: true });
});

module.exports = router;
