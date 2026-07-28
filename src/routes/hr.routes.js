const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, today } = require("../utils/helpers");
const { requireRoleOrApprovalTypeDesignation, approverAudience } = require("../utils/designationApproval");
const { toQatarTime, OFFICE_START_HOUR, OFFICE_END_HOUR } = require("../utils/officeHours");

const router = express.Router();
router.use(requireAuth);
const isHrAdmin = (roles) => isAdminLike(roles) || roles.includes("hr");

// Qatar-local (not server-local) date/time strings — attendance is inherently about which Qatar
// calendar day someone showed up on, and the server process's own timezone shouldn't matter.
function qatarDateTimeParts(d = new Date()) {
  const q = toQatarTime(d);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${q.getUTCFullYear()}-${pad(q.getUTCMonth() + 1)}-${pad(q.getUTCDate())}`,
    time: `${pad(q.getUTCHours())}:${pad(q.getUTCMinutes())}:${pad(q.getUTCSeconds())}`,
  };
}

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

// --- Employee self-service sign in / sign out --------------------------------------------
router.post("/attendance/sign-in", async (req, res) => {
  const { date, time } = qatarDateTimeParts();
  const [existing] = await query("SELECT in_time FROM attendance WHERE user_id = ? AND date = ?", [req.user.id, date]);
  if (existing?.in_time) return res.status(400).json({ error: `Already signed in today at ${existing.in_time}` });
  await query(
    `INSERT INTO attendance (id, user_id, date, status, in_time, marked_by) VALUES (?,?,?, 'Present', ?, ?)
     ON DUPLICATE KEY UPDATE status='Present', in_time=VALUES(in_time), marked_by=VALUES(marked_by)`,
    [nextId("ATT"), req.user.id, date, time, req.user.id]
  );
  res.json({ ok: true, date, time });
});

router.post("/attendance/sign-out", async (req, res) => {
  const { date, time } = qatarDateTimeParts();
  const [existing] = await query("SELECT in_time, out_time FROM attendance WHERE user_id = ? AND date = ?", [req.user.id, date]);
  if (!existing?.in_time) return res.status(400).json({ error: "You haven't signed in today yet" });
  if (existing.out_time) return res.status(400).json({ error: `Already signed out today at ${existing.out_time}` });
  await query("UPDATE attendance SET out_time = ? WHERE user_id = ? AND date = ?", [time, req.user.id, date]);
  res.json({ ok: true, date, time });
});

router.get("/attendance/me/today", async (req, res) => {
  const { date } = qatarDateTimeParts();
  const [row] = await query("SELECT * FROM attendance WHERE user_id = ? AND date = ?", [req.user.id, date]);
  res.json(row || null);
});

// Monthly/date-ranged hours summary — computed here (not loaded fully into client state, unlike
// most other reports in this app) since attendance rows can span a long history. Self-service for
// a plain employee (always their own data); admin/hr can pass ?userId= for one person, or omit it
// for every active user's summary (used by the Attendance / Employee Productivity reports).
router.get("/attendance/summary", async (req, res) => {
  const { from, to, userId } = req.query;
  const isAdmin = isHrAdmin(req.user.roles);
  const fromDate = from || "1970-01-01";
  const toDate = to || "2999-12-31";
  const toMinutes = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const summarize = async (uid) => {
    const rows = await query("SELECT * FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date", [uid, fromDate, toDate]);
    let totalMinutes = 0, lateCount = 0, earlyCount = 0, presentDays = 0;
    const days = rows.map((r) => {
      const inMin = toMinutes(r.in_time);
      const outMin = toMinutes(r.out_time);
      const workedMinutes = inMin != null && outMin != null && outMin > inMin ? outMin - inMin : 0;
      const late = inMin != null && inMin > OFFICE_START_HOUR * 60;
      const early = outMin != null && outMin < OFFICE_END_HOUR * 60;
      if (r.status === "Present") presentDays++;
      if (late) lateCount++;
      if (early) earlyCount++;
      totalMinutes += workedMinutes;
      return { ...r, workedMinutes, late, early };
    });
    return { userId: uid, days, totalMinutes, totalHours: +(totalMinutes / 60).toFixed(1), presentDays, lateCount, earlyCount };
  };
  if (userId || !isAdmin) {
    return res.json(await summarize(isAdmin && userId ? userId : req.user.id));
  }
  const users = await query("SELECT id FROM users WHERE active = 1");
  res.json(await Promise.all(users.map((u) => summarize(u.id))));
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
  const audience = await approverAudience("leave_request", ["super_admin", "admin", "admin_exec", "hr"]);
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'approval', ?, ?, ?)",
    [nextId("NT"), "Leave request submitted", `${req.user.id} requested ${b.type} leave (${b.startDate} to ${b.endDate}).`, JSON.stringify(audience)]);
  res.status(201).json({ id });
});

router.post("/leave-requests/:id/decide", requireRoleOrApprovalTypeDesignation(["admin_like", "hr"], "leave_request"), async (req, res) => {
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

  // DATE_FORMAT()'s result collation doesn't always match the connection's (this host's MySQL
  // throws "Illegal mix of collations" without the explicit COLLATE here) — every punch-request
  // submission was failing because of this before it even got to the monthly-limit check.
  const monthPrefix = today().slice(0, 7); // YYYY-MM
  const [{ cnt }] = await query("SELECT COUNT(*) AS cnt FROM punch_requests WHERE user_id = ? AND DATE_FORMAT(requested_at, '%Y-%m') COLLATE utf8mb4_unicode_ci = ?", [req.user.id, monthPrefix]);
  if (cnt >= 3) return res.status(400).json({ error: "You've used all 3 punch correction requests allowed this month." });

  const id = nextId("PR");
  await query("INSERT INTO punch_requests (id, user_id, date, in_time, out_time, reason) VALUES (?,?,?,?,?,?)", [id, req.user.id, date, inTime || null, outTime || null, reason]);
  const audience = await approverAudience("punch_request", ["super_admin", "admin", "admin_exec", "hr"]);
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'approval', ?, ?, ?)",
    [nextId("NT"), "Punch correction request submitted", `${req.user.id} requested a punch correction for ${date}.`, JSON.stringify(audience)]);
  res.status(201).json({ id });
});

router.get("/punch-requests", async (req, res) => {
  const isAdmin = isHrAdmin(req.user.roles);
  const rows = isAdmin
    ? await query("SELECT * FROM punch_requests ORDER BY requested_at DESC")
    : await query("SELECT * FROM punch_requests WHERE user_id = ? ORDER BY requested_at DESC", [req.user.id]);
  res.json(rows);
});

router.post("/punch-requests/:id/decide", requireRoleOrApprovalTypeDesignation(["admin_like", "hr"], "punch_request"), async (req, res) => {
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

router.delete("/punch-requests/:id", async (req, res) => {
  const [r] = await query("SELECT user_id, status FROM punch_requests WHERE id = ?", [req.params.id]);
  const isAdmin = isHrAdmin(req.user.roles);
  if (!isAdmin && (r.user_id !== req.user.id || r.status !== "Pending")) return res.status(403).json({ error: "Not allowed" });
  await query("DELETE FROM punch_requests WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
