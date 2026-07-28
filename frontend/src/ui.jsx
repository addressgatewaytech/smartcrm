// Shared UI primitives used across App.jsx and the page-level modules under ./pages/*.
// Extracted from App.jsx so new pages don't duplicate this code inline.
import { X, Pencil, Trash2 } from "lucide-react";

export const money = (n) => "QAR " + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

// new Date(null) resolves to the 1970 epoch instead of "Invalid Date" — every call site across
// the app assumed a date field would always be set, so this silently printed "01 Jan 1970" the
// first time a genuinely-null one showed up (imported historical job cards with no target date).
export const fmtDate = (s) => s ? new Date(s).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";

export function Stamp({ children, tone = "neutral" }) {
  return <span className={`stamp stamp-${tone}`}><span className="ring" />{children}</span>;
}

export function statusTone(status) {
  const map = {
    New: "info", Contacted: "info", "Follow-up Scheduled": "warning", Interested: "gold", "Not Interested": "danger", Qualified: "success", Unqualified: "neutral", Converted: "success",
    Open: "info", "Quotation Sent": "gold", Won: "success", Lost: "danger",
    Draft: "neutral", "Pending Manager Approval": "warning", Sent: "info",
    "Under Negotiation": "warning", Approved: "success", Expired: "danger", Rejected: "danger",
    Confirmed: "info", Invoiced: "gold", "Client Onboarded": "success",
    "Partially Paid": "warning", Paid: "success", Overdue: "danger",
    Created: "neutral", "Pending Approval": "warning", Assigned: "info", "In Progress": "gold", "On Hold": "warning",
    Completed: "success", Cancelled: "danger",
    "Converted to Lead": "success", Archived: "neutral",
  };
  return map[status] || "neutral";
}

export function Rail({ steps, current }) {
  const idx = steps.indexOf(current);
  return (
    <div className="rail">
      {steps.map((step, i) => (
        <div className="rail-step" key={step}>
          <span className={`rail-dot ${i < idx ? "done" : i === idx ? "now" : ""}`} />
          <span className={`rail-label ${i < idx ? "done" : i === idx ? "now" : ""}`}>{step}</span>
          {i < steps.length - 1 && <span className={`rail-line ${i < idx ? "done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* LIGHTWEIGHT SVG CHARTS (no charting library — keeps the bundle small)   */
/* ---------------------------------------------------------------------- */

// data: [{ label, value, color }]. Renders a ring chart with a center total and a legend list.
export function DonutChart({ data, size = 160, centerLabel }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = size / 2;
  const stroke = size * 0.22;
  const radius = r - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
        <circle cx={r} cy={r} r={radius} fill="none" stroke="var(--hair)" strokeWidth={stroke} />
        {total > 0 && data.filter(d => d.value > 0).map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circumference;
          const el = (
            <circle key={i} cx={r} cy={r} r={radius} fill="none" stroke={d.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${r} ${r})`} strokeLinecap="butt" />
          );
          offset += dash;
          return el;
        })}
        <text x={r} y={r - 4} textAnchor="middle" className="disp" style={{ fontSize: size*0.17, fill:"var(--ink)" }}>{total}</text>
        {centerLabel && <text x={r} y={r + 16} textAnchor="middle" style={{ fontSize: size*0.075, fill:"var(--ink-soft)" }}>{centerLabel}</text>}
      </svg>
      <div style={{ display:"flex", flexDirection:"column", gap:7, minWidth:130 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5 }}>
            <span style={{ width:9, height:9, borderRadius:"50%", background:d.color, flexShrink:0 }} />
            <span style={{ flex:1, color:"var(--ink-soft)" }}>{d.label}</span>
            <span style={{ fontWeight:600 }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// series: [{ label, points: number[], color }], labels: string[] (x-axis, same length as points).
export function LineChart({ series, labels, height = 200, formatY = (n) => n }) {
  const width = 560;
  const padL = 42, padB = 26, padT = 14, padR = 10;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const allValues = series.flatMap(s => s.points);
  const maxV = Math.max(1, ...allValues);
  const stepX = labels.length > 1 ? innerW / (labels.length - 1) : 0;
  const x = (i) => padL + i * stepX;
  const y = (v) => padT + innerH - (v / maxV) * innerH;
  const gridLines = 4;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width:"100%", height:"auto" }}>
      {Array.from({ length: gridLines + 1 }).map((_, i) => {
        const gy = padT + (innerH / gridLines) * i;
        const val = Math.round(maxV - (maxV / gridLines) * i);
        return (
          <g key={i}>
            <line x1={padL} y1={gy} x2={width - padR} y2={gy} stroke="var(--hair)" strokeWidth={1} />
            <text x={padL - 8} y={gy + 3} textAnchor="end" style={{ fontSize:9.5, fill:"var(--ink-soft)" }}>{formatY(val)}</text>
          </g>
        );
      })}
      {labels.map((l, i) => (
        (labels.length <= 8 || i % Math.ceil(labels.length / 8) === 0) &&
        <text key={i} x={x(i)} y={height - 6} textAnchor="middle" style={{ fontSize:9.5, fill:"var(--ink-soft)" }}>{l}</text>
      ))}
      {series.map((s, si) => {
        const path = s.points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
        return (
          <g key={si}>
            <path d={path} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />)}
          </g>
        );
      })}
    </svg>
  );
}

