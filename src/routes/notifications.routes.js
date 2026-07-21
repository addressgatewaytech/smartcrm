const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { sendMail } = require("../utils/mailer");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const rows = await query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200");
  const mine = rows.filter((n) => {
    const audience = JSON.parse(n.audience);
    return req.user.roles.some((r) => audience.includes(r)) || audience.includes(req.user.id);
  });
  res.json(mine.map((n) => ({ ...n, audience: JSON.parse(n.audience) })));
});

router.post("/:id/read", async (req, res) => {
  await query("UPDATE notifications SET read_flag = 1 WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

router.post("/mark-all-read", async (req, res) => {
  await query("UPDATE notifications SET read_flag = 1");
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
