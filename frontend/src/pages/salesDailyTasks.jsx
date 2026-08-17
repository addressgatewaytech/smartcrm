// Sales Daily Tasks — a Sales-department-only tab inside the existing Task page. Shows the 13
// predefined daily prospecting activities against fixed targets, resetting every calendar day with
// no cron job (see salesTasksHelpers.js and the backend's sales_task_daily_log table, keyed by
// user/task/day the same way Data Manager's daily activity already does). Self view for a plain
// sales_exec; a read-only team table for sales_manager/admin, mirroring DataByUserTab's pattern.
import { useState } from "react";
import { Plus, TrendingUp, Trash2 } from "lucide-react";
import { ApiError } from "../api";
import { Stamp, statusTone, Empty, money, ProgressRing, ADMIN_LIKE, ConfirmModal } from "../ui.jsx";
import { todayStr, firstOfWeekStr, firstOfMonthStr, userTaskSnapshot, dailyCompletionColor } from "../salesTasksHelpers";

const isManagerOrAdmin = (role) => ADMIN_LIKE.includes(role) || role === "sales_manager";

export function SalesDailyTasksTab({ state, dispatch, role, userId }) {
  const defs = state.salesTaskDefs || [];
  const data = { logs: state.salesTaskLogs || [], quotations: state.quotations, salesOrders: state.salesOrders, invoices: state.invoices };
  const today = todayStr();
  const weekStart = firstOfWeekStr();
  const monthStart = firstOfMonthStr();

  if (defs.length === 0) return <Empty icon={TrendingUp} text="Sales Daily Tasks aren't set up yet — check back shortly." />;

  if (isManagerOrAdmin(role)) return <TeamView state={state} dispatch={dispatch} defs={defs} data={data} today={today} role={role} />;
  return <SelfView defs={defs} data={data} today={today} weekStart={weekStart} monthStart={monthStart} userId={userId} dispatch={dispatch} />;
}

