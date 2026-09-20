// Data Manager > Bulk Email. Upload a name + email list, write a Subject/Email body, and the server
// sends one personalised email at a time with a random wait between each (routes/emailCampaigns
// .routes.js + services/emailCampaignWorker.js). Campaign state lives on the server — closing this
// page never stops a running campaign; this screen only starts, pauses and watches it.
import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Play, Pause, Trash2, Mail, Send, RotateCcw, Pencil, Eye, AlertTriangle } from "lucide-react";
import { api, ApiError } from "../api";
import { Modal, ConfirmModal, Stamp, Empty, usePagination, PaginationBar } from "../ui.jsx";

const STATUS_TONE = { Draft: "neutral", Running: "success", Paused: "warning", Completed: "info" };
const RECIPIENT_TONE = { Pending: "neutral", Sending: "info", Sent: "success", Failed: "danger" };
const errMsg = (err, fallback) => (err instanceof ApiError ? err.message : fallback);

const fmtDuration = (seconds) => {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  const m = seconds / 60;
  if (m < 90) return `${Math.round(m)} minutes`;
  const h = m / 60;
  if (h < 36) return `${h.toFixed(1).replace(/\.0$/, "")} hours`;
  return `${Math.round(h / 24)} days`;
};
// Same {{name}} / {{ Name }} rule the server applies — used only for the on-screen preview.
const fillPreview = (str, vars) => String(str || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, k) => (vars[k.toLowerCase()] === undefined ? whole : vars[k.toLowerCase()]));

function estimateText(c) {
  const avg = (c.minIntervalSeconds + c.maxIntervalSeconds) / 2;
  const days = Math.ceil(c.pending / c.dailyLimit);
  if (days > 1) return `about ${days} days, at most ${c.dailyLimit} a day`;
  return `about ${fmtDuration(Math.max(0, c.pending - 1) * avg)}`;
}

function nextInfo(c) {
  if (c.status !== "Running") return null;
  if (c.sentToday >= c.dailyLimit) return "Daily limit reached — continues tomorrow";
  if (c.nextInSeconds === null) return "Sending…";
  return c.nextInSeconds <= 1 ? "Sending now…" : `Next email in ${fmtDuration(c.nextInSeconds)}`;
}

