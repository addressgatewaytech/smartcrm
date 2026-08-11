// Employee Attendance — self-service Sign In/Sign Out (AttendanceWidget, embedded in Dashboard)
// plus a monthly hours/lateness report (AttendancePage). Date-ranged attendance data is fetched
// on demand from a dedicated backend endpoint rather than loaded into the global store, since it
// can span a long history — same reasoning as ReportsPage's other report tabs.
import { useState, useEffect, useCallback } from "react";
import { Clock, LogIn, LogOut, Download } from "lucide-react";
import { api, ApiError } from "../api";
import { Stamp, Empty, exportCSV, ADMIN_LIKE } from "../ui.jsx";

const canSeeAllAttendance = (role) => ADMIN_LIKE.includes(role) || role === "hr";

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

export function AttendanceWidget() {
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setToday(await api.hr.attendanceToday()); } catch { /* ignore — widget just stays blank */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const signIn = async () => {
    setBusy(true); setError("");
    try { await api.hr.signIn(); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't sign in — please try again."); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true); setError("");
    try { await api.hr.signOut(); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't sign out — please try again."); }
    finally { setBusy(false); }
  };

  if (loading) return null;

  return (
    <div className="agw-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}><Clock size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Attendance</strong>
        {today?.in_time
          ? <Stamp tone={today.out_time ? "neutral" : "success"}>{today.out_time ? "Signed out" : "Signed in"}</Stamp>
          : <Stamp tone="warning">Not signed in</Stamp>}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>
        {today?.in_time ? `In: ${today.in_time}` : "You haven't signed in today."}
        {today?.out_time && ` · Out: ${today.out_time}`}
      </div>
      {error && <div className="side-note" style={{ borderColor: "#EFC3BC", background: "var(--danger-tint)", marginTop: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {!today?.in_time && <button className="btn btn-primary" disabled={busy} onClick={signIn}><LogIn size={14} /> Sign in</button>}
        {today?.in_time && !today?.out_time && <button className="btn" disabled={busy} onClick={signOut}><LogOut size={14} /> Sign out</button>}
      </div>
    </div>
  );
}

// Compact standalone Sign in/out control for the Dashboard header (top-right) — same self-service
// action as AttendanceWidget above, just without the card chrome, and color-coded (red = not
// signed in yet, green = signed in) so today's status reads at a glance without opening the card.
// Kept as its own component with its own fetch rather than sharing AttendanceWidget's state, since
// the two never render on the same page (this is Dashboard-only; AttendanceWidget also lives on
// the dedicated Attendance page).
export function AttendanceSignButton() {
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setToday(await api.hr.attendanceToday()); } catch { /* ignore — widget just stays blank */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const signIn = async () => {
    setBusy(true); setError("");
    try { await api.hr.signIn(); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't sign in — please try again."); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true); setError("");
    try { await api.hr.signOut(); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't sign out — please try again."); }
    finally { setBusy(false); }
  };

  if (loading) return null;
  const signedIn = !!today?.in_time;
  const doneForToday = signedIn && today?.out_time;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      {doneForToday ? (
        <Stamp tone="neutral">Signed out</Stamp>
      ) : (
        <button className="btn btn-sm" disabled={busy} onClick={signedIn ? signOut : signIn}
          style={{ background: signedIn ? "var(--success)" : "var(--danger)", borderColor: signedIn ? "var(--success)" : "var(--danger)", color: "#fff" }}>
          {signedIn ? <LogOut size={13} /> : <LogIn size={13} />} {busy ? "…" : signedIn ? "Sign out" : "Sign in"}
        </button>
      )}
      {error && <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>}
    </span>
  );
}

// Self-service history for a regular employee; a team-wide monthly hours/lateness report for
// Admin-tier/HR. Both are the same table shape, driven by the same backend endpoint — it self-
// scopes to the caller unless the requester is admin/hr, matching every other report in this app.
export function AttendancePage({ role, state }) {
  const isAdmin = canSeeAllAttendance(role);
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.hr.attendanceSummary(from, to)); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  // Management-category people (owners/directors) don't punch in/out — the team-wide report
  // should only track Staff, same rule already applied to assignee dropdowns elsewhere.
  const rows = isAdmin
    ? (Array.isArray(data) ? data : []).filter((r) => state.employees.find((e) => e.id === r.userId)?.category !== "Management")
    : data ? [data] : [];
  const nameOf = (uid) => state.employees.find((e) => e.id === uid)?.name || uid;
  const deptOf = (uid) => state.employees.find((e) => e.id === uid)?.dept || "";

  return (
    <div>
      {!isAdmin && <div style={{ marginBottom: 14 }}><AttendanceWidget /></div>}
      <div className="agw-card">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span style={{ color: "var(--ink-soft)" }}>to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn btn-sm" onClick={() => exportCSV("attendance.csv",
            ["Employee", "Department", "Present Days", "Total Hours", "Late Arrivals", "Early Departures"],
            rows.map((r) => [nameOf(r.userId), deptOf(r.userId), r.presentDays, r.totalHours, r.lateCount, r.earlyCount]))}>
            <Download size={13} /> Export
          </button>
        </div>
        {loading ? <div style={{ padding: 24, textAlign: "center", color: "var(--ink-soft)" }}>Loading…</div> :
          rows.length === 0 ? <Empty icon={Clock} text="No attendance records for this range." /> : (
            <div style={{ overflowX: "auto" }}>
              <table className="agw-table">
                <thead><tr>{isAdmin && <th>Employee</th>}{isAdmin && <th>Department</th>}<th>Present days</th><th>Total hours</th><th>Late arrivals</th><th>Early departures</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      {isAdmin && <td><span className="avatar">{state.employees.find((e) => e.id === r.userId)?.initials}</span> {nameOf(r.userId)}</td>}
                      {isAdmin && <td>{deptOf(r.userId)}</td>}
                      <td>{r.presentDays}</td>
                      <td className="mono">{r.totalHours}h</td>
                      <td>{r.lateCount > 0 ? <Stamp tone="warning">{r.lateCount}</Stamp> : "—"}</td>
                      <td>{r.earlyCount > 0 ? <Stamp tone="warning">{r.earlyCount}</Stamp> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
