// My To-Do List — purely personal notes/reminders, separate from the manager-assigned Tasks
// module. No approval workflow, no visibility rules to reason about: every route is scoped to
// req.user.id, so a user only ever sees/edits/deletes their own items.
const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { nextId } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const rows = await query("SELECT * FROM todo_items WHERE user_id = ? ORDER BY done ASC, reminder_date IS NULL, reminder_date ASC, created_at DESC", [req.user.id]);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { title, reminderEnabled, reminderDate } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  const id = nextId("TODO");
  await query(
    "INSERT INTO todo_items (id, user_id, title, reminder_enabled, reminder_date) VALUES (?,?,?,?,?)",
    [id, req.user.id, title.trim(), reminderEnabled ? 1 : 0, reminderEnabled ? reminderDate || null : null]
  );
  res.status(201).json({ id });
});

router.patch("/:id", async (req, res) => {
  const [item] = await query("SELECT user_id FROM todo_items WHERE id = ?", [req.params.id]);
  if (!item) return res.status(404).json({ error: "Not found" });
  if (item.user_id !== req.user.id) return res.status(403).json({ error: "You can only edit your own to-do items" });

  const { title, done, reminderEnabled, reminderDate } = req.body;
  const fields = [];
  const params = [];
  if (title !== undefined) { fields.push("title = ?"); params.push(title.trim()); }
  if (done !== undefined) { fields.push("done = ?"); params.push(done ? 1 : 0); }
  if (reminderEnabled !== undefined) { fields.push("reminder_enabled = ?"); params.push(reminderEnabled ? 1 : 0); }
  if (reminderDate !== undefined) { fields.push("reminder_date = ?"); params.push(reminderDate || null); }
  // Changing the reminder (on/off or to a new date) should let it notify again.
  if (reminderEnabled !== undefined || reminderDate !== undefined) fields.push("reminder_notified = 0");
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE todo_items SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const [item] = await query("SELECT user_id FROM todo_items WHERE id = ?", [req.params.id]);
  if (!item) return res.status(404).json({ error: "Not found" });
  if (item.user_id !== req.user.id) return res.status(403).json({ error: "You can only delete your own to-do items" });
  await query("DELETE FROM todo_items WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