function Progress({ c }) {
  const pct = (n) => (c.total ? (n / c.total) * 100 : 0);
  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ height: 6, background: "var(--hair)", borderRadius: 3, overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${pct(c.sent)}%`, background: "var(--success)" }} />
        <div style={{ width: `${pct(c.failed)}%`, background: "var(--danger)" }} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
        {c.sent} sent · {c.failed} failed · {c.pending} left <span style={{ opacity: 0.7 }}>of {c.total}</span>
      </div>
    </div>
  );
}

function PlaceholderHelp() {
  return (
    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
      Use <code>{"{{name}}"}</code> for each person's name (becomes "Sir/Madam" if the list has no name) and <code>{"{{email}}"}</code> for their address.
    </div>
  );
}

// One real email to whoever is logged in — so the wording can be checked in a real inbox before it
// goes to a whole list.
function TestEmailButton({ subject, body }) {
  const [state, setState] = useState({ busy: false, msg: "", ok: true });
  const send = async () => {
    setState({ busy: true, msg: "", ok: true });
    try {
      const r = await api.dataManager.sendTestEmail(subject, body);
      setState({ busy: false, ok: true, msg: `Test sent to ${r.to}` });
    } catch (err) {
      setState({ busy: false, ok: false, msg: errMsg(err, "Couldn't send the test email") });
    }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm" disabled={state.busy || !subject.trim() || !body.trim()} onClick={send}>
        <Send size={13} /> {state.busy ? "Sending…" : "Send test to me"}
      </button>
      {state.msg && <span style={{ fontSize: 12, color: state.ok ? "var(--success)" : "var(--danger)" }}>{state.msg}</span>}
    </span>
  );
}

// --- Data Manager > Templates card -----------------------------------------------------------
export function BulkEmailTemplateCard() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });
  useEffect(() => {
    api.dataManager.bulkEmailTemplate().then((t) => { setSubject(t.subject); setBody(t.body); }).catch(() => {});
  }, []);
  const save = async () => {
    setSaving(true);
    setMsg({ text: "", ok: true });
    try {
      await api.dataManager.saveBulkEmailTemplate(subject, body);
      setMsg({ text: "Saved", ok: true });
    } catch (err) {
      setMsg({ text: errMsg(err, "Couldn't save"), ok: false });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="agw-card" style={{ gridColumn: "1 / -1" }}>
      <strong style={{ fontSize: 14 }}>Bulk email template</strong>
      <p className="modal-sub" style={{ marginTop: 2 }}>The Subject and Email body every new Bulk Email campaign starts from. Separate from the default template above, which is only for emailing one record at a time.</p>
      <div className="field" style={{ marginTop: 10 }}><label>Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Business setup support for your company, {{name}}" /></div>
      <div className="field" style={{ marginBottom: 6 }}><label>Email body</label><textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <PlaceholderHelp />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={saving || !subject.trim() || !body.trim()} onClick={save}>{saving ? "Saving…" : "Save bulk email template"}</button>
        <TestEmailButton subject={subject} body={body} />
        {msg.text && <span style={{ fontSize: 12.5, color: msg.ok ? "var(--success)" : "var(--danger)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}

// --- New campaign ---------------------------------------------------------------------------
function NewCampaignModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [minSeconds, setMinSeconds] = useState(60);
  const [maxSeconds, setMaxSeconds] = useState(180);
  const [dailyLimit, setDailyLimit] = useState(100);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bodyRef = useRef(null);

  // Starts from the saved bulk template, but only fills fields the user hasn't already typed into.
  useEffect(() => {
    api.dataManager.bulkEmailTemplate().then((t) => { setSubject((s) => s || t.subject); setBody((b) => b || t.body); }).catch(() => {});
  }, []);

  const insertAtCursor = (token) => {
    const el = bodyRef.current;
    if (!el) { setBody((b) => b + token); return; }
    const s = el.selectionStart, e = el.selectionEnd;
    setBody(body.slice(0, s) + token + body.slice(e));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length; });
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("subject", subject);
      fd.append("body", body);
      fd.append("minSeconds", String(minSeconds));
      fd.append("maxSeconds", String(maxSeconds));
      fd.append("dailyLimit", String(dailyLimit));
      fd.append("file", file);
      onCreated(await api.dataManager.createCampaign(fd));
      onClose();
    } catch (err) {
      setError(errMsg(err, "Couldn't create the campaign — please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New email campaign" sub="Nothing is sent until you press Start on the campaign afterwards." onClose={onClose} width={680}>
      <div className="row2">
        <div className="field"><label>Campaign name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trade fair contacts — Sept" autoFocus /></div>
        <div className="field"><label>Email list (CSV or Excel)</label><input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-6px 0 12px" }}>
        One row per person, with an <strong>Email</strong> column and (optionally) a <strong>Name</strong> column. Repeated addresses and rows without a valid email are skipped automatically.
      </div>

      <div className="field"><label>Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 4 }}>
        <label>Email body</label>
        <textarea ref={bodyRef} rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => insertAtCursor("{{name}}")}>Insert {"{{name}}"}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => insertAtCursor("{{email}}")}>Insert {"{{email}}"}</button>
      </div>
      <PlaceholderHelp />

      <div className="row3" style={{ marginTop: 14 }}>
        <div className="field"><label>Shortest wait (seconds)</label><input type="number" min={10} value={minSeconds} onChange={(e) => setMinSeconds(Number(e.target.value))} /></div>
        <div className="field"><label>Longest wait (seconds)</label><input type="number" min={10} value={maxSeconds} onChange={(e) => setMaxSeconds(Number(e.target.value))} /></div>
        <div className="field"><label>Max emails per day</label><input type="number" min={1} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} /></div>
      </div>
      <div className="side-note" style={{ marginTop: 0 }}>
        Each email goes out after a random wait between the shortest and longest above. Shared mail servers cap how many emails an account can send per hour and per day, and a steady, slow pace also keeps you out of spam folders — so keep these conservative.
      </div>

      {error && <div className="side-note" style={{ color: "var(--danger)" }}><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{error}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <TestEmailButton subject={subject} body={body} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || !name.trim() || !file || !subject.trim() || !body.trim()} onClick={submit}>{saving ? "Reading list…" : "Create campaign"}</button>
        </div>
      </div>
    </Modal>
  );
}

// Start is a normal confirmation, not a destructive one — ConfirmModal's red button would read wrong here.
function StartConfirmModal({ campaign: c, onConfirm, onClose }) {
  return (
    <Modal title={`Start "${c.name}"?`} onClose={onClose} width={480}>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
        <strong>{c.pending}</strong> email{c.pending === 1 ? "" : "s"} will go out one at a time, waiting <strong>{c.minIntervalSeconds}–{c.maxIntervalSeconds} seconds</strong> between each — {estimateText(c)}.
        The first one is sent right away. You can pause at any time, and it keeps running even if you close this page.
      </p>
      <div className="side-note" style={{ marginTop: 0 }}>Sent emails can't be recalled. Use "Send test to me" first if you haven't checked the wording.</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { onConfirm(); onClose(); }}><Play size={14} /> Start sending</button>
      </div>
    </Modal>
  );
}

// --- Campaign detail ------------------------------------------------------------------------
// `version` changes whenever the list sees this campaign's status/counts change (e.g. Start pressed
// from the confirmation dialog, which lives in the parent) — so this window reloads instead of
// showing a stale "Paused" until its own next refresh.
function CampaignDetailModal({ campaignId, version, onClose, onStart, onPause, onChanged }) {
  const [c, setC] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [camp, recs] = await Promise.all([api.dataManager.campaign(campaignId), api.dataManager.campaignRecipients(campaignId)]);
    setC(camp);
    setRecipients(recs);
  }, [campaignId]);
  useEffect(() => { load().catch((e) => setError(errMsg(e, "Couldn't load this campaign"))); }, [load, version]);
  // Live progress while it's sending — but no polling at all once it's stopped.
  const running = c?.status === "Running";
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => load().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [running, load]);

  const shown = recipients.filter((r) => filter === "all" || (filter === "pending" ? ["Pending", "Sending"].includes(r.status) : r.status.toLowerCase() === filter));
  const pg = usePagination(shown);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try { await fn(); await load(); onChanged(); } catch (err) { setError(errMsg(err, "That didn't work — please try again.")); } finally { setBusy(false); }
  };
  const startEdit = () => { setForm({ name: c.name, subject: c.subject, body: c.body, minSeconds: c.minIntervalSeconds, maxSeconds: c.maxIntervalSeconds, dailyLimit: c.dailyLimit }); setEditing(true); };
  const saveEdit = () => run(async () => { await api.dataManager.updateCampaign(c.id, form); setEditing(false); });

  if (!c) return <Modal title="Campaign" onClose={onClose}>{error ? <div className="side-note" style={{ color: "var(--danger)" }}>{error}</div> : "Loading…"}</Modal>;

  const canEdit = ["Draft", "Paused"].includes(c.status);
  const sample = recipients[0];
  const vars = { name: sample?.name || "Sir/Madam", email: sample?.email || "name@example.com" };
  const info = nextInfo(c);

  return (
    <Modal title={c.name} sub={`Campaign ${c.id}`} onClose={onClose} width={860}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Stamp tone={STATUS_TONE[c.status]}>{c.status}</Stamp>
          {info && <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{info}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && !editing && <button className="btn btn-sm" onClick={startEdit}><Pencil size={13} /> Edit message & pace</button>}
          {c.failed > 0 && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.dataManager.retryFailedCampaign(c.id))}><RotateCcw size={13} /> Retry {c.failed} failed</button>}
          {c.status === "Running" && <button className="btn btn-sm" disabled={busy} onClick={() => onPause(c)}><Pause size={13} /> Pause</button>}
          {canEdit && c.pending > 0 && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => onStart(c)}><Play size={13} /> {c.status === "Paused" ? "Resume" : "Start"}</button>}
        </div>
      </div>

      {c.lastError && <div className="side-note" style={{ color: "var(--danger)", marginTop: 0 }}><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{c.lastError}</div>}
      {error && <div className="side-note" style={{ color: "var(--danger)", marginTop: 0 }}><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{error}</div>}

      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 14 }}>
        <div className="agw-card"><div className="kpi-label">Recipients</div><div className="kpi-value disp">{c.total}</div></div>
        <div className="agw-card"><div className="kpi-label">Sent</div><div className="kpi-value disp" style={{ color: "var(--success)" }}>{c.sent}</div></div>
        <div className="agw-card"><div className="kpi-label">Failed</div><div className="kpi-value disp" style={{ color: c.failed ? "var(--danger)" : undefined }}>{c.failed}</div></div>
        <div className="agw-card"><div className="kpi-label">Left to send</div><div className="kpi-value disp">{c.pending}</div></div>
      </div>

      {editing ? (
        <div className="agw-card" style={{ marginBottom: 14 }}>
          <div className="field"><label>Campaign name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Subject</label><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div className="field"><label>Email body</label><textarea rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          <PlaceholderHelp />
          <div className="row3" style={{ marginTop: 10 }}>
            <div className="field"><label>Shortest wait (seconds)</label><input type="number" min={10} value={form.minSeconds} onChange={(e) => setForm({ ...form, minSeconds: Number(e.target.value) })} /></div>
            <div className="field"><label>Longest wait (seconds)</label><input type="number" min={10} value={form.maxSeconds} onChange={(e) => setForm({ ...form, maxSeconds: Number(e.target.value) })} /></div>
            <div className="field"><label>Max emails per day</label><input type="number" min={1} value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} /></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <TestEmailButton subject={form.subject} body={form.body} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="agw-card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong style={{ fontSize: 13 }}><Eye size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Preview — as {sample ? sample.email : "a recipient"} would see it</strong>
            <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Waits {c.minIntervalSeconds}–{c.maxIntervalSeconds}s between emails · up to {c.dailyLimit}/day</span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 8 }}>{fillPreview(c.subject, vars)}</div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.55 }}>{fillPreview(c.body, vars)}</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>Recipients</strong>
        <div className="tabbar" style={{ marginBottom: 0, borderBottom: "none" }}>
          {[["all", "All"], ["sent", "Sent"], ["failed", "Failed"], ["pending", "Pending"]].map(([k, l]) => (
            <button key={k} className={`tab ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="agw-card" style={{ padding: 0 }}>
        {shown.length === 0 ? <Empty icon={Mail} text="Nothing to show for this filter." /> : (
          <div style={{ overflowX: "auto" }}>
            <table className="agw-table">
              <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Status</th><th>Sent at</th></tr></thead>
              <tbody>
                {pg.pageRows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>{pg.start + i + 1}</td>
                    <td>{r.name || <span style={{ color: "var(--ink-soft)" }}>—</span>}</td>
                    <td style={{ fontSize: 12.5 }}>{r.email}</td>
                    <td>
                      <Stamp tone={RECIPIENT_TONE[r.status]}>{r.status}</Stamp>
                      {r.error && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 2 }}>{r.error}</div>}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.sentAt ? String(r.sentAt).slice(0, 16).replace("T", " ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar {...pg} />
      </div>
    </Modal>
  );
}

// --- Tab -------------------------------------------------------------------------------------
export function EmailCampaignsTab() {
  const [campaigns, setCampaigns] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [confirmStart, setConfirmStart] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const runningRef = useRef(false);

  const load = useCallback(async () => {
    try { setCampaigns(await api.dataManager.campaigns()); setError(""); } catch (err) { setError(errMsg(err, "Couldn't load campaigns")); setCampaigns((c) => c || []); }
  }, []);
  useEffect(() => { load(); }, [load]);
  runningRef.current = !!campaigns?.some((c) => c.status === "Running");
  // Refresh progress while something is actually sending; a stopped list needs no polling.
  useEffect(() => {
    const t = setInterval(() => { if (runningRef.current) load(); }, 8000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (c, fn) => {
    setError("");
    setBusyId(c.id);
    try { await fn(); await load(); } catch (err) { setError(errMsg(err, "That didn't work — please try again.")); } finally { setBusyId(null); }
  };
  const start = (c) => act(c, () => api.dataManager.startCampaign(c.id));
  const pause = (c) => act(c, () => api.dataManager.pauseCampaign(c.id));
  const remove = (c) => act(c, () => api.dataManager.removeCampaign(c.id));

  const created = (r) => {
    const skipped = [r.duplicates ? `${r.duplicates} repeated` : "", r.invalid ? `${r.invalid} without a valid email` : ""].filter(Boolean).join(" and ");
    setNotice(`Campaign created with ${r.imported} recipient${r.imported === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}. Open it to check the list, then press Start when you're ready.`);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div className="side-note" style={{ margin: 0, flex: 1, minWidth: 260 }}>
          <Mail size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Upload a list of names and emails and the server sends them one at a time from the company mail account, waiting a random interval between each. It keeps going even if you close this page.
        </div>
        <button className="btn btn-primary" onClick={() => { setNotice(""); setShowNew(true); }}><Plus size={15} /> New campaign</button>
      </div>

      {notice && <div className="side-note" style={{ marginTop: 0, color: "var(--success)" }}>{notice}</div>}
      {error && <div className="side-note" style={{ marginTop: 0, color: "var(--danger)" }}><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{error}</div>}

      <div className="agw-card" style={{ padding: 0 }}>
        {campaigns === null ? <div style={{ padding: 18, color: "var(--ink-soft)" }}>Loading…</div>
          : campaigns.length === 0 ? <Empty icon={Mail} text="No email campaigns yet — create one to send a list of emails at random intervals." />
          : (
            <div style={{ overflowX: "auto" }}>
              <table className="agw-table" style={{ minWidth: 820 }}>
                <thead><tr><th>#</th><th>Campaign</th><th>Status</th><th>Progress</th><th>Pace</th><th></th></tr></thead>
                <tbody>
                  {campaigns.map((c, i) => {
                    const info = nextInfo(c);
                    return (
                      <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setOpenId(c.id)}>
                        <td className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>{i + 1}</td>
                        <td>{c.name}<div style={{ fontSize: 11.5, color: "var(--ink-soft)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</div></td>
                        <td>
                          <Stamp tone={STATUS_TONE[c.status]}>{c.status}</Stamp>
                          {info && <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 3 }}>{info}</div>}
                          {c.status === "Paused" && c.lastError && <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 3, maxWidth: 240 }}>{c.lastError}</div>}
                        </td>
                        <td><Progress c={c} /></td>
                        <td style={{ fontSize: 12, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{c.minIntervalSeconds}–{c.maxIntervalSeconds}s<div>max {c.dailyLimit}/day</div></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span style={{ display: "inline-flex", gap: 4 }}>
                            {["Draft", "Paused"].includes(c.status) && c.pending > 0 && (
                              <button className="btn btn-sm btn-primary" disabled={busyId === c.id} onClick={() => setConfirmStart(c)}><Play size={13} /> {c.status === "Paused" ? "Resume" : "Start"}</button>
                            )}
                            {c.status === "Running" && <button className="btn btn-sm" disabled={busyId === c.id} onClick={() => pause(c)}><Pause size={13} /> Pause</button>}
                            <button className="btn btn-sm btn-ghost" title={c.status === "Running" ? "Pause it before deleting" : "Delete"} disabled={c.status === "Running"} style={{ color: "var(--danger)" }} onClick={() => setRemoving(c)}><Trash2 size={13} /></button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} onCreated={created} />}
      {openId && <CampaignDetailModal campaignId={openId} version={(() => { const o = campaigns?.find((x) => x.id === openId); return o ? `${o.status}:${o.sent}:${o.failed}:${o.pending}` : ""; })()} onClose={() => setOpenId(null)} onStart={setConfirmStart} onPause={pause} onChanged={load} />}
      {confirmStart && <StartConfirmModal campaign={confirmStart} onConfirm={() => start(confirmStart)} onClose={() => setConfirmStart(null)} />}
      {removing && <ConfirmModal title={`Delete "${removing.name}"?`} body={`This removes the campaign and its whole recipient list, including the record of who was already emailed (${removing.sent} sent). This can't be undone.`} confirmLabel="Delete campaign" onConfirm={() => remove(removing)} onClose={() => setRemoving(null)} />}
    </div>
  );
}
