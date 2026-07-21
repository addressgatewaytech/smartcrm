const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { ROLE_LABEL } = require("../middleware/roles");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const [user] = await query("SELECT * FROM users WHERE email = ? AND active = 1", [email]);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const roles = JSON.parse(user.roles);
  const token = jwt.sign({ id: user.id, roles }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "8h" });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, roles, roleLabels: roles.map((r) => ROLE_LABEL[r]), photoUrl: user.photo_url, dept: user.dept, initials: user.initials },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const [user] = await query("SELECT id, name, email, roles, dept, initials, designation, photo_url, leave_balance FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ ...user, roles: JSON.parse(user.roles) });
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

module.exports = router;