function SelfView({ defs, data, today, weekStart, monthStart, userId, dispatch }) {
  const todaySnap = userTaskSnapshot(defs, data, userId, today, today);
  const weekSnap = userTaskSnapshot(defs, data, userId, weekStart, today);
  const monthSnap = userTaskSnapshot(defs, data, userId, monthStart, today);

  const [busyId, setBusyId] = useState(null);
  const [countInputs, setCountInputs] = useState({});

  const increment = async (taskDefId) => {
    setBusyId(taskDefId);
    try { await dispatch({ type: "INCREMENT_SALES_TASK", taskDefId, delta: 1 }); }
    catch (err) { alert(err instanceof ApiError ? err.message : "Couldn't log that — please try again."); }
    finally { setBusyId(null); }
  };
  const setCount = async (taskDefId) => {
    const val = Number(countInputs[taskDefId]);
    if (!Number.isFinite(val) || val < 0) return;
    setBusyId(taskDefId);
    try { await dispatch({ type: "SET_SALES_TASK_COUNT", taskDefId, count: val }); setCountInputs((c) => ({ ...c, [taskDefId]: "" })); }
    catch (err) { alert(err instanceof ApiError ? err.message : "Couldn't save that — please try again."); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 12 }}>
        <div className="agw-card"><div className="kpi-label">Today's task completion</div><div className="kpi-value disp" style={{ color: dailyCompletionColor(todaySnap.completionPct) }}>{todaySnap.completionPct}%</div></div>
        <div className="agw-card"><div className="kpi-label">Revenue achieved (today)</div><div className="kpi-value disp">{money(todaySnap.revenue)}</div></div>
        <div className="agw-card"><div className="kpi-label">Sales achieved (today)</div><div className="kpi-value disp">{money(todaySnap.sales)}</div></div>
      </div>
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 16 }}>
        <div className="agw-card" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
          <ProgressRing pct={todaySnap.completionPct} color={dailyCompletionColor(todaySnap.completionPct)} label="Daily performance" />
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{todaySnap.pendingCount} of {defs.length} activities still pending today</div>
        </div>
        <div className="agw-card" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
          <ProgressRing pct={weekSnap.completionPct} color={dailyCompletionColor(weekSnap.completionPct)} label="Weekly performance" />
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Week-to-date across all daily activities</div>
        </div>
        <div className="agw-card" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
          <ProgressRing pct={monthSnap.completionPct} color={dailyCompletionColor(monthSnap.completionPct)} label="Monthly performance" />
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Month-to-date across all daily activities</div>
        </div>
      </div>

      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
        {todaySnap.rows.map(({ def, completed, target, remaining, status }) => {
          const isMoney = def.metricType === "Money";
          const fmt = (n) => (isMoney ? money(n) : n);
          const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
          return (
            <div className="agw-card" key={def.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <strong style={{ fontSize: 13.5 }}>{def.name}</strong>
                <Stamp tone={statusTone(status)}>{status}</Stamp>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
                <span>Target: <strong style={{ color: "var(--ink)" }}>{fmt(target)}</strong></span>
                <span>Completed: <strong style={{ color: "var(--ink)" }}>{fmt(completed)}</strong></span>
                <span>Remaining: <strong style={{ color: "var(--ink)" }}>{fmt(remaining)}</strong></span>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ background: "var(--page)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: status === "Completed" ? "var(--success)" : "var(--brand)", borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 3, textAlign: "right" }}>{pct}%</div>
              </div>
              {def.source === "Manual" ? (
                <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
                  <button className="btn btn-sm" disabled={busyId === def.id} onClick={() => increment(def.id)}><Plus size={12} /> +1</button>
                  <input type="number" min={0} placeholder="Set count" value={countInputs[def.id] ?? ""} style={{ width: 90, fontSize: 12.5 }}
                    onChange={(e) => setCountInputs((c) => ({ ...c, [def.id]: e.target.value }))} />
                  <button className="btn btn-sm btn-ghost" disabled={busyId === def.id || countInputs[def.id] === undefined || countInputs[def.id] === ""} onClick={() => setCount(def.id)}>Set</button>
                </div>
              ) : (
                <div className="pill" style={{ marginTop: 10, display: "inline-block" }}>Live — calculated automatically</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamView({ state, dispatch, defs, data, today, role }) {
  const salesUsers = state.employees.filter((e) => e.roles.includes("sales_exec") || e.roles.includes("sales_manager"));
  const rows = salesUsers.map((owner) => ({ owner, snap: userTaskSnapshot(defs, data, owner.id, today, today) }))
    .sort((a, b) => b.snap.completionPct - a.snap.completionPct);
  const [showTargets, setShowTargets] = useState(false);

  return (
    <div>
      <div className="agw-card" style={{ padding: 0 }}>
        {rows.length === 0 ? <Empty icon={TrendingUp} text="No sales team members yet." /> : (
          <div style={{ overflowX: "auto" }}>
            <table className="agw-table">
              <thead><tr><th>Employee</th><th>Task completion %</th><th>Revenue (today)</th><th>Sales (today)</th><th>Current status</th></tr></thead>
              <tbody>
                {rows.map(({ owner, snap }) => (
                  <tr key={owner.id}>
                    <td style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="avatar">{owner.initials}</span>{owner.name}</td>
                    <td className="mono" style={{ color: dailyCompletionColor(snap.completionPct), fontWeight: 600 }}>{snap.completionPct}%</td>
                    <td className="mono">{money(snap.revenue)}</td>
                    <td className="mono">{money(snap.sales)}</td>
                    <td><Stamp tone={statusTone(snap.overallStatus)}>{snap.overallStatus}</Stamp></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ADMIN_LIKE.includes(role) && (
        <div className="agw-card" style={{ marginTop: 14 }}>
          <button className="btn btn-sm" onClick={() => setShowTargets((v) => !v)}>{showTargets ? "Hide" : "Edit"} daily targets</button>
          {showTargets && <TargetEditor defs={defs} dispatch={dispatch} />}
        </div>
      )}
    </div>
  );
}

function TargetEditor({ defs, dispatch }) {
  const [values, setValues] = useState(() => Object.fromEntries(defs.map((d) => [d.id, d.target])));
  const [savingId, setSavingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [removing, setRemoving] = useState(null); // the def pending confirm, or null

  const save = async (id) => {
    setSavingId(id);
    try { await dispatch({ type: "UPDATE_SALES_TASK_TARGET", id, target: Number(values[id]) }); }
    catch (err) { alert(err instanceof ApiError ? err.message : "Couldn't save that target — please try again."); }
    finally { setSavingId(null); }
  };

  const remove = async (id) => {
    setRemovingId(id);
    try { await dispatch({ type: "REMOVE_SALES_TASK_DEF", id }); setRemoving(null); }
    catch (err) { alert(err instanceof ApiError ? err.message : "Couldn't remove that activity — please try again."); }
    finally { setRemovingId(null); }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <p className="modal-sub" style={{ marginTop: 0 }}>One shared target per activity across the whole Sales team — not per person.</p>
      {defs.map((d) => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--hair)" }}>
          <span style={{ flex: 1, fontSize: 13 }}>{d.name} {d.source === "Auto" && <span className="pill" style={{ marginLeft: 6 }}>Live</span>}</span>
          <input type="number" min={0} value={values[d.id]} style={{ width: 110 }}
            onChange={(e) => setValues((v) => ({ ...v, [d.id]: e.target.value }))} />
          <button className="btn btn-sm" disabled={savingId === d.id || Number(values[d.id]) === d.target} onClick={() => save(d.id)}>Save</button>
          {d.source === "Manual" && (
            <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} title="Remove activity" onClick={() => setRemoving(d)}><Trash2 size={13} /></button>
          )}
        </div>
      ))}
      {removing && (
        <ConfirmModal
          title={`Remove "${removing.name}"?`}
          body="This stops tracking it going forward and permanently deletes everyone's logged history for it — daily/weekly/monthly completion % for every salesperson will be recalculated against the remaining activities, including for past periods. This can't be undone."
          confirmLabel={removingId === removing.id ? "Removing…" : "Remove"}
          onConfirm={() => remove(removing.id)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
