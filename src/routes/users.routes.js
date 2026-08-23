const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, ROLE_LABEL } = require("../middleware/roles");
const { nextId, today } = require("../utils/helpers");

const router = express.Router();
// Kept in memory, not written to disk (see photo_data below) — this host wipes anything under
// uploads/ on every deploy since it isn't tracked in git.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024 },
});

// Unauthenticated on purpose, same as the old static /uploads route it replaces — a plain <img
// src> can't attach a Bearer token, so this has to stay open rather than sit behind requireAuth
// like everything else in this file.
router.get("/:id/photo", async (req, res) => {
  const [row] = await query("SELECT photo_data, photo_mime FROM users WHERE id = ?", [req.params.id]);
  if (!row?.photo_data) return res.status(404).end();
  res.setHeader("Content-Type", row.photo_mime || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(row.photo_data);
});

router.use(requireAuth);

// HR ("roles: all" in the nav) needs every authenticated user to see the roster — only
// create/edit/delete of Users & Roles itself stays restricted to super_admin/admin below.
router.get("/", async (req, res) => {
  const rows = await query("SELECT id, name, email, roles, dept, initials, designation, category, photo_url, leave_balance, active, joined_date, date_of_birth, nationality, emp_code, qid_type, mobile_n, mobile_p, mobile_c, cloud_link FROM users ORDER BY name");
  const docs = await query("SELECT * FROM staff_docs");
  res.json(rows.map((r) => ({ ...r, docs: docs.filter((d) => d.user_id === r.id) })));
});

router.post("/", requireRole(["super_admin", "admin"]), async (req, res) => {
  const { name, email, password, roles, dept, initials, joinedDate, dateOfBirth, designation, category } = req.body;
  if (!name || !roles?.length) return res.status(400).json({ error: "Name and at least one role are required" });

  if (email) {
    const [existing] = await query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) return res.status(400).json({ error: `${email} is already in use by another user` });
  }

  const id = nextId("u");
  const hash = await bcrypt.hash(password || "ChangeMe123!", 10);
  // A real job title, editable independently of roles — defaults to the role label(s) only when
  // nothing was typed in, since that's the closest sensible guess for a brand-new user.
  const resolvedDesignation = designation?.trim() || roles.map((r) => ROLE_LABEL[r]).join(" + ");
  await query(
    `INSERT INTO users (id, name, email, password_hash, roles, dept, initials, designation, category, joined_date, date_of_birth) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, name, email || null, hash, JSON.stringify(roles), dept || null, initials || name.slice(0, 2).toUpperCase(), resolvedDesignation, category === "Management" ? "Management" : "Staff", joinedDate || today(), dateOfBirth || null]
  );
  res.status(201).json({ id });
});

router.patch("/:id", requireRole(["super_admin", "admin"]), async (req, res) => {
  const { name, email, roles, dept, initials, joinedDate, dateOfBirth, designation, category, nationality, empCode, qidType, mobileN, mobileP, mobileC } = req.body;
  const fields = [];
  const params = [];
  if (name) { fields.push("name = ?"); params.push(name); }
  if (email) {
    const [existing] = await query("SELECT id FROM users WHERE email = ? AND id != ?", [email, req.params.id]);
    if (existing) return res.status(400).json({ error: `${email} is already in use by another user` });
  }
  if (email !== undefined) { fields.push("email = ?"); params.push(email || null); }
  // Designation is now a job title independent of roles — changing roles no longer silently
  // overwrites it. It's only updated when the caller actually sends one.
  if (roles) { fields.push("roles = ?"); params.push(JSON.stringify(roles)); }
  if (designation !== undefined) { fields.push("designation = ?"); params.push(designation?.trim() || null); }
  if (category !== undefined) { fields.push("category = ?"); params.push(category === "Management" ? "Management" : "Staff"); }
  if (dept) { fields.push("dept = ?"); params.push(dept); }
  if (initials) { fields.push("initials = ?"); params.push(initials); }
  if (joinedDate !== undefined) { fields.push("joined_date = ?"); params.push(joinedDate || null); }
  if (dateOfBirth !== undefined) { fields.push("date_of_birth = ?"); params.push(dateOfBirth || null); }
  if (nationality !== undefined) { fields.push("nationality = ?"); params.push(nationality?.trim() || null); }
  if (empCode !== undefined) { fields.push("emp_code = ?"); params.push(empCode?.trim() || null); }
  if (qidType !== undefined) { fields.push("qid_type = ?"); params.push(qidType?.trim() || null); }
  if (mobileN !== undefined) { fields.push("mobile_n = ?"); params.push(mobileN?.trim() || null); }
  if (mobileP !== undefined) { fields.push("mobile_p = ?"); params.push(mobileP?.trim() || null); }
  if (mobileC !== undefined) { fields.push("mobile_c = ?"); params.push(mobileC?.trim() || null); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

// A person's own Google Cloud (Drive) folder link — separate from PATCH /:id above (which is
// tightly restricted to Admin-tier only, since it can change roles/email) and from per-document
// cloud links on staff_docs. HR needs to set this without needing full user-edit access.
router.patch("/:id/cloud-link", requireRole(["super_admin", "admin", "admin_exec", "hr"]), async (req, res) => {
  const { url } = req.body;
  await query("UPDATE users SET cloud_link = ? WHERE id = ?", [url || null, req.params.id]);
  res.json({ ok: true });
});

// Admin-set password reset — unlike /api/auth/change-password, doesn't require knowing the
// current password (that's the point: this is for an admin resetting someone else's).
router.post("/:id/reset-password", requireRole(["super_admin", "admin"]), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });
  const hash = await bcrypt.hash(password, 10);
  await query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.params.id]);
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
router.post("/:id/photo", photoUpload.single("photo"), async (req, res) => {
  const isSelf = req.user.id === req.params.id;
  const isAdmin = ["super_admin", "admin", "admin_exec"].some((r) => req.user.roles.includes(r));
  if (!isSelf && !isAdmin) return res.status(403).json({ error: "You can only update your own photo" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  // The version query param busts the browser's cache for this user's photo URL, which is
  // otherwise identical before and after a re-upload.
  const url = `/api/users/${req.params.id}/photo?v=${Date.now()}`;
  await query("UPDATE users SET photo_url = ?, photo_data = ?, photo_mime = ? WHERE id = ?",
    [url, req.file.buffer, req.file.mimetype, req.params.id]);
  res.json({ photoUrl: url });
});

// --- Staff documents (KYC-style expiry tracking for internal employees) --------------------
router.post("/:id/docs", requireRole(["super_admin", "admin", "admin_exec", "hr"]), async (req, res) => {
  const b = req.body;
  const docId = nextId("EDOC");
  await query("INSERT INTO staff_docs (id, user_id, type, number, expiry, cloud_link) VALUES (?,?,?,?,?,?)",
    [docId, req.params.id, b.type, b.number || null, b.expiry || null, b.cloudLink || null]);
  res.status(201).json({ id: docId });
});
router.patch("/:id/docs/:docId", requireRole(["super_admin", "admin", "admin_exec", "hr"]), async (req, res) => {
  const b = req.body;
  await query("UPDATE staff_docs SET type=COALESCE(?,type), number=?, expiry=?, cloud_link=? WHERE id=? AND user_id=?",
    [b.type, b.number || null, b.expiry || null, b.cloudLink || null, req.params.docId, req.params.id]);
  res.json({ ok: true });
});
router.delete("/:id/docs/:docId", requireRole(["super_admin", "admin", "admin_exec", "hr"]), async (req, res) => {
  await query("DELETE FROM staff_docs WHERE id = ? AND user_id = ?", [req.params.docId, req.params.id]);
  res.json({ ok: true });
});

// --- Module Access (per-user permission grid) ----------------------------------------------
// Explicit, per-user page/module access — the source of truth for nav visibility and (for
// can_view) actual API access, replacing role-array matching against NAV items. Keys here mirror
// the NAV item `key`s in frontend/src/App.jsx 1:1 — kept as a plain list since the backend has no
// visibility into that file; keep the two in sync by hand if a module is ever added/renamed.
const MODULES = [
  "dashboard", "leads", "deals", "quotations", "customers", "orders", "invoices", "jobs", "tasks",
  "subscriptions", "incentives", "hr", "attendance", "knowledgeBase", "users", "dataManager",
  "leadAssignment", "reports", "quotationTemplates", "templates", "notifications", "settings",
];
const emptyPermissionGrid = () => Object.fromEntries(MODULES.map((m) => [m, { canView: false, canAdd: false, canEdit: false, canDelete: false }]));
const rowsToGrid = (rows) => {
  const grid = emptyPermissionGrid();
  for (const r of rows) grid[r.module] = { canView: !!r.can_view, canAdd: !!r.can_add, canEdit: !!r.can_edit, canDelete: !!r.can_delete };
  return grid;
};

// Any authenticated user reads their own grid — this is what drives their own nav on load.
router.get("/me/permissions", async (req, res) => {
  const rows = await query("SELECT module, can_view, can_add, can_edit, can_delete FROM user_module_permissions WHERE user_id = ?", [req.user.id]);
  res.json(rowsToGrid(rows));
});

router.get("/:id/permissions", requireRole(["super_admin", "admin"]), async (req, res) => {
  const rows = await query("SELECT module, can_view, can_add, can_edit, can_delete FROM user_module_permissions WHERE user_id = ?", [req.params.id]);
  res.json(rowsToGrid(rows));
});

// Replaces the whole grid in one call — simplest to reason about from the admin UI's save button
// (one full grid in, one full grid out), same "delete then re-insert" pattern as job card
// assignment (see /job-cards/:id/assign in jobCards.routes.js).
router.put("/:id/permissions", requireRole(["super_admin", "admin"]), async (req, res) => {
  const grid = req.body.permissions || {};
  await withTransaction(async (conn) => {
    await conn.execute("DELETE FROM user_module_permissions WHERE user_id = ?", [req.params.id]);
    for (const m of MODULES) {
      const g = grid[m];
      if (!g || (!g.canView && !g.canAdd && !g.canEdit && !g.canDelete)) continue;
      await conn.execute(
        "INSERT INTO user_module_permissions (user_id, module, can_view, can_add, can_edit, can_delete) VALUES (?,?,?,?,?,?)",
        [req.params.id, m, g.canView ? 1 : 0, g.canAdd ? 1 : 0, g.canEdit ? 1 : 0, g.canDelete ? 1 : 0]
      );
    }
  });
  res.json({ ok: true });
});

module.exports = router;
