const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { sendMail } = require("../utils/mailer");

const router = express.Router();
router.use(requireAuth);

// Which of these notifications are addressed to this caller — same audience match used by
// GET / and mark-all-read below, factored out so the two stay in sync.
const myAudienceFilter = (req) => (n) =>
  req.user.roles.some((r) => n.audience.includes(r)) || n.audience.includes(req.user.id);

router.get("/", async (req, res) => {
  const rows = await query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200");
  const mine = rows.filter(myAudienceFilter(req));
  if (!mine.length) return res.json([]);
  // read_flag lives per-recipient in notification_reads (see schema.sql) — a shared-role
  // audience means one person's read state can't sit on the notification row itself.
  const readRows = await query("SELECT notification_id FROM notification_reads WHERE user_id = ?", [req.user.id]);
  const readIds = new Set(readRows.map((r) => r.notification_id));
  res.json(mine.map((n) => ({ ...n, read_flag: readIds.has(n.id) ? 1 : 0 })));
});

router.post("/:id/read", async (req, res) => {
  await query("INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// Only the caller's own notifications, not the whole table — this used to be a blanket
// UPDATE with no WHERE clause, silently marking everyone's notifications read at once.
router.post("/mark-all-read", async (req, res) => {
  const rows = await query("SELECT id, audience FROM notifications");
  const mine = rows.filter(myAudienceFilter(req));
  for (const n of mine) {
    await query("INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)", [n.id, req.user.id]);
  }
  res.json({ ok: true });
});

// Preview-and-confirm email send for a notification (mirrors the customer-email confirm flow).
router.post("/:id/email", async (req, res) => {
  const { to, subject, body } = req.body;
  await sendMail({ to, subject, text: body });
  await query("UPDATE notifications SET email_sent = 1, emailed_at = NOW() WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
