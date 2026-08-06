// Shared UI primitives used across App.jsx and the page-level modules under ./pages/*.
// Extracted from App.jsx so new pages don't duplicate this code inline.
import { useState, useEffect, useCallback, useContext, useRef, createContext } from "react";
import { X, Pencil, Trash2 } from "lucide-react";

// Client-side pagination for a list page's already-filtered `rows` array. Callers slice their
// own render with `pageRows` and drop <PaginationBar {...pagination} /> below the table — every
// list page in the app uses this same pair rather than each rolling its own page-size/prev-next
// state, so behavior (and the row-count reset below) stays identical everywhere.
export function usePagination(rows, defaultPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  // Clamp rather than reset outright — a filter/search narrowing the list shouldn't strand you on
  // a blank "page 5 of 1"; it should just show you the new last page instead.
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const setPageSize = (n) => { setPageSizeRaw(n); setPage(1); };
  return { page: safePage, setPage, pageSize, setPageSize, totalPages, total: rows.length, start, pageRows };
}

export function PaginationBar({ page, setPage, pageSize, setPageSize, totalPages, total, start }) {
  if (total === 0) return null;
  const end = Math.min(start + pageSize, total);
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, padding:"10px 4px 2px" }}>
      <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>{start+1}–{end} of {total}</div>
      <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
        <label style={{ fontSize:12.5, color:"var(--ink-soft)", display:"flex", alignItems:"center", gap:6 }}>
          Rows per page
          <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}
            style={{ fontSize:12.5, border:"1px solid var(--hair)", borderRadius:8, padding:"4px 8px", background:"var(--surface)" }}>
            {[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button className="btn btn-sm" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button>
          <span style={{ fontSize:12.5, color:"var(--ink-soft)" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-sm" disabled={page>=totalPages} onClick={()=>setPage(page+1)}>Next</button>
        </div>
      </div>
    </div>
  );
}

export const money = (n) => "QAR " + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

// new Date(null) resolves to the 1970 epoch instead of "Invalid Date" — every call site across
// the app assumed a date field would always be set, so this silently printed "01 Jan 1970" the
// first time a genuinely-null one showed up (imported historical job cards with no target date).
export const fmtDate = (s) => s ? new Date(s).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";
// Numeric dd/mm/yyyy variant — used for lead follow-up dates specifically, not a replacement for
// fmtDate's "04 Aug 2026" style used everywhere else in the app.
export const fmtDateDMY = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
};

export function Stamp({ children, tone = "neutral" }) {
  return <span className={`stamp stamp-${tone}`}><span className="ring" />{children}</span>;
}

export function statusTone(status) {
  const map = {
    New: "info", Contacted: "info", "Follow-up Scheduled": "warning", Interested: "gold", "Not Interested": "danger", Qualified: "success", Unqualified: "neutral", Converted: "success",
    Open: "info", "Quotation Sent": "gold", Won: "success", Lost: "danger",
    Draft: "neutral", "Pending Manager Approval": "warning", Sent: "info",
    "Under Negotiation": "warning", "Client Accepted": "gold", Approved: "success", Expired: "danger", Rejected: "danger",
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

// App-wide "are you sure" system — one confirm dialog, callable from anywhere as an awaitable
// instead of every button needing its own useState + inline <ConfirmModal/> boilerplate (that
// per-button pattern is still fine and used all over the app; this exists for the places that
// were skipping confirmation altogether because that boilerplate felt like too much for one
// button). Mounted once via <ConfirmProvider> at the app root (see main.jsx); any component below
// it calls `const confirm = useConfirm()` then `if (await confirm({ title, body, confirmLabel }))`.
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null); // { title, body, confirmLabel }
  const resolver = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest(opts);
    });
  }, []);

  const settle = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <ConfirmModal title={request.title} body={request.body} confirmLabel={request.confirmLabel}
          onConfirm={() => settle(true)} onClose={() => settle(false)} />
      )}
    </ConfirmContext.Provider>
  );
}

// Returns an async confirm(opts) -> boolean. Await it and only proceed on true:
//   const confirm = useConfirm();
//   onClick={async () => { if (await confirm({ title: "Cancel this?", body: "..." })) dispatch(...); }}
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm() must be used inside <ConfirmProvider>");
  return confirm;
}

export function RowActions({ onEdit, onRemove }) {
  return (
    <span style={{ display:"inline-flex", gap:2 }} onClick={e=>e.stopPropagation()}>
      {onEdit && <button className="btn btn-sm btn-ghost" title="Edit" onClick={onEdit}><Pencil size={13}/></button>}
      {onRemove && <button className="btn btn-sm btn-ghost" title="Remove" style={{ color:"var(--danger)" }} onClick={onRemove}><Trash2 size={13}/></button>}
    </span>
  );
}

