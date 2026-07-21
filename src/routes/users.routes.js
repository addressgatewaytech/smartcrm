const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, ROLE_LABEL } = require("../middleware/roles");
const { nextId, today } = require("../utils/helpers");

const router = express.Router();
// Custom storage (not multer's `dest` shortcut): the shortcut writes files with no extension,
// which would break the URL this route hands back to the frontend.
const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || "./uploads",
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024 },
});

router.use(requireAuth);

// Users & Roles management is restricted to super_admin/admin (not admin_exec) — matches the prototype exactly.
router.get("/", requireRole(["super_admin", "admin", "admin_exec", "hr"]), async (req, res) => {
  const rows = await query("SELECT id, name, email, roles, dept, initials, designation, photo_url, leave_balance, active, joined_date FROM users ORDER BY name");
  res.json(rows.map((r) => ({ ...r, roles: JSON.parse(r.roles) })));
});

router.post("/", requireRole(["super_admin", "admin"]), async (req, res) => {
  const { name, email, password, roles, dept, initials } = req.body;
  if (!name || !roles?.length) return res.status(400).json({ error: "Name and at least one role are required" });

  const id = nextId("u");
  const hash = await bcrypt.hash(password || "ChangeMe123!", 10);
  const designation = roles.map((r) => ROLE_LABEL[r]).join(" + ");
  await query(
    `INSERT INTO users (id, name, email, password_hash, roles, dept, initials, designation, joined_date) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, name, email || null, hash, JSON.stringify(roles), dept || null, initials || name.slice(0, 2).toUpperCase(), designation, today()]
  );
  res.status(201).json({ id });
});

router.patch("/:id", requireRole(["super_admin", "admin"]), async (req, res) => {
  const { name, roles, dept, initials } = req.body;
  const fields = [];
  const params = [];
  if (name) { fields.push("name = ?"); params.push(name); }
  if (roles) {
    fields.push("roles = ?", "designation = ?");
    params.push(JSON.stringify(roles), roles.map((r) => ROLE_LABEL[r]).join(" + "));
  }
  if (dept) { fields.push("dept = ?"); params.push(dept); }
  if (initials) { fields.push("initials = ?"); params.push(initials); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

router.post("/:id/toggle-active", requireRole(["super_admin", "admin"]), async (req, res) => {
  await query("UPDATE users SET active = 1 - active WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

router.delete("/:id", requireRole(["super_admin", "admin"]), async (req, res) => {
  await query("DELETE FROM users WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Profile photo upload — own photo, or any user's photo if Admin-tier.
router.post("/:id/photo", upload.single("photo"), async (req, res) => {
  const isSelf = req.user.id === req.params.id;
  const isAdmin = ["super_admin", "admin", "admin_exec"].some((r) => req.user.roles.includes(r));
  if (!isSelf && !isAdmin) return res.status(403).json({ error: "You can only update your own photo" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const url = `/uploads/${req.file.filename}`;
  await query("UPDATE users SET photo_url = ? WHERE id = ?", [url, req.params.id]);
  res.json({ photoUrl: url });
});

module.exports = router;
