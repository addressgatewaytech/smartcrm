const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");

const router = express.Router();
router.use(requireAuth);

// Singleton row (id = 1). Password-reset OTP emails always bypass this (see mailer.js's
// `critical` flag) — this toggle only governs everything else (notifications, data manager
// outreach emails, etc.), matching the request to be able to turn off "nice to have" email
// without ever risking locking someone out of a password reset.
router.get("/", async (req, res) => {
  const [settings] = await query("SELECT * FROM app_settings WHERE id = 1");
  res.json(settings);
});

router.patch("/", requireRole(["admin_like"]), async (req, res) => {
  const { emailNotificationsEnabled } = req.body;
  if (emailNotificationsEnabled === undefined) return res.status(400).json({ error: "Nothing to update" });
  await query("UPDATE app_settings SET email_notifications_enabled = ? WHERE id = 1", [emailNotificationsEnabled ? 1 : 0]);
  res.json({ ok: true });
});

module.exports = router;
