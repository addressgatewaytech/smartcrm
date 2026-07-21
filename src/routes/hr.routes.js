const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, today } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);
const isHrAdmin = (roles) => isAdminLike(roles) || roles.includes("hr");

// --- Attendance --------------------------------------------------------------------------
router.post("/attendance/mark", requireRole(["admin_like", "hr"]), async (req, res) => {
  const { userId, date, status } = req.body;
  await query(
    `INSERT INTO attendance (id, user_id, date, status, marked_by) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)`,
    [nextId("ATT"), userId, date || today(), status, req.user.id]
  );
  res.json({ ok: true });
});

router.get("/attendance/:userId", async (req, res) => {
  const { from, to } = req.query;
  const rows = await query("SELECT * FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date", [req.params.userId, from || "1970-01-01", to || "2999-12-31"]);
  res.json(rows);
});

// --- Leave requests ------------------------------------------------------------------------
router.get("/leave-requests", async (req, res) => {
  const isAdmin = isHrAdmin(req.user.roles);
  const rows = isAdmin
    ? await query("SELECT * FROM leave_requests ORDER BY requested_at DESC")
    : await query("SELECT * FROM leave_requests WHERE user_id = ? ORDER BY requested_at DESC", [req.user.id]);
  res.json(rows);
});

router.post("/leave-requests", async (req, res) => {
  const b = req.body;
  const id = nextId("LV");
  await query("INSERT INTO leave_requests (id, user_id, type, start_date, end_date, reason) VALUES (?,?,?,?,?,?)",
    [id, req.user.id, b.type, b.startDate, b.endDate, b.reason || null]);
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'approval', ?, ?, ?)",
    [nextId("NT"), "Leave request submitted", `${req.user.id} requested ${b.type} leave (${b.startDate} to ${b.endDate}).`, JSON.stringify(["super_admin", "admin", "admin_exec", "hr"])]);
  res.status(201).json({ id });
});

router.post("/leave-requests/:id/decide", requireRole(["admin_like", "hr"]), async (req, res) => {
  const { status } = req.body; // Approved | Rejected
  await query("UPDATE leave_requests SET status = ?, decided_by = ? WHERE id = ?", [status, req.user.id, req.params.id]);
  res.json({ ok: true });
});

router.delete("/leave-requests/:id", async (req, res) => {
  const [r] = await query("SELECT user_id, status FROM leave_requests WHERE id = ?", [req.params.id]);
  const isAdmin = isHrAdmin(req.user.roles);
  if (!isAdmin && (r.user_id !== req.user.id || r.status !== "Pending")) return res.status(403).json({ error: "Not allowed" });
  await query("DELETE FROM leave_requests WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// --- Punch (attendance correction) requests ------------------------------------------------
// Business rules enforced here, server-side (not just UI validation):
//  1. Max 3 requests per employee per calendar month.
//  2. Must be submitted by 11:30 the day AFTER the missed-punch date.
router.post("/punch-requests", async (req, res) => {
  const { date, inTime, outTime, reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: "A reason is required" });

  const deadline = new Date(date);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(11, 30, 0, 0);
  if (new Date() > deadline) return res.status(400).json({ error: "Too late to request for this date — the window closed at 11:30 AM the next day." });
  if (new Date(date) > new Date(today())) return res.status(400).json({ error: "Cannot request a correction for a future date." });

  const monthPrefix = today().slice(0, 7); // YYYY-MM
  const [{ cnt }] = await query("SELECT COUNT(*) AS cnt FROM punch_requests WHERE user_id = ? AND DATE_FORMAT(requested_at, '%Y-%m') = ?", [req.user.id, monthPrefix]);
  if (cnt >= 3) return res.status(400).json({ error: "You've used all 3 punch correction requests allowed this month." });

  const id = nextId("PR");
  await query("INSERT INTO punch_requests (id, user_id, date, in_time, out_time, reason) VALUES (?,?,?,?,?,?)", [id, req.user.id, date, inTime || null, outTime || null, reason]);
  res.status(201).json({ id });
});

router.get("/punch-requests", async (req, res) => {
  const isAdmin = isHrAdmin(req.user.roles);
  const rows = isAdmin
    ? await query("SELECT * FROM punch_requests ORDER BY requested_at DESC")
    : await query("SELECT * FROM punch_requests WHERE user_id = ? ORDER BY requested_at DESC", [req.user.id]);
  res.json(rows);
});

router.post("/punch-requests/:id/decide", requireRole(["admin_like", "hr"]), async (req, res) => {
  const { status } = req.body; // Approved | Rejected
  await query("UPDATE punch_requests SET status = ?, decided_by = ? WHERE id = ?", [status, req.user.id, req.params.id]);

  if (status === "Approved") {
    const [r] = await query("SELECT * FROM punch_requests WHERE id = ?", [req.params.id]);
    await query(
      `INSERT INTO attendance (id, user_id, date, status, in_time, out_time, marked_by) VALUES (?,?,?, 'Present', ?, ?, ?)
       ON DUPLICATE KEY UPDATE status='Present', in_time=VALUES(in_time), out_time=VALUES(out_time), marked_by=VALUES(marked_by)`,
      [nextId("ATT"), r.user_id, r.date, r.in_time, r.out_time, req.user.id]
    );
  }
  res.json({ ok: true });
});

module.exports = router;
