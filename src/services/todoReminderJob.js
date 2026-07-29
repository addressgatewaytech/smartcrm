// My To-Do List reminder sweep — same pattern as leadSlaJobs.js. reminder_date is a plain date
// (no time-of-day), so "due" just means today or already past; each item only ever notifies once
// (reminder_notified), regardless of how many times the sweep runs that day.
const { query } = require("../config/db");
const { nextId } = require("../utils/helpers");

async function checkDueReminders() {
  const due = await query(`
    SELECT id, user_id, title FROM todo_items
    WHERE reminder_enabled = 1 AND reminder_notified = 0 AND done = 0
      AND reminder_date IS NOT NULL AND reminder_date <= CURDATE()
  `);
  for (const item of due) {
    await query("UPDATE todo_items SET reminder_notified = 1 WHERE id = ?", [item.id]);
    await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'todo_reminder', ?, ?, ?)",
      [nextId("NT"), "To-do reminder", item.title, JSON.stringify([item.user_id])]);
  }
  return due.length;
}

module.exports = { checkDueReminders };
