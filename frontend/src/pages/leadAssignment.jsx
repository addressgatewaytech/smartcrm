// Lead Assignment Manager — the Lead Manager's own intake + distribution queue, separate from a
// sales rep's personal pipeline on the regular Leads page. Only shows leads the Lead Manager (or
// an admin) actually brought in for central distribution — a rep's self-added lead is their own
// from the moment it's created and never appears here. Also monitors the 5-minute (office-hours) /
// next-working-day first-follow-up SLA on those distributed leads. SLA state is derived client-side
// from the same fields the backend cron sweep uses (assignedAt/slaDueAt/slaViolated/followUps), so
// the badge here always mirrors what the notification the owner already received said.
import { useState } from "react";
import { Search, UserCog, Plus } from "lucide-react";
import { ApiError } from "../api";
import { Modal, Stamp, Empty, BarChart, fmtDate } from "../ui.jsx";

const ADMIN_LIKE = ["super_admin", "admin", "admin_exec"];
// Matches the backend's canDistributeLeads exactly — only Lead Manager (or admin-tier, as
// everywhere else in this app) brings in and distributes leads. Sales Manager can still see this
// page (nav visibility) but no longer creates or assigns leads from it.
const canDistributeLeads = (role) => ADMIN_LIKE.includes(role) || role === "lead_manager";
const SOURCES = ["Website", "Referral", "Walk-in", "Campaign", "Other"];

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
  const [newLead, setNewLead] = useState(false);
  const manage = canDistributeLeads(role);

  // A lead belongs in this queue only if it's actually part of the central-distribution flow:
  // still unassigned (brought in, awaiting a decision) or already handed off to someone by a
  // distributor (assignedAt set). A rep's own self-added lead is owned from creation and never
  // gets assignedAt, so it's naturally excluded — same for every pre-existing lead.
  const distributedLeads = state.leads.filter((l) => !l.owner || l.assignedAt);

  const visible = distributedLeads.filter((l) =>
    [l.id, l.name, l.company, l.owner].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase())
  );

  const nameOf = (uid) => state.employees.find((e) => e.id === uid)?.name || uid || "—";
  const initialsOf = (uid) => state.employees.find((e) => e.id === uid)?.initials || "?";

  // Per-employee SLA performance — counts only leads actually confirmed "Met" (a follow-up was
  // logged within the SLA window). A lead that's merely still "Pending" (not yet due, or due but
  // not yet swept as violated) hasn't succeeded at anything yet, so it must NOT count as met —
  // that was the bug: a freshly assigned lead showed up as a green "met" bar before any follow-up
  // had happened at all.
  const perOwner = {};
  for (const l of distributedLeads) {
    if (!l.owner || !l.assignedAt) continue;
    perOwner[l.owner] = perOwner[l.owner] || { met: 0 };
    if (slaState(l).label === "Met") perOwner[l.owner].met++;
  }
  const perfData = Object.entries(perOwner).map(([uid, v]) => ({
    label: nameOf(uid),
    value: v.met,
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
        {manage && <button className="btn btn-primary" onClick={() => setNewLead(true)}><Plus size={15} /> Add lead</button>}
      </div>

      {perfData.length > 0 && (
        <div className="agw-card" style={{ marginBottom: 14 }}>
          <strong style={{ fontSize: 13 }}>SLA performance — leads met on time (per employee)</strong>
          <div style={{ marginTop: 12 }}><BarChart data={perfData} /></div>
        </div>
      )}

      <div className="agw-card" style={{ padding: 0 }}>
        {visible.length === 0 ? <Empty icon={UserCog} text="No leads to distribute yet — add one to get started." /> : (
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
      {newLead && <NewDistributedLeadModal state={state} dispatch={dispatch} onClose={() => setNewLead(false)} />}
    </div>
  );
}

// Deliberately has no "owner" field — leaving it unset is what tells the backend this lead should
// land unassigned in the distribution queue instead of self-owned, since the creator here always
// has Lead Manager/admin permissions (see canDistributeLeads on the server).
function NewDistributedLeadModal({ state, dispatch, onClose }) {
  const [form, setForm] = useState({ name: "", company: "", phone: "", email: "", reference: "", source: "Referral", service: state.services[0] || "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    setSaving(true); setError("");
    try {
      await dispatch({ type: "ADD_LEAD", payload: form });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add the lead — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add lead" sub="Brings in a company lead for distribution — it stays unassigned until you assign it to someone." onClose={onClose} width={520}>
      <div className="row2">
        <div className="field"><label>Name</label><input value={form.name} onChange={set("name")} /></div>
        <div className="field"><label>Company</label><input value={form.company} onChange={set("company")} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Phone</label><input value={form.phone} onChange={set("phone")} /></div>
        <div className="field"><label>Email</label><input value={form.email} onChange={set("email")} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Source</label>
          <select value={form.source} onChange={set("source")}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="field"><label>Reference</label><input value={form.reference} onChange={set("reference")} placeholder="e.g. referred by..." /></div>
      </div>
      <div className="field"><label>Service</label>
        <select value={form.service} onChange={set("service")}>{state.services.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      {error && <div className="side-note" style={{ borderColor: "#EFC3BC", background: "var(--danger-tint)" }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!form.name.trim() || !form.company.trim() || saving} onClick={submit}>Add lead</button>
      </div>
    </Modal>
  );
}

function AssignLeadModal({ lead, employees, dispatch, onClose }) {
  const [userId, setUserId] = useState(lead.owner || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeEmployees = employees.filter((e) => e.active !== false && e.category !== "Management");

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
