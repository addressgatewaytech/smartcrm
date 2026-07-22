const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { ROLE_LABEL } = require("../middleware/roles");
const { nextId } = require("../utils/helpers");
const { sendMail } = require("../utils/mailer");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const [user] = await query("SELECT * FROM users WHERE email = ? AND active = 1", [email]);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const roles = user.roles;
  const token = jwt.sign({ id: user.id, roles }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "8h" });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, roles, roleLabels: roles.map((r) => ROLE_LABEL[r]), photoUrl: user.photo_url, dept: user.dept, initials: user.initials },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const [user] = await query("SELECT id, name, email, roles, dept, initials, designation, photo_url, leave_balance FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ ...user, roles: user.roles });
});

// Change own password (first-login flow, or self-service).
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const [user] = await query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
  const ok = await bcrypt.compare(currentPassword || "", user.password_hash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

  const hash = await bcrypt.hash(newPassword, 10);
  await query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.user.id]);
  res.json({ ok: true });
});

// --- Forgot password (emailed OTP) ----------------------------------------------------------
// Deliberately returns the same response whether or not the email is registered, so this
// endpoint can't be used to enumerate valid accounts.
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });
  const genericResponse = { ok: true, message: "If that email is registered, a reset code has been sent." };

  const [user] = await query("SELECT id, name FROM users WHERE email = ? AND active = 1", [email]);
  if (!user) return res.json(genericResponse);

  // Avoid spamming a mailbox if the user double-clicks "send code" — skip issuing a new one if
  // an unused, unexpired code was already sent in the last minute.
  const [recent] = await query(
    "SELECT id FROM password_reset_otps WHERE user_id = ? AND used = 0 AND created_at > (NOW() - INTERVAL 1 MINUTE) LIMIT 1",
    [user.id]
  );
  if (recent) return res.json(genericResponse);

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  await query(
    "INSERT INTO password_reset_otps (id, user_id, otp_code, expires_at) VALUES (?,?,?, NOW() + INTERVAL 15 MINUTE)",
    [nextId("OTP"), user.id, otp]
  );
  await sendMail({
    to: email,
    subject: "Address Gateway CRM — Password Reset Code",
    text: `Hi ${user.name},\n\nYour password reset code is: ${otp}\n\nThis code expires in 15 minutes. If you didn't request this, you can safely ignore this email.`,
    critical: true, // always send, regardless of the Settings email toggle — this is the account-recovery path
  });
  res.json(genericResponse);
});

router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ error: "Email, code, and new password are required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const [user] = await query("SELECT id FROM users WHERE email = ? AND active = 1", [email]);
  if (!user) return res.status(400).json({ error: "Invalid or expired code" });

  const [record] = await query(
    "SELECT * FROM password_reset_otps WHERE user_id = ? AND otp_code = ? AND used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
    [user.id, otp]
  );
  if (!record) return res.status(400).json({ error: "Invalid or expired code" });

  const hash = await bcrypt.hash(newPassword, 10);
  await query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user.id]);
  await query("UPDATE password_reset_otps SET used = 1 WHERE id = ?", [record.id]);
  res.json({ ok: true });
});

module.exports = router;