// A pair of small floating "scroll" buttons that appear over any wide table or Kanban board once
// it's actually overflowing horizontally — mounted once at the app shell root (see App.jsx) so
// every list page gets it automatically, with zero per-page wiring. Exists because the native
// horizontal scrollbar on a long list/board is easy to miss: nothing at the top hints that a
// row's action buttons (or a board's later status columns) sit off to the right, so people were
// scrolling all the way down first, just to discover the scrollbar there. Both sides are covered
// — a right button (shown while there's more to reveal) and a left button (shown once scrolled
// away from the start) to jump straight back. Triggered purely by whether something is actually
// overflowing right now, at any window width — not gated to small screens, since a desktop window
// narrow enough (or a table/board with enough columns) can overflow too.
// Deliberately imperative DOM (not React state) — it has to track every table/board on the page,
// including ones inside modals, without any of those call sites knowing this exists.
export function TableScrollHint() {
  useEffect(() => {
    const buttons = new Map(); // scrollable element -> { left, right } floating buttons
    let syncTimer = null;

    // Most tables wrap themselves in an explicit `<div style={{overflowX:"auto"}}>` that becomes
    // the actual scroll container long before `.agw-card` itself ever needs to overflow — a few
    // rely on `.agw-card`'s own overflow-x (from the small-screen CSS) instead. Rather than assume
    // which, walk up from the table to whichever ancestor is actually scrolling right now.
    const findScrollAncestor = (table) => {
      let el = table.parentElement;
      while (el && el !== document.body) {
        if (el.scrollWidth - el.clientWidth > 4) return el;
        el = el.parentElement;
      }
      return null;
    };

    // The fixed topbar (~60px) sits above .agw-content, which is what actually scrolls vertically
    // — so as a long list scrolls down and the table's own top edge rises above the topbar's
    // bottom edge, 8px-from-window-top would place the button (and the visibility sample point)
    // underneath the topbar instead of over the table. Clamping to the topbar's bottom edge is
    // what makes the button follow the list down the page instead of getting stuck there, hidden.
    const minVisibleTop = () => (document.querySelector(".agw-topbar")?.getBoundingClientRect().bottom ?? 0) + 8;

    // A plain viewport-bounds check isn't enough — the table stays in the DOM (and "on screen" by
    // that measure) even while something unrelated is drawn over it, like the mobile nav's "More"
    // sheet or a modal opened from a different part of the page. Sampling what's actually drawn at
    // the middle of the table's visible top edge catches that (deliberately clear of both corner
    // buttons, so neither one ever hides itself by sampling its own pixel).
    const isActuallyVisible = (el, rect, sampleY) => {
      const inBounds = rect.bottom > sampleY - 8 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
      if (!inBounds) return false;
      const visLeft = Math.max(rect.left, 0);
      const visRight = Math.min(rect.right, window.innerWidth);
      const x = (visLeft + visRight) / 2;
      const topEl = document.elementFromPoint(x, sampleY);
      return !!topEl && el.contains(topEl);
    };

    const positionButtons = (el, pair) => {
      const rect = el.getBoundingClientRect();
      const sampleY = Math.max(rect.top, minVisibleTop() - 8) + 8;
      const visible = isActuallyVisible(el, rect, sampleY);
      const top = `${sampleY}px`;

      pair.right.style.top = top;
      pair.right.style.left = `${rect.right - 38}px`;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4;
      pair.right.style.display = visible && !atEnd ? "flex" : "none";

      pair.left.style.top = top;
      pair.left.style.left = `${rect.left + 6}px`;
      const atStart = el.scrollLeft <= 4;
      pair.left.style.display = visible && !atStart ? "flex" : "none";
    };

    const makeButton = (el, direction) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-scroll-hint";
      if (direction === "right") {
        btn.setAttribute("aria-label", "Scroll right for more");
        btn.textContent = "›";
        btn.addEventListener("click", () => {
          el.scrollBy({ left: Math.min(el.clientWidth * 0.7, 240), behavior: "smooth" });
        });
      } else {
        btn.setAttribute("aria-label", "Scroll back to the start");
        btn.textContent = "‹";
        btn.addEventListener("click", () => {
          el.scrollTo({ left: 0, behavior: "smooth" });
        });
      }
      document.body.appendChild(btn);
      return btn;
    };

    const sync = () => {
      // Tables find whichever ancestor is actually scrolling; a Kanban board (.board) is always
      // its own scroll container (overflow-x: auto is unconditional on it), so it needs no walk.
      const scrollables = [...new Set([
        ...Array.from(document.querySelectorAll("table.agw-table")).map(findScrollAncestor).filter(Boolean),
        ...Array.from(document.querySelectorAll(".board")).filter((el) => el.scrollWidth - el.clientWidth > 4),
      ])];

      for (const [el, pair] of buttons) {
        if (!scrollables.includes(el) || !document.body.contains(el)) {
          pair.left.remove();
          pair.right.remove();
          buttons.delete(el);
        }
      }
      for (const el of scrollables) {
        if (buttons.has(el)) { positionButtons(el, buttons.get(el)); continue; }
        const pair = { left: makeButton(el, "left"), right: makeButton(el, "right") };
        buttons.set(el, pair);
        positionButtons(el, pair);
        el.addEventListener("scroll", () => positionButtons(el, pair), { passive: true });
      }
    };

    // A timer (not requestAnimationFrame) — rAF is fully suspended by the browser while the tab is
    // backgrounded/hidden, which would silently stop every re-sync (including the very first one)
    // until the tab regains focus. A short timeout still fires either way.
    const scheduleSync = () => {
      if (syncTimer) return;
      syncTimer = setTimeout(() => { syncTimer = null; sync(); }, 16);
    };

    scheduleSync();
    const mo = new MutationObserver(scheduleSync);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, true);

    return () => {
      mo.disconnect();
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
      if (syncTimer) clearTimeout(syncTimer);
      for (const pair of buttons.values()) { pair.left.remove(); pair.right.remove(); }
    };
  }, []);
  return null;
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
