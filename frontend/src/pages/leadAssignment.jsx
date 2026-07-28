// Lead Assignment Manager — assign/reassign leads and monitor the 5-minute (office-hours) /
// next-working-day first-follow-up SLA. SLA state is derived client-side from the same fields the
// backend cron sweep uses (assignedAt/slaDueAt/slaViolated/followUps), so the badge here always
// mirrors what the notification the owner already received says.
import { useState } from "react";
import { Search, UserCog } from "lucide-react";
import { ApiError } from "../api";
import { Modal, Stamp, Empty, BarChart, fmtDate } from "../ui.jsx";

const ADMIN_LIKE = ["super_admin", "admin", "admin_exec"];
const canAssignLeads = (role) => ADMIN_LIKE.includes(role) || role === "lead_manager" || role === "sales_manager";

function slaState(lead) {
  if (!lead.assignedAt) return { label: "Unassigned", tone: "neutral" };
  const met = (lead.followUps || []).some((f) => f.at && new Date(f.at) >= new Date(lead.assignedAt));
  if (met) return { label: "Met", tone: "success" };
  if (lead.slaViolated) return { label: "Violated", tone: "danger" };
  if (lead.slaDueAt && new Date(lead.slaDueAt) < new Date()) return { label: "Overdue", tone: "danger" };
  return { label: "Pending", tone: "warning" };
}

export function LeadAssignmentManagerPage({ state, dispatch, role }) {
  const [query, setQuery] = useState("");
  const [assignFor, setAssignFor] = useState(null);
  const manage = canAssignLeads(role);

  const visible = state.leads.filter((l) =>
    [l.id, l.name, l.company, l.owner].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase())
  );

  const nameOf = (uid) => state.employees.find((e) => e.id === uid)?.name || uid || "—";
  const initialsOf = (uid) => state.employees.find((e) => e.id === uid)?.initials || "?";

  // Per-employee SLA performance — one bar chart entry per owner with at least one assigned lead.
  const perOwner = {};
  for (const l of state.leads) {
    if (!l.owner || !l.assignedAt) continue;
    perOwner[l.owner] = perOwner[l.owner] || { total: 0, violated: 0 };
    perOwner[l.owner].total++;
    if (slaState(l).label === "Violated" || slaState(l).label === "Overdue") perOwner[l.owner].violated++;
  }
  const perfData = Object.entries(perOwner).map(([uid, v]) => ({
    label: nameOf(uid),
    value: v.total - v.violated,
    color: "var(--success)",
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ position: "relative", maxWidth: 280 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 9, color: "var(--ink-soft)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads"
            style={{ width: "100%", border: "1px solid var(--hair)", borderRadius: 8, padding: "7px 12px 7px 34px", fontSize: 13, background: "var(--surface)" }} />
        </div>
      </div>

      {perfData.length > 0 && (
        <div className="agw-card" style={{ marginBottom: 14 }}>
          <strong style={{ fontSize: 13 }}>SLA performance — leads met on time (per employee)</strong>
          <div style={{ marginTop: 12 }}><BarChart data={perfData} /></div>
        </div>
      )}

      <div className="agw-card" style={{ padding: 0 }}>
        {visible.length === 0 ? <Empty icon={UserCog} text="No leads yet." /> : (
          <div style={{ overflowX: "auto" }}>
            <table className="agw-table" style={{ minWidth: 900 }}>
              <thead><tr><th>Lead</th><th>Company</th><th>Owner</th><th>Status</th><th>Assigned at</th><th>Follow-up due by</th><th>SLA</th><th></th></tr></thead>
              <tbody>
                {visible.map((l) => {
                  const sla = slaState(l);
                  const overdue = sla.label === "Violated" || sla.label === "Overdue";
                  return (
                    <tr key={l.id} style={overdue ? { background: "var(--danger-tint)" } : undefined}>
                      <td>{l.name}<div className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>{l.id}</div></td>
                      <td>{l.company}</td>
                      <td>{l.owner ? <><span className="avatar">{initialsOf(l.owner)}</span> {nameOf(l.owner)}</> : "Unassigned"}</td>
                      <td>{l.status}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{l.assignedAt ? fmtDate(l.assignedAt) : "—"}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{l.slaDueAt ? fmtDate(l.slaDueAt) : "—"}</td>
                      <td><Stamp tone={sla.tone}>{sla.label}</Stamp></td>
                      <td>{manage && <button className="btn btn-sm" onClick={() => setAssignFor(l)}>{l.owner ? "Reassign" : "Assign"}</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {assignFor && <AssignLeadModal lead={assignFor} employees={state.employees} dispatch={dispatch} onClose={() => setAssignFor(null)} />}
    </div>
  );
}

function AssignLeadModal({ lead, employees, dispatch, onClose }) {
  const [userId, setUserId] = useState(lead.owner || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeEmployees = employees.filter((e) => e.active !== false);

  const submit = async () => {
    setSaving(true); setError("");
    try {
      await dispatch({ type: "ASSIGN_LEAD", id: lead.id, userId });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't assign — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Assign ${lead.id}`} sub={`${lead.name} — ${lead.company}`} onClose={onClose}>
      <div className="field">
        <label>Assign to</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Select an employee…</option>
          {activeEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="side-note">First follow-up is due within 5 minutes during office hours (9:00 AM–5:00 PM, Sun–Thu Qatar time), or by 9:00 AM the next working day otherwise.</div>
      {error && <div className="side-note" style={{ borderColor: "#EFC3BC", background: "var(--danger-tint)" }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!userId || saving} onClick={submit}>{lead.owner ? "Reassign" : "Assign"}</button>
      </div>
    </Modal>
  );
}