// data: [{ label, value, color }]. Horizontal bars, sorted as given.
export function BarChart({ data, height = 22 }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}>
            <span style={{ color:"var(--ink-soft)" }}>{d.label}</span>
            <span style={{ fontWeight:600 }}>{d.value}</span>
          </div>
          <div style={{ background:"var(--page)", borderRadius:4, height, overflow:"hidden" }}>
            <div style={{ width:`${(d.value/max)*100}%`, height:"100%", background:d.color, borderRadius:4, transition:"width .3s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Per-salesperson breakdown for the Dashboard Charts tab — three proportional bars (leads/deals/
// quotations, all on the same 0..max scale so they're comparable at a glance) plus collected vs.
// pending payment figures underneath. Used both for the admin/sales-manager team view (one row per
// salesperson) and for an individual sales_exec's own dashboard (a single row, same layout).
export function SalesPersonBars({ rows }) {
  const max = Math.max(1, ...rows.flatMap(r => [r.leadsCount, r.dealsCount, r.quotesCount]));
  const metrics = [
    { key: "leadsCount", label: "Leads", color: "var(--info)" },
    { key: "dealsCount", label: "Deals", color: "var(--gold)" },
    { key: "quotesCount", label: "Quotations", color: "var(--success)" },
  ];
  return (
    <div>
      <div style={{ display:"flex", gap:14, fontSize:11, color:"var(--ink-soft)", marginBottom:14 }}>
        {metrics.map(m => (
          <span key={m.key}><span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:m.color, marginRight:4 }}/>{m.label}</span>
        ))}
      </div>
      {rows.map(r => (
        <div key={r.owner.id} style={{ marginBottom: 16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
            <span style={{ fontSize:13, fontWeight:500, display:"flex", alignItems:"center", gap:6 }}>
              <span className="avatar">{r.owner.initials}</span>{r.owner.name}
            </span>
            <span style={{ fontSize:11.5, color:"var(--ink-soft)" }}>
              <span style={{ color:"var(--success)" }}>{money(r.collected)} collected</span>
              {r.pendingCollection > 0 && <span style={{ color:"var(--danger)", marginLeft:8 }}>{money(r.pendingCollection)} pending</span>}
            </span>
          </div>
          {metrics.map(m => (
            <div key={m.key} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
              <div style={{ flex:1, height:6, background:"var(--page)", borderRadius:3, overflow:"hidden" }}>
                <div style={{ width:`${(r[m.key]/max)*100}%`, height:"100%", background:m.color, borderRadius:3, transition:"width .3s" }} />
              </div>
              <span style={{ fontSize:11, color:"var(--ink-soft)", width:16, textAlign:"right" }}>{r[m.key]}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, sub, onClose, children, width }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3>{title}</h3>
            {sub && <p className="modal-sub">{sub}</p>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, text }) {
  return <div className="empty"><Icon size={30} /><div>{text}</div></div>;
}

export function ConfirmModal({ title, body, confirmLabel = "Remove", onConfirm, onClose }) {
  return (
    <Modal title={title} sub={body} onClose={onClose}>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 4 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ background:"var(--danger)", borderColor:"var(--danger)" }}
          onClick={()=>{ onConfirm(); onClose(); }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function RowActions({ onEdit, onRemove }) {
  return (
    <span style={{ display:"inline-flex", gap:2 }} onClick={e=>e.stopPropagation()}>
      {onEdit && <button className="btn btn-sm btn-ghost" title="Edit" onClick={onEdit}><Pencil size={13}/></button>}
      {onRemove && <button className="btn btn-sm btn-ghost" title="Remove" style={{ color:"var(--danger)" }} onClick={onRemove}><Trash2 size={13}/></button>}
    </span>
  );
}

export function exportCSV(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
