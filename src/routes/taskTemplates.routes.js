const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");
const { nextId } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

// Readable by anyone authenticated (the New Task template picker only ever renders for managers
// client-side) — same "globally readable, admin-only writes" convention as quotation/checklist
// templates. Doesn't touch tasks/task_status_log or the existing Task Management flow at all.
router.get("/", async (req, res) => {
  const rows = await query("SELECT * FROM task_templates ORDER BY department, name");
  res.json(rows);
});

router.post("/", requireRole(["admin_like"]), async (req, res) => {
  const { name, department, title, description, priority, dueInDays } = req.body;
  if (!name || !title) return res.status(400).json({ error: "name and title are required" });
  const id = nextId("TT");
  await query(
    `INSERT INTO task_templates (id, name, department, title, description, priority, due_in_days, created_by) VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, department || null, title, description || null, priority || "Normal", dueInDays ?? null, req.user.id]
  );
  res.status(201).json({ id });
});

router.patch("/:id", requireRole(["admin_like"]), async (req, res) => {
  const { name, department, title, description, priority, dueInDays } = req.body;
  await query(
    `UPDATE task_templates SET name=?, department=?, title=?, description=?, priority=?, due_in_days=? WHERE id=?`,
    [name, department || null, title, description || null, priority || "Normal", dueInDays ?? null, req.params.id]
  );
  res.json({ ok: true });
});

router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM task_templates WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
