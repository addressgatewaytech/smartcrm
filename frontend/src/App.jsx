import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { api, setToken, getToken, ApiError, isImpersonating, beginImpersonation, endImpersonation, clearAllTokens } from "./api";
import { useApiStore } from "./store";
import {
  LayoutDashboard, Users, Handshake, FileText, UserCheck, ShoppingCart,
  Receipt, ClipboardList, Bell, Coins, UserCog, ListChecks, Building2,
  Plus, X, Check, ChevronRight, ChevronUp, ChevronDown, AlertTriangle, CircleDollarSign, RefreshCw,
  UserPlus, ShieldCheck, Ban, Clock, ArrowRight, Search, Mail, Phone,
  BadgeCheck, CalendarClock, Briefcase, Copy, Files, Link2, Pencil, Trash2, Repeat, BarChart3, Download, MoreHorizontal, ChevronsLeft, ChevronsRight, Camera, Star,
  Database, Upload, MessageCircle, ArchiveX, ShieldAlert, Settings as SettingsIcon,
  Sun, Moon, BookOpen, Award, Landmark
} from "lucide-react";
import { money, fmtDate, fmtDateDMY, Stamp, statusTone, Rail, DonutChart, LineChart, BarChart, SalesPersonBars, ProgressRing, progressColor, Modal, Empty, ConfirmModal, RowActions, exportCSV, usePagination, PaginationBar, TableScrollHint, useConfirm, ADMIN_LIKE, ROLE_LABEL, isSalesRole, isAssignable } from "./ui.jsx";
import { todayStr as salesTaskToday, firstOfWeekStr, firstOfMonthStr, userTaskSnapshot, dailyCompletionColor } from "./salesTasksHelpers";
import { CONTENT_STAGES, contentStageSnapshot } from "./contentStagesHelpers";
import { TasksPage } from "./pages/tasks.jsx";
import { AttendanceSignButton, AttendancePage } from "./pages/attendance.jsx";
import { LeadAssignmentManagerPage } from "./pages/leadAssignment.jsx";
import { OnboardingFormTab, PublicOnboardingPage } from "./pages/onboardingForm.jsx";

/* ---------------------------------------------------------------------- */
/* DESIGN TOKENS                                                          */
/* ---------------------------------------------------------------------- */

const CSS = `
  .agw { --ink:#151A1F; --ink-soft:#4B535B; --hair:#E1E6E8;
    --page:#F5F6F6; --surface:#FFFFFF;
    --sidebar:#0E3350; --sidebar-line:#1C4C6E; --sidebar-text:#B9D2E0; --sidebar-text-dim:#6E90A5;
    --brand:#1391AC; --brand-dark:#0D7288; --brand-tint:#E1F2F5;
    --gold:#E8791E; --gold-dark:#C05F0F; --gold-tint:#FCEBDA;
    --success:#2B6B4F; --success-tint:#E6F1EA;
    --warning:#95661C; --warning-tint:#FBEEDA;
    --danger:#9E3B33; --danger-tint:#FBE9E6;
    --info:#0E3350; --info-tint:#E6ECF0;
    --radius: 10px;
    font-family: 'Inter', -apple-system, sans-serif;
    color: var(--ink);
    background: var(--page);
    -webkit-font-smoothing: antialiased;
    /* This app is light-themed only. Without this, Safari/WebKit renders native form
       controls (select, checkbox, date picker, ...) using the OS's Dark Mode palette by
       default — on a Mac in Dark Mode that can make a <select>'s text render in a color
       barely distinguishable from its background, looking exactly like "the dropdown
       doesn't work" even though it's functioning. */
    color-scheme: light;
  }
  .agw .disp { font-family: 'Space Grotesk', 'Inter', sans-serif; }
  .agw .mono { font-family: 'IBM Plex Mono', monospace; }
  .agw * { box-sizing: border-box; }
  .agw button { font-family: inherit; cursor: pointer; }
  .agw input, .agw select, .agw textarea { font-family: inherit; }
  .agw ::-webkit-scrollbar { width: 8px; height: 8px; }
  .agw ::-webkit-scrollbar-thumb { background: #D8D6CD; border-radius: 8px; }

  .agw-shell { display: flex; height: 100%; min-height: 720px; }

  .agw-sidebar { width: 232px; flex-shrink: 0; background: var(--sidebar);
    color: var(--sidebar-text); display: flex; flex-direction: column; transition: width .16s ease; position: relative; }
  .agw-brand { padding: 20px 18px 16px; border-bottom: 1px solid var(--sidebar-line); display: flex; flex-direction: column; align-items: center; text-align: center; }
  .agw-brand-sub { font-size: 10.5px; color: var(--sidebar-text-dim); margin-top: 8px; letter-spacing: .03em;}

  .agw-nav { flex: 1; overflow-y: auto; padding: 10px 10px; }
  .agw-nav-group { font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--sidebar-text-dim);
    padding: 14px 10px 6px; }
  .agw-nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px;
    font-size: 13.5px; color: var(--sidebar-text); border: none; background: transparent; width: 100%; text-align: left; }
  .agw-nav-item:hover { background: #1B2229; color: #EDEBE4; }
  .agw-nav-item.active { background: var(--brand); color: #fff; }
  .agw-nav-item svg { flex-shrink: 0; }
  .agw-nav-badge { margin-left: auto; background: var(--gold); color: #1B140A; font-size: 10.5px; font-weight: 600;
    padding: 1px 6px; border-radius: 20px; }

  .agw-userbox { border-top: 1px solid var(--sidebar-line); padding: 12px; }
  .agw-userbox select { width: 100%; background: #1B2229; color: #EDEBE4; border: 1px solid var(--sidebar-line);
    border-radius: 8px; padding: 8px; font-size: 12.5px; }
  .agw-userbox label { font-size: 10.5px; color: var(--sidebar-text-dim); text-transform: uppercase; letter-spacing: .06em; display:block; margin-bottom:6px;}

  .agw-collapse-btn { position: absolute; top: 18px; right: -12px; width: 24px; height: 24px; border-radius: 50%;
    background: var(--sidebar); border: 1px solid var(--sidebar-line); color: var(--sidebar-text);
    display: flex; align-items: center; justify-content: center; z-index: 5; }
  .agw-collapse-btn:hover { color: #fff; border-color: var(--brand); }

  .agw-sidebar.collapsed { width: 68px; }
  .agw-sidebar.collapsed .agw-brand-sub,
  .agw-sidebar.collapsed .agw-brand-wordmark,
  .agw-sidebar.collapsed .agw-nav-group,
  .agw-sidebar.collapsed .agw-nav-label,
  .agw-sidebar.collapsed .agw-nav-badge,
  .agw-sidebar.collapsed .agw-userbox label,
  .agw-sidebar.collapsed .agw-userbox select { display: none; }
  .agw-sidebar.collapsed .agw-brand { display: flex; justify-content: center; padding: 20px 0 16px; }
  .agw-sidebar.collapsed .agw-nav-item { justify-content: center; padding: 10px 0; gap: 0; }
  .agw-sidebar.collapsed .agw-userbox { display: flex; justify-content: center; padding: 12px 0; }

  .agw-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .agw-topbar { height: 60px; flex-shrink: 0; border-bottom: 1px solid var(--gold-dark); display: flex;
    align-items: center; justify-content: space-between; padding: 0 24px; background: var(--gold); }
  .agw-topbar h1 { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 500; margin: 0; color: #fff; }
  .agw-topbar-sub { font-size: 12.5px; color: rgba(255,255,255,.8); margin-top: 1px; }
  .agw-content { flex: 1; overflow-y: auto; padding: 24px; }

  /* Bottom tab bar — hidden on desktop, shown below the responsive breakpoint */
  .agw-bottom-nav { display: none; }
  .agw-more-sheet { display: none; }

  @media (max-width: 860px) {
    .agw-sidebar { display: none; }
    .agw-shell { flex-direction: column; }
    .agw-content { padding: 14px; padding-bottom: 84px; }
    .agw-topbar { padding: 0 14px; }
    .agw-topbar-sub { display: none; }
    .agw-profile-name { display: none; }
    .agw-grid { grid-template-columns: 1fr !important; }
    .board { grid-template-columns: 1fr !important; }
    .row2, .row3 { grid-template-columns: 1fr !important; }
    .agw-table { min-width: 560px; }
    .modal-backdrop { padding: 14px 10px; align-items: center; }
    .modal { padding: 16px 14px 18px; max-height: calc(100vh - 28px); }
    .doc-paper { padding: 18px 16px; }

    .agw-bottom-nav { display: flex; position: fixed; left: 0; right: 0; bottom: 0; height: 62px;
      background: var(--sidebar); border-top: 1px solid var(--sidebar-line); z-index: 40;
      padding-bottom: env(safe-area-inset-bottom, 0); }
    .agw-bottom-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 3px; background: none; border: none; color: var(--sidebar-text-dim); font-size: 10px; padding: 6px 2px; position: relative; }
    .agw-bottom-item.active { color: #fff; }
    .agw-bottom-item.active::before { content:''; position: absolute; top: 2px; width: 26px; height: 3px; border-radius: 3px; background: var(--brand); }
    .agw-bottom-item .dot { position: absolute; top: 3px; right: 26%; width: 7px; height: 7px; border-radius: 50%; background: var(--gold); border: 1.5px solid var(--sidebar); }

    .agw-more-sheet { display: block; position: fixed; inset: 0; z-index: 45; }
    .agw-more-backdrop { position: absolute; inset: 0; background: rgba(14,51,80,.45); }
    .agw-more-panel { position: absolute; left: 0; right: 0; bottom: 0; max-height: 82vh; overflow-y: auto;
      background: var(--sidebar); border-radius: 18px 18px 0 0; padding: 8px 8px calc(16px + env(safe-area-inset-bottom, 0)); }
    .agw-more-handle { width: 36px; height: 4px; border-radius: 3px; background: var(--sidebar-line); margin: 8px auto 12px; }
  }

  .agw-bell { position: relative; width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(255,255,255,.4);
    background: rgba(255,255,255,.14); display: flex; align-items: center; justify-content: center; color: #fff; }
  .agw-bell .dot { position: absolute; top: 6px; right: 7px; width: 8px; height: 8px; border-radius: 50%; background: #fff; border: 1.5px solid var(--gold); }

  /* overflow-x here (not just below 860px) so a table with enough columns scrolls horizontally
     within its card at any window width, instead of bleeding past the card's edge — this is also
     what TableScrollHint (ui.jsx) needs to find as the scrollable ancestor on desktop. */
  .agw-card { background: var(--surface); border: 1px solid var(--hair); border-radius: 12px; padding: 16px 18px; overflow-x: auto; }
  .agw-grid { display: grid; gap: 14px; }

  .kpi-label { font-size: 12px; color: var(--ink-soft); margin-bottom: 6px; }
  .kpi-value { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 500; }
  .kpi-foot { font-size: 11.5px; color: var(--ink-soft); margin-top: 4px; }

  .agw-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .agw-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
    color: var(--ink-soft); font-weight: 500; padding: 9px 12px; border-bottom: 1px solid var(--hair); white-space:nowrap;}
  .agw-table td { padding: 11px 12px; border-bottom: 1px solid var(--hair); vertical-align: middle; }
  .agw-table tbody tr:hover { background: #FBFAF7; cursor: pointer; }
  .agw-table tbody tr:last-child td { border-bottom: none; }

  .btn { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500;
    padding: 8px 14px; border-radius: 8px; border: 1px solid var(--hair); background: var(--surface); color: var(--ink); }
  .btn:hover { border-color: #C9C6BB; }
  .btn-primary { background: var(--brand); border-color: var(--brand); color: #fff; }
  .btn-primary:hover { background: var(--brand-dark); }
  .btn-ghost { border-color: transparent; background: transparent; }
  .btn-ghost:hover { background: #F0EEE7; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }

  .stamp { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
    letter-spacing: .03em; text-transform: uppercase; padding: 4px 10px 4px 8px; border-radius: 20px;
    border: 1.5px solid; white-space: nowrap; }
  .stamp .ring { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid currentColor;
    display: flex; align-items: center; justify-content: center; flex-shrink:0; }
  .stamp .ring::after { content:''; width:5px; height:5px; border-radius:50%; background: currentColor; }
  .stamp-success { color: var(--success); background: var(--success-tint); border-color: #BFD9CB; }
  .stamp-warning { color: var(--warning); background: var(--warning-tint); border-color: #EAD4A6; }
  .stamp-danger  { color: var(--danger);  background: var(--danger-tint);  border-color: #EFC3BC; }
  .stamp-info    { color: var(--info);    background: var(--info-tint);    border-color: #C3D8E3; }
  .stamp-neutral { color: var(--ink-soft); background: #F0EEE7; border-color: var(--hair); }
  .stamp-gold    { color: var(--gold); background: var(--gold-tint); border-color: #F2C089; }

  .pill { font-size: 11px; padding: 3px 9px; border-radius: 20px; background: #F0EEE7; color: var(--ink-soft); }

  .rail { display: flex; align-items: center; gap: 0; margin: 4px 0 2px; flex-wrap: wrap; }
  .rail-step { display: flex; align-items: center; }
  .rail-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--hair); flex-shrink:0; }
  .rail-dot.done { background: var(--success); }
  .rail-dot.now { background: var(--brand); box-shadow: 0 0 0 3px var(--brand-tint); }
  .rail-label { font-size: 11px; margin: 0 8px; color: var(--ink-soft); white-space:nowrap; }
  .rail-label.done { color: var(--ink); }
  .rail-label.now { color: var(--brand); font-weight: 600; }
  .rail-line { width: 22px; height: 1px; background: var(--hair); }
  .rail-line.done { background: var(--success); }

  .modal-backdrop { position: fixed; inset: 0; background: rgba(20,18,14,.4); display: flex;
    align-items: center; justify-content: center; padding: 40px 20px; z-index: 50; overflow-y:auto; }
  .modal { background: var(--surface); border-radius: 14px; width: 100%; max-width: 620px; padding: 22px 24px 24px; max-height: calc(100vh - 80px); overflow-y: auto; }
  /* Any table sitting directly inside a modal (several PDF/document preview modals render one
     without their own overflow wrapper) scrolls horizontally instead of blowing out the modal's
     width on a narrow screen. */
  .modal div:has(> table) { overflow-x: auto; }
  .doc-paper { border: 1px solid var(--hair); border-radius: 8px; padding: 32px 36px; background: #fff; overflow-x: auto; }

  /* Floating "more to see" affordance injected by TableScrollHint (ui.jsx) over any wide table
     that's actually overflowing on a small screen — pulses so it's not just another static icon
     lost in the corner. Positioned via inline top/left set in JS, not CSS. Colors are hardcoded
     (not var(--brand)) because the button is appended straight to <body>, outside the .agw root
     that custom property is scoped to. */
  .table-scroll-hint { position: fixed; width: 32px; height: 32px; border-radius: 50%;
    background: #1391AC; color: #fff; border: none; align-items: center; justify-content: center;
    font-size: 17px; line-height: 1; box-shadow: 0 2px 10px rgba(0,0,0,.28); z-index: 60;
    animation: table-scroll-hint-pulse 1.8s ease-in-out infinite; }
  .table-scroll-hint:active { transform: scale(0.92); }
  @keyframes table-scroll-hint-pulse {
    0%, 100% { box-shadow: 0 2px 10px rgba(0,0,0,.28); }
    50% { box-shadow: 0 2px 14px 3px rgba(19,145,172,.6); }
  }
  .modal h3 { font-family:'Space Grotesk', sans-serif; font-size: 16.5px; margin: 0 0 4px; font-weight: 500; }
  .modal-sub { font-size: 12.5px; color: var(--ink-soft); margin-bottom: 18px; }
  .field { margin-bottom: 12px; }
  .field label { display: block; font-size: 12px; color: var(--ink-soft); margin-bottom: 5px; }
  .field input, .field select, .field textarea { width: 100%; border: 1px solid var(--hair); border-radius: 8px;
    padding: 8px 10px; font-size: 13.5px; background: var(--surface); color: var(--ink); appearance: auto; -webkit-appearance: auto; }
  .field input:focus, .field select:focus, .field textarea:focus { outline: 2px solid var(--brand-tint); border-color: var(--brand); }
  /* Plain typing for amount fields — no spinner arrows, and the mouse-wheel-over-a-focused-number-
     input browser default (which silently bumps the value while someone's just scrolling the page)
     is disabled globally via a wheel listener that blurs the field; see the App component. */
  input[type=number] { -moz-appearance: textfield; }
  input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

  .tabbar { display: flex; gap: 4px; border-bottom: 1px solid var(--hair); margin-bottom: 18px; }
  .tab { padding: 9px 14px; font-size: 13px; border: none; background: none; color: var(--ink-soft);
    border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab.active { color: var(--brand); border-bottom-color: var(--brand); font-weight: 500; }

  .empty { text-align: center; padding: 48px 20px; color: var(--ink-soft); }
  .empty svg { opacity: .35; margin-bottom: 10px; }

  .board { display: grid; grid-template-columns: repeat(5, minmax(200px,1fr)); gap: 12px; overflow-x: auto; }
  .board-col { background: #F0EFE9; border-radius: 12px; padding: 10px; min-width: 200px; transition: background .12s ease; }
  .board-col.drag-over { background: var(--brand-tint); outline: 2px dashed var(--brand); outline-offset: -2px; }
  .job-card[draggable="true"] { cursor: grab; }
  .job-card.dragging { opacity: .4; }
  .board-col h4 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-soft);
    margin: 4px 6px 10px; display:flex; justify-content:space-between; align-items:center;}
  .job-card { background: var(--surface); border: 1px solid var(--hair); border-radius: 10px; padding: 11px 12px; margin-bottom: 9px; }
  .job-card h5 { font-size: 13px; font-weight: 500; margin: 0 0 4px; }
  .job-card .meta { font-size: 11px; color: var(--ink-soft); margin-bottom: 6px; }
  .avatars { display: flex; gap: -4px; }
  .avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--brand-tint); color: var(--brand);
    font-size: 10px; font-weight: 600; display:flex; align-items:center; justify-content:center;
    border: 1.5px solid #fff; margin-left: -6px; }
  .avatar:first-child { margin-left: 0; }

  .notif-item { display: flex; gap: 10px; padding: 12px 4px; border-bottom: 1px solid var(--hair); }
  .notif-item:last-child { border-bottom: none; }
  .notif-icon { width: 30px; height: 30px; border-radius: 50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;}
  .notif-unread { background: #FBFAF5; }

  .checklist-item { display:flex; align-items:center; gap:9px; padding:7px 0; border-bottom:1px dashed var(--hair); font-size:13px;}
  .checklist-item:last-child{ border-bottom:none;}
  .checkbox { width:18px; height:18px; border-radius:5px; border:1.5px solid var(--hair); display:flex; align-items:center;
    justify-content:center; flex-shrink:0; background:#fff;}
  .checkbox.checked { background: var(--success); border-color: var(--success); color:#fff; }

  .side-note { font-size: 12px; color: var(--ink-soft); background: #F7F6F1; border: 1px dashed var(--hair);
    border-radius: 8px; padding: 9px 11px; margin-top: 10px; }

  .no-spinner::-webkit-outer-spin-button, .no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .no-spinner { -moz-appearance: textfield; }

  .agw-loader { height: 100%; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 50% 40%, #123a5c 0%, var(--sidebar) 62%); }
  .agw-loader-mark { position: relative; width: 132px; height: 132px; display: flex; align-items: center; justify-content: center; }
  .agw-loader-ring { position: absolute; inset: 0; border-radius: 50%; border: 3px solid rgba(232,121,30,0.16);
    border-top-color: var(--gold); animation: agw-spin 1s linear infinite; }
  .agw-loader-logo { width: 76px; height: 76px; border-radius: 50%; background: #fff; display: flex; align-items: center;
    justify-content: center; box-shadow: 0 6px 24px rgba(0,0,0,0.28); animation: agw-pulse 1.8s ease-in-out infinite; }
  .agw-loader-logo img { width: 52px; height: auto; display: block; }
  .agw-loader-sub { margin-top: 22px; }
  .agw-loader-sub img { height: 22px; width: auto; display: block; opacity: 0.92; }
  .agw-loader-text { margin-top: 14px; font-size: 12.5px; letter-spacing: .04em; color: var(--sidebar-text-dim); }
  @keyframes agw-spin { to { transform: rotate(360deg); } }
  @keyframes agw-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }

  /* --- Dark theme --------------------------------------------------------------------------
     Toggled via a class on <html> (not on each .agw root individually — there are three
     independent ones: Login, LoadingScreen, and the main shell) so every screen picks it up.
     Brand/accent hues (--brand, --gold, --sidebar*) stay the same in both themes; only the
     surface/text/border tokens and the pastel "tint" backgrounds flip. Everything that already
     reads var(--ink), var(--surface), etc. — which is nearly the whole app — re-themes for free;
     only a handful of hardcoded literals (not var()) needed their own dark override below. */
  html.dark .agw {
    --ink:#E7EAEE; --ink-soft:#9AA4AE; --hair:#2B333C;
    --page:#13171C; --surface:#1B2128;
    --brand-tint:#0F2C33; --gold-tint:#3A2712; --success-tint:#12291F; --warning-tint:#332510; --danger-tint:#30201D; --info-tint:#1A2530;
    color-scheme: dark;
  }
  html.dark .agw ::-webkit-scrollbar-thumb { background: #3A424C; }
  html.dark .agw .stamp-success { border-color: #234433; }
  html.dark .agw .stamp-warning { border-color: #4A3A18; }
  html.dark .agw .stamp-danger  { border-color: #4A2F29; }
  html.dark .agw .stamp-info    { border-color: #26384A; }
  html.dark .agw .stamp-gold    { border-color: #4A3417; }
  html.dark .agw .stamp-neutral { background: #262E37; }
  html.dark .agw .pill { background: #262E37; }
  html.dark .agw .agw-table tbody tr:hover { background: #20272F; }
  html.dark .agw .side-note { background: #20272F; }
  html.dark .agw .checkbox { background: var(--surface); }
  html.dark .agw .board-col { background: #171D24; }
  html.dark .agw .job-card:hover { border-color: var(--brand); }
  html.dark .agw .btn-ghost:hover { background: #262E37; }
  html.dark .agw .notif-unread { background: #1C2731; }

  /* Popup/modal windows always render in light-mode colors, even with dark mode on for the rest
     of the app — re-declares the same tokens html.dark .agw overrides above, scoped one level
     deeper so it wins, plus the handful of hardcoded (non-var) dark tweaks that would otherwise
     still leak into a modal's stamps/pills/tables/side-notes. The explicit color re-declaration
     matters even though --ink is already reset above: .agw sets color: var(--ink) once, at the
     app root, and that computed (dark-mode) color then inherits into the modal like any other
     inherited property — plain text with no color of its own (a title, a note) never re-reads
     var(--ink) at its own position, so it stayed the old light-on-dark color despite the token
     reset. Re-declaring color here forces that re-read at the modal's own scope. */
  html.dark .agw .modal {
    --ink:#151A1F; --ink-soft:#4B535B; --hair:#E1E6E8;
    --page:#F5F6F6; --surface:#FFFFFF;
    --brand-tint:#E1F2F5; --gold-tint:#FCEBDA; --success-tint:#E6F1EA; --warning-tint:#FBEEDA; --danger-tint:#FBE9E6; --info-tint:#E6ECF0;
    color: var(--ink);
    color-scheme: light;
  }
  html.dark .agw .modal .stamp-success { border-color: #BFD9CB; }
  html.dark .agw .modal .stamp-warning { border-color: #EAD4A6; }
  html.dark .agw .modal .stamp-danger  { border-color: #EFC3BC; }
  html.dark .agw .modal .stamp-info    { border-color: #C3D8E3; }
  html.dark .agw .modal .stamp-gold    { border-color: #F2C089; }
  html.dark .agw .modal .stamp-neutral { background: #F0EEE7; }
  html.dark .agw .modal .pill { background: #F0EEE7; }
  html.dark .agw .modal .agw-table tbody tr:hover { background: #FBFAF7; }
  html.dark .agw .modal .side-note { background: #F7F6F1; }

  .theme-toggle { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.18); border: none;
    color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .theme-toggle:hover { background: rgba(255,255,255,.3); }
  .theme-toggle:disabled { opacity: .6; cursor: default; }
  @keyframes agw-spin { to { transform: rotate(360deg); } }
  .agw-spin { animation: agw-spin 0.8s linear infinite; }
`;

/* ---------------------------------------------------------------------- */
/* SEED DATA                                                              */
/* ---------------------------------------------------------------------- */

const SERVICES = [
  "100% Foreign Ownership Company Formation",
  "Company Formation with Qatari Partner",
  "Growth Partner Program",
  "Bank Account Opening",
  "PRO Services",
  "Office Space Assistance",
];

const FEE_TYPES = ["Professional Fee", "Government Fee"];

// Quotation color themes — mirrors THEMES in src/utils/quotationPdf.js so the on-screen preview
// matches the real generated PDF exactly.
const QUOTE_THEMES = {
  charcoal: { label: "Modern Charcoal", headerBg: "#2A2E33", totalBg: "#F5F6F6", totalText: "#151A1F", heading: "#151A1F" },
  teal:     { label: "Teal Classic",    headerBg: "#0D7288", totalBg: "#E1F2F5", totalText: "#0D7288", heading: "#0D7288" },
  gold:     { label: "Gold Accent",     headerBg: "#C05F0F", totalBg: "#FCEBDA", totalText: "#C05F0F", heading: "#C05F0F" },
};
const QUOTE_THEME_KEYS = Object.keys(QUOTE_THEMES);

const DEFAULT_BANK = "ADDRESS GATEWAY BUSINESS SERVICES\nBank - Commercial Bank, Account Number - 4680-21670035-001\nIBAN - QA14CBQA000000468021670035001, Company Fawran - ER-17274261\nDoha, Qatar";
const DEFAULT_FOOTER_NOTE = "This quotation is provided for estimation purposes only and does not constitute legal or financial advice; signature is not required.";

// ROLE_LABEL and ADMIN_LIKE now live in ui.jsx (imported above) — the single source of truth for
// both, previously duplicated independently here and re-declared in five page-level files.

// Only Accounts/Admin-tier convert an accepted quotation into a Sales Order, onboard a Sales Order
// into an Invoice, and get the clean (non-watermarked, downloadable) Sales Order/Invoice PDF —
// every other role sees those documents watermarked "INTERNAL USE ONLY" and can't download them.
const isAccountsOrAdmin = (role) => ADMIN_LIKE.includes(role) || role === "accounts";
// A quotation sitting in "Client Accepted" is, from the salesperson's own point of view, just
// waiting on Accounts to invoice it — Accounts/Admin still need to see the real "Client Accepted"
// label (that's their cue to convert it), so this only relabels the display for everyone else.
const quotationStatusLabel = (status, role) => (status === "Client Accepted" && !isAccountsOrAdmin(role) ? "Under Payment Process" : status);

// Mirrors src/utils/helpers.js's professionalFeeTotal exactly — only Professional Fee line items
// count toward business volume, pipeline value, and incentive calculations. A line's effective fee
// type is its own `feeType` if tagged, else the quotation's whole-document `feeType` (so a
// pre-single-quotation-model record, whose items were never tagged individually, still resolves
// correctly). Order-level discount is allocated proportionally across the two subtotals.
const professionalFeeAmount = (items, orderDiscount, quotationFeeType, orderDiscountType = "amount") => {
  const list = items || [];
  const lineAmount = (it) => it.qty * it.price * (1 - (it.discountPct || 0) / 100);
  const isGovernmentFee = (it) => (it.feeType || quotationFeeType || "Professional Fee") === "Government Fee";
  const subtotal = list.reduce((a, it) => a + lineAmount(it), 0);
  if (subtotal <= 0) return 0;
  const profSubtotal = list.filter((it) => !isGovernmentFee(it)).reduce((a, it) => a + lineAmount(it), 0);
  const profShare = profSubtotal / subtotal;
  const pct = Math.min(100, Math.max(0, orderDiscount || 0));
  const discountAmount = orderDiscountType === "percent" ? subtotal * (pct / 100) : (orderDiscount || 0);
  return Math.max(0, profSubtotal - discountAmount * profShare);
};
// Business Volume = realized Professional Fee revenue minus each service's fixed internal cost
// (admin-configurable per service, state.serviceCosts — e.g. Office Space Assistance always costs
// the business 2,000 QAR to deliver, whatever the client is charged). Charged once per transaction,
// flat, no matter how many line items of that service appear on the quotation — not scaled by qty.
const costForItems = (items, serviceCosts) => {
  const services = new Set((items || []).map((it) => it.service).filter(Boolean));
  return [...services].reduce((a, s) => a + Number((serviceCosts || {})[s] || 0), 0);
};
const quoteBusinessVolume = (q, serviceCosts) =>
  Math.max(0, professionalFeeAmount(q.items, q.orderDiscount, q.feeType, q.orderDiscountType) - costForItems(q.items, serviceCosts));
// Single-quotation model: a quotation's real fee-type makeup can now be a mix — this reflects
// that in badges/exports instead of a possibly-misleading single "Professional Fee" label.
const quotationFeeTypeLabel = (q) => {
  const items = q.items || [];
  const effectiveType = (it) => it.feeType || q.feeType || "Professional Fee";
  const hasGov = items.some((it) => effectiveType(it) === "Government Fee");
  const hasProf = items.some((it) => effectiveType(it) !== "Government Fee");
  if (hasGov && hasProf) return "Professional + Government Fee";
  if (hasGov) return "Government Fee";
  return "Professional Fee";
};
// IDs are always "AGBS" + a 2-letter entity code + a sequential number (see nextSequentialId in
// src/utils/helpers.js) — AGBSQS10220 splits into AGBS/QS/10220. Mirrors formatQuoteNumber in
// src/utils/quotationPdf.js so the on-screen preview always matches the real generated PDF.
const formatQuoteNumber = (id) => {
  const m = /^([A-Z]{4})([A-Z]{2})(\d+)$/.exec(id || "");
  return m ? `${m[1]}/${m[2]}/${m[3]}` : id;
};
// Turns a subscription tier (Subscriptions module — see mapTier in mappers.js) into the note a
// quotation's package line item should show, so a Basic-tier quotation actually reads differently
// from a Gold-tier one instead of every package sharing one generic description. Joined with " · "
// rather than newlines — the Note field it lands in is a single-line <input>, which silently
// strips embedded line breaks (the HTML value-sanitization algorithm for text inputs), so a
// newline-joined string would render as one unseparated run-on line.
const tierEntitlementsNote = (tier) => {
  if (!tier) return "";
  const bits = [
    tier.companySize && `For companies with ${tier.companySize}`,
    tier.transactionsIncluded != null && `${tier.transactionsIncluded} transactions included`,
    tier.hukoomiServices && `Hukoomi services: ${tier.hukoomiServices}`,
    tier.trainingSessions ? `${tier.trainingSessions} training session${tier.trainingSessions === 1 ? "" : "s"}${tier.trainingTeamMembers ? ` for up to ${tier.trainingTeamMembers} team members` : ""}` : null,
    tier.legalAdvising ? `${tier.legalAdvising} legal advising session${tier.legalAdvising === 1 ? "" : "s"}` : null,
    tier.dedicatedPro && "Dedicated PRO officer included",
    tier.translationPages ? `${tier.translationPages} translation pages included` : null,
    ...(tier.extraFeatures || []),
  ].filter(Boolean);
  return bits.join(" · ");
};
const quotationFeeTypeTone = (q) => {
  const label = quotationFeeTypeLabel(q);
  return label === "Government Fee" ? "neutral" : label === "Professional + Government Fee" ? "info" : "success";
};

// Light background bands so a Government Fee section and a Professional Fee section are visually
// obvious at a glance — in the builder, the templates editor, the "Current view" tab, the PDF
// preview, and the actual generated PDF (see the matching hex values in quotationPdf.js). Chosen
// to sit clearly apart from all three quotation themes' own tint colors (gray/teal/gold).
const GOV_FEE_BG = "#E7F0FB";
const PROF_FEE_BG = "#EAF7EF";

// Shared classification for the Government Fee Total / Professional Fee Total split shown on a
// quotation document — distinct from professionalFeeAmount above, which drives business volume/
// incentive math and is deliberately left untouched. Trusts a line's own feeType when it's
// actually set; only when it's blank does it fall back to matching "government"/"professional" in
// the line's category text, and finally to the quotation's whole-document fee type for a line with
// neither — covers older quotations/templates whose items were never individually tagged.
const isGovFeeLine = (it, quotationFeeType) => {
  if (it.feeType) return it.feeType === "Government Fee";
  const cat = (it.category || "").toLowerCase();
  if (cat.includes("government")) return true;
  if (cat.includes("professional")) return false;
  return (quotationFeeType || "Professional Fee") === "Government Fee";
};

// Category-ordered split of a line-item list's total. The two totals are ordered to match
// whichever classification actually appears first among the items, so reordering items in the
// builder/template editor also reorders the totals shown underneath them.
const govProfSplit = (items, quotationFeeType) => {
  const lineAmount = (it) => it.qty * it.price * (1 - (it.discountPct || 0) / 100);
  const subtotal = items.reduce((a, it) => a + lineAmount(it), 0);
  const govTotal = items.filter(it => isGovFeeLine(it, quotationFeeType)).reduce((a, it) => a + lineAmount(it), 0);
  const profTotal = subtotal - govTotal;
  const firstGovIdx = items.findIndex(it => isGovFeeLine(it, quotationFeeType));
  const firstProfIdx = items.findIndex(it => !isGovFeeLine(it, quotationFeeType));
  const govFirst = firstGovIdx !== -1 && (firstProfIdx === -1 || firstGovIdx < firstProfIdx);
  return { subtotal, govTotal, profTotal, govFirst };
};

// Mirrors quoteTotal in src/utils/helpers.js. itemDiscountTotal is what each line's own
// discountPct already folded silently into its Amount — broken out here so it can be shown as
// its own line instead of just vanishing into Sub Total. orderDiscountType picks how
// orderDiscount is applied: a flat QAR amount (default) or a percentage of Sub Total.
const quoteTotals = (items, orderDiscount, orderDiscountType) => {
  const grossSubtotal = items.reduce((a, it) => a + it.qty * it.price, 0);
  const subtotal = items.reduce((a, it) => a + it.qty * it.price * (1 - (it.discountPct || 0) / 100), 0);
  const itemDiscountTotal = grossSubtotal - subtotal;
  const pct = Math.min(100, Math.max(0, orderDiscount || 0));
  const discountAmount = orderDiscountType === "percent" ? subtotal * (pct / 100) : (orderDiscount || 0);
  return { grossSubtotal, subtotal, itemDiscountTotal, discountAmount, total: Math.max(0, subtotal - discountAmount) };
};

// Amount/percent toggle for the order-level "overall discount" field — reused everywhere a
// quotation's whole-document discount is entered (builder, current-view edit, PDF-preview edit,
// per-service template).
function OrderDiscountField({ value, type, onValueChange, onTypeChange, label = "Overall discount" }) {
  return (
    <div className="field">
      <label>{label} (optional — shown as its own line)</label>
      <div style={{ display:"flex", gap:6 }}>
        <input type="number" min={0} max={type==="percent" ? 100 : undefined} value={value}
          onChange={e=>onValueChange(e.target.value === "" ? "" : Number(e.target.value))} style={{ flex:1 }} />
        <div style={{ display:"flex", border:"1px solid var(--hair)", borderRadius:8, overflow:"hidden", flexShrink:0 }}>
          <button type="button" onClick={()=>onTypeChange("amount")}
            style={{ padding:"0 12px", fontSize:12.5, border:"none", cursor:"pointer",
              background: type!=="percent" ? "var(--brand)" : "var(--surface)", color: type!=="percent" ? "#fff" : "var(--ink)" }}>QAR</button>
          <button type="button" onClick={()=>onTypeChange("percent")}
            style={{ padding:"0 12px", fontSize:12.5, border:"none", cursor:"pointer",
              background: type==="percent" ? "var(--brand)" : "var(--surface)", color: type==="percent" ? "#fff" : "var(--ink)" }}>%</button>
        </div>
      </div>
    </div>
  );
}

// Moves array element `i` up (dir=-1) or down (dir=1) by one position — used for the per-line
// "move item" controls in the quotation builder and templates editor.
const moveArrayItem = (arr, i, dir) => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

// Where a record originally came from. "Assigned" = the Lead Manager handed this lead to its owner
// (assignedAt is only ever stamped on a central-distribution hand-off — see leads.routes.js);
// "Self-sourced" = the owner brought it in themselves. Deals and quotations inherit the label by
// tracing back lead <- deal <- quotation, so origin follows the whole chain rather than stopping at
// the Leads page. Returns "—" when the chain can't be resolved (e.g. a directly-created quotation
// with no deal, or a lead owned by someone else and therefore not in this user's scoped state).
const ORIGIN_ASSIGNED = "Assigned";
const ORIGIN_SELF = "Self-sourced";
const leadOrigin = (lead) => (!lead ? "—" : lead.assignedAt ? ORIGIN_ASSIGNED : ORIGIN_SELF);
const dealOrigin = (state, deal) => leadOrigin(deal?.leadId ? state.leads.find(l => l.id === deal.leadId) : null);
const quotationOrigin = (state, q) => dealOrigin(state, q?.dealId ? state.deals.find(d => d.id === q.dealId) : null);
const originTone = (origin) => (origin === ORIGIN_ASSIGNED ? "info" : "neutral");
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
// Whole days elapsed since a date (0 = today) — used as a simple aging indicator, e.g. how long
// a job card has been open.
const daysSince = (s) => Math.max(0, Math.floor((Date.now() - new Date(s).setHours(0,0,0,0)) / 86400000));

// A fixed palette of light background tints for Job Cards, so scanning a busy Kanban board for
// "all the PRO Services jobs" is a color-matching glance instead of reading every card's service
// line. Assigned by each service's position in the admin-configured services list (state.services)
// rather than a hash of its name — a hash into a palette this size collides constantly once there
// are more than a handful of services (e.g. "Bank Account Opening" and "PRO Services" used to land
// on the exact same color), while an index only repeats once you actually run out of colors.
const JOB_CATEGORY_COLORS = ["#EAF7EF", "#E7F0FB", "#FDF3E4", "#F5EAFB", "#FCEBEB", "#E7FBF7", "#FBF3E1", "#EFEAFB", "#FDE8F0", "#E9F5E1", "#F0E9FB", "#E1F5F5"];
const jobCategoryColor = (service, services) => {
  if (!service) return null;
  const idx = (services || []).indexOf(service);
  if (idx !== -1) return JOB_CATEGORY_COLORS[idx % JOB_CATEGORY_COLORS.length];
  // Unknown to the current services list (e.g. a legacy job card whose service was since renamed
  // or removed) — fall back to a name hash so it's at least stable, just not collision-free.
  let hash = 0;
  for (let i = 0; i < service.length; i++) hash = (hash * 31 + service.charCodeAt(i)) >>> 0;
  return JOB_CATEGORY_COLORS[hash % JOB_CATEGORY_COLORS.length];
};

// A job card's own service can be anything (PRO Services, Bank Account Opening, ...) even when its
// customer is separately enrolled in the Growth Partner Program subscription — this flags that
// enrollment regardless of what this particular job is for, same "still paying for the plan" rule
// subTransactionsUsed/subStatusOf already use elsewhere.
const isGrowthPartnerCustomer = (state, customerName) =>
  state.subscriptions.some(s => s.customer === customerName && s.plan === "Growth Partner Program" && !["Cancelled","Expired"].includes(subStatusOf(s)));

const JOB_AGE_BUCKETS = [
  { key: "0-3", label: "0–3 days old", test: (d) => d <= 3 },
  { key: "4-7", label: "4–7 days old", test: (d) => d >= 4 && d <= 7 },
  { key: "8-14", label: "8–14 days old", test: (d) => d >= 8 && d <= 14 },
  { key: "15-30", label: "15–30 days old", test: (d) => d >= 15 && d <= 30 },
  { key: "30+", label: "30+ days old", test: (d) => d > 30 },
];

let seq = 1000;
const nextId = (prefix) => prefix + "-" + (++seq);


/* ---------------------------------------------------------------------- */
/* SHARED UI BITS                                                         */
/* ---------------------------------------------------------------------- */

function docState(expiry) {
  const days = Math.ceil((new Date(expiry) - new Date()) / 86400000);
  if (days < 0) return { label: "Expired", cls: "stamp-danger" };
  if (days <= 30) return { label: `Expires in ${days}d`, cls: "stamp-warning" };
  return { label: "Valid", cls: "stamp-success" };
}

// The logo's "GATE" text is the same navy as the sidebar background, so it needs a light
// backing to stay readable — a soft, generously-rounded pill rather than a hard-edged card.
function BrandLogo({ scale = 1, onDark = false }) {
  return (
    <div style={onDark ? { display: "inline-block", background: "#fff", borderRadius: 999, padding: `${9*scale}px ${18*scale}px` } : undefined}>
      <img src="/logo-address-gateway.png" alt="Address Gateway Business Services" style={{ display: "block", height: 34 * scale, width: "auto" }} />
    </div>
  );
}

function ThemePicker({ value, onChange }) {
  return (
    <div style={{ display:"flex", gap:10 }}>
      {QUOTE_THEME_KEYS.map(key => {
        const t = QUOTE_THEMES[key];
        const active = value === key;
        return (
          <button key={key} type="button" onClick={()=>onChange(key)} title={t.label}
            style={{
              display:"flex", alignItems:"center", gap:6, padding:"5px 10px 5px 6px", borderRadius:20,
              border: active ? `1.5px solid ${t.headerBg}` : "1px solid var(--hair)",
              background: active ? t.totalBg : "var(--surface)", cursor:"pointer", fontSize:12,
            }}>
            <span style={{ width:16, height:16, borderRadius:"50%", background:t.headerBg, display:"inline-block", flexShrink:0 }} />
            <span style={{ color: active ? t.totalText : "var(--ink)", fontWeight: active ? 600 : 400 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmailCustomerModal({ customerName, customerEmail, employees=[], defaultSubject="", defaultBody="", dispatch, onSend, onClose }) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [ccIds, setCcIds] = useState([]);
  const [ccPick, setCcPick] = useState("");
  const hasEmail = !!customerEmail;

  const addCc = () => { if (ccPick && !ccIds.includes(ccPick)) setCcIds([...ccIds, ccPick]); setCcPick(""); };
  const removeCc = (id) => setCcIds(ccIds.filter(x => x !== id));

  return (
    <Modal title="Email to customer" sub="Review the content before sending." onClose={onClose} width={520}>
      <div className="field"><label>To</label>
        <input value={hasEmail ? `${customerName} <${customerEmail}>` : customerName} disabled style={{ background:"var(--page)", color: hasEmail ? "inherit" : "var(--danger)" }} />
      </div>
      {!hasEmail && <div className="side-note" style={{marginTop:0}}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>No email on file for this customer — add one on their profile first.</div>}

      <div className="field">
        <label>Cc (internal team members, optional)</label>
        <div style={{ display:"flex", gap:6 }}>
          <select value={ccPick} onChange={e=>setCcPick(e.target.value)} style={{ flex:1 }}>
            <option value="">Select a team member...</option>
            {employees.filter(e => !ccIds.includes(e.id)).map(e => <option key={e.id} value={e.id}>{e.name} — {e.designation}</option>)}
          </select>
          <button type="button" className="btn btn-sm" onClick={addCc} disabled={!ccPick}>Add</button>
        </div>
        {ccIds.length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
            {ccIds.map(id => {
              const emp = employees.find(e => e.id === id);
              return (
                <span key={id} className="pill" style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                  {emp?.name}
                  <button type="button" onClick={()=>removeCc(id)} style={{ border:"none", background:"none", cursor:"pointer", padding:0, display:"flex", color:"var(--ink-soft)" }}><X size={11}/></button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="field"><label>Subject</label><input value={subject} onChange={e=>setSubject(e.target.value)} /></div>
      <div className="field"><label>Message</label><textarea rows={6} value={body} onChange={e=>setBody(e.target.value)} /></div>
      <div className="side-note" style={{ marginTop:0 }}>Check the recipient, cc list and wording above — this can't be unsent once you confirm.</div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!hasEmail || !subject.trim()} onClick={()=>{
          const ccNames = ccIds.map(id => employees.find(e=>e.id===id)?.name).filter(Boolean);
          onSend({ subject, body, ccNames });
          onClose();
        }}><Mail size={14}/> Confirm & send</button>
      </div>
    </Modal>
  );
}

function AddServiceOptionModal({ dispatch, onClose, onCreated }) {
  const [name, setName] = useState("");
  return (
    <Modal title="Add service" sub="Adds a new service option across Leads, Deals, Quotations and Job Cards." onClose={onClose}>
      <div className="field"><label>Service name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Trademark Registration" autoFocus /></div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={()=>{
          dispatch({ type:"ADD_SERVICE_OPTION", name: name.trim() });
          onClose();
          if (onCreated) onCreated(name.trim());
        }}>Add service</button>
      </div>
    </Modal>
  );
}

// `big` renders a full-size primary button instead of the small inline pill — used for a
// customer's one shared cloud folder link (prominent, in the modal header) vs. the compact
// per-row style still used for employee/staff document links elsewhere.
function CloudLinkButton({ url, onSave, big=false }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // onSave (a dispatch call) was previously fired without awaiting or catching it — a save that
  // failed (e.g. the server rejecting a non-URL value) closed the edit box with zero indication
  // anything went wrong, silently reverting to whatever was there before.
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(val.trim());
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };
  if (editing) {
    return (
      <span style={{ display:"inline-flex", flexDirection:"column", gap:4, alignItems:"flex-start" }} onClick={e=>e.stopPropagation()}>
        <span style={{ display:"inline-flex", gap:4, alignItems:"center" }}>
          <input style={{ width: big?260:170, border:"1px solid var(--hair)", borderRadius:6, padding: big?"7px 10px":"3px 6px", fontSize: big?13:11.5 }}
            placeholder="Paste cloud folder link" value={val} onChange={e=>setVal(e.target.value)} autoFocus />
          <button className={big?"btn":"btn btn-sm btn-ghost"} disabled={saving} onClick={save}><Check size={big?14:12}/></button>
          <button className={big?"btn":"btn btn-sm btn-ghost"} disabled={saving} onClick={()=>{ setEditing(false); setError(""); }}><X size={big?14:12}/></button>
        </span>
        {error && <span style={{ fontSize:11.5, color:"var(--danger)" }}>{error}</span>}
      </span>
    );
  }
  return url ? (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4 }} onClick={e=>e.stopPropagation()}>
      <a href={url} target="_blank" rel="noreferrer" className={big?"btn btn-primary":"pill"} style={big?undefined:{ display:"inline-flex", alignItems:"center", gap:4, color:"var(--info)", textDecoration:"none" }}>
        <Link2 size={big?15:11}/> {big?"Open cloud folder":"Cloud file"}
      </a>
      <button className={big?"btn":"btn btn-sm btn-ghost"} style={big?undefined:{ fontSize:11, padding:"3px 7px" }} onClick={()=>setEditing(true)}>Edit</button>
    </span>
  ) : (
    <button className={big?"btn btn-primary":"btn btn-sm btn-ghost"} onClick={(e)=>{ e.stopPropagation(); setEditing(true); }}><Link2 size={big?15:11}/> {big?"Add cloud folder link":"Add link"}</button>
  );
}

// Small "copy to clipboard" icon button — pairs with any piece of contact info (phone, email,
// mobile) so it can be copied without selecting/retyping it. Briefly swaps to a checkmark as
// its own feedback instead of relying on a separate toast.
function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button type="button" className="btn btn-sm btn-ghost" title={copied ? "Copied!" : `Copy ${value}`} style={{ padding:3 }}
      onClick={(e)=>{
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false), 1500); });
      }}>
      {copied ? <Check size={12} style={{color:"var(--success)"}}/> : <Copy size={12}/>}
    </button>
  );
}

// A quotation's customer name, clickable through to that customer's profile card — matched by
// name since quotations only store the customer as a text snapshot (same lookup used elsewhere,
// e.g. QuoteDetailModal's customerEmail). Falls back to plain text if no matching customer record
// exists (e.g. it was since removed) rather than rendering a dead link.
function CustomerNameLink({ name, state, onOpen }) {
  const cust = state?.customers.find(c => c.name === name);
  if (!cust) return <>{name}</>;
  return (
    <button type="button" onClick={(e)=>{ e.stopPropagation(); onOpen(cust); }}
      style={{ background:"none", border:"none", padding:0, font:"inherit", color:"var(--brand)", textDecoration:"underline", cursor:"pointer" }}>
      {name}
    </button>
  );
}

/* ---------------------------------------------------------------------- */
/* NAV CONFIG                                                             */
/* ---------------------------------------------------------------------- */

const NAV = [
  { group: "Overview", items: [{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: "all" }] },
  { group: "CRM", items: [
    // Ops Manager/Ops Member see these too now — scoped server-side to just their own (a lead
    // they added via the Dashboard quick-add, and whatever deal/quotation grows out of it), the
    // same "own data only" restriction a plain Sales Exec already has — not full team access.
    { key: "leads", label: "Leads", icon: Users, roles: [...ADMIN_LIKE,"sales_manager","sales_exec","ops_manager","ops_member","pro_head","pro"] },
    { key: "deals", label: "Deals", icon: Handshake, roles: [...ADMIN_LIKE,"sales_manager","sales_exec","ops_manager","ops_member","pro_head","pro"] },
    { key: "quotations", label: "Quotations", icon: FileText, roles: [...ADMIN_LIKE,"sales_manager","sales_exec","ops_manager","ops_member","pro_head","pro"] },
    { key: "customers", label: "Customers & KYC", icon: UserCheck, roles: [...ADMIN_LIKE,"sales_manager","sales_exec","accounts","ops_manager","pro_head","pro"] },
  ]},
  { group: "Finance", items: [
    { key: "orders", label: "Sales Orders", icon: ShoppingCart, roles: [...ADMIN_LIKE,"sales_manager","accounts"] },
    { key: "invoices", label: "Invoices", icon: Receipt, roles: [...ADMIN_LIKE,"accounts","sales_manager"] },
    { key: "companyFinance", label: "Company Finance", icon: Landmark, roles: [...ADMIN_LIKE,"accounts"] },
  ]},
  { group: "Operations", items: [
    { key: "jobs", label: "Job Cards", icon: ClipboardList, roles: [...ADMIN_LIKE,"ops_manager","ops_member","accounts","sales_manager","sales_exec","pro_head","pro"] },
    { key: "tasks", label: "Tasks", icon: ListChecks, roles: "all" },
  ]},
  { group: "Subscriptions", items: [
    { key: "subscriptions", label: "Subscriptions", icon: Repeat, roles: [...ADMIN_LIKE,"sales_manager","sales_exec","accounts"] },
  ]},
  { group: "People", items: [
    { key: "incentives", label: "Incentives", icon: Coins, roles: "all" },
    { key: "hr", label: "HR", icon: Briefcase, roles: "all" },
    { key: "attendance", label: "Attendance", icon: Clock, roles: "all" },
    { key: "knowledgeBase", label: "Knowledge Base", icon: BookOpen, roles: "all" },
    { key: "users", label: "Users & Roles", icon: UserCog, roles: ["super_admin","admin"] },
  ]},
  { group: "Data Manager", items: [
    { key: "dataManager", label: "Data Manager", icon: Database, roles: [...ADMIN_LIKE,"data_manager","sales_manager","sales_exec"] },
  ]},
  { group: "Lead Assignment Manager", items: [
    { key: "leadAssignment", label: "Lead Assignment Manager", icon: UserPlus, roles: [...ADMIN_LIKE,"lead_manager","sales_manager"] },
  ]},
  { group: "Insights", items: [
    // Open to every role — every department gets company performance visibility, not just
    // Admin-tier/Sales Manager/Accounts/Executive as before.
    { key: "reports", label: "Reports", icon: BarChart3, roles: "all" },
    { key: "quotationTemplates", label: "Quotation Templates", icon: Files, roles: [...ADMIN_LIKE,"sales_manager"] },
    { key: "templates", label: "Checklist Templates", icon: ListChecks, roles: [...ADMIN_LIKE,"ops_manager","pro_head","pro"] },
  ]},
  { group: "", items: [
    { key: "notifications", label: "Notifications", icon: Bell, roles: "all" },
    { key: "settings", label: "Settings", icon: SettingsIcon, roles: ["super_admin","admin"] },
  ]},
];

/* ---------------------------------------------------------------------- */
/* LOGIN                                                                   */
/* ---------------------------------------------------------------------- */

function LoadingScreen() {
  return (
    <div className="agw agw-loader">
      <style>{CSS}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className="agw-loader-mark">
          <div className="agw-loader-ring" />
          <div className="agw-loader-logo">
            <img src="/logo-address-gateway.png" alt="Address Gateway" />
          </div>
        </div>
        <div className="agw-loader-sub"><img src="/logo-smart-crm.png" alt="Smart CRM" /></div>
        <div className="agw-loader-text">Loading your workspace…</div>
      </div>
    </div>
  );
}

function Login({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "forgot-email" | "forgot-reset" | "forgot-done"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.auth.login(email, password);
      setToken(res.token);
      onLogin(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const res = await api.auth.forgotPassword(email);
      setInfo(res.message);
      setMode("forgot-reset");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await api.auth.resetPassword(email, otp, newPassword);
      setMode("forgot-done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const backToLogin = () => { setMode("login"); setError(""); setInfo(""); setOtp(""); setNewPassword(""); setPassword(""); };

  return (
    <div className="agw" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page)" }}>
      <style>{CSS}</style>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      {mode === "login" && (
        <form onSubmit={submit} className="agw-card" style={{ width: 360, padding: "28px 26px" }}>
          <div style={{ marginBottom: 22 }}><BrandLogo scale={1.05} /></div>
          <h3 style={{ marginBottom: 4 }}>Sign in</h3>
          <p className="modal-sub">Use your Address Gateway account.</p>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoFocus required /></div>
          <div className="field"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></div>
          {error && <div className="side-note" style={{ borderColor:"var(--danger)", color:"var(--danger)", marginTop:0 }}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
            onClick={() => { setMode("forgot-email"); setError(""); }}>Forgot password?</button>
        </form>
      )}

      {mode === "forgot-email" && (
        <form onSubmit={sendCode} className="agw-card" style={{ width: 360, padding: "28px 26px" }}>
          <div style={{ marginBottom: 22 }}><BrandLogo scale={1.05} /></div>
          <h3 style={{ marginBottom: 4 }}>Forgot password</h3>
          <p className="modal-sub">Enter your account email — we'll send a 6-digit reset code.</p>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoFocus required /></div>
          {error && <div className="side-note" style={{ borderColor:"var(--danger)", color:"var(--danger)", marginTop:0 }}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
            {busy ? "Sending…" : "Send reset code"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={backToLogin}>Back to sign in</button>
        </form>
      )}

      {mode === "forgot-reset" && (
        <form onSubmit={resetPassword} className="agw-card" style={{ width: 360, padding: "28px 26px" }}>
          <div style={{ marginBottom: 22 }}><BrandLogo scale={1.05} /></div>
          <h3 style={{ marginBottom: 4 }}>Enter reset code</h3>
          <p className="modal-sub">{info || `A code was sent to ${email} if that account exists.`}</p>
          <div className="field"><label>6-digit code</label><input value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6} autoFocus required /></div>
          <div className="field"><label>New password</label><input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="At least 8 characters" required /></div>
          {error && <div className="side-note" style={{ borderColor:"var(--danger)", color:"var(--danger)", marginTop:0 }}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
            {busy ? "Resetting…" : "Reset password"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
            onClick={() => { setMode("forgot-email"); setError(""); }}>Didn't get a code? Try again</button>
        </form>
      )}

      {mode === "forgot-done" && (
        <div className="agw-card" style={{ width: 360, padding: "28px 26px", textAlign: "center" }}>
          <div style={{ marginBottom: 22 }}><BrandLogo scale={1.05} /></div>
          <h3 style={{ marginBottom: 4 }}>Password reset</h3>
          <p className="modal-sub">Your password has been changed. Sign in with your new password.</p>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={backToLogin}>Back to sign in</button>
        </div>
      )}
    </div>
  );
}

// Keeps every list page's data fresh without a full reload, but never fights the user mid-task:
// it only fires once the user has gone quiet for a while, and skips entirely while the tab is in
// the background. It also catches up immediately when the user comes back to a tab that's been
// hidden long enough for its data to be stale, matching how most SPAs refetch-on-focus.
// A full refresh() is a burst of ~25 parallel requests (one per data domain) — at a 2-minute
// interval, every idle open tab company-wide was repeating that burst 30x/hour on top of the
// backend's own polling, and was a real contributor to exhausting the MySQL account's
// max_connections_per_hour cap (see server.js). 15 minutes keeps data reasonably fresh without
// that load.
const AUTO_REFRESH_IDLE_MS = 60_000;
const AUTO_REFRESH_INTERVAL_MS = 900_000;
function useAutoRefresh(runRefresh, enabled) {
  const lastActivityRef = useRef(Date.now());
  const lastRefreshRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;
    const markActive = () => { lastActivityRef.current = Date.now(); };
    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];
    activityEvents.forEach(ev => window.addEventListener(ev, markActive, { passive: true }));

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      const idleFor = now - lastActivityRef.current;
      const sinceRefresh = now - lastRefreshRef.current;
      if (idleFor >= AUTO_REFRESH_IDLE_MS && sinceRefresh >= AUTO_REFRESH_INTERVAL_MS) {
        lastRefreshRef.current = now;
        runRefresh();
      }
    };
    const timer = setInterval(tick, 15_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshRef.current >= AUTO_REFRESH_INTERVAL_MS) {
        lastActivityRef.current = Date.now();
        lastRefreshRef.current = Date.now();
        runRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      activityEvents.forEach(ev => window.removeEventListener(ev, markActive));
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [runRefresh, enabled]);
}

/* ---------------------------------------------------------------------- */
/* MAIN APP                                                                */
/* ---------------------------------------------------------------------- */

export default function App() {
  // The app's one unauthenticated route — a client filling in their Onboarding Form via a shared
  // link never sees the login screen or the CRM shell at all. Checked before anything else in this
  // component (no token verification, no data fetch) since this path has no session to check.
  const publicOnboardingToken = window.location.pathname.match(/^\/onboarding\/([^/]+)\/?$/)?.[1];
  if (publicOnboardingToken) return <PublicOnboardingPage token={publicOnboardingToken} />;

  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeRole, setActiveRole] = useState(null);
  // Applied to <html> (not a prop threaded through every screen) since Login, LoadingScreen and
  // the main shell each render their own independent .agw root — see the CSS block's dark-theme
  // comment for why. Persisted so it survives a reload/reinstall as a PWA.
  const [theme, setTheme] = useState(() => localStorage.getItem("agw_theme") || "light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("agw_theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Browsers change a focused <input type=number>'s value on mouse-wheel scroll by default — no
  // opt-out attribute exists, so anyone scrolling the page while the cursor happens to be over a
  // Qty/Rate/Fee field silently mutates it. Blurring on wheel is the standard workaround; typing
  // is completely unaffected.
  useEffect(() => {
    const onWheel = (e) => { if (document.activeElement?.tagName === "INPUT" && document.activeElement.type === "number") document.activeElement.blur(); };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  // Clicking into a number field that's sitting at its default 0 (Professional Fee, Rate, Qty, ...)
  // used to just place the cursor next to that "0" — typing "77" then landed as "077" instead of
  // replacing it. Selecting the existing text on focus means the first keystroke always overwrites
  // it cleanly, same as clicking into any amount field that already has a value. The select() has
  // to happen on a deferred tick (not synchronously in the focusin handler) — a mouse click's own
  // focus fires on mousedown, and the browser's mouseup right after collapses whatever selection
  // was made back down to a plain caret at the click position, silently undoing it. Deferring with
  // setTimeout(0) runs the select() after that mouseup has already happened, so it sticks.
  useEffect(() => {
    const onFocusIn = (e) => {
      if (e.target?.tagName === "INPUT" && e.target.type === "number") {
        const el = e.target;
        setTimeout(() => { if (document.activeElement === el) el.select(); }, 0);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // A multi-role user's "Acting as" choice used to reset to roles[0] on every login — someone
  // whose roles array happens to list admin/hr/accounts before their actual day-to-day role (e.g.
  // an Operations Team Member also tagged Admin Executive) landed on the full unfiltered company
  // view every single session, with no obvious hint to switch, making their own assigned work look
  // like it wasn't there at all. Remembering their last pick per-user fixes that permanently.
  const activeRoleKey = (uid) => `agw_active_role_${uid}`;
  const pickActiveRole = (user) => {
    const saved = localStorage.getItem(activeRoleKey(user.id));
    return saved && user.roles.includes(saved) ? saved : user.roles[0];
  };
  const changeActiveRole = (r) => {
    setActiveRole(r);
    if (currentUser?.id) localStorage.setItem(activeRoleKey(currentUser.id), r);
  };

  // On load, if a token is already stored, verify it's still valid before showing the app.
  useEffect(() => {
    if (!getToken()) { setAuthChecked(true); return; }
    api.auth.me().then((me) => { setCurrentUser(me); setActiveRole(pickActiveRole(me)); }).catch(() => setToken(null)).finally(() => setAuthChecked(true));
  }, []);

  const handleLogin = (user) => { setCurrentUser(user); setActiveRole(pickActiveRole(user)); };
  const handleLogout = () => { clearAllTokens(); setCurrentUser(null); };

  // Real impersonation (not a cosmetic relabel) — the admin gets an actual token for the target
  // user, so the whole app (nav, data, every permission check) reflects exactly what that user's
  // role allows. A full reload re-runs the /auth/me + data-fetch cycle cleanly under the new token.
  const startViewAs = async (targetUserId) => {
    if (!targetUserId) return;
    try {
      const { token } = await api.auth.impersonate(targetUserId);
      beginImpersonation(token);
      window.location.reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't switch — please try again.");
    }
  };
  const returnToMyAccount = () => { endImpersonation(); window.location.reload(); };

  const { state, dispatch, loading: dataLoading, refresh } = useApiStore(!!currentUser);
  const [page, setPage] = useState("dashboard");
  const [showMore, setShowMore] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Manual + idle-triggered refresh share this one path so every list page (all fed from the
  // same client-side `state`) gets fresh data without a full page reload.
  const [refreshing, setRefreshing] = useState(false);
  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);
  useAutoRefresh(runRefresh, !!currentUser);
  // Set when "View quotation" is clicked from Deals, so QuotationsPage can highlight and
  // scroll to that specific row instead of leaving the user to hunt for it in the full list.
  const [highlightQuotationId, setHighlightQuotationId] = useState(null);
  // True only right after Build quotation creates a new one — makes QuotationsPage open it
  // straight into the PDF preview tab instead of just scrolling the row into view (see
  // viewQuotationFor vs. the QuoteBuilderModal onCreated callback below, in DealsPage).
  const [autoOpenQuotationPdf, setAutoOpenQuotationPdf] = useState(false);
  // Same pattern for the rest of the pipeline — set right after the record is created, so
  // jumping to its page always lands on and highlights the one just created instead of leaving
  // the user to hunt for it in a long list.
  const [highlightSalesOrderId, setHighlightSalesOrderId] = useState(null);
  const [highlightInvoiceId, setHighlightInvoiceId] = useState(null);
  const [highlightJobCardId, setHighlightJobCardId] = useState(null);

  // Desktop/mobile OS notifications for anything new in this user's own notification feed (job
  // card awaiting approval, lead assigned, ...), on top of the in-app bell. Combined with the 45s
  // poll in useApiStore, this is what makes the bell (and this) live instead of only updating after
  // this tab's own next action. Requires the user to have granted permission (see NotificationsPage).
  const notifiedIds = useRef(new Set());
  const notifSeeded = useRef(false);
  useEffect(() => {
    if (!currentUser) return;
    const myRole = activeRole || currentUser.roles[0];
    const myId = currentUser.id;
    const mine = state.notifications.filter(n => n.audience.includes(myRole) || n.audience.includes(myId));
    if (!notifSeeded.current) {
      // First time this session we see the list — mark everything already there as "seen" so
      // reloading doesn't re-fire a toast for every notification that already existed.
      mine.forEach(n => notifiedIds.current.add(n.id));
      notifSeeded.current = true;
      return;
    }
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    mine.filter(n => !n.read && !notifiedIds.current.has(n.id)).forEach(n => {
      notifiedIds.current.add(n.id);
      try { new Notification(n.title || "Address Gateway CRM", { body: n.body || "", icon: "/icon-192.png" }); } catch {}
    });
  }, [state.notifications, currentUser, activeRole]);

  if (!authChecked) return <LoadingScreen />;
  if (!currentUser) return <Login onLogin={handleLogin} />;
  if (dataLoading) return <LoadingScreen />;

  const viewingUser = state.employees.find(e => e.id === currentUser.id) || currentUser;
  const role = (viewingUser.roles || currentUser.roles).includes(activeRole) ? activeRole : (viewingUser.roles || currentUser.roles)[0];
  const userId = currentUser.id;

  // The server already scopes state.notifications to this account's full role set (see GET
  // /notifications) — re-filtering by just the single "Acting as" role here would silently hide
  // a multi-role user's own notifications addressed to a role they hold but aren't currently
  // acting as, so this has to check every role they hold, not just the active one.
  const myRoles = viewingUser.roles || currentUser.roles;
  const myNotifs = state.notifications.filter(n => n.audience.some(a => myRoles.includes(a)) || n.audience.includes(userId));
  const unreadCount = myNotifs.filter(n => !n.read).length;

  // Job Cards needing this viewer's attention — mirrors the notifications badge.
  const jobsBadgeCount = ADMIN_LIKE.includes(role)
    ? state.jobCards.filter(j => j.status === "Pending Approval" || j.status === "Created").length
    : role === "accounts" ? state.jobCards.filter(j => j.status === "Pending Approval").length
    : role === "ops_manager" || role === "pro_head" ? state.jobCards.filter(j => j.status === "Created").length
    : role === "ops_member" || role === "pro" ? state.jobCards.filter(j => j.status === "Assigned" && j.assignees.includes(userId)).length
    : 0;
  // Tasks needing this viewer's attention — mirrors the Job Cards badge above. Managers/admin see
  // tasks awaiting their approval decision; everyone else sees tasks newly assigned to them that
  // still need accepting. state.tasks is already scoped server-side (own tasks unless admin-tier),
  // so this never counts someone else's activity.
  const tasksBadgeCount = ADMIN_LIKE.includes(role) || ["sales_manager","ops_manager","hr","pro_head"].includes(role)
    ? state.tasks.filter(t => t.status === "Pending Approval").length
    : state.tasks.filter(t => t.status === "Assigned" && t.assignedTo === userId).length;
  const navBadge = (key) => key === "notifications" ? unreadCount : key === "jobs" ? jobsBadgeCount : key === "tasks" ? tasksBadgeCount : 0;

  // "all" modules (Dashboard, Tasks, Incentives, HR, Attendance, Knowledge Base, Reports,
  // Notifications) stay universally visible — that's a deliberate "every employee sees this"
  // choice, not something that needs per-user granting. Everything else is gated by the explicit
  // Module Access grid (Users & Roles > Module Access) instead of role-array matching — a
  // multi-role user's visible nav no longer depends on reasoning through which of their roles
  // happens to be listed on which item, or which one they're currently "Acting as". Admin-tier
  // always sees everything, matching the backend's requireModuleView bypass.
  const visibleNav = NAV.map(g => ({ ...g, items: g.items.filter(i =>
    i.roles === "all" || ADMIN_LIKE.includes(role) || state.myModulePermissions[i.key]?.canView
  ) })).filter(g => g.items.length);

  // Bottom tab bar (mobile only): Dashboard + up to 2 role-relevant items + Notifications + More.
  const flatNav = visibleNav.flatMap(g => g.items);
  const bottomExtra = flatNav.filter(i => i.key !== "dashboard" && i.key !== "notifications").slice(0, 2);

  const ctx = { state, dispatch, role, userId, unreadCount };

  const titles = {
    dashboard: ["Dashboard", "Company-wide snapshot"],
    leads: ["Leads", "Every enquiry, from first contact to qualification"],
    deals: ["Deals", "Open opportunities across the sales pipeline"],
    quotations: ["Quotations", "Draft, price, discount and send client quotations"],
    quotationTemplates: ["Quotation Templates", "A reusable starting point for each service — refine anytime"],
    customers: ["Customers & KYC", "Client records, employee documents, and expiry status"],
    dataManager: ["Data Manager", "Collect, clean, assign and track outreach data — separate from CRM Leads"],
    subscriptions: ["Subscriptions", "Growth Partner Program packages and customer subscription tracking"],
    orders: ["Sales Orders", "Confirmed orders converted from approved quotations"],
    invoices: ["Invoices", "Billing, payments and outstanding balances"],
    companyFinance: ["Company Finance", "Cheques (in and out) and company software subscription expenses"],
    jobs: ["Job Cards", "Operations board — assignment through completion"],
    tasks: ["Tasks", "Assign, track and approve employee tasks through to completion"],
    incentives: ["Incentives", "Daily, weekly and monthly incentive tracking"],
    hr: ["HR", "Employee records and document expiry"],
    attendance: ["Attendance", "Sign in/out, monthly hours, late arrivals and early departures"],
    leadAssignment: ["Lead Assignment Manager", "Assign leads and monitor the first-follow-up SLA"],
    knowledgeBase: ["Knowledge Base", "How to use SMART CRM — guides and workflow reference"],
    users: ["Users & Roles", "Manage platform access"],
    templates: ["Checklist Templates", "Configure the job checklist for each service"],
    reports: ["Reports", "Business volume, collections, customers, incentives and operations — all Professional Fee based"],
    notifications: ["Notifications", "Everything the platform has flagged for you"],
    settings: ["Settings", "Platform-wide configuration"],
  };

  return (
    <div className="agw" style={{ height: "100%" }}>
      <style>{CSS}</style>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div className="agw-shell">
        <aside className={`agw-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <button className="agw-collapse-btn" onClick={() => setSidebarCollapsed(v => !v)} title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}>
            {sidebarCollapsed ? <ChevronsRight size={14}/> : <ChevronsLeft size={14}/>}
          </button>
          <div className="agw-brand">
            {sidebarCollapsed ? (
              <div style={{ width:34, height:34, borderRadius:"50%", border:"1.5px solid var(--gold)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span className="disp" style={{ fontSize:13, fontWeight:500, color:"var(--gold)" }}>AG</span>
              </div>
            ) : (
              <>
                <div className="agw-brand-wordmark"><BrandLogo scale={0.92} onDark /></div>
                <img src="/logo-smart-crm.png" alt="Smart CRM" className="agw-brand-sub" style={{ display: "block", height: 40, width: "auto" }} />
              </>
            )}
          </div>
          <nav className="agw-nav">
            {visibleNav.map(g => (
              <div key={g.group || g.items[0].key}>
                {g.group && <div className="agw-nav-group">{g.group}</div>}
                {g.items.map(item => (
                  <button key={item.key} className={`agw-nav-item ${page === item.key ? "active" : ""}`} onClick={() => setPage(item.key)} title={sidebarCollapsed ? item.label : undefined}>
                    <item.icon size={16} />
                    <span className="agw-nav-label">{item.label}</span>
                    {navBadge(item.key) > 0 && <span className="agw-nav-badge">{navBadge(item.key)}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          {sidebarCollapsed ? (
            <div className="agw-userbox">
              <button onClick={() => setSidebarCollapsed(false)} title={`Logged in as ${currentUser.name} — click to expand`}
                style={{ width:30, height:30, borderRadius:"50%", background:"var(--brand)", color:"#fff", border:"none",
                  fontSize:11.5, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {currentUser.initials}
              </button>
            </div>
          ) : (
            <div className="agw-userbox">
              {currentUser.roles.length > 1 && (
                <>
                  <label>Acting as</label>
                  <select value={role} onChange={e => changeActiveRole(e.target.value)}>
                    {currentUser.roles.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </>
              )}
              {(isImpersonating() || ADMIN_LIKE.includes(role)) && (
                <>
                  <label style={{ marginTop: 10 }}>{isImpersonating() ? "Viewing as" : "View as (testing)"}</label>
                  <select value={isImpersonating() ? userId : ""} onChange={e => startViewAs(e.target.value)}>
                    {!isImpersonating() && <option value="">Select a user…</option>}
                    {state.employees.filter(e => e.active !== false).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </>
              )}
              {isImpersonating() && (
                <button className="btn btn-sm" style={{ width: "100%", marginTop: 8, justifyContent: "center" }} onClick={returnToMyAccount}>Return to my account</button>
              )}
              {/* This user's own Google Drive folder (set on their HR Profile) — one click away
                  from wherever they are in the app, instead of hunting through HR to find it. */}
              {viewingUser.cloudLink && (
                <a href={viewingUser.cloudLink} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ width: "100%", marginTop: 10, justifyContent: "center", textDecoration:"none" }}>
                  <Link2 size={13} style={{marginRight:6}}/> My Google Drive
                </a>
              )}
              <button className="btn btn-sm" style={{ width: "100%", marginTop: 10, justifyContent: "center" }} onClick={handleLogout}>Log out</button>
            </div>
          )}
        </aside>

        <main className="agw-main">
          <div className="agw-topbar">
            <div>
              <h1 className="disp">{titles[page][0]}</h1>
              <div className="agw-topbar-sub">{titles[page][1]}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button className="theme-toggle" onClick={runRefresh} disabled={refreshing} title="Refresh data">
                <RefreshCw size={16} className={refreshing ? "agw-spin" : ""} />
              </button>
              <button className="theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="agw-bell" onClick={() => setPage("notifications")}>
                <Bell size={17} />
                {unreadCount > 0 && <span className="dot" />}
              </button>
              <div style={{ display:"flex", alignItems:"center", gap:9, paddingLeft:14, borderLeft:"1px solid rgba(255,255,255,.35)" }}>
                {viewingUser.photoUrl ? (
                  <img src={viewingUser.photoUrl} alt={viewingUser.name} style={{ width:34, height:34, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
                ) : (
                  <div style={{ width:34, height:34, borderRadius:"50%", background:"rgba(255,255,255,.25)", color:"#fff",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:12.5, fontWeight:600, flexShrink:0 }}>
                    {viewingUser.initials}
                  </div>
                )}
                <div className="agw-profile-name" style={{ lineHeight:1.25, whiteSpace:"nowrap" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{viewingUser.name}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,.82)" }}>{viewingUser.designation}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="agw-content">
            {page === "dashboard" && <Dashboard {...ctx} setPage={setPage} />}
            {page === "leads" && <LeadsPage {...ctx} setPage={setPage} />}
            {page === "deals" && <DealsPage {...ctx} setPage={setPage} onViewQuotation={(id, openPdf)=>{ setHighlightQuotationId(id); setAutoOpenQuotationPdf(!!openPdf); }} />}
            {page === "quotations" && <QuotationsPage {...ctx} highlightId={highlightQuotationId} autoOpenPdf={autoOpenQuotationPdf} onHighlightHandled={()=>{ setHighlightQuotationId(null); setAutoOpenQuotationPdf(false); }}
              setPage={setPage} onSalesOrderCreated={setHighlightSalesOrderId} />}
            {page === "quotationTemplates" && <QuotationTemplatesPage {...ctx} />}
            {page === "customers" && <CustomersPage {...ctx} />}
            {page === "dataManager" && <DataManagerPage {...ctx} />}
            {page === "subscriptions" && <SubscriptionsPage {...ctx} />}
            {page === "orders" && <OrdersPage {...ctx} setPage={setPage} highlightId={highlightSalesOrderId} onHighlightHandled={()=>setHighlightSalesOrderId(null)}
              onInvoiceCreated={setHighlightInvoiceId} />}
            {page === "invoices" && <InvoicesPage {...ctx} setPage={setPage} highlightId={highlightInvoiceId} onHighlightHandled={()=>setHighlightInvoiceId(null)}
              onJobCardTarget={setHighlightJobCardId} />}
            {page === "companyFinance" && <CompanyFinancePage {...ctx} />}
            {page === "jobs" && <JobsPage {...ctx} highlightId={highlightJobCardId} onHighlightHandled={()=>setHighlightJobCardId(null)} />}
            {page === "tasks" && <TasksPage {...ctx} />}
            {page === "incentives" && <IncentivesPage {...ctx} />}
            {page === "hr" && <HrPage {...ctx} />}
            {page === "attendance" && <AttendancePage {...ctx} />}
            {page === "leadAssignment" && <LeadAssignmentManagerPage {...ctx} />}
            {page === "knowledgeBase" && <KnowledgeBasePage />}
            {page === "users" && <UsersPage {...ctx} />}
            {page === "templates" && <TemplatesPage {...ctx} />}
            {page === "reports" && <ReportsPage {...ctx} />}
            {page === "notifications" && <NotificationsPage {...ctx} myNotifs={myNotifs} />}
            {page === "settings" && <SettingsPage {...ctx} setPage={setPage} />}
          </div>
        </main>
      </div>
      <TableScrollHint />

      <nav className="agw-bottom-nav">
        <button className={`agw-bottom-item ${page==="dashboard"?"active":""}`} onClick={()=>setPage("dashboard")}>
          <LayoutDashboard size={20}/><span>Home</span>
        </button>
        {bottomExtra.map(item => (
          <button key={item.key} className={`agw-bottom-item ${page===item.key?"active":""}`} onClick={()=>setPage(item.key)}>
            <item.icon size={20}/><span>{item.label}</span>
          </button>
        ))}
        <button className={`agw-bottom-item ${page==="notifications"?"active":""}`} onClick={()=>setPage("notifications")}>
          <Bell size={20}/>{unreadCount > 0 && <span className="dot" />}<span>Alerts</span>
        </button>
        <button className={`agw-bottom-item ${showMore?"active":""}`} onClick={()=>setShowMore(true)}>
          <MoreHorizontal size={20}/><span>More</span>
        </button>
      </nav>

      {showMore && (
        <div className="agw-more-sheet">
          <div className="agw-more-backdrop" onClick={()=>setShowMore(false)} />
          <div className="agw-more-panel">
            <div className="agw-more-handle" />
            <div style={{ padding: "0 12px 14px" }}><BrandLogo scale={0.85} onDark /></div>
            <nav className="agw-nav" style={{ padding: "0 8px", overflow: "visible" }}>
              {visibleNav.map(g => (
                <div key={g.group || g.items[0].key}>
                  {g.group && <div className="agw-nav-group">{g.group}</div>}
                  {g.items.map(item => (
                    <button key={item.key} className={`agw-nav-item ${page === item.key ? "active" : ""}`} onClick={() => { setPage(item.key); setShowMore(false); }}>
                      <item.icon size={16} />
                      {item.label}
                      {navBadge(item.key) > 0 && <span className="agw-nav-badge">{navBadge(item.key)}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className="agw-userbox" style={{ marginTop: 8 }}>
              {currentUser.roles.length > 1 && (
                <>
                  <label>Acting as</label>
                  <select value={role} onChange={e => changeActiveRole(e.target.value)}>
                    {currentUser.roles.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </>
              )}
              {(isImpersonating() || ADMIN_LIKE.includes(role)) && (
                <>
                  <label style={{ marginTop: 10 }}>{isImpersonating() ? "Viewing as" : "View as (testing)"}</label>
                  <select value={isImpersonating() ? userId : ""} onChange={e => startViewAs(e.target.value)}>
                    {!isImpersonating() && <option value="">Select a user…</option>}
                    {state.employees.filter(e => e.active !== false).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </>
              )}
              {isImpersonating() && (
                <button className="btn btn-sm" style={{ width: "100%", marginTop: 8, justifyContent: "center" }} onClick={returnToMyAccount}>Return to my account</button>
              )}
              {viewingUser.cloudLink && (
                <a href={viewingUser.cloudLink} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ width: "100%", marginTop: 10, justifyContent: "center", textDecoration:"none" }}>
                  <Link2 size={13} style={{marginRight:6}}/> My Google Drive
                </a>
              )}
              <button className="btn btn-sm" style={{ width: "100%", marginTop: 10, justifyContent: "center" }} onClick={() => { handleLogout(); setShowMore(false); }}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* DASHBOARD                                                               */
/* ---------------------------------------------------------------------- */

function Dashboard({ state, dispatch, role, userId, setPage }) {
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range } = usePeriod("month");
  const showPeriod = role !== "ops_manager" && role !== "ops_member" && role !== "hr" && role !== "pro_head" && role !== "pro";

  const openLeads = state.leads.filter(l => !["Unqualified"].includes(l.status)).length;
  const pipelineValue = state.deals.filter(d => d.stage !== "Lost").reduce((a,d) => a + d.value, 0);
  // Pending collection only ever counts the Professional Fee portion of an invoice — Government
  // Fee is a pass-through the client owes regardless, never Address Gateway's own money to collect.
  const outstanding = state.invoices.reduce((a,inv) => a + Math.max(0, inv.professionalFeeAmount - inv.payments.reduce((x,p)=>x+p.amount,0)), 0);
  // Only the Professional Fee portion of a quotation counts as business volume — see
  // professionalFeeAmount above (handles quotations that mix Professional + Government Fee items).
  const quoteAmount = (q) => professionalFeeAmount(q.items, q.orderDiscount, q.feeType, q.orderDiscountType);

  const periodQuotes = state.quotations.filter(q => q.status === "Approved" && q.feeType !== "Government Fee" && inRange(q.createdAt, range));
  const businessVolume = periodQuotes.reduce((a,q) => a + quoteBusinessVolume(q, state.serviceCosts), 0);
  const periodInvoices = state.invoices.filter(inv => inv.feeType !== "Government Fee" && inRange(inv.createdAt, range));
  const periodInvoiced = periodInvoices.reduce((a,inv)=>a+inv.amount,0);
  const periodCollected = state.invoices.reduce((a,inv) => a + inv.payments.filter(p=>inRange(p.date, range)).reduce((x,p)=>x+p.amount,0), 0);
  const periodLeads = state.leads.filter(l => inRange(l.createdAt, range)).length;
  const periodJobsCompleted = state.jobCards.filter(j => j.status==="Completed" && j.statusLog?.some(s=>s.status==="Completed" && inRange(s.at, range))).length;

  // Leads handed to this user by the Lead Manager vs. ones they brought in themselves. assignedAt
  // is only ever stamped on a central-distribution hand-off (see leads.routes.js), so it's exactly
  // what separates the two — a rep's self-added lead is owned from creation and never gets one.
  const myAssignedLeads = state.leads.filter(l => l.owner === userId && l.assignedAt).length;
  const myOwnLeads = state.leads.filter(l => l.owner === userId && !l.assignedAt).length;

  // Total value quoted in the period, regardless of outcome — the top of the funnel, where
  // "Business volume" above counts only the Approved ones.
  const periodQuotationsValue = state.quotations.filter(q => inRange(q.createdAt, range)).reduce((a,q) => a + quoteAmount(q), 0);
  // won_at was added to deals long after the table itself, so deals closed before that column
  // existed have none — fall back to createdAt, otherwise every historical win drops out entirely.
  const closedDealValue = state.deals
    .filter(d => d.stage === "Won" && inRange(d.wonAt || d.createdAt, range))
    .reduce((a,d) => a + d.value, 0);
  // GET /invoices deliberately also hands a plain sales_exec any invoice with no linked sales
  // order (e.g. subscription billing) so someone is responsible for chasing it — but that means
  // the exact same unattributed balance lands in every sales_exec's invoice list identically, not
  // just whoever actually sold the underlying business. Summed blind, "Pending collection" ends up
  // double-(triple-, ...)counting that shared balance into every rep's own figure. Every other role
  // that reaches this KPI (sales_manager, admin-tier, ...) gets a genuinely unscoped invoice list
  // from the backend, so `outstanding` is already the true company-wide total for them — only
  // sales_exec needs restricting to invoices actually traceable back to their own quotations.
  const myQuotationIds = new Set(state.quotations.filter(q => q.owner === userId).map(q => q.id));
  const mySalesOrderIds = new Set(state.salesOrders.filter(so => myQuotationIds.has(so.quotationId)).map(so => so.id));
  const myOutstanding = state.invoices
    .filter(inv => inv.salesOrderId && mySalesOrderIds.has(inv.salesOrderId))
    .reduce((a,inv) => a + Math.max(0, inv.professionalFeeAmount - inv.payments.reduce((x,p)=>x+p.amount,0)), 0);

  const jobsInProgress = state.jobCards.filter(j => ["Assigned","In Progress","On Hold"].includes(j.status)).length;
  const jobsCompleted = state.jobCards.filter(j => j.status === "Completed").length;
  const jobsCancelled = state.jobCards.filter(j => j.status === "Cancelled").length;
  const expiringDocs = state.customers.flatMap(c => [
    ...c.docs.filter(d => docState(d.expiry).label !== "Valid").map(d => ({ ...d, label: c.name })),
    ...c.employees.flatMap(emp => emp.docs.filter(d => docState(d.expiry).label !== "Valid").map(d => ({ ...d, label: `${c.name} — ${emp.name}` }))),
  ]);

  // Admin/Accounts-only reminder feed — a one-time notification+email already fired for these (see
  // src/services/companyFinanceJobs.js) once they crossed their due window, but this card stays
  // live and visible the whole time something is unresolved, same as the expiry watchlist above.
  const canSeeCompanyFinance = ADMIN_LIKE.includes(role) || role === "accounts";
  const upcomingCheques = state.cheques.filter(c => c.status === "Pending" && new Date(c.depositDate) - new Date() <= 7*86400000);
  const upcomingRenewals = state.companySoftwareSubscriptions.filter(s => s.status === "Active" && new Date(s.renewalDate) - new Date() <= 14*86400000);

  const myJobs = state.jobCards.filter(j => j.assignees.includes(userId));

  // Every user's Dashboard shows this — not just sales — since a closed deal is company-wide good
  // news. Grouped by salesperson (a person can close more than one in a day) and keyed off won_at
  // (when the deal actually closed), not created_at (when it was first opened, possibly weeks ago).
  const [showAllClosed, setShowAllClosed] = useState(false);
  const today = daysFromNow(0);
  const todayWonDeals = state.deals.filter(d => d.stage === "Won" && (d.wonAt || "").slice(0,10) === today);
  const closedByOwner = {};
  todayWonDeals.forEach(d => { if (d.owner) (closedByOwner[d.owner] ||= []).push(d); });
  const closedOwners = Object.entries(closedByOwner)
    .map(([uid, deals]) => ({ employee: state.employees.find(e=>e.id===uid), deals }))
    .filter(x => x.employee)
    .sort((a,b) => b.deals.length - a.deals.length);

  // Top customers by Professional Fee business volume within the selected period.
  const byCustomer = {};
  periodQuotes.forEach(q => { byCustomer[q.customer] = (byCustomer[q.customer]||0) + quoteBusinessVolume(q, state.serviceCosts); });
  const topCustomers = Object.entries(byCustomer).sort((a,b)=>b[1]-a[1]).slice(0,6);

  // Per-salesperson leads/deals/quotations/collections breakdown — admin and sales managers see the
  // whole team; a sales_exec sees the exact same layout scoped to just themselves, so "their own
  // dashboard follows the same type" as the team view instead of getting a different design.
  const isSalesTeamRole = isSalesRole(role);
  const salesOwners = role === "sales_exec"
    ? state.employees.filter(e => e.id === userId)
    : state.employees.filter(e => e.roles.includes("sales_exec") || e.roles.includes("sales_manager"));
  const salesPersonRows = !isSalesTeamRole ? [] : salesOwners.map(owner => {
    const leads = state.leads.filter(l => l.owner===owner.id && inRange(l.createdAt, range));
    const allOwnedDealIds = new Set(state.deals.filter(d => d.owner===owner.id).map(d => d.id));
    const deals = state.deals.filter(d => d.owner===owner.id && inRange(d.createdAt, range));
    const dealsWon = deals.filter(d => d.stage==="Won").length;
    const quotes = state.quotations.filter(q => ((q.dealId && allOwnedDealIds.has(q.dealId)) || q.owner===owner.id) && inRange(q.createdAt, range));
    const quoteIds = new Set(quotes.map(q=>q.id));
    const salesOrders = state.salesOrders.filter(so => quoteIds.has(so.quotationId));
    const soIds = new Set(salesOrders.map(so=>so.id));
    const invoices = state.invoices.filter(inv => soIds.has(inv.salesOrderId) && inRange(inv.createdAt, range));
    const businessVol = quotes.filter(q => q.status==="Approved" && q.feeType!=="Government Fee").reduce((a,q)=>a+quoteBusinessVolume(q, state.serviceCosts),0);
    const collected = invoices.reduce((a,inv)=>a+inv.payments.reduce((x,p)=>x+p.amount,0),0);
    const pendingCollection = invoices.reduce((a,inv)=>a+Math.max(0, inv.professionalFeeAmount - inv.payments.reduce((x,p)=>x+p.amount,0)),0);
    const pendingLeads = leads.filter(l => !["Qualified","Unqualified","Converted"].includes(l.status)).length;
    const pendingQuotes = quotes.filter(q => !["Approved","Rejected","Expired"].includes(q.status)).length;
    return { owner, leadsCount: leads.length, dealsCount: deals.length, dealsWon, quotesCount: quotes.length,
      businessVolume: businessVol, collected, pendingCollection, pendingLeads, pendingQuotes };
  }).sort((a,b) => b.businessVolume - a.businessVolume);

  // Sales Daily Tasks widget data — same shape userTaskSnapshot expects everywhere it's used
  // (this Dashboard block, the Reports tab, and the Sales Daily Tasks page itself).
  const salesTaskData = { logs: state.salesTaskLogs || [], quotations: state.quotations, salesOrders: state.salesOrders, invoices: state.invoices };

  // Content Creator's own tasks and their 9-stage production progress — only ever computed for
  // that role, but cheap enough (own tasks are already scoped server-side) to just build unconditionally.
  const myContentTasks = role === "content_creator"
    ? state.tasks.filter(t => t.assignedTo === userId && t.contentStages?.length > 0).map(t => ({ task: t, snap: contentStageSnapshot(t.contentStages) }))
    : [];
  const myContentActive = myContentTasks.filter(({ task: t }) => !["Completed","Rejected","Cancelled"].includes(t.status));
  const myContentOnTime = myContentTasks.reduce((a,{snap})=>a+snap.onTimeCount, 0);
  const myContentLate = myContentTasks.reduce((a,{snap})=>a+snap.lateCount, 0);
  const myContentOnTimePct = (myContentOnTime + myContentLate) > 0 ? Math.round((myContentOnTime / (myContentOnTime + myContentLate)) * 100) : 100;
  const myContentStagesDone = myContentTasks.reduce((a,{snap})=>a+snap.completedCount, 0);

  // --- Charts tab data -------------------------------------------------------------------------
  const [chartTab, setChartTab] = useState("overview");
  // A lightweight "log a lead" action for roles that don't get the full Leads page (only
  // admin-tier/sales_manager/sales_exec do — see NAV in App.jsx) — everyone else can still capture
  // an enquiry they come across without seeing the Leads list/pipeline. A Viewer never gets this
  // either, being strictly read-only everywhere.
  // Ops Manager/Ops Member now have the full Leads page (own-data-scoped) via NAV, so the
  // Dashboard quick-add would just be a second, redundant "add lead" entry point for them.
  const canQuickAddLead = !isSalesRole(role) && role !== "viewer" && role !== "ops_manager" && role !== "ops_member" && role !== "pro_head" && role !== "pro";
  const [showQuickAddLead, setShowQuickAddLead] = useState(false);

  // Operational, cross-service view of every Company Formation job card's progress — the people
  // who actually run that work (Ops Manager, PRO Head/PRO) plus oversight roles (Admin-tier,
  // Viewer). Everyone else already gets their own Dashboard tabs and doesn't need this one.
  const canSeeFormations = ADMIN_LIKE.includes(role) || ["viewer", "pro_head", "pro", "ops_manager"].includes(role);
  const [showDoneFormations, setShowDoneFormations] = useState(false);
  const formationJobs = state.jobCards.filter(j => (j.service || "").includes("Company Formation"));
  const formationStatusColors = { Created:"var(--ink-soft)", Assigned:"var(--info)", "In Progress":"var(--gold)", "On Hold":"var(--warning)", Completed:"var(--success)", Cancelled:"var(--danger)" };
  const formationStatusCounts = Object.keys(formationStatusColors)
    .map(s => ({ label: s, value: formationJobs.filter(j => j.status === s).length, color: formationStatusColors[s] }));
  const visibleFormationJobs = (showDoneFormations ? formationJobs : formationJobs.filter(j => !["Completed", "Cancelled"].includes(j.status)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const dealStageColors = { Open:"var(--info)", "Quotation Sent":"var(--gold)", Won:"var(--success)", Lost:"var(--danger)" };
  const dealsByStage = ["Open","Quotation Sent","Won","Lost"].map(stage => ({
    label: stage, value: state.deals.filter(d=>d.stage===stage).length, color: dealStageColors[stage],
  }));

  const jobStatusColors = { "Pending Approval":"var(--warning)", Created:"var(--ink-soft)", Assigned:"var(--info)", "In Progress":"var(--gold)", "On Hold":"var(--warning)", Completed:"var(--success)", Cancelled:"var(--danger)" };
  const jobsByStatus = ["Pending Approval","Created","Assigned","In Progress","On Hold","Completed","Cancelled"]
    .map(s => ({ label:s, value: state.jobCards.filter(j=>j.status===s).length, color: jobStatusColors[s] }))
    .filter(d => d.value > 0);

  const sourcePalette = ["var(--brand)","var(--gold)","var(--info)","var(--success)","var(--danger)","var(--warning)"];
  const sourceCounts = {};
  state.leads.forEach(l => { const s = l.source || "Other"; sourceCounts[s] = (sourceCounts[s]||0) + 1; });
  const leadsBySource = Object.entries(sourceCounts).sort((a,b)=>b[1]-a[1]).slice(0,6)
    .map(([label,value],i) => ({ label, value, color: sourcePalette[i % sourcePalette.length] }));

  const invoiceStatusColors = { Sent:"var(--info)", "Partially Paid":"var(--warning)", Paid:"var(--success)", Overdue:"var(--danger)" };
  const invoicesByStatus = ["Sent","Partially Paid","Paid","Overdue"]
    .map(s => ({ label:s, value: state.invoices.filter(i=>i.status===s).length, color: invoiceStatusColors[s] }))
    .filter(d => d.value > 0);

  // Trailing 6 months, oldest first.
  const monthKeys = [], monthLabels = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
    monthLabels.push(d.toLocaleDateString("en-GB", { month:"short" }));
  }
  const volumeByMonth = monthKeys.map(key =>
    state.quotations.filter(q => q.status==="Approved" && q.feeType!=="Government Fee" && (q.createdAt||"").slice(0,7)===key)
      .reduce((a,q)=>a+quoteBusinessVolume(q, state.serviceCosts), 0)
  );
  const collectedByMonth = monthKeys.map(key =>
    state.invoices.reduce((a,inv) => a + inv.payments.filter(p=>(p.date||"").slice(0,7)===key).reduce((x,p)=>x+p.amount,0), 0)
  );

  // Shown on every role's dashboard, whatever else that role sees — leads handed to you and leads
  // you sourced yourself are tracked separately so neither hides inside a single combined count.
  const myLeadKpis = [
    { label: "Assigned leads", value: myAssignedLeads, page: "leads" },
    { label: "My leads", value: myOwnLeads, page: "leads" },
  ];
  // The money funnel: quoted -> won -> collected -> still owed. Collected is period-scoped;
  // pending is the live total owed across all invoices, since a balance isn't a period figure.
  const valueKpis = [
    { label: "Quotations value", value: money(periodQuotationsValue), page: "quotations" },
    { label: "Closed deal value", value: money(closedDealValue), page: "deals" },
    { label: "Payment collected", value: money(periodCollected), page: "invoices" },
    { label: "Pending collection", value: money(role === "sales_exec" ? myOutstanding : outstanding), page: "invoices" },
  ];

  // Every KPI links to the page it's counted from — clicking the number takes you straight there
  // instead of leaving you to find the right nav item yourself.
  const kpis = ["ops_manager","ops_member","pro_head","pro"].includes(role) ? [
    { label: "Jobs in progress", value: jobsInProgress, page: "jobs" },
    { label: "Completed", value: jobsCompleted, page: "jobs" },
    { label: "Cancelled", value: jobsCancelled, page: "jobs" },
    { label: (role === "ops_member" || role === "pro") ? "Assigned to me" : "Unassigned jobs", value: (role === "ops_member" || role === "pro") ? myJobs.length : state.jobCards.filter(j=>j.assignees.length===0).length, page: "jobs" },
    ...myLeadKpis,
  ] : role === "accounts" ? [
    { label: "Outstanding balance", value: money(outstanding), page: "invoices" },
    { label: "Invoiced this period", value: money(periodInvoiced), page: "invoices" },
    { label: "Collected this period", value: money(periodCollected), page: "invoices" },
    { label: "Paid in full", value: state.invoices.filter(i=>i.status==="Paid").length, page: "invoices" },
    ...myLeadKpis,
  ] : role === "hr" ? [
    { label: "Employees", value: state.employees.length, page: "hr" },
    { label: "Documents expiring", value: state.employees.flatMap(e=>e.docs).filter(d=>docState(d.expiry).label!=="Valid").length, page: "hr" },
    ...myLeadKpis,
  ] : role === "lead_manager" ? [
    { label: "Leads assigned", value: state.leads.filter(l=>l.assignedAt).length, page: "leadAssignment" },
    { label: "SLA overdue", value: state.leads.filter(l=>l.slaViolated || (l.slaDueAt && new Date(l.slaDueAt) < new Date() && !(l.followUps||[]).some(f=>f.at && new Date(f.at)>=new Date(l.assignedAt)))).length, page: "leadAssignment" },
    { label: "Unassigned leads", value: state.leads.filter(l=>!l.owner).length, page: "leadAssignment" },
    ...myLeadKpis,
    ...valueKpis,
  ] : role === "content_creator" ? [
    { label: "Active tasks", value: myContentActive.length, page: "tasks" },
    { label: "Stages completed", value: myContentStagesDone, page: "tasks" },
    { label: "On-time delivery", value: `${myContentOnTimePct}%`, page: "tasks" },
  ] : [
    { label: "New leads this period", value: periodLeads, page: "leads" },
    { label: "Pipeline value", value: money(pipelineValue), page: "deals" },
    { label: "Business volume this period", value: money(businessVolume), page: "quotations" },
    { label: "Job cards completed", value: periodJobsCompleted, page: "jobs" },
    ...myLeadKpis,
    ...valueKpis,
  ];

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 16, flexWrap:"wrap", gap:10 }}>
        <div className="tabbar" style={{ marginBottom:0 }}>
          <button className={`tab ${chartTab==="overview"?"active":""}`} onClick={()=>setChartTab("overview")}>Overview</button>
          <button className={`tab ${chartTab==="charts"?"active":""}`} onClick={()=>setChartTab("charts")}>Charts</button>
          {canSeeFormations && <button className={`tab ${chartTab==="formations"?"active":""}`} onClick={()=>setChartTab("formations")}>Formations status</button>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {canQuickAddLead && <button className="btn btn-primary" onClick={()=>setShowQuickAddLead(true)}><Plus size={15}/> Log a lead</button>}
          <AttendanceSignButton />
        </div>
      </div>
      {showQuickAddLead && <LeadFormModal state={state} dispatch={dispatch} userId={userId} editLead={null} onClose={()=>setShowQuickAddLead(false)} />}

      {chartTab === "overview" && <>
      {role === "content_creator" && (
        <div className="agw-card" style={{ marginBottom: 20 }}>
          <strong style={{ fontSize: 14 }}>My Content Production</strong>
          <div style={{ marginTop: 10, display:"flex", gap:28, flexWrap:"wrap", alignItems:"center" }}>
            <ProgressRing pct={myContentOnTimePct} label="On-time delivery" />
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>Active tasks: <strong style={{ color:"var(--ink)" }}>{myContentActive.length}</strong></div>
              <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>Stages completed: <strong style={{ color:"var(--ink)" }}>{myContentStagesDone}</strong></div>
              <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>On time / Late: <strong style={{ color:"var(--ink)" }}>{myContentOnTime} / {myContentLate}</strong></div>
            </div>
          </div>
          {myContentActive.length === 0 ? (
            <div className="side-note" style={{ marginTop:14 }}>No active content tasks right now.</div>
          ) : (
            <div style={{ marginTop:14 }}>
              {myContentActive.map(({ task: t, snap }) => (
                <div key={t.id} style={{ padding:"8px 0", borderBottom:"1px solid var(--hair)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</span>
                    <span style={{ fontSize:11.5, color:"var(--ink-soft)", flexShrink:0 }}>
                      {snap.currentIndex < CONTENT_STAGES.length ? CONTENT_STAGES[snap.currentIndex] : "Delivered"}
                    </span>
                  </div>
                  <div style={{ background:"var(--page)", borderRadius:4, height:6, overflow:"hidden", marginTop:4 }}>
                    <div style={{ width:`${snap.completionPct}%`, height:"100%", background: progressColor(snap.completionPct), borderRadius:4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {role === "sales_exec" && state.salesTaskDefs?.length > 0 && (
        <div className="agw-card" style={{ marginBottom: 20 }}>
          <strong style={{ fontSize: 14 }}>My Sales Daily Tasks</strong>
          <div style={{ marginTop: 10 }}>
            {(() => {
              const salesTaskToday_ = salesTaskToday();
              const todaySnap = userTaskSnapshot(state.salesTaskDefs, salesTaskData, userId, salesTaskToday_, salesTaskToday_);
              const weekSnap = userTaskSnapshot(state.salesTaskDefs, salesTaskData, userId, firstOfWeekStr(), salesTaskToday_);
              const monthSnap = userTaskSnapshot(state.salesTaskDefs, salesTaskData, userId, firstOfMonthStr(), salesTaskToday_);
              return (
                <div style={{ display:"flex", gap:28, flexWrap:"wrap", alignItems:"center" }}>
                  <ProgressRing pct={todaySnap.completionPct} color={dailyCompletionColor(todaySnap.completionPct)} label="Daily performance" />
                  <ProgressRing pct={weekSnap.completionPct} color={dailyCompletionColor(weekSnap.completionPct)} label="Weekly performance" />
                  <ProgressRing pct={monthSnap.completionPct} color={dailyCompletionColor(monthSnap.completionPct)} label="Monthly performance" />
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>Today's task completion: <strong style={{ color:"var(--ink)" }}>{todaySnap.completionPct}%</strong></div>
                    <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>Revenue achieved (today): <strong style={{ color:"var(--ink)" }}>{money(todaySnap.revenue)}</strong></div>
                    <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>Sales achieved (today): <strong style={{ color:"var(--ink)" }}>{money(todaySnap.sales)}</strong></div>
                    <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>Pending tasks: <strong style={{ color:"var(--ink)" }}>{todaySnap.pendingCount}</strong></div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {showPeriod && (
        <div style={{ marginBottom: 16 }}>
          <PeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
        </div>
      )}

      {/* auto-fit rather than one column per KPI: with the lead + value cards there can be ten of
          them, and a single forced row would squeeze each one down to an unreadable sliver. */}
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 20 }}>
        {kpis.map(k => (
          <div className="agw-card" key={k.label} onClick={k.page ? () => setPage(k.page) : undefined}
            style={k.page ? { cursor: "pointer" } : undefined}
            title={k.page ? "View details" : undefined}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value disp">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="agw-card" style={{ marginBottom: 20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>My tasks</strong>
          <button className="btn btn-sm btn-ghost" onClick={()=>setPage("tasks")}>View all <ChevronRight size={14}/></button>
        </div>
        {(() => {
          const myTasks = state.tasks.filter(t => t.assignedTo === userId && !["Completed","Rejected","Cancelled"].includes(t.status));
          return myTasks.length === 0 ? <Empty icon={ListChecks} text="No open tasks assigned to you." /> : (
            <div>
              {myTasks.slice(0,5).map(t => (
                <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--hair)" }}>
                  <div style={{ fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:220 }}>{t.title}</div>
                  <Stamp tone={statusTone(t.status)}>{t.status}</Stamp>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {closedOwners.length > 0 && (
        <div className="agw-card" style={{ marginBottom: 20, borderColor: "#F2C089" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12, flexWrap:"wrap", gap:8 }}>
            <strong style={{ fontSize: 14 }}>🏆 Today's closed deals</strong>
            {closedOwners.length > 3 && <button className="btn btn-sm btn-ghost" onClick={()=>setShowAllClosed(true)}>View all {todayWonDeals.length}</button>}
          </div>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
            {closedOwners.slice(0,3).map(({ employee: e, deals }) => (
              <div key={e.id} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--gold-tint)", borderRadius:10, padding:"8px 14px 8px 8px" }}>
                {e.photoUrl ? <img src={e.photoUrl} alt={e.name} style={{ width:36, height:36, borderRadius:"50%", objectFit:"cover" }} /> : <span className="avatar" style={{ width:36, height:36 }}>{e.initials}</span>}
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{e.name} 🏆</div>
                  <div style={{ fontSize:11.5, color:"var(--ink-soft)" }}>{deals.length} deal{deals.length!==1?"s":""} closed today</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showAllClosed && (
        <Modal title="🏆 Today's closed deals" sub={`${todayWonDeals.length} deal${todayWonDeals.length!==1?"s":""} closed across the team today`} onClose={()=>setShowAllClosed(false)}>
          {closedOwners.map(({ employee: e, deals }) => (
            <div key={e.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid var(--hair)" }}>
              {e.photoUrl ? <img src={e.photoUrl} alt={e.name} style={{ width:36, height:36, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} /> : <span className="avatar" style={{ width:36, height:36, flexShrink:0 }}>{e.initials}</span>}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{e.name} 🏆</div>
                <div style={{ fontSize:11.5, color:"var(--ink-soft)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{deals.map(d=>d.customer).join(", ")}</div>
              </div>
              <Stamp tone="success">{deals.length}</Stamp>
            </div>
          ))}
        </Modal>
      )}

      <div className="agw-grid" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <div className="agw-card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>Recent activity</strong>
          </div>
          {state.activity.length === 0
            ? <Empty icon={Clock} text="Nothing yet — create a lead to get started." />
            : <div>
                {state.activity.slice(0,10).map(a => (
                  <div key={a.id} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom:"1px solid var(--hair)", fontSize:13 }}>
                    <Clock size={14} style={{ marginTop: 2, color: "var(--ink-soft)", flexShrink:0 }} />
                    <div>{a.text}<div style={{ fontSize:11, color:"var(--ink-soft)" }}>{fmtDate(a.at)}</div></div>
                  </div>
                ))}
              </div>}
        </div>

        <div className="agw-card">
          <strong style={{ fontSize: 14 }}>Document expiry watchlist</strong>
          <div style={{ marginTop: 10 }}>
            {expiringDocs.length === 0
              ? <Empty icon={ShieldCheck} text="All customer documents are valid." />
              : expiringDocs.slice(0,6).map(d => {
                  const st = docState(d.expiry);
                  return (
                    <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--hair)" }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{d.label}</div>
                        <div style={{ fontSize:11.5, color:"var(--ink-soft)" }}>{d.type}</div>
                      </div>
                      <Stamp tone={st.cls.replace("stamp-","")}>{st.label}</Stamp>
                    </div>
                  );
                })}
          </div>
          {expiringDocs.length > 0 && <button className="btn btn-sm btn-ghost" style={{marginTop:10}} onClick={()=>setPage("customers")}>View all customers <ChevronRight size={14}/></button>}
        </div>
      </div>

      {canSeeCompanyFinance && (upcomingCheques.length > 0 || upcomingRenewals.length > 0) && (
        <div className="agw-card" style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 14 }}>Upcoming cheques & renewals</strong>
          <div style={{ marginTop: 10 }}>
            {[...upcomingCheques.map(c => ({ key:c.id, label:`${c.direction} cheque — ${c.partyName}`, sub:c.chequeNumber, date:c.depositDate })),
              ...upcomingRenewals.map(s => ({ key:s.id, label:s.softwareName, sub:"Software renewal", date:s.renewalDate }))]
              .sort((a,b) => new Date(a.date) - new Date(b.date))
              .map(item => {
                const due = dueState(item.date);
                return (
                  <div key={item.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--hair)" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500 }}>{item.label}</div>
                      <div style={{ fontSize:11.5, color:"var(--ink-soft)" }}>{item.sub}</div>
                    </div>
                    <Stamp tone={due.cls.replace("stamp-","")}>{due.label}</Stamp>
                  </div>
                );
              })}
          </div>
          <button className="btn btn-sm btn-ghost" style={{marginTop:10}} onClick={()=>setPage("companyFinance")}>View all <ChevronRight size={14}/></button>
        </div>
      )}

      {showPeriod && (
        <div className="agw-card" style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 14 }}>Top customers this period</strong>
          <div style={{ marginTop: 10 }}>
            {topCustomers.length === 0
              ? <Empty icon={UserCheck} text="No approved Professional Fee quotations in this period yet." />
              : topCustomers.map(([name, amt]) => (
                  <div key={name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--hair)" }}>
                    <span style={{ fontSize:13 }}>{name}</span>
                    <span className="mono" style={{ fontSize:13 }}>{money(amt)}</span>
                  </div>
                ))}
          </div>
        </div>
      )}

      {isSalesTeamRole && (
        <div className="agw-card" style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 14 }}>{role === "sales_exec" ? "My performance" : "Sales team performance"}</strong>
          <div style={{ marginTop: 10 }}>
            {salesPersonRows.length === 0 ? <Empty icon={Users} text="No sales activity in this period yet." /> : (
              <div style={{ overflowX:"auto" }}>
              <table className="agw-table">
                <thead><tr><th>Salesperson</th><th>Leads</th><th>Deals</th><th>Quotations</th><th>Collected</th><th>Pending</th></tr></thead>
                <tbody>
                  {salesPersonRows.map(r => (
                    <tr key={r.owner.id}>
                      <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{r.owner.initials}</span>{r.owner.name}</td>
                      <td>{r.leadsCount} <span style={{color:"var(--ink-soft)",fontSize:11}}>({r.pendingLeads} open)</span></td>
                      <td>{r.dealsCount} <span style={{color:"var(--ink-soft)",fontSize:11}}>({r.dealsWon} won)</span></td>
                      <td>{r.quotesCount} <span style={{color:"var(--ink-soft)",fontSize:11}}>({r.pendingQuotes} pending)</span></td>
                      <td className="mono" style={{color:"var(--success)"}}>{money(r.collected)}</td>
                      <td>{r.pendingCollection > 0 ? <span className="mono" style={{color:"var(--danger)"}}>{money(r.pendingCollection)}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {isSalesTeamRole && role !== "sales_exec" && state.salesTaskDefs?.length > 0 && (
        <div className="agw-card" style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 14 }}>Sales Daily Tasks — team</strong>
          <div style={{ marginTop: 10, overflowX:"auto" }}>
            <table className="agw-table">
              <thead><tr><th>Employee</th><th>Task completion %</th><th>Revenue</th><th>Sales</th><th>Current status</th></tr></thead>
              <tbody>
                {salesOwners.map(owner => {
                  const salesTaskToday_ = salesTaskToday();
                  const snap = userTaskSnapshot(state.salesTaskDefs, salesTaskData, owner.id, salesTaskToday_, salesTaskToday_);
                  return (
                    <tr key={owner.id}>
                      <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{owner.initials}</span>{owner.name}</td>
                      <td className="mono" style={{ color: dailyCompletionColor(snap.completionPct), fontWeight:600 }}>{snap.completionPct}%</td>
                      <td className="mono">{money(snap.revenue)}</td>
                      <td className="mono">{money(snap.sales)}</td>
                      <td><Stamp tone={statusTone(snap.overallStatus)}>{snap.overallStatus}</Stamp></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}

      {chartTab === "charts" && (
        <div className="agw-grid" style={{ gridTemplateColumns: "1fr 1fr", gap:16 }}>
          {["ops_manager","ops_member","pro_head","pro"].includes(role) ? (
            <div className="agw-card">
              <strong style={{ fontSize: 14 }}>Job cards by status</strong>
              <div style={{ marginTop: 16 }}>
                {jobsByStatus.length === 0 ? <Empty icon={ClipboardList} text="No job cards yet." /> : <DonutChart data={jobsByStatus} centerLabel="job cards" />}
              </div>
            </div>
          ) : role === "accounts" ? (
            <>
              <div className="agw-card">
                <strong style={{ fontSize: 14 }}>Invoices by status</strong>
                <div style={{ marginTop: 16 }}>
                  {invoicesByStatus.length === 0 ? <Empty icon={Receipt} text="No invoices yet." /> : <DonutChart data={invoicesByStatus} centerLabel="invoices" />}
                </div>
              </div>
              <div className="agw-card">
                <strong style={{ fontSize: 14 }}>Collections — last 6 months</strong>
                <div style={{ marginTop: 16 }}>
                  <LineChart series={[{ label:"Collected", points: collectedByMonth, color:"var(--brand)" }]} labels={monthLabels} formatY={(n)=>n>=1000?`${Math.round(n/1000)}k`:n} />
                </div>
              </div>
            </>
          ) : role === "hr" ? (
            <div className="agw-card">
              <Empty icon={BarChart3} text="Charts for HR are on the roadmap — check Reports for attendance and leave breakdowns." />
            </div>
          ) : (
            <>
              <div className="agw-card">
                <strong style={{ fontSize: 14 }}>Sales pipeline</strong>
                <div style={{ marginTop: 16 }}>
                  {state.deals.length === 0 ? <Empty icon={Handshake} text="No deals yet." /> : <DonutChart data={dealsByStage} centerLabel="deals" />}
                </div>
              </div>
              <div className="agw-card">
                <strong style={{ fontSize: 14 }}>Job cards by status</strong>
                <div style={{ marginTop: 16 }}>
                  {jobsByStatus.length === 0 ? <Empty icon={ClipboardList} text="No job cards yet." /> : <DonutChart data={jobsByStatus} centerLabel="job cards" />}
                </div>
              </div>
              <div className="agw-card">
                <strong style={{ fontSize: 14 }}>Business volume — last 6 months</strong>
                <div style={{ marginTop: 16 }}>
                  <LineChart series={[{ label:"Business volume", points: volumeByMonth, color:"var(--gold)" }]} labels={monthLabels} formatY={(n)=>n>=1000?`${Math.round(n/1000)}k`:n} />
                </div>
              </div>
              <div className="agw-card">
                <strong style={{ fontSize: 14 }}>Leads by source</strong>
                <div style={{ marginTop: 16 }}>
                  {leadsBySource.length === 0 ? <Empty icon={Users} text="No leads yet." /> : <BarChart data={leadsBySource} />}
                </div>
              </div>
              {isSalesTeamRole && (
                <div className="agw-card" style={{ gridColumn: "1 / -1" }}>
                  <strong style={{ fontSize: 14 }}>{role === "sales_exec" ? "My leads, deals & quotations" : "Sales team — leads, deals & quotations"}</strong>
                  <div style={{ marginTop: 16 }}>
                    {salesPersonRows.length === 0 ? <Empty icon={Users} text="No sales activity in this period yet." /> : <SalesPersonBars rows={salesPersonRows} />}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {chartTab === "formations" && canSeeFormations && (
        <div>
          <div className="agw-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 20 }}>
            <div className="agw-card"><div className="kpi-label">Total formations</div><div className="kpi-value disp">{formationJobs.length}</div></div>
            {formationStatusCounts.map(s => (
              <div className="agw-card" key={s.label}>
                <div className="kpi-label">{s.label}</div>
                <div className="kpi-value disp" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:8 }}>
            <strong style={{ fontSize:14 }}>Company Formation job cards</strong>
            <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12.5, color:"var(--ink-soft)", cursor:"pointer" }}>
              <input type="checkbox" checked={showDoneFormations} onChange={e=>setShowDoneFormations(e.target.checked)} />
              Show completed & cancelled
            </label>
          </div>

          {visibleFormationJobs.length === 0 ? (
            <div className="agw-card"><Empty icon={ClipboardList} text={showDoneFormations ? "No Company Formation job cards yet." : "No active Company Formation job cards right now — everything's either not started or done."} /></div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {visibleFormationJobs.map(j => (
                <div className="agw-card" key={j.id} style={{ padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
                      <span className="mono" style={{ fontSize:12, color:"var(--ink-soft)" }}>{j.id}</span>
                      <strong style={{ fontSize:13.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.customer}</strong>
                      <span style={{ fontSize:11.5, color:"var(--ink-soft)" }}>{j.service}</span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                      <div className="avatars">
                        {j.assignees.length === 0 ? <span className="pill">Unassigned</span> :
                          j.assignees.map(a => <span className="avatar" key={a}>{state.employees.find(t=>t.id===a)?.initials}</span>)}
                      </div>
                      <Stamp tone={statusTone(j.status)}>{j.status}</Stamp>
                    </div>
                  </div>
                  {j.status !== "Cancelled" && (
                    <Rail steps={["Created","Assigned","In Progress","Completed"]} current={j.status === "On Hold" ? "In Progress" : j.status} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* LEADS                                                                   */
/* ---------------------------------------------------------------------- */

const LEAD_STATUSES = ["New","Contacted","Follow-up Scheduled","Interested","Not Interested","Qualified","Unqualified","Converted"];

// Extracted out of LeadsPage so it's also reachable from the Dashboard's "Log a lead" quick-add
// (for roles that get lead-creation without the full Leads page) — same form, same POST /leads,
// just a second entry point. editLead=null means "new lead"; otherwise pre-fills for editing.
function LeadFormModal({ state, dispatch, userId, editLead, onClose }) {
  const blankForm = { name:"", company:"", phone:"", email:"", reference:"", source:"Website", service: SERVICES[0] };
  const [form, setForm] = useState(editLead
    ? { name:editLead.name, company:editLead.company, phone:editLead.phone||"", email:editLead.email||"", reference:editLead.reference||"", source:editLead.source, service:editLead.service }
    : blankForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      if (editLead) {
        await dispatch({type:"UPDATE_LEAD", id:editLead.id, payload:form});
      } else {
        const result = await dispatch({type:"ADD_LEAD", payload:{...form, owner: userId}});
        if (result?.duplicateOf) {
          alert(`Note: no new customer was created — "${form.company}"'s phone/email already matches an existing customer, "${result.duplicateOf}". The lead was linked to that customer instead.`);
        }
      }
      onClose();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editLead ? `Edit ${editLead.id}` : "New lead"} sub={editLead ? undefined : "Capture an enquiry before it's qualified into a deal."} onClose={onClose}>
      <div className="row2">
        <div className="field"><label>Contact name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Full name" /></div>
        <div className="field"><label>Company</label><input value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Company name" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+974 ..." /></div>
        <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="name@company.com" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Source</label>
          <select value={form.source} onChange={e=>setForm({...form,source:e.target.value})}>
            {["Website","Referral","Walk-in","Campaign","Other"].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label>Reference (optional)</label><input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="e.g. Referred by..., reference code" /></div>
      </div>
      <div className="field"><label>Interested service</label>
        <select value={form.service} onChange={e=>setForm({...form,service:e.target.value})}>
          {state.services.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>
      {saveError && <div className="side-note" style={{ color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{saveError}</div>}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving || !form.name || !form.company} onClick={handleSave}>
          {saving ? "Saving…" : editLead ? "Save changes" : "Add lead"}
        </button>
      </div>
    </Modal>
  );
}

function LeadsPage({ state, dispatch, userId, role }) {
  const [view, setView] = useState("kanban");
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [expandedCols, setExpandedCols] = useState({});
  const KANBAN_PAGE_SIZE = 5;
  const [showAdd, setShowAdd] = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [removeLead, setRemoveLead] = useState(null);
  const [convert, setConvert] = useState(null);
  const [followFor, setFollowFor] = useState(null);
  const [fuNote, setFuNote] = useState("");
  const [fuStatus, setFuStatus] = useState("Contacted");
  const [fuNext, setFuNext] = useState(daysFromNow(3));

  const [query, setQuery] = useState("");
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range } = usePeriod("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const canFilterByOwner = role !== "sales_exec";
  const ownedByRole = ["sales_exec"].includes(role) ? state.leads.filter(l => l.owner === userId) : state.leads;
  // A distributed lead's relevant date for "does this belong in my view right now" is when it
  // became mine (assignedAt), not when the Lead Manager originally brought it in — otherwise a
  // lead assigned today but created last month silently vanishes from the assignee's own Leads
  // page behind the default "This Month" filter. Self-added leads have no assignedAt, so they
  // fall back to createdAt exactly as before.
  const periodFiltered = ownedByRole.filter(l => inRange(l.assignedAt || l.createdAt, range));
  const salespeople = [...new Map(periodFiltered.map(l => l.owner).filter(Boolean).map(id => [id, state.employees.find(e => e.id === id)]).filter(([,e]) => e)).values()];
  const ownerFiltered = ownerFilter ? periodFiltered.filter(l => l.owner === ownerFilter) : periodFiltered;
  const owned = ownerFiltered.filter(l => {
    const haystack = [l.name, l.company, l.email, l.phone, l.id, l.reference].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const pg = usePagination(owned);
  const isAdmin = ADMIN_LIKE.includes(role);
  // Same pool AssignLeadModal (Lead Assignment Manager) draws from — any active, non-management
  // employee is a valid lead owner, not just sales-tagged roles.
  const assignableEmployees = state.employees.filter(isAssignable);

  const openFollowUp = (l) => { setFollowFor(l); setFuNote(""); setFuStatus(l.status); setFuNext(l.nextFollowUp || daysFromNow(3)); };
  const openEdit = (l) => setEditLead(l);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:10 }}>
        <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
          <button className={`tab ${view==="kanban"?"active":""}`} onClick={()=>setView("kanban")}>Kanban</button>
          <button className={`tab ${view==="table"?"active":""}`} onClick={()=>setView("table")}>Table</button>
          <button className={`tab ${view==="card"?"active":""}`} onClick={()=>setView("card")}>Card</button>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <PeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
          {canFilterByOwner && (
            <select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}
              style={{ fontSize:13, border:"1px solid var(--hair)", borderRadius:8, padding:"7px 10px", background:"var(--surface)" }}>
              <option value="">All salespeople</option>
              <option value={userId}>My leads</option>
              {salespeople.filter(e=>e.id!==userId).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <div style={{ position:"relative", maxWidth: 260 }}>
            <Search size={15} style={{ position:"absolute", left:12, top:9, color:"var(--ink-soft)" }} />
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search leads"
              style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"7px 12px 7px 34px", fontSize:13, background:"var(--surface)" }} />
          </div>
          <button className="btn btn-sm" onClick={()=>exportCSV("leads.csv",
            ["Lead ID","Created","Name","Email","Phone","Company","Service","Lead Type","Source","Reference","Owner","Status","Next Follow-up"],
            owned.map(l=>[l.id, l.createdAt, l.name, l.email||"", l.phone||"", l.company, l.service, leadOrigin(l), l.source, l.reference||"", state.employees.find(t=>t.id===l.owner)?.name||"", l.status, l.nextFollowUp||""]))}>
            <Download size={13}/> Export
          </button>
          {role !== "viewer" && <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/> New lead</button>}
        </div>
      </div>

      {view === "table" && (
      <div className="agw-card" style={{ padding: 0 }}>
        {owned.length === 0 ? <Empty icon={Users} text="No leads yet. Add your first enquiry." /> : (
        <div style={{ overflowX: "auto" }}>
        <table className="agw-table" style={{ minWidth: 1120 }}>
          <thead><tr><th>Lead</th><th>Email</th><th>Phone</th><th>Created</th><th>Company</th><th>Service</th><th>Lead type</th><th>Source</th><th>Reference</th><th>Owner</th><th>Status</th><th>Next follow-up</th><th></th></tr></thead>
          <tbody>
            {pg.pageRows.map(l => (
              <tr key={l.id} style={l.status === "Converted" ? { background: "var(--success-tint)" } : undefined}>
                <td>{l.name}
                  <div className="mono" style={{fontSize:11,color:"var(--ink-soft)"}}>{l.id}</div>
                </td>
                <td style={{fontSize:12}}>{l.email || "—"}</td>
                <td className="mono" style={{fontSize:12}}>{l.phone || "—"}</td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(l.createdAt)}</td>
                <td>{l.company}</td>
                <td style={{maxWidth:180}}>{l.service}</td>
                <td><Stamp tone={originTone(leadOrigin(l))}>{leadOrigin(l)}</Stamp></td>
                <td><span className="pill">{l.source}</span></td>
                <td style={{fontSize:12,color:"var(--ink-soft)",maxWidth:140}}>{l.reference || "—"}</td>
                <td onClick={e=>e.stopPropagation()}>
                  {isAdmin ? (
                    <select value={l.owner || ""} onChange={e=>dispatch({type:"ASSIGN_LEAD", id:l.id, userId:e.target.value})}
                      style={{ fontSize:12, border:"1px solid var(--hair)", borderRadius:8, padding:"4px 8px", background:"var(--page)" }}>
                      {!l.owner && <option value="">— Unassigned —</option>}
                      {assignableEmployees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  ) : (state.employees.find(t=>t.id===l.owner)?.name || "—")}
                </td>
                <td onClick={e=>e.stopPropagation()}>
                  <select value={l.status} onChange={e=>dispatch({type:"SET_LEAD_STATUS", id:l.id, status:e.target.value})}
                    style={{ fontSize:12, border:"1px solid var(--hair)", borderRadius:20, padding:"4px 8px", background:"var(--page)" }}>
                    {LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="mono" style={{fontSize:12}}>{fmtDateDMY(l.nextFollowUp)}</td>
                <td style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", minWidth:200 }}>
                  <button className="btn btn-sm" onClick={()=>openFollowUp(l)}>Log follow-up</button>
                  {l.status !== "Unqualified" && !state.deals.find(d=>d.leadId===l.id) &&
                    <button className="btn btn-sm" onClick={()=>setConvert(l)}>Convert</button>}
                  <RowActions onEdit={()=>openEdit(l)} onRemove={()=>setRemoveLead(l)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>)}
        <PaginationBar {...pg} />
      </div>
      )}

      {view === "kanban" && (
        <div className="board" style={{ gridTemplateColumns: `repeat(${LEAD_STATUSES.length}, minmax(210px,1fr))` }}>
          {LEAD_STATUSES.map(status => {
            const colLeads = owned.filter(l => l.status === status);
            const isExpanded = !!expandedCols[status];
            const shownLeads = isExpanded ? colLeads : colLeads.slice(0, KANBAN_PAGE_SIZE);
            return (
            <div className={`board-col ${dragOverStatus===status ? "drag-over" : ""}`} key={status}
              onDragOver={(e)=>{ e.preventDefault(); if (dragOverStatus!==status) setDragOverStatus(status); }}
              onDragLeave={()=>setDragOverStatus(prev => prev===status ? null : prev)}
              onDrop={(e)=>{ e.preventDefault(); if (draggedLeadId) dispatch({type:"SET_LEAD_STATUS", id:draggedLeadId, status}); setDraggedLeadId(null); setDragOverStatus(null); }}>
              <h4>{status}<span className="pill">{colLeads.length}</span></h4>
              {shownLeads.map(l => (
                <div className={`job-card ${draggedLeadId===l.id ? "dragging" : ""}`} key={l.id} draggable
                  onDragStart={(e)=>{ setDraggedLeadId(l.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={()=>{ setDraggedLeadId(null); setDragOverStatus(null); }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <h5 style={{ margin:0 }}>{l.company}</h5>
                    <RowActions onEdit={()=>openEdit(l)} onRemove={()=>setRemoveLead(l)} />
                  </div>
                  <div className="meta" style={{ marginBottom: 2 }}>{l.name}{l.email && <> · {l.email}</>}{l.phone && <> · {l.phone}</>}</div>
                  <div className="meta">{l.service}</div>
                  <div style={{ fontSize:11, color:"var(--ink-soft)", marginTop:2 }}>Created {fmtDate(l.createdAt)}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6 }}>
                    <span className="pill">{l.source}</span>
                    <span className="pill">{state.employees.find(t=>t.id===l.owner)?.initials}</span>
                  </div>
                  {l.nextFollowUp && <div style={{ fontSize:11, color:"var(--ink-soft)", marginTop:6 }}>Next follow-up: <span className="mono">{fmtDateDMY(l.nextFollowUp)}</span></div>}
                  <select value={l.status} onChange={e=>dispatch({type:"SET_LEAD_STATUS", id:l.id, status:e.target.value})}
                    style={{ width:"100%", marginTop:8, fontSize:12, border:"1px solid var(--hair)", borderRadius:8, padding:"5px 8px", background:"var(--surface)" }}>
                    {LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                  <div style={{ display:"flex", gap:6, marginTop:8 }}>
                    <button className="btn btn-sm" style={{ flex:1 }} onClick={()=>openFollowUp(l)}>Log follow-up</button>
                    {l.status !== "Unqualified" && !state.deals.find(d=>d.leadId===l.id) &&
                      <button className="btn btn-sm" style={{ flex:1 }} onClick={()=>setConvert(l)}>Convert</button>}
                  </div>
                </div>
              ))}
              {colLeads.length===0 && <div style={{fontSize:12,color:"var(--ink-soft)",padding:"6px 6px"}}>No leads</div>}
              {colLeads.length > KANBAN_PAGE_SIZE && (
                <button className="btn btn-sm btn-ghost" style={{width:"100%",marginTop:4}}
                  onClick={()=>setExpandedCols(prev=>({...prev,[status]:!prev[status]}))}>
                  {isExpanded ? "Show less" : `Show ${colLeads.length - KANBAN_PAGE_SIZE} more`}
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}

      {view === "card" && (
        <div>
          {owned.length === 0 ? <Empty icon={Users} text="No leads yet. Add your first enquiry." /> : (
          <div className="agw-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {pg.pageRows.map(l => (
              // The whole card opens the follow-up log (with its full history) — the fastest path
              // to "what's the story on this lead" — while every interactive control inside stops
              // propagation so picking an owner/status or hitting a button doesn't also open it.
              <div className="agw-card" key={l.id} style={{ cursor:"pointer" }} onClick={()=>openFollowUp(l)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <strong style={{ fontSize:14.5 }}>{l.name}</strong>
                    <span className="mono" style={{ fontSize:11, color:"var(--ink-soft)", marginLeft:6 }}>{l.id}</span>
                    <div style={{ fontSize:12.5, color:"var(--ink-soft)", marginTop:2 }}>{l.company}</div>
                  </div>
                  <RowActions onEdit={()=>openEdit(l)} onRemove={()=>setRemoveLead(l)} />
                </div>

                <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:5 }}>
                  <div style={{ fontSize:13, display:"flex", alignItems:"center", gap:7 }}>
                    <Mail size={13} style={{ color:"var(--ink-soft)", flexShrink:0 }}/> {l.email || "—"}
                  </div>
                  <div style={{ fontSize:13, display:"flex", alignItems:"center", gap:7 }}>
                    <Phone size={13} style={{ color:"var(--ink-soft)", flexShrink:0 }}/> {l.phone || "—"}
                  </div>
                </div>

                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:10 }}>
                  <Stamp tone={originTone(leadOrigin(l))}>{leadOrigin(l)}</Stamp>
                  <span className="pill">{l.source}</span>
                  <span className="pill">{l.service}</span>
                </div>

                <div className="row2" style={{ marginTop:10 }}>
                  <div>
                    <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Owner</div>
                    <div style={{ marginTop:3 }} onClick={e=>e.stopPropagation()}>
                      {isAdmin ? (
                        <select value={l.owner || ""} onChange={e=>dispatch({type:"ASSIGN_LEAD", id:l.id, userId:e.target.value})}
                          style={{ width:"100%", fontSize:12, border:"1px solid var(--hair)", borderRadius:8, padding:"4px 8px", background:"var(--page)" }}>
                          {!l.owner && <option value="">— Unassigned —</option>}
                          {assignableEmployees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      ) : <span style={{ fontSize:13 }}>{state.employees.find(t=>t.id===l.owner)?.name || "—"}</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Status</div>
                    <div style={{ marginTop:3 }} onClick={e=>e.stopPropagation()}>
                      <select value={l.status} onChange={e=>dispatch({type:"SET_LEAD_STATUS", id:l.id, status:e.target.value})}
                        style={{ width:"100%", fontSize:12, border:"1px solid var(--hair)", borderRadius:20, padding:"4px 8px", background:"var(--page)" }}>
                        {LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {l.nextFollowUp && <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:10 }}>Next follow-up: <span className="mono">{fmtDateDMY(l.nextFollowUp)}</span></div>}

                {(() => {
                  // Most recent follow-up's comment, shown right on the card — otherwise the only
                  // way to see what was actually said on the last call is to open the modal first.
                  const latest = (l.followUps || []).slice().sort((a,b)=>new Date(b.at)-new Date(a.at))[0];
                  return latest?.note && (
                    <div style={{ fontSize:12, marginTop:8, padding:"6px 8px", background:"var(--page)", borderRadius:6 }}>
                      <span style={{ color:"var(--ink-soft)" }}>Last comment: </span>{latest.note}
                    </div>
                  );
                })()}

                <div style={{ display:"flex", gap:8, marginTop:10 }} onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-sm" style={{ flex:1 }} onClick={()=>openFollowUp(l)}>Log follow-up</button>
                  {l.status !== "Unqualified" && !state.deals.find(d=>d.leadId===l.id) &&
                    <button className="btn btn-sm" style={{ flex:1 }} onClick={()=>setConvert(l)}>Convert</button>}
                </div>
              </div>
            ))}
          </div>)}
          <PaginationBar {...pg} />
        </div>
      )}

      {removeLead && <ConfirmModal title={`Remove lead ${removeLead.id}?`} body={`${removeLead.company} — ${removeLead.name}. This can't be undone.`} onConfirm={()=>dispatch({type:"DELETE_LEAD", id:removeLead.id})} onClose={()=>setRemoveLead(null)} />}

      {followFor && (
        <Modal title={`Log follow-up — ${followFor.id}`} sub={`${followFor.company} · ${followFor.name}`} onClose={()=>setFollowFor(null)}>
          {followFor.followUps && followFor.followUps.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize:11.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".04em", marginBottom:6 }}>Previous follow-ups</div>
              {followFor.followUps.map(f => (
                <div key={f.id} style={{ fontSize:12.5, padding:"10px 12px", marginBottom:8, background:"var(--page)", border:"1px solid var(--hair)", borderRadius:8 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span className="pill">{f.outcome}</span>
                    <span style={{ color:"var(--ink-soft)", fontSize:11.5 }}>{fmtDateDMY(f.at)}</span>
                  </div>
                  {f.note && <div style={{ marginTop:4 }}>{f.note}</div>}
                </div>
              ))}
            </div>
          )}
          <div className="field"><label>Outcome</label>
            <select value={fuStatus} onChange={e=>setFuStatus(e.target.value)}>
              {LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field"><label>Comments</label><textarea rows={3} value={fuNote} onChange={e=>setFuNote(e.target.value)} placeholder="What happened on this call or visit..." /></div>
          <div className="field"><label>Next follow-up date</label><input type="date" value={fuNext} onChange={e=>setFuNext(e.target.value)} /></div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
            <button className="btn" onClick={()=>setFollowFor(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={()=>{ dispatch({type:"LOG_FOLLOWUP", id:followFor.id, note:fuNote, status:fuStatus, nextFollowUp:fuNext}); setFollowFor(null); }}>Save follow-up</button>
          </div>
        </Modal>
      )}

      {(showAdd || editLead) && (
        <LeadFormModal state={state} dispatch={dispatch} userId={userId} editLead={editLead}
          onClose={()=>{ setShowAdd(false); setEditLead(null); }} />
      )}

      {convert && (
        <Modal title={`Convert ${convert.id} to a deal`} sub={`${convert.company} — ${convert.service}`} onClose={()=>setConvert(null)}>
          <div className="side-note" style={{ marginTop:0 }}>The deal's value will reflect its actual quotation once one is created — there's nothing to estimate up front.</div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
            <button className="btn" onClick={()=>setConvert(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={()=>{ dispatch({type:"CONVERT_LEAD_TO_DEAL", id:convert.id}); setConvert(null); }}>Create deal</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* DEALS                                                                   */
/* ---------------------------------------------------------------------- */

function DealsPage({ state, dispatch, setPage, onViewQuotation, role, userId }) {
  const [view, setView] = useState("kanban");
  const viewQuotationFor = (d) => { onViewQuotation(state.quotations.find(q=>q.dealId===d.id)?.id); setPage("quotations"); };
  // Highlights the row just created via "New deal" — local to this page since creation and
  // display both happen here, unlike the cross-page highlightQuotationId pattern below.
  const [highlightDealId, setHighlightDealId] = useState(null);
  useEffect(() => {
    if (!highlightDealId) return;
    const el = document.getElementById(`deal-row-${highlightDealId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightDealId]);
  const dealHighlightStyle = (d) => d.id === highlightDealId ? { background:"var(--gold-tint)", boxShadow:"inset 3px 0 0 var(--gold)" } : undefined;
  const [quoteFor, setQuoteFor] = useState(null);
  const [editDeal, setEditDeal] = useState(null);
  const [removeDeal, setRemoveDeal] = useState(null);
  const [newDeal, setNewDeal] = useState(false);
  const [draggedDealId, setDraggedDealId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const stages = ["Open","Quotation Sent","Won","Lost"];
  const [query, setQuery] = useState("");
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range } = usePeriod("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const periodFiltered = state.deals.filter(d => inRange(d.createdAt, range));
  const salespeople = [...new Map(periodFiltered.map(d => d.owner).filter(Boolean).map(id => [id, state.employees.find(e => e.id === id)]).filter(([,e]) => e)).values()];
  const ownerFiltered = ownerFilter ? periodFiltered.filter(d => d.owner === ownerFilter) : periodFiltered;
  const deals = ownerFiltered.filter(d => {
    const haystack = [d.customer, d.id, d.service].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const pg = usePagination(deals);
  const isAdmin = ADMIN_LIKE.includes(role);
  const assignableEmployees = state.employees.filter(isAssignable);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:10 }}>
        <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
          <button className={`tab ${view==="kanban"?"active":""}`} onClick={()=>setView("kanban")}>Kanban</button>
          <button className={`tab ${view==="table"?"active":""}`} onClick={()=>setView("table")}>Table</button>
          <button className={`tab ${view==="card"?"active":""}`} onClick={()=>setView("card")}>Card</button>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <PeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
          <select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}
            style={{ fontSize:13, border:"1px solid var(--hair)", borderRadius:8, padding:"7px 10px", background:"var(--surface)" }}>
            <option value="">All salespeople</option>
            <option value={userId}>My deals</option>
            {salespeople.filter(e=>e.id!==userId).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div style={{ position:"relative", maxWidth: 260 }}>
            <Search size={15} style={{ position:"absolute", left:12, top:9, color:"var(--ink-soft)" }} />
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search deals"
              style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"7px 12px 7px 34px", fontSize:13, background:"var(--surface)" }} />
          </div>
          <button className="btn btn-sm" onClick={()=>exportCSV("deals.csv",
            ["Deal ID","Created","Customer","Service","Value","Lead Type","Owner","Stage","Expected Close"],
            deals.map(d=>[d.id, d.createdAt, d.customer, d.service, d.value, dealOrigin(state, d), state.employees.find(t=>t.id===d.owner)?.name||"", d.stage, d.expectedClose]))}>
            <Download size={13}/> Export
          </button>
          {role !== "viewer" && <button className="btn btn-primary" onClick={()=>setNewDeal(true)}><Plus size={15}/> New deal</button>}
        </div>
      </div>

      {view === "table" && (
        <div className="agw-card" style={{ padding: 0 }}>
          {deals.length === 0 ? <Empty icon={Handshake} text="No deals yet. Convert a lead to get started." /> : (
          <div style={{ overflowX:"auto" }}>
          <table className="agw-table" style={{ minWidth: 720 }}>
            <thead><tr><th>Customer</th><th>Created</th><th>Service</th><th>Value</th><th>Lead type</th><th>Owner</th><th>Stage</th><th>Expected close</th><th></th></tr></thead>
            <tbody>
              {pg.pageRows.map(d => (
                <tr key={d.id} id={`deal-row-${d.id}`} onClick={()=>{ if (highlightDealId===d.id) setHighlightDealId(null); }}
                  style={dealHighlightStyle(d) || (d.stage === "Won" ? { background: "var(--success-tint)" } : undefined)}>
                  <td>{d.customer}<div className="mono" style={{fontSize:11,color:"var(--ink-soft)"}}>{d.id}</div></td>
                  <td className="mono" style={{fontSize:12}}>{fmtDate(d.createdAt)}</td>
                  <td style={{maxWidth:200}}>{d.service}</td>
                  <td className="mono">{money(d.value)}</td>
                  <td><Stamp tone={originTone(dealOrigin(state, d))}>{dealOrigin(state, d)}</Stamp></td>
                  <td onClick={e=>e.stopPropagation()}>
                    {isAdmin ? (
                      <select value={d.owner || ""} onChange={e=>dispatch({type:"UPDATE_DEAL", id:d.id, payload:{owner:e.target.value}})}
                        style={{ fontSize:12, border:"1px solid var(--hair)", borderRadius:8, padding:"4px 8px", background:"var(--page)" }}>
                        {!d.owner && <option value="">— Unassigned —</option>}
                        {assignableEmployees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    ) : (state.employees.find(t=>t.id===d.owner)?.name || "—")}
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <select value={d.stage} onChange={e=>dispatch({type:"UPDATE_DEAL", id:d.id, payload:{stage:e.target.value}})}
                      style={{ fontSize:12, border:"1px solid var(--hair)", borderRadius:20, padding:"4px 8px", background:"var(--page)" }}>
                      {stages.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="mono" style={{fontSize:12}}>{fmtDate(d.expectedClose)}</td>
                  <td style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                    {d.stage === "Open" && !state.quotations.find(q=>q.dealId===d.id) &&
                      <button className="btn btn-sm" onClick={()=>setQuoteFor(d)}>Create quotation</button>}
                    {state.quotations.find(q=>q.dealId===d.id) &&
                      <button className="btn btn-sm btn-ghost" onClick={()=>viewQuotationFor(d)}>View quotation</button>}
                    <RowActions onEdit={()=>setEditDeal(d)} onRemove={()=>setRemoveDeal(d)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>)}
          <PaginationBar {...pg} />
        </div>
      )}

      {view === "kanban" && (
      <div className="board" style={{ gridTemplateColumns: "repeat(4, minmax(210px,1fr))" }}>
        {stages.map(stage => (
          <div className={`board-col ${dragOverStage===stage ? "drag-over" : ""}`} key={stage}
            onDragOver={(e)=>{ e.preventDefault(); if (dragOverStage!==stage) setDragOverStage(stage); }}
            onDragLeave={()=>setDragOverStage(prev => prev===stage ? null : prev)}
            onDrop={(e)=>{ e.preventDefault(); if (draggedDealId) dispatch({type:"UPDATE_DEAL", id:draggedDealId, payload:{stage}}); setDraggedDealId(null); setDragOverStage(null); }}>
            <h4>{stage}<span className="pill">{deals.filter(d=>d.stage===stage).length}</span></h4>
            {deals.filter(d => d.stage === stage).map(d => (
              <div className={`job-card ${draggedDealId===d.id ? "dragging" : ""}`} key={d.id} id={`deal-row-${d.id}`} draggable
                style={dealHighlightStyle(d)}
                onClick={()=>{ if (highlightDealId===d.id) setHighlightDealId(null); }}
                onDragStart={(e)=>{ setDraggedDealId(d.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={()=>{ setDraggedDealId(null); setDragOverStage(null); }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <h5 style={{ margin:0 }}>{d.customer}</h5>
                  <RowActions onEdit={()=>setEditDeal(d)} onRemove={()=>setRemoveDeal(d)} />
                </div>
                <div className="meta">{d.service}</div>
                <div style={{ fontSize:11, color:"var(--ink-soft)", marginBottom:4 }}>Created {fmtDate(d.createdAt)}</div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <strong className="mono" style={{fontSize:13}}>{money(d.value)}</strong>
                  <span className="pill">{state.employees.find(t=>t.id===d.owner)?.initials}</span>
                </div>
                {stage === "Open" && !state.quotations.find(q=>q.dealId===d.id) &&
                  <button className="btn btn-sm" style={{marginTop:8, width:"100%"}} onClick={()=>setQuoteFor(d)}>Create quotation</button>}
                {state.quotations.find(q=>q.dealId===d.id) &&
                  <button className="btn btn-sm btn-ghost" style={{marginTop:8, width:"100%"}} onClick={()=>viewQuotationFor(d)}>View quotation <ChevronRight size={13}/></button>}
              </div>
            ))}
            {deals.filter(d=>d.stage===stage).length===0 && <div style={{fontSize:12,color:"var(--ink-soft)",padding:"6px 6px"}}>No deals</div>}
          </div>
        ))}
      </div>
      )}

      {view === "card" && (
        <div>
          {deals.length === 0 ? <Empty icon={Handshake} text="No deals yet. Convert a lead to get started." /> : (
          <div className="agw-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            {pg.pageRows.map(d => {
              // Deals only store the customer's name, not their contact details — those live on
              // the linked Customer profile, looked up by id (or by name for older deals from
              // before customer_id existed).
              const customer = (d.customerId ? state.customers.find(c=>c.id===d.customerId) : null) || state.customers.find(c=>c.name===d.customer);
              return (
              <div className="agw-card" key={d.id} id={`deal-row-${d.id}`} style={dealHighlightStyle(d)}
                onClick={()=>{ if (highlightDealId===d.id) setHighlightDealId(null); }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <strong style={{ fontSize:14.5 }}>{d.customer}</strong>
                    <span className="mono" style={{ fontSize:11, color:"var(--ink-soft)", marginLeft:6 }}>{d.id}</span>
                    <div style={{ fontSize:12.5, color:"var(--ink-soft)", marginTop:2 }}>{d.service}</div>
                  </div>
                  <RowActions onEdit={()=>setEditDeal(d)} onRemove={()=>setRemoveDeal(d)} />
                </div>

                <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:5 }}>
                  <div style={{ fontSize:13, display:"flex", alignItems:"center", gap:7 }}>
                    <Mail size={13} style={{ color:"var(--ink-soft)", flexShrink:0 }}/> {customer?.email || "—"}
                  </div>
                  <div style={{ fontSize:13, display:"flex", alignItems:"center", gap:7 }}>
                    <Phone size={13} style={{ color:"var(--ink-soft)", flexShrink:0 }}/> {customer?.phone || "—"}
                  </div>
                </div>

                <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginTop:10 }}>
                  <Stamp tone={originTone(dealOrigin(state, d))}>{dealOrigin(state, d)}</Stamp>
                  <strong className="mono" style={{fontSize:13.5}}>{money(d.value)}</strong>
                </div>

                <div className="row2" style={{ marginTop:10 }}>
                  <div>
                    <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Owner</div>
                    <div style={{ marginTop:3 }}>
                      {isAdmin ? (
                        <select value={d.owner || ""} onChange={e=>dispatch({type:"UPDATE_DEAL", id:d.id, payload:{owner:e.target.value}})}
                          style={{ width:"100%", fontSize:12, border:"1px solid var(--hair)", borderRadius:8, padding:"4px 8px", background:"var(--page)" }}>
                          {!d.owner && <option value="">— Unassigned —</option>}
                          {assignableEmployees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      ) : <span style={{ fontSize:13 }}>{state.employees.find(t=>t.id===d.owner)?.name || "—"}</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Stage</div>
                    <div style={{ marginTop:3 }}>
                      <select value={d.stage} onChange={e=>dispatch({type:"UPDATE_DEAL", id:d.id, payload:{stage:e.target.value}})}
                        style={{ width:"100%", fontSize:12, border:"1px solid var(--hair)", borderRadius:20, padding:"4px 8px", background:"var(--page)" }}>
                        {stages.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:10 }}>Expected close: <span className="mono">{fmtDate(d.expectedClose)}</span></div>

                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  {d.stage === "Open" && !state.quotations.find(q=>q.dealId===d.id) &&
                    <button className="btn btn-sm" style={{ flex:1 }} onClick={()=>setQuoteFor(d)}>Create quotation</button>}
                  {state.quotations.find(q=>q.dealId===d.id) &&
                    <button className="btn btn-sm btn-ghost" style={{ flex:1 }} onClick={()=>viewQuotationFor(d)}>View quotation</button>}
                </div>
              </div>
              );
            })}
          </div>)}
          <PaginationBar {...pg} />
        </div>
      )}

      {quoteFor && <QuoteBuilderModal dealId={quoteFor.id} customerName={quoteFor.customer} defaultService={quoteFor.service} services={state.services} itemCatalog={state.itemCatalog} dispatch={dispatch} templates={state.quotationTemplates} subscriptionPlans={state.subscriptionPlans} subscriptions={state.subscriptions} role={role} employees={state.employees} defaultOwner={quoteFor.owner} onClose={()=>setQuoteFor(null)}
        onCreated={(id)=>{ onViewQuotation(id, true); setPage("quotations"); }} />}
      {editDeal && <EditDealModal deal={editDeal} state={state} dispatch={dispatch} onClose={()=>setEditDeal(null)} />}
      {removeDeal && <ConfirmModal title={`Remove deal ${removeDeal.id}?`} body={`${removeDeal.customer} — ${money(removeDeal.value)}. This can't be undone.`} onConfirm={()=>dispatch({type:"DELETE_DEAL", id:removeDeal.id})} onClose={()=>setRemoveDeal(null)} />}
      {newDeal && <NewDealModal state={state} dispatch={dispatch} userId={userId} onClose={()=>setNewDeal(false)} onCreated={(deal)=>{ setHighlightDealId(deal.id); setQuoteFor(deal); }} />}
    </div>
  );
}

// Deals normally come from converting a Lead — this is the direct path for a customer who's
// already in the system and doesn't need to go through the lead pipeline again.
function NewDealModal({ state, dispatch, userId, initialCustomer=null, onClose, onCreated }) {
  const [form, setForm] = useState({ customer: initialCustomer || "", service: state.services[0] || "", expectedClose: daysFromNow(21) });
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const r = await dispatch({ type:"ADD_DEAL", payload: { ...form, owner: userId, stage: "Open" } });
      onCreated?.({ id: r?.id, customer: form.customer, service: form.service, owner: userId });
      onClose();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New deal" sub="For a customer already in the system — no need to go through a lead first." onClose={onClose}>
      <div className="field"><label>Customer</label>
        <input list="new-deal-customer-options" value={form.customer} onChange={e=>setForm({...form,customer:e.target.value})} placeholder="Type or pick a customer" autoFocus={!initialCustomer} disabled={!!initialCustomer} />
        <datalist id="new-deal-customer-options">{state.customers.map(c=><option key={c.id} value={c.name} />)}</datalist>
      </div>
      <div className="row2">
        <div className="field"><label>Service</label>
          <select value={form.service} onChange={e=>setForm({...form,service:e.target.value})}>
            {state.services.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label>Expected close date</label><input type="date" value={form.expectedClose} onChange={e=>setForm({...form,expectedClose:e.target.value})} /></div>
      </div>
      <div className="side-note" style={{ marginTop:0 }}>This deal's value will reflect its actual quotation once one is created — there's nothing to estimate up front.</div>
      {saveError && <div className="side-note" style={{ color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{saveError}</div>}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving || !state.customers.some(c=>c.name===form.customer)} onClick={handleSave}>{saving ? "Saving…" : "Create deal"}</button>
      </div>
    </Modal>
  );
}

function EditDealModal({ deal: d, state, dispatch, onClose }) {
  const [form, setForm] = useState({ customer: d.customer, service: d.service, stage: d.stage, expectedClose: d.expectedClose });
  return (
    <Modal title={`Edit ${d.id}`} onClose={onClose}>
      <div className="field"><label>Customer</label><input value={form.customer} onChange={e=>setForm({...form,customer:e.target.value})} /></div>
      <div className="row2">
        <div className="field"><label>Service</label>
          <select value={form.service} onChange={e=>setForm({...form,service:e.target.value})}>
            {state.services.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label>Value (QAR)</label><input value={money(d.value)} disabled title="Reflects this deal's latest quotation — not editable here" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Stage</label>
          <select value={form.stage} onChange={e=>setForm({...form,stage:e.target.value})}>
            {["Open","Quotation Sent","Won","Lost"].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label>Expected close date</label><input type="date" value={form.expectedClose} onChange={e=>setForm({...form,expectedClose:e.target.value})} /></div>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>{ dispatch({type:"UPDATE_DEAL", id:d.id, payload:form}); onClose(); }}>Save changes</button>
      </div>
    </Modal>
  );
}

// Type to search the item catalog (scoped to this section's fee type, and to `service` when a
// catalog row has one set) or just type a one-off description and press Enter — either way it
// calls onAdd with { description, note, price }. Shared by every item-adding surface below.
function AddItemControl({ catalog, feeType, service, onAdd, label }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = catalog.filter(c => c.feeType === feeType && (!c.service || c.service === service));
  const matches = query.trim() ? options.filter(c => `${c.name} ${c.description}`.toLowerCase().includes(query.trim().toLowerCase())) : options;

  if (!open) return <button type="button" className="btn btn-sm" onClick={()=>setOpen(true)}><Plus size={13}/> {label}</button>;

  const commitFreeText = () => {
    if (query.trim()) onAdd({ description: query.trim(), note: "", price: 0 });
    setQuery(""); setOpen(false);
  };

  return (
    <div style={{ position:"relative", maxWidth:360 }}>
      <input autoFocus value={query} onChange={e=>setQuery(e.target.value)}
        onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); commitFreeText(); } if (e.key==="Escape") { setQuery(""); setOpen(false); } }}
        onBlur={()=>setTimeout(()=>setOpen(false), 150)}
        placeholder="Search items or type a new one — Enter to add" style={{ width:"100%" }} />
      {matches.length > 0 && (
        <div className="agw-card" style={{ position:"absolute", zIndex:20, width:"100%", maxHeight:220, overflowY:"auto", padding:4, marginTop:2 }}>
          {matches.map(m => (
            <div key={m.id} onMouseDown={()=>{ onAdd({ description:m.description, note:m.note, price:m.price }); setQuery(""); setOpen(false); }}
              style={{ padding:"6px 8px", fontSize:12.5, cursor:"pointer", borderRadius:6, display:"flex", justifyContent:"space-between", gap:8 }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--brand-tint)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span>{m.name}</span><span className="mono" style={{ color:"var(--ink-soft)", flexShrink:0 }}>{money(m.price)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One fee-type section (Government Fee or Professional Fee) within QuoteItemsEditor — its own
// light-tinted block, its own item rows, its own "add item" control. Adding here always sets
// the new item's feeType to this section's, so there's no more relying on category text or a
// per-item dropdown to classify a line correctly.
function ItemSection({ title, bg, feeType, items, setItems, service, catalog, readOnly }) {
  const update = (i, field, val) => setItems(items.map((it,idx) => idx===i ? { ...it, [field]: val } : it));
  const remove = (i) => setItems(items.filter((_,idx) => idx!==i));
  const move = (i, dir) => setItems(moveArrayItem(items, i, dir));
  const addEntry = ({ description, note, price }) => {
    const lastCategory = items.length ? items[items.length-1].category || "" : "";
    setItems([...items, { category: lastCategory, service, description, note, qty: 1, price, discountPct: 0, feeType }]);
  };
  const subtotal = items.reduce((a,it)=>a+it.qty*it.price*(1-(it.discountPct||0)/100), 0);
  if (readOnly && items.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:bg, borderRadius:8, padding:"8px 12px", marginBottom:8 }}>
        <strong style={{ fontSize:13 }}>{title}</strong>
        <span className="mono" style={{ fontSize:12.5, color:"var(--ink-soft)" }}>{money(subtotal)}</span>
      </div>
      {items.length === 0 && <div style={{ fontSize:12, color:"var(--ink-soft)", padding:"0 4px 10px" }}>No {title.toLowerCase()} items yet.</div>}
      {items.map((it, i) => readOnly ? (
        <div key={i} style={{ background:bg, borderRadius:8, padding:"8px 12px", marginBottom:6, display:"flex", justifyContent:"space-between", gap:12 }}>
          <div>
            {it.category && <div style={{ fontSize:11, color:"var(--ink-soft)" }}>{it.category}</div>}
            <div style={{ fontSize:13 }}>{it.description || it.service}</div>
            {it.note && <div style={{ fontSize:11.5, color:"var(--ink-soft)" }}>{it.note}</div>}
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div className="mono" style={{ fontSize:13 }}>{money(it.qty*it.price*(1-(it.discountPct||0)/100))}</div>
            <div style={{ fontSize:11, color:"var(--ink-soft)" }}>{it.qty} × {money(it.price)}{it.discountPct > 0 ? ` (-${it.discountPct}%)` : ""}</div>
          </div>
        </div>
      ) : (
        <div key={i} style={{ background:bg, borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
          <div className="row2">
            <div className="field"><label>Category / stage (optional)</label>
              <input value={it.category || ""} onChange={e=>update(i,"category",e.target.value)} placeholder="e.g. STAGE - 1" />
            </div>
            <div className="field"><label>Item & description</label>
              <input value={it.description || ""} onChange={e=>update(i,"description",e.target.value)} placeholder="e.g. Issue New CR" />
            </div>
          </div>
          <div className="field"><label>Note (optional)</label>
            <input value={it.note || ""} onChange={e=>update(i,"note",e.target.value)} placeholder="e.g. 50 QAR per partner" />
          </div>
          <div className="row2">
            <div className="field"><label>Qty</label><input type="number" min={1} value={it.qty} onChange={e=>update(i,"qty",(e.target.value === "" ? "" : Number(e.target.value)))} /></div>
            <div className="field"><label>Rate (QAR)</label><input type="number" value={it.price} onChange={e=>update(i,"price",(e.target.value === "" ? "" : Number(e.target.value)))} /></div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span className="mono" style={{ fontSize:12, color:"var(--ink-soft)" }}>{money(it.qty*it.price*(1-(it.discountPct||0)/100))}</span>
            <div style={{ display:"flex", gap:2 }}>
              <button type="button" className="btn btn-sm btn-ghost" title="Move up" disabled={i===0} onClick={()=>move(i,-1)}><ChevronUp size={13}/></button>
              <button type="button" className="btn btn-sm btn-ghost" title="Move down" disabled={i===items.length-1} onClick={()=>move(i,1)}><ChevronDown size={13}/></button>
              <button type="button" className="btn btn-sm btn-ghost" style={{color:"var(--danger)"}} title="Remove" onClick={()=>remove(i)}><X size={13}/></button>
            </div>
          </div>
        </div>
      ))}
      {!readOnly && <AddItemControl catalog={catalog} feeType={feeType} service={service} onAdd={addEntry} label={`Add ${title.toLowerCase()} item`} />}
    </div>
  );
}

// Two fixed sections — Government Fee, then Professional Fee — replacing the old single list of
// per-item cards that repeated a Fee Type + Service Type dropdown on every row. `items` is still
// one flat array in storage (professionalFeeAmount/govProfSplit/isGovFeeLine/quotationPdf.js all
// keep working unchanged) — this only splits it for editing and re-concatenates gov+prof on save.
// `readOnly` renders a plain summary (no inputs/add/remove) — used for Current View before "Edit
// items" is clicked, where items are still shown but not being edited.
function QuoteItemsEditor({ items, onChange, service, catalog = [], quotationFeeType, readOnly = false }) {
  const govItems = items.filter(it => isGovFeeLine(it, quotationFeeType));
  const profItems = items.filter(it => !isGovFeeLine(it, quotationFeeType));
  return (
    <div>
      <ItemSection title="Government Fee" bg={GOV_FEE_BG} feeType="Government Fee" items={govItems} service={service} catalog={catalog} readOnly={readOnly}
        setItems={(next)=>onChange([...next, ...profItems])} />
      <ItemSection title="Professional Fee" bg={PROF_FEE_BG} feeType="Professional Fee" items={profItems} service={service} catalog={catalog} readOnly={readOnly}
        setItems={(next)=>onChange([...govItems, ...next])} />
    </div>
  );
}

function QuoteBuilderModal({ dealId=null, customerName="", defaultService=SERVICES[0], editableCustomer=false, customerOptions=[], services=SERVICES, itemCatalog=[], dispatch, templates, subscriptionPlans={}, subscriptions=[], role=null, employees=[], defaultOwner="", onClose, onCreated }) {
  const [showNewService, setShowNewService] = useState(false);
  const [customer, setCustomer] = useState(customerName);
  // Admin-only: lets whoever is building the quotation attribute it to a different salesperson
  // than themselves (e.g. entering a quotation on a rep's behalf). Left blank, the backend falls
  // back to the linked deal's owner or the creator, exactly as before this existed.
  const isAdmin = ADMIN_LIKE.includes(role);
  const salesPeople = employees.filter(e => e.roles.includes("sales_exec") || e.roles.includes("sales_manager"));
  const [owner, setOwner] = useState(defaultOwner || "");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [templateService, setTemplateService] = useState(defaultService);
  const [theme, setTheme] = useState("teal");
  const [subject, setSubject] = useState("");
  // Starts at 0 — the deal has no value of its own to seed from (it's the other way around now:
  // the deal's value is derived from this quotation once it's saved, via syncDealValue on the
  // backend). Real pricing comes from loading the service's fee template below, or typing it in.
  const [items, setItems] = useState([{ category: "", service: defaultService, description: "", note: "", qty: 1, price: 0, discountPct: 0 }]);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState("amount");
  const [bank, setBank] = useState("");
  const [footerNote, setFooterNote] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  // Government Fee lines are trusted straight from the template — nothing to review per line, so
  // there's no per-item editor for them here. Professional Fee collapses to one confirmable amount
  // (matches how it's actually written on every real quotation: one lump-sum line, not itemized —
  // see QuotationTemplateEditor). Full per-line editing is still available after creation via the
  // existing Edit action on the quotation itself.
  const [profFee, setProfFee] = useState(0);
  const govLines = items.filter(it => isGovFeeLine(it, undefined));
  const firstProfTemplateLine = items.find(it => !isGovFeeLine(it, undefined));
  const govTotal = govLines.reduce((a, it) => a + it.qty * it.price * (1 - (it.discountPct || 0) / 100), 0);
  const finalItems = [...govLines, ...(profFee > 0 ? [{
    category: firstProfTemplateLine?.category || "",
    service: templateService,
    description: firstProfTemplateLine?.description || "PROFESSIONAL FEE IS INCLUSIVE OF THE FOLLOWING:",
    note: firstProfTemplateLine?.note || "",
    qty: 1, price: profFee, discountPct: 0, feeType: "Professional Fee",
  }] : [])];
  const { subtotal, itemDiscountTotal, discountAmount, total } = quoteTotals(finalItems, orderDiscount, orderDiscountType);
  const hasDiscount = finalItems.some(it => it.discountPct > 0) || orderDiscount > 0;
  // One merged template per service (Professional Fee and Government Fee lines share the same
  // template, tagged per item — see quotation_templates in schema.sql), so there's no fee-type
  // keying to do here anymore.
  const tpl = templates[templateService];

  // "Activity Fees" is the one template line that's genuinely different per quotation — it's
  // priced per business activity, not a flat fee — so loading a template that has it pauses to
  // ask which activities apply, then expands it into one numbered line per activity (matching
  // how these are actually written up: "1 - Retail Sale of...", "2 - ..."). A merged template can
  // have up to two such lines (one Professional Fee, one Government Fee) — the same activity list
  // fills in both, since they describe the same business activities.
  const [activityPrompt, setActivityPrompt] = useState(null); // { tpl, activityIdxs, activities: string[] }

  // Any service that's also sold as a structured subscription (currently just Growth Partner
  // Program) gets a package/tier picker here instead of everyone hand-typing "Silver - 1 Year
  // Package" into Subject and eyeballing the price — see subscription_tiers/mapTier. Sourcing the
  // tier list from the Subscriptions module (not a separate hardcoded list) keeps a quotation's
  // package pricing from ever drifting out of sync with what Subscriptions actually sells.
  const packageTiers = subscriptionPlans[templateService]?.tiers || [];
  // Flags a customer who already has a live subscription for this exact structured-subscription
  // service (matched by name, same as isGrowthPartnerCustomer elsewhere) — building a second
  // quotation for it is almost always a mistake (the previous one's already active), caught here
  // before it turns into a duplicate sales order/job card/subscription later in the pipeline.
  const existingSub = customer && packageTiers.length > 0
    ? subscriptions.find(s => s.customer === customer && s.plan === templateService && !["Cancelled","Expired"].includes(subStatusOf(s)))
    : null;
  const [selectedPackage, setSelectedPackage] = useState("");
  useEffect(() => { setSelectedPackage(""); }, [templateService]);
  const applyPackage = (tierName) => {
    setSelectedPackage(tierName);
    const tier = packageTiers.find(t => t.name === tierName);
    if (!tier) return;
    setSubject(`${templateService.replace(/ Program$/, "")} - ${tier.name} - 1 Year Package`);
    const idx = items.findIndex(it => (it.description || "").trim().toLowerCase().startsWith("package"));
    const targetIdx = idx === -1 ? 0 : idx;
    const next = items.map((it, i) => i === targetIdx ? { ...it, price: tier.annualFee, note: tierEntitlementsNote(tier) } : it);
    setItems(next);
    setProfFee(next.filter(it => !isGovFeeLine(it, undefined)).reduce((a, it) => a + it.qty * it.price * (1 - (it.discountPct || 0) / 100), 0));
  };

  const applyTemplate = (loadedTpl, loadedItems) => {
    const mapped = loadedItems.map(it => ({ ...it }));
    setItems(mapped);
    setProfFee(mapped.filter(it => !isGovFeeLine(it, undefined)).reduce((a, it) => a + it.qty * it.price * (1 - (it.discountPct || 0) / 100), 0));
    setTerms(loadedTpl.terms || "");
    setNotes(loadedTpl.notes || "");
    setSubject(loadedTpl.subject || "");
    setOrderDiscount(loadedTpl.orderDiscount || 0);
    setOrderDiscountType(loadedTpl.orderDiscountType || "amount");
    setBank(loadedTpl.bank || "");
    setFooterNote(loadedTpl.footerNote || "");
  };

  const loadTemplate = () => {
    if (!tpl) return;
    // startsWith, not exact match — a template's Activity Fees line can carry extra explanatory
    // text after the label (e.g. "Activity Fees (QAR 300 to 500 for one activity...)"), which an
    // exact-equality check would miss entirely, silently skipping the activity-list prompt.
    const activityIdxs = tpl.items.reduce((acc, it, idx) => {
      if ((it.description || "").trim().toLowerCase().startsWith("activity fees")) acc.push(idx);
      return acc;
    }, []);
    if (activityIdxs.length) {
      setActivityPrompt({ tpl, activityIdxs, activities: [""] });
      return;
    }
    applyTemplate(tpl, tpl.items);
  };

  // Picking the service already tells us which template applies, so load it the moment it's
  // selected (or on open, for whatever service the modal started on) instead of requiring a
  // separate "Load template" click.
  useEffect(() => {
    if (!tpl) return;
    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateService]);

  const confirmActivities = () => {
    const { tpl: pendingTpl, activityIdxs, activities } = activityPrompt;
    const named = activities.map(a => a.trim()).filter(Boolean);
    // One row per Activity Fees line, not one per activity — qty carries the activity count so
    // Amount (qty × rate) still comes out correct, and every activity is listed in the note,
    // numbered in order.
    const newItems = pendingTpl.items.map((it, idx) => {
      if (!activityIdxs.includes(idx) || !named.length) return it;
      return { ...it, qty: named.length, note: named.map((text, i) => `${i + 1} - ${text}`).join("\n") };
    });
    applyTemplate(pendingTpl, newItems);
    setActivityPrompt(null);
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSubmit = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const payload = { dealId, customer, items: finalItems, terms, notes, subject, theme, orderDiscount, orderDiscountType, packageTier: selectedPackage || null, bank, footerNote, owner: owner || undefined };
      const r = await dispatch({ type:"CREATE_QUOTATION", payload });
      onCreated?.(r?.id);
      onClose();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Build quotation" sub={editableCustomer ? "All amounts in QAR" : `${customer} — all amounts in QAR`} onClose={onClose} width={620}>
      {editableCustomer && (
        <div className="row2">
          <div className="field">
            <label>Customer</label>
            <div style={{ display:"flex", gap:6 }}>
              <input list="customer-options" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Type or pick a customer" style={{ flex:1 }} />
              <button type="button" className="btn btn-sm" onClick={()=>setShowNewCustomer(true)} title="Create new customer"><Plus size={13}/></button>
            </div>
            <datalist id="customer-options">{customerOptions.map(n => <option key={n} value={n} />)}</datalist>
          </div>
          <div className="field">
            <label>Primary service (for template)</label>
            <div style={{ display:"flex", gap:6 }}>
              <select value={templateService} onChange={e=>setTemplateService(e.target.value)} style={{ flex:1 }}>
                {services.map(s=><option key={s}>{s}</option>)}
              </select>
              <button type="button" className="btn btn-sm" onClick={()=>setShowNewService(true)} title="Add a new service"><Plus size={13}/></button>
            </div>
          </div>
        </div>
      )}
      {showNewCustomer && <NewCustomerModal dispatch={dispatch} onClose={()=>setShowNewCustomer(false)} onCreated={(name)=>setCustomer(name)} />}
      {showNewService && <AddServiceOptionModal dispatch={dispatch} onClose={()=>setShowNewService(false)} onCreated={(name)=>setTemplateService(name)} />}
      {tpl && (
        <div style={{ fontSize:12, color:"var(--ink-soft)", marginBottom:14 }}>
          <Files size={13} style={{verticalAlign:-2,marginRight:5}}/>Loaded the saved {templateService} template — edit any line below if this job needs something different.
        </div>
      )}
      {existingSub && (
        <div className="side-note" style={{ marginTop:0, borderColor:"#F2C089", background:"var(--gold-tint)" }}>
          <AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>
          {customer} already has an active {templateService} subscription ({existingSub.tier}, expires {fmtDate(existingSub.expiryDate)}) — check this isn't a duplicate before continuing.
        </div>
      )}
      {packageTiers.length > 0 && (
        <div className="field">
          <label>Package</label>
          <select value={selectedPackage} onChange={e=>applyPackage(e.target.value)}>
            <option value="">Select a package…</option>
            {packageTiers.map(t=><option key={t.name} value={t.name}>{t.name} — {money(t.annualFee)}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label>Template theme</label>
        <ThemePicker value={theme} onChange={setTheme} />
      </div>
      {activityPrompt && (
        <Modal title="Business activities" sub="One Activity Fees line will be added per activity, numbered in order." onClose={()=>setActivityPrompt(null)} width={480}>
          {activityPrompt.activities.map((a, i) => (
            <div key={i} className="field" style={{ display:"flex", gap:6, alignItems:"flex-end" }}>
              <div style={{ flex:1 }}>
                <label>{`Activity ${i + 1}`}</label>
                <input value={a} autoFocus={i===0}
                  onChange={e=>setActivityPrompt(p=>({ ...p, activities: p.activities.map((x,idx)=>idx===i?e.target.value:x) }))}
                  placeholder="e.g. Retail Sale of Fire Protection and Safety Equipment, Tools, and Materials" />
              </div>
              {activityPrompt.activities.length > 1 && (
                <button type="button" className="btn btn-sm btn-ghost" style={{ color:"var(--danger)" }}
                  onClick={()=>setActivityPrompt(p=>({ ...p, activities: p.activities.filter((_,idx)=>idx!==i) }))}><Trash2 size={13}/></button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm" style={{ marginBottom: 16 }}
            onClick={()=>setActivityPrompt(p=>({ ...p, activities: [...p.activities, ""] }))}><Plus size={13}/> Add another activity</button>
          <div className="side-note" style={{ marginTop:0 }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>At least one business activity is required for Company Formation quotations.</div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
            <button className="btn" onClick={()=>setActivityPrompt(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!activityPrompt.activities.some(a=>a.trim())} onClick={confirmActivities}>Continue</button>
          </div>
        </Modal>
      )}
      {isAdmin && salesPeople.length > 0 && (
        <div className="field">
          <label>Sales person</label>
          <select value={owner} onChange={e=>setOwner(e.target.value)}>
            <option value="">{dealId ? "Deal owner (default)" : "Myself (default)"}</option>
            {salesPeople.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      )}
      <div className="field"><label>Subject</label><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. 100% FOREIGN OWNERSHIP COMPANY FORMATION - Government Fees" /></div>

      <div className="agw-card" style={{ background:"var(--page)", marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: govLines.length ? 8 : 0 }}>
          <strong style={{ fontSize:13 }}>Government Fee</strong>
          <span className="mono" style={{ fontSize:13 }}>{money(govTotal)}</span>
        </div>
        {govLines.length === 0 ? (
          <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>No Government Fee items in this template.</div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", rowGap:6, columnGap:16 }}>
            {govLines.map((it,i) => (
              <React.Fragment key={i}>
                <span style={{ fontSize:12.5, color:"var(--ink-soft)" }}>{it.description || it.service}{it.qty > 1 ? ` × ${it.qty}` : ""}</span>
                <span className="mono" style={{ fontSize:12.5, color:"var(--ink-soft)", whiteSpace:"nowrap", textAlign:"right" }}>{money(it.qty * it.price * (1 - (it.discountPct || 0) / 100))}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <div style={{ fontSize:11, color:"var(--ink-soft)", marginTop:8 }}>Loaded from the {templateService} template — pass-through to the client, nothing to review here.</div>
      </div>

      <div className="field">
        <label>Professional Fee (QAR) <span style={{color:"var(--danger)"}}>*</span></label>
        <input type="number" min="0" value={profFee} onChange={e=>setProfFee(Math.max(0, Number(e.target.value) || 0))}
          style={profFee <= 0 ? { borderColor:"var(--danger)" } : undefined} />
        {profFee <= 0 && <div style={{ fontSize:11.5, color:"var(--danger)", marginTop:4 }}>Required — enter the Professional Fee to complete this quotation.</div>}
      </div>

      <div style={{ marginTop: 6, borderTop:"1px solid var(--hair)", paddingTop: 12 }}>
        {itemDiscountTotal > 0 && (
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--ink-soft)" }}>
            <span>Item Discount</span><span className="mono">(-) {money(itemDiscountTotal)}</span>
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--ink-soft)", marginTop: itemDiscountTotal > 0 ? 4 : 0 }}>
          <span>Sub Total</span><span className="mono">{money(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--ink-soft)", marginTop:4 }}>
            <span>Discount{orderDiscountType === "percent" ? ` (${orderDiscount}%)` : ""}</span><span className="mono">(-) {money(discountAmount)}</span>
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color:"var(--ink-soft)" }}>Quotation total</div>
            <div className="disp" style={{ fontSize: 20 }}>{money(total)}</div>
          </div>
          {hasDiscount && <div className="side-note" style={{marginTop:0}}><AlertTriangle size={13} style={{verticalAlign:-2, marginRight:4}}/>Discount applied — this will route to the Sales Manager for approval before sending.</div>}
        </div>
      </div>

      {saveError && <div className="side-note" style={{ color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{saveError}</div>}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving || !customer || profFee <= 0} onClick={handleSubmit}>
          {saving ? "Saving…" : "Complete quotation"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* QUOTATIONS                                                              */
/* ---------------------------------------------------------------------- */

function QuotationsPage({ state, dispatch, role, userId, highlightId, autoOpenPdf=false, onHighlightHandled, setPage, onSalesOrderCreated }) {
  const [openId, setOpenId] = useState(null);
  // Set alongside openId when opened via the Edit action, so the modal jumps straight into Visual
  // edit instead of landing on Current view first — Draft/Pending Manager Approval quotations are
  // editable regardless of role, but that was only reachable by opening the row, switching to the
  // PDF preview tab, then clicking Visual edit, which wasn't an obvious path for most users.
  const [openInEdit, setOpenInEdit] = useState(false);
  // Set instead of openInEdit right after a quotation is freshly created (see autoOpenPdf below) —
  // lands straight on the PDF preview tab, read-only, so the salesperson sees the actual document
  // immediately instead of a highlighted row they still have to click into.
  const [openInPdf, setOpenInPdf] = useState(false);
  // Derived, not a frozen snapshot — so in-modal actions (favorite toggle, etc.) that refresh
  // state.quotations are reflected immediately instead of only after closing and reopening.
  const open = openId ? state.quotations.find(q => q.id === openId) : null;
  const [cloneFor, setCloneFor] = useState(null);
  const [removeQuote, setRemoveQuote] = useState(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState(null);

  const [query, setQuery] = useState("");
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range } = usePeriod("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const owned = role === "sales_exec" ? state.quotations.filter(q => q.owner === userId || !q.owner) : state.quotations;
  const periodFiltered = owned.filter(q => inRange(q.createdAt, range));
  const salespeople = [...new Map(periodFiltered.map(q => q.owner).filter(Boolean).map(id => [id, state.employees.find(e => e.id === id)]).filter(([,e]) => e)).values()];
  const ownerFiltered = ownerFilter ? periodFiltered.filter(q => q.owner === ownerFilter) : periodFiltered;
  const rows = (favoritesOnly ? ownerFiltered.filter(q => q.favorite) : ownerFiltered)
    .filter(q => [q.customer, q.id].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .slice().sort((a,b) => (b.favorite?1:0) - (a.favorite?1:0));
  const favoriteCount = ownerFiltered.filter(q => q.favorite).length;
  const pg = usePagination(rows);
  const total = q => quoteTotals(q.items, q.orderDiscount, q.orderDiscountType || "amount").total;
  const profFees = q => professionalFeeAmount(q.items, q.orderDiscount, q.feeType, q.orderDiscountType);
  const customerOptions = state.customers.map(c=>c.name);
  const isAdmin = ADMIN_LIKE.includes(role);

  // "View quotation" (from Deals) either scrolls the row into view (existing quotation), or — right
  // after Build quotation creates a new one — opens it straight into the PDF preview tab, so the
  // salesperson sees the actual document immediately instead of a highlighted row to click into.
  useEffect(() => {
    if (!highlightId) return;
    if (autoOpenPdf) {
      setOpenId(highlightId);
      setOpenInPdf(true);
      onHighlightHandled?.();
      return;
    }
    const el = document.getElementById(`quote-row-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, autoOpenPdf]);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:10 }}>
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, cursor:"pointer" }}>
          <input type="checkbox" checked={favoritesOnly} onChange={e=>setFavoritesOnly(e.target.checked)} />
          <Star size={14} style={{ color:"var(--gold)" }} fill={favoritesOnly ? "var(--gold)" : "none"} />
          Favorites only {favoriteCount > 0 && `(${favoriteCount})`}
        </label>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <PeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
          {role !== "sales_exec" && (
            <select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}
              style={{ fontSize:13, border:"1px solid var(--hair)", borderRadius:8, padding:"7px 10px", background:"var(--surface)" }}>
              <option value="">All salespeople</option>
              <option value={userId}>My quotations</option>
              {salespeople.filter(e=>e.id!==userId).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <div style={{ position:"relative", maxWidth: 260 }}>
            <Search size={15} style={{ position:"absolute", left:12, top:9, color:"var(--ink-soft)" }} />
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search quotations"
              style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"7px 12px 7px 34px", fontSize:13, background:"var(--surface)" }} />
          </div>
          <button className="btn btn-sm" onClick={()=>exportCSV("quotations.csv",
            ["Quotation ID","Created","Customer","Service","Sales Person","Lead Type","Fee Type","Amount (QAR)","Professional Fees (QAR)","Valid Till","Status"],
            rows.map(q=>[q.id, q.createdAt, q.customer, q.items[0]?.service||"", state.employees.find(t=>t.id===q.owner)?.name||"", quotationOrigin(state, q), quotationFeeTypeLabel(q), total(q), profFees(q), q.validTill, q.status]))}>
            <Download size={13}/> Export
          </button>
        </div>
      </div>
      <div className="agw-card" style={{ padding: 0 }}>
        {rows.length === 0 ? <Empty icon={favoritesOnly ? Star : FileText} text={favoritesOnly ? "No favorite quotations yet — star a quotation to use it as a go-to format." : "No quotations yet — create one from an open Deal's \"Create quotation\" button."} /> : (
        <table className="agw-table">
          <thead><tr><th></th><th>Quotation</th><th>Created</th><th>Customer</th><th>Service</th><th>Sales person</th><th>Lead type</th><th>Amount (QAR)</th><th>Professional fees (QAR)</th><th>Valid till</th><th>Status</th><th></th><th></th></tr></thead>
          <tbody>
            {pg.pageRows.map(q => (
              <tr key={q.id} id={`quote-row-${q.id}`}
                onClick={()=>{ setOpenId(q.id); if (highlightId) onHighlightHandled(); }}
                style={q.id === highlightId ? { background:"var(--gold-tint)", boxShadow:"inset 3px 0 0 var(--gold)" } : undefined}>
                <td>
                  <button className="btn btn-sm btn-ghost" title={q.favorite ? "Remove from favorites" : "Mark as favorite"}
                    onClick={(e)=>{ e.stopPropagation(); dispatch({type:"TOGGLE_QUOTATION_FAVORITE", id:q.id}); }}>
                    <Star size={14} style={{ color: q.favorite ? "var(--gold)" : "var(--ink-soft)" }} fill={q.favorite ? "var(--gold)" : "none"} />
                  </button>
                </td>
                <td className="mono">{q.id}</td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(q.createdAt)}</td>
                <td><CustomerNameLink name={q.customer} state={state} onOpen={setViewingCustomer} /></td>
                <td style={{maxWidth:180}}>{q.items[0]?.service || "—"}</td>
                <td>{state.employees.find(t=>t.id===q.owner)?.name || "—"}</td>
                <td><Stamp tone={originTone(quotationOrigin(state, q))}>{quotationOrigin(state, q)}</Stamp></td>
                <td className="mono">{money(total(q))}</td>
                <td className="mono">{money(profFees(q))}</td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(q.validTill)}</td>
                <td><Stamp tone={statusTone(q.status)}>{quotationStatusLabel(q.status, role)}</Stamp></td>
                <td><button className="btn btn-sm btn-ghost" title="Clone" onClick={(e)=>{ e.stopPropagation(); setCloneFor(q); }}><Copy size={13}/></button></td>
                <td onClick={e=>e.stopPropagation()}>
                  <RowActions
                    onEdit={["Draft","Pending Manager Approval"].includes(q.status) ? ()=>{ setOpenId(q.id); setOpenInEdit(true); if (highlightId) onHighlightHandled(); } : null}
                    onRemove={isAdmin ? ()=>setRemoveQuote(q) : null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>)}
        <PaginationBar {...pg} />
      </div>
      {open && <QuoteDetailModal quotation={open} state={state} dispatch={dispatch} role={role} userId={userId} customerOptions={customerOptions} templates={state.quotationTemplates} startInEdit={openInEdit} startInPdf={openInPdf} onClose={()=>{ setOpenId(null); setOpenInEdit(false); setOpenInPdf(false); }}
        setPage={setPage} onSalesOrderCreated={onSalesOrderCreated} />}
      {cloneFor && <CloneQuoteModal quotation={cloneFor} customerOptions={customerOptions} dispatch={dispatch} onClose={()=>setCloneFor(null)} />}
      {removeQuote && <ConfirmModal title={`Remove ${removeQuote.id}?`} body={`${removeQuote.customer} — ${removeQuote.status}. This can't be undone. Blocked if it already has a Sales Order.`}
        onConfirm={async ()=>{ try { await dispatch({type:"DELETE_QUOTATION", id:removeQuote.id}); } catch (err) { alert(err instanceof ApiError ? err.message : "Couldn't delete — please try again."); } }}
        onClose={()=>setRemoveQuote(null)} />}
      {viewingCustomer && <CustomerDetailModal customer={viewingCustomer} state={state} dispatch={dispatch} role={role} userId={userId} onClose={()=>setViewingCustomer(null)} />}
    </div>
  );
}

function CloneQuoteModal({ quotation: q, customerOptions, dispatch, onClose, onCloned }) {
  const [customer, setCustomer] = useState(q.customer);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const changed = customer.trim() && customer.trim() !== q.customer;
  return (
    <Modal title={`Clone ${q.id}`} sub="Confirm or change the customer before creating the new draft." onClose={onClose}>
      <div className="field">
        <label>Customer</label>
        <div style={{ display:"flex", gap:6 }}>
          <input list="clone-customer-options" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Customer name" autoFocus style={{ flex:1 }} />
          <button type="button" className="btn btn-sm" onClick={()=>setShowNewCustomer(true)} title="Create new customer"><Plus size={13}/></button>
        </div>
        <datalist id="clone-customer-options">{customerOptions.map(n => <option key={n} value={n} />)}</datalist>
      </div>
      {changed && <div className="side-note" style={{marginTop:0}}><AlertTriangle size={13} style={{verticalAlign:-2, marginRight:4}}/>This clone will be created as a standalone draft, not linked to the original deal.</div>}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!customer.trim()} onClick={()=>{
          dispatch({type:"CLONE_QUOTATION", id:q.id, customer:customer.trim()});
          onClose();
          if (onCloned) onCloned();
        }}>Clone quotation</button>
      </div>
      {showNewCustomer && <NewCustomerModal dispatch={dispatch} onClose={()=>setShowNewCustomer(false)} onCreated={(name)=>setCustomer(name)} />}
    </Modal>
  );
}

function QuoteDetailModal({ quotation: q, state, dispatch, role, userId, customerOptions=[], templates={}, onClose, startInEdit=false, startInPdf=false, setPage, onSalesOrderCreated }) {
  const [view, setView] = useState(startInEdit || startInPdf ? "pdf" : "details");
  const [cloning, setCloning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [revising, setRevising] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const confirm = useConfirm();
  const editable = ["Draft","Pending Manager Approval"].includes(q.status);
  const isAdmin = ADMIN_LIKE.includes(role);
  // Once sent to the client, the only way back to an editable Draft is a deliberate revision —
  // available any time before a Sales Order actually exists for this quotation (Approved is
  // included too since Government Fee quotations go straight to Approved with no sales order at
  // all, and revising a non-Government one after Approved is an admin's explicit call to undo an
  // already-created sales order, not something to allow by accident).
  const revisable = ["Sent","Under Negotiation","Client Accepted","Approved"].includes(q.status);
  const customerEmail = state?.customers.find(c=>c.name===q.customer)?.email;
  const linkedSalesOrder = state?.salesOrders.find(so => so.quotationId === q.id);

  // "content" holds the committed (saved) text/items shown everywhere in this modal.
  // "draft" is the working copy while Visual edit is active in the PDF tab.
  const [content, setContent] = useState(() => ({
    subject: q.subject || "", items: q.items.map(it => ({...it})), notes: q.notes || "",
    terms: q.terms || "", orderDiscount: q.orderDiscount || 0, orderDiscountType: q.orderDiscountType || "amount",
    bank: q.bank || "", footerNote: q.footerNote || "",
    theme: q.theme || "charcoal",
  }));
  const [visualEdit, setVisualEdit] = useState(startInEdit);
  const [draft, setDraft] = useState(() => startInEdit ? { ...content, items: content.items.map(it=>({...it})) } : null);
  const [downloading, setDownloading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  // Every status-transition button (Send to client, Approve discount, Create sales order, ...)
  // used to fire dispatch() without awaiting it and close the modal immediately regardless of
  // outcome — so a failed call (e.g. "create sales order" erroring) looked identical to a
  // successful one, with nothing left to show for it. Route them all through this instead.
  const runAction = async (action, { keepOpen = false } = {}) => {
    setActionBusy(true);
    setActionError("");
    try {
      const result = await dispatch(action);
      if (!keepOpen) onClose();
      return result;
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't complete this action — please try again.");
    } finally {
      setActionBusy(false);
    }
  };

  // "Current view" and "PDF preview" share one edit session — entering edit mode from either
  // tab, editing a field, then switching tabs keeps the same staged draft rather than each tab
  // having its own separate editable copy.
  const src = visualEdit && draft ? draft : content;
  const editingNow = visualEdit && !!draft;
  const cq = { ...q, ...src };
  const { subtotal, itemDiscountTotal, discountAmount, total } = quoteTotals(cq.items, cq.orderDiscount, cq.orderDiscountType || "amount");
  const govProfSplitCq = govProfSplit(cq.items, q.feeType);
  const hasDiscount = cq.items.some(it=>it.discountPct>0) || (cq.orderDiscount||0) > 0;
  const myDesignation = state?.employees.find(e=>e.id===userId)?.designation;
  const assignedApproverDesignations = (state?.approvalTypes||[]).find(t=>t.key==="quotation_approval")?.approverDesignations || [];
  const canApprove = role === "sales_manager" || ADMIN_LIKE.includes(role) || (myDesignation && assignedApproverDesignations.includes(myDesignation));
  // Sales person is attribution metadata, not something the client's document shows — kept here,
  // in the admin-facing detail view (and the list table), and reassignable regardless of status
  // since it's a correction, not a content edit.
  const salesPeople = (state?.employees || []).filter(e => e.roles.includes("sales_exec") || e.roles.includes("sales_manager"));
  const salesPeopleOptions = q.owner && !salesPeople.some(e=>e.id===q.owner)
    ? [...salesPeople, state?.employees.find(e=>e.id===q.owner)].filter(Boolean)
    : salesPeople;

  const [savingVisual, setSavingVisual] = useState(false);
  const [visualSaveError, setVisualSaveError] = useState("");
  const startVisualEdit = () => { setDraft({ ...content, items: content.items.map(it=>({...it})) }); setVisualEdit(true); setVisualSaveError(""); };
  const saveVisualEdit = async () => {
    setSavingVisual(true);
    setVisualSaveError("");
    try {
      await dispatch({ type:"UPDATE_QUOTATION", id:q.id, payload:{ ...draft, customer:q.customer, feeType:q.feeType } });
      setContent(draft);
      setDraft(null);
      setVisualEdit(false);
    } catch (err) {
      setVisualSaveError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSavingVisual(false);
    }
  };
  const cancelVisualEdit = () => { setDraft(null); setVisualEdit(false); setVisualSaveError(""); };
  const updDraft = (field, val) => setDraft(d => ({ ...d, [field]: val }));

  return (
    <Modal title={q.id} sub={<CustomerNameLink name={q.customer} state={state} onOpen={setViewingCustomer} />} onClose={onClose} width={960}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
          <button className={`tab ${view==="details"?"active":""}`} onClick={()=>setView("details")}>Current view</button>
          <button className={`tab ${view==="pdf"?"active":""}`} onClick={()=>setView("pdf")}>PDF preview</button>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <button className="btn btn-sm btn-ghost" title={q.favorite ? "Remove from favorites" : "Mark as favorite"}
            onClick={()=>dispatch({type:"TOGGLE_QUOTATION_FAVORITE", id:q.id})}>
            <Star size={14} style={{ color: q.favorite ? "var(--gold)" : "var(--ink-soft)" }} fill={q.favorite ? "var(--gold)" : "none"} />
          </button>
          <RowActions onRemove={isAdmin ? ()=>setRemoving(true) : null} />
        </div>
      </div>
      <div style={{ borderBottom:"1px solid var(--hair)", marginBottom:18 }} />

      {view === "details" && (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10, fontSize:12.5, color:"var(--ink-soft)" }}>
            <span>Sales person:</span>
            {isAdmin ? (
              <select value={q.owner || ""} onChange={e=>dispatch({type:"SET_QUOTATION_OWNER", id:q.id, owner:e.target.value})}
                style={{ fontSize:12.5, border:"1px solid var(--hair)", borderRadius:6, padding:"3px 8px", background:"var(--surface)", color:"var(--ink)" }}>
                {!q.owner && <option value="">—</option>}
                {salesPeopleOptions.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            ) : (
              <strong style={{ color:"var(--ink)", fontWeight:500 }}>{state?.employees.find(e=>e.id===q.owner)?.name || "—"}</strong>
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <Rail steps={["Draft","Pending Manager Approval","Sent",quotationStatusLabel("Client Accepted", role),"Approved"]}
              current={q.status === "Rejected" || q.status === "Expired" ? "Sent" : quotationStatusLabel(q.status, role)} />
            <div style={{ display:"flex", gap:6 }}>
              {q.packageTier && <Stamp tone="neutral">{q.packageTier}</Stamp>}
              <Stamp tone={quotationFeeTypeTone(q)}>{quotationFeeTypeLabel(q)}</Stamp>
            </div>
          </div>
          {q.feeType === "Government Fee" && (
            <div className="side-note" style={{marginBottom:10}}>
              <AlertTriangle size={13} style={{verticalAlign:-2, marginRight:4}}/>Government Fee quotations are for viewing and sharing as PDF only — excluded from business volume and incentive calculations, and they don't create a Sales Order, Invoice, or Job Card.
            </div>
          )}
          {q.feeType !== "Government Fee" && q.items.some(it=>it.feeType==="Government Fee") && (
            <div className="side-note" style={{marginBottom:10}}>
              <AlertTriangle size={13} style={{verticalAlign:-2, marginRight:4}}/>Includes Government Fee line items — those are pass-through charges, excluded from business volume and incentive calculations.
            </div>
          )}

          {editable && (
            <div className="side-note" style={{marginBottom:10}}>Use Visual edit under the PDF preview tab to make changes.</div>
          )}
          <QuoteItemsEditor items={cq.items} onChange={(next)=>updDraft("items", next)} service={cq.items[0]?.service} catalog={state?.itemCatalog || []} quotationFeeType={q.feeType} readOnly />
          {editingNow && (
            <div style={{ maxWidth:320, marginLeft:"auto", marginTop:10 }}>
              <OrderDiscountField value={cq.orderDiscount||0} type={cq.orderDiscountType||"amount"}
                onValueChange={(v)=>updDraft("orderDiscount", v)} onTypeChange={(t)=>updDraft("orderDiscountType", t)} />
            </div>
          )}
          {govProfSplitCq.govTotal > 0 && govProfSplitCq.profTotal > 0 && (govProfSplitCq.govFirst ? (
            <>
              <div style={{ textAlign:"right", marginTop: 10, fontSize:13, color:"var(--ink-soft)" }}>Government Fee Total: <span className="mono">{money(govProfSplitCq.govTotal)}</span></div>
              <div style={{ textAlign:"right", marginTop: 2, fontSize:13, color:"var(--ink-soft)" }}>Professional Fee Total: <span className="mono">{money(govProfSplitCq.profTotal)}</span></div>
            </>
          ) : (
            <>
              <div style={{ textAlign:"right", marginTop: 10, fontSize:13, color:"var(--ink-soft)" }}>Professional Fee Total: <span className="mono">{money(govProfSplitCq.profTotal)}</span></div>
              <div style={{ textAlign:"right", marginTop: 2, fontSize:13, color:"var(--ink-soft)" }}>Government Fee Total: <span className="mono">{money(govProfSplitCq.govTotal)}</span></div>
            </>
          ))}
          {itemDiscountTotal > 0 && <div style={{ textAlign:"right", marginTop: (govProfSplitCq.govTotal > 0 && govProfSplitCq.profTotal > 0) ? 2 : 10, fontSize:13, color:"var(--ink-soft)" }}>Item Discount: <span className="mono">(-) {money(itemDiscountTotal)}</span></div>}
          <div style={{ textAlign:"right", marginTop: (itemDiscountTotal > 0 || (govProfSplitCq.govTotal > 0 && govProfSplitCq.profTotal > 0)) ? 2 : 10, fontSize:13, color:"var(--ink-soft)" }}>Sub Total: <span className="mono">{money(subtotal)}</span></div>
          {discountAmount > 0 && <div style={{ textAlign:"right", marginTop: 2, fontSize:13, color:"var(--ink-soft)" }}>Discount{cq.orderDiscountType === "percent" ? ` (${cq.orderDiscount}%)` : ""}: <span className="mono">(-) {money(discountAmount)}</span></div>}
          <div style={{ textAlign:"right", marginTop: 4, fontSize: 15 }}><strong>Total: <span className="mono">{money(total)}</span></strong></div>
          {cq.terms && <div className="side-note">{cq.terms}</div>}

          <div style={{ display:"flex", gap:8, marginTop: 14, flexWrap:"wrap" }}>
            <button className="btn btn-sm" onClick={()=>setCloning(true)}><Copy size={13}/> Clone as new draft</button>
            <button className="btn btn-sm" onClick={()=>setEmailing(true)}>
              {q.emailedToClient ? <><BadgeCheck size={13}/> Emailed {fmtDate(q.emailedAt)}</> : <><Mail size={13}/> Email to customer</>}
            </button>
            {/* Locked until the quotation has actually been approved & sent — downloading a Draft
                risks it going out before pricing/discount sign-off is final. */}
            <button className="btn btn-sm" disabled={downloading || q.status === "Draft"} title={q.status === "Draft" ? "Approve & send (or submit for approval) first" : undefined} onClick={async ()=>{
              setDownloading(true);
              try {
                const blob = await api.quotations.downloadPdf(q.id);
                downloadBlob(`Quotation-${q.id}.pdf`, blob);
              } finally {
                setDownloading(false);
              }
            }}><Download size={13}/> {downloading ? "Generating…" : "Download PDF"}</button>
          </div>
          {cloning && <CloneQuoteModal quotation={q} customerOptions={customerOptions} dispatch={dispatch} onClose={()=>setCloning(false)} onCloned={onClose} />}
          {removing && <ConfirmModal title={`Remove ${q.id}?`} body={`${q.customer} — ${q.status}. This can't be undone. Blocked if it already has a Sales Order.`}
            onConfirm={async ()=>{
              try { await dispatch({type:"DELETE_QUOTATION", id:q.id}); onClose(); }
              catch (err) { alert(err instanceof ApiError ? err.message : "Couldn't delete — please try again."); }
            }}
            onClose={()=>setRemoving(false)} />}
          {emailing && (
            <EmailCustomerModal
              customerName={q.customer} customerEmail={customerEmail} employees={state?.employees || []}
              defaultSubject={`Quotation ${q.id} — ${cq.subject || cq.items[0]?.service || "Address Gateway"}`}
              defaultBody={`Dear ${q.customer},\n\nPlease find attached your quotation ${q.id} for ${money(total)}.\n\nValid until ${fmtDate(q.validTill)}.\n\nKind regards,\nAddress Gateway Business Services`}
              dispatch={dispatch} onClose={()=>setEmailing(false)}
              onSend={({ccNames})=>dispatch({type:"MARK_EMAILED", entity:"quotation", id:q.id, customer:q.customer, cc:ccNames})}
            />
          )}

          {editingNow && (
            <div className="side-note" style={{ marginTop:12, marginBottom:0 }}>Finish editing — save or cancel above — before changing this quotation's status.</div>
          )}
          {!editingNow && actionError && <div className="side-note" style={{ color:"var(--danger)", marginTop:12, marginBottom:0 }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{actionError}</div>}
          {!editingNow && (
          <div style={{ display:"flex", gap:8, marginTop: 12, flexWrap:"wrap" }}>
            {q.status === "Draft" && (hasDiscount || !canApprove) &&
              <button className="btn btn-primary" disabled={actionBusy} onClick={()=>runAction({type:"SUBMIT_QUOTATION_FOR_APPROVAL", id:q.id})}>Submit for approval</button>}
            {q.status === "Draft" && !hasDiscount && canApprove &&
              <button className="btn btn-primary" disabled={actionBusy} onClick={()=>runAction({type:"SEND_QUOTATION", id:q.id})}><Check size={14}/> Approve & send</button>}
            {q.status === "Pending Manager Approval" && canApprove &&
              <button className="btn btn-primary" disabled={actionBusy} onClick={()=>runAction({type:"APPROVE_QUOTATION_DISCOUNT", id:q.id, by:"Sales Manager"})}><Check size={14}/> Approve & send</button>}
            {q.status === "Pending Manager Approval" && !canApprove &&
              <div className="side-note" style={{marginTop:0}}>Waiting on approval before this can be sent to the client.</div>}
            {q.status === "Sent" && <>
              <button className="btn" disabled={actionBusy} onClick={()=>runAction({type:"SET_QUOTATION_STATUS", id:q.id, status:"Under Negotiation"}, { keepOpen: true })}>Mark under negotiation</button>
              {q.feeType === "Government Fee" ? (
                <button className="btn btn-primary" disabled={actionBusy} onClick={()=>runAction({type:"SET_QUOTATION_STATUS", id:q.id, status:"Approved"})}>Client accepted — mark approved</button>
              ) : (
                <button className="btn btn-primary" disabled={actionBusy} onClick={()=>runAction({type:"SET_QUOTATION_STATUS", id:q.id, status:"Client Accepted"}, { keepOpen: true })}>Client accepted</button>
              )}
              <button className="btn" style={{color:"var(--danger)"}} disabled={actionBusy} onClick={async ()=>{
                if (await confirm({ title:`Mark ${q.id} rejected?`, body:"The client turned this down. The linked deal moves to Lost — this can't be undone from here.", confirmLabel:"Mark rejected" }))
                  runAction({type:"SET_QUOTATION_STATUS", id:q.id, status:"Rejected"});
              }}>Mark rejected</button>
            </>}
            {q.status === "Under Negotiation" && (
              q.feeType === "Government Fee" ? (
                <button className="btn btn-primary" disabled={actionBusy} onClick={()=>runAction({type:"SET_QUOTATION_STATUS", id:q.id, status:"Approved"})}>Client accepted — mark approved</button>
              ) : (
                <button className="btn btn-primary" disabled={actionBusy} onClick={()=>runAction({type:"SET_QUOTATION_STATUS", id:q.id, status:"Client Accepted"}, { keepOpen: true })}>Client accepted</button>
              )
            )}
            {q.status === "Client Accepted" && (
              isAccountsOrAdmin(role) ? (
                <button className="btn btn-primary" disabled={actionBusy} onClick={async ()=>{
                  if (await confirm({ title:`Convert ${q.id} to a Sales Order?`, body:"This creates a real Sales Order from this quotation and moves the linked deal to Won. Make sure the terms are final first.", confirmLabel:"Convert" })) {
                    const r = await runAction({type:"CONVERT_TO_SALES_ORDER", quotationId:q.id});
                    // salesOrderId is null for Government Fee quotations — those don't create a
                    // real Sales Order, so there's nothing to navigate to or highlight.
                    if (r?.salesOrderId) { onSalesOrderCreated?.(r.salesOrderId); setPage?.("orders"); }
                  }
                }}>{actionBusy ? "Creating…" : "Convert Sales Order"}</button>
              ) : (
                <div className="side-note" style={{marginTop:0}}>Client accepted — now under payment process. Accounts will convert this into a sales order.</div>
              )
            )}
            {revisable && isAdmin &&
              <button className="btn" disabled={actionBusy} onClick={()=>setRevising(true)}><Pencil size={13}/> Revise quotation</button>}
          </div>
          )}
          {revising && (
            <ConfirmModal
              title={`Revise ${q.id}?`}
              body={linkedSalesOrder
                ? `This moves it back to Draft so it can be edited and resubmitted for approval. Sales order ${linkedSalesOrder.id} (already created from this quotation) is not affected — remove or replace it separately if the terms have genuinely changed.`
                : "This moves it back to Draft so it can be edited and resubmitted for approval."}
              confirmLabel="Revise"
              onConfirm={()=>{ setRevising(false); runAction({type:"REVISE_QUOTATION", id:q.id}, { keepOpen: true }); }}
              onClose={()=>setRevising(false)}
            />
          )}
        </>
      )}

      {view === "pdf" && (() => {
        const themeColors = QUOTE_THEMES[src.theme] || QUOTE_THEMES.charcoal;
        const inputStyle = { border:"none", borderBottom:"1px dashed var(--hair)", background:"var(--gold-tint)", font:"inherit", color:"inherit", padding:"1px 2px", width:"100%" };

        let lastCategory = null;
        let runningNumber = 0;
        const rows = [];
        src.items.forEach((it, i) => {
          const bg = isGovFeeLine(it, q.feeType) ? GOV_FEE_BG : PROF_FEE_BG;
          if ((it.category || "") !== lastCategory && it.category) {
            rows.push({ kind: "category", label: it.category, key: "cat-"+i, bg, idx: i });
            lastCategory = it.category;
          }
          runningNumber++;
          rows.push({ kind: "item", it, number: runningNumber, idx: i, key: "item-"+i, bg });
        });
        const { subtotal: pdfSubtotal, itemDiscountTotal: pdfItemDiscountTotal, discountAmount: pdfDiscountAmount, total: pdfTotal } =
          quoteTotals(src.items, src.orderDiscount, src.orderDiscountType || "amount");
        const pdfSplit = govProfSplit(src.items, q.feeType);
        const termLines = (src.terms || "").split("\n").map(t=>t.trim()).filter(Boolean);
        const noteLines = (src.notes || "").split("\n").map(t=>t.trim()).filter(Boolean);
        // Editing happens right on this same table (dashed-underline inputs in place of static
        // text) instead of swapping to a separate form — the whole point of "Visual edit" is that
        // what you're looking at while editing is the actual document, not a different-shaped form
        // you have to mentally translate back into it.
        const updateItemField = (idx, field, val) => updDraft("items", src.items.map((it,i) => i===idx ? { ...it, [field]: val } : it));
        const removeItemAt = (idx) => updDraft("items", src.items.filter((_,i) => i!==idx));
        const addItem = (feeType) => ({ description, note, price }) => updDraft("items", [...src.items, { category:"", service: src.items[0]?.service, description, note, qty:1, price, discountPct:0, feeType }]);

        return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:12, color:"var(--ink-soft)" }}>{editingNow ? "Editing — changes are staged until you save." : "This is exactly what the client receives."}</span>
            <span style={{ display:"flex", gap:8 }}>
              {editable && (editingNow ? (
                <>
                  <button className="btn btn-sm" disabled={savingVisual} onClick={cancelVisualEdit}>Cancel</button>
                  <button className="btn btn-sm btn-primary" disabled={savingVisual} onClick={saveVisualEdit}><Check size={13}/> {savingVisual ? "Saving…" : "Save changes"}</button>
                </>
              ) : (
                <button className="btn btn-sm" onClick={startVisualEdit}><Pencil size={13}/> Visual edit</button>
              ))}
              {!editingNow && (
                <button className="btn btn-sm" disabled={downloading || q.status === "Draft"} title={q.status === "Draft" ? "Approve & send (or submit for approval) first" : undefined} onClick={async ()=>{
                  setDownloading(true);
                  try {
                    const blob = await api.quotations.downloadPdf(q.id);
                    downloadBlob(`Quotation-${q.id}.pdf`, blob);
                  } finally {
                    setDownloading(false);
                  }
                }}><Download size={13}/> {downloading ? "Generating…" : "Download PDF"}</button>
              )}
            </span>
          </div>
          {visualSaveError && <div className="side-note" style={{ color:"var(--danger)", marginBottom:12 }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{visualSaveError}</div>}
          {editingNow && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:"var(--ink-soft)", marginBottom:6 }}>Template theme</div>
              <ThemePicker value={src.theme} onChange={(t)=>updDraft("theme", t)} />
            </div>
          )}

          <div className="doc-paper">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
              <div>
                <div className="disp" style={{ fontSize:30, fontWeight:500, letterSpacing:"-.01em" }}>QUOTE</div>
                <div className="mono" style={{ fontSize:12, color:"var(--ink-soft)", marginTop:4 }}>Quote# {formatQuoteNumber(q.id)}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ display:"inline-block", textAlign:"right" }}><BrandLogo scale={1} /></div>
                <div style={{ fontSize:11.5, color:"var(--ink-soft)", marginTop:8, lineHeight:1.6 }}>
                  Address Gateway Building<br/>D Ring Road, Doha, Qatar<br/>Call: 44434912, Email : startup@addressgateway.com<br/>www.addressgateway.com
                </div>
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
              <div>
                <div style={{ fontSize:12, color:"var(--ink-soft)" }}>Quote Date :</div>
                <div style={{ fontSize:13, marginTop:2 }}>{fmtDate(q.createdAt || daysFromNow(0))}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, color:"var(--ink-soft)" }}>Bill To</div>
                <div style={{ fontSize:13.5, fontWeight:500, marginTop:2 }}>{q.customer}</div>
              </div>
            </div>

            <div style={{ fontSize:12, color:"var(--ink-soft)", marginBottom:2 }}>Subject :</div>
            {editingNow ? (
              <input style={{ ...inputStyle, fontSize:13.5, marginBottom:12 }} value={src.subject} onChange={e=>updDraft("subject", e.target.value)} placeholder="Quotation subject" />
            ) : (
              <div style={{ fontSize:13.5, marginBottom:20 }}>{src.subject || src.items[0]?.service || "Quotation"}</div>
            )}

            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12.5, marginBottom:8 }}>
              <thead>
                <tr style={{ background:themeColors.headerBg }}>
                  <th style={{ color:"#fff", textAlign:"left", padding:"9px 10px", fontWeight:500, width:30 }}>#</th>
                  <th style={{ color:"#fff", textAlign:"left", padding:"9px 10px", fontWeight:500 }}>Item & Description</th>
                  {editingNow && <th style={{ color:"#fff", textAlign:"right", padding:"9px 10px", fontWeight:500, width:50 }}>Qty</th>}
                  <th style={{ color:"#fff", textAlign:"right", padding:"9px 10px", fontWeight:500, width:90 }}>Rate</th>
                  <th style={{ color:"#fff", textAlign:"right", padding:"9px 10px", fontWeight:500, width:90 }}>Amount</th>
                  {editingNow && <th style={{ width:26 }}></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => r.kind === "category" ? (
                  <tr key={r.key} style={{ background:r.bg }}>
                    <td colSpan={editingNow ? 6 : 4} style={{ padding:"9px 10px", fontWeight:600, fontSize:12, borderBottom:"1px solid var(--hair)" }}>
                      {r.label}
                    </td>
                  </tr>
                ) : (
                  <tr key={r.key} style={{ borderBottom:"1px solid var(--hair)", background:r.bg }}>
                    <td style={{ padding:"9px 10px", verticalAlign:"top" }}>{r.number}</td>
                    <td style={{ padding:"9px 10px" }}>
                      {editingNow ? (
                        <>
                          <input style={inputStyle} value={r.it.description || ""} onChange={e=>updateItemField(r.idx,"description",e.target.value)} placeholder="Item description" />
                          <input style={{ ...inputStyle, fontSize:11, color:"var(--ink-soft)", marginTop:3 }} value={r.it.note || ""} onChange={e=>updateItemField(r.idx,"note",e.target.value)} placeholder="Note (optional)" />
                        </>
                      ) : (<>
                        {r.it.description || r.it.service}
                        {r.it.note && <div style={{ fontSize:11, color:"var(--ink-soft)", marginTop:2 }}>{r.it.note}</div>}
                      </>)}
                    </td>
                    {editingNow && (
                      <td style={{ padding:"9px 10px", verticalAlign:"top" }}>
                        <input type="number" min={1} style={{ ...inputStyle, textAlign:"right" }} value={r.it.qty} onChange={e=>updateItemField(r.idx,"qty",(e.target.value === "" ? "" : Number(e.target.value)))} />
                      </td>
                    )}
                    <td className="mono" style={{ padding:"9px 10px", textAlign:"right", verticalAlign:"top" }}>
                      {editingNow ? (
                        <input type="number" style={{ ...inputStyle, textAlign:"right" }} value={r.it.price} onChange={e=>updateItemField(r.idx,"price",(e.target.value === "" ? "" : Number(e.target.value)))} />
                      ) : Number(r.it.price).toFixed(2)}
                    </td>
                    <td className="mono" style={{ padding:"9px 10px", textAlign:"right", verticalAlign:"top" }}>{(r.it.qty*r.it.price*(1-(r.it.discountPct||0)/100)).toFixed(2)}</td>
                    {editingNow && (
                      <td style={{ padding:"9px 10px", verticalAlign:"top", textAlign:"center" }}>
                        <button type="button" className="btn btn-sm btn-ghost" style={{color:"var(--danger)", padding:2}} title="Remove" onClick={()=>removeItemAt(r.idx)}><X size={13}/></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {editingNow && (
              <div className="row2" style={{ marginBottom:16 }}>
                <AddItemControl catalog={state?.itemCatalog || []} feeType="Government Fee" service={src.items[0]?.service} label="Add government fee item" onAdd={addItem("Government Fee")} />
                <AddItemControl catalog={state?.itemCatalog || []} feeType="Professional Fee" service={src.items[0]?.service} label="Add professional fee item" onAdd={addItem("Professional Fee")} />
              </div>
            )}

            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:24 }}>
              <table style={{ fontSize:13 }}>
                <tbody>
                  {pdfSplit.govTotal > 0 && pdfSplit.profTotal > 0 && (pdfSplit.govFirst ? (
                    <>
                      <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Government Fee Total</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{pdfSplit.govTotal.toFixed(2)}</td></tr>
                      <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Professional Fee Total</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{pdfSplit.profTotal.toFixed(2)}</td></tr>
                    </>
                  ) : (
                    <>
                      <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Professional Fee Total</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{pdfSplit.profTotal.toFixed(2)}</td></tr>
                      <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Government Fee Total</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{pdfSplit.govTotal.toFixed(2)}</td></tr>
                    </>
                  ))}
                  {pdfItemDiscountTotal > 0 && (
                    <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Item Discount</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>(-) {pdfItemDiscountTotal.toFixed(2)}</td></tr>
                  )}
                  <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Sub Total</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{pdfSubtotal.toFixed(2)}</td></tr>
                  {(editingNow || pdfDiscountAmount > 0) && (
                    <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Discount{!editingNow && src.orderDiscountType==="percent" ? ` (${src.orderDiscount}%)` : ""}</td>
                      <td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>
                        {editingNow ? (
                          <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                            (-) <input type="number" min={0} max={src.orderDiscountType==="percent" ? 100 : undefined}
                              style={{ ...inputStyle, width:60, textAlign:"right", display:"inline-block" }} value={src.orderDiscount||0}
                              onChange={e=>updDraft("orderDiscount", (e.target.value === "" ? "" : Number(e.target.value)))} />
                            <select value={src.orderDiscountType||"amount"} onChange={e=>updDraft("orderDiscountType", e.target.value)}
                              style={{ fontSize:11, border:"1px solid var(--hair)", borderRadius:4, padding:"1px 3px", background:"var(--gold-tint)" }}>
                              <option value="amount">QAR</option>
                              <option value="percent">%</option>
                            </select>
                          </span>
                        ) : <>(-) {pdfDiscountAmount.toFixed(2)}</>}
                      </td>
                    </tr>
                  )}
                  <tr style={{ background:themeColors.totalBg }}><td style={{ padding:"7px 16px 7px 0", fontWeight:600, color:themeColors.totalText }}>Total</td><td className="mono" style={{ padding:"7px 0", textAlign:"right", fontWeight:600, color:themeColors.totalText }}>QAR {pdfTotal.toFixed(2)}</td></tr>
                </tbody>
              </table>
            </div>

            {(editingNow || noteLines.length > 0) && (
              <div style={{ marginBottom:22, paddingTop:16, borderTop:"1px solid var(--hair)" }}>
                <div style={{ fontSize:12, color:"var(--ink-soft)", marginBottom:6 }}>Notes</div>
                {editingNow ? (
                  <textarea rows={4} style={{ ...inputStyle, borderBottom:"1px solid var(--hair)", fontSize:12 }} value={src.notes} onChange={e=>updDraft("notes", e.target.value)} placeholder="One line per note" />
                ) : noteLines.map((n,i)=><div key={i} style={{ fontSize:12, lineHeight:1.7 }}>{n}</div>)}
              </div>
            )}

            <div style={{ fontSize:10.5, color:"var(--ink-soft)", borderTop:"1px solid var(--hair)", paddingTop:10 }}>
              {editingNow ? (
                <textarea rows={2} style={{ ...inputStyle, borderBottom:"1px solid var(--hair)", fontSize:10.5 }} value={src.footerNote || ""} onChange={e=>updDraft("footerNote", e.target.value)} placeholder={DEFAULT_FOOTER_NOTE} />
              ) : (src.footerNote || DEFAULT_FOOTER_NOTE)}
            </div>
          </div>

          <div className="doc-paper" style={{ marginTop:16 }}>
            {(editingNow || termLines.length > 0) && (
              <div style={{ marginBottom:24 }}>
                <div className="disp" style={{ fontSize:14, fontWeight:500, marginBottom:10, color:themeColors.heading }}>Terms & Conditions</div>
                {editingNow ? (
                  <textarea rows={5} style={{ ...inputStyle, borderBottom:"1px solid var(--hair)", fontSize:12 }} value={src.terms} onChange={e=>updDraft("terms", e.target.value)} placeholder="One term per line — numbered automatically" />
                ) : (
                  <ol style={{ margin:0, paddingLeft:18, fontSize:12, lineHeight:1.9 }}>
                    {termLines.map((t,i)=><li key={i}>{t}</li>)}
                  </ol>
                )}
              </div>
            )}

            <div style={{ marginBottom:24 }}>
              <div className="disp" style={{ fontSize:14, fontWeight:500, marginBottom:8, color:themeColors.heading }}>Bank Account Details</div>
              {editingNow ? (
                <textarea rows={4} style={{ ...inputStyle, borderBottom:"1px solid var(--hair)", fontSize:12 }} value={src.bank} onChange={e=>updDraft("bank", e.target.value)} placeholder={DEFAULT_BANK} />
              ) : (
                <div style={{ fontSize:12, lineHeight:1.8 }}>
                  {(src.bank || DEFAULT_BANK).split("\n").map((line,i)=><React.Fragment key={i}>{line}<br/></React.Fragment>)}
                </div>
              )}
            </div>

            <div style={{ fontSize:11, color:"var(--ink-soft)", lineHeight:1.7, marginBottom:28 }}>
              Disclaimer: Based on actuals. Rates might change anytime. If everything is clear and satisfactory, please feel free to sign the acceptance part below so we can immediately start the process. We look forward to assisting you with utmost professionalism as we envision a long-term working relationship with you and your company.
              <br/><br/>
              Ministry fees are subject to change and may vary depending on the time of submission and the applicable government rules and regulations in effect at that time. Approval timelines, including company formation and visa approval, are also dependent on the decisions and processing timeframes of the relevant government authorities.
            </div>

            <div className="disp" style={{ fontSize:13, fontWeight:500, marginBottom:10, color:themeColors.heading }}>ACCEPTANCE FORM:</div>
            <div style={{ fontSize:12, marginBottom:20 }}>I hereby, accept the above offer and I will endeavor to complete/submit all the required documents along with the agreed payment terms.</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"24px 40px", fontSize:12.5 }}>
              <div>Name: <span style={{ display:"inline-block", borderBottom:"1px solid var(--hair)", width:"75%" }}>&nbsp;</span></div>
              <div>Date: <span style={{ display:"inline-block", borderBottom:"1px solid var(--hair)", width:"75%" }}>&nbsp;</span></div>
              <div>Signature: <span style={{ display:"inline-block", borderBottom:"1px solid var(--hair)", width:"70%" }}>&nbsp;</span></div>
              <div>Mobile No.: <span style={{ display:"inline-block", borderBottom:"1px solid var(--hair)", width:"65%" }}>&nbsp;</span></div>
            </div>
          </div>

          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 14 }}>
            <button className="btn btn-sm" disabled={editingNow || downloading || q.status === "Draft"} title={q.status === "Draft" ? "Approve & send (or submit for approval) first" : undefined} onClick={async ()=>{
              setDownloading(true);
              try {
                const blob = await api.quotations.downloadPdf(q.id);
                downloadBlob(`Quotation-${q.id}.pdf`, blob);
              } finally {
                setDownloading(false);
              }
            }}><Download size={13}/> {downloading ? "Generating…" : "Download quotation"}</button>
          </div>
        </div>
        );
      })()}
      {viewingCustomer && <CustomerDetailModal customer={viewingCustomer} state={state} dispatch={dispatch} role={role} userId={userId} onClose={()=>setViewingCustomer(null)} />}
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* QUOTATION TEMPLATES (ADMIN / SALES MANAGER)                             */
/* ---------------------------------------------------------------------- */

function QuotationTemplatesPage({ state, dispatch }) {
  const [tab, setTab] = useState("templates");
  return (
    <div>
      <div className="tabbar" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab==="templates"?"active":""}`} onClick={()=>setTab("templates")}>Templates</button>
        <button className={`tab ${tab==="catalog"?"active":""}`} onClick={()=>setTab("catalog")}>Items catalog</button>
      </div>
      {tab === "templates" ? <QuotationTemplateEditor state={state} dispatch={dispatch} /> : <ItemCatalogManager catalog={state.itemCatalog} services={state.services} dispatch={dispatch} />}
    </div>
  );
}

function QuotationTemplateEditor({ state, dispatch }) {
  const [service, setService] = useState(SERVICES[0]);
  const seed = state.quotationTemplates[SERVICES[0]] || { items: [], terms: "", notes: "", subject: "", orderDiscount: 0, orderDiscountType: "amount", bank: "", footerNote: "" };
  const [subject, setSubject] = useState(seed.subject || "");
  const [items, setItems] = useState(seed.items);
  const [notes, setNotes] = useState(seed.notes || "");
  const [terms, setTerms] = useState(seed.terms || "");
  const [orderDiscount, setOrderDiscount] = useState(seed.orderDiscount || 0);
  const [orderDiscountType, setOrderDiscountType] = useState(seed.orderDiscountType || "amount");
  const [bank, setBank] = useState(seed.bank || "");
  const [footerNote, setFooterNote] = useState(seed.footerNote || "");
  const [serviceCost, setServiceCost] = useState(state.serviceCosts[SERVICES[0]] ?? 0);
  const [showNewService, setShowNewService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [removingTemplate, setRemovingTemplate] = useState(false);
  const hasTemplate = !!state.quotationTemplates[service];

  const clearForm = () => {
    setItems([]); setTerms(""); setNotes(""); setSubject(""); setOrderDiscount(0); setOrderDiscountType("amount"); setBank(""); setFooterNote("");
  };

  const switchService = (s) => {
    setService(s);
    const t = state.quotationTemplates[s] || { items: [], terms: "", notes: "", subject: "", orderDiscount: 0, orderDiscountType: "amount", bank: "", footerNote: "" };
    setItems(t.items);
    setTerms(t.terms || "");
    setNotes(t.notes || "");
    setSubject(t.subject || "");
    setOrderDiscount(t.orderDiscount || 0);
    setOrderDiscountType(t.orderDiscountType || "amount");
    setBank(t.bank || "");
    setFooterNote(t.footerNote || "");
    setServiceCost(state.serviceCosts[s] ?? 0);
  };

  return (
    <div className="agw-grid" style={{ gridTemplateColumns: "220px 1fr" }}>
      <div className="agw-card" style={{ padding: 8 }}>
        {state.services.map(s => (
          <button key={s} className="agw-nav-item" style={{ color: s===service?"var(--brand)":"var(--ink)", background: s===service?"var(--brand-tint)":"transparent", marginBottom: 4 }} onClick={()=>switchService(s)}>{s}</button>
        ))}
        {showNewService ? (
          <div style={{ padding:8 }}>
            <input autoFocus value={newServiceName} onChange={e=>setNewServiceName(e.target.value)} placeholder="New service name" style={{ width:"100%", marginBottom:6 }} />
            <div style={{ display:"flex", gap:6 }}>
              <button className="btn btn-sm btn-primary" disabled={!newServiceName.trim()} onClick={()=>{ dispatch({type:"ADD_SERVICE_OPTION", name:newServiceName.trim()}); switchService(newServiceName.trim()); setNewServiceName(""); setShowNewService(false); }}>Add</button>
              <button className="btn btn-sm" onClick={()=>{ setShowNewService(false); setNewServiceName(""); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="agw-nav-item" style={{ color:"var(--brand)" }} onClick={()=>setShowNewService(true)}><Plus size={14}/> Add service</button>
        )}
      </div>
      <div className="agw-card">
        <strong style={{ fontSize: 14 }}>{service}</strong>
        <p className="modal-sub">This becomes the starting point whenever someone builds a quotation for this service — one template with both Professional Fee and Government Fee lines, tagged per item.</p>

        <div className="field"><label>Subject</label><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. 100% FOREIGN OWNERSHIP COMPANY FORMATION - Professional fees" /></div>

        <QuoteItemsEditor items={items} onChange={setItems} service={service} catalog={state.itemCatalog} />

        <div className="row2" style={{ marginTop: 14 }}>
          <div className="field"><label>Notes (shown as-is on the quotation)</label><textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Looking forward for your business..." /></div>
          <div className="field"><label>Terms & Conditions (one per line — numbered automatically)</label><textarea rows={4} value={terms} onChange={e=>setTerms(e.target.value)} placeholder="100% of the Professional Fee to be paid in advance..." /></div>
        </div>

        <div className="row2">
          <OrderDiscountField label="Default overall discount" value={orderDiscount} type={orderDiscountType} onValueChange={setOrderDiscount} onTypeChange={setOrderDiscountType} />
          <div className="field"><label>Bank details override (optional — defaults to the standard account)</label><textarea rows={2} value={bank} onChange={e=>setBank(e.target.value)} placeholder="Leave blank to use the standard Address Gateway bank details" /></div>
        </div>

        <div className="field">
          <label>Service cost (internal — what it costs Address Gateway to deliver this service, e.g. Office Space Assistance = 2,000 QAR. Not shown to the client — subtracted once per transaction from the Professional Fee to get Business Volume.)</label>
          <div style={{ display:"flex", gap:8, maxWidth: 280 }}>
            <input type="number" min="0" step="0.01" value={serviceCost} onChange={e=>setServiceCost(e.target.value)} />
            <button className="btn btn-sm" onClick={()=>dispatch({type:"UPDATE_SERVICE_COST", service, cost: Number(serviceCost)||0})}>Save</button>
          </div>
        </div>
        <div className="field"><label>Footer note (optional — shown at the bottom of every page)</label><textarea rows={2} value={footerNote} onChange={e=>setFooterNote(e.target.value)} placeholder={DEFAULT_FOOTER_NOTE} /></div>

        <div style={{ display:"flex", gap:8, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={()=>dispatch({type:"UPDATE_QUOTATION_TEMPLATE", service, items, terms, notes, subject, orderDiscount, orderDiscountType, bank, footerNote})}>Save template</button>
          {hasTemplate && <button className="btn btn-ghost" style={{color:"var(--danger)"}} onClick={()=>setRemovingTemplate(true)}><Trash2 size={13}/> Delete template</button>}
        </div>
        {removingTemplate && (
          <ConfirmModal
            title={`Delete the template for ${service}?`}
            body="This clears the saved items, terms and notes for this service — the service itself stays, and a new quotation for it will start blank. This can't be undone."
            confirmLabel="Delete template"
            onConfirm={()=>{ dispatch({type:"DELETE_QUOTATION_TEMPLATE", service}); clearForm(); setRemovingTemplate(false); }}
            onClose={()=>setRemovingTemplate(false)}
          />
        )}
      </div>
    </div>
  );
}

// Add/edit/deactivate reusable quotation line items — the list the catalog picker in
// QuoteItemsEditor searches. Deactivating (not deleting) keeps history intact; see item_catalog
// in schema.sql for why.
function ItemCatalogManager({ catalog, services, dispatch }) {
  const blank = { name:"", description:"", note:"", feeType:"Government Fee", price:0, service:"" };
  const [editing, setEditing] = useState(null); // { id, ...fields } or null for "adding new"
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const startEdit = (entry) => { setEditing(entry.id); setForm({ ...entry }); };
  const startAdd = () => { setEditing("new"); setForm(blank); };
  const cancel = () => { setEditing(null); setForm(blank); };

  const save = async () => {
    if (!form.name.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), description: form.description.trim(), note: form.note || "", feeType: form.feeType, price: Number(form.price) || 0, service: form.service || "" };
      if (editing === "new") await dispatch({ type:"ADD_ITEM_CATALOG_ENTRY", payload });
      else await dispatch({ type:"UPDATE_ITEM_CATALOG_ENTRY", id: editing, payload });
      cancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="agw-card">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div>
          <strong style={{ fontSize:14 }}>Items catalog</strong>
          <p className="modal-sub" style={{ marginTop:2 }}>Reusable line items — pick one instead of retyping when building a quotation. Optionally scope one to a single service; leave it blank to offer it everywhere.</p>
        </div>
        {editing === null && <button className="btn btn-sm" onClick={startAdd}><Plus size={13}/> Add item</button>}
      </div>

      {editing !== null && (
        <div className="agw-card" style={{ marginBottom:14, background:"var(--gold-tint)" }}>
          <div className="row2">
            <div className="field"><label>Name (shown in the picker)</label><input autoFocus value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} placeholder="e.g. Issue New CR" /></div>
            <div className="field"><label>Fee type</label>
              <select value={form.feeType} onChange={e=>setForm(f=>({...f, feeType:e.target.value}))}>
                {FEE_TYPES.map(ft=><option key={ft}>{ft}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Description (goes onto the quotation line)</label><input value={form.description} onChange={e=>setForm(f=>({...f, description:e.target.value}))} placeholder="e.g. Issue New CR" /></div>
          <div className="field"><label>Note (optional)</label><input value={form.note} onChange={e=>setForm(f=>({...f, note:e.target.value}))} placeholder="e.g. 50 QAR per partner" /></div>
          <div className="row2">
            <div className="field"><label>Default price (QAR)</label><input type="number" value={form.price} onChange={e=>setForm(f=>({...f, price:e.target.value}))} /></div>
            <div className="field"><label>Only show for service (optional)</label>
              <select value={form.service} onChange={e=>setForm(f=>({...f, service:e.target.value}))}>
                <option value="">All services</option>
                {services.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-sm" onClick={cancel}>Cancel</button>
            <button className="btn btn-sm btn-primary" disabled={saving || !form.name.trim() || !form.description.trim()} onClick={save}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}

      {catalog.length === 0 ? <Empty icon={FileText} text="No catalog items yet." /> : (
        <table className="agw-table">
          <thead><tr><th>Name</th><th>Fee type</th><th>Price</th><th>Service</th><th></th></tr></thead>
          <tbody>
            {catalog.map(c => (
              <tr key={c.id}>
                <td>{c.name}{c.note && <div style={{fontSize:11, color:"var(--ink-soft)"}}>{c.note}</div>}</td>
                <td><Stamp tone={c.feeType==="Government Fee" ? "neutral" : "success"}>{c.feeType}</Stamp></td>
                <td className="mono">{money(c.price)}</td>
                <td>{c.service || <span style={{color:"var(--ink-soft)"}}>All services</span>}</td>
                <td>
                  <RowActions onEdit={()=>startEdit(c)} onRemove={()=>setRemoving(c)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {removing && <ConfirmModal title={`Remove "${removing.name}"?`} body="It stays out of the catalog picker going forward — quotations that already used it are not affected."
        onConfirm={()=>dispatch({type:"REMOVE_ITEM_CATALOG_ENTRY", id:removing.id})} onClose={()=>setRemoving(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* CUSTOMERS / KYC                                                         */
/* ---------------------------------------------------------------------- */

// The three compulsory KYC documents (see seedDefaultKycDocs, src/utils/helpers.js) every
// customer gets seeded with automatically — a customer can only reach Active status once all
// three have an expiry date filled in (enforced server-side in PATCH /customers/:id).
const COMPULSORY_KYC_TYPES = ["CR", "CL", "EC"];
const CUSTOMER_STATUSES = ["Active", "Administrative Block", "Scarified/Closed", "Pending"];

const EXPIRY_FILTERS = [
  { key:"", label:"Any expiry" },
  { key:"expired", label:"Expired" },
  { key:"week1", label:"Expiring within 1 week" },
  { key:"week2", label:"Expiring within 2 weeks" },
  { key:"month1", label:"Expiring within 1 month" },
];
const daysUntil = (expiry) => Math.ceil((new Date(expiry) - new Date()) / 86400000);
function matchesExpiryFilter(customer, filterKey) {
  if (!filterKey) return true;
  const allDocs = [...customer.docs, ...customer.employees.flatMap(e=>e.docs)];
  return allDocs.some(d => {
    const days = daysUntil(d.expiry);
    if (filterKey === "expired") return days < 0;
    if (filterKey === "week1") return days >= 0 && days <= 7;
    if (filterKey === "week2") return days >= 0 && days <= 14;
    if (filterKey === "month1") return days >= 0 && days <= 30;
    return true;
  });
}

function CustomersPage({ state, dispatch, role, userId }) {
  const [view, setView] = useState("table");
  const [openId, setOpenId] = useState(null);
  // Derived, not a frozen snapshot — see the identical fix on JobsPage/QuotationsPage: in-modal
  // actions (doc/employee edits) refresh state.customers, and the modal needs to reflect that live.
  const open = openId ? state.customers.find(c => c.id === openId) : null;
  const [query, setQuery] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [letterFilter, setLetterFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [removeCustomer, setRemoveCustomer] = useState(null);
  const isAdmin = ADMIN_LIKE.includes(role);
  // Ops Manager can update a customer's profile alongside Admin-tier (services KYC/onboarding
  // across every client operationally, not just ones they personally sourced) — Delete stays
  // Admin-tier only regardless of role, since that's destructive and touches KYC records other
  // people rely on (also enforced server-side: PATCH allows admin_like+ops_manager, DELETE admin_like only).
  // An explicit can_edit grant on the Customers module (Module Access) also qualifies — see
  // requireRoleOrModuleEdit on the backend PATCH route for the matching server-side check.
  const canEditCustomer = isAdmin || role === "ops_manager" || role === "ops_member" || role === "pro_head" || role === "pro" || !!state.myModulePermissions?.customers?.canEdit;
  // Visibility (a sales_exec only sees their own customers) is enforced server-side in
  // GET /customers, since that's the only place with enough data to derive ownership correctly —
  // /leads itself is already scoped to the requesting user for a sales_exec, so state.leads here
  // never contains enough to figure out who owns someone else's customer. Ops Manager is the one
  // exception that sees every customer (also enforced server-side), same as their Job Cards access.
  const visibleCustomers = state.customers;

  const filtered = visibleCustomers.filter(c => {
    const haystack = [c.name, c.contact, c.phone, c.email].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (!sizeFilter || c.companySize === sizeFilter) && matchesExpiryFilter(c, expiryFilter)
      && (!statusFilter || c.status === statusFilter) && (!letterFilter || c.name.trim().toUpperCase().startsWith(letterFilter));
  });
  const pg = usePagination(filtered);
  const kycDocOf = (c, type) => c.docs.find(d => d.type === type);
  const customerStatusTone = { Active:"success", "Administrative Block":"warning", "Scarified/Closed":"danger", Pending:"neutral" };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom: 14, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:8, flex:1, flexWrap:"wrap" }}>
          <div style={{ position:"relative", maxWidth: 320, flex:1, minWidth:200 }}>
            <Search size={15} style={{ position:"absolute", left:12, top:11, color:"var(--ink-soft)" }} />
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search customers by name, contact, phone or email"
              style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"9px 12px 9px 34px", fontSize:13.5, background:"var(--surface)" }} />
          </div>
          <select value={sizeFilter} onChange={e=>setSizeFilter(e.target.value)} style={{ maxWidth:190 }}>
            <option value="">All company sizes</option>
            {COMPANY_SIZES.map(s=><option key={s}>{s}</option>)}
          </select>
          <select value={expiryFilter} onChange={e=>setExpiryFilter(e.target.value)} style={{ maxWidth:210 }}>
            {EXPIRY_FILTERS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{ maxWidth:190 }}>
            <option value="">All statuses</option>
            {CUSTOMER_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-sm" onClick={()=>exportCSV("customers-kyc.csv",
            ["Customer","Created","Contact","Phone","Email","Company Size","Status","KYC Status"],
            filtered.map(c=>{ const flagged = [...c.docs, ...c.employees.flatMap(e=>e.docs)].filter(d => docState(d.expiry).label !== "Valid").length; return [c.name, c.createdAt, c.contact||"", c.phone||"", c.email||"", c.companySize||"", c.status, flagged>0?`${flagged} flagged`:"Clear"]; }))}>
            <Download size={13}/> Export
          </button>
          {role !== "viewer" && <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/> New customer</button>}
        </div>
      </div>

      <div style={{ display:"flex", gap:4, marginBottom: 14, flexWrap:"wrap" }}>
        <button className={`pill ${!letterFilter?"active":""}`} style={{ cursor:"pointer", border:"1px solid var(--hair)", background: !letterFilter?"var(--brand)":"var(--surface)", color: !letterFilter?"#fff":"var(--ink)" }} onClick={()=>setLetterFilter("")}>All</button>
        {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => (
          <button key={l} className="pill" style={{ cursor:"pointer", border:"1px solid var(--hair)", width:26, textAlign:"center", padding:"5px 0",
            background: letterFilter===l?"var(--brand)":"var(--surface)", color: letterFilter===l?"#fff":"var(--ink)" }}
            onClick={()=>setLetterFilter(letterFilter===l?"":l)}>{l}</button>
        ))}
      </div>

      <div className="tabbar" style={{ marginBottom: 14 }}>
        <button className={`tab ${view==="table"?"active":""}`} onClick={()=>setView("table")}>Table</button>
        <button className={`tab ${view==="card"?"active":""}`} onClick={()=>setView("card")}>Card</button>
      </div>

      {view === "table" && (
        <div className="agw-card" style={{ padding: 0 }}>
          {filtered.length === 0 ? (
            visibleCustomers.length === 0
              ? <Empty icon={UserCheck} text="No customers yet — add one directly, or they'll appear once a quotation converts to a sales order." />
              : <Empty icon={Search} text="No customers match these filters." />
          ) : (
          <div style={{ overflowX:"auto" }}>
          <table className="agw-table" style={{ minWidth: 1080 }}>
            <thead><tr><th>Customer</th><th>Created</th><th>Contact</th><th>Phone</th><th>Email</th><th>Company size</th><th>Status</th><th>CR</th><th>CL</th><th>EC</th><th>KYC</th><th></th></tr></thead>
            <tbody>
              {pg.pageRows.map(c => {
                const flagged = [...c.docs, ...c.employees.flatMap(e=>e.docs)].filter(d => docState(d.expiry).label !== "Valid").length;
                return (
                  <tr key={c.id} onClick={()=>setOpenId(c.id)}>
                    <td>{c.name}
                      <div className="mono" style={{fontSize:11,color:"var(--ink-soft)"}}>{c.id}</div>
                    </td>
                    <td className="mono" style={{fontSize:12}}>{fmtDate(c.createdAt)}</td>
                    <td>{c.contact || "—"}</td>
                    <td className="mono" style={{fontSize:12}}>{c.phone || "—"}</td>
                    <td style={{fontSize:12.5}}>{c.email || "—"}</td>
                    <td>{c.companySize || "—"}</td>
                    <td><Stamp tone={customerStatusTone[c.status] || "neutral"}>{c.status}</Stamp></td>
                    {COMPULSORY_KYC_TYPES.map(type => {
                      const d = kycDocOf(c, type);
                      const st = d?.expiry ? docState(d.expiry) : { label:"Missing", cls:"stamp-warning" };
                      return <td key={type} className="mono" style={{fontSize:11.5}} title={d?.expiry ? fmtDate(d.expiry) : "No expiry on file"}>
                        <Stamp tone={st.cls.replace("stamp-","")}>{d?.expiry ? fmtDate(d.expiry) : st.label}</Stamp>
                      </td>;
                    })}
                    <td>{flagged > 0 ? <Stamp tone="warning">{flagged} flagged</Stamp> : <Stamp tone="success">Clear</Stamp>}</td>
                    <td><RowActions onEdit={canEditCustomer ? ()=>setEditCustomer(c) : null} onRemove={isAdmin ? ()=>setRemoveCustomer(c) : null} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>)}
          <PaginationBar {...pg} />
        </div>
      )}

      {view === "card" && (
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        {filtered.map(c => {
          const flagged = [...c.docs, ...c.employees.flatMap(e=>e.docs)].filter(d => docState(d.expiry).label !== "Valid").length;
          return (
            <div className="agw-card" key={c.id} style={{ cursor:"pointer" }} onClick={()=>setOpenId(c.id)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <strong style={{ fontSize: 14.5 }}>{c.name}</strong>
                  <div className="mono" style={{ fontSize:11, color:"var(--ink-soft)" }}>{c.id}</div>
                  <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:2 }}>{c.contact || "—"} · {c.phone || "no phone on file"}</div>
                  {c.companySize && <span className="pill" style={{ marginTop:6, display:"inline-block" }}>{c.companySize}</span>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Stamp tone={customerStatusTone[c.status] || "neutral"}>{c.status}</Stamp>
                  {flagged > 0 ? <Stamp tone="warning">{flagged} doc{flagged>1?"s":""} flagged</Stamp> : <Stamp tone="success">KYC clear</Stamp>}
                  <RowActions onEdit={canEditCustomer ? ()=>setEditCustomer(c) : null} onRemove={isAdmin ? ()=>setRemoveCustomer(c) : null} />
                </div>
              </div>
              <div style={{ display:"flex", gap:6, marginTop: 12, flexWrap:"wrap" }}>
                {c.docs.map(d => {
                  const st = d.expiry ? docState(d.expiry) : { label:"Missing" };
                  return <span key={d.id} className="pill" style={{ background: "var(--page)" }}>{d.type}: <span style={{color: st.label==="Valid"?"var(--success)":st.label==="Expired"?"var(--danger)":"var(--warning)"}}>{st.label}</span></span>;
                })}
                {c.docs.length===0 && <span className="pill">No KYC documents yet</span>}
              </div>
            </div>
          );
        })}
        {filtered.length===0 && visibleCustomers.length>0 && <Empty icon={Search} text="No customers match these filters." />}
        {visibleCustomers.length===0 && <Empty icon={UserCheck} text="No customers yet — add one directly, or they'll appear once a quotation converts to a sales order." />}
      </div>
      )}
      {open && <CustomerDetailModal customer={open} state={state} dispatch={dispatch} role={role} userId={userId} onClose={()=>setOpenId(null)} />}
      {editCustomer && <NewCustomerModal customer={editCustomer} dispatch={dispatch} onClose={()=>setEditCustomer(null)} />}
      {removeCustomer && <ConfirmModal title={`Remove ${removeCustomer.name}?`} body="This deletes the customer profile, their KYC documents, and any employee records on file. This can't be undone." onConfirm={()=>dispatch({type:"DELETE_CUSTOMER", id:removeCustomer.id})} onClose={()=>setRemoveCustomer(null)} />}
      {showAdd && <NewCustomerModal dispatch={dispatch} onClose={()=>setShowAdd(false)} />}
    </div>
  );
}

const COMPANY_SIZES = ["Up to 10 Employees", "Up to 30 Employees", "Up to 100 Employees", "Up to 200 Employees"];

function NewCustomerModal({ dispatch, onClose, onCreated, customer=null }) {
  const isEdit = !!customer;
  const [form, setForm] = useState(customer
    ? { name: customer.name, type: customer.type || "Company", contact: customer.contact || "", phone: customer.phone || "", landline: customer.landline || "", contactMobile: customer.contactMobile || "", email: customer.email || "", address: customer.address || "", companySize: customer.companySize || "" }
    : { name: "", type: "Company", contact: "", phone: "", landline: "", contactMobile: "", email: "", address: "", companySize: "" });
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  // Not fire-and-forget: a rejected dispatch was previously swallowed silently while the modal
  // closed anyway, making a failed create/save look identical to a successful one.
  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      if (isEdit) {
        await dispatch({ type:"UPDATE_CUSTOMER", id: customer.id, payload: form });
      } else {
        await dispatch({ type:"ADD_CUSTOMER", payload: form });
      }
      onClose();
      if (onCreated) onCreated(form.name.trim());
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={isEdit ? "Edit customer" : "New customer"} sub={isEdit ? "Update this customer's profile." : "Create a customer profile — KYC documents can be added afterward."} onClose={onClose}>
      <div className="field"><label>Company / customer name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Company or individual name" autoFocus /></div>
      <div className="row2">
        <div className="field"><label>Type</label>
          <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
            <option>Company</option><option>Individual</option>
          </select>
        </div>
        <div className="field"><label>Contact person name</label><input value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})} placeholder="Optional" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Contact person mobile</label><input value={form.contactMobile} onChange={e=>setForm({...form,contactMobile:e.target.value})} placeholder="+974 ..." /></div>
        <div className="field"><label>Landline number</label><input value={form.landline} onChange={e=>setForm({...form,landline:e.target.value})} placeholder="Optional" /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+974 ..." /></div>
        <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="Optional" /></div>
      </div>
      <div className="field"><label>Full address (shown on quotations)</label><textarea rows={2} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Optional — building, street, area, city, country" /></div>
      {form.type === "Company" && (
        <div className="field"><label>Company size (KYC category)</label>
          <select value={form.companySize} onChange={e=>setForm({...form,companySize:e.target.value})}>
            <option value="">Not specified</option>
            {COMPANY_SIZES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
      )}
      {saveError && <div className="side-note" style={{ color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{saveError}</div>}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving || !form.name.trim()} onClick={handleSave}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create customer"}
        </button>
      </div>
    </Modal>
  );
}

function CustomerDetailModal({ customer: c, state, dispatch, role, userId, onClose }) {
  const isAdmin = ADMIN_LIKE.includes(role);
  const [tab, setTab] = useState("profile");
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [merging, setMerging] = useState(false);
  const blankDoc = { type: "Passport", number: "", expiry: daysFromNow(365) };
  const [doc, setDoc] = useState(blankDoc);
  const [docEditingId, setDocEditingId] = useState(null);
  const [removeDoc, setRemoveDoc] = useState(null);

  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empForm, setEmpForm] = useState({ name:"", designation:"" });
  const [empEditingId, setEmpEditingId] = useState(null);
  const [removeEmp, setRemoveEmp] = useState(null);

  const blankEmpDoc = { type: "Qatar ID", number: "", expiry: daysFromNow(365), cloudLink: "" };
  const [docForEmp, setDocForEmp] = useState(null);
  const [empDocEditingId, setEmpDocEditingId] = useState(null);
  const [empDoc, setEmpDoc] = useState(blankEmpDoc);
  const [removeEmpDoc, setRemoveEmpDoc] = useState(null);

  const startEditDoc = (d) => { setDocEditingId(d.id); setDoc({ type:d.type, number:d.number, expiry:d.expiry }); };
  const cancelEditDoc = () => { setDocEditingId(null); setDoc(blankDoc); };
  // CR/CL/EC need an expiry before they can be saved — a customer can't reach Active without one
  // (see PATCH /customers/:id) — everything else stays optional, same as before this existed.
  const isCompulsoryDocType = COMPULSORY_KYC_TYPES.includes(doc.type);
  const docTypeChoice = isCompulsoryDocType ? doc.type : "Other";
  const canSaveDoc = doc.type.trim() && (!isCompulsoryDocType || doc.expiry);
  const saveDoc = () => {
    if (!canSaveDoc) return;
    if (docEditingId) dispatch({ type:"UPDATE_KYC_DOC", customerId:c.id, docId:docEditingId, payload:doc });
    else dispatch({ type:"ADD_KYC_DOC", customerId:c.id, doc });
    cancelEditDoc();
  };

  const startEditEmp = (emp) => { setEmpEditingId(emp.id); setEmpForm({ name:emp.name, designation:emp.designation||"" }); setShowAddEmp(true); };
  const cancelEditEmp = () => { setEmpEditingId(null); setEmpForm({ name:"", designation:"" }); setShowAddEmp(false); };
  const saveEmp = () => {
    if (empEditingId) dispatch({ type:"UPDATE_CUSTOMER_EMPLOYEE", customerId:c.id, employeeId:empEditingId, payload:empForm });
    else dispatch({ type:"ADD_CUSTOMER_EMPLOYEE", customerId:c.id, employee:empForm });
    cancelEditEmp();
  };

  const startEditEmpDoc = (empId, d) => { setDocForEmp(empId); setEmpDocEditingId(d.id); setEmpDoc({ type:d.type, number:d.number, expiry:d.expiry, cloudLink:d.cloudLink||"" }); };
  const cancelEditEmpDoc = () => { setDocForEmp(null); setEmpDocEditingId(null); setEmpDoc(blankEmpDoc); };
  const saveEmpDoc = (empId) => {
    if (empDocEditingId) dispatch({ type:"UPDATE_CUSTOMER_EMPLOYEE_DOC", customerId:c.id, employeeId:empId, docId:empDocEditingId, payload:empDoc });
    else dispatch({ type:"ADD_CUSTOMER_EMPLOYEE_DOC", customerId:c.id, employeeId:empId, doc:empDoc });
    cancelEditEmpDoc();
  };
  const startAddEmpDoc = (empId) => { setDocForEmp(empId); setEmpDocEditingId(null); setEmpDoc(blankEmpDoc); };
  const toggleAddEmpDoc = (empId) => {
    if (docForEmp === empId && !empDocEditingId) cancelEditEmpDoc();
    else startAddEmpDoc(empId);
  };

  const [emailingCustomer, setEmailingCustomer] = useState(false);

  return (
    <Modal title={c.name} sub={`ID: ${c.id} · Customer profile, KYC vault & account dashboard`} onClose={onClose} width={720}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
          <button className={`tab ${tab==="profile"?"active":""}`} onClick={()=>setTab("profile")}>Profile & KYC</button>
          <button className={`tab ${tab==="onboarding"?"active":""}`} onClick={()=>setTab("onboarding")}>Onboarding Form</button>
          <button className={`tab ${tab==="dashboard"?"active":""}`} onClick={()=>setTab("dashboard")}>Dashboard</button>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-sm" onClick={()=>setCreatingDeal(true)}><Handshake size={13}/> Create deal</button>
          <button className="btn btn-sm" onClick={()=>setEmailingCustomer(true)}><Mail size={13}/> Email customer</button>
          {isAdmin && <button className="btn btn-sm" onClick={()=>setMerging(true)}><Users size={13}/> Merge</button>}
        </div>
      </div>
      <div style={{ borderBottom:"1px solid var(--hair)", marginBottom:18 }} />

      {merging && <MergeCustomersModal customer={c} state={state} dispatch={dispatch} onClose={()=>setMerging(false)} onMerged={onClose} />}

      {creatingDeal && <NewDealModal state={state} dispatch={dispatch} userId={userId} initialCustomer={c.name} onClose={()=>setCreatingDeal(false)} />}

      {emailingCustomer && (
        <EmailCustomerModal
          customerName={c.name} customerEmail={c.email} employees={state.employees}
          defaultSubject="" defaultBody={`Dear ${c.contact || c.name},\n\n\n\nKind regards,\nAddress Gateway Business Services`}
          dispatch={dispatch} onClose={()=>setEmailingCustomer(false)}
          onSend={({ccNames})=>dispatch({type:"MARK_EMAILED", entity:"customer", id:c.id, customer:c.name, cc:ccNames})}
        />
      )}

      {tab === "dashboard" && <CustomerDashboard customer={c} state={state} dispatch={dispatch} role={role} userId={userId} />}

      {tab === "onboarding" && <OnboardingFormTab api={api} customerId={c.id} />}

      {tab === "profile" && (
      <>
      {/* Active is only selectable once CR, CL, and EC each have an expiry — mirrors the
          server-side check in PATCH /customers/:id (see COMPULSORY_KYC_TYPES). */}
      {(() => {
        const canBeActive = COMPULSORY_KYC_TYPES.every(t => c.docs.some(d => d.type === t && d.expiry));
        return (
          <div className="agw-card" style={{ marginBottom: 16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
            <div>
              <strong style={{ fontSize:13.5 }}>Company status</strong>
              {!canBeActive && <div style={{ fontSize:11.5, color:"var(--ink-soft)", marginTop:2 }}>CR, CL, and EC all need an expiry date before this can be set Active.</div>}
            </div>
            <select value={c.status} disabled={!isAdmin && role!=="ops_manager" && role!=="ops_member" && role!=="pro_head" && role!=="pro"}
              onChange={e=>dispatch({type:"UPDATE_CUSTOMER", id:c.id, payload:{status:e.target.value}})} style={{ maxWidth:220 }}>
              {CUSTOMER_STATUSES.map(s=><option key={s} value={s} disabled={s==="Active" && !canBeActive && c.status!=="Active"}>{s}</option>)}
            </select>
          </div>
        );
      })()}
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 16 }}>
        <div className="agw-card"><div className="kpi-label">Created</div><div style={{ fontSize:14, fontWeight:500, marginTop:4 }}>{fmtDate(c.createdAt)}</div></div>
        <div className="agw-card"><div className="kpi-label">Contact person</div><div style={{ fontSize:14, fontWeight:500, marginTop:4 }}>{c.contact || "—"}</div></div>
        <div className="agw-card"><div className="kpi-label">Phone</div><div style={{ fontSize:14, fontWeight:500, marginTop:4, display:"flex", alignItems:"center", gap:4 }}>{c.phone || "—"}<CopyButton value={c.phone} /></div></div>
        <div className="agw-card"><div className="kpi-label">Contact mobile</div><div style={{ fontSize:14, fontWeight:500, marginTop:4, display:"flex", alignItems:"center", gap:4 }}>{c.contactMobile || "—"}<CopyButton value={c.contactMobile} /></div></div>
        <div className="agw-card"><div className="kpi-label">Landline</div><div style={{ fontSize:14, fontWeight:500, marginTop:4, display:"flex", alignItems:"center", gap:4 }}>{c.landline || "—"}<CopyButton value={c.landline} /></div></div>
        <div className="agw-card"><div className="kpi-label">Email</div><div style={{ fontSize:14, fontWeight:500, marginTop:4, display:"flex", alignItems:"center", gap:4, wordBreak:"break-all" }}>{c.email || "—"}<CopyButton value={c.email} /></div></div>
      </div>

      {/* One shared cloud folder for the whole KYC set, not a separate link per document —
          see CloudLinkButton's `big` variant and PATCH /customers/:id/cloud-link. */}
      <div className="agw-card" style={{ marginBottom: 16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
        <div>
          <strong style={{ fontSize:13.5 }}>KYC cloud folder</strong>
          <div style={{ fontSize:11.5, color:"var(--ink-soft)", marginTop:2 }}>One shared Drive/OneDrive/SharePoint link for all of this customer's documents.</div>
        </div>
        <CloudLinkButton big url={c.cloudLink} onSave={(url)=>dispatch({type:"SET_CUSTOMER_CLOUD_LINK", id:c.id, url})} />
      </div>

      <table className="agw-table">
        <thead><tr><th>Document</th><th>Number</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {c.docs.map(d => {
            // A compulsory type with no expiry yet is a still-empty placeholder, not literally
            // "Expired" — docState(null) would otherwise read that way (day-math against epoch).
            const st = d.expiry ? docState(d.expiry) : { label: "Missing", cls: "stamp-warning" };
            return <tr key={d.id}>
              <td>{d.type}</td><td className="mono" style={{display:"flex",alignItems:"center",gap:4}}>{d.number}<CopyButton value={d.number} /></td><td className="mono" style={{fontSize:12}}>{d.expiry ? fmtDate(d.expiry) : "—"}</td>
              <td><Stamp tone={st.cls.replace("stamp-","")}>{st.label}</Stamp></td>
              <td><RowActions onEdit={()=>startEditDoc(d)} onRemove={()=>setRemoveDoc(d)} /></td>
            </tr>;
          })}
        </tbody>
      </table>

      <div className="agw-card" style={{ marginTop: 16 }}>
        <strong style={{ fontSize: 13 }}>{docEditingId ? "Edit KYC document" : "Add KYC document"}</strong>
        <div className="row3" style={{ marginTop: 10 }}>
          <div className="field"><label>Type</label>
            <select value={docTypeChoice} onChange={e=>setDoc({...doc, type: e.target.value==="Other" ? "" : e.target.value})}>
              {COMPULSORY_KYC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              <option value="Other">Other</option>
            </select>
          </div>
          {docTypeChoice === "Other"
            ? <div className="field"><label>Document name</label><input value={doc.type} onChange={e=>setDoc({...doc,type:e.target.value})} placeholder="e.g. Passport" /></div>
            : <div className="field"><label>Number</label><input value={doc.number} onChange={e=>setDoc({...doc,number:e.target.value})} /></div>}
          <div className="field">
            <label>Expiry date{isCompulsoryDocType ? " (required)" : ""}</label>
            <input type="date" value={doc.expiry} onChange={e=>setDoc({...doc,expiry:e.target.value})} />
          </div>
        </div>
        {docTypeChoice === "Other" && (
          <div className="field"><label>Number</label><input value={doc.number} onChange={e=>setDoc({...doc,number:e.target.value})} /></div>
        )}
        {isCompulsoryDocType && !doc.expiry && (
          <div className="side-note" style={{ marginTop:0 }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{doc.type} needs an expiry date before it can be saved.</div>
        )}
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-primary btn-sm" disabled={!canSaveDoc} onClick={saveDoc}>{docEditingId ? "Save changes" : "Add document"}</button>
          {docEditingId && <button className="btn btn-sm" onClick={cancelEditDoc}>Cancel</button>}
        </div>
      </div>

      <div style={{ marginTop: 22, borderTop: "1px solid var(--hair)", paddingTop: 16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <strong style={{ fontSize: 13 }}><Building2 size={14} style={{ verticalAlign:-2, marginRight:5 }}/>Company employees</strong>
          <button className="btn btn-sm" onClick={()=>showAddEmp ? cancelEditEmp() : setShowAddEmp(true)}>{showAddEmp ? "Cancel" : "Add employee"}</button>
        </div>
        <p className="modal-sub" style={{ marginTop: 4, marginBottom: 10 }}>Staff working under this client's company — track their QID, passport and visa expiry the same way as the company's own KYC.</p>

        {showAddEmp && (
          <div className="agw-card" style={{ marginBottom: 12 }}>
            <strong style={{ fontSize:12.5 }}>{empEditingId ? "Edit employee" : "New employee"}</strong>
            <div className="row2" style={{ marginTop:6 }}>
              <div className="field"><label>Name</label><input value={empForm.name} onChange={e=>setEmpForm({...empForm,name:e.target.value})} placeholder="Full name" /></div>
              <div className="field"><label>Designation</label><input value={empForm.designation} onChange={e=>setEmpForm({...empForm,designation:e.target.value})} placeholder="Job title" /></div>
            </div>
            <button className="btn btn-primary btn-sm" disabled={!empForm.name} onClick={saveEmp}>
              {empEditingId ? "Save changes" : "Save employee"}
            </button>
          </div>
        )}

        {c.employees.length === 0 && !showAddEmp && <div className="side-note">No employees on file yet — add one to start tracking their document expiry.</div>}

        {c.employees.map(emp => (
          <div className="agw-card" key={emp.id} style={{ marginBottom: 10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{emp.name}</div>
                <div style={{ fontSize: 11.5, color:"var(--ink-soft)" }}>{emp.designation || "—"}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <button className="btn btn-sm btn-ghost" onClick={()=>toggleAddEmpDoc(emp.id)}>{docForEmp===emp.id && !empDocEditingId ? "Cancel" : "Add document"}</button>
                <RowActions onEdit={()=>startEditEmp(emp)} onRemove={()=>setRemoveEmp(emp)} />
              </div>
            </div>
            <div style={{ display:"flex", gap:6, marginTop: 8, flexWrap:"wrap", alignItems:"center" }}>
              {emp.docs.length === 0 && <span className="pill">No documents</span>}
              {emp.docs.map(d => {
                const st = docState(d.expiry);
                return (
                  <span key={d.id} style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                    <span className="pill" style={{ background: "var(--page)" }}>{d.type}: <span style={{color: st.label==="Valid"?"var(--success)":st.label==="Expired"?"var(--danger)":"var(--warning)"}}>{st.label}</span></span>
                    <CloudLinkButton url={d.cloudLink} onSave={(url)=>dispatch({type:"SET_EMPLOYEE_DOC_CLOUD_LINK", customerId:c.id, employeeId:emp.id, docId:d.id, url})} />
                    <RowActions onEdit={()=>startEditEmpDoc(emp.id, d)} onRemove={()=>setRemoveEmpDoc({ empId:emp.id, doc:d })} />
                  </span>
                );
              })}
            </div>
            {docForEmp === emp.id && (
              <>
                <strong style={{ fontSize:12, display:"block", marginTop:10 }}>{empDocEditingId ? "Edit document" : "New document"}</strong>
                <div className="row3" style={{ marginTop: 6 }}>
                  <div className="field"><label>Type</label><input value={empDoc.type} onChange={e=>setEmpDoc({...empDoc,type:e.target.value})} /></div>
                  <div className="field"><label>Number</label><input value={empDoc.number} onChange={e=>setEmpDoc({...empDoc,number:e.target.value})} /></div>
                  <div className="field"><label>Expiry</label><input type="date" value={empDoc.expiry} onChange={e=>setEmpDoc({...empDoc,expiry:e.target.value})} /></div>
                </div>
                <div className="field"><label>Cloud storage link (optional)</label><input value={empDoc.cloudLink} onChange={e=>setEmpDoc({...empDoc,cloudLink:e.target.value})} placeholder="Google Drive / OneDrive / SharePoint link" /></div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn btn-primary btn-sm" onClick={()=>saveEmpDoc(emp.id)}>{empDocEditingId ? "Save changes" : "Save document"}</button>
                  {empDocEditingId && <button className="btn btn-sm" onClick={cancelEditEmpDoc}>Cancel</button>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {removeDoc && <ConfirmModal title={`Remove ${removeDoc.type}?`} body="This document will be removed from the KYC vault." onConfirm={()=>dispatch({type:"DELETE_KYC_DOC", customerId:c.id, docId:removeDoc.id})} onClose={()=>setRemoveDoc(null)} />}
      {removeEmp && <ConfirmModal title={`Remove ${removeEmp.name}?`} body="This removes the employee and all of their documents from this customer." onConfirm={()=>dispatch({type:"DELETE_CUSTOMER_EMPLOYEE", customerId:c.id, employeeId:removeEmp.id})} onClose={()=>setRemoveEmp(null)} />}
      {removeEmpDoc && <ConfirmModal title={`Remove ${removeEmpDoc.doc.type}?`} body="This document will be removed from the employee's record." onConfirm={()=>dispatch({type:"DELETE_CUSTOMER_EMPLOYEE_DOC", customerId:c.id, employeeId:removeEmpDoc.empId, docId:removeEmpDoc.doc.id})} onClose={()=>setRemoveEmpDoc(null)} />}
      </>
      )}
    </Modal>
  );
}

// Opened from CustomerDetailModal — merges another (duplicate) customer's leads/deals/
// quotations/sales orders/invoices/job cards/subscriptions/KYC docs/staff/onboarding forms onto
// `customer`, filling any of `customer`'s own blank profile fields from the other one, then
// deletes it. `customer` (the one this was opened from) defaults to the side that's kept —
// swappable, since which record is "the good one" isn't always the one you happened to open.
function MergeCustomersModal({ customer, state, dispatch, onClose, onMerged }) {
  const others = state.customers.filter(o => o.id !== customer.id);
  const [otherId, setOtherId] = useState("");
  const [keepId, setKeepId] = useState(customer.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const other = others.find(o => o.id === otherId);
  const kept = keepId === customer.id ? customer : other;
  const merged = keepId === customer.id ? other : customer;

  const handleMerge = async () => {
    setSaving(true);
    setError("");
    try {
      await dispatch({ type: "MERGE_CUSTOMERS", targetId: kept.id, sourceId: merged.id });
      onClose();
      onMerged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't merge — please try again.");
      setSaving(false);
    }
  };

  return (
    <Modal title="Merge duplicate customer" sub={`Combine another customer's records into ${customer.name}, or the other way around.`} onClose={onClose} width={520}>
      <div className="field">
        <label>Duplicate customer</label>
        <input list="merge-customer-options" value={other ? other.name : ""} placeholder="Type or pick the duplicate customer"
          onChange={e => { const match = others.find(o => o.name === e.target.value); setOtherId(match ? match.id : ""); }} />
        <datalist id="merge-customer-options">{others.map(o => <option key={o.id} value={o.name} />)}</datalist>
      </div>

      {other && (
        <>
          <div className="field">
            <label>Keep</label>
            <select value={keepId} onChange={e => setKeepId(e.target.value)}>
              <option value={customer.id}>{customer.name}</option>
              <option value={other.id}>{other.name}</option>
            </select>
          </div>
          <div className="side-note" style={{ marginTop: 0 }}>
            <strong>{kept.name}</strong> is kept. All of <strong>{merged.name}</strong>'s leads, deals, quotations, sales orders,
            invoices, job cards, subscriptions, KYC documents, and staff records move onto {kept.name}, then {merged.name} is deleted —
            this can't be undone. Any of {kept.name}'s own profile fields that are already filled in stay as they are; only blank ones
            get filled from {merged.name}.
          </div>
          {error && <div className="side-note" style={{ marginTop: 10, color: "var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{error}</div>}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{background:"var(--danger)", borderColor:"var(--danger)"}} disabled={!other || saving} onClick={handleMerge}>
          {saving ? "Merging…" : `Merge & delete ${merged?.name || ""}`}
        </button>
      </div>
    </Modal>
  );
}

function CustomerDashboard({ customer: c, state, dispatch, role, userId }) {
  // Prefer the reliable customerId link; only fall back to name-matching for legacy rows that
  // predate that link (customerId null) — same rule as the backend's /customers/:id/dashboard.
  const belongsToCustomer = (x) => x.customerId ? x.customerId === c.id : x.customer === c.name;
  const quotations = state.quotations.filter(belongsToCustomer);
  const invoices = state.invoices.filter(belongsToCustomer);
  const jobCards = state.jobCards.filter(belongsToCustomer);
  const [openQuoteId, setOpenQuoteId] = useState(null);
  const openQuote = openQuoteId ? state.quotations.find(q => q.id === openQuoteId) : null;
  const [pdfInvoice, setPdfInvoice] = useState(null);
  const [openJobId, setOpenJobId] = useState(null);
  const openJob = openJobId ? state.jobCards.find(j => j.id === openJobId) : null;
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const customerOptions = state.customers.map(cu => cu.name);

  const quoteTotal = (q) => quoteTotals(q.items, q.orderDiscount, q.orderDiscountType || "amount").total;
  const totalInvoiced = invoices.reduce((a,inv) => a + inv.amount, 0);
  const totalPaid = invoices.reduce((a,inv) => a + inv.payments.reduce((x,p)=>x+p.amount,0), 0);
  // Outstanding/balance only ever counts the Professional Fee portion — Government Fee is a
  // pass-through the client owes regardless of what Address Gateway is chasing to collect.
  const totalBalance = invoices.reduce((a,inv) => a + Math.max(0, inv.professionalFeeAmount - inv.payments.reduce((x,p)=>x+p.amount,0)), 0);

  const jobStatusCounts = jobCards.reduce((acc,j) => { acc[j.status] = (acc[j.status]||0)+1; return acc; }, {});

  return (
    <div>
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 18 }}>
        <div className="agw-card"><div className="kpi-label">Quotations</div><div className="kpi-value disp">{quotations.length}</div></div>
        <div className="agw-card"><div className="kpi-label">Invoices</div><div className="kpi-value disp">{invoices.length}</div></div>
        <div className="agw-card"><div className="kpi-label">Job cards</div><div className="kpi-value disp">{jobCards.length}</div></div>
        <div className="agw-card"><div className="kpi-label">Outstanding balance</div><div className="kpi-value disp" style={{ color: totalBalance>0 ? "var(--danger)" : "var(--success)" }}>{money(totalBalance)}</div></div>
      </div>

      <div style={{ marginBottom: 8 }}><strong style={{ fontSize:13 }}>Quotations</strong> <span className="pill">{quotations.length} total</span></div>
      <div className="agw-card" style={{ padding:0, marginBottom:18 }}>
        {quotations.length === 0 ? <Empty icon={FileText} text="No quotations for this customer yet." /> : (
        <table className="agw-table">
          <thead><tr><th>Quotation</th><th>Service</th><th>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {quotations.map(q => (
              <tr key={q.id} style={{ cursor:"pointer" }} onClick={()=>setOpenQuoteId(q.id)}>
                <td className="mono">{q.id}</td>
                <td style={{maxWidth:160}}>{q.items[0]?.service || "—"}</td>
                <td className="mono">{money(quoteTotal(q))}</td>
                <td><Stamp tone={statusTone(q.status)}>{q.status}</Stamp></td>
                <td><button className="btn btn-sm btn-ghost" onClick={(e)=>{ e.stopPropagation(); setOpenQuoteId(q.id); }}><FileText size={13}/> View</button></td>
              </tr>
            ))}
          </tbody>
        </table>)}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 8 }}>
        <div><strong style={{ fontSize:13 }}>Invoices & Statement</strong> <span className="pill">{invoices.length} total</span></div>
        <button className="btn btn-sm" disabled={downloadingStatement} onClick={async ()=>{
          setDownloadingStatement(true);
          try {
            const blob = await api.customers.downloadStatementPdf(c.id);
            downloadBlob(`Statement-${c.id}.pdf`, blob);
          } catch (err) {
            alert(err instanceof ApiError ? err.message : "Couldn't generate the statement — please try again.");
          } finally {
            setDownloadingStatement(false);
          }
        }}><FileText size={13}/> {downloadingStatement ? "Generating…" : "Download Statement"}</button>
      </div>
      <div className="agw-card" style={{ padding:0, marginBottom:8 }}>
        {invoices.length === 0 ? <Empty icon={Receipt} text="No invoices for this customer yet." /> : (
        <table className="agw-table">
          <thead><tr><th>Invoice</th><th>Service</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {invoices.map(inv => {
              const paid = inv.payments.reduce((a,p)=>a+p.amount,0);
              const balance = Math.max(0, inv.professionalFeeAmount - paid);
              const invService = state.salesOrders.find(so=>so.id===inv.salesOrderId)?.service || state.subscriptions.find(s=>s.id===inv.subscriptionId)?.plan || "—";
              return (
                <tr key={inv.id}>
                  <td className="mono">{inv.id}</td>
                  <td style={{maxWidth:160}}>{invService}</td>
                  <td className="mono">{money(inv.amount)}</td>
                  <td className="mono">{money(paid)}</td>
                  <td className="mono" style={{ color: balance>0 ? "var(--danger)" : "var(--success)" }}>{money(balance)}</td>
                  <td><Stamp tone={statusTone(inv.status)}>{inv.status}</Stamp></td>
                  <td><button className="btn btn-sm btn-ghost" onClick={()=>setPdfInvoice(inv)}><FileText size={13}/> View</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>)}
      </div>
      {invoices.length > 0 && (
        <div className="agw-card" style={{ marginBottom:18 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}><span style={{color:"var(--ink-soft)"}}>Total invoiced (Statement)</span><span className="mono">{money(totalInvoiced)}</span></div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}><span style={{color:"var(--ink-soft)"}}>Total paid</span><span className="mono">{money(totalPaid)}</span></div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:600, borderTop:"1px solid var(--hair)", paddingTop:6 }}><span>Balance due</span><span className="mono" style={{ color: totalBalance>0 ? "var(--danger)" : "var(--success)" }}>{money(totalBalance)}</span></div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <strong style={{ fontSize:13 }}>Job Cards</strong> <span className="pill">{jobCards.length} total</span>
        {Object.entries(jobStatusCounts).map(([st,ct]) => <span key={st} className="pill" style={{marginLeft:4}}>{st}: {ct}</span>)}
      </div>
      <div className="agw-card" style={{ padding:0 }}>
        {jobCards.length === 0 ? <Empty icon={ClipboardList} text="No job cards for this customer yet." /> : (
        <table className="agw-table">
          <thead><tr><th>Job card number</th><th>Service</th><th>Priority</th><th>Target date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {jobCards.map(j => (
              <tr key={j.id} style={{ cursor:"pointer" }} onClick={()=>setOpenJobId(j.id)}>
                <td className="mono">{j.id}</td>
                <td style={{maxWidth:200}}>{j.service}</td>
                <td>{j.priority}</td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(j.targetDate)}</td>
                <td><Stamp tone={statusTone(j.status)}>{j.status}</Stamp></td>
                <td><button className="btn btn-sm btn-ghost" onClick={(e)=>{ e.stopPropagation(); setOpenJobId(j.id); }}><FileText size={13}/> View</button></td>
              </tr>
            ))}
          </tbody>
        </table>)}
      </div>

      {openQuote && <QuoteDetailModal quotation={openQuote} state={state} dispatch={dispatch} role={role} userId={userId} customerOptions={customerOptions} templates={state.quotationTemplates} onClose={()=>setOpenQuoteId(null)} />}
      {pdfInvoice && (() => {
        const linkedSo = pdfInvoice.salesOrderId ? state.salesOrders.find(s=>s.id===pdfInvoice.salesOrderId) : null;
        const linkedQuotation = linkedSo?.quotationId ? state.quotations.find(q=>q.id===linkedSo.quotationId) : null;
        return <InvoicePdfModal invoice={pdfInvoice} items={linkedQuotation?.items || []} role={role} onClose={()=>setPdfInvoice(null)} />;
      })()}
      {openJob && <JobDetailModal job={openJob} state={state} dispatch={dispatch} role={role} userId={userId} employees={state.employees} approvalTypes={state.approvalTypes}
        onClose={()=>setOpenJobId(null)} onReassign={()=>setOpenJobId(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* SUBSCRIPTIONS                                                           */
/* ---------------------------------------------------------------------- */

const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 86400000);

function subStatusOf(sub) {
  if (sub.status === "Cancelled") return "Cancelled";
  if (daysBetween(daysFromNow(0), sub.expiryDate) < 0) return "Expired";
  if (daysBetween(daysFromNow(0), sub.expiryDate) <= 30) return "Expiring Soon";
  return "Active";
}
const subStatusTone = (s) => s === "Active" ? "success" : s === "Expiring Soon" ? "warning" : s === "Expired" ? "danger" : "neutral";

// A "transaction" is one Job Card for this customer. Counted automatically from Job Cards
// created since this subscription cycle started (renewal resets the count since startDate moves).
// Cancelled job cards don't consume the allowance.
function subTransactionsUsed(sub, state) {
  return state.jobCards.filter(j => {
    if (j.customer !== sub.customer) return false;
    if (j.status === "Cancelled" || j.status === "Pending Approval") return false;
    // Excludes the plan's own service (e.g. Growth Partner Program) — that job card is what
    // creates or renews the subscription itself, not a client transaction spent under it.
    if (j.service === sub.plan) return false;
    const createdAt = j.statusLog?.[0]?.at || sub.startDate;
    return createdAt >= sub.startDate;
  }).length;
}

function SubscriptionsPage({ state, dispatch, role, userId }) {
  const [tab, setTab] = useState("subscriptions");
  const [newSub, setNewSub] = useState(false);
  const [detailFor, setDetailFor] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [removeSub, setRemoveSub] = useState(null);
  const isAdmin = ADMIN_LIKE.includes(role);

  // Ownership scoping (who sees which subscriptions) is now enforced server-side in
  // GET /subscriptions, same reasoning as everywhere else — state.subscriptions already IS "my
  // visible subscriptions" by the time it reaches here, so no client-side re-filtering.
  const [query, setQuery] = useState("");
  const visibleSubs = state.subscriptions
    .filter(s => [s.customer, s.id, s.plan].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const pg = usePagination(visibleSubs);

  const activeCount = visibleSubs.filter(s => subStatusOf(s) === "Active").length;
  const expiringCount = visibleSubs.filter(s => subStatusOf(s) === "Expiring Soon").length;
  const expiredCount = visibleSubs.filter(s => subStatusOf(s) === "Expired").length;
  const annualValue = visibleSubs.filter(s => s.status !== "Cancelled").reduce((a,s)=>a+s.annualFee,0);

  return (
    <div>
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 18 }}>
        <div className="agw-card"><div className="kpi-label">Active subscriptions</div><div className="kpi-value disp">{activeCount}</div></div>
        <div className="agw-card"><div className="kpi-label">Expiring within 30 days</div><div className="kpi-value disp">{expiringCount}</div></div>
        <div className="agw-card"><div className="kpi-label">Expired</div><div className="kpi-value disp">{expiredCount}</div></div>
        <div className="agw-card"><div className="kpi-label">Annualized value</div><div className="kpi-value disp">{money(annualValue)}</div></div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:10 }}>
        <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
          <button className={`tab ${tab==="subscriptions"?"active":""}`} onClick={()=>setTab("subscriptions")}>Customer Subscriptions</button>
          <button className={`tab ${tab==="catalog"?"active":""}`} onClick={()=>setTab("catalog")}>Plans & Services</button>
        </div>
        {tab === "subscriptions" && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ position:"relative", maxWidth: 260 }}>
              <Search size={15} style={{ position:"absolute", left:12, top:9, color:"var(--ink-soft)" }} />
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search subscriptions"
                style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"7px 12px 7px 34px", fontSize:13, background:"var(--surface)" }} />
            </div>
            <button className="btn btn-sm" onClick={()=>exportCSV("subscriptions.csv",
              ["Subscription ID","Customer","Plan","Tier","Annual Fee","Start","Expiry","Status"],
              visibleSubs.map(s=>[s.id, s.customer, s.plan, s.tier, s.annualFee, s.startDate, s.expiryDate, subStatusOf(s)]))}>
              <Download size={13}/> Export
            </button>
            {role !== "viewer" && <button className="btn btn-primary" onClick={()=>setNewSub(true)}><Plus size={15}/> New subscription</button>}
          </div>
        )}
      </div>

      {tab === "subscriptions" && (
        <div className="agw-card" style={{ padding: 0 }}>
          {visibleSubs.length === 0 ? <Empty icon={Repeat} text="No subscriptions yet — start one from the Growth Partner Program." /> : (
          <table className="agw-table">
            <thead><tr><th>Customer</th><th>Plan</th><th>Tier</th><th>Annual fee</th><th>Start</th><th>Expiry</th><th>Job cards used</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pg.pageRows.map(sub => {
                const tierDef = state.subscriptionPlans[sub.plan]?.tiers.find(t=>t.name===sub.tier);
                const status = subStatusOf(sub);
                const used = subTransactionsUsed(sub, state);
                const over = tierDef && used > tierDef.transactionsIncluded;
                return (
                  <tr key={sub.id} onClick={()=>setDetailFor(sub)}>
                    <td>{sub.customer}<div className="mono" style={{fontSize:11,color:"var(--ink-soft)"}}>{sub.id}</div></td>
                    <td>{sub.plan}</td>
                    <td><span className="pill">{sub.tier}</span></td>
                    <td className="mono">{money(sub.annualFee)}</td>
                    <td className="mono" style={{fontSize:12}}>{fmtDate(sub.startDate)}</td>
                    <td className="mono" style={{fontSize:12}}>{fmtDate(sub.expiryDate)}</td>
                    <td style={{fontSize:12, color: over ? "var(--danger)" : "inherit"}}>{tierDef?.transactionsIncluded != null ? `${used}/${tierDef.transactionsIncluded} job cards${over ? " ⚠" : ""}` : "—"}</td>
                    <td><Stamp tone={subStatusTone(status)}>{status}</Stamp></td>
                    <td><RowActions onEdit={isAdmin ? ()=>{ setEditSub(sub); } : null} onRemove={isAdmin ? ()=>setRemoveSub(sub) : null} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>)}
          <PaginationBar {...pg} />
        </div>
      )}

      {tab === "catalog" && <PlanCatalog state={state} dispatch={dispatch} isAdmin={isAdmin} />}

      {newSub && <NewSubscriptionModal state={state} dispatch={dispatch} onClose={()=>setNewSub(false)} />}
      {detailFor && <SubscriptionDetailModal subscription={detailFor} state={state} dispatch={dispatch} isAdmin={isAdmin} onClose={()=>setDetailFor(null)} />}
      {editSub && <EditSubscriptionModal subscription={editSub} state={state} dispatch={dispatch} onClose={()=>setEditSub(null)} />}
      {removeSub && <ConfirmModal title={`Remove ${removeSub.id}?`} body={`${removeSub.customer} — ${removeSub.plan} (${removeSub.tier}). This can't be undone.`} onConfirm={()=>dispatch({type:"DELETE_SUBSCRIPTION", id:removeSub.id})} onClose={()=>setRemoveSub(null)} />}
    </div>
  );
}

const TIER_FIELD_ROWS = [
  { key:"companySize", label:"Company Size" },
  { key:"transactionsIncluded", label:"Transactions Included", format:(v)=>`${v} only` },
  { key:"hukoomiServices", label:"Hukoomi Services" },
  { key:"trainingSessions", label:"Value Added Services", format:(v,t)=>`Training: ${v} sessions (${money(t.trainingRate||0)}/session) — ${t.trainingTeamMembers||1} team member${(t.trainingTeamMembers||1)>1?"s":""}` },
  { key:"legalAdvising", label:"Legal Advising", format:(v)=> v>0 ? `${v} session` : "—" },
  { key:"dedicatedPro", label:"Dedicated PRO Officer", format:(v)=> v ? "Dedicated PRO" : "—" },
  { key:"translationPages", label:"Translation Service", format:(v)=> v ? `${v} page${v>1?"s":""}` : "—" },
];

function PlanCatalog({ state, dispatch, isAdmin }) {
  const planNames = Object.keys(state.subscriptionPlans);
  const [selected, setSelected] = useState(planNames[0]);
  const [editTier, setEditTier] = useState(null);
  const [form, setForm] = useState(null);
  const [addingService, setAddingService] = useState(false);
  const [removePlan, setRemovePlan] = useState(null);
  const [removeTier, setRemoveTier] = useState(null);
  const [addingTier, setAddingTier] = useState(false);
  const [newTierName, setNewTierName] = useState("");
  const [editingTerms, setEditingTerms] = useState(false);
  const [termsText, setTermsText] = useState("");

  const plan = state.subscriptionPlans[selected];
  if (!plan) return <Empty icon={Repeat} text="No subscription services yet — add one to get started." />;

  const visibleRows = TIER_FIELD_ROWS.filter(row => plan.tiers.some(t => t[row.key] !== undefined && t[row.key] !== "" && t[row.key] !== null));
  const extraLabels = [...new Set(plan.tiers.flatMap(t => (t.extraFeatures||[]).map(f=>f.label)))];

  const startEdit = (t) => { setEditTier(t.name); setForm({...t, extraFeaturesText: (t.extraFeatures||[]).map(f=>`${f.label}: ${f.value}`).join("\n")}); };
  const save = () => {
    const extraFeatures = (form.extraFeaturesText||"").split("\n").map(l=>l.trim()).filter(Boolean).map(line => {
      const idx = line.indexOf(":");
      return idx>=0 ? { label: line.slice(0,idx).trim(), value: line.slice(idx+1).trim() } : { label: line, value: "" };
    });
    const { extraFeaturesText, ...rest } = form;
    dispatch({type:"UPDATE_PLAN_TIER", plan:selected, tierName:editTier, payload:{...rest, extraFeatures}});
    setEditTier(null); setForm(null);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {planNames.map(name => (
            <button key={name} className="btn btn-sm" style={{
                background: selected===name ? "var(--brand)" : "var(--surface)", color: selected===name ? "#fff" : "var(--ink)",
                borderColor: selected===name ? "var(--brand)" : "var(--hair)" }}
              onClick={()=>setSelected(name)}>{name}</button>
          ))}
        </div>
        {isAdmin && <button className="btn btn-sm btn-primary" onClick={()=>setAddingService(true)}><Plus size={13}/> Add service</button>}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 4 }}>
        <p className="modal-sub" style={{ marginBottom: 16, maxWidth: 640 }}>{plan.description}</p>
        {isAdmin && <RowActions onRemove={()=>setRemovePlan(selected)} />}
      </div>

      <div style={{ display:"flex", gap:16, overflowX:"auto", paddingTop: 14, paddingBottom: 6 }}>
        {plan.tiers.map((t, i) => {
          const popular = plan.tiers.length >= 3 && i === 1;
          const rows = [
            ...visibleRows.map(row => ({ label: row.label, value: t[row.key]!==undefined ? (row.format ? row.format(t[row.key], t) : t[row.key]) : null })),
            ...extraLabels.map(label => ({ label, value: (t.extraFeatures||[]).find(f=>f.label===label)?.value || null })),
          ].map(r => ({ ...r, value: r.value === "—" ? null : r.value }));
          return (
            <div key={t.name} style={{
              flex: "1 0 220px", minWidth: 220, maxWidth: 280, position:"relative",
              background: "var(--surface)", borderRadius: 14, padding: "22px 20px",
              border: popular ? "2px solid var(--brand)" : "1px solid var(--hair)",
              boxShadow: popular ? "0 8px 24px rgba(19,145,172,0.14)" : "0 1px 3px rgba(0,0,0,0.04)",
            }}>
              {popular && (
                <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:"var(--brand)", color:"#fff",
                  fontSize:10.5, fontWeight:600, letterSpacing:".03em", padding:"4px 12px", borderRadius:20, whiteSpace:"nowrap" }}>MOST POPULAR</div>
              )}
              <div style={{ textAlign:"center", fontSize:12, fontWeight:600, letterSpacing:".04em", color:"var(--ink-soft)", marginTop: popular ? 6 : 0 }}>{t.name.toUpperCase()}</div>
              <div style={{ textAlign:"center", margin:"10px 0 4px" }}>
                <span className="disp" style={{ fontSize:15, color:"var(--ink-soft)", verticalAlign:"top", marginRight:2 }}>QAR</span>
                <span className="disp" style={{ fontSize:28, fontWeight:700 }}>{t.annualFee.toLocaleString()}</span>
              </div>
              <div style={{ textAlign:"center", fontSize:11.5, color:"var(--ink-soft)", marginBottom:16 }}>per year</div>
              <div style={{ borderTop:"1px solid var(--hair)", paddingTop:14 }}>
                {rows.map(r => (
                  <div key={r.label} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:10, fontSize:12.5 }}>
                    {r.value ? <Check size={14} style={{ color:"var(--success)", flexShrink:0, marginTop:1 }}/> : <span style={{width:14,flexShrink:0,textAlign:"center",color:"var(--hair)"}}>—</span>}
                    <span style={{ color: r.value ? "var(--ink)" : "var(--ink-soft)" }}><strong style={{fontWeight:500}}>{r.label}:</strong> {r.value || "Not included"}</span>
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:14, paddingTop:14, borderTop:"1px solid var(--hair)" }}>
                  <button className="btn btn-sm" onClick={()=>startEdit(t)}>Edit</button>
                  {plan.tiers.length > 1 && <button className="btn btn-sm btn-ghost" style={{color:"var(--danger)"}} onClick={()=>setRemoveTier(t.name)}><Trash2 size={12}/></button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <button className="btn btn-sm" style={{ marginTop: 16 }} onClick={()=>setAddingTier(true)}><Plus size={13}/> Add tier</button>
      )}

      <div className="agw-card" style={{ marginTop: 18 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <strong style={{ fontSize:13 }}>Terms & Conditions</strong>
          {isAdmin && <button className="btn btn-sm btn-ghost" onClick={()=>{ setTermsText(plan.terms.join("\n")); setEditingTerms(true); }}><Pencil size={12}/> Edit</button>}
        </div>
        {plan.terms.length === 0 ? <div className="side-note">No terms added yet.</div> : (
          <ol style={{ margin:"10px 0 0", paddingLeft:18, fontSize:12.5, lineHeight:1.9, color:"var(--ink-soft)" }}>
            {plan.terms.map((t,i) => <li key={i}>{t}</li>)}
          </ol>
        )}
      </div>

      {addingTier && (
        <Modal title="Add tier" sub={selected} onClose={()=>setAddingTier(false)}>
          <div className="field"><label>Tier name</label><input value={newTierName} onChange={e=>setNewTierName(e.target.value)} placeholder="e.g. Platinum" autoFocus /></div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
            <button className="btn" onClick={()=>setAddingTier(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!newTierName.trim()} onClick={()=>{
              dispatch({type:"ADD_PLAN_TIER", plan:selected, tierName:newTierName.trim()});
              setAddingTier(false); setNewTierName("");
            }}>Add tier</button>
          </div>
        </Modal>
      )}

      {editingTerms && (
        <Modal title="Edit Terms & Conditions" sub={selected} onClose={()=>setEditingTerms(false)}>
          <div className="field"><label>One term per line — numbered automatically</label>
            <textarea rows={8} value={termsText} onChange={e=>setTermsText(e.target.value)} placeholder="100% of the fee to be paid in advance..." />
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
            <button className="btn" onClick={()=>setEditingTerms(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={()=>{
              dispatch({type:"UPDATE_SUBSCRIPTION_PLAN_META", plan:selected, payload:{terms: termsText.split("\n").map(t=>t.trim()).filter(Boolean)}});
              setEditingTerms(false);
            }}>Save changes</button>
          </div>
        </Modal>
      )}

      {editTier && form && (
        <Modal title={`Edit ${editTier} tier`} onClose={()=>{setEditTier(null); setForm(null);}} width={560}>
          <div className="row2">
            <div className="field"><label>Annual fee (QAR)</label><input type="number" value={form.annualFee} onChange={e=>setForm({...form,annualFee:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
            <div className="field"><label>Company size (optional)</label><input value={form.companySize||""} onChange={e=>setForm({...form,companySize:e.target.value})} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Transactions included (optional)</label><input type="number" value={form.transactionsIncluded||""} onChange={e=>setForm({...form,transactionsIncluded:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
            <div className="field"><label>Hukoomi services (optional)</label><input value={form.hukoomiServices||""} onChange={e=>setForm({...form,hukoomiServices:e.target.value})} /></div>
          </div>
          <div className="row3">
            <div className="field"><label>Training sessions</label><input type="number" value={form.trainingSessions||""} onChange={e=>setForm({...form,trainingSessions:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
            <div className="field"><label>Rate per session</label><input type="number" value={form.trainingRate||""} onChange={e=>setForm({...form,trainingRate:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
            <div className="field"><label>Team members</label><input type="number" value={form.trainingTeamMembers||""} onChange={e=>setForm({...form,trainingTeamMembers:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
          </div>
          <div className="row3">
            <div className="field"><label>Legal advising sessions</label><input type="number" value={form.legalAdvising||""} onChange={e=>setForm({...form,legalAdvising:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
            <div className="field"><label>Translation pages</label><input type="number" value={form.translationPages||""} onChange={e=>setForm({...form,translationPages:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
            <div className="field"><label>Dedicated PRO officer</label>
              <select value={form.dedicatedPro ? "yes":"no"} onChange={e=>setForm({...form,dedicatedPro:e.target.value==="yes"})}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </div>
          </div>
          <div className="field"><label>Additional features (optional — one per line, "Label: Value")</label>
            <textarea rows={3} value={form.extraFeaturesText} onChange={e=>setForm({...form,extraFeaturesText:e.target.value})} placeholder="Coverage: Office Space Assistance - Consultation" />
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
            <button className="btn" onClick={()=>{setEditTier(null); setForm(null);}}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save changes</button>
          </div>
        </Modal>
      )}

      {addingService && <AddServiceModal dispatch={dispatch} onClose={()=>setAddingService(false)} onCreated={(name)=>setSelected(name)} />}
      {removePlan && <ConfirmModal title={`Remove ${removePlan}?`} body="This deletes the service and all of its tiers. Existing customer subscriptions to it will keep their data but the plan definition will be gone." onConfirm={()=>{ dispatch({type:"DELETE_SUBSCRIPTION_PLAN", name:removePlan}); setSelected(planNames.find(n=>n!==removePlan)); }} onClose={()=>setRemovePlan(null)} />}
      {removeTier && <ConfirmModal title={`Remove ${removeTier} tier?`} body="This can't be undone." onConfirm={()=>dispatch({type:"DELETE_PLAN_TIER", plan:selected, tierName:removeTier})} onClose={()=>setRemoveTier(null)} />}
    </div>
  );
}

function AddServiceModal({ dispatch, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Modal title="Add subscription service" sub="Creates a new service with one starting tier — edit it afterward to fill in pricing and features." onClose={onClose}>
      <div className="field"><label>Service name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Office Space Assistance" autoFocus /></div>
      <div className="field"><label>Description</label><textarea rows={2} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What this service covers, and how it renews..." /></div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={()=>{
          dispatch({type:"ADD_SUBSCRIPTION_PLAN", name:name.trim(), description});
          onClose();
          if (onCreated) onCreated(name.trim());
        }}>Create service</button>
      </div>
    </Modal>
  );
}

function NewSubscriptionModal({ state, dispatch, onClose }) {
  const planNames = Object.keys(state.subscriptionPlans);
  const [planName, setPlanName] = useState(planNames[0]);
  const plan = state.subscriptionPlans[planName];
  const [customer, setCustomer] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [tierName, setTierName] = useState(plan.tiers[0]?.name || "");
  const [startDate, setStartDate] = useState(daysFromNow(0));
  const [alsoInvoice, setAlsoInvoice] = useState(true);
  const tier = plan.tiers.find(t => t.name === tierName) || plan.tiers[0];
  const expiryDate = new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear()+1)).toISOString().slice(0,10);

  const switchPlan = (name) => { setPlanName(name); setTierName(state.subscriptionPlans[name].tiers[0]?.name || ""); };

  return (
    <Modal title="New subscription" sub="Pick a service and tier — renews yearly." onClose={onClose} width={560}>
      <div className="field">
        <label>Customer</label>
        <div style={{ display:"flex", gap:6 }}>
          <input list="sub-customer-options" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Type or pick a customer" style={{ flex:1 }} />
          <button type="button" className="btn btn-sm" onClick={()=>setShowNewCustomer(true)} title="Create new customer"><Plus size={13}/></button>
        </div>
        <datalist id="sub-customer-options">{state.customers.map(c=><option key={c.id} value={c.name} />)}</datalist>
      </div>
      {showNewCustomer && <NewCustomerModal dispatch={dispatch} onClose={()=>setShowNewCustomer(false)} onCreated={(name)=>setCustomer(name)} />}

      <div className="row2">
        <div className="field"><label>Service</label>
          <select value={planName} onChange={e=>switchPlan(e.target.value)}>
            {planNames.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="field"><label>Tier</label>
          <select value={tierName} onChange={e=>setTierName(e.target.value)}>
            {plan.tiers.map(t=><option key={t.name} value={t.name}>{t.name} — {money(t.annualFee)}/year</option>)}
          </select>
        </div>
      </div>

      {tier && (
        <div className="agw-card" style={{ fontSize:12.5, lineHeight:1.8 }}>
          {tier.companySize && <div><strong>{tier.companySize}</strong></div>}
          {tier.transactionsIncluded !== undefined && <div>{tier.transactionsIncluded} transactions included{tier.hukoomiServices ? ` · ${tier.hukoomiServices}` : ""}</div>}
          {(tier.trainingSessions !== undefined || tier.translationPages !== undefined) && (
            <div>{tier.trainingSessions !== undefined && `Training: ${tier.trainingSessions} sessions (${tier.trainingTeamMembers||1} team member${(tier.trainingTeamMembers||1)>1?"s":""})`}{tier.translationPages !== undefined && ` · Translation: ${tier.translationPages} pages`}</div>
          )}
          {(tier.legalAdvising !== undefined || tier.dedicatedPro !== undefined) && (
            <div>{tier.legalAdvising !== undefined && `Legal advising: ${tier.legalAdvising>0 ? `${tier.legalAdvising} session`:"—"}`}{tier.dedicatedPro !== undefined && ` · ${tier.dedicatedPro ? "Dedicated PRO officer" : "No dedicated PRO officer"}`}</div>
          )}
          {(tier.extraFeatures||[]).map((f,i) => <div key={i}>{f.label}: {f.value}</div>)}
        </div>
      )}

      <div className="row2">
        <div className="field"><label>Start date</label><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} /></div>
        <div className="field"><label>Expiry (12 months)</label><input type="date" value={expiryDate} disabled style={{background:"var(--page)"}} /></div>
      </div>

      <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, marginTop:4 }}>
        <input type="checkbox" checked={alsoInvoice} onChange={e=>setAlsoInvoice(e.target.checked)} />
        Also raise an invoice for the annual fee ({money(tier?.annualFee||0)})
      </label>

      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!customer.trim() || !tier} onClick={()=>{
          dispatch({ type:"ADD_SUBSCRIPTION", alsoInvoice, payload:{
            customer: customer.trim(), plan: planName, tier: tierName, annualFee: tier.annualFee,
            startDate, expiryDate,
          }});
          onClose();
        }}>Create subscription</button>
      </div>
    </Modal>
  );
}

function EditSubscriptionModal({ subscription: sub, state, dispatch, onClose }) {
  const plan = state.subscriptionPlans[sub.plan];
  const [form, setForm] = useState({ tier: sub.tier, startDate: sub.startDate, expiryDate: sub.expiryDate, status: sub.status });
  return (
    <Modal title={`Edit ${sub.id}`} sub={sub.customer} onClose={onClose}>
      <div className="field"><label>Tier</label>
        <select value={form.tier} onChange={e=>setForm({...form,tier:e.target.value})}>
          {plan.tiers.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </div>
      <div className="row2">
        <div className="field"><label>Start date</label><input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})} /></div>
        <div className="field"><label>Expiry date</label><input type="date" value={form.expiryDate} onChange={e=>setForm({...form,expiryDate:e.target.value})} /></div>
      </div>
      <div className="field"><label>Status</label>
        <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
          {["Active","Cancelled"].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>{
          const tierDef = plan.tiers.find(t=>t.name===form.tier);
          dispatch({type:"UPDATE_SUBSCRIPTION", id:sub.id, payload:{...form, annualFee: tierDef.annualFee}});
          onClose();
        }}>Save changes</button>
      </div>
    </Modal>
  );
}

function SubscriptionDetailModal({ subscription: sub, state, dispatch, isAdmin, onClose }) {
  const tier = state.subscriptionPlans[sub.plan]?.tiers.find(t=>t.name===sub.tier);
  const status = subStatusOf(sub);
  const [renewing, setRenewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const txUsed = subTransactionsUsed(sub, state);
  const txOver = tier && txUsed > tier.transactionsIncluded;
  // Same exclusion as subTransactionsUsed — kept in sync since this list's length is what the
  // "N job cards linked" caption below reports right next to that same meter.
  const linkedJobs = state.jobCards.filter(j => j.customer === sub.customer && j.status !== "Cancelled" && j.service !== sub.plan && (j.statusLog?.[0]?.at || sub.startDate) >= sub.startDate);
  // Office Space Assistance (and any future plan without transaction/training/etc. allowances)
  // has no meaningful "usage" to meter — its tier row is all nulls apart from the fee. Showing
  // the Job Card meter there just reads as a permanently-stuck "0/—" with no real signal.
  const hasUsageMeters = tier && tier.transactionsIncluded != null;

  const customer = state.customers.find(c => c.name === sub.customer);
  const daysToRenewal = daysBetween(daysFromNow(0), sub.expiryDate);
  const kycDocs = customer?.docs || [];
  // Both open the reviewer's own email/WhatsApp app with the message pre-filled, mirroring the
  // wa.me pattern already used elsewhere in the app (Data Manager outreach) — there's no ad-hoc
  // customer email/SMS pipeline through the backend, so this is sent by the staff member directly
  // rather than silently claiming to send on their behalf.
  const renewalMessage = `Hi ${customer?.contact || sub.customer}, this is a reminder that your ${sub.plan} (${sub.tier}) subscription with Address Gateway renews on ${fmtDate(sub.expiryDate)}. Let us know if you'd like help with the renewal.`;
  const sendEmail = () => {
    if (!customer?.email) { alert("No email on file for this customer — add one on their profile first."); return; }
    window.open(`mailto:${customer.email}?subject=${encodeURIComponent(`${sub.plan} renewal — ${sub.customer}`)}&body=${encodeURIComponent(renewalMessage)}`, "_blank");
  };
  const sendWhatsapp = () => {
    const mobile = customer?.contactMobile || customer?.phone;
    if (!mobile) { alert("No mobile number on file for this customer — add one on their profile first."); return; }
    window.open(`https://wa.me/${normPhone(mobile)}?text=${encodeURIComponent(renewalMessage)}`, "_blank");
  };

  const meter = (label, used, included, danger) => {
    const pct = included > 0 ? Math.min(100, Math.round((used/included)*100)) : 0;
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12.5, marginBottom:4 }}>
          <span>{label}</span><span className="mono" style={{ color: danger ? "var(--danger)" : "inherit" }}>{used}/{included}{danger && ` (+${used-included} over)`}</span>
        </div>
        <div style={{ height:6, background:"var(--page)", borderRadius:4, overflow:"hidden" }}>
          <div style={{ width:`${pct}%`, height:"100%", background: danger || pct>=100 ? "var(--danger)" : "var(--brand)" }} />
        </div>
      </div>
    );
  };

  return (
    <Modal title={sub.id} sub={`${sub.customer} — ${sub.plan}, ${sub.tier}`} onClose={onClose} width={560}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <span className="mono" style={{fontSize:12,color:"var(--ink-soft)"}}>{fmtDate(sub.startDate)} – {fmtDate(sub.expiryDate)}</span>
        <Stamp tone={subStatusTone(status)}>{status}</Stamp>
      </div>

      {hasUsageMeters && (
        <div className="agw-card" style={{ marginBottom: 16 }}>
          <strong style={{ fontSize:13, display:"block", marginBottom:10 }}>Usage this cycle</strong>
          {meter("Transactions (Job Cards)", txUsed, tier.transactionsIncluded, txOver)}
          <div style={{ fontSize:11, color:"var(--ink-soft)", marginTop:-6, marginBottom:12 }}>Counted automatically — one Job Card created for this customer since {fmtDate(sub.startDate)} = one transaction. {linkedJobs.length} job card{linkedJobs.length!==1?"s":""} linked.</div>
          {tier.trainingSessions != null && meter("Training sessions", sub.trainingSessionsUsed, tier.trainingSessions)}
          {tier.legalAdvising > 0 && meter("Legal advising", sub.legalAdvisingUsed, tier.legalAdvising)}
          {tier.translationPages != null && meter("Translation pages", sub.translationPagesUsed, tier.translationPages)}
        </div>
      )}
      {txOver && (
        <div className="side-note" style={{ marginTop:-8, marginBottom:16 }}>
          <AlertTriangle size={13} style={{verticalAlign:-2, marginRight:4}}/>Over the included transaction limit — extra job cards are billed separately at the standard rate per the package Terms & Conditions.
        </div>
      )}

      <div className="agw-card" style={{ marginBottom: 16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <strong style={{ fontSize:13 }}>Company KYC & renewal</strong>
          <span style={{ fontSize:11.5, color: daysToRenewal <= 30 ? "var(--danger)" : "var(--ink-soft)" }}>
            Next renewal: <strong className="mono">{fmtDate(sub.expiryDate)}</strong>{daysToRenewal >= 0 ? ` (${daysToRenewal}d)` : " (overdue)"}
          </span>
        </div>
        {kycDocs.length === 0 ? (
          <div style={{ fontSize:12.5, color:"var(--ink-soft)" }}>No KYC documents on file for {sub.customer} yet.</div>
        ) : (
          kycDocs.map(d => {
            const st = docState(d.expiry);
            return (
              <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid var(--hair)", fontSize:12.5 }}>
                <span>{d.type}</span>
                <Stamp tone={st.cls.replace("stamp-","")}>{st.label}</Stamp>
              </div>
            );
          })
        )}
        <div style={{ display:"flex", gap:8, marginTop: 12 }}>
          <button className="btn btn-sm" onClick={sendEmail}><Mail size={13}/> Send email</button>
          <button className="btn btn-sm" onClick={sendWhatsapp}><MessageCircle size={13}/> Send WhatsApp</button>
        </div>
      </div>

      {isAdmin && hasUsageMeters && (
        <div className="agw-card" style={{ marginBottom: 16 }}>
          <strong style={{ fontSize:13, display:"block", marginBottom:8 }}>Log usage</strong>
          <p className="modal-sub" style={{ marginTop:0, marginBottom:8 }}>Transactions are tracked automatically from Job Cards — only these still need manual logging.</p>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {tier.trainingSessions != null && <button className="btn btn-sm" onClick={()=>dispatch({type:"LOG_SUBSCRIPTION_USAGE", id:sub.id, field:"trainingSessionsUsed", amount:1})}>+1 training session</button>}
            {tier.legalAdvising > 0 && <button className="btn btn-sm" onClick={()=>dispatch({type:"LOG_SUBSCRIPTION_USAGE", id:sub.id, field:"legalAdvisingUsed", amount:1})}>+1 legal advising</button>}
            {tier.translationPages != null && <button className="btn btn-sm" onClick={()=>dispatch({type:"LOG_SUBSCRIPTION_USAGE", id:sub.id, field:"translationPagesUsed", amount:1})}>+1 translation page</button>}
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {/* Available even when Cancelled — its Status field is the only way to fix a wrong date
              or reactivate a mistakenly-cancelled subscription; Renew/Cancel below don't apply
              to an already-cancelled one, so those stay conditional. */}
          <button className="btn" onClick={()=>setEditing(true)}><Pencil size={13}/> Edit dates & tier</button>
          {status !== "Cancelled" && <button className="btn btn-primary" onClick={()=>setRenewing(true)}><Repeat size={13}/> Renew for 12 months</button>}
          {status !== "Cancelled" && <button className="btn" style={{color:"var(--danger)"}} onClick={async ()=>{
            if (await confirm({ title:"Cancel this subscription?", body:`${sub.customer} — ${sub.plan} (${sub.tier}). This stops future renewals; it can't be undone from here.`, confirmLabel:"Cancel subscription" })) {
              dispatch({type:"UPDATE_SUBSCRIPTION", id:sub.id, payload:{status:"Cancelled"}}); onClose();
            }
          }}>Cancel subscription</button>}
        </div>
      )}

      {renewing && <RenewSubscriptionModal subscription={sub} dispatch={dispatch} onClose={()=>{setRenewing(false); onClose();}} />}
      {editing && <EditSubscriptionModal subscription={sub} state={state} dispatch={dispatch} onClose={()=>setEditing(false)} />}
    </Modal>
  );
}

function RenewSubscriptionModal({ subscription: sub, dispatch, onClose }) {
  const [startDate, setStartDate] = useState(daysFromNow(0));
  const [alsoInvoice, setAlsoInvoice] = useState(true);
  const expiryDate = new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear()+1)).toISOString().slice(0,10);
  return (
    <Modal title={`Renew ${sub.id}`} sub={`${sub.customer} — ${sub.tier}, resets usage counters`} onClose={onClose}>
      <div className="row2">
        <div className="field"><label>New start date</label><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} /></div>
        <div className="field"><label>New expiry</label><input type="date" value={expiryDate} disabled style={{background:"var(--page)"}} /></div>
      </div>
      <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13 }}>
        <input type="checkbox" checked={alsoInvoice} onChange={e=>setAlsoInvoice(e.target.checked)} />
        Also raise an invoice for the renewal fee ({money(sub.annualFee)})
      </label>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>{ dispatch({type:"RENEW_SUBSCRIPTION", id:sub.id, startDate, expiryDate, alsoInvoice}); onClose(); }}>Confirm renewal</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* SALES ORDERS                                                            */
/* ---------------------------------------------------------------------- */

function OrdersPage({ state, dispatch, role, highlightId, onHighlightHandled, setPage, onInvoiceCreated }) {
  // This backend onboards a sales order in one atomic step (creates the invoice AND the first
  // job card together — see /api/sales-orders/:id/onboard) rather than the prototype's separate
  // "Confirmed -> Invoiced -> Client Onboarded" stages, and sales_orders itself has no status
  // column. Whether one's already been onboarded is derived from whether an invoice referencing
  // it exists.
  const isOnboarded = (soId) => state.invoices.some(inv => inv.salesOrderId === soId);
  const isAdmin = ADMIN_LIKE.includes(role);
  const canOnboard = isAccountsOrAdmin(role);
  const [removeSo, setRemoveSo] = useState(null);
  const [pdfSo, setPdfSo] = useState(null);
  const [query, setQuery] = useState("");
  const [onboardingId, setOnboardingId] = useState(null);
  const rows = state.salesOrders.filter(so => [so.customer, so.id, so.service].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const pg = usePagination(rows);
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`so-row-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, rows.length]);
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom: 14, gap:8 }}>
        <div style={{ position:"relative", maxWidth: 260, flex:1 }}>
          <Search size={15} style={{ position:"absolute", left:12, top:9, color:"var(--ink-soft)" }} />
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search sales orders"
            style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"7px 12px 7px 34px", fontSize:13, background:"var(--surface)" }} />
        </div>
        <button className="btn btn-sm" onClick={()=>exportCSV("sales-orders.csv",
          ["Order ID","Created","Customer","Service","Fee Type","Amount (QAR)","Status"],
          rows.map(so=>[so.id, so.createdAt, so.customer, so.service, so.feeType||"Professional Fee", so.amount, isOnboarded(so.id)?"Onboarded":"Pending onboarding"]))}>
          <Download size={13}/> Export
        </button>
      </div>
      <div className="agw-card" style={{ padding: 0 }}>
      {rows.length === 0 ? <Empty icon={ShoppingCart} text="No sales orders yet — approve a quotation to create one." /> : (
      <table className="agw-table">
        <thead><tr><th>Order</th><th>Created</th><th>Customer</th><th>Service</th><th>Fee type</th><th>Amount (QAR)</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {pg.pageRows.map(so => {
            const onboarded = isOnboarded(so.id);
            const isHighlighted = highlightId === so.id;
            return (
            <tr key={so.id} id={`so-row-${so.id}`}
              style={isHighlighted ? { background:"var(--gold-tint)", boxShadow:"inset 3px 0 0 var(--gold)" } : undefined}
              onClick={isHighlighted ? () => onHighlightHandled?.() : undefined}>
              <td className="mono">{so.id}</td>
              <td className="mono" style={{fontSize:12}}>{fmtDate(so.createdAt)}</td>
              <td>{so.customer}</td>
              <td style={{maxWidth:200}}>{so.service}{so.packageTier && <span className="pill" style={{ marginLeft:6, background:"var(--gold-tint)", color:"var(--gold-dark)", fontSize:10 }}>{so.packageTier}</span>}</td>
              <td><Stamp tone={so.feeType==="Government Fee" ? "neutral" : "success"}>{so.feeType || "Professional Fee"}</Stamp></td>
              <td className="mono">{money(so.amount)}</td>
              <td><Stamp tone={onboarded ? "success" : "warning"}>{onboarded ? "Onboarded" : "Pending onboarding"}</Stamp></td>
              <td style={{ display:"flex", gap:6, alignItems:"center" }}>
                {!onboarded && canOnboard && <button className="btn btn-sm btn-primary" disabled={onboardingId===so.id} onClick={async ()=>{
                  setOnboardingId(so.id);
                  try {
                    const r = await dispatch({type:"ONBOARD_CLIENT", salesOrderId:so.id});
                    if (r?.invoiceId) { onInvoiceCreated?.(r.invoiceId); setPage?.("invoices"); }
                  } finally {
                    setOnboardingId(null);
                  }
                }}>{onboardingId===so.id ? "Onboarding…" : "Onboard client → create invoice & job"}</button>}
                {!onboarded && !canOnboard && <span className="pill">Awaiting Accounts</span>}
                {onboarded && <span className="pill"><BadgeCheck size={12} style={{verticalAlign:-2}}/> Invoice & job card created</span>}
                <button className="btn btn-sm btn-ghost" onClick={()=>setPdfSo(so)}><FileText size={13}/> PDF</button>
                {isAdmin && <RowActions onRemove={()=>setRemoveSo(so)} />}
              </td>
            </tr>
          );})}
        </tbody>
      </table>)}
      <PaginationBar {...pg} />
      {removeSo && <ConfirmModal title={`Remove sales order ${removeSo.id}?`} body={`${removeSo.customer} — ${money(removeSo.amount)}. Any invoice or job card already created from it is kept, just unlinked. This can't be undone.`}
        onConfirm={()=>{ dispatch({type:"DELETE_SALES_ORDER", id:removeSo.id}); setRemoveSo(null); }} onClose={()=>setRemoveSo(null)} />}
      {pdfSo && <SalesOrderPdfModal salesOrder={pdfSo} onboarded={isOnboarded(pdfSo.id)} items={state.quotations.find(q=>q.id===pdfSo.quotationId)?.items || []} role={role} onClose={()=>setPdfSo(null)} />}
      </div>
    </div>
  );
}

// Diagonal, low-opacity stamp overlaid on the on-screen Sales Order / Invoice previews for anyone
// who isn't Accounts/Admin — mirrors the same watermark PDFKit draws into the actual downloadable
// PDF for those roles (see drawWatermark in src/utils/pdfCommon.js), so the on-screen "view" and
// the real file (if ever fetched directly) always agree.
function PdfWatermarkOverlay() {
  return (
    <div style={{
      position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
      pointerEvents:"none", overflow:"hidden", zIndex:1,
    }}>
      <span style={{
        transform:"rotate(-35deg)", fontSize:44, fontWeight:700, letterSpacing:"0.04em",
        color:"#C0392B", opacity:0.15, whiteSpace:"nowrap",
      }}>INTERNAL USE ONLY</span>
    </div>
  );
}

function SalesOrderPdfModal({ salesOrder: so, onboarded, items=[], role, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const canDownload = isAccountsOrAdmin(role);
  const profFee = Number(so.professionalFeeAmount ?? so.amount);
  const govFee = Math.max(0, so.amount - profFee);
  const isMixed = govFee > 0.005 && profFee > 0.005;
  const feeTypeLabel = isMixed ? "Professional + Government Fee" : (so.feeType || "Professional Fee");

  return (
    <Modal title={`Sales Order — ${so.id}`} sub={so.customer} onClose={onClose} width={720}>
      <div className="doc-paper" style={{ position:"relative" }}>
        {!canDownload && <PdfWatermarkOverlay />}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
          <div>
            <div className="disp" style={{ fontSize:28, fontWeight:500, letterSpacing:"-.01em" }}>SALES ORDER</div>
            <div className="mono" style={{ fontSize:12, color:"var(--ink-soft)", marginTop:4 }}>Order# {so.id}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ display:"inline-block", textAlign:"right" }}><BrandLogo scale={1} /></div>
            <div style={{ fontSize:11.5, color:"var(--ink-soft)", marginTop:8, lineHeight:1.6 }}>
              Address Gateway Building<br/>D Ring Road, Doha, Qatar<br/>Call: 44434912, Email : startup@addressgateway.com<br/>www.addressgateway.com
            </div>
          </div>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:12, color:"var(--ink-soft)" }}>Order Date :</div>
            <div style={{ fontSize:13, marginTop:2 }}>{fmtDate(so.createdAt)}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12, color:"var(--ink-soft)" }}>Bill To</div>
            <div style={{ fontSize:13.5, fontWeight:500, marginTop:2 }}>{so.customer}</div>
          </div>
        </div>
        {so.quotationId && <div style={{ fontSize:12.5, marginBottom:8 }}><span style={{color:"var(--ink-soft)"}}>Quotation Ref :</span> {so.quotationId}</div>}
        <div style={{ fontSize:12.5, marginBottom:8 }}><span style={{color:"var(--ink-soft)"}}>Service :</span> {so.service || "-"}</div>
        <div style={{ fontSize:12.5, marginBottom:20 }}><span style={{color:"var(--ink-soft)"}}>Fee Type :</span> {feeTypeLabel}</div>

        {items.length > 0 && (
          <table className="agw-table" style={{ marginBottom: 12 }}>
            <thead><tr><th>Category</th><th>Item & description</th><th>Qty</th><th>Rate</th><th>Disc.</th><th>Amount</th></tr></thead>
            <tbody>
              {items.map((it,i)=>(
                <tr key={i}>
                  <td style={{fontSize:11.5, color:"var(--ink-soft)"}}>{it.category || "—"}</td>
                  <td>{it.description || it.service}{it.note && <div style={{fontSize:11, color:"var(--ink-soft)"}}>{it.note}</div>}</td>
                  <td>{it.qty}</td><td className="mono">{money(it.price)}</td>
                  <td>{it.discountPct||0}%</td><td className="mono">{money(it.qty*it.price*(1-(it.discountPct||0)/100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
          <table style={{ fontSize:13 }}>
            <tbody>
              {isMixed && <>
                <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Professional Fee Amount</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{money(profFee)}</td></tr>
                <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Government Fee Amount</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{money(govFee)}</td></tr>
              </>}
              {(so.orderDiscount||0) > 0 && <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Order Discount</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>(-) {money(so.orderDiscount)}</td></tr>}
              <tr style={{ background:"var(--page)" }}><td style={{ padding:"7px 16px 7px 0", fontWeight:600 }}>Total Amount</td><td className="mono" style={{ padding:"7px 0", textAlign:"right", fontWeight:600 }}>{money(so.amount)}</td></tr>
            </tbody>
          </table>
        </div>
        {isMixed && <div style={{ fontSize:10.5, color:"var(--ink-soft)", marginBottom:16 }}>The Government Fee portion is a pass-through charge — excluded from Address Gateway's business volume and incentive calculations.</div>}
        <div style={{ borderTop:"1px solid var(--hair)", paddingTop:10, fontSize:12.5 }}>
          <span style={{color:"var(--ink-soft)"}}>Status :</span> {onboarded ? "Onboarded" : "Pending onboarding"}
        </div>
      </div>
      {canDownload ? (
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 14 }}>
          <button className="btn btn-sm" disabled={downloading} onClick={async ()=>{
            setDownloading(true);
            try {
              const blob = await api.salesOrders.downloadPdf(so.id);
              downloadBlob(`SalesOrder-${so.id}.pdf`, blob);
            } finally {
              setDownloading(false);
            }
          }}><Download size={13}/> {downloading ? "Generating…" : "Download PDF"}</button>
        </div>
      ) : (
        <div className="side-note" style={{marginTop:14}}>Internal viewing only — this document isn't available for download on your account.</div>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* INVOICES                                                                */
/* ---------------------------------------------------------------------- */

function InvoicesPage({ state, dispatch, role, highlightId, onHighlightHandled, setPage, onJobCardTarget }) {
  const [pay, setPay] = useState(null);
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("Bank Transfer");
  const [paidAt, setPaidAt] = useState(daysFromNow(0));
  const [payBusy, setPayBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [emailFor, setEmailFor] = useState(null);
  const [removeInvoice, setRemoveInvoice] = useState(null);
  const [pdfInvoice, setPdfInvoice] = useState(null);
  const isAdmin = ADMIN_LIKE.includes(role);
  const canRecordPayment = isAccountsOrAdmin(role);
  const [query, setQuery] = useState("");
  const rows = state.invoices.filter(inv => [inv.customer, inv.id].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const pg = usePagination(rows);
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`inv-row-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, rows.length]);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom: 14, gap:8 }}>
        <div style={{ position:"relative", maxWidth: 260, flex:1 }}>
          <Search size={15} style={{ position:"absolute", left:12, top:9, color:"var(--ink-soft)" }} />
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search invoices"
            style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"7px 12px 7px 34px", fontSize:13, background:"var(--surface)" }} />
        </div>
        <button className="btn btn-sm" onClick={()=>exportCSV("invoices.csv",
          ["Invoice ID","Created","Customer","Fee Type","Amount","Paid","Balance","Due","Status"],
          rows.map(inv=>{ const paid = inv.payments.reduce((a,p)=>a+p.amount,0); return [inv.id, inv.createdAt, inv.customer, inv.feeType||"Professional Fee", inv.amount, paid, Math.max(0, inv.professionalFeeAmount-paid), inv.dueDate, inv.status]; }))}>
          <Download size={13}/> Export
        </button>
      </div>
      <div className="agw-card" style={{ padding: 0 }}>
        {rows.length === 0 ? <Empty icon={Receipt} text="No invoices yet." /> : (
        <table className="agw-table">
          <thead><tr><th>Invoice</th><th>Created</th><th>Customer</th><th>Fee type</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {pg.pageRows.map(inv => {
              const paid = inv.payments.reduce((a,p)=>a+p.amount,0);
              const balance = Math.max(0, inv.professionalFeeAmount - paid);
              const isHighlighted = highlightId === inv.id;
              return (
                <tr key={inv.id} id={`inv-row-${inv.id}`}
                  style={isHighlighted ? { background:"var(--gold-tint)", boxShadow:"inset 3px 0 0 var(--gold)" } : undefined}
                  onClick={isHighlighted ? () => onHighlightHandled?.() : undefined}>
                  <td className="mono">{inv.id}</td>
                  <td className="mono" style={{fontSize:12}}>{fmtDate(inv.createdAt)}</td>
                  <td>{inv.customer}</td>
                  <td><Stamp tone={inv.feeType==="Government Fee" ? "neutral" : "success"}>{inv.feeType || "Professional Fee"}</Stamp></td>
                  <td className="mono">{money(inv.amount)}</td>
                  <td className="mono">{money(paid)}</td>
                  <td className="mono" style={{ color: balance>0 ? "var(--danger)" : "var(--success)" }}>{money(balance)}</td>
                  <td className="mono" style={{fontSize:12}}>{fmtDate(inv.dueDate)}</td>
                  <td><Stamp tone={statusTone(inv.status)}>{inv.status}</Stamp></td>
                  <td style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {balance > 0 && canRecordPayment && <button className="btn btn-sm" onClick={()=>{ setPay(inv); setAmount(balance); setPaidAt(daysFromNow(0)); }}>Record payment</button>}
                    {inv.payments.length > 0 && <button className="btn btn-sm btn-ghost" onClick={()=>setHistory(inv)}>Payments</button>}
                    <button className="btn btn-sm btn-ghost" onClick={()=>setEmailFor(inv)}>
                      {inv.emailedToClient ? <><BadgeCheck size={13}/> Emailed</> : <><Mail size={13}/> Email</>}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={()=>setPdfInvoice(inv)}><FileText size={13}/> PDF</button>
                    {isAdmin && <RowActions onRemove={()=>setRemoveInvoice(inv)} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>)}
        <PaginationBar {...pg} />
      </div>

      {removeInvoice && <ConfirmModal title={`Remove invoice ${removeInvoice.id}?`} body={`${removeInvoice.customer} — ${money(removeInvoice.amount)}. Any recorded payments are removed with it. This can't be undone.`}
        onConfirm={()=>{ dispatch({type:"DELETE_INVOICE", id:removeInvoice.id}); setRemoveInvoice(null); }} onClose={()=>setRemoveInvoice(null)} />}

      {history && <PaymentHistoryModal invoice={history} dispatch={dispatch} onClose={()=>setHistory(null)} />}
      {emailFor && (
        <EmailCustomerModal
          customerName={emailFor.customer} customerEmail={state.customers.find(c=>c.name===emailFor.customer)?.email} employees={state.employees}
          defaultSubject={`Invoice ${emailFor.id} — Address Gateway`}
          defaultBody={`Dear ${emailFor.customer},\n\nPlease find attached invoice ${emailFor.id} for ${money(emailFor.amount)}, due ${fmtDate(emailFor.dueDate)}.\n\nBalance due: ${money(Math.max(0, emailFor.amount - emailFor.payments.reduce((a,p)=>a+p.amount,0)))}.\n\nKind regards,\nAddress Gateway Business Services`}
          dispatch={dispatch} onClose={()=>setEmailFor(null)}
          onSend={({ccNames})=>dispatch({type:"MARK_EMAILED", entity:"invoice", id:emailFor.id, customer:emailFor.customer, cc:ccNames})}
        />
      )}

      {pay && (
        <Modal title={`Record payment — ${pay.id}`} sub={pay.customer} onClose={()=>setPay(null)}>
          <div className="row2">
            <div className="field"><label>Amount (QAR)</label><input type="number" value={amount} onChange={e=>setAmount((e.target.value === "" ? "" : Number(e.target.value)))} /></div>
            <div className="field"><label>Mode</label>
              <select value={mode} onChange={e=>setMode(e.target.value)}>
                {["Bank Transfer","Cash","Cheque","Card"].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Payment date</label><input type="date" max={daysFromNow(0)} value={paidAt} onChange={e=>setPaidAt(e.target.value)} /></div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
            <button className="btn" onClick={()=>setPay(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!paidAt || payBusy} onClick={async ()=>{
              setPayBusy(true);
              try {
                await dispatch({type:"RECORD_PAYMENT", invoiceId:pay.id, amount, mode, paidAt, by:"Accounts"});
                const jc = pay.salesOrderId ? state.jobCards.find(j=>j.salesOrderId===pay.salesOrderId) : null;
                setPay(null);
                if (jc) { onJobCardTarget?.(jc.id); setPage?.("jobs"); }
              } finally {
                setPayBusy(false);
              }
            }}>{payBusy ? "Recording…" : "Record payment"}</button>
          </div>
        </Modal>
      )}
      {pdfInvoice && (() => {
        const linkedSo = pdfInvoice.salesOrderId ? state.salesOrders.find(s=>s.id===pdfInvoice.salesOrderId) : null;
        const linkedQuotation = linkedSo?.quotationId ? state.quotations.find(q=>q.id===linkedSo.quotationId) : null;
        return <InvoicePdfModal invoice={pdfInvoice} items={linkedQuotation?.items || []} role={role} onClose={()=>setPdfInvoice(null)} />;
      })()}
    </div>
  );
}

function InvoicePdfModal({ invoice: inv, items=[], role, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const canDownload = isAccountsOrAdmin(role);
  const profFee = Number(inv.professionalFeeAmount ?? inv.amount);
  const govFee = Math.max(0, inv.amount - profFee);
  const isMixed = govFee > 0.005 && profFee > 0.005;
  const feeTypeLabel = isMixed ? "Professional + Government Fee" : (inv.feeType || "Professional Fee");
  const paid = inv.payments.reduce((a,p)=>a+p.amount,0);
  const balance = Math.max(0, inv.amount - paid);

  return (
    <Modal title={`Invoice — ${inv.id}`} sub={inv.customer} onClose={onClose} width={720}>
      <div className="doc-paper" style={{ position:"relative" }}>
        {!canDownload && <PdfWatermarkOverlay />}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
          <div>
            <div className="disp" style={{ fontSize:28, fontWeight:500, letterSpacing:"-.01em" }}>INVOICE</div>
            <div className="mono" style={{ fontSize:12, color:"var(--ink-soft)", marginTop:4 }}>Invoice# {inv.id}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ display:"inline-block", textAlign:"right" }}><BrandLogo scale={1} /></div>
            <div style={{ fontSize:11.5, color:"var(--ink-soft)", marginTop:8, lineHeight:1.6 }}>
              Address Gateway Building<br/>D Ring Road, Doha, Qatar<br/>Call: 44434912, Email : startup@addressgateway.com<br/>www.addressgateway.com
            </div>
          </div>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:12, color:"var(--ink-soft)" }}>Invoice Date :</div>
            <div style={{ fontSize:13, marginTop:2 }}>{fmtDate(inv.createdAt)}</div>
            <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:8 }}>Due Date :</div>
            <div style={{ fontSize:13, marginTop:2 }}>{fmtDate(inv.dueDate)}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12, color:"var(--ink-soft)" }}>Bill To</div>
            <div style={{ fontSize:13.5, fontWeight:500, marginTop:2 }}>{inv.customer}</div>
          </div>
        </div>
        {inv.salesOrderId && <div style={{ fontSize:12.5, marginBottom:8 }}><span style={{color:"var(--ink-soft)"}}>Sales Order Ref :</span> {inv.salesOrderId}</div>}
        {inv.subscriptionId && <div style={{ fontSize:12.5, marginBottom:8 }}><span style={{color:"var(--ink-soft)"}}>Subscription Ref :</span> {inv.subscriptionId}</div>}
        <div style={{ fontSize:12.5, marginBottom:20 }}><span style={{color:"var(--ink-soft)"}}>Fee Type :</span> {feeTypeLabel}</div>

        {items.length > 0 && (
          <table className="agw-table" style={{ marginBottom: 12 }}>
            <thead><tr><th>Category</th><th>Item & description</th><th>Qty</th><th>Rate</th><th>Disc.</th><th>Amount</th></tr></thead>
            <tbody>
              {items.map((it,i)=>(
                <tr key={i}>
                  <td style={{fontSize:11.5, color:"var(--ink-soft)"}}>{it.category || "—"}</td>
                  <td>{it.description || it.service}{it.note && <div style={{fontSize:11, color:"var(--ink-soft)"}}>{it.note}</div>}</td>
                  <td>{it.qty}</td><td className="mono">{money(it.price)}</td>
                  <td>{it.discountPct||0}%</td><td className="mono">{money(it.qty*it.price*(1-(it.discountPct||0)/100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
          <table style={{ fontSize:13 }}>
            <tbody>
              {isMixed && <>
                <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Professional Fee Amount</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{money(profFee)}</td></tr>
                <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Government Fee Amount</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{money(govFee)}</td></tr>
              </>}
              <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Amount</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{money(inv.amount)}</td></tr>
              <tr><td style={{ padding:"4px 16px 4px 0", color:"var(--ink-soft)" }}>Paid</td><td className="mono" style={{ padding:"4px 0", textAlign:"right" }}>{money(paid)}</td></tr>
              <tr style={{ background:"var(--page)" }}><td style={{ padding:"7px 16px 7px 0", fontWeight:600 }}>Balance Due</td><td className="mono" style={{ padding:"7px 0", textAlign:"right", fontWeight:600 }}>{money(balance)}</td></tr>
            </tbody>
          </table>
        </div>
        {isMixed && <div style={{ fontSize:10.5, color:"var(--ink-soft)", marginBottom:16 }}>The Government Fee portion is a pass-through charge — excluded from Address Gateway's business volume and incentive calculations.</div>}
        <div style={{ borderTop:"1px solid var(--hair)", paddingTop:10, fontSize:12.5, marginBottom: inv.payments.length ? 20 : 0 }}>
          <span style={{color:"var(--ink-soft)"}}>Status :</span> {inv.status}
        </div>

        {inv.payments.length > 0 && (
          <div>
            <div className="disp" style={{ fontSize:13, fontWeight:500, marginBottom:8 }}>Payment History</div>
            <table className="agw-table">
              <thead><tr><th>Date</th><th>Amount</th><th>Mode</th></tr></thead>
              <tbody>
                {inv.payments.map(p=>(
                  <tr key={p.id}><td style={{fontSize:12}}>{fmtDate(p.date)}</td><td className="mono">{money(p.amount)}</td><td>{p.mode}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {canDownload ? (
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 14 }}>
          <button className="btn btn-sm" disabled={downloading} onClick={async ()=>{
            setDownloading(true);
            try {
              const blob = await api.invoices.downloadPdf(inv.id);
              downloadBlob(`Invoice-${inv.id}.pdf`, blob);
            } finally {
              setDownloading(false);
            }
          }}><Download size={13}/> {downloading ? "Generating…" : "Download PDF"}</button>
        </div>
      ) : (
        <div className="side-note" style={{marginTop:14}}>Internal viewing only — this document isn't available for download on your account.</div>
      )}
    </Modal>
  );
}

function PaymentHistoryModal({ invoice: inv, dispatch, onClose }) {
  const [removePmt, setRemovePmt] = useState(null);
  return (
    <Modal title={`Payment history — ${inv.id}`} sub={inv.customer} onClose={onClose}>
      {inv.payments.length === 0 ? <div className="side-note">No payments recorded yet.</div> : (
        <table className="agw-table">
          <thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Recorded by</th><th></th></tr></thead>
          <tbody>
            {inv.payments.map(p => (
              <tr key={p.id}>
                <td className="mono" style={{fontSize:12}}>{fmtDate(p.date)}</td>
                <td className="mono">{money(p.amount)}</td>
                <td>{p.mode}</td>
                <td>{p.by}</td>
                <td><RowActions onRemove={()=>setRemovePmt(p)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {removePmt && <ConfirmModal title="Remove this payment?" body={`${money(removePmt.amount)} via ${removePmt.mode} on ${fmtDate(removePmt.date)}. The invoice balance will be recalculated.`}
        onConfirm={()=>{ dispatch({type:"REMOVE_PAYMENT", invoiceId:inv.id, paymentId:removePmt.id}); onClose(); }} onClose={()=>setRemovePmt(null)} />}
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* COMPANY FINANCE (cheques both directions, company software subscriptions) */
/* ---------------------------------------------------------------------- */

// Same day-math as docState above, worded for a money-due date rather than a document expiry.
function dueState(dateStr) {
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, cls: "stamp-danger" };
  if (days === 0) return { label: "Due today", cls: "stamp-danger" };
  if (days <= 7) return { label: `Due in ${days}d`, cls: "stamp-warning" };
  return { label: "Upcoming", cls: "stamp-success" };
}

function CompanyFinancePage({ state, dispatch }) {
  const [tab, setTab] = useState("cheques");
  return (
    <div>
      <div className="tabbar" style={{ marginBottom: 14 }}>
        <button className={`tab ${tab==="cheques"?"active":""}`} onClick={()=>setTab("cheques")}>Cheques</button>
        <button className={`tab ${tab==="software"?"active":""}`} onClick={()=>setTab("software")}>Software Subscriptions</button>
      </div>
      {tab === "cheques" && <ChequesTab state={state} dispatch={dispatch} />}
      {tab === "software" && <SoftwareSubscriptionsTab state={state} dispatch={dispatch} />}
    </div>
  );
}

function ChequesTab({ state, dispatch }) {
  const [showNew, setShowNew] = useState(false);
  const [directionFilter, setDirectionFilter] = useState("");
  const [removeCheque, setRemoveCheque] = useState(null);
  const filtered = state.cheques.filter(c => !directionFilter || c.direction === directionFilter);
  const pg = usePagination(filtered);

  const setStatus = (c, status) => dispatch({ type:"UPDATE_CHEQUE", id:c.id, payload:{ status, clearedAt: status==="Cleared" ? daysFromNow(0) : undefined } });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:10 }}>
        <select value={directionFilter} onChange={e=>setDirectionFilter(e.target.value)} style={{ maxWidth:180 }}>
          <option value="">All directions</option>
          <option value="Incoming">Incoming</option>
          <option value="Outgoing">Outgoing</option>
        </select>
        <button className="btn btn-primary" onClick={()=>setShowNew(true)}><Plus size={15}/> New cheque</button>
      </div>
      <div className="agw-card" style={{ padding: 0 }}>
        {filtered.length === 0 ? <Empty icon={Landmark} text="No cheques recorded yet." /> : (
          <div style={{ overflowX:"auto" }}>
          <table className="agw-table" style={{ minWidth: 960 }}>
            <thead><tr><th>Direction</th><th>Cheque #</th><th>Bank</th><th>Party</th><th>Amount</th><th>Cheque date</th><th>Deposit date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pg.pageRows.map(c => {
                const due = dueState(c.depositDate);
                const resolved = ["Deposited","Cleared","Bounced","Cancelled"].includes(c.status);
                return (
                  <tr key={c.id}>
                    <td><Stamp tone={c.direction==="Incoming"?"success":"info"}>{c.direction}</Stamp></td>
                    <td className="mono">{c.chequeNumber}</td>
                    <td style={{fontSize:12.5}}>{c.bankName || "—"}</td>
                    <td>{c.partyName}{c.purpose ? <div style={{fontSize:11.5,color:"var(--ink-soft)"}}>{c.purpose}</div> : null}</td>
                    <td className="mono">{money(c.amount)}</td>
                    <td className="mono" style={{fontSize:12}}>{c.chequeDate ? fmtDate(c.chequeDate) : "—"}</td>
                    <td className="mono" style={{fontSize:12}}>{fmtDate(c.depositDate)}</td>
                    <td>
                      <Stamp tone={c.status==="Cleared"?"success":c.status==="Bounced"?"danger":c.status==="Cancelled"?"neutral":c.status==="Deposited"?"info":due.cls.replace("stamp-","")}>
                        {resolved ? c.status : due.label}
                      </Stamp>
                    </td>
                    <td style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                      {!resolved && <>
                        <button className="btn btn-sm btn-ghost" onClick={()=>setStatus(c,"Deposited")}>Mark deposited</button>
                        <button className="btn btn-sm btn-ghost" onClick={()=>setStatus(c,"Cleared")}>Mark cleared</button>
                        <button className="btn btn-sm btn-ghost" style={{color:"var(--danger)"}} onClick={()=>setStatus(c,"Bounced")}>Bounced</button>
                      </>}
                      <RowActions onRemove={()=>setRemoveCheque(c)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        <PaginationBar {...pg} />
      </div>
      {showNew && <NewChequeModal state={state} dispatch={dispatch} onClose={()=>setShowNew(false)} />}
      {removeCheque && <ConfirmModal title="Delete this cheque record?"
        body={`${removeCheque.chequeNumber} — ${money(removeCheque.amount)}. This only removes the tracking record; any invoice payment already recorded from it stays.`}
        onConfirm={()=>{ dispatch({type:"DELETE_CHEQUE", id:removeCheque.id}); setRemoveCheque(null); }} onClose={()=>setRemoveCheque(null)} />}
    </div>
  );
}

function NewChequeModal({ state, dispatch, onClose }) {
  const [direction, setDirection] = useState("Incoming");
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [amount, setAmount] = useState("");
  const [partyName, setPartyName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [chequeDate, setChequeDate] = useState(daysFromNow(0));
  const [depositDate, setDepositDate] = useState(daysFromNow(0));
  const [notes, setNotes] = useState("");

  const invoiceBalance = (i) => i.professionalFeeAmount - i.payments.reduce((a,p)=>a+p.amount,0);
  const unpaidInvoices = state.invoices.filter(i => i.status !== "Paid" && (!partyName || i.customer === partyName));

  return (
    <Modal title="New cheque" sub="Record a cheque received from a customer, or one the company is writing to a vendor." onClose={onClose} width={560}>
      <div className="field">
        <label>Direction</label>
        <div className="tabbar" style={{ marginBottom:0 }}>
          <button type="button" className={`tab ${direction==="Incoming"?"active":""}`} onClick={()=>{setDirection("Incoming"); setPurpose("");}}>Incoming (from customer)</button>
          <button type="button" className={`tab ${direction==="Outgoing"?"active":""}`} onClick={()=>{setDirection("Outgoing"); setInvoiceId("");}}>Outgoing (to vendor)</button>
        </div>
      </div>
      <div className="row2">
        <div className="field"><label>Cheque number</label><input value={chequeNumber} onChange={e=>setChequeNumber(e.target.value)} /></div>
        <div className="field"><label>Bank</label><input value={bankName} onChange={e=>setBankName(e.target.value)} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>{direction==="Incoming" ? "Customer" : "Payee / vendor"}</label>
          {direction === "Incoming" ? (
            <><input list="cheque-customer-options" value={partyName} onChange={e=>setPartyName(e.target.value)} placeholder="Type or pick a customer" />
              <datalist id="cheque-customer-options">{state.customers.map(c=><option key={c.id} value={c.name} />)}</datalist></>
          ) : (
            <input value={partyName} onChange={e=>setPartyName(e.target.value)} placeholder="Vendor name" />
          )}
        </div>
        <div className="field"><label>Amount (QAR)</label><input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
      </div>
      {direction === "Incoming" ? (
        <div className="field"><label>Link to invoice (optional)</label>
          <select value={invoiceId} onChange={e=>setInvoiceId(e.target.value)}>
            <option value="">Not linked to a specific invoice</option>
            {unpaidInvoices.map(i=><option key={i.id} value={i.id}>{i.id} — {i.customer} — {money(invoiceBalance(i))} due</option>)}
          </select>
        </div>
      ) : (
        <div className="field"><label>Purpose</label><input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="e.g. Office rent - August" /></div>
      )}
      <div className="row2">
        <div className="field"><label>Cheque date</label><input type="date" value={chequeDate} onChange={e=>setChequeDate(e.target.value)} /></div>
        <div className="field"><label>Deposit date</label><input type="date" value={depositDate} onChange={e=>setDepositDate(e.target.value)} /></div>
      </div>
      <div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)} /></div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!chequeNumber.trim() || !amount || !partyName.trim() || !depositDate} onClick={()=>{
          dispatch({ type:"ADD_CHEQUE", payload:{
            direction, chequeNumber: chequeNumber.trim(), bankName: bankName.trim()||null, amount: Number(amount),
            partyName: partyName.trim(), purpose: purpose.trim()||null, invoiceId: invoiceId||null, chequeDate, depositDate, notes: notes.trim()||null,
          }});
          onClose();
        }}>Save cheque</button>
      </div>
    </Modal>
  );
}

function SoftwareSubscriptionsTab({ state, dispatch }) {
  const [showNew, setShowNew] = useState(false);
  const [editSub, setEditSub] = useState(null);
  const [removeSub, setRemoveSub] = useState(null);
  const pg = usePagination(state.companySoftwareSubscriptions);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={()=>setShowNew(true)}><Plus size={15}/> New subscription</button>
      </div>
      <div className="agw-card" style={{ padding: 0 }}>
        {state.companySoftwareSubscriptions.length === 0 ? <Empty icon={Landmark} text="No software subscriptions tracked yet." /> : (
          <div style={{ overflowX:"auto" }}>
          <table className="agw-table" style={{ minWidth: 860 }}>
            <thead><tr><th>Software</th><th>Vendor</th><th>Cost</th><th>Billing cycle</th><th>Renewal date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pg.pageRows.map(s => {
                const due = dueState(s.renewalDate);
                return (
                  <tr key={s.id}>
                    <td>{s.softwareName}</td>
                    <td style={{fontSize:12.5}}>{s.vendor || "—"}</td>
                    <td className="mono">{money(s.cost)}</td>
                    <td>{s.billingCycle}</td>
                    <td className="mono" style={{fontSize:12}}>{fmtDate(s.renewalDate)}</td>
                    <td><Stamp tone={s.status==="Cancelled"?"neutral":due.cls.replace("stamp-","")}>{s.status==="Cancelled"?"Cancelled":due.label}</Stamp></td>
                    <td><RowActions onEdit={()=>setEditSub(s)} onRemove={()=>setRemoveSub(s)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        <PaginationBar {...pg} />
      </div>
      {showNew && <SoftwareSubscriptionModal dispatch={dispatch} onClose={()=>setShowNew(false)} />}
      {editSub && <SoftwareSubscriptionModal subscription={editSub} dispatch={dispatch} onClose={()=>setEditSub(null)} />}
      {removeSub && <ConfirmModal title="Delete this subscription record?" body={`${removeSub.softwareName} will no longer be tracked or remind on renewal.`}
        onConfirm={()=>{ dispatch({type:"DELETE_SOFTWARE_SUBSCRIPTION", id:removeSub.id}); setRemoveSub(null); }} onClose={()=>setRemoveSub(null)} />}
    </div>
  );
}

// Doubles as both "New" (no `subscription` prop) and "Edit / renew" (pass the existing record) —
// editing renewalDate is literally how you "renew" one, since the backend resets the reminder flag.
function SoftwareSubscriptionModal({ subscription: s, dispatch, onClose }) {
  const [softwareName, setSoftwareName] = useState(s?.softwareName || "");
  const [vendor, setVendor] = useState(s?.vendor || "");
  const [cost, setCost] = useState(s?.cost ?? "");
  const [billingCycle, setBillingCycle] = useState(s?.billingCycle || "Yearly");
  const [renewalDate, setRenewalDate] = useState(s?.renewalDate || daysFromNow(30));
  const [paymentMethod, setPaymentMethod] = useState(s?.paymentMethod || "");
  const [notes, setNotes] = useState(s?.notes || "");

  return (
    <Modal title={s ? `Edit ${s.softwareName}` : "New software subscription"} sub={s ? "Updating the renewal date also resets its reminder." : "Track a company SaaS/tool expense and get reminded before it renews."} onClose={onClose} width={520}>
      <div className="row2">
        <div className="field"><label>Software name</label><input value={softwareName} onChange={e=>setSoftwareName(e.target.value)} /></div>
        <div className="field"><label>Vendor</label><input value={vendor} onChange={e=>setVendor(e.target.value)} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Cost (QAR)</label><input type="number" min="0" value={cost} onChange={e=>setCost(e.target.value)} /></div>
        <div className="field"><label>Billing cycle</label>
          <select value={billingCycle} onChange={e=>setBillingCycle(e.target.value)}>
            <option>Monthly</option><option>Yearly</option><option>One-time</option>
          </select>
        </div>
      </div>
      <div className="row2">
        <div className="field"><label>Renewal date</label><input type="date" value={renewalDate} onChange={e=>setRenewalDate(e.target.value)} /></div>
        <div className="field"><label>Payment method</label><input value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} placeholder="e.g. Company card" /></div>
      </div>
      <div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)} /></div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!softwareName.trim() || !cost || !renewalDate} onClick={()=>{
          const payload = { softwareName: softwareName.trim(), vendor: vendor.trim()||null, cost: Number(cost), billingCycle, renewalDate, paymentMethod: paymentMethod.trim()||null, notes: notes.trim()||null };
          if (s) dispatch({ type:"UPDATE_SOFTWARE_SUBSCRIPTION", id:s.id, payload });
          else dispatch({ type:"ADD_SOFTWARE_SUBSCRIPTION", payload });
          onClose();
        }}>{s ? "Save changes" : "Create subscription"}</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* JOB CARDS                                                               */
/* ---------------------------------------------------------------------- */

function JobsPage({ state, dispatch, role, userId, highlightId, onHighlightHandled }) {
  const [view, setView] = useState("kanban");
  const [assignFor, setAssignFor] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [detailCancelOnOpen, setDetailCancelOnOpen] = useState(false);
  // Derived (not a frozen snapshot) so toggling a checklist item — which refreshes state.jobCards
  // from the server — is reflected in the open modal immediately, instead of only after re-opening it.
  const detail = detailId ? state.jobCards.find(j => j.id === detailId) : null;
  const [draggedJobId, setDraggedJobId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [newJob, setNewJob] = useState(false);
  const [expandedCols, setExpandedCols] = useState({});
  const KANBAN_PAGE_SIZE = 5;
  const cols = ["Pending Approval","Created","Assigned","In Progress","On Hold","Completed","Cancelled"];
  const canManage = role === "ops_manager" || role === "pro_head" || role === "pro" || ADMIN_LIKE.includes(role);
  const canCreateDirect = ["sales_manager","sales_exec","ops_manager","pro_head"].includes(role) || ADMIN_LIKE.includes(role);

  const [query, setQuery] = useState("");
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range } = usePeriod("all");
  const [leadByFilter, setLeadByFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [ageFilter, setAgeFilter] = useState("");
  const visibleByRole = role === "ops_member" ? state.jobCards.filter(j => j.assignees.includes(userId)) : state.jobCards;
  const periodFiltered = visibleByRole.filter(j => inRange(j.createdAt, range));
  const leadBySalespeople = [...new Set(periodFiltered.map(j => j.leadCreatorName).filter(Boolean))];
  const leadByFiltered = leadByFilter ? periodFiltered.filter(j => j.leadCreatorName === leadByFilter) : periodFiltered;
  const jobCategories = [...new Set(periodFiltered.map(j => j.service).filter(Boolean))].sort();
  const categoryFiltered = categoryFilter ? leadByFiltered.filter(j => j.service === categoryFilter) : leadByFiltered;
  const ageBucket = JOB_AGE_BUCKETS.find(b => b.key === ageFilter);
  const ageFiltered = ageBucket ? categoryFiltered.filter(j => ageBucket.test(daysSince(j.createdAt))) : categoryFiltered;
  const visible = ageFiltered.filter(j => [j.customer, j.id, j.service].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const pg = usePagination(visible);

  const openDetail = (j, cancelOnOpen=false) => { setDetailId(j.id); setDetailCancelOnOpen(cancelOnOpen); };

  // Kanban paginates 5-per-column, so a newly-relevant card could be hidden behind "Show more" —
  // force the flat table view instead, where the highlight logic below can always find it (subject
  // to the same known limitation as the other pipeline pages: if it's off the current table page,
  // the scroll is a no-op).
  useEffect(() => { if (highlightId) setView("table"); }, [highlightId]);
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`job-row-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, view, pg.pageRows.length]);

  const handleDrop = (col) => {
    setDragOverCol(null);
    const job = visible.find(j => j.id === draggedJobId);
    setDraggedJobId(null);
    if (!job || job.status === col || !canManage) return;
    if (["Completed","Cancelled","Pending Approval"].includes(job.status)) return; // locked / awaiting approval — no drag
    if (col === "Created" || col === "Pending Approval") return; // jobs never move back to these

    if (col === "Assigned") { setAssignFor(job); return; }
    if ((col === "In Progress" || col === "On Hold") && job.assignees.length === 0) { setAssignFor(job); return; }
    if (col === "Completed") {
      const allDone = job.checklist.length > 0 && job.checklist.every(c => c.done);
      if (!allDone) { openDetail(job); return; }
      dispatch({type:"SET_JOB_STATUS", id:job.id, status:"Completed", by:"Operations"});
      return;
    }
    if (col === "Cancelled") { openDetail(job, true); return; }
    dispatch({type:"SET_JOB_STATUS", id:job.id, status:col, by:"Operations"});
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:10 }}>
        <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
          <button className={`tab ${view==="kanban"?"active":""}`} onClick={()=>setView("kanban")}>Kanban</button>
          <button className={`tab ${view==="table"?"active":""}`} onClick={()=>setView("table")}>Table</button>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <PeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
          {leadBySalespeople.length > 0 && (
            <select value={leadByFilter} onChange={e=>setLeadByFilter(e.target.value)}
              style={{ fontSize:13, border:"1px solid var(--hair)", borderRadius:8, padding:"7px 10px", background:"var(--surface)" }}>
              <option value="">All salespeople</option>
              {leadBySalespeople.map(name=><option key={name} value={name}>{name}</option>)}
            </select>
          )}
          {jobCategories.length > 0 && (
            <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}
              style={{ fontSize:13, border:"1px solid var(--hair)", borderRadius:8, padding:"7px 10px", background:"var(--surface)" }}>
              <option value="">All categories</option>
              {jobCategories.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select value={ageFilter} onChange={e=>setAgeFilter(e.target.value)}
            style={{ fontSize:13, border:"1px solid var(--hair)", borderRadius:8, padding:"7px 10px", background:"var(--surface)" }}>
            <option value="">Any age</option>
            {JOB_AGE_BUCKETS.map(b=><option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <div style={{ position:"relative", maxWidth: 260 }}>
            <Search size={15} style={{ position:"absolute", left:12, top:9, color:"var(--ink-soft)" }} />
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search job cards"
              style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"7px 12px 7px 34px", fontSize:13, background:"var(--surface)" }} />
          </div>
          <button className="btn btn-sm" onClick={()=>exportCSV("job-cards.csv",
            ["Job Card","Customer","Service","Priority","Status","Target Date","Created"],
            visible.map(j=>[j.id, j.customer, j.service, j.priority, j.status, j.targetDate||"", j.createdAt]))}>
            <Download size={13}/> Export
          </button>
          {canCreateDirect && <button className="btn btn-primary" onClick={()=>setNewJob(true)}><Plus size={15}/> New job card</button>}
        </div>
      </div>

      {view === "table" && (
        <div className="agw-card" style={{ padding: 0 }}>
          {visible.length === 0 ? <Empty icon={ClipboardList} text="No job cards yet." /> : (
          <div style={{ overflowX:"auto" }}>
          <table className="agw-table" style={{ minWidth: 980 }}>
            <thead><tr><th>Job card</th><th>Age</th><th>Customer</th><th>Service</th><th>Lead by</th><th>Assigned</th><th>Checklist</th><th>Priority</th><th>Target date</th><th>Status</th></tr></thead>
            <tbody>
              {pg.pageRows.map(j => {
                const isHighlighted = highlightId === j.id;
                return (
                <tr key={j.id} id={`job-row-${j.id}`}
                  style={isHighlighted ? { background:"var(--gold-tint)", boxShadow:"inset 3px 0 0 var(--gold)" } : undefined}
                  onClick={()=>{ if (isHighlighted) onHighlightHandled?.(); openDetail(j); }}>
                  <td className="mono">{j.id}</td>
                  <td className="mono" style={{fontSize:12, whiteSpace:"nowrap"}}>{daysSince(j.createdAt)}d<div style={{fontSize:11,color:"var(--ink-soft)"}}>{fmtDate(j.createdAt)}</div></td>
                  <td style={{ display:"flex", alignItems:"center", gap:6, maxWidth:200 }}>
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={j.customer}>{j.customer}</span>
                    {isGrowthPartnerCustomer(state, j.customer) && <span className="pill" style={{ background:"var(--gold-tint)", color:"var(--gold-dark)", fontSize:10, padding:"3px 8px 3px 6px", flexShrink:0, display:"inline-flex", alignItems:"center", gap:4 }} title="Growth Partner Program customer"><Award size={16} fill="var(--gold)" fillOpacity={0.35} strokeWidth={2.25}/>{j.service==="Growth Partner Program" && j.packageTier ? j.packageTier : ""}</span>}
                  </td>
                  <td style={{maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} title={`${j.service}${j.description && j.description.trim().toLowerCase() !== j.service.trim().toLowerCase() ? ` — ${j.description}` : ""}`}>
                    <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:jobCategoryColor(j.service, state.services), marginRight:6, border:"1px solid var(--hair)" }} />
                    {j.service}{j.description && j.description.trim().toLowerCase() !== j.service.trim().toLowerCase() && ` — ${j.description}`}
                  </td>
                  <td style={{fontSize:12,color:"var(--ink-soft)", whiteSpace:"nowrap"}}>{j.leadCreatorName || "—"}</td>
                  <td>
                    <div className="avatars">
                      {j.assignees.length === 0 ? <span className="pill">Unassigned</span> :
                        j.assignees.map(a => <span className="avatar" key={a}>{state.employees.find(t=>t.id===a)?.initials}</span>)}
                    </div>
                  </td>
                  <td>{j.checklist.filter(c=>c.done).length}/{j.checklist.length}</td>
                  <td>{j.priority}</td>
                  <td className="mono" style={{fontSize:12}}>{fmtDate(j.targetDate)}</td>
                  <td><Stamp tone={statusTone(j.status)}>{j.status}</Stamp></td>
                </tr>
              );})}
            </tbody>
          </table>
          </div>)}
          <PaginationBar {...pg} />
        </div>
      )}

      {view === "kanban" && (
      <div className="board">
        {cols.map(col => {
          const colJobs = visible.filter(j => j.status === col);
          const isExpanded = !!expandedCols[col];
          const shownJobs = isExpanded ? colJobs : colJobs.slice(0, KANBAN_PAGE_SIZE);
          return (
          <div className={`board-col ${dragOverCol===col ? "drag-over" : ""}`} key={col}
            onDragOver={(e)=>{ e.preventDefault(); if (dragOverCol!==col) setDragOverCol(col); }}
            onDragLeave={()=>setDragOverCol(prev => prev===col ? null : prev)}
            onDrop={(e)=>{ e.preventDefault(); handleDrop(col); }}>
            <h4>{col}<span className="pill">{colJobs.length}</span></h4>
            {shownJobs.map(j => {
              const catBg = jobCategoryColor(j.service, state.services);
              const isHi = highlightId === j.id;
              // The category tint is a fixed light pastel in both themes (by design — see
              // jobCategoryColor), so text on it can't just inherit --ink/--ink-soft: those flip to
              // near-white in dark mode and become unreadable against a light card background.
              // Pinning both vars locally fixes descendants that explicitly read var(--ink-soft)
              // (the id/date lines) but NOT the title — .job-card sets no color of its own, so h5
              // just inherits the already-computed (dark-mode) color from way up the tree; setting
              // the custom property here doesn't retroactively re-resolve it. The explicit `color`
              // below forces that re-read at the card's own scope (same fix as the modal one).
              const cardStyle = isHi
                ? { cursor:"pointer", background:"var(--gold-tint)", boxShadow:"inset 3px 0 0 var(--gold)" }
                : { cursor:"pointer", background: catBg, ...(catBg ? { "--ink":"#151A1F", "--ink-soft":"#4B535B", color:"#151A1F" } : {}) };
              return (
              <div className={`job-card ${draggedJobId===j.id ? "dragging" : ""}`} key={j.id} id={`job-card-${j.id}`}
                onClick={()=>{ if (highlightId===j.id) onHighlightHandled?.(); openDetail(j); }}
                draggable={canManage && !["Completed","Cancelled","Pending Approval"].includes(j.status)}
                onDragStart={(e)=>{ setDraggedJobId(j.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={()=>{ setDraggedJobId(null); setDragOverCol(null); }}
                style={cardStyle} title="Click for full details">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6 }}>
                  <h5 style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.customer}</h5>
                  {isGrowthPartnerCustomer(state, j.customer) && <span className="pill" style={{ background:"var(--gold-tint)", color:"var(--gold-dark)", fontSize:10, padding:"3px 8px 3px 6px", flexShrink:0, display:"inline-flex", alignItems:"center", gap:4 }} title="Growth Partner Program customer"><Award size={16} fill="var(--gold)" fillOpacity={0.35} strokeWidth={2.25}/>{j.service==="Growth Partner Program" && j.packageTier ? j.packageTier : ""}</span>}
                </div>
                <div className="mono" style={{ fontSize:11, color:"var(--ink-soft)", marginTop:-4, marginBottom:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {j.id} · {j.service}
                </div>
                <div style={{ fontSize:11, color:"var(--ink-soft)", marginBottom:4 }}>Created {fmtDate(j.createdAt)} · {daysSince(j.createdAt)}d old</div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div className="avatars">
                    {j.assignees.length === 0 ? <span className="pill">Unassigned</span> :
                      j.assignees.map(a => <span className="avatar" key={a}>{state.employees.find(t=>t.id===a)?.initials}</span>)}
                  </div>
                  {j.checklist.length > 0 && <span className="pill">{j.checklist.filter(c=>c.done).length}/{j.checklist.length}</span>}
                </div>
                {col === "Pending Approval" && (role==="accounts"||ADMIN_LIKE.includes(role)) &&
                  <button className="btn btn-sm btn-primary" style={{marginTop:8,width:"100%"}} onClick={(e)=>{e.stopPropagation(); openDetail(j);}}>Review for approval</button>}
                {col === "Created" && (role==="ops_manager"||role==="pro_head"||ADMIN_LIKE.includes(role)) &&
                  <button className="btn btn-sm" style={{marginTop:8,width:"100%"}} onClick={(e)=>{e.stopPropagation(); setAssignFor(j);}}>Assign team</button>}
              </div>
              );})}
            {colJobs.length === 0 && <div style={{fontSize:12,color:"var(--ink-soft)",padding:"6px 6px"}}>—</div>}
            {colJobs.length > KANBAN_PAGE_SIZE && (
              <button className="btn btn-sm btn-ghost" style={{width:"100%",marginTop:4}}
                onClick={()=>setExpandedCols(prev=>({...prev,[col]:!prev[col]}))}>
                {isExpanded ? "Show less" : `Show ${colJobs.length - KANBAN_PAGE_SIZE} more`}
              </button>
            )}
          </div>
          );
        })}
      </div>
      )}

      {assignFor && <AssignModal job={assignFor} dispatch={dispatch} employees={state.employees} onClose={()=>setAssignFor(null)} />}
      {detail && <JobDetailModal job={detail} state={state} dispatch={dispatch} role={role} userId={userId} employees={state.employees} approvalTypes={state.approvalTypes} initialShowCancel={detailCancelOnOpen}
        onClose={()=>{ setDetailId(null); setDetailCancelOnOpen(false); }} onReassign={()=>{ setAssignFor(detail); setDetailId(null); }} />}
      {newJob && <NewJobCardModal state={state} dispatch={dispatch} onClose={()=>setNewJob(false)} />}
    </div>
  );
}

function NewJobCardModal({ state, dispatch, onClose }) {
  const [customer, setCustomer] = useState("");
  const [service, setService] = useState(SERVICES[0]);
  const [description, setDescription] = useState("");
  const activeSub = state.subscriptions.find(s => s.customer === customer && subStatusOf(s) !== "Cancelled" && subStatusOf(s) !== "Expired");

  return (
    <Modal title="New job card" sub="Creates a job card directly — needs Accounts approval before Operations can assign it." onClose={onClose} width={520}>
      <div className="field">
        <label>Customer</label>
        <input list="direct-job-customer-options" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Type or pick a customer" />
        <datalist id="direct-job-customer-options">{state.customers.map(c=><option key={c.id} value={c.name} />)}</datalist>
      </div>
      {customer && (
        activeSub ? (
          <div className="side-note" style={{marginTop:0}}><BadgeCheck size={13} style={{verticalAlign:-2,marginRight:4}}/>{customer} has an active {activeSub.tier} subscription — this job card will count as one of their included transactions once approved.</div>
        ) : (
          <div className="side-note" style={{marginTop:0}}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{customer} has no active subscription — this job card won't count against any package.</div>
        )
      )}
      <div className="field"><label>Service</label>
        <select value={service} onChange={e=>setService(e.target.value)}>
          {state.services.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="field"><label>Transaction description</label><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="e.g. QID Renewal — 2 employees" /></div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!customer.trim()} onClick={()=>{
          dispatch({type:"CREATE_DIRECT_JOB_CARD", customer:customer.trim(), service, description, by:"Sales"});
          onClose();
        }}>Submit for approval</button>
      </div>
    </Modal>
  );
}

function AssignModal({ job, dispatch, employees, onClose }) {
  const opsTeam = employees.filter(t => isAssignable(t) && (t.roles.includes("ops_member") || t.roles.includes("ops_manager") || t.roles.includes("pro_head") || t.roles.includes("pro")));
  const [selected, setSelected] = useState(job.assignees);
  const toggle = (id) => setSelected(sel => sel.includes(id) ? sel.filter(x=>x!==id) : [...sel, id]);
  return (
    <Modal title={`Assign ${job.id}`} sub={`${job.customer} — select one or more team members`} onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {opsTeam.map(t => (
          <label key={t.id} style={{ display:"flex", alignItems:"center", gap:10, border:"1px solid var(--hair)", borderRadius:8, padding:"8px 10px" }}>
            <input type="checkbox" checked={selected.includes(t.id)} onChange={()=>toggle(t.id)} />
            <span className="avatar">{t.initials}</span>
            <div><div style={{fontSize:13}}>{t.name}</div><div style={{fontSize:11,color:"var(--ink-soft)"}}>{t.designation}</div></div>
          </label>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={selected.length===0} onClick={()=>{ dispatch({type:"ASSIGN_JOB", id:job.id, assignees:selected, by:"Operations Manager"}); onClose(); }}>Assign</button>
      </div>
    </Modal>
  );
}

function JobDetailModal({ job, state, dispatch, role, userId, employees, approvalTypes=[], onClose, onReassign, initialShowCancel=false }) {
  const isGP = !!state && isGrowthPartnerCustomer(state, job.customer);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(initialShowCancel);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [newItemLabel, setNewItemLabel] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [downloading, setDownloading] = useState(false);
  const confirm = useConfirm();
  const isAdmin = ADMIN_LIKE.includes(role);
  // Admin-only override: the normal action row below disappears once a job card is Completed or
  // Cancelled (those are meant to be terminal for everyone else), but Admin needs to be able to
  // correct a wrong status regardless — including reopening a Cancelled or Completed job card.
  const JOB_STATUSES = ["Created","Assigned","In Progress","On Hold","Completed","Cancelled"];
  const [adminStatus, setAdminStatus] = useState(job.status);
  const [adminCancelReason, setAdminCancelReason] = useState("");
  const [adminStatusBusy, setAdminStatusBusy] = useState(false);
  const [adminStatusError, setAdminStatusError] = useState("");
  const changeStatusAdmin = async () => {
    setAdminStatusBusy(true);
    setAdminStatusError("");
    try {
      await dispatch({ type:"SET_JOB_STATUS", id:job.id, status:adminStatus, reason: adminStatus==="Cancelled" ? (adminCancelReason.trim() || "Changed by admin") : undefined, by:"Admin override" });
    } catch (err) {
      setAdminStatusError(err instanceof ApiError ? err.message : "Couldn't change status — please try again.");
    } finally {
      setAdminStatusBusy(false);
    }
  };
  const canManage = role === "ops_manager" || role === "ops_member" || role === "pro_head" || role === "pro" || ADMIN_LIKE.includes(role);
  const myDesignation = employees.find(e=>e.id===userId)?.designation;
  // Job Card Sign-off (Pending Approval -> Created) is Accounts-only by default, but — same as
  // completion approval below — an admin can additively grant it to other designations via
  // Approval Process Workflow (job_card_signoff), which the backend already honors; this was
  // missing here so an assigned designation approver never saw the button.
  const signoffApproverDesignations = approvalTypes.find(t=>t.key==="job_card_signoff")?.approverDesignations || [];
  const canApproveJob = role === "accounts" || ADMIN_LIKE.includes(role) || (myDesignation && signoffApproverDesignations.includes(myDesignation));
  // Marking a job card Completed needs Operations Manager sign-off — narrower than canManage,
  // which the assigned ops_member still needs for holds/checklist/cancel.
  const completionApproverDesignations = approvalTypes.find(t=>t.key==="job_card_completion")?.approverDesignations || [];
  const canCompleteJob = role === "ops_manager" || role === "pro_head" || ADMIN_LIKE.includes(role) || (myDesignation && completionApproverDesignations.includes(myDesignation));
  const allDone = job.checklist.length > 0 && job.checklist.every(c => c.done);
  const pendingApproval = job.status === "Pending Approval";
  const locked = ["Completed","Cancelled"].includes(job.status) || pendingApproval;

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await dispatch({type:"DELETE_JOB_CARD", id:job.id});
      onClose();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't delete — please try again.");
    }
  };

  return (
    <>
    <Modal title={<span style={{ display:"inline-flex", alignItems:"center", gap:10 }}>
        {job.id}
        {isGP && <span className="pill" style={{ background:"var(--gold-tint)", color:"var(--gold-dark)", fontSize:12, padding:"4px 10px 4px 8px", display:"inline-flex", alignItems:"center", gap:5 }} title="Growth Partner Program customer">
          <Award size={18} fill="var(--gold)" fillOpacity={0.35} strokeWidth={2.25}/>Growth Partner{job.packageTier ? ` · ${job.packageTier}` : ""}
        </span>}
      </span>} sub={`${job.customer} — ${job.service}${job.packageTier ? ` (${job.packageTier})` : ""}${job.description && job.description.trim().toLowerCase() !== job.service.trim().toLowerCase() ? " — "+job.description : ""}`} onClose={onClose} width={640}>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:-6, marginBottom:6 }}>
        <button className="btn btn-sm" disabled={downloading} onClick={async ()=>{
          setDownloading(true);
          try {
            const blob = await api.jobCards.downloadPdf(job.id);
            downloadBlob(`JobCard-${job.id}.pdf`, blob);
          } catch (err) {
            alert(err instanceof ApiError ? err.message : "Couldn't generate the PDF — please try again.");
          } finally {
            setDownloading(false);
          }
        }}><Download size={13}/> {downloading ? "Generating…" : "Download PDF"}</button>
        {ADMIN_LIKE.includes(role) && (
          <button className="btn btn-sm btn-ghost" style={{color:"var(--danger)"}} onClick={()=>setConfirmDelete(true)}><Trash2 size={13}/> Delete job card</button>
        )}
      </div>
      <Rail steps={["Created","Assigned","In Progress","Completed"]} current={["Completed","Cancelled"].includes(job.status) ? "Completed" : job.status} />
      <div style={{ fontSize:12, color:"var(--ink-soft)", marginTop:8 }}>
        {job.leadCreatorName && <>Lead by <strong style={{color:"var(--ink)"}}>{job.leadCreatorName}</strong> · </>}
        {daysSince(job.createdAt)} day{daysSince(job.createdAt)===1?"":"s"} old
      </div>

      {pendingApproval && (
        <div className="agw-card" style={{ marginTop: 14, borderColor:"#F2C089", background:"var(--gold-tint)" }}>
          <strong style={{ fontSize:13 }}>Awaiting Accounts approval</strong>
          <p className="modal-sub" style={{ marginBottom: canApproveJob ? 10 : 0 }}>This job card was created directly and needs Accounts sign-off before Operations can assign a team.{job.createdBy && ` Requested by ${job.createdBy}.`}</p>
          {canApproveJob ? (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button className="btn btn-primary" onClick={()=>{ dispatch({type:"APPROVE_JOB_CARD", id:job.id, by:"Accounts"}); }}>Approve</button>
              <button className="btn" style={{ color:"var(--danger)" }} onClick={()=>setShowReject(true)}>Reject</button>
            </div>
          ) : null}
          {showReject && (
            <div style={{ marginTop: 10 }}>
              <div className="field"><label>Reason for rejection</label><textarea rows={2} value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="e.g. No active subscription, needs a quotation instead..." /></div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                <button className="btn btn-sm" onClick={()=>setShowReject(false)}>Back</button>
                <button className="btn btn-sm btn-primary" style={{ background:"var(--danger)", borderColor:"var(--danger)" }} disabled={!rejectReason}
                  onClick={()=>{ dispatch({type:"REJECT_JOB_CARD", id:job.id, reason:rejectReason, by:"Accounts"}); onClose(); }}>Confirm rejection</button>
              </div>
            </div>
          )}
        </div>
      )}

      {canManage && !locked && (
        <div className="row2" style={{ marginTop: 14 }}>
          <div className="field"><label>Priority</label>
            <select value={job.priority} onChange={e=>dispatch({type:"UPDATE_JOB_CARD", id:job.id, payload:{priority:e.target.value}})}>
              {["Low","Normal","High","Urgent"].map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field"><label>Target completion date</label>
            <input type="date" value={job.targetDate} onChange={e=>dispatch({type:"UPDATE_JOB_CARD", id:job.id, payload:{targetDate:e.target.value}})} />
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop: 14 }}>
        <strong style={{ fontSize:13 }}>Assigned team</strong>
        {canManage && !locked && <button className="btn btn-sm" onClick={onReassign}>Edit assignment</button>}
      </div>
      <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
        {job.assignees.length === 0 ? <span className="pill">{pendingApproval ? "Not yet assignable" : "Unassigned"}</span> :
          job.assignees.map(a => { const t = employees.find(x=>x.id===a); return <span key={a} className="pill"><span className="avatar" style={{marginLeft:-8,marginRight:6}}>{t?.initials}</span>{t?.name}</span>; })}
      </div>

      <div style={{ marginTop: 16 }}>
        <strong style={{ fontSize:13 }}>Checklist</strong>
        <div style={{ marginTop:6 }}>
          {job.checklist.length === 0 && <div className="side-note">No checklist items yet — add one below, or Admin can set a default under Checklist Templates.</div>}
          {job.checklist.map(item => (
            <div className="checklist-item" key={item.id}>
              <span className={`checkbox ${item.done ? "checked":""}`} onClick={()=>canManage && !locked && dispatch({type:"TOGGLE_CHECKLIST_ITEM", jobId:job.id, itemId:item.id})} style={{cursor: canManage && !locked ?"pointer":"default"}}>{item.done && <Check size={12}/>}</span>
              <span style={{ flex:1, textDecoration: item.done ? "line-through":"none", color: item.done? "var(--ink-soft)":"var(--ink)", cursor: canManage && !locked ?"pointer":"default" }}
                onClick={()=>canManage && !locked && dispatch({type:"TOGGLE_CHECKLIST_ITEM", jobId:job.id, itemId:item.id})}>{item.label}</span>
              {canManage && !locked && <button className="btn btn-sm btn-ghost" style={{color:"var(--danger)"}} onClick={async ()=>{
                if (await confirm({ title:"Remove this checklist item?", body:item.label, confirmLabel:"Remove" }))
                  dispatch({type:"REMOVE_JOB_CHECKLIST_ITEM", jobId:job.id, itemId:item.id});
              }}><Trash2 size={12}/></button>}
            </div>
          ))}
        </div>
        {canManage && !locked && (
          <div style={{ display:"flex", gap:6, marginTop: 10 }}>
            <input style={{ flex:1, border:"1px solid var(--hair)", borderRadius:8, padding:"7px 10px", fontSize:13 }} placeholder="Add a checklist item" value={newItemLabel} onChange={e=>setNewItemLabel(e.target.value)} />
            <button className="btn btn-sm" onClick={()=>{ if(newItemLabel.trim()){ dispatch({type:"ADD_JOB_CHECKLIST_ITEM", jobId:job.id, label:newItemLabel.trim()}); setNewItemLabel(""); } }}><Plus size={13}/> Add</button>
          </div>
        )}
      </div>

      {job.status === "Cancelled" && job.cancelReason && <div className="side-note" style={{ borderColor:"#EFC3BC", background:"var(--danger-tint)" }}><Ban size={13} style={{verticalAlign:-2,marginRight:4}}/>Cancelled: {job.cancelReason}</div>}

      {canManage && !pendingApproval && !["Completed","Cancelled"].includes(job.status) && job.assignees.length > 0 && (
        <div style={{ display:"flex", gap:8, marginTop: 18, flexWrap:"wrap", alignItems:"center" }}>
          {job.status !== "On Hold" && <button className="btn" onClick={()=>dispatch({type:"SET_JOB_STATUS", id:job.id, status:"On Hold", by:"Operations"})}>Put on hold</button>}
          {job.status === "On Hold" && <button className="btn" onClick={()=>dispatch({type:"SET_JOB_STATUS", id:job.id, status:"In Progress", by:"Operations"})}>Resume</button>}
          {canCompleteJob ? (
            <button className="btn btn-primary" disabled={!allDone} onClick={()=>{ dispatch({type:"SET_JOB_STATUS", id:job.id, status:"Completed", by:"Operations"}); onClose(); }}>
              Mark completed{!allDone && " (finish checklist first)"}
            </button>
          ) : allDone && (
            <span className="side-note" style={{marginTop:0}}>Checklist done — ask your Operations Manager to mark this complete.</span>
          )}
          <button className="btn" style={{ color:"var(--danger)" }} onClick={()=>setShowCancel(true)}>Cancel job</button>
        </div>
      )}

      {isAdmin && !pendingApproval && (
        <div className="agw-card" style={{ marginTop: 14 }}>
          <strong style={{ fontSize:13 }}>Admin: change status</strong>
          <p className="modal-sub" style={{ marginTop:4, marginBottom:8 }}>Overrides the normal workflow directly — including reopening a Completed or Cancelled job card.</p>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <select value={adminStatus} onChange={e=>setAdminStatus(e.target.value)} style={{ maxWidth:160 }}>
              {JOB_STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
            {adminStatus === "Cancelled" && (
              <input style={{ flex:1, minWidth:180, border:"1px solid var(--hair)", borderRadius:8, padding:"7px 10px", fontSize:13 }}
                placeholder="Cancellation reason (optional)" value={adminCancelReason} onChange={e=>setAdminCancelReason(e.target.value)} />
            )}
            <button className="btn btn-primary" disabled={adminStatusBusy || adminStatus===job.status} onClick={changeStatusAdmin}>
              {adminStatusBusy ? "Changing…" : "Change status"}
            </button>
          </div>
          {adminStatusError && <div className="side-note" style={{ color:"var(--danger)", marginTop:8, marginBottom:0 }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{adminStatusError}</div>}
        </div>
      )}

      {showCancel && (
        <div className="agw-card" style={{ marginTop: 14 }}>
          <div className="field"><label>Cancellation reason</label><textarea rows={2} value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="e.g. Client withdrew, documentation issue..." /></div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button className="btn btn-sm" onClick={()=>setShowCancel(false)}>Back</button>
            <button className="btn btn-sm btn-primary" style={{ background:"var(--danger)", borderColor:"var(--danger)" }} disabled={!cancelReason}
              onClick={()=>{ dispatch({type:"SET_JOB_STATUS", id:job.id, status:"Cancelled", reason:cancelReason, by:"Operations"}); onClose(); }}>Confirm cancellation</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <strong style={{ fontSize:13 }}>Activity log</strong>
        <div style={{ marginTop:8, maxHeight:260, overflowY:"auto" }}>
          {(!job.statusLog || job.statusLog.length === 0) ? <div className="side-note">No activity recorded yet.</div> : (
            [...job.statusLog].reverse().map((l, i) => {
              const Icon = l.status === "Comment" ? MessageCircle : l.status === "Checklist" ? Check : l.status === "Assigned" ? UserPlus : l.status === "Updated" ? Pencil : ClipboardList;
              const by = employees.find(e=>e.id===l.by)?.name || l.by || "System";
              return (
                <div key={i} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom: i===job.statusLog.length-1 ? "none" : "1px solid var(--hair)" }}>
                  <Icon size={14} style={{ marginTop:2, color:"var(--ink-soft)", flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13 }}>{l.note || l.status}</div>
                    <div style={{ fontSize:11, color:"var(--ink-soft)" }}>{by} · {fmtDate(l.at)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div style={{ display:"flex", gap:6, marginTop: 10 }}>
          <input style={{ flex:1, border:"1px solid var(--hair)", borderRadius:8, padding:"7px 10px", fontSize:13 }} placeholder="Add a comment"
            value={newComment} onChange={e=>setNewComment(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter" && newComment.trim()){ dispatch({type:"ADD_JOB_COMMENT", id:job.id, note:newComment.trim()}); setNewComment(""); } }} />
          <button className="btn btn-sm" onClick={()=>{ if(newComment.trim()){ dispatch({type:"ADD_JOB_COMMENT", id:job.id, note:newComment.trim()}); setNewComment(""); } }}><MessageCircle size={13}/> Comment</button>
        </div>
      </div>
    </Modal>
    {confirmDelete && (
      <ConfirmModal title={`Delete ${job.id}?`} body={`${job.customer} — ${job.service}. This permanently deletes the job card and its history. This can't be undone.`}
        confirmLabel="Delete" onConfirm={handleDelete} onClose={()=>setConfirmDelete(false)} />
    )}
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* INCENTIVES                                                              */
/* ---------------------------------------------------------------------- */

// Illustrative incentive calculation for one employee, summed across all of their roles.
// Mirrors the per-role logic in IncentivesPage — Government Fee quotations/invoices are pass-through and excluded.
// Shared period filtering for Dashboard and Reports.
const PERIODS = [
  { key:"today", label:"Today" },
  { key:"week", label:"This Week" },
  { key:"month", label:"This Month" },
  { key:"year", label:"This Year" },
  { key:"all", label:"All Time" },
  { key:"custom", label:"Custom" },
];

function periodRange(period, customFrom, customTo) {
  const today = daysFromNow(0);
  if (period === "today") return [today, today];
  if (period === "week") return [daysFromNow(-6), today];
  if (period === "month") { const d = new Date(); return [`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`, today]; }
  if (period === "year") { const d = new Date(); return [`${d.getFullYear()}-01-01`, today]; }
  if (period === "custom") return [customFrom || today, customTo || today];
  return [null, null]; // all time
}
function inRange(dateStr, range) {
  if (!dateStr) return false;
  if (!range[0]) return true;
  // Bounds are always plain "YYYY-MM-DD"; dateStr from the DB is often a full timestamp
  // ("YYYY-MM-DD HH:MM:SS"). Comparing the full strings breaks the upper bound for anything dated
  // today: "2026-07-30 07:25:17" sorts AFTER "2026-07-30" lexicographically (same prefix, then
  // longer), so today's own leads/deals/etc. would fail `<= range[1]` and vanish from their own
  // creation/assignment day. Truncating to the date portion before comparing fixes that everywhere.
  const d = String(dateStr).slice(0, 10);
  return d >= range[0] && d <= range[1];
}

function PeriodFilter({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
      <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
        {PERIODS.map(p => (
          <button key={p.key} className={`tab ${period===p.key?"active":""}`} onClick={()=>setPeriod(p.key)}>{p.label}</button>
        ))}
      </div>
      {period === "custom" && (
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{ border:"1px solid var(--hair)", borderRadius:8, padding:"5px 8px", fontSize:12.5 }} />
          <span style={{ fontSize:12, color:"var(--ink-soft)" }}>to</span>
          <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{ border:"1px solid var(--hair)", borderRadius:8, padding:"5px 8px", fontSize:12.5 }} />
        </div>
      )}
    </div>
  );
}

function usePeriod(defaultPeriod = "month") {
  const [period, setPeriod] = useState(defaultPeriod);
  const [customFrom, setCustomFrom] = useState(daysFromNow(-30));
  const [customTo, setCustomTo] = useState(daysFromNow(0));
  const range = periodRange(period, customFrom, customTo);
  return { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range };
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function computeIncentive(emp, state) {
  const dealsWon = state.deals.filter(d => {
    if (d.stage !== "Won" || d.owner !== emp.id) return false;
    const linkedQuote = state.quotations.find(q => q.dealId === d.id);
    return !linkedQuote || linkedQuote.feeType !== "Government Fee";
  }).length;
  const jobsDone = state.jobCards.filter(j => j.status === "Completed" && j.assignees.includes(emp.id)).length;
  const paymentsCollected = state.invoices.reduce((a,inv) => {
    if (inv.feeType === "Government Fee") return a;
    return a + inv.payments.filter(p=>p.by==="Accounts").length;
  }, 0);
  let total = 0;
  (emp.roles || []).forEach(role => {
    state.incentiveRules.filter(r => r.role === role).forEach(r => {
      let count = 0;
      if (role === "sales_exec") count = dealsWon;
      if (role === "ops_member") count = jobsDone;
      if (role === "accounts") count = paymentsCollected;
      total += count * r.amount;
    });
  });
  return total;
}

function IncentivesPage({ state, dispatch, role, userId }) {
  const isAdmin = ADMIN_LIKE.includes(role);
  const [tab, setTab] = useState(isAdmin ? "rules" : "mine");

  // simple illustrative calculation for the logged-in user across periods.
  // Government Fee quotations/invoices are pass-through and excluded — only Professional Fee revenue counts.
  const dealsWon = state.deals.filter(d => {
    if (d.stage !== "Won" || d.owner !== userId) return false;
    const linkedQuote = state.quotations.find(q => q.dealId === d.id);
    return !linkedQuote || linkedQuote.feeType !== "Government Fee";
  }).length;
  const jobsDone = state.jobCards.filter(j => j.status === "Completed" && j.assignees.includes(userId)).length;
  const paymentsCollected = state.invoices.reduce((a,inv) => {
    if (inv.feeType === "Government Fee") return a;
    return a + inv.payments.filter(p=>p.by==="Accounts").length;
  }, 0);

  const rulesForRole = state.incentiveRules.filter(r => r.role === role);

  const earned = { Daily: 0, Weekly: 0, Monthly: 0 };
  rulesForRole.forEach(r => {
    let count = 0;
    if (role === "sales_exec") count = dealsWon;
    if (role === "ops_member") count = jobsDone;
    if (role === "accounts") count = paymentsCollected;
    earned[r.period] += count * r.amount;
  });

  return (
    <div>
      <div className="tabbar">
        <button className={`tab ${tab==="mine"?"active":""}`} onClick={()=>setTab("mine")}>My incentives</button>
        {isAdmin && <button className={`tab ${tab==="rules"?"active":""}`} onClick={()=>setTab("rules")}>Rules & payout report</button>}
      </div>

      {tab === "mine" && (
        <div>
          <div className="side-note" style={{ marginTop:0, marginBottom:16 }}>
            <AlertTriangle size={13} style={{verticalAlign:-2, marginRight:4}}/>Only Professional Fee revenue counts toward business volume and incentives — Government Fee amounts are pass-through and always excluded.
          </div>
          <div className="agw-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
            {["Daily","Weekly","Monthly"].map(p => (
              <div className="agw-card" key={p} style={{ borderColor: "#F2C089" }}>
                <div className="kpi-label">{p} incentive earned</div>
                <div className="kpi-value disp" style={{ color:"var(--gold)" }}>{money(earned[p])}</div>
              </div>
            ))}
          </div>
          <div className="agw-card">
            <strong style={{ fontSize:13 }}>Your active incentive rules</strong>
            <table className="agw-table" style={{ marginTop:10 }}>
              <thead><tr><th>Period</th><th>Metric</th><th>Rate</th></tr></thead>
              <tbody>
                {rulesForRole.length === 0 && <tr><td colSpan={3} style={{color:"var(--ink-soft)"}}>No incentive rules configured for your role yet.</td></tr>}
                {rulesForRole.map(r => <tr key={r.id}><td>{r.period}</td><td>{r.metric}</td><td className="mono">{r.metric.includes("%") ? r.amount+"%" : "QAR "+r.amount}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "rules" && isAdmin && <IncentiveRulesAdmin state={state} dispatch={dispatch} />}
    </div>
  );
}

function IncentiveRulesAdmin({ state, dispatch }) {
  const blank = { role:"sales_exec", period:"Daily", metric:"", amount:0 };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [removeRule, setRemoveRule] = useState(null);

  const startEdit = (r) => { setEditingId(r.id); setForm({ role:r.role, period:r.period, metric:r.metric, amount:r.amount }); };
  const cancelEdit = () => { setEditingId(null); setForm(blank); };
  const save = () => {
    if (editingId) dispatch({ type:"UPDATE_INCENTIVE_RULE", id:editingId, payload:form });
    else dispatch({ type:"ADD_INCENTIVE_RULE", payload:form });
    cancelEdit();
  };

  return (
    <div>
      <div className="agw-card" style={{ padding: 0, marginBottom: 18 }}>
        <table className="agw-table">
          <thead><tr><th>Role</th><th>Period</th><th>Metric</th><th>Rate</th><th></th></tr></thead>
          <tbody>
            {state.incentiveRules.map(r => (
              <tr key={r.id}>
                <td><span className="pill">{ROLE_LABEL[r.role]}</span></td>
                <td>{r.period}</td>
                <td>{r.metric}</td>
                <td className="mono">{r.metric.includes("%") ? r.amount+"%" : "QAR "+r.amount}</td>
                <td><RowActions onEdit={()=>startEdit(r)} onRemove={()=>setRemoveRule(r)} /></td>
              </tr>
            ))}
            {state.incentiveRules.length === 0 && <tr><td colSpan={5} style={{color:"var(--ink-soft)"}}>No incentive rules yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="agw-card">
        <strong style={{ fontSize:13 }}>{editingId ? "Edit incentive rule" : "Add incentive rule"}</strong>
        <div className="row3" style={{ marginTop: 10 }}>
          <div className="field"><label>Applies to</label>
            <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
              {["sales_exec","sales_manager","ops_member","ops_manager","pro_head","pro","accounts"].map(r=><option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div className="field"><label>Period</label>
            <select value={form.period} onChange={e=>setForm({...form,period:e.target.value})}>
              {["Daily","Weekly","Monthly"].map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field"><label>Rate (QAR or %)</label><input type="number" value={form.amount} onChange={e=>setForm({...form,amount:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
        </div>
        <div className="field"><label>Metric description</label><input value={form.metric} onChange={e=>setForm({...form,metric:e.target.value})} placeholder="e.g. Per job card completed" /></div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-primary btn-sm" disabled={!form.metric} onClick={save}>{editingId ? "Save changes" : "Add rule"}</button>
          {editingId && <button className="btn btn-sm" onClick={cancelEdit}>Cancel</button>}
        </div>
      </div>

      {removeRule && <ConfirmModal title="Remove incentive rule?" body={`${ROLE_LABEL[removeRule.role]} — ${removeRule.metric}`} onConfirm={()=>dispatch({type:"DELETE_INCENTIVE_RULE", id:removeRule.id})} onClose={()=>setRemoveRule(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* HR                                                                       */
/* ---------------------------------------------------------------------- */

const ATTENDANCE_STATUSES = ["Present","Absent","Half Day","Leave","Vacation"];
const attendanceTone = (status) => status === "Present" ? "success" : status === "Absent" ? "danger" : status === "Half Day" ? "warning" : status === "Leave" ? "info" : status === "Vacation" ? "gold" : "neutral";

function HrPage({ state, dispatch, role, userId }) {
  const isAdmin = ADMIN_LIKE.includes(role) || role === "hr";
  const [tab, setTab] = useState(isAdmin ? "team" : "me");
  const [teamView, setTeamView] = useState("table");
  const [teamCategory, setTeamCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [docsFor, setDocsFor] = useState(null);
  const [leaveFor, setLeaveFor] = useState(null);
  const [attendanceFor, setAttendanceFor] = useState(null);
  const [punchFor, setPunchFor] = useState(null);
  const [viewCardFor, setViewCardFor] = useState(null);
  const [editHrFor, setEditHrFor] = useState(null);
  const [removeUserFor, setRemoveUserFor] = useState(null);

  const me = state.employees.find(e => e.id === userId);
  const today = daysFromNow(0);
  const onLeaveToday = (e) => state.leaveRequests.some(r => r.employeeId === e.id && r.status === "Approved" && r.startDate <= today && r.endDate >= today);
  const todayStatusOf = (e) => e.attendance.find(a => a.date === today)?.status || "Present";
  const onVacationToday = (e) => !onLeaveToday(e) && todayStatusOf(e) === "Vacation";

  const filtered = state.employees.filter(e => {
    if (teamCategory !== "All" && (e.category || "Staff") !== teamCategory) return false;
    const haystack = [e.name, e.dept, e.designation].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const pg = usePagination(filtered);

  const pendingCount = state.leaveRequests.filter(r => r.status === "Pending").length;
  const myPendingCount = state.leaveRequests.filter(r => r.status === "Pending" && r.employeeId === userId).length;
  const pendingPunchCount = state.punchRequests.filter(r => r.status === "Pending").length;
  const myPendingPunchCount = state.punchRequests.filter(r => r.status === "Pending" && r.employeeId === userId).length;
  const onLeaveCount = state.employees.filter(onLeaveToday).length;
  const onVacationCount = state.employees.filter(onVacationToday).length;
  const expiringDocsCount = state.employees.flatMap(e=>e.docs).filter(d => docState(d.expiry).label !== "Valid").length;

  return (
    <div>
      {isAdmin && (
        <div className="agw-grid" style={{ gridTemplateColumns: "repeat(5,1fr)", marginBottom: 18 }}>
          <div className="agw-card"><div className="kpi-label">Team members</div><div className="kpi-value disp">{state.employees.length}</div></div>
          <div className="agw-card"><div className="kpi-label">On leave today</div><div className="kpi-value disp">{onLeaveCount}</div></div>
          <div className="agw-card"><div className="kpi-label">On vacation today</div><div className="kpi-value disp">{onVacationCount}</div></div>
          <div className="agw-card"><div className="kpi-label">Pending leave requests</div><div className="kpi-value disp">{pendingCount}</div></div>
          <div className="agw-card"><div className="kpi-label">Documents expiring</div><div className="kpi-value disp">{expiringDocsCount}</div></div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:10 }}>
        <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
          <button className={`tab ${tab==="me"?"active":""}`} onClick={()=>setTab("me")}>Profile</button>
          {isAdmin && <button className={`tab ${tab==="team"?"active":""}`} onClick={()=>setTab("team")}>Team</button>}
          {isAdmin && <button className={`tab ${tab==="attendance"?"active":""}`} onClick={()=>setTab("attendance")}>Attendance</button>}
          <button className={`tab ${tab==="leave"?"active":""}`} onClick={()=>setTab("leave")}>
            {isAdmin ? "Leave requests" : "My leave requests"}
            {(isAdmin ? pendingCount : myPendingCount) > 0 && <span className="agw-nav-badge" style={{marginLeft:6}}>{isAdmin ? pendingCount : myPendingCount}</span>}
          </button>
          <button className={`tab ${tab==="punch"?"active":""}`} onClick={()=>setTab("punch")}>
            {isAdmin ? "Punch requests" : "My punch requests"}
            {(isAdmin ? pendingPunchCount : myPendingPunchCount) > 0 && <span className="agw-nav-badge" style={{marginLeft:6}}>{isAdmin ? pendingPunchCount : myPendingPunchCount}</span>}
          </button>
        </div>
      </div>

      {tab === "team" && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:10 }}>
          <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
            <button className={`tab ${teamCategory==="All"?"active":""}`} onClick={()=>setTeamCategory("All")}>All</button>
            <button className={`tab ${teamCategory==="Staff"?"active":""}`} onClick={()=>setTeamCategory("Staff")}>Staff</button>
            <button className={`tab ${teamCategory==="Management"?"active":""}`} onClick={()=>setTeamCategory("Management")}>Management</button>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
              <button className={`tab ${teamView==="table"?"active":""}`} onClick={()=>setTeamView("table")}>Table</button>
              <button className={`tab ${teamView==="card"?"active":""}`} onClick={()=>setTeamView("card")}>Card</button>
            </div>
            <button className="btn btn-sm" onClick={()=>setAttendanceFor(state.employees[0]?.id)}><CalendarClock size={13}/> Mark attendance</button>
            <div style={{ position:"relative", maxWidth: 260 }}>
              <Search size={15} style={{ position:"absolute", left:12, top:9, color:"var(--ink-soft)" }} />
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search team"
                style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"7px 12px 7px 34px", fontSize:13, background:"var(--surface)" }} />
            </div>
            <button className="btn btn-sm" onClick={()=>exportCSV("team.csv",
              ["Employee ID","Name","Category","Department","Designation","Nationality","Join Date","Date of Birth","Status","Leave Balance"],
              filtered.map(e=>[e.empCode||"", e.name, e.category||"Staff", e.dept, e.designation||"", e.nationality||"", e.joined||"", e.dateOfBirth||"", e.active===false?"Deactivated":"Active", e.leaveBalance ?? 21]))}>
              <Download size={13}/> Export
            </button>
          </div>
        </div>
      )}

      {tab === "me" && me && (
        <div style={{ maxWidth: 420 }}>
          <EmployeeHrCard e={me} state={state} dispatch={dispatch} isAdmin={isAdmin} userId={userId} onOpenDocs={()=>setDocsFor(me)} onOpenLeave={()=>setLeaveFor(me)} onMarkAttendance={()=>setAttendanceFor(me.id)} onRequestPunch={()=>setPunchFor(me)} />
        </div>
      )}

      {tab === "team" && teamView === "table" && (
        <div className="agw-card" style={{ padding: 0 }}>
          {filtered.length === 0 ? <Empty icon={Search} text="No team members match that search." /> : (
          <div style={{ overflowX:"auto" }}>
          <table className="agw-table" style={{ minWidth: 940 }}>
            <thead><tr><th>Employee</th><th>Category</th><th>Department</th><th>Designation</th><th>Join date</th><th>Date of birth</th><th>Today</th><th>Leave balance</th><th>Docs</th><th></th></tr></thead>
            <tbody>
              {pg.pageRows.map(e => {
                const status = onLeaveToday(e) ? "Leave" : todayStatusOf(e);
                const flagged = e.docs.filter(d => docState(d.expiry).label !== "Valid").length;
                return (
                  <tr key={e.id}>
                    <td style={{display:"flex",alignItems:"center",gap:8}}>
                      {e.photoUrl ? <img src={e.photoUrl} alt={e.name} style={{width:28,height:28,borderRadius:"50%",objectFit:"cover"}} /> : <span className="avatar">{e.initials}</span>}
                      {e.name}
                    </td>
                    <td><Stamp tone={e.category==="Management" ? "gold" : "neutral"}>{e.category||"Staff"}</Stamp></td>
                    <td>{e.dept}</td>
                    <td style={{fontSize:12.5}}>{e.designation}</td>
                    <td className="mono" style={{fontSize:12}}>{e.joined ? fmtDate(e.joined) : "—"}</td>
                    <td className="mono" style={{fontSize:12}}>{e.dateOfBirth ? fmtDate(e.dateOfBirth) : "—"}</td>
                    <td><Stamp tone={attendanceTone(status)}>{status}</Stamp></td>
                    <td>{e.leaveBalance}</td>
                    <td>{flagged > 0 ? <Stamp tone="warning">{flagged} flagged</Stamp> : <Stamp tone="success">Clear</Stamp>}</td>
                    <td style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                      <button className="btn btn-sm btn-ghost" onClick={()=>setViewCardFor(e)}>View</button>
                      <button className="btn btn-sm btn-ghost" onClick={()=>setDocsFor(e)}>Docs</button>
                      <button className="btn btn-sm btn-ghost" onClick={()=>setLeaveFor(e)}>Leave</button>
                      {isAdmin && <button className="btn btn-sm btn-ghost" onClick={()=>setAttendanceFor(e.id)}>Attendance</button>}
                      {isAdmin && <RowActions onEdit={()=>setEditHrFor(e)} onRemove={e.id!==userId ? ()=>setRemoveUserFor(e) : null} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>)}
          <PaginationBar {...pg} />
        </div>
      )}

      {tab === "team" && teamView === "card" && (
        <div>
        <div className="agw-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          {pg.pageRows.map(e => (
            <EmployeeHrCard key={e.id} e={e} state={state} dispatch={dispatch} isAdmin={isAdmin} userId={userId}
              onOpenDocs={()=>setDocsFor(e)} onOpenLeave={()=>setLeaveFor(e)} onMarkAttendance={()=>setAttendanceFor(e.id)} onRequestPunch={()=>setPunchFor(e)}
              onEditHr={isAdmin ? ()=>setEditHrFor(e) : null} onRemoveUser={isAdmin && e.id!==userId ? ()=>setRemoveUserFor(e) : null} />
          ))}
          {filtered.length === 0 && <Empty icon={Search} text="No team members match that search." />}
        </div>
        <PaginationBar {...pg} />
        </div>
      )}

      {tab === "leave" && <LeaveRequestsTable state={state} dispatch={dispatch} isAdmin={isAdmin} userId={userId} />}

      {tab === "punch" && <PunchRequestsTable state={state} dispatch={dispatch} isAdmin={isAdmin} userId={userId} />}

      {tab === "attendance" && isAdmin && <HrAttendanceReport state={state} dispatch={dispatch} onMarkAttendance={(id)=>setAttendanceFor(id)} />}

      {docsFor && <StaffDocsModal employee={docsFor} dispatch={dispatch} onClose={()=>setDocsFor(null)} />}
      {leaveFor && <LeaveRequestModal employee={leaveFor} dispatch={dispatch} onClose={()=>setLeaveFor(null)} />}
      {attendanceFor && <MarkAttendanceModal employees={state.employees} initialEmployeeId={attendanceFor} dispatch={dispatch} onClose={()=>setAttendanceFor(null)} />}
      {punchFor && <PunchRequestModal employee={punchFor} state={state} dispatch={dispatch} onClose={()=>setPunchFor(null)} />}
      {viewCardFor && (
        <Modal title={viewCardFor.name} sub={viewCardFor.designation || "HR card"} onClose={()=>setViewCardFor(null)} width={420}>
          <EmployeeHrCard e={viewCardFor} state={state} dispatch={dispatch} isAdmin={isAdmin} userId={userId}
            onOpenDocs={()=>setDocsFor(viewCardFor)} onOpenLeave={()=>setLeaveFor(viewCardFor)} onMarkAttendance={()=>setAttendanceFor(viewCardFor.id)} onRequestPunch={()=>setPunchFor(viewCardFor)}
            onEditHr={isAdmin ? ()=>setEditHrFor(viewCardFor) : null} onRemoveUser={isAdmin && viewCardFor.id!==userId ? ()=>setRemoveUserFor(viewCardFor) : null} />
        </Modal>
      )}
      {editHrFor && <EditHrDetailsModal employee={editHrFor} dispatch={dispatch} onClose={()=>setEditHrFor(null)} />}
      {removeUserFor && (
        <ConfirmModal title={`Remove ${removeUserFor.name}?`}
          body="This permanently deletes the user account. Consider Deactivate (in Users & Roles) instead if you might need this account again."
          onConfirm={()=>{ dispatch({type:"DELETE_USER", id:removeUserFor.id}); setRemoveUserFor(null); setViewCardFor(null); }}
          onClose={()=>setRemoveUserFor(null)} />
      )}
    </div>
  );
}

function EditHrDetailsModal({ employee: e, dispatch, onClose }) {
  const passportDoc = e.docs.find(d => d.type === "Passport");
  const qidDoc = e.docs.find(d => d.type === "QID");
  const visaDoc = e.docs.find(d => d.type === "Visa");
  const [form, setForm] = useState({
    designation: e.designation || "", dept: e.dept || "", category: e.category || "Staff",
    joinedDate: (e.joined || "").slice(0,10), dateOfBirth: (e.dateOfBirth || "").slice(0,10),
    nationality: e.nationality || "", empCode: e.empCode || "",
    qidType: e.qidType || "", mobileN: e.mobileN || "", mobileP: e.mobileP || "", mobileC: e.mobileC || "",
    passportNo: passportDoc?.number || "", passportExpiry: (passportDoc?.expiry || "").slice(0,10),
    qidNo: qidDoc?.number || "", qidExpiry: (qidDoc?.expiry || "").slice(0,10),
    visaNo: visaDoc?.number || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Passport/QID/Visa live in staff_docs (type/number/expiry), not on the user row itself — same
  // vault the "Documents" modal manages — so saving here upserts those rows instead of just
  // PATCHing users. Left blank (both number and expiry), a doc type is skipped rather than
  // creating an empty placeholder row.
  const upsertDoc = async (type, existing, number, expiry) => {
    const hasValue = (number && number.trim()) || (expiry && expiry.trim());
    if (!hasValue) return;
    if (existing) {
      if (existing.number !== number || (existing.expiry || "").slice(0,10) !== expiry) {
        await dispatch({ type:"UPDATE_EMPLOYEE_DOC", employeeId:e.id, docId:existing.id, payload:{ type, number, expiry, cloudLink: existing.cloudLink || "" } });
      }
    } else {
      await dispatch({ type:"ADD_EMPLOYEE_DOC", employeeId:e.id, doc:{ type, number, expiry, cloudLink:"" } });
    }
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const { passportNo, passportExpiry, qidNo, qidExpiry, visaNo, ...userFields } = form;
      await dispatch({ type:"UPDATE_USER", id:e.id, payload:userFields });
      await upsertDoc("Passport", passportDoc, passportNo, passportExpiry);
      await upsertDoc("QID", qidDoc, qidNo, qidExpiry);
      await upsertDoc("Visa", visaDoc, visaNo, "");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Edit HR details — ${e.name}`} onClose={onClose}>
      <div className="row2">
        <div className="field"><label>Designation (job title)</label><input value={form.designation} onChange={ev=>setForm({...form,designation:ev.target.value})} /></div>
        <div className="field"><label>Department</label><input value={form.dept} onChange={ev=>setForm({...form,dept:ev.target.value})} /></div>
      </div>
      <div className="field">
        <label>Category</label>
        <select value={form.category} onChange={ev=>setForm({...form,category:ev.target.value})}>
          <option value="Staff">Staff</option>
          <option value="Management">Management</option>
        </select>
      </div>
      <div className="row2">
        <div className="field"><label>Join date</label><input type="date" value={form.joinedDate} onChange={ev=>setForm({...form,joinedDate:ev.target.value})} /></div>
        <div className="field"><label>Date of birth</label><input type="date" value={form.dateOfBirth} onChange={ev=>setForm({...form,dateOfBirth:ev.target.value})} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Nationality</label><input value={form.nationality} onChange={ev=>setForm({...form,nationality:ev.target.value})} /></div>
        <div className="field"><label>Employee ID</label><input value={form.empCode} onChange={ev=>setForm({...form,empCode:ev.target.value})} placeholder="e.g. AGBS021" /></div>
      </div>
      <div className="field"><label>QID type</label><input value={form.qidType} onChange={ev=>setForm({...form,qidType:ev.target.value})} placeholder="e.g. Personal, AGBS, ABM" /></div>
      <div className="row3">
        <div className="field"><label>N Mobile</label><input value={form.mobileN} onChange={ev=>setForm({...form,mobileN:ev.target.value})} /></div>
        <div className="field"><label>P Mobile</label><input value={form.mobileP} onChange={ev=>setForm({...form,mobileP:ev.target.value})} /></div>
        <div className="field"><label>C Mobile</label><input value={form.mobileC} onChange={ev=>setForm({...form,mobileC:ev.target.value})} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Passport number</label><input value={form.passportNo} onChange={ev=>setForm({...form,passportNo:ev.target.value})} /></div>
        <div className="field"><label>Passport expiry</label><input type="date" value={form.passportExpiry} onChange={ev=>setForm({...form,passportExpiry:ev.target.value})} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>QID number</label><input value={form.qidNo} onChange={ev=>setForm({...form,qidNo:ev.target.value})} /></div>
        <div className="field"><label>QID expiry</label><input type="date" value={form.qidExpiry} onChange={ev=>setForm({...form,qidExpiry:ev.target.value})} /></div>
      </div>
      <div className="field"><label>Visa number</label><input value={form.visaNo} onChange={ev=>setForm({...form,visaNo:ev.target.value})} /></div>
      {error && <div className="side-note" style={{ color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{error}</div>}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </Modal>
  );
}

const WORKFLOW_STAGES = [
  { icon: Users, label: "Lead", desc: "A new prospect comes in — from a campaign, referral, or website enquiry." },
  { icon: Handshake, label: "Deal", desc: "The lead is qualified and converted into a deal, ready for a quotation." },
  { icon: FileText, label: "Quotation", desc: "A price quote is built and sent to the customer for approval." },
  { icon: ShoppingCart, label: "Sales Order", desc: "Once approved, the quotation becomes a confirmed sales order." },
  { icon: Receipt, label: "Invoice", desc: "The customer is billed against the sales order." },
  { icon: ClipboardList, label: "Job Card", desc: "Operations picks up the work and tracks it through to completion." },
];

// Step-by-step guides shown as a numbered list under "Tutorials" — plain data so a new one is
// just another entry here, not a new component.
const QUOTATION_TUTORIAL_STEPS = [
  { title: "Start the quotation", desc: "From an open Deal, click \"Create quotation\" — customer and service come pre-filled from the deal. Every quotation must start from an existing Deal now — there's no standalone \"New quotation\" anymore." },
  { title: "Pick the primary service", desc: "Choosing a service auto-loads that service's saved template (Quotation Templates), with its usual line items, terms, notes and bank details already filled in — edit anything that doesn't fit this particular job." },
  { title: "Check the line items", desc: "Each item has a Category/stage, a Qty, Rate and Discount %. Group items under the category label they belong to (e.g. everything under \"Government Fee\") — the quotation totals Government Fee and Professional Fee separately based on that grouping, so a line sitting in the wrong category throws the split off even though the grand total stays correct." },
  { title: "Assign the sales person (Admin only)", desc: "Admins see a \"Sales person\" dropdown when building a quotation, letting them attribute it to a different rep instead of always themselves or the deal's owner." },
  { title: "Fill in the rest", desc: "Subject, Notes, Terms & Conditions, an overall discount if one applies, and a bank details or footer note override if this quotation needs something non-standard." },
  { title: "Save it", desc: "Adding any discount (a line's or the overall one) routes the quotation to Pending Manager Approval automatically. No discount at all saves it as a plain Draft." },
  { title: "Edit it later if needed", desc: "Draft and Pending Manager Approval quotations stay editable — use the Edit (pencil) action in the Quotations list, or open the quotation and use Visual edit under its PDF preview tab." },
  { title: "Send it", desc: "Open the quotation and click \"Submit for approval\" or \"Send to client\" (whichever applies to your role and whether it has a discount), or \"Download PDF\" any time to see exactly what the client will receive." },
  { title: "Track what happens next", desc: "Status moves Draft → Sent → Client Accepted → Approved (or Rejected / Under Negotiation along the way). Once accepted, Accounts converts it into a Sales Order." },
];

// Common Standard Operating Procedure for onboarding an accepted client — applies to every
// service line (Step 6 is the one exception, Growth Partner Program only). Sourced from
// Client_Onboarding_SOP_3.docx.
const CLIENT_ONBOARDING_SOP_STEPS = [
  { step: "1. Client Accepted", role: "Sales Person", action: "Update the client status to “Client Accepted” after the client confirms the service." },
  { step: "2. Payment Status Update", role: "Accountant/Admin + CRO", action: "Verify and update payment status in the CRM. Confirm whether payment is pending, partial, or received." },
  { step: "3. Sales Order", role: "Accountant/Admin", action: "Create the Sales Order based on the approved quotation/service." },
  { step: "4. Record Payment", role: "Accountant/Admin", action: "Record the received payment accurately in the SMART CRM/Zoho." },
  { step: "5. Create Customer in Zoho Books", role: "Accountant/Admin", action: "Create or verify the customer record in Zoho with correct company and contact details." },
  { step: "6. Create Subscription *", role: "Accountant/Admin", action: "Create the recurring Subscription in Zoho, linking the correct plan and billing cycle. Applies to Growth Partner Program clients only — skip for other services." },
  { step: "7. Create Receipt", role: "Accountant/Admin", action: "Create and issue the official receipt against the recorded payment." },
  { step: "8. Create Job", role: "Accountant/Admin", action: "Create the job/task in the relevant CRM/Zoho workflow and assign the required internal action." },
  { step: "9. Documentation", role: "CRO", action: "Collect the required client documents and ensure all files are complete and properly named." },
  { step: "10. Documentation File", role: "CRO", action: "Maintain the client file containing quotation, client form, agreement, coupon details and supporting documents." },
  { step: "11. Thank-You Email", role: "Admin + CRO", action: "Once the signed agreement is on file and the receipt is issued, Admin and CRO jointly send a thank-you email to the client acknowledging their onboarding." },
  { step: "12. Onboarding Completed", role: "Admin + CRO", action: "Confirm payment, CRM records, Zoho customer, receipt, job and documentation are completed. Mark onboarding as completed." },
  { step: "13. Next-Step Follow-Up", role: "CRO", action: "After onboarding, CRO follows up with the client, coordinates the next operational step and keeps the client informed until the service progresses." },
];

const CLIENT_ONBOARDING_DOCS = [
  "Quotation / approved quotation",
  "Client information / client onboarding form",
  "Signed agreement / service agreement",
  "Coupon or promotion details, where applicable",
  "Payment confirmation / payment record",
  "Receipt",
  "Company and contact supporting documents, as applicable",
  "Subscription/plan agreement details (Growth Partner Program clients only)",
  "Any additional documents required for the specific service",
];

const CLIENT_ONBOARDING_ROLES = [
  { role: "Sales Person", responsibility: "Client acceptance, confirmation of service, and handover to Accountant/Admin and CRO." },
  { role: "Accountant/Admin", responsibility: "Payment status, Sales Order, payment recording, Zoho Books customer creation, subscription creation (Growth Partner Program clients), receipt creation and job creation." },
  { role: "CRO", responsibility: "Documentation, client file completion, coordination, communication and next-step follow-up." },
  { role: "Admin + CRO", responsibility: "Send the client a thank-you email once the signed agreement and receipt are confirmed; final onboarding verification and confirmation that the client is fully onboarded." },
];

const CLIENT_ONBOARDING_CHECKLIST = [
  "Client status changed to Client Accepted",
  "Payment status updated",
  "Sales Order created",
  "Payment recorded in CRM/Zoho",
  "Customer created/verified in Zoho",
  "Subscription created in Zoho (Growth Partner Program clients only)",
  "Receipt created and issued",
  "Job/task created and assigned",
  "Quotation filed",
  "Client form filed",
  "Agreement filed",
  "Coupon/promotion details filed, if applicable",
  "Supporting documents filed",
  "Thank-you email sent to client (after signature & receipt confirmed)",
  "Client onboarding marked Completed",
  "CRO assigned for next-step follow-up",
];

/** Basic "how it works" guide for HR — a graphical Lead-to-Job-Card workflow, plus step-by-step
 * tutorials, so new staff can understand the pipeline and specific tasks at a glance. More
 * sections/articles get added here later. */
// One entry per section below — the index card links here, and each section carries the matching
// id so a new guide only needs a new entry here plus an id on its card, nothing else to keep in sync.
const KB_SECTIONS = [
  { id: "kb-workflow", label: "The core workflow: Lead → Job Card" },
  { id: "kb-quotation-tutorial", label: "Tutorial: How to make a quotation" },
  { id: "kb-onboarding-sop", label: "SOP: Client Onboarding Process" },
];

function KnowledgeBasePage() {
  const goTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div>
      <div className="agw-card" style={{ marginBottom: 18 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <BookOpen size={18} />
          <strong style={{ fontSize:15.5 }}>How to use SMART CRM</strong>
        </div>
        <div style={{ fontSize:13, color:"var(--ink-soft)", lineHeight:1.6, marginBottom:14 }}>
          A quick look at how work flows through the system, from the moment a lead comes in to the job card
          that closes it out. More guides will be added here over time.
        </div>
        <div style={{ fontSize:11.5, fontWeight:600, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em", marginBottom:6 }}>
          On this page
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
          {KB_SECTIONS.map((s, i) => (
            <button key={s.id} onClick={()=>goTo(s.id)}
              style={{ display:"flex", alignItems:"center", gap:8, textAlign:"left", padding:"6px 8px", border:"none",
                background:"transparent", borderRadius:6, cursor:"pointer", font:"inherit", fontSize:13, color:"var(--brand)" }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--page)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span className="mono" style={{ fontSize:11, color:"var(--ink-soft)" }}>{i+1}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="agw-card" style={{ marginBottom: 18 }} id="kb-workflow">
        <strong style={{ fontSize:14 }}>The core workflow: Lead → Job Card</strong>
        <div style={{ display:"flex", alignItems:"stretch", flexWrap:"wrap", gap:0, marginTop:16 }}>
          {WORKFLOW_STAGES.map((s, i) => (
            <React.Fragment key={s.label}>
              <div style={{ flex:"1 1 150px", minWidth:150, background:"var(--page)", borderRadius:8, padding:"14px 12px", textAlign:"center" }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:"var(--brand-tint)", color:"var(--brand)",
                  display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 8px" }}>
                  <s.icon size={17} />
                </div>
                <div style={{ fontWeight:600, fontSize:13 }}>{s.label}</div>
                <div style={{ fontSize:11.5, color:"var(--ink-soft)", marginTop:4, lineHeight:1.4 }}>{s.desc}</div>
              </div>
              {i < WORKFLOW_STAGES.length - 1 && (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:"0 0 28px", color:"var(--ink-soft)" }}>
                  <ArrowRight size={16} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="agw-card" id="kb-quotation-tutorial">
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <ListChecks size={17} />
          <strong style={{ fontSize:14 }}>Tutorial: How to make a quotation</strong>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {QUOTATION_TUTORIAL_STEPS.map((s, i) => (
            <div key={s.title} style={{ display:"flex", gap:12 }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background:"var(--brand)", color:"#fff",
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:12.5, fontWeight:600, flexShrink:0 }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontWeight:600, fontSize:13 }}>{s.title}</div>
                <div style={{ fontSize:12.5, color:"var(--ink-soft)", marginTop:2, lineHeight:1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="side-note" style={{ marginTop:16 }}>
          <AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>
          Government Fee quotations (the whole document, not just a line item) are for viewing and sharing as a
          PDF only — they're excluded from business volume/incentive calculations and never create a Sales
          Order, Invoice or Job Card.
        </div>
      </div>

      <div className="agw-card" style={{ marginTop:18 }} id="kb-onboarding-sop">
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <FileText size={17} />
          <strong style={{ fontSize:14.5 }}>SOP: Client Onboarding Process</strong>
        </div>
        <div style={{ fontSize:12.5, color:"var(--ink-soft)", lineHeight:1.6, marginBottom:14 }}>
          Common Standard Operating Procedure — applies to every service line, including the Growth Partner Program.
          <br/><strong>Purpose:</strong> ensure every accepted client is properly recorded, paid, documented, created in Zoho,
          assigned a job, and handed over for structured follow-up.
          <br/><strong>Scope:</strong> common to all services — a small number of steps apply only to a specific service, marked
          accordingly below, and should be skipped for other services.
        </div>

        <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>1. Detailed Client Onboarding Procedure</div>
        <div style={{ overflowX:"auto", marginBottom:16 }}>
          <table className="agw-table">
            <thead><tr><th style={{width:170}}>Step</th><th style={{width:140}}>Responsible</th><th>Required Action</th></tr></thead>
            <tbody>
              {CLIENT_ONBOARDING_SOP_STEPS.map(s => (
                <tr key={s.step}>
                  <td style={{ fontWeight:500 }}>{s.step}</td>
                  <td style={{ fontSize:12.5, color:"var(--ink-soft)" }}>{s.role}</td>
                  <td style={{ fontSize:12.5 }}>{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize:11.5, color:"var(--ink-soft)", marginBottom:16 }}>
          * Step 6 (Create Subscription) applies only to Growth Partner Program clients. All other steps are identical across every service.
        </div>

        <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>2. Required Client Documentation</div>
        <ul style={{ margin:"0 0 16px", paddingLeft:20, fontSize:12.5, lineHeight:1.9 }}>
          {CLIENT_ONBOARDING_DOCS.map(d => <li key={d}>{d}</li>)}
        </ul>

        <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>3. Roles & Responsibilities</div>
        <div style={{ overflowX:"auto", marginBottom:16 }}>
          <table className="agw-table">
            <thead><tr><th style={{width:170}}>Role</th><th>Responsibility</th></tr></thead>
            <tbody>
              {CLIENT_ONBOARDING_ROLES.map(r => (
                <tr key={r.role}>
                  <td style={{ fontWeight:500 }}>{r.role}</td>
                  <td style={{ fontSize:12.5 }}>{r.responsibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>4. Onboarding Completion Checklist</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:"4px 16px", marginBottom:16 }}>
          {CLIENT_ONBOARDING_CHECKLIST.map(c => (
            <div key={c} style={{ display:"flex", alignItems:"flex-start", gap:7, fontSize:12.5 }}>
              <span style={{ width:14, height:14, border:"1.5px solid var(--hair)", borderRadius:3, flexShrink:0, marginTop:2 }} />
              {c}
            </div>
          ))}
        </div>

        <div className="side-note">
          <AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>
          <strong>Control Rule:</strong> a client should not be marked as "Client Onboarded – Completed" until the required
          payment, CRM/Zoho records, receipt, job creation, documentation file and client thank-you email are completed.
          Once onboarding is completed, the CRO becomes responsible for continuous follow-up and coordination.
        </div>
      </div>
    </div>
  );
}

function HrAttendanceReport({ state, dispatch, onMarkAttendance }) {
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range } = usePeriod("month");

  const rows = state.employees.map(e => {
    const inPeriod = (e.attendance||[]).filter(a => inRange(a.date, range));
    const present = inPeriod.filter(a=>a.status==="Present").length;
    const absent = inPeriod.filter(a=>a.status==="Absent").length;
    const halfDay = inPeriod.filter(a=>a.status==="Half Day").length;
    const leave = inPeriod.filter(a=>a.status==="Leave").length;
    const vacation = inPeriod.filter(a=>a.status==="Vacation").length;
    const marked = inPeriod.length;
    const rate = marked > 0 ? Math.round(((present + halfDay*0.5) / marked) * 100) : null;
    return { e, present, absent, halfDay, leave, vacation, marked, rate };
  });

  const totalPresent = rows.reduce((a,r)=>a+r.present,0);
  const totalAbsent = rows.reduce((a,r)=>a+r.absent,0);
  const totalLeave = rows.reduce((a,r)=>a+r.leave+r.vacation,0);
  const avgRate = rows.filter(r=>r.rate!==null).length > 0
    ? Math.round(rows.filter(r=>r.rate!==null).reduce((a,r)=>a+r.rate,0) / rows.filter(r=>r.rate!==null).length) : 0;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <PeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
      </div>

      <ReportKpis items={[
        { label:"Present days", value: totalPresent },
        { label:"Absent days", value: totalAbsent },
        { label:"Leave/Vacation days", value: totalLeave },
        { label:"Avg attendance rate", value: `${avgRate}%` },
      ]} />

      <ReportTableCard title="Attendance by team member"
        onExport={()=>exportCSV("attendance.csv", ["Name","Department","Present","Absent","Half Day","Leave","Vacation","Marked days","Attendance rate"],
          rows.map(r=>[r.e.name, r.e.dept, r.present, r.absent, r.halfDay, r.leave, r.vacation, r.marked, r.rate!==null ? `${r.rate}%` : "—"]))}>
        <table className="agw-table">
          <thead><tr><th>User</th><th>Department</th><th>Present</th><th>Absent</th><th>Half Day</th><th>Leave</th><th>Vacation</th><th>Rate</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.e.id}>
                <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{r.e.initials}</span>{r.e.name}</td>
                <td>{r.e.dept}</td>
                <td>{r.present}</td>
                <td>{r.absent}</td>
                <td>{r.halfDay}</td>
                <td>{r.leave}</td>
                <td>{r.vacation}</td>
                <td>{r.rate!==null ? <Stamp tone={r.rate>=90?"success":r.rate>=70?"warning":"danger"}>{r.rate}%</Stamp> : <span className="pill">No data</span>}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={()=>onMarkAttendance(r.e.id)}>Mark</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

function EmployeeHrCard({ e, state, dispatch, isAdmin, userId, onOpenDocs, onOpenLeave, onMarkAttendance, onRequestPunch, onEditHr, onRemoveUser }) {
  const today = daysFromNow(0);
  const todayEntry = e.attendance.find(a => a.date === today);
  const todayStatus = todayEntry?.status || "Present";
  const onLeaveToday = state.leaveRequests.some(r => r.employeeId === e.id && r.status === "Approved" && r.startDate <= today && r.endDate >= today);
  const status = onLeaveToday ? "Leave" : todayStatus;
  const flagged = e.docs.filter(d => docState(d.expiry).label !== "Valid");
  const incentive = computeIncentive(e, state);
  const isSelf = e.id === userId;
  const canEditPhoto = isAdmin || isSelf;

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const handlePhotoChange = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await dispatch({ type:"SET_EMPLOYEE_PHOTO", employeeId: e.id, file });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't upload photo — please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="agw-card">
      {(onEditHr || onRemoveUser) && (
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:4 }}>
          <RowActions onEdit={onEditHr} onRemove={onRemoveUser} />
        </div>
      )}
      <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
        <div style={{ position:"relative", width:48, height:48, flexShrink:0 }}>
          {e.photoUrl ? (
            <img src={e.photoUrl} alt={e.name} style={{ width:48, height:48, borderRadius:"50%", objectFit:"cover", display:"block" }} />
          ) : (
            <div className="avatar" style={{ width:48, height:48, fontSize:16 }}>{e.initials}</div>
          )}
          {canEditPhoto && (
            <label style={{ position:"absolute", bottom:-2, right:-2, width:18, height:18, borderRadius:"50%", background:"var(--brand)",
              display:"flex", alignItems:"center", justifyContent:"center", cursor: uploadingPhoto ? "wait" : "pointer", border:"1.5px solid #fff", opacity: uploadingPhoto ? 0.6 : 1 }} title="Update profile photo">
              <Camera size={10} color="#fff" />
              <input type="file" accept="image/*" style={{ display:"none" }} onChange={handlePhotoChange} disabled={uploadingPhoto} />
            </label>
          )}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <strong style={{ fontSize:14.5 }}>{e.name}</strong>{e.empCode && <span className="mono" style={{ fontSize:11, color:"var(--ink-soft)", marginLeft:6 }}>{e.empCode}</span>}
          <div style={{ fontSize:12, color:"var(--ink-soft)" }}>{e.designation}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <Stamp tone={attendanceTone(status)}>{status}</Stamp>
          {isAdmin && <div><button className="btn btn-sm btn-ghost" style={{ fontSize:11, padding:"2px 6px", marginTop:4 }} onClick={()=>onMarkAttendance(e)}>Change</button></div>}
        </div>
      </div>

      {todayEntry?.inTime && (
        <div style={{ fontSize:11, color:"var(--ink-soft)", marginTop:8 }}>
          Punched in {todayEntry.inTime}{todayEntry.outTime ? ` · out ${todayEntry.outTime}` : " · not punched out yet"}
        </div>
      )}

      <div className="row2" style={{ marginTop: 12 }}>
        <div style={{ background:"var(--page)", borderRadius:8, padding:"8px 10px" }}>
          <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Incentive earned</div>
          <div className="disp" style={{ fontSize:15, color:"var(--gold)" }}>{money(incentive)}</div>
        </div>
        <div style={{ background:"var(--page)", borderRadius:8, padding:"8px 10px" }}>
          <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Leave balance</div>
          <div className="disp" style={{ fontSize:15 }}>{e.leaveBalance ?? 21} days</div>
        </div>
      </div>

      <div className="row2" style={{ marginTop: 8 }}>
        <div style={{ background:"var(--page)", borderRadius:8, padding:"8px 10px" }}>
          <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Join date</div>
          <div style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{e.joined ? fmtDate(e.joined) : "—"}</div>
        </div>
        <div style={{ background:"var(--page)", borderRadius:8, padding:"8px 10px" }}>
          <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Date of birth</div>
          <div style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{e.dateOfBirth ? fmtDate(e.dateOfBirth) : "—"}</div>
        </div>
      </div>

      <div className="row2" style={{ marginTop: 8 }}>
        <div style={{ background:"var(--page)", borderRadius:8, padding:"8px 10px" }}>
          <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Nationality</div>
          <div style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{e.nationality || "—"}</div>
        </div>
        <div style={{ background:"var(--page)", borderRadius:8, padding:"8px 10px" }}>
          <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>QID type</div>
          <div style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{e.qidType || "—"}</div>
        </div>
      </div>
      {(e.mobileN || e.mobileP || e.mobileC) && (
        <div style={{ marginTop: 8 }}>
          <div style={{ background:"var(--page)", borderRadius:8, padding:"8px 10px" }}>
            <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>Mobile numbers</div>
            <div style={{ fontSize:12.5, marginTop:2, display:"flex", gap:14, flexWrap:"wrap" }}>
              {e.mobileN && <span>N: <span className="mono">{e.mobileN}</span></span>}
              {e.mobileP && <span>P: <span className="mono">{e.mobileP}</span></span>}
              {e.mobileC && <span>C: <span className="mono">{e.mobileC}</span></span>}
            </div>
          </div>
        </div>
      )}

      {(() => {
        const passportDoc = e.docs.find(d => d.type === "Passport");
        const qidDoc = e.docs.find(d => d.type === "QID");
        const visaDoc = e.docs.find(d => d.type === "Visa");
        if (!passportDoc && !qidDoc && !visaDoc) return null;
        const row = (label, doc) => doc && (
          <div style={{ background:"var(--page)", borderRadius:8, padding:"8px 10px" }}>
            <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em" }}>{label}</div>
            <div style={{ fontSize:13, fontWeight:500, marginTop:2 }}>{doc.number || "—"}</div>
            {doc.expiry && (
              <div style={{ fontSize:11, marginTop:2, display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ color:"var(--ink-soft)" }}>Exp {fmtDate(doc.expiry)}</span>
                <Stamp tone={docState(doc.expiry).cls.replace("stamp-","")}>{docState(doc.expiry).label}</Stamp>
              </div>
            )}
          </div>
        );
        return (
          <div style={{ marginTop: 8, display:"flex", flexDirection:"column", gap:8 }}>
            {(passportDoc || qidDoc) && (
              <div className="row2">
                {row("Passport", passportDoc)}
                {row("QID", qidDoc)}
              </div>
            )}
            {visaDoc && row("Visa", visaDoc)}
          </div>
        );
      })()}

      <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8, background:"var(--page)", borderRadius:8, padding:"8px 10px" }}>
        <div style={{ fontSize:10.5, color:"var(--ink-soft)", textTransform:"uppercase", letterSpacing:".03em", flexShrink:0 }}>Google Cloud</div>
        {isAdmin ? (
          <CloudLinkButton url={e.cloudLink} onSave={(url)=>dispatch({type:"SET_USER_CLOUD_LINK", employeeId:e.id, url})} />
        ) : e.cloudLink ? (
          <a href={e.cloudLink} target="_blank" rel="noreferrer" className="pill" style={{ display:"inline-flex", alignItems:"center", gap:4, color:"var(--info)", textDecoration:"none" }}>
            <Link2 size={11}/> Cloud file
          </a>
        ) : <span style={{ fontSize:12, color:"var(--ink-soft)" }}>—</span>}
      </div>

      <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
        <button className="btn btn-sm" style={{ flex:1 }} onClick={onOpenDocs}>
          Documents ({e.docs.length}{flagged.length>0 && <span style={{color:"var(--warning)"}}> · {flagged.length} flagged</span>})
        </button>
        <button className="btn btn-sm" style={{ flex:1 }} onClick={onOpenLeave}>Request leave</button>
        <button className="btn btn-sm" style={{ flex:1 }} onClick={onRequestPunch}>Missing punch?</button>
      </div>
    </div>
  );
}

function LeaveRequestsTable({ state, dispatch, isAdmin, userId }) {
  const [removeReq, setRemoveReq] = useState(null);
  const confirm = useConfirm();
  const nameFor = (id) => state.employees.find(e=>e.id===id)?.name || id;
  const rows = isAdmin ? state.leaveRequests : state.leaveRequests.filter(r => r.employeeId === userId);

  return (
    <div className="agw-card" style={{ padding: 0 }}>
      {rows.length === 0 ? <Empty icon={CalendarClock} text={isAdmin ? "No leave requests yet." : "You haven't requested any leave yet."} /> : (
      <table className="agw-table">
        <thead><tr>{isAdmin && <th>Employee</th>}<th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              {isAdmin && <td>{nameFor(r.employeeId)}</td>}
              <td><span className="pill">{r.type}</span></td>
              <td className="mono" style={{fontSize:12}}>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
              <td style={{ fontSize:12.5, color:"var(--ink-soft)", maxWidth:200 }}>{r.reason || "—"}</td>
              <td><Stamp tone={r.status==="Approved"?"success":r.status==="Rejected"?"danger":"warning"}>{r.status}</Stamp></td>
              <td style={{ display:"flex", gap:6 }}>
                {isAdmin && r.status === "Pending" && <>
                  <button className="btn btn-sm" onClick={()=>dispatch({type:"UPDATE_LEAVE_STATUS", id:r.id, status:"Approved", decidedBy:"HR"})}>Approve</button>
                  <button className="btn btn-sm" style={{color:"var(--danger)"}} onClick={async ()=>{
                    if (await confirm({ title:"Reject this leave request?", body:`${nameFor(r.employeeId)} — ${r.type}, ${fmtDate(r.startDate)} to ${fmtDate(r.endDate)}.`, confirmLabel:"Reject" }))
                      dispatch({type:"UPDATE_LEAVE_STATUS", id:r.id, status:"Rejected", decidedBy:"HR"});
                  }}>Reject</button>
                </>}
                {(isAdmin || r.status === "Pending") && <RowActions onRemove={()=>setRemoveReq(r)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>)}
      {removeReq && <ConfirmModal title="Remove this leave request?" body={`${nameFor(removeReq.employeeId)} — ${removeReq.type}, ${fmtDate(removeReq.startDate)} to ${fmtDate(removeReq.endDate)}.`}
        onConfirm={()=>dispatch({type:"DELETE_LEAVE_REQUEST", id:removeReq.id})} onClose={()=>setRemoveReq(null)} />}
    </div>
  );
}

function MarkAttendanceModal({ employees, initialEmployeeId, dispatch, onClose }) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId || employees[0]?.id || "");
  const today = daysFromNow(0);
  const emp = employees.find(x => x.id === employeeId);
  const currentStatus = emp?.attendance.find(a => a.date === today)?.status || "Present";

  return (
    <Modal title="Mark attendance" sub={`Today — ${fmtDate(today)}. Defaults to Present unless changed.`} onClose={onClose}>
      <div className="field"><label>Team member</label>
        <select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
          {employees.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      {emp && (
        <>
          <div style={{ fontSize:12.5, color:"var(--ink-soft)", marginBottom:10 }}>Current status: <Stamp tone={attendanceTone(currentStatus)}>{currentStatus}</Stamp></div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {ATTENDANCE_STATUSES.map(s => (
              <button key={s} className="btn" style={{
                  background: currentStatus===s ? "var(--brand)" : "var(--surface)", color: currentStatus===s ? "#fff" : "var(--ink)",
                  borderColor: currentStatus===s ? "var(--brand)" : "var(--hair)" }}
                onClick={()=>dispatch({type:"MARK_ATTENDANCE", employeeId: emp.id, date:today, status:s, by:"HR"})}>{s}</button>
            ))}
          </div>
        </>
      )}
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:18 }}>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function LeaveRequestModal({ employee: e, dispatch, onClose }) {
  const [form, setForm] = useState({ type:"Annual", startDate: daysFromNow(1), endDate: daysFromNow(2), reason:"" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const submit = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await dispatch({type:"ADD_LEAVE_REQUEST", payload:{...form, employeeId:e.id}});
      onClose();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't submit — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Request leave — ${e.name}`} onClose={onClose}>
      <div className="row2">
        <div className="field"><label>Type</label>
          <select value={form.type} onChange={ev=>setForm({...form,type:ev.target.value})}>
            {["Annual","Sick","Unpaid","Emergency"].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div />
      </div>
      <div className="row2">
        <div className="field"><label>Start date</label><input type="date" value={form.startDate} onChange={ev=>setForm({...form,startDate:ev.target.value})} /></div>
        <div className="field"><label>End date</label><input type="date" value={form.endDate} onChange={ev=>setForm({...form,endDate:ev.target.value})} /></div>
      </div>
      <div className="field"><label>Reason</label><textarea rows={2} value={form.reason} onChange={ev=>setForm({...form,reason:ev.target.value})} placeholder="Optional" /></div>
      {saveError && <div className="side-note" style={{ color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{saveError}</div>}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? "Submitting…" : "Submit request"}</button>
      </div>
    </Modal>
  );
}

// A missed punch on date D can only be reported up to 11:30 AM local time on D+1.
function punchRequestDeadline(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y, m-1, d+1, 11, 30, 0, 0);
}
const isPastPunchDeadline = (dateStr) => new Date() > punchRequestDeadline(dateStr);
const PUNCH_REQUEST_MONTHLY_LIMIT = 3;

function PunchRequestModal({ employee: e, state, dispatch, onClose }) {
  const [form, setForm] = useState({ date: daysFromNow(0), inTime:"09:00", outTime:"18:00", reason:"" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const usedThisMonth = state.punchRequests.filter(r => r.employeeId===e.id && (r.requestedAt||"").startsWith(ym)).length;
  const limitReached = usedThisMonth >= PUNCH_REQUEST_MONTHLY_LIMIT;
  const futureDate = form.date > daysFromNow(0);
  const pastDeadline = !futureDate && isPastPunchDeadline(form.date);
  const canSubmit = !limitReached && !pastDeadline && !futureDate && form.reason.trim();

  const submit = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await dispatch({type:"ADD_PUNCH_REQUEST", payload:{...form, employeeId:e.id}});
      onClose();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't submit — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Request punch correction — ${e.name}`} sub="Report a missing or incorrect punch in/out for a specific day." onClose={onClose}>
      {limitReached ? (
        <div className="side-note" style={{ marginTop:0, borderColor:"#EFC3BC", background:"var(--danger-tint)" }}>
          <AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>You've used all {PUNCH_REQUEST_MONTHLY_LIMIT} punch correction requests allowed this month ({usedThisMonth}/{PUNCH_REQUEST_MONTHLY_LIMIT}). Try again next month.
        </div>
      ) : (
        <div className="side-note" style={{ marginTop:0 }}>{usedThisMonth}/{PUNCH_REQUEST_MONTHLY_LIMIT} requests used this month. Must be submitted by 11:30 AM the day after the missed punch.</div>
      )}
      <div className="field"><label>Date</label><input type="date" max={daysFromNow(0)} value={form.date} onChange={ev=>setForm({...form,date:ev.target.value})} disabled={limitReached} /></div>
      {!limitReached && pastDeadline && (
        <div className="side-note" style={{ marginTop:0, borderColor:"#EFC3BC", background:"var(--danger-tint)" }}>
          <AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>Too late to request for this date — the window closed at 11:30 AM the next day.
        </div>
      )}
      <div className="row2">
        <div className="field"><label>Punch in</label><input type="time" value={form.inTime} onChange={ev=>setForm({...form,inTime:ev.target.value})} disabled={limitReached} /></div>
        <div className="field"><label>Punch out</label><input type="time" value={form.outTime} onChange={ev=>setForm({...form,outTime:ev.target.value})} disabled={limitReached} /></div>
      </div>
      <div className="field"><label>Reason</label><textarea rows={2} value={form.reason} onChange={ev=>setForm({...form,reason:ev.target.value})} placeholder="e.g. Forgot to mark attendance, was on-site at a client visit..." disabled={limitReached} /></div>
      {saveError && <div className="side-note" style={{ color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{saveError}</div>}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!canSubmit || saving} onClick={submit}>{saving ? "Submitting…" : "Submit request"}</button>
      </div>
    </Modal>
  );
}

function PunchRequestsTable({ state, dispatch, isAdmin, userId }) {
  const [removeReq, setRemoveReq] = useState(null);
  const confirm = useConfirm();
  const nameFor = (id) => state.employees.find(e=>e.id===id)?.name || id;
  const rows = isAdmin ? state.punchRequests : state.punchRequests.filter(r => r.employeeId === userId);

  return (
    <div className="agw-card" style={{ padding: 0 }}>
      {rows.length === 0 ? <Empty icon={CalendarClock} text={isAdmin ? "No punch correction requests yet." : "You haven't requested any punch corrections yet."} /> : (
      <table className="agw-table">
        <thead><tr>{isAdmin && <th>Employee</th>}<th>Date</th><th>Punch in</th><th>Punch out</th><th>Reason</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              {isAdmin && <td>{nameFor(r.employeeId)}</td>}
              <td className="mono" style={{fontSize:12}}>{fmtDate(r.date)}</td>
              <td className="mono">{r.inTime || "—"}</td>
              <td className="mono">{r.outTime || "—"}</td>
              <td style={{ fontSize:12.5, color:"var(--ink-soft)", maxWidth:220 }}>{r.reason || "—"}</td>
              <td><Stamp tone={r.status==="Approved"?"success":r.status==="Rejected"?"danger":"warning"}>{r.status}</Stamp></td>
              <td style={{ display:"flex", gap:6 }}>
                {isAdmin && r.status === "Pending" && <>
                  <button className="btn btn-sm" onClick={()=>dispatch({type:"UPDATE_PUNCH_REQUEST_STATUS", id:r.id, status:"Approved", decidedBy:"HR"})}>Approve</button>
                  <button className="btn btn-sm" style={{color:"var(--danger)"}} onClick={async ()=>{
                    if (await confirm({ title:"Reject this punch correction?", body:`${nameFor(r.employeeId)} — ${fmtDate(r.date)}.`, confirmLabel:"Reject" }))
                      dispatch({type:"UPDATE_PUNCH_REQUEST_STATUS", id:r.id, status:"Rejected", decidedBy:"HR"});
                  }}>Reject</button>
                </>}
                {(isAdmin || r.status === "Pending") && <RowActions onRemove={()=>setRemoveReq(r)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>)}
      {removeReq && <ConfirmModal title="Remove this punch request?" body={`${nameFor(removeReq.employeeId)} — ${fmtDate(removeReq.date)}.`}
        onConfirm={()=>dispatch({type:"DELETE_PUNCH_REQUEST", id:removeReq.id})} onClose={()=>setRemoveReq(null)} />}
    </div>
  );
}

function StaffDocsModal({ employee: e, dispatch, onClose }) {
  const blankDoc = { type:"Qatar ID", number:"", expiry: daysFromNow(365), cloudLink:"" };
  const [doc, setDoc] = useState(blankDoc);
  const [editingId, setEditingId] = useState(null);
  const [removeDoc, setRemoveDoc] = useState(null);

  const startEdit = (d) => { setEditingId(d.id); setDoc({ type:d.type, number:d.number, expiry:d.expiry, cloudLink:d.cloudLink||"" }); };
  const cancelEdit = () => { setEditingId(null); setDoc(blankDoc); };
  const save = () => {
    if (editingId) dispatch({type:"UPDATE_EMPLOYEE_DOC", employeeId:e.id, docId:editingId, payload:doc});
    else dispatch({type:"ADD_EMPLOYEE_DOC", employeeId:e.id, doc});
    cancelEdit();
  };

  return (
    <Modal title={`Documents — ${e.name}`} sub="Staff document vault" onClose={onClose} width={640}>
      <table className="agw-table">
        <thead><tr><th>Document</th><th>Number</th><th>Expiry</th><th>Status</th><th>Cloud copy</th><th></th></tr></thead>
        <tbody>
          {e.docs.map(d => {
            const st = docState(d.expiry);
            return <tr key={d.id}>
              <td>{d.type}</td><td className="mono">{d.number}</td><td className="mono" style={{fontSize:12}}>{fmtDate(d.expiry)}</td>
              <td><Stamp tone={st.cls.replace("stamp-","")}>{st.label}</Stamp></td>
              <td><CloudLinkButton url={d.cloudLink} onSave={(url)=>dispatch({type:"SET_STAFF_DOC_CLOUD_LINK", employeeId:e.id, docId:d.id, url})} /></td>
              <td><RowActions onEdit={()=>startEdit(d)} onRemove={()=>setRemoveDoc(d)} /></td>
            </tr>;
          })}
          {e.docs.length === 0 && <tr><td colSpan={6} style={{color:"var(--ink-soft)"}}>No documents on file yet.</td></tr>}
        </tbody>
      </table>

      <div className="agw-card" style={{ marginTop: 16 }}>
        <strong style={{ fontSize:13 }}>{editingId ? "Edit document" : "Add document"}</strong>
        <div className="row3" style={{ marginTop: 10 }}>
          <div className="field"><label>Type</label><input value={doc.type} onChange={ev=>setDoc({...doc,type:ev.target.value})} /></div>
          <div className="field"><label>Number</label><input value={doc.number} onChange={ev=>setDoc({...doc,number:ev.target.value})} /></div>
          <div className="field"><label>Expiry</label><input type="date" value={doc.expiry} onChange={ev=>setDoc({...doc,expiry:ev.target.value})} /></div>
        </div>
        <div className="field"><label>Cloud storage link (optional)</label><input value={doc.cloudLink} onChange={ev=>setDoc({...doc,cloudLink:ev.target.value})} placeholder="Google Drive / OneDrive / SharePoint link" /></div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-primary btn-sm" onClick={save}>{editingId ? "Save changes" : "Add document"}</button>
          {editingId && <button className="btn btn-sm" onClick={cancelEdit}>Cancel</button>}
        </div>
      </div>

      {removeDoc && <ConfirmModal title={`Remove ${removeDoc.type}?`} body="This document will be removed from the staff record." onConfirm={()=>dispatch({type:"DELETE_EMPLOYEE_DOC", employeeId:e.id, docId:removeDoc.id})} onClose={()=>setRemoveDoc(null)} />}
    </Modal>
  );
}


/* ---------------------------------------------------------------------- */
/* USERS & ROLES (ADMIN)                                                   */
/* ---------------------------------------------------------------------- */

function UsersPage({ state, dispatch, role }) {
  const [tab, setTab] = useState("users");
  const blank = { name:"", email:"", password:"", roles:["sales_exec"], dept:"Sales", initials:"", joinedDate: daysFromNow(0), dateOfBirth:"", designation:"", category:"Staff" };
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [removeUser, setRemoveUser] = useState(null);
  const [form, setForm] = useState(blank);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const toggleRole = (r) => setForm(f => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter(x=>x!==r) : [...f.roles, r] }));
  const [query, setQuery] = useState("");
  const visibleUsers = state.employees.filter(e => [e.name, e.dept, e.designation, e.email].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const pg = usePagination(visibleUsers);

  const openEdit = (e) => { setEditUser(e); setForm({ name:e.name, email:e.email||"", password:"", roles:e.roles, dept:e.dept, initials:e.initials, joinedDate: (e.joined||"").slice(0,10), dateOfBirth: (e.dateOfBirth||"").slice(0,10), designation:e.designation||"", category:e.category||"Staff" }); setSaveError(""); };
  const closeModal = () => { setShowAdd(false); setEditUser(null); setForm(blank); setSaveError(""); };

  // Not fire-and-forget: a rejected dispatch (e.g. "email already in use") used to be silently
  // swallowed while the modal closed anyway, making a failed save look like it had succeeded.
  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      if (editUser) {
        const payload = { name: form.name, email: form.email, roles: form.roles, dept: form.dept, initials: form.initials, joinedDate: form.joinedDate, dateOfBirth: form.dateOfBirth, designation: form.designation, category: form.category };
        await dispatch({type:"UPDATE_USER", id:editUser.id, payload});
        if (form.password) await dispatch({type:"RESET_USER_PASSWORD", id:editUser.id, password: form.password});
      } else {
        await dispatch({type:"ADD_USER", payload:form});
      }
      closeModal();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14, flexWrap:"wrap", gap:10 }}>
        <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
          <button className={`tab ${tab==="users"?"active":""}`} onClick={()=>setTab("users")}>Users</button>
          <button className={`tab ${tab==="access"?"active":""}`} onClick={()=>setTab("access")}>Module Access</button>
          <button className={`tab ${tab==="approval"?"active":""}`} onClick={()=>setTab("approval")}>Approval Process Workflow</button>
        </div>
        {tab === "users" && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ position:"relative", maxWidth: 260 }}>
              <Search size={15} style={{ position:"absolute", left:12, top:9, color:"var(--ink-soft)" }} />
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search users"
                style={{ width:"100%", border:"1px solid var(--hair)", borderRadius:8, padding:"7px 12px 7px 34px", fontSize:13, background:"var(--surface)" }} />
            </div>
            <button className="btn btn-sm" onClick={()=>exportCSV("users.csv",
              ["Name","Email","Designation","Roles","Category","Department","Status"],
              visibleUsers.map(e=>[e.name, e.email||"", e.designation||"", e.roles.map(r=>ROLE_LABEL[r]).join(", "), e.category||"Staff", e.dept, e.active===false?"Deactivated":"Active"]))}>
              <Download size={13}/> Export
            </button>
            <button className="btn btn-primary" onClick={()=>{ setForm(blank); setSaveError(""); setShowAdd(true); }}><UserPlus size={15}/> Add user</button>
          </div>
        )}
      </div>

      {tab === "access" && <ModuleAccessPage state={state} dispatch={dispatch} />}
      {tab === "approval" && <ApprovalWorkflowPage state={state} dispatch={dispatch} role={role} />}

      {tab === "users" && <>
      <div className="agw-card" style={{ padding: 0 }}>
        <table className="agw-table">
          <thead><tr><th>User</th><th>Roles</th><th>Category</th><th>Department</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {pg.pageRows.map(e => (
              <tr key={e.id}>
                <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{e.initials}</span>{e.name}</td>
                <td style={{display:"flex",gap:4,flexWrap:"wrap"}}>{e.roles.map(r=><span key={r} className="pill">{ROLE_LABEL[r]}</span>)}</td>
                <td><Stamp tone={e.category==="Management" ? "gold" : "neutral"}>{e.category||"Staff"}</Stamp></td>
                <td>{e.dept}</td>
                <td>{e.active === false ? <Stamp tone="neutral">Deactivated</Stamp> : <Stamp tone="success">Active</Stamp>}</td>
                <td style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <button className="btn btn-sm" onClick={()=>dispatch({type:"TOGGLE_USER_ACTIVE", id:e.id})}>{e.active===false ? "Reactivate" : "Deactivate"}</button>
                  <RowActions onEdit={()=>openEdit(e)} onRemove={()=>setRemoveUser(e)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar {...pg} />
      </div>
      </>}

      {(showAdd || editUser) && (
        <Modal title={editUser ? `Edit ${editUser.name}` : "Add user"} sub="A user can hold more than one role." onClose={closeModal}>
          <div className="row2">
            <div className="field"><label>Full name</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></div>
            <div className="field"><label>Initials</label><input maxLength={2} value={form.initials} onChange={e=>setForm({...form,initials:e.target.value.toUpperCase()})} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Email (required to log in)</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="name@addressgateway.com" /></div>
            <div className="field"><label>{editUser ? "Reset password (optional)" : "Password (optional)"}</label><input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={editUser ? "Leave blank to keep current" : "Leave blank for default: ChangeMe123!"} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Department</label><input value={form.dept} onChange={e=>setForm({...form,dept:e.target.value})} /></div>
            <div className="field"><label>Designation (job title)</label><input value={form.designation} onChange={e=>setForm({...form,designation:e.target.value})} placeholder="e.g. Senior Sales Executive" /></div>
          </div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
              <option value="Staff">Staff</option>
              <option value="Management">Management</option>
            </select>
            {form.category === "Management" && <div className="side-note" style={{marginTop:6}}>Management users don't show up as assignees for Job Cards, Tasks, or Lead Assignment.</div>}
          </div>
          <div className="row2">
            <div className="field"><label>Join date</label><input type="date" value={form.joinedDate} onChange={e=>setForm({...form,joinedDate:e.target.value})} /></div>
            <div className="field"><label>Date of birth</label><input type="date" value={form.dateOfBirth} onChange={e=>setForm({...form,dateOfBirth:e.target.value})} /></div>
          </div>
          <div className="field">
            <label>Roles</label>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {Object.entries(ROLE_LABEL).map(([k,v]) => (
                <label key={k} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13 }}>
                  <input type="checkbox" checked={form.roles.includes(k)} onChange={()=>toggleRole(k)} /> {v}
                </label>
              ))}
            </div>
          </div>
          {saveError && <div className="side-note" style={{ color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{saveError}</div>}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button className="btn" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" disabled={saving || !form.name || form.roles.length===0 || (!editUser && !form.email)} onClick={handleSave}>
              {saving ? "Saving…" : editUser ? "Save changes" : "Add user"}
            </button>
          </div>
        </Modal>
      )}

      {removeUser && <ConfirmModal title={`Remove ${removeUser.name}?`} body="This permanently deletes the user account. Consider Deactivate instead if you might need this account again." onConfirm={()=>dispatch({type:"DELETE_USER", id:removeUser.id})} onClose={()=>setRemoveUser(null)} />}
    </div>
  );
}

// Drives real approvals (quotation discounts, job card sign-off, leave and punch requests) — see
// requireRoleOrApprovalTypeDesignation on the backend. Each approval type gets its own flat list
// of assigned approver designations, independent of the others. Existing role-based approvals
// (Sales Manager, Accounts, HR, Admin) keep working untouched; this only adds designation-based
// routing on top, and only once a type actually has designations assigned here.
function ApprovalWorkflowPage({ state, dispatch, role }) {
  const canEdit = ["super_admin","admin"].includes(role);
  const types = state.approvalTypes || [];
  const allDesignations = [...new Set(state.employees.map(e => e.designation).filter(Boolean))].sort();

  const toggleDesignation = (type, designation) => {
    const current = type.approverDesignations || [];
    const next = current.includes(designation) ? current.filter(d => d !== designation) : [...current, designation];
    dispatch({ type:"SET_APPROVAL_TYPE_APPROVERS", key: type.key, approverDesignations: next });
  };

  return (
    <div>
      <div className="agw-card" style={{ marginBottom: 18 }}>
        <strong style={{ fontSize:14 }}>Approval Process Workflow</strong>
        <p className="modal-sub">
          {canEdit
            ? "For each approval type, pick which designations are allowed to approve it — on top of the built-in role-based approvers, which always keep working regardless."
            : "Who can approve each type of request. Only Super Admin / Admin can edit this."}
        </p>
      </div>

      <div className="agw-card" style={{ padding: 0 }}>
        <table className="agw-table">
          <thead><tr><th>Approval type</th><th>Built-in approvers</th><th>Assigned designations</th></tr></thead>
          <tbody>
            {types.map(t => (
              <tr key={t.key}>
                <td style={{ fontWeight:500 }}>{t.label}</td>
                <td style={{ fontSize:12.5, color:"var(--ink-soft)" }}>{t.builtInRoles.join(", ")}</td>
                <td>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: canEdit ? 8 : 0 }}>
                    {(t.approverDesignations || []).length === 0
                      ? <span style={{ fontSize:12, color:"var(--ink-soft)" }}>None assigned</span>
                      : t.approverDesignations.map(d => <span key={d} className="pill">{d}</span>)}
                  </div>
                  {canEdit && (
                    <details>
                      <summary style={{ fontSize:12, color:"var(--brand)", cursor:"pointer" }}>Edit</summary>
                      <div style={{ display:"flex", flexDirection:"column", gap:4, marginTop:8, maxHeight:160, overflowY:"auto" }}>
                        {allDesignations.map(d => (
                          <label key={d} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5 }}>
                            <input type="checkbox" checked={(t.approverDesignations || []).includes(d)} onChange={()=>toggleDesignation(t, d)} /> {d}
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Explicit, per-user page access — replaces role-array matching against NAV items as the source
// of truth for what a user's sidebar shows (see visibleNav) and, for View, what the backend
// actually allows (requireModuleView in src/middleware/roles.js). Doesn't touch users.roles —
// roles keep driving backend ownership-scoping and every other business-logic branch exactly as
// before; this only answers "which pages does this specific person get," directly, without
// reasoning through which of their (possibly several) roles happens to grant what.
const MODULE_ACCESS_ITEMS = NAV.flatMap(g => g.items).filter(i => i.roles !== "all");

function ModuleAccessPage({ state, dispatch }) {
  const [userId, setUserId] = useState("");
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const loadFor = async (id) => {
    setUserId(id);
    setSaved(false);
    setSaveError("");
    setGrid(null);
    if (!id) return;
    setLoading(true);
    try {
      setGrid(await api.users.permissions(id));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't load — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (moduleKey, field) => {
    setGrid(g => ({ ...g, [moduleKey]: { ...g[moduleKey], [field]: !g[moduleKey][field] } }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await dispatch({ type:"SET_USER_MODULE_PERMISSIONS", userId, grid });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = state.employees.find(e => e.id === userId);
  const selectedIsAdmin = selectedUser && ADMIN_LIKE.some(r => selectedUser.roles.includes(r));

  return (
    <div>
      <div className="agw-card" style={{ marginBottom: 18 }}>
        <strong style={{ fontSize:14 }}>Module Access</strong>
        <p className="modal-sub">Exactly which pages this person can see and use — set directly per person, not derived from their roles. Dashboard, Tasks, Incentives, HR, Attendance, Knowledge Base, Reports and Notifications are always visible to everyone and aren't listed here. Admin-tier users always see every module and don't need a grid.</p>
        <div className="field" style={{ maxWidth: 320, marginTop: 10, marginBottom:0 }}>
          <label>User</label>
          <select value={userId} onChange={e=>loadFor(e.target.value)}>
            <option value="">Select a user…</option>
            {state.employees.filter(e => e.active !== false).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        {selectedIsAdmin && (
          <div className="side-note" style={{marginTop:10}}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{selectedUser.name} is Admin-tier — they see every module regardless of this grid.</div>
        )}
      </div>

      {loading && <div className="agw-card">Loading…</div>}

      {grid && !loading && (
        <div className="agw-card" style={{ padding: 0 }}>
          <table className="agw-table">
            <thead><tr><th>Module</th><th style={{textAlign:"center"}}>View</th><th style={{textAlign:"center"}}>Add</th><th style={{textAlign:"center"}}>Edit</th><th style={{textAlign:"center"}}>Delete</th></tr></thead>
            <tbody>
              {MODULE_ACCESS_ITEMS.map(m => (
                <tr key={m.key}>
                  <td style={{ display:"flex", alignItems:"center", gap:8 }}><m.icon size={14} style={{color:"var(--ink-soft)"}}/>{m.label}</td>
                  {["canView","canAdd","canEdit","canDelete"].map(field => (
                    <td key={field} style={{textAlign:"center"}}>
                      <input type="checkbox" checked={!!grid[m.key]?.[field]} onChange={()=>toggle(m.key, field)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saveError && <div className="side-note" style={{ color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{saveError}</div>}
      {grid && !loading && (
        <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", gap:10, marginTop: 14 }}>
          {saved && <span style={{fontSize:12.5,color:"var(--success)"}}>Saved</span>}
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* CHECKLIST TEMPLATES (ADMIN)                                             */
/* ---------------------------------------------------------------------- */

function TemplatesPage({ state, dispatch }) {
  const [service, setService] = useState(SERVICES[0]);
  const [steps, setSteps] = useState(state.checklistTemplates[SERVICES[0]] || []);
  const [newStep, setNewStep] = useState("");
  const [showNewService, setShowNewService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");

  const switchService = (s) => { setService(s); setSteps(state.checklistTemplates[s] || []); };

  return (
    <div className="agw-grid" style={{ gridTemplateColumns: "220px 1fr" }}>
      <div className="agw-card" style={{ padding: 8 }}>
        {state.services.map(s => (
          <button key={s} className={`agw-nav-item`} style={{ color: s===service?"var(--brand)":"var(--ink)", background: s===service?"var(--brand-tint)":"transparent", marginBottom: 4 }} onClick={()=>switchService(s)}>{s}</button>
        ))}
        {showNewService ? (
          <div style={{ padding:8 }}>
            <input autoFocus value={newServiceName} onChange={e=>setNewServiceName(e.target.value)} placeholder="New service name" style={{ width:"100%", marginBottom:6 }} />
            <div style={{ display:"flex", gap:6 }}>
              <button className="btn btn-sm btn-primary" disabled={!newServiceName.trim()} onClick={()=>{ dispatch({type:"ADD_SERVICE_OPTION", name:newServiceName.trim()}); switchService(newServiceName.trim()); setNewServiceName(""); setShowNewService(false); }}>Add</button>
              <button className="btn btn-sm" onClick={()=>{ setShowNewService(false); setNewServiceName(""); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="agw-nav-item" style={{ color:"var(--brand)" }} onClick={()=>setShowNewService(true)}><Plus size={14}/> Add service</button>
        )}
      </div>
      <div className="agw-card">
        <strong style={{ fontSize: 14 }}>{service}</strong>
        <p className="modal-sub">Steps here become the default checklist on every new job card for this service.</p>
        {steps.map((s,i) => (
          <div className="checklist-item" key={i}>
            <span className="checkbox"><Check size={12} style={{opacity:.2}}/></span>
            <span style={{ flex:1 }}>{s}</span>
            <button className="btn btn-ghost btn-sm" onClick={()=>setSteps(steps.filter((_,idx)=>idx!==i))}><X size={13}/></button>
          </div>
        ))}
        <div style={{ display:"flex", gap:8, marginTop: 10 }}>
          <input style={{ flex:1, border:"1px solid var(--hair)", borderRadius:8, padding:"8px 10px", fontSize:13.5 }} placeholder="Add a checklist step" value={newStep} onChange={e=>setNewStep(e.target.value)} />
          <button className="btn btn-sm" onClick={()=>{ if(newStep){ setSteps([...steps,newStep]); setNewStep(""); } }}>Add</button>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={()=>dispatch({type:"UPDATE_CHECKLIST_TEMPLATE", service, steps})}>Save template</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* NOTIFICATIONS                                                           */
/* ---------------------------------------------------------------------- */

function NotificationsPage({ state, dispatch, myNotifs }) {
  const [emailFor, setEmailFor] = useState(null);
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const iconFor = (type) => type==="expiry" ? { icon: CalendarClock, tone:"warning" }
    : type==="job" ? { icon: ClipboardList, tone:"info" }
    : type==="accounts" ? { icon: CircleDollarSign, tone:"gold" }
    : type==="approval" ? { icon: ShieldCheck, tone:"info" }
    : type==="task_assigned" ? { icon: ListChecks, tone:"info" }
    : type==="task_approval" ? { icon: ShieldCheck, tone:"info" }
    : type==="lead_assigned" ? { icon: UserPlus, tone:"info" }
    : type==="lead_sla" ? { icon: AlertTriangle, tone:"danger" }
    : type==="lead_followup" ? { icon: CalendarClock, tone:"warning" }
    : type==="todo_reminder" ? { icon: Clock, tone:"warning" }
    : type==="cheque_deposit" ? { icon: Landmark, tone:"warning" }
    : type==="software_renewal" ? { icon: Landmark, tone:"info" }
    : { icon: Ban, tone:"danger" };

  const audienceLabel = (aud) => aud.map(a => ROLE_LABEL[a] || state.employees.find(e=>e.id===a)?.name || a).join(", ");

  return (
    <div className="agw-card">
      {permission === "default" && (
        <div className="side-note" style={{ marginTop:0, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span><Bell size={13} style={{verticalAlign:-2,marginRight:4}}/>Get notified on this device the moment something new comes in — no need to keep this tab open.</span>
          <button className="btn btn-sm btn-primary" onClick={()=>Notification.requestPermission().then(setPermission)}>Enable notifications</button>
        </div>
      )}
      {permission === "denied" && (
        <div className="side-note" style={{ marginTop:0 }}><Ban size={13} style={{verticalAlign:-2,marginRight:4}}/>Notifications are blocked for this site — enable them in your browser's site settings to get alerts here without opening the app.</div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 8 }}>
        <div style={{fontSize:12,color:"var(--ink-soft)"}}><Mail size={12} style={{verticalAlign:-2,marginRight:4}}/>Also sent by email for this account</div>
        <button className="btn btn-sm btn-ghost" onClick={()=>dispatch({type:"MARK_ALL_READ"})}>Mark all read</button>
      </div>
      {myNotifs.length === 0 ? <Empty icon={Bell} text="You're all caught up." /> : myNotifs.map(n => {
        const { icon: Icon, tone } = iconFor(n.type);
        return (
          <div key={n.id} className={`notif-item ${!n.read ? "notif-unread":""}`}>
            <div className="notif-icon" style={{ background: `var(--${tone}-tint)`, color: `var(--${tone})` }}><Icon size={15}/></div>
            <div style={{ flex:1, cursor:"pointer" }} onClick={()=>dispatch({type:"MARK_NOTIF_READ", id:n.id})}>
              <div style={{ fontSize:13.5, fontWeight: n.read?400:600 }}>{n.title}</div>
              <div style={{ fontSize:12.5, color:"var(--ink-soft)", marginTop:2 }}>{n.body}</div>
              <div style={{ fontSize:11, color:"var(--ink-soft)", marginTop:4 }}>{fmtDate(n.createdAt)}{n.emailSent && <> · <Mail size={11} style={{verticalAlign:-2}}/> Emailed {fmtDate(n.emailedAt)}</>}</div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={(e)=>{ e.stopPropagation(); setEmailFor(n); }}>
              {n.emailSent ? <><BadgeCheck size={13}/> Emailed</> : <><Mail size={13}/> Send email</>}
            </button>
            {!n.read && <span style={{width:8,height:8,borderRadius:"50%",background:"var(--brand)",marginTop:5,flexShrink:0}}/>}
          </div>
        );
      })}

      {emailFor && (
        <Modal title="Send email" sub="Review the content before sending." onClose={()=>setEmailFor(null)} width={520}>
          <div className="field"><label>To</label><input value={audienceLabel(emailFor.audience)} disabled style={{ background:"var(--page)" }} /></div>
          <div className="field"><label>Subject</label><input value={emailFor.title} disabled style={{ background:"var(--page)" }} /></div>
          <div className="field"><label>Message</label>
            <div style={{ border:"1px solid var(--hair)", borderRadius:8, padding:"10px 12px", fontSize:13, lineHeight:1.6, background:"var(--page)" }}>
              {emailFor.body}
            </div>
          </div>
          <div className="side-note" style={{ marginTop:0 }}>Check the recipient and wording above — this can't be unsent once you confirm.</div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
            <button className="btn" onClick={()=>setEmailFor(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={()=>{ dispatch({type:"MARK_NOTIF_EMAILED", id:emailFor.id, title:emailFor.title}); setEmailFor(null); }}><Mail size={14}/> Confirm & send</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* SETTINGS                                                                */
/* ---------------------------------------------------------------------- */

function SettingsPage({ state, dispatch, setPage }) {
  const enabled = state.appSettings.emailNotificationsEnabled;
  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState("");

  const handleBackup = async () => {
    setBackingUp(true);
    setBackupError("");
    try {
      const blob = await api.settings.downloadBackup();
      downloadBlob(`smartcrm-backup-${daysFromNow(0)}.sql`, blob);
    } catch (err) {
      setBackupError(err instanceof ApiError ? err.message : "Couldn't generate a backup — please try again.");
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18, maxWidth: 560 }}>
      <div className="agw-card">
        <strong style={{ fontSize:14 }}>Email sending</strong>
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, marginTop:10 }}>
          <input type="checkbox" checked={enabled} onChange={(e)=>dispatch({type:"UPDATE_APP_SETTINGS", payload:{ emailNotificationsEnabled: e.target.checked }})} />
          Send emails (notifications, data manager outreach, etc.)
        </label>
        <div className="side-note" style={{ marginTop:10 }}>
          Turning this off stops all outgoing emails except password-reset codes — those always send, so nobody ever gets locked out of their account.
        </div>
      </div>

      <div className="agw-card">
        <strong style={{ fontSize:14 }}>Templates</strong>
        <div className="modal-sub" style={{ marginTop:4, marginBottom:12 }}>
          Manage the reusable starting points used elsewhere in the app.
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", border:"1px solid var(--hair)", borderRadius:8 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500 }}><Files size={13} style={{verticalAlign:-2,marginRight:6}}/>Quotation Templates</div>
              <div style={{ fontSize:11.5, color:"var(--ink-soft)", marginTop:2 }}>A reusable starting point for each service's quotation.</div>
            </div>
            <button className="btn btn-sm" onClick={()=>setPage("quotationTemplates")}>Manage <ChevronRight size={14}/></button>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", border:"1px solid var(--hair)", borderRadius:8 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500 }}><ListChecks size={13} style={{verticalAlign:-2,marginRight:6}}/>Checklist Templates</div>
              <div style={{ fontSize:11.5, color:"var(--ink-soft)", marginTop:2 }}>Default job card checklist steps, per service.</div>
            </div>
            <button className="btn btn-sm" onClick={()=>setPage("templates")}>Manage <ChevronRight size={14}/></button>
          </div>
        </div>
      </div>

      <div className="agw-card">
        <strong style={{ fontSize:14 }}>Data backup</strong>
        <div className="modal-sub" style={{ marginTop:4 }}>
          Downloads a complete, restorable SQL dump of the entire database — every table, every row — as of right now.
        </div>
        {backupError && <div className="side-note" style={{ color:"var(--danger)", marginTop:10 }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{backupError}</div>}
        <button className="btn btn-primary" style={{ marginTop:12 }} disabled={backingUp} onClick={handleBackup}>
          <Download size={14}/> {backingUp ? "Generating…" : "Download backup now"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* REPORTS                                                                 */
/* ---------------------------------------------------------------------- */

const REPORT_TABS = [
  { key:"volume", label:"Business Volume" },
  { key:"salespeople", label:"Sales by Person" },
  { key:"collections", label:"Collections" },
  { key:"customers", label:"Customers" },
  { key:"users", label:"User Base" },
  { key:"hr", label:"Attendance & HR" },
  { key:"incentives", label:"Incentives" },
  { key:"operations", label:"Operations" },
  { key:"tasks", label:"Employee Tasks" },
  { key:"salesDailyTasks", label:"Sales Daily Tasks" },
  { key:"leadPerformance", label:"Lead Performance" },
  { key:"attendanceHours", label:"Attendance" },
];

// Admin-tier, Sales Manager, and Accounts already had full company-wide Reports access before
// Reports opened to every role — they keep it, since they manage/oversee a team or the whole
// company's finances. Viewer and Executive are pure-oversight roles with no owned data of their
// own, so scoping them to "their own" would just show them nothing — they stay full-access too,
// consistent with why those roles exist. Everyone else (Sales Exec, Ops Manager, Ops Member, HR,
// Data Manager, Lead Manager) sees only their own contributions in every report.
const FULL_REPORT_ACCESS_ROLES = [...ADMIN_LIKE, "sales_manager", "accounts", "viewer", "executive"];

// Multi-select "salespeople" filter — shown only on reports with a salesperson dimension
// (Business Volume, Sales by Person, Sales Daily Tasks, Lead Performance). Empty selection means
// "everyone", matching how the underlying reports behaved before this filter existed.
const SALES_FILTER_TABS = ["volume", "salespeople", "salesDailyTasks", "leadPerformance"];
function SalesPeopleFilter({ people, selected, setSelected }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const toggle = (id) => setSelected(sel => sel.includes(id) ? sel.filter(x=>x!==id) : [...sel, id]);
  const label = selected.length === 0 ? "All salespeople"
    : selected.length === 1 ? (people.find(p=>p.id===selected[0])?.name || "1 selected")
    : `${selected.length} salespeople`;

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button type="button" className="btn btn-sm btn-ghost" onClick={()=>setOpen(o=>!o)}>
        <Users size={13}/> {label} <ChevronDown size={13}/>
      </button>
      {open && (
        <div className="agw-card" style={{ position:"absolute", top:"100%", right:0, marginTop:4, zIndex:50, width:230, maxHeight:300, overflowY:"auto", padding:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, gap:6 }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={()=>setSelected([])}>Clear</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={()=>setSelected(people.map(p=>p.id))}>Select all</button>
          </div>
          {people.length === 0 && <div style={{ fontSize:12, color:"var(--ink-soft)", padding:"4px 2px" }}>No salespeople configured.</div>}
          {people.map(p => (
            <label key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 2px", fontSize:13, cursor:"pointer" }}>
              <input type="checkbox" checked={selected.includes(p.id)} onChange={()=>toggle(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsPage({ state, role, userId }) {
  const [tab, setTab] = useState("volume");
  const [salesFilter, setSalesFilter] = useState([]);
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range } = usePeriod("month");

  // Scoped once here (not inside each report component) so every tab automatically only ever sees
  // "their own" data for a restricted role — the report components themselves are unchanged, they
  // just receive a pre-filtered `state`. Deliberately separate from each entity's own module-level
  // visibility rules elsewhere in the app (e.g. an Ops Manager still manages every Job Card on the
  // actual Job Cards page — that's an operational necessity unrelated to this Reports-only scoping).
  const canSeeAllReports = FULL_REPORT_ACCESS_ROLES.includes(role);
  const reportState = canSeeAllReports ? state : (() => {
    const ownedQuotationIds = new Set(state.quotations.filter(q => q.owner === userId).map(q => q.id));
    const ownedSalesOrders = state.salesOrders.filter(so => ownedQuotationIds.has(so.quotationId));
    const ownedSalesOrderIds = new Set(ownedSalesOrders.map(so => so.id));
    return {
      ...state,
      leads: state.leads.filter(l => l.owner === userId),
      deals: state.deals.filter(d => d.owner === userId),
      quotations: state.quotations.filter(q => q.owner === userId),
      salesOrders: ownedSalesOrders,
      invoices: state.invoices.filter(inv => ownedSalesOrderIds.has(inv.salesOrderId)),
      jobCards: state.jobCards.filter(j => (j.assignees || []).includes(userId) || j.createdBy === userId),
      tasks: state.tasks.filter(t => t.assignedTo === userId || t.createdBy === userId),
      // customers is already scoped to "own" server-side (see GET /customers) — every role that
      // isn't in the full-access set only ever receives their own customers to begin with.
      employees: state.employees.filter(e => e.id === userId),
    };
  })();

  return (
    <div>
      <div className="side-note" style={{ marginTop:0, marginBottom:16 }}>
        <AlertTriangle size={13} style={{verticalAlign:-2, marginRight:4}}/>All figures are based on Professional Fee quotations and invoices only — Government Fee amounts are pass-through and excluded from every report below.
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 16, flexWrap:"wrap", gap:10 }}>
        <div className="tabbar" style={{ marginBottom:0, borderBottom:"none" }}>
          {REPORT_TABS.map(t => <button key={t.key} className={`tab ${tab===t.key?"active":""}`} onClick={()=>setTab(t.key)}>{t.label}</button>)}
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {SALES_FILTER_TABS.includes(tab) && (
            <SalesPeopleFilter
              people={reportState.employees.filter(e => e.roles.includes("sales_exec") || e.roles.includes("sales_manager"))}
              selected={salesFilter} setSelected={setSalesFilter} />
          )}
          <PeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
        </div>
      </div>

      {tab === "volume" && <VolumeReport state={reportState} range={range} salesFilter={salesFilter} />}
      {tab === "salespeople" && <SalesPersonReport state={reportState} range={range} salesFilter={salesFilter} />}
      {tab === "collections" && <CollectionsReport state={reportState} range={range} />}
      {tab === "customers" && <CustomersReport state={reportState} range={range} />}
      {tab === "users" && <UsersReport state={reportState} range={range} />}
      {tab === "hr" && <AttendanceHRReport state={reportState} range={range} />}
      {tab === "incentives" && <IncentivesReport state={reportState} range={range} />}
      {tab === "operations" && <OperationsReport state={reportState} range={range} />}
      {tab === "tasks" && <EmployeeTasksReport state={reportState} range={range} />}
      {tab === "salesDailyTasks" && <SalesDailyTasksReport state={reportState} range={range} salesFilter={salesFilter} />}
      {tab === "leadPerformance" && <LeadPerformanceReport state={reportState} range={range} salesFilter={salesFilter} />}
      {tab === "attendanceHours" && <AttendanceHoursReport state={reportState} range={range} userId={canSeeAllReports ? undefined : userId} />}
    </div>
  );
}

function ReportKpis({ items }) {
  return (
    <div className="agw-grid" style={{ gridTemplateColumns: `repeat(${items.length},1fr)`, marginBottom: 16 }}>
      {items.map(k => (
        <div className="agw-card" key={k.label}><div className="kpi-label">{k.label}</div><div className="kpi-value disp">{k.value}</div></div>
      ))}
    </div>
  );
}

function ReportTableCard({ title, onExport, onExportExcel, onExportPdf, children, empty, emptyIcon }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 8, flexWrap:"wrap", gap:6 }}>
        <strong style={{ fontSize:13 }}>{title}</strong>
        <div style={{ display:"flex", gap:6 }}>
          {onExport && <button className="btn btn-sm btn-ghost" onClick={onExport}><Download size={13}/> CSV</button>}
          {onExportExcel && <button className="btn btn-sm btn-ghost" onClick={onExportExcel}><Download size={13}/> Excel</button>}
          {onExportPdf && <button className="btn btn-sm btn-ghost" onClick={onExportPdf}><Download size={13}/> PDF</button>}
        </div>
      </div>
      <div className="agw-card" style={{ padding: 0 }}>
        {empty ? <Empty icon={emptyIcon || FileText} text={empty} /> : children}
      </div>
    </div>
  );
}

// Excel/PDF export helpers shared by every report tab (CSV already had exportCSV in ui.jsx).
function exportExcel(filename, headers, rows) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, filename);
}
async function exportPdf(title, subtitle, columns, rows) {
  try {
    const blob = await api.reports.downloadPdf(title, subtitle, columns, rows);
    downloadBlob(`${title.replace(/[^a-z0-9]+/gi, "-")}.pdf`, blob);
  } catch (err) {
    alert(err instanceof ApiError ? err.message : "Couldn't generate the PDF — please try again.");
  }
}

// Only the Professional Fee portion of a quotation counts as business volume — see
// professionalFeeAmount above (handles quotations that mix Professional + Government Fee items).
const quoteAmount = (q) => professionalFeeAmount(q.items, q.orderDiscount, q.feeType, q.orderDiscountType);

function VolumeReport({ state, range, salesFilter = [] }) {
  const dealOwners = new Map(state.deals.map(d => [d.id, d.owner]));
  const ownerOf = (q) => q.owner || (q.dealId ? dealOwners.get(q.dealId) : undefined);

  const quotesInRange = state.quotations.filter(q => q.feeType !== "Government Fee" && inRange(q.createdAt, range));
  const quotes = salesFilter.length ? quotesInRange.filter(q => salesFilter.includes(ownerOf(q))) : quotesInRange;
  const approved = quotes.filter(q => q.status === "Approved");
  const totalQuoted = quotes.reduce((a,q)=>a+quoteAmount(q),0);
  const totalApproved = approved.reduce((a,q)=>a+quoteBusinessVolume(q, state.serviceCosts),0);
  const winRate = quotes.length > 0 ? Math.round((approved.length/quotes.length)*100) : 0;

  const salesUsers = state.employees.filter(e => e.roles.includes("sales_exec") || e.roles.includes("sales_manager"));
  const visibleSalesUsers = salesFilter.length ? salesUsers.filter(u => salesFilter.includes(u.id)) : salesUsers;
  const perPerson = visibleSalesUsers.map(owner => {
    const q = quotesInRange.filter(q => ownerOf(q) === owner.id);
    const won = q.filter(x => x.status === "Approved");
    const quotedVal = q.reduce((a,x)=>a+quoteAmount(x),0);
    const approvedVal = won.reduce((a,x)=>a+quoteBusinessVolume(x, state.serviceCosts),0);
    return { owner, count: q.length, quotedVal, approvedVal, winRate: q.length ? Math.round((won.length/q.length)*100) : 0 };
  }).sort((a,b) => b.quotedVal - a.quotedVal);

  return (
    <div>
      <ReportKpis items={[
        { label:"Quotations issued", value: quotes.length },
        { label:"Total quoted value", value: money(totalQuoted) },
        { label:"Approved value", value: money(totalApproved) },
        { label:"Win rate", value: `${winRate}%` },
      ]} />

      <ReportTableCard title="Business volume by salesperson" empty={perPerson.length===0 ? "No sales roles configured yet." : null} emptyIcon={Users}
        onExportExcel={perPerson.length ? ()=>exportExcel("business-volume-by-salesperson.xlsx",
          ["Salesperson","Quotations","Total Quoted (QAR)","Approved Value (QAR)","Win Rate"],
          perPerson.map(r=>[r.owner.name, r.count, r.quotedVal, r.approvedVal, `${r.winRate}%`])) : null}>
        <table className="agw-table">
          <thead><tr><th>Salesperson</th><th>Quotations</th><th>Total quoted</th><th>Approved value</th><th>Win rate</th></tr></thead>
          <tbody>
            {perPerson.map(r => (
              <tr key={r.owner.id}>
                <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{r.owner.initials}</span>{r.owner.name}</td>
                <td>{r.count}</td>
                <td className="mono">{money(r.quotedVal)}</td>
                <td className="mono" style={{color:"var(--gold)"}}>{money(r.approvedVal)}</td>
                <td>{r.winRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>

      <ReportTableCard title="Professional Fee quotations" empty={quotes.length===0 ? "No Professional Fee quotations in this period." : null}
        onExport={quotes.length ? ()=>exportCSV("business-volume.csv", ["Quotation","Customer","Service","Amount (QAR)","Status","Date"],
          quotes.map(q=>[q.id, q.customer, q.items[0]?.service||"", quoteAmount(q), q.status, fmtDate(q.createdAt)])) : null}
        onExportExcel={quotes.length ? ()=>exportExcel("business-volume.xlsx", ["Quotation","Customer","Service","Amount (QAR)","Status","Date"],
          quotes.map(q=>[q.id, q.customer, q.items[0]?.service||"", quoteAmount(q), q.status, fmtDate(q.createdAt)])) : null}>
        <table className="agw-table">
          <thead><tr><th>Quotation</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {quotes.map(q => (
              <tr key={q.id}>
                <td className="mono">{q.id}</td><td>{q.customer}</td>
                <td className="mono">{money(quoteAmount(q))}</td>
                <td><Stamp tone={statusTone(q.status)}>{q.status}</Stamp></td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(q.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

function SalesPersonReport({ state, range, salesFilter = [] }) {
  const [view, setView] = useState("table");
  const allOwners = state.employees.filter(e => e.roles.includes("sales_exec") || e.roles.includes("sales_manager"));
  const owners = salesFilter.length ? allOwners.filter(o => salesFilter.includes(o.id)) : allOwners;

  const rows = owners.map(owner => {
    const leads = state.leads.filter(l => l.owner===owner.id && inRange(l.createdAt, range));
    const allOwnedDealIds = new Set(state.deals.filter(d => d.owner===owner.id).map(d => d.id));
    const deals = state.deals.filter(d => d.owner===owner.id && inRange(d.createdAt, range));
    const dealsWon = deals.filter(d => d.stage==="Won").length;

    const quotes = state.quotations.filter(q => ((q.dealId && allOwnedDealIds.has(q.dealId)) || q.owner===owner.id) && inRange(q.createdAt, range));
    const quoteIds = new Set(quotes.map(q=>q.id));
    const salesOrders = state.salesOrders.filter(so => quoteIds.has(so.quotationId));
    const soIds = new Set(salesOrders.map(so=>so.id));
    const invoices = state.invoices.filter(inv => soIds.has(inv.salesOrderId) && inRange(inv.createdAt, range));

    const businessVolume = quotes.filter(q => q.status==="Approved" && q.feeType!=="Government Fee").reduce((a,q)=>a+quoteBusinessVolume(q, state.serviceCosts),0);
    const invoicedAmount = invoices.reduce((a,inv)=>a+inv.amount,0);
    const collected = invoices.reduce((a,inv)=>a+inv.payments.reduce((x,p)=>x+p.amount,0),0);
    const pendingLeads = leads.filter(l => !["Qualified","Unqualified"].includes(l.status)).length;
    const pendingQuotes = quotes.filter(q => !["Approved","Rejected","Expired"].includes(q.status)).length;

    return { owner, leadsCount: leads.length, pendingLeads, dealsCount: deals.length, dealsWon,
      quotesCount: quotes.length, pendingQuotes, invoicesCount: invoices.length, invoicedAmount, collected, businessVolume };
  }).sort((a,b) => b.businessVolume - a.businessVolume);

  const totals = rows.reduce((a,r) => ({
    leads: a.leads+r.leadsCount, deals: a.deals+r.dealsCount, quotes: a.quotes+r.quotesCount,
    invoices: a.invoices+r.invoicesCount, volume: a.volume+r.businessVolume, pending: a.pending+r.pendingLeads+r.pendingQuotes,
  }), { leads:0, deals:0, quotes:0, invoices:0, volume:0, pending:0 });

  return (
    <div>
      <ReportKpis items={[
        { label:"Salespeople", value: rows.length },
        { label:"Total leads", value: totals.leads },
        { label:"Total business volume", value: money(totals.volume) },
        { label:"Total pending (leads + quotes)", value: totals.pending },
      ]} />

      <div className="tabbar" style={{ marginBottom: 12, borderBottom:"none" }}>
        <button className={`tab ${view==="table"?"active":""}`} onClick={()=>setView("table")}>Table</button>
        <button className={`tab ${view==="chart"?"active":""}`} onClick={()=>setView("chart")}>Chart</button>
      </div>

      {view === "table" ? (
        <ReportTableCard title="Performance by salesperson" empty={rows.length===0 ? "No sales roles configured yet." : null} emptyIcon={Users}
          onExport={rows.length ? ()=>exportCSV("sales-by-person.csv",
            ["Salesperson","Leads","Pending leads","Deals","Deals won","Quotations","Pending quotations","Invoices","Invoiced (QAR)","Collected (QAR)","Business volume (QAR)"],
            rows.map(r=>[r.owner.name, r.leadsCount, r.pendingLeads, r.dealsCount, r.dealsWon, r.quotesCount, r.pendingQuotes, r.invoicesCount, r.invoicedAmount, r.collected, r.businessVolume])) : null}
          onExportExcel={rows.length ? ()=>exportExcel("sales-by-person.xlsx",
            ["Salesperson","Leads","Pending leads","Deals","Deals won","Quotations","Pending quotations","Invoices","Invoiced (QAR)","Collected (QAR)","Business volume (QAR)"],
            rows.map(r=>[r.owner.name, r.leadsCount, r.pendingLeads, r.dealsCount, r.dealsWon, r.quotesCount, r.pendingQuotes, r.invoicesCount, r.invoicedAmount, r.collected, r.businessVolume])) : null}>
          <table className="agw-table">
            <thead><tr><th>Salesperson</th><th>Leads</th><th>Deals</th><th>Quotations</th><th>Invoices</th><th>Business volume</th><th>Pending</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.owner.id}>
                  <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{r.owner.initials}</span>{r.owner.name}</td>
                  <td>{r.leadsCount}</td>
                  <td>{r.dealsCount} <span style={{color:"var(--ink-soft)",fontSize:11}}>({r.dealsWon} won)</span></td>
                  <td>{r.quotesCount}</td>
                  <td>{r.invoicesCount}<div style={{fontSize:11,color:"var(--ink-soft)"}}>{money(r.collected)} collected</div></td>
                  <td className="mono" style={{color:"var(--gold)"}}>{money(r.businessVolume)}</td>
                  <td>{(r.pendingLeads+r.pendingQuotes) > 0 ? <Stamp tone="warning">{r.pendingLeads+r.pendingQuotes}</Stamp> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportTableCard>
      ) : (
        <div className="agw-card">
          <strong style={{ fontSize:13 }}>{rows.length === 1 ? "My leads, deals & quotations" : "Sales team — leads, deals & quotations"}</strong>
          <div style={{ marginTop:16 }}>
            {rows.length === 0 ? <Empty icon={Users} text="No sales roles configured yet." /> : <SalesPersonBars rows={rows} />}
          </div>
        </div>
      )}
    </div>
  );
}

function CollectionsReport({ state, range }) {
  const invoices = state.invoices.filter(inv => inv.feeType !== "Government Fee" && inRange(inv.createdAt, range));
  const totalInvoiced = invoices.reduce((a,inv)=>a+inv.amount,0);
  const totalPaid = state.invoices.reduce((a,inv) => a + inv.payments.filter(p=>inRange(p.date, range)).reduce((x,p)=>x+p.amount,0), 0);
  const outstanding = invoices.reduce((a,inv) => a + Math.max(0, inv.professionalFeeAmount - inv.payments.reduce((x,p)=>x+p.amount,0)), 0);

  return (
    <div>
      <ReportKpis items={[
        { label:"Invoices raised", value: invoices.length },
        { label:"Total invoiced", value: money(totalInvoiced) },
        { label:"Collected in period", value: money(totalPaid) },
        { label:"Outstanding", value: money(outstanding) },
      ]} />
      <ReportTableCard title="Professional Fee invoices" empty={invoices.length===0 ? "No Professional Fee invoices in this period." : null}
        onExport={invoices.length ? ()=>exportCSV("collections.csv", ["Invoice","Customer","Amount","Paid","Balance","Status","Date"],
          invoices.map(inv=>{ const paid=inv.payments.reduce((a,p)=>a+p.amount,0); return [inv.id, inv.customer, inv.amount, paid, Math.max(0, inv.professionalFeeAmount-paid), inv.status, fmtDate(inv.createdAt)]; })) : null}
        onExportExcel={invoices.length ? ()=>exportExcel("collections.xlsx", ["Invoice","Customer","Amount","Paid","Balance","Status","Date"],
          invoices.map(inv=>{ const paid=inv.payments.reduce((a,p)=>a+p.amount,0); return [inv.id, inv.customer, inv.amount, paid, Math.max(0, inv.professionalFeeAmount-paid), inv.status, fmtDate(inv.createdAt)]; })) : null}>
        <table className="agw-table">
          <thead><tr><th>Invoice</th><th>Customer</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {invoices.map(inv => {
              const paid = inv.payments.reduce((a,p)=>a+p.amount,0);
              const balance = Math.max(0, inv.professionalFeeAmount - paid);
              return (
                <tr key={inv.id}>
                  <td className="mono">{inv.id}</td><td>{inv.customer}</td>
                  <td className="mono">{money(inv.amount)}</td><td className="mono">{money(paid)}</td>
                  <td className="mono" style={{ color: balance>0 ? "var(--danger)" : "var(--success)" }}>{money(balance)}</td>
                  <td><Stamp tone={statusTone(inv.status)}>{inv.status}</Stamp></td>
                  <td className="mono" style={{fontSize:12}}>{fmtDate(inv.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

function CustomersReport({ state, range }) {
  const rows = state.customers.map(c => {
    const quotes = state.quotations.filter(q => q.customer===c.name && q.feeType!=="Government Fee" && q.status==="Approved" && inRange(q.createdAt, range));
    const invoices = state.invoices.filter(inv => inv.customer===c.name && inv.feeType!=="Government Fee" && inRange(inv.createdAt, range));
    const invoiced = invoices.reduce((a,inv)=>a+inv.amount,0);
    const paid = invoices.reduce((a,inv)=>a+inv.payments.reduce((x,p)=>x+p.amount,0),0);
    const profFeeInvoiced = invoices.reduce((a,inv)=>a+inv.professionalFeeAmount,0);
    const jobCards = state.jobCards.filter(j => j.customer===c.name && (j.statusLog?.[0]?.at) && inRange(j.statusLog[0].at, range));
    return { customer: c.name, quotedValue: quotes.reduce((a,q)=>a+quoteBusinessVolume(q, state.serviceCosts),0), invoiced, paid, balance: Math.max(0, profFeeInvoiced-paid), jobCards: jobCards.length };
  }).filter(r => r.quotedValue > 0 || r.invoiced > 0 || r.jobCards > 0)
    .sort((a,b) => b.invoiced - a.invoiced);

  return (
    <ReportTableCard title="Business volume by customer" empty={rows.length===0 ? "No customer activity in this period." : null} emptyIcon={UserCheck}
      onExport={rows.length ? ()=>exportCSV("customers.csv", ["Customer","Approved Quoted (QAR)","Invoiced (QAR)","Paid (QAR)","Balance (QAR)","Job Cards"],
        rows.map(r=>[r.customer, r.quotedValue, r.invoiced, r.paid, r.balance, r.jobCards])) : null}
      onExportExcel={rows.length ? ()=>exportExcel("customers.xlsx", ["Customer","Approved Quoted (QAR)","Invoiced (QAR)","Paid (QAR)","Balance (QAR)","Job Cards"],
        rows.map(r=>[r.customer, r.quotedValue, r.invoiced, r.paid, r.balance, r.jobCards])) : null}>
      <table className="agw-table">
        <thead><tr><th>Customer</th><th>Approved quoted</th><th>Invoiced</th><th>Paid</th><th>Balance</th><th>Job cards</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.customer}>
              <td>{r.customer}</td>
              <td className="mono">{money(r.quotedValue)}</td>
              <td className="mono">{money(r.invoiced)}</td>
              <td className="mono">{money(r.paid)}</td>
              <td className="mono" style={{ color: r.balance>0 ? "var(--danger)" : "var(--success)" }}>{money(r.balance)}</td>
              <td>{r.jobCards}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableCard>
  );
}

function UsersReport({ state, range }) {
  const total = state.employees.length;
  const active = state.employees.filter(e => e.active !== false).length;
  const deactivated = total - active;
  const roleCounts = {};
  state.employees.forEach(e => e.roles.forEach(r => { roleCounts[r] = (roleCounts[r]||0) + 1; }));
  const distinctRoles = Object.keys(roleCounts).length;

  const rows = state.employees.map(e => {
    const attendanceInPeriod = (e.attendance||[]).filter(a => inRange(a.date, range));
    const present = attendanceInPeriod.filter(a=>a.status==="Present").length;
    const absent = attendanceInPeriod.filter(a=>a.status==="Absent").length;
    const onLeaveDays = attendanceInPeriod.filter(a=>a.status==="Leave"||a.status==="Vacation").length;
    const leaveRequests = state.leaveRequests.filter(r => r.employeeId===e.id && inRange(r.requestedAt, range));
    const approvedLeave = leaveRequests.filter(r=>r.status==="Approved").length;
    return {
      e, present, absent, onLeaveDays,
      leaveRequests: leaveRequests.length, approvedLeave,
      incentive: computeIncentive(e, state),
    };
  }).sort((a,b) => a.e.name.localeCompare(b.e.name));

  return (
    <div>
      <ReportKpis items={[
        { label:"Total users", value: total },
        { label:"Active", value: active },
        { label:"Deactivated", value: deactivated },
        { label:"Distinct roles in use", value: distinctRoles },
      ]} />

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {Object.entries(roleCounts).map(([r,ct]) => <span key={r} className="pill">{ROLE_LABEL[r]}: {ct}</span>)}
      </div>

      <ReportTableCard title="Team members" empty={rows.length===0 ? "No users yet." : null} emptyIcon={UserCog}
        onExport={rows.length ? ()=>exportCSV("user-base.csv", ["Name","Roles","Department","Status","Joined","Present days (period)","Absent days (period)","Leave/Vacation days (period)","Leave requests (period)","Incentive earned (QAR)"],
          rows.map(r=>[r.e.name, r.e.roles.map(x=>ROLE_LABEL[x]).join(" + "), r.e.dept, r.e.active===false?"Deactivated":"Active", fmtDate(r.e.joined), r.present, r.absent, r.onLeaveDays, r.leaveRequests, r.incentive])) : null}
        onExportExcel={rows.length ? ()=>exportExcel("user-base.xlsx", ["Name","Roles","Department","Status","Joined","Present days (period)","Absent days (period)","Leave/Vacation days (period)","Leave requests (period)","Incentive earned (QAR)"],
          rows.map(r=>[r.e.name, r.e.roles.map(x=>ROLE_LABEL[x]).join(" + "), r.e.dept, r.e.active===false?"Deactivated":"Active", fmtDate(r.e.joined), r.present, r.absent, r.onLeaveDays, r.leaveRequests, r.incentive])) : null}>
        <table className="agw-table">
          <thead><tr><th>User</th><th>Roles</th><th>Department</th><th>Status</th><th>Joined</th><th>Present</th><th>Absent</th><th>Leave/Vacation</th><th>Leave requests</th><th>Incentive</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.e.id}>
                <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{r.e.initials}</span>{r.e.name}</td>
                <td style={{display:"flex",gap:4,flexWrap:"wrap"}}>{r.e.roles.map(x=><span key={x} className="pill">{ROLE_LABEL[x]}</span>)}</td>
                <td>{r.e.dept}</td>
                <td>{r.e.active===false ? <Stamp tone="neutral">Deactivated</Stamp> : <Stamp tone="success">Active</Stamp>}</td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(r.e.joined)}</td>
                <td>{r.present}</td>
                <td>{r.absent}</td>
                <td>{r.onLeaveDays}</td>
                <td>{r.leaveRequests}{r.approvedLeave>0 && <span style={{color:"var(--ink-soft)",fontSize:11}}> ({r.approvedLeave} approved)</span>}</td>
                <td className="mono" style={{color:"var(--gold)"}}>{money(r.incentive)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

function AttendanceHRReport({ state, range }) {
  const rows = state.employees.map(e => {
    const inPeriod = (e.attendance||[]).filter(a => inRange(a.date, range));
    const present = inPeriod.filter(a=>a.status==="Present").length;
    const absent = inPeriod.filter(a=>a.status==="Absent").length;
    const leaveVacation = inPeriod.filter(a=>a.status==="Leave"||a.status==="Vacation").length;
    const marked = inPeriod.length;
    const rate = marked > 0 ? Math.round((present/marked)*100) : null;
    const flaggedDocs = (e.docs||[]).filter(d => docState(d.expiry).label !== "Valid").length;
    const pendingLeave = state.leaveRequests.filter(r=>r.employeeId===e.id && r.status==="Pending").length;
    return { e, present, absent, leaveVacation, rate, flaggedDocs, pendingLeave, leaveBalance: e.leaveBalance ?? 21 };
  });

  const avgRate = rows.filter(r=>r.rate!==null).length > 0
    ? Math.round(rows.filter(r=>r.rate!==null).reduce((a,r)=>a+r.rate,0) / rows.filter(r=>r.rate!==null).length) : 0;
  const totalPendingLeave = rows.reduce((a,r)=>a+r.pendingLeave,0);
  const totalFlaggedDocs = rows.reduce((a,r)=>a+r.flaggedDocs,0);
  const lowAttendance = rows.filter(r=>r.rate!==null && r.rate<70).length;

  return (
    <div>
      <ReportKpis items={[
        { label:"Avg attendance rate", value: `${avgRate}%` },
        { label:"Below 70% attendance", value: lowAttendance },
        { label:"Pending leave requests", value: totalPendingLeave },
        { label:"Staff documents flagged", value: totalFlaggedDocs },
      ]} />

      <ReportTableCard title="Attendance & HR standing by team member"
        onExport={()=>exportCSV("attendance-hr.csv", ["Name","Department","Attendance rate","Present","Absent","Leave/Vacation","Leave balance","Pending leave requests","Documents flagged"],
          rows.map(r=>[r.e.name, r.e.dept, r.rate!==null?`${r.rate}%`:"—", r.present, r.absent, r.leaveVacation, r.leaveBalance, r.pendingLeave, r.flaggedDocs]))}
        onExportExcel={()=>exportExcel("attendance-hr.xlsx", ["Name","Department","Attendance rate","Present","Absent","Leave/Vacation","Leave balance","Pending leave requests","Documents flagged"],
          rows.map(r=>[r.e.name, r.e.dept, r.rate!==null?`${r.rate}%`:"—", r.present, r.absent, r.leaveVacation, r.leaveBalance, r.pendingLeave, r.flaggedDocs]))}>
        <table className="agw-table">
          <thead><tr><th>User</th><th>Department</th><th>Attendance rate</th><th>Present</th><th>Absent</th><th>Leave/Vacation</th><th>Leave balance</th><th>Pending requests</th><th>Docs flagged</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.e.id}>
                <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{r.e.initials}</span>{r.e.name}</td>
                <td>{r.e.dept}</td>
                <td>{r.rate!==null ? <Stamp tone={r.rate>=90?"success":r.rate>=70?"warning":"danger"}>{r.rate}%</Stamp> : <span className="pill">No data</span>}</td>
                <td>{r.present}</td>
                <td>{r.absent}</td>
                <td>{r.leaveVacation}</td>
                <td>{r.leaveBalance} days</td>
                <td>{r.pendingLeave > 0 ? <Stamp tone="warning">{r.pendingLeave}</Stamp> : "—"}</td>
                <td>{r.flaggedDocs > 0 ? <Stamp tone="warning">{r.flaggedDocs}</Stamp> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

function IncentivesReport({ state, range }) {
  const rows = state.employees.map(e => ({ e, incentive: computeIncentive(e, state) })).filter(r => r.incentive > 0 || r.e.roles.some(r2=>state.incentiveRules.some(ir=>ir.role===r2)));
  const total = rows.reduce((a,r)=>a+r.incentive,0);

  return (
    <div>
      <ReportKpis items={[
        { label:"Team members with rules", value: rows.length },
        { label:"Total incentive value", value: money(total) },
      ]} />
      <ReportTableCard title="Incentive earned by employee" empty={rows.length===0 ? "No incentive rules configured yet." : null} emptyIcon={Coins}
        onExport={rows.length ? ()=>exportCSV("incentives.csv", ["Employee","Roles","Department","Incentive (QAR)"],
          rows.map(r=>[r.e.name, r.e.roles.map(x=>ROLE_LABEL[x]).join(" + "), r.e.dept, r.incentive])) : null}
        onExportExcel={rows.length ? ()=>exportExcel("incentives.xlsx", ["Employee","Roles","Department","Incentive (QAR)"],
          rows.map(r=>[r.e.name, r.e.roles.map(x=>ROLE_LABEL[x]).join(" + "), r.e.dept, r.incentive])) : null}>
        <table className="agw-table">
          <thead><tr><th>Employee</th><th>Roles</th><th>Department</th><th>Incentive earned</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.e.id}>
                <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{r.e.initials}</span>{r.e.name}</td>
                <td style={{display:"flex",gap:4,flexWrap:"wrap"}}>{r.e.roles.map(x=><span key={x} className="pill">{ROLE_LABEL[x]}</span>)}</td>
                <td>{r.e.dept}</td>
                <td className="mono" style={{color:"var(--gold)"}}>{money(r.incentive)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
      <div className="side-note" style={{marginTop:-8}}>Note: this is a running total across all recorded activity, not scoped to the selected period — the incentive engine (Incentives page) tracks per-cycle payout separately.</div>
    </div>
  );
}

function OperationsReport({ state, range }) {
  const jobs = state.jobCards.filter(j => j.statusLog?.[0]?.at && inRange(j.statusLog[0].at, range));
  const byStatus = jobs.reduce((acc,j) => { acc[j.status] = (acc[j.status]||0)+1; return acc; }, {});
  const completed = jobs.filter(j=>j.status==="Completed").length;
  const cancelled = jobs.filter(j=>j.status==="Cancelled").length;
  const completionRate = jobs.length > 0 ? Math.round((completed/jobs.length)*100) : 0;

  return (
    <div>
      <ReportKpis items={[
        { label:"Job cards created", value: jobs.length },
        { label:"Completed", value: completed },
        { label:"Cancelled", value: cancelled },
        { label:"Completion rate", value: `${completionRate}%` },
      ]} />
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {Object.entries(byStatus).map(([st,ct]) => <Stamp key={st} tone={statusTone(st)}>{st}: {ct}</Stamp>)}
      </div>
      <ReportTableCard title="Job cards" empty={jobs.length===0 ? "No job cards created in this period." : null} emptyIcon={ClipboardList}
        onExport={jobs.length ? ()=>exportCSV("operations.csv", ["Job Card","Customer","Service","Priority","Status","Created"],
          jobs.map(j=>[j.id, j.customer, j.service, j.priority, j.status, fmtDate(j.statusLog[0].at)])) : null}
        onExportExcel={jobs.length ? ()=>exportExcel("operations.xlsx", ["Job Card","Customer","Service","Priority","Status","Created"],
          jobs.map(j=>[j.id, j.customer, j.service, j.priority, j.status, fmtDate(j.statusLog[0].at)])) : null}>
        <table className="agw-table">
          <thead><tr><th>Job card</th><th>Customer</th><th>Service</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id}>
                <td className="mono">{j.id}</td><td>{j.customer}</td>
                <td style={{maxWidth:180}}>{j.service}</td><td>{j.priority}</td>
                <td><Stamp tone={statusTone(j.status)}>{j.status}</Stamp></td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(j.statusLog[0].at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

function EmployeeTasksReport({ state, range }) {
  const tasks = state.tasks.filter(t => inRange(t.createdAt, range));
  const completed = tasks.filter(t => t.status === "Completed").length;
  const pending = tasks.filter(t => !["Completed","Rejected","Cancelled"].includes(t.status)).length;
  const completionRate = tasks.length > 0 ? Math.round((completed/tasks.length)*100) : 0;
  const nameOf = (uid) => state.employees.find(e=>e.id===uid)?.name || uid;

  const columns = [
    { key:"id", label:"Task" }, { key:"title", label:"Title" }, { key:"assignee", label:"Assigned To" },
    { key:"priority", label:"Priority" }, { key:"status", label:"Status" }, { key:"progress", label:"Progress %" }, { key:"dueDate", label:"Due Date" },
  ];
  const pdfRows = tasks.map(t => ({ id:t.id, title:t.title, assignee: nameOf(t.assignedTo), priority:t.priority, status:t.status, progress:t.progressPct, dueDate: fmtDate(t.dueDate) }));

  return (
    <div>
      <ReportKpis items={[
        { label:"Tasks created", value: tasks.length },
        { label:"Completed", value: completed },
        { label:"Open", value: pending },
        { label:"Completion rate", value: `${completionRate}%` },
      ]} />
      <ReportTableCard title="Employee tasks" empty={tasks.length===0 ? "No tasks created in this period." : null} emptyIcon={ListChecks}
        onExport={tasks.length ? ()=>exportCSV("employee-tasks.csv", ["Task","Title","Assigned To","Priority","Status","Progress %","Due Date"],
          tasks.map(t=>[t.id, t.title, nameOf(t.assignedTo), t.priority, t.status, t.progressPct, t.dueDate||""])) : null}
        onExportExcel={tasks.length ? ()=>exportExcel("employee-tasks.xlsx", columns.map(c=>c.label), pdfRows.map(r=>columns.map(c=>r[c.key]))) : null}
        onExportPdf={tasks.length ? ()=>exportPdf("Employee Tasks", `${fmtDate(range[0])} – ${fmtDate(range[1])}`, columns, pdfRows) : null}>
        <table className="agw-table">
          <thead><tr><th>Task</th><th>Title</th><th>Assigned to</th><th>Priority</th><th>Status</th><th>Progress</th><th>Due date</th></tr></thead>
          <tbody>
            {tasks.map(t => (
              <tr key={t.id}>
                <td className="mono">{t.id}</td><td style={{maxWidth:200}}>{t.title}</td><td>{nameOf(t.assignedTo)}</td>
                <td>{t.priority}</td><td><Stamp tone={statusTone(t.status)}>{t.status}</Stamp></td>
                <td className="mono">{t.progressPct}%</td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(t.dueDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

// "Employee-wise Completion" and "Pending/Completed Tasks" are always today's live snapshot
// (matches the Dashboard widget); "Target Achievement" and "Revenue"/"Sales" respect the report's
// period picker; "Monthly Performance" is always the current calendar month regardless of the
// period picker — all computed client-side from state via the shared salesTasksHelpers, same as
// every other report tab here filters already-loaded state instead of calling a dedicated backend
// report endpoint.
function SalesDailyTasksReport({ state, range, salesFilter = [] }) {
  const defs = state.salesTaskDefs || [];
  if (defs.length === 0) return <Empty icon={ListChecks} text="Sales Daily Tasks aren't set up yet." />;

  const data = { logs: state.salesTaskLogs || [], quotations: state.quotations, salesOrders: state.salesOrders, invoices: state.invoices };
  const today = salesTaskToday();
  const from = range[0] || "2000-01-01";
  const to = range[1] || today;
  const monthStart = firstOfMonthStr();
  const allSalesUsers = state.employees.filter(e => e.roles.includes("sales_exec") || e.roles.includes("sales_manager"));
  const salesUsers = salesFilter.length ? allSalesUsers.filter(u => salesFilter.includes(u.id)) : allSalesUsers;

  const rows = salesUsers.map(owner => ({
    owner,
    today: userTaskSnapshot(defs, data, owner.id, today, today),
    period: userTaskSnapshot(defs, data, owner.id, from, to),
    month: userTaskSnapshot(defs, data, owner.id, monthStart, today),
  }));
  const avgCompletion = rows.length ? Math.round(rows.reduce((a,r)=>a+r.today.completionPct,0)/rows.length) : 0;
  const totalRevenue = rows.reduce((a,r)=>a+r.period.revenue,0);
  const totalSales = rows.reduce((a,r)=>a+r.period.sales,0);

  const columns = [
    { key:"employee", label:"Employee" }, { key:"completion", label:"Employee-wise Completion" }, { key:"target", label:"Target Achievement" },
    { key:"revenue", label:"Revenue" }, { key:"sales", label:"Sales" }, { key:"pending", label:"Pending Tasks" },
    { key:"completed", label:"Completed Tasks" }, { key:"monthly", label:"Monthly Performance" },
  ];
  const pdfRows = rows.map(r => ({
    employee: r.owner.name, completion: `${r.today.completionPct}%`, target: `${r.period.targetAchievementPct}%`,
    revenue: money(r.period.revenue), sales: money(r.period.sales), pending: r.today.pendingCount,
    completed: r.today.completedCount, monthly: `${r.month.completionPct}%`,
  }));

  return (
    <div>
      <ReportKpis items={[
        { label:"Salespeople tracked", value: rows.length },
        { label:"Avg. today's completion", value: `${avgCompletion}%` },
        { label:"Revenue (period)", value: money(totalRevenue) },
        { label:"Sales (period)", value: money(totalSales) },
      ]} />
      <ReportTableCard title="Sales Daily Tasks — employee performance" empty={rows.length===0 ? "No sales team members yet." : null} emptyIcon={ListChecks}
        onExport={rows.length ? ()=>exportCSV("sales-daily-tasks.csv", columns.map(c=>c.label), pdfRows.map(r=>columns.map(c=>r[c.key]))) : null}
        onExportExcel={rows.length ? ()=>exportExcel("sales-daily-tasks.xlsx", columns.map(c=>c.label), pdfRows.map(r=>columns.map(c=>r[c.key]))) : null}
        onExportPdf={rows.length ? ()=>exportPdf("Sales Daily Tasks", `${fmtDate(range[0])} – ${fmtDate(range[1])}`, columns, pdfRows) : null}>
        <table className="agw-table">
          <thead><tr><th>Employee</th><th>Completion</th><th>Target achievement</th><th>Revenue</th><th>Sales</th><th>Pending</th><th>Completed</th><th>Monthly</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.owner.id}>
                <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{r.owner.initials}</span>{r.owner.name}</td>
                <td className="mono" style={{ color: dailyCompletionColor(r.today.completionPct), fontWeight:600 }}>{r.today.completionPct}%</td>
                <td className="mono">{r.period.targetAchievementPct}%</td>
                <td className="mono">{money(r.period.revenue)}</td>
                <td className="mono">{money(r.period.sales)}</td>
                <td className="mono">{r.today.pendingCount}</td>
                <td className="mono">{r.today.completedCount}</td>
                <td className="mono">{r.month.completionPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

function LeadPerformanceReport({ state, range, salesFilter = [] }) {
  const leads = state.leads.filter(l => l.assignedAt && inRange(l.assignedAt, range) && (salesFilter.length === 0 || salesFilter.includes(l.owner)));
  const slaOf = (l) => {
    const met = (l.followUps||[]).some(f => f.at && new Date(f.at) >= new Date(l.assignedAt));
    if (met) return "Met";
    if (l.slaViolated || (l.slaDueAt && new Date(l.slaDueAt) < new Date())) return "Violated";
    return "Pending";
  };
  const met = leads.filter(l => slaOf(l)==="Met").length;
  const violated = leads.filter(l => slaOf(l)==="Violated").length;
  const slaRate = leads.length > 0 ? Math.round((met/leads.length)*100) : 0;
  const nameOf = (uid) => state.employees.find(e=>e.id===uid)?.name || uid;

  const columns = [
    { key:"id", label:"Lead" }, { key:"company", label:"Company" }, { key:"owner", label:"Owner" },
    { key:"assignedAt", label:"Assigned At" }, { key:"slaDueAt", label:"SLA Due" }, { key:"sla", label:"SLA" },
  ];
  const pdfRows = leads.map(l => ({ id:l.id, company:l.company, owner: nameOf(l.owner), assignedAt: fmtDate(l.assignedAt), slaDueAt: fmtDate(l.slaDueAt), sla: slaOf(l) }));

  return (
    <div>
      <ReportKpis items={[
        { label:"Leads assigned", value: leads.length },
        { label:"SLA met", value: met },
        { label:"SLA violated", value: violated },
        { label:"SLA rate", value: `${slaRate}%` },
      ]} />
      <ReportTableCard title="Lead assignment SLA performance" empty={leads.length===0 ? "No leads assigned in this period." : null} emptyIcon={UserPlus}
        onExport={leads.length ? ()=>exportCSV("lead-performance.csv", ["Lead","Company","Owner","Assigned At","SLA Due","SLA"],
          leads.map(l=>[l.id, l.company, nameOf(l.owner), l.assignedAt||"", l.slaDueAt||"", slaOf(l)])) : null}
        onExportExcel={leads.length ? ()=>exportExcel("lead-performance.xlsx", columns.map(c=>c.label), pdfRows.map(r=>columns.map(c=>r[c.key]))) : null}
        onExportPdf={leads.length ? ()=>exportPdf("Lead Performance", `${fmtDate(range[0])} – ${fmtDate(range[1])}`, columns, pdfRows) : null}>
        <table className="agw-table">
          <thead><tr><th>Lead</th><th>Company</th><th>Owner</th><th>Assigned at</th><th>SLA due</th><th>SLA</th></tr></thead>
          <tbody>
            {leads.map(l => (
              <tr key={l.id}>
                <td className="mono">{l.id}</td><td>{l.company}</td><td>{nameOf(l.owner)}</td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(l.assignedAt)}</td>
                <td className="mono" style={{fontSize:12}}>{fmtDate(l.slaDueAt)}</td>
                <td><Stamp tone={slaOf(l)==="Met" ? "success" : slaOf(l)==="Violated" ? "danger" : "warning"}>{slaOf(l)}</Stamp></td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

function AttendanceHoursReport({ state, range, userId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let cancelled = false;
    // This report fetches its own data server-side (attendance can span a long history), so the
    // "own only" scoping ReportsPage applies to every other tab's client-side state has to be
    // passed through as an explicit userId here instead — undefined for full-access roles fetches
    // everyone, same as before.
    api.hr.attendanceSummary(range[0], range[1], userId).then(data => { if (!cancelled) setRows(Array.isArray(data) ? data : [data]); }).catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [range[0], range[1], userId]);

  const nameOf = (uid) => state.employees.find(e=>e.id===uid)?.name || uid;
  const deptOf = (uid) => state.employees.find(e=>e.id===uid)?.dept || "";
  const loaded = rows !== null;
  const list = rows || [];
  const totalHours = list.reduce((a,r)=>a+r.totalHours,0);
  const totalLate = list.reduce((a,r)=>a+r.lateCount,0);

  const columns = [
    { key:"employee", label:"Employee" }, { key:"department", label:"Department" }, { key:"presentDays", label:"Present Days" },
    { key:"totalHours", label:"Total Hours" }, { key:"lateCount", label:"Late Arrivals" }, { key:"earlyCount", label:"Early Departures" },
  ];
  const pdfRows = list.map(r => ({ employee: nameOf(r.userId), department: deptOf(r.userId), presentDays: r.presentDays, totalHours: r.totalHours, lateCount: r.lateCount, earlyCount: r.earlyCount }));

  return (
    <div>
      <ReportKpis items={[
        { label:"Employees", value: list.length },
        { label:"Total hours logged", value: totalHours.toFixed(1) },
        { label:"Late arrivals", value: totalLate },
      ]} />
      <ReportTableCard title="Attendance — hours & lateness" empty={!loaded ? "Loading…" : list.length===0 ? "No attendance records in this period." : null} emptyIcon={Clock}
        onExport={list.length ? ()=>exportCSV("attendance-hours.csv", ["Employee","Department","Present Days","Total Hours","Late Arrivals","Early Departures"],
          list.map(r=>[nameOf(r.userId), deptOf(r.userId), r.presentDays, r.totalHours, r.lateCount, r.earlyCount])) : null}
        onExportExcel={list.length ? ()=>exportExcel("attendance-hours.xlsx", columns.map(c=>c.label), pdfRows.map(r=>columns.map(c=>r[c.key]))) : null}
        onExportPdf={list.length ? ()=>exportPdf("Attendance", `${fmtDate(range[0])} – ${fmtDate(range[1])}`, columns, pdfRows) : null}>
        <table className="agw-table">
          <thead><tr><th>Employee</th><th>Department</th><th>Present days</th><th>Total hours</th><th>Late arrivals</th><th>Early departures</th></tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.userId}>
                <td>{nameOf(r.userId)}</td><td>{deptOf(r.userId)}</td>
                <td>{r.presentDays}</td><td className="mono">{r.totalHours}h</td>
                <td>{r.lateCount > 0 ? <Stamp tone="warning">{r.lateCount}</Stamp> : "—"}</td>
                <td>{r.earlyCount > 0 ? <Stamp tone="warning">{r.earlyCount}</Stamp> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* DATA MANAGER                                                            */
/* ---------------------------------------------------------------------- */

const ARCHIVE_REASONS = ["Email Bounced","No WhatsApp Number","Invalid Email","Wrong Mobile Number","Wrong Information"];
const normPhone = (p) => (p||"").replace(/[^\d]/g,"");
const normEmail = (e) => (e||"").trim().toLowerCase();
const normCompany = (c) => (c||"").trim().toLowerCase();

function findDuplicateDataRecord(records, { mobile, email, companyName }, excludeId=null) {
  const m = normPhone(mobile), e = normEmail(email), c = normCompany(companyName);
  return records.find(d => d.id !== excludeId && (
    (m && normPhone(d.mobile) === m) ||
    (e && normEmail(d.email) === e) ||
    (c && normCompany(d.companyName) === c)
  ));
}
// state.dataUserActivity only ever holds today's rows (GET /data-manager/activity filters server-
// side by activity_date) — a user with no row yet today just hasn't sent/called anything, not an
// error, so the zero default below is the normal case for most of the team most mornings.
function todayDataActivity(emp, state) {
  const row = (state?.dataUserActivity || []).find(a => a.userId === emp.id);
  return row || { emailsSent: 0, whatsappsSent: 0, callsCompleted: 0, lastEmailAt: null, lastWhatsappAt: null, lastCallAt: null };
}
const minutesSince = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity;

function DataManagerPage({ state, dispatch, role, userId }) {
  const [, forceTick] = useState(0);
  useEffect(() => { const t = setInterval(() => forceTick(x => x+1), 15000); return () => clearInterval(t); }, []);
  const canManage = role === "data_manager" || ADMIN_LIKE.includes(role);
  const [tab, setTab] = useState(canManage ? "pool" : "my");

  const tabs = canManage
    ? [{key:"pool",label:"Company Data Pool"},{key:"my",label:"My Data"},{key:"byUser",label:"By User"},{key:"datasets",label:"Data Sets"},{key:"add",label:"Add Data"},{key:"archived",label:"Archived Data"},{key:"templates",label:"Templates"},{key:"settings",label:"Settings"},{key:"reports",label:"Reports"}]
    : [{key:"my",label:"My Data"},{key:"add",label:"Add Data"}];

  return (
    <div>
      <div className="tabbar" style={{ marginBottom: 16 }}>
        {tabs.map(t => <button key={t.key} className={`tab ${tab===t.key?"active":""}`} onClick={()=>setTab(t.key)}>{t.label}</button>)}
      </div>
      {tab === "my" && <MyDataTab state={state} dispatch={dispatch} role={role} userId={userId} />}
      {tab === "pool" && canManage && <DataPoolTab state={state} dispatch={dispatch} role={role} userId={userId} />}
      {tab === "byUser" && canManage && <DataByUserTab state={state} />}
      {tab === "datasets" && canManage && <DataSetsTab state={state} dispatch={dispatch} />}
      {tab === "add" && <AddDataTab state={state} dispatch={dispatch} role={role} userId={userId} />}
      {tab === "archived" && canManage && <ArchivedDataTab state={state} dispatch={dispatch} />}
      {tab === "templates" && canManage && <DataTemplatesTab state={state} dispatch={dispatch} />}
      {tab === "settings" && canManage && <DataSettingsTab state={state} dispatch={dispatch} />}
      {tab === "reports" && canManage && <DataReportsTab state={state} dispatch={dispatch} />}
    </div>
  );
}

function MyDataTab({ state, dispatch, role, userId }) {
  const me = state.employees.find(e => e.id === userId);
  const settings = state.dataSettings;
  const act = todayDataActivity(me, state);
  const myRecords = state.dataRecords.filter(d =>
    d.status !== "Archived" && d.status !== "Converted to Lead" &&
    ((d.dataCategory === "Own" && d.dataOwner === userId) || (d.dataCategory === "Company" && d.assignedUser === userId))
  );
  const ownCount = myRecords.filter(d=>d.dataCategory==="Own").length;
  const companyCount = myRecords.filter(d=>d.dataCategory==="Company").length;
  const pendingFollowups = myRecords.filter(d => !d.emailSentAt && !d.whatsappSentAt).length;
  const pg = usePagination(myRecords);

  const [convertFor, setConvertFor] = useState(null);
  const [archiveFor, setArchiveFor] = useState(null);
  const [emailFor, setEmailFor] = useState(null);
  const [whatsappFor, setWhatsappFor] = useState(null);

  // A record that was already emailed/WhatsApp'd stays off-limits for a full month regardless of
  // who's sending or the team's daily pacing — re-contacting too soon reads as spam to the
  // recipient. Separate from (and checked before) the per-user daily-cap/interval limits below.
  const RECONTACT_COOLDOWN_DAYS = 30;
  const recontactBlockedReason = (sentAt) => {
    if (!sentAt) return null;
    const days = daysSince(sentAt);
    if (days >= RECONTACT_COOLDOWN_DAYS) return null;
    return `Contacted ${days}d ago — again in ${RECONTACT_COOLDOWN_DAYS - days}d`;
  };
  const emailBlockedReason = (d) => {
    if (!d.email) return "No email";
    const recontact = recontactBlockedReason(d.emailSentAt);
    if (recontact) return recontact;
    if (act.emailsSent >= settings.dailyEmailTarget) return "Daily limit reached";
    const mins = minutesSince(act.lastEmailAt);
    if (mins < settings.emailIntervalMinutes) return `Wait ${Math.ceil(settings.emailIntervalMinutes - mins)}m`;
    return null;
  };
  const whatsappBlockedReason = (d) => {
    if (!d.mobile) return "No mobile";
    const recontact = recontactBlockedReason(d.whatsappSentAt);
    if (recontact) return recontact;
    if (act.whatsappsSent >= settings.dailyWhatsappTarget) return "Daily limit reached";
    const mins = minutesSince(act.lastWhatsappAt);
    if (mins < settings.whatsappIntervalMinutes) return `Wait ${Math.ceil(settings.whatsappIntervalMinutes - mins)}m`;
    return null;
  };
  const callBlockedReason = (d) => {
    if (!d.mobile) return "No mobile";
    const recontact = recontactBlockedReason(d.callCompletedAt);
    if (recontact) return recontact;
    if (act.callsCompleted >= settings.dailyCallTarget) return "Daily limit reached";
    return null;
  };

  const confirmSendEmail = (d, subject, body) => {
    const a = document.createElement("a");
    a.href = `mailto:${d.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    dispatch({ type:"SEND_DATA_EMAIL", id:d.id, userId });
  };
  const confirmSendWhatsapp = (d, text) => {
    const a = document.createElement("a");
    a.href = `https://wa.me/${normPhone(d.mobile)}?text=${encodeURIComponent(text)}`;
    a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    dispatch({ type:"SEND_DATA_WHATSAPP", id:d.id, userId });
  };
  const markCallCompleted = (d) => dispatch({ type:"COMPLETE_DATA_CALL", id:d.id, userId });

  return (
    <div>
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(6,1fr)", marginBottom: 12 }}>
        <div className="agw-card"><div className="kpi-label">Today's available data</div><div className="kpi-value disp">{myRecords.length}</div></div>
        <div className="agw-card"><div className="kpi-label">Own data</div><div className="kpi-value disp">{ownCount}</div></div>
        <div className="agw-card"><div className="kpi-label">Company assigned</div><div className="kpi-value disp">{companyCount}</div></div>
        <div className="agw-card"><div className="kpi-label">Email progress</div><div className="kpi-value disp">{act.emailsSent}/{settings.dailyEmailTarget}</div></div>
        <div className="agw-card"><div className="kpi-label">WhatsApp progress</div><div className="kpi-value disp">{act.whatsappsSent}/{settings.dailyWhatsappTarget}</div></div>
        <div className="agw-card"><div className="kpi-label">Call progress</div><div className="kpi-value disp">{act.callsCompleted}/{settings.dailyCallTarget}</div></div>
      </div>
      <div className="side-note" style={{ marginBottom: 16 }}>{pendingFollowups} record{pendingFollowups!==1?"s":""} pending first contact.</div>

      <div className="agw-card" style={{ padding: 0 }}>
        {myRecords.length === 0 ? <Empty icon={Database} text="No data assigned yet — check Add Data or wait for the daily auto-assignment." /> : (
        <div style={{ overflowX:"auto" }}>
        <table className="agw-table" style={{ minWidth: 1080 }}>
          <thead><tr><th>Company</th><th>Contact</th><th>Mobile</th><th>Email</th><th>Category</th><th>Status</th><th>Email</th><th>WhatsApp</th><th>Call</th><th></th></tr></thead>
          <tbody>
            {pg.pageRows.map(d => {
              const eDis = emailBlockedReason(d), wDis = whatsappBlockedReason(d), cDis = callBlockedReason(d);
              return (
                <tr key={d.id}>
                  <td>{d.companyName}<div className="mono" style={{fontSize:11,color:"var(--ink-soft)"}}>{d.id}</div></td>
                  <td>{d.contactName}</td>
                  <td className="mono" style={{fontSize:12}}>{d.mobile}</td>
                  <td style={{fontSize:12}}>{d.email}</td>
                  <td><span className="pill">{d.dataCategory}</span></td>
                  <td><Stamp tone={statusTone(d.status)}>{d.status}</Stamp></td>
                  <td>{d.emailSentAt ? <Stamp tone="success">Sent</Stamp> : <button className="btn btn-sm" disabled={!!eDis} title={eDis||"Send email"} onClick={()=>setEmailFor(d)}><Mail size={12}/> Email</button>}</td>
                  <td>{d.whatsappSentAt ? <Stamp tone="success">Delivered</Stamp> : <button className="btn btn-sm" disabled={!!wDis} title={wDis||"Send WhatsApp"} onClick={()=>setWhatsappFor(d)}><MessageCircle size={12}/> WhatsApp</button>}</td>
                  <td>{d.callCompletedAt ? <Stamp tone="success">Completed</Stamp> : <button className="btn btn-sm" disabled={!!cDis} title={cDis||"Mark call completed"} onClick={()=>markCallCompleted(d)}><Phone size={12}/> Call</button>}</td>
                  <td style={{ display:"flex", gap:6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={()=>setConvertFor(d)}>Convert</button>
                    <button className="btn btn-sm btn-ghost" style={{color:"var(--danger)"}} onClick={()=>setArchiveFor(d)}>Invalid</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>)}
        <PaginationBar {...pg} />
      </div>

      {convertFor && <ConfirmModal title={`Convert ${convertFor.id} to a lead?`} body={`${convertFor.companyName} — this creates a new CRM lead linked back to this data record.`} confirmLabel="Convert"
        onConfirm={()=>dispatch({type:"CONVERT_DATA_TO_LEAD", id:convertFor.id, by:userId})} onClose={()=>setConvertFor(null)} />}
      {archiveFor && <ArchiveDataModal record={archiveFor} dispatch={dispatch} onClose={()=>setArchiveFor(null)} />}
      {emailFor && <SendDataEmailModal record={emailFor} settings={settings} onConfirm={confirmSendEmail} onClose={()=>setEmailFor(null)} />}
      {whatsappFor && <SendDataWhatsappModal record={whatsappFor} settings={settings} onConfirm={confirmSendWhatsapp} onClose={()=>setWhatsappFor(null)} />}
    </div>
  );
}

function SendDataEmailModal({ record, settings, onConfirm, onClose }) {
  const [subject, setSubject] = useState(settings.emailTemplate.subject);
  const [body, setBody] = useState(settings.emailTemplate.body);
  return (
    <Modal title="Send email" sub="Review the content before sending." onClose={onClose} width={520}>
      <div className="field"><label>To</label><input value={`${record.contactName ? record.contactName+" — " : ""}${record.email}`} disabled style={{ background:"var(--page)" }} /></div>
      <div className="field"><label>Subject</label><input value={subject} onChange={e=>setSubject(e.target.value)} /></div>
      <div className="field"><label>Message</label><textarea rows={7} value={body} onChange={e=>setBody(e.target.value)} /></div>
      <div className="side-note" style={{ marginTop:0 }}>Confirming opens your email app with this message ready to send, and logs it against {record.id}.</div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>{ onConfirm(record, subject, body); onClose(); }}><Mail size={14}/> Confirm & send</button>
      </div>
    </Modal>
  );
}

function SendDataWhatsappModal({ record, settings, onConfirm, onClose }) {
  const [text, setText] = useState(settings.whatsappTemplate.body);
  return (
    <Modal title="Send WhatsApp" sub="Review the message before sending." onClose={onClose} width={480}>
      <div className="field"><label>To</label><input value={`${record.contactName ? record.contactName+" — " : ""}${record.mobile}`} disabled style={{ background:"var(--page)" }} /></div>
      <div className="field"><label>Message</label><textarea rows={7} value={text} onChange={e=>setText(e.target.value)} /></div>
      <div className="side-note" style={{ marginTop:0 }}>Confirming opens WhatsApp with this message ready to send, and logs it against {record.id}.</div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>{ onConfirm(record, text); onClose(); }}><MessageCircle size={14}/> Confirm & send</button>
      </div>
    </Modal>
  );
}

function ArchiveDataModal({ record, dispatch, onClose }) {
  const [reason, setReason] = useState(ARCHIVE_REASONS[0]);
  return (
    <Modal title={`Mark ${record.id} as invalid`} sub={record.companyName} onClose={onClose}>
      <div className="field"><label>Reason</label>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          {ARCHIVE_REASONS.map(r=><option key={r}>{r}</option>)}
        </select>
      </div>
      <div className="side-note" style={{ marginTop:0 }}>This moves the record to Archived Data permanently — it can't be assigned again or enter the daily pool.</div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{background:"var(--danger)",borderColor:"var(--danger)"}} onClick={()=>{ dispatch({type:"MARK_DATA_INVALID", id:record.id, reason}); onClose(); }}>Archive</button>
      </div>
    </Modal>
  );
}

function DataPoolTab({ state, dispatch, role, userId }) {
  const pool = state.dataRecords.filter(d => d.dataCategory === "Company" && d.status !== "Archived" && d.status !== "Converted to Lead");
  const unassigned = pool.filter(d => !d.assignedUser);
  const assigned = pool.filter(d => d.assignedUser);
  const ownTotal = state.dataRecords.filter(d => d.dataCategory==="Own" && d.status!=="Archived" && d.status!=="Converted to Lead").length;
  const [assignFor, setAssignFor] = useState(null);
  const salesUsers = state.employees.filter(e => e.active !== false && e.roles.some(r => ["sales_exec","sales_manager"].includes(r)));
  const pg = usePagination(pool);

  return (
    <div>
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 18 }}>
        <div className="agw-card"><div className="kpi-label">Company Data Pool (unassigned)</div><div className="kpi-value disp">{unassigned.length}</div></div>
        <div className="agw-card"><div className="kpi-label">Assigned company data</div><div className="kpi-value disp">{assigned.length}</div></div>
        <div className="agw-card"><div className="kpi-label">Own data (all users)</div><div className="kpi-value disp">{ownTotal}</div></div>
        <div className="agw-card"><div className="kpi-label">Sales users</div><div className="kpi-value disp">{salesUsers.length}</div></div>
      </div>

      <div className="agw-card" style={{ padding: 0 }}>
        {pool.length === 0 ? <Empty icon={Database} text="Company Data Pool is empty — import data to get started." /> : (
        <div style={{ overflowX:"auto" }}>
        <table className="agw-table" style={{ minWidth: 860 }}>
          <thead><tr><th>Company</th><th>Contact</th><th>Mobile</th><th>Email</th><th>Business category</th><th>Assigned to</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {pg.pageRows.map(d => (
              <tr key={d.id}>
                <td>{d.companyName}<div className="mono" style={{fontSize:11,color:"var(--ink-soft)"}}>{d.id}</div></td>
                <td>{d.contactName}</td>
                <td className="mono" style={{fontSize:12}}>{d.mobile}</td>
                <td style={{fontSize:12}}>{d.email}</td>
                <td><span className="pill">{d.businessCategory || "—"}</span></td>
                <td>{d.assignedUser ? state.employees.find(e=>e.id===d.assignedUser)?.name : <span className="pill">Unassigned</span>}</td>
                <td><Stamp tone={statusTone(d.status)}>{d.status}</Stamp></td>
                <td><button className="btn btn-sm" onClick={()=>setAssignFor(d)}>{d.assignedUser ? "Reassign" : "Assign"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>)}
        <PaginationBar {...pg} />
      </div>

      {assignFor && <AssignDataModal record={assignFor} salesUsers={salesUsers} dispatch={dispatch} onClose={()=>setAssignFor(null)} />}
    </div>
  );
}

function AssignDataModal({ record, salesUsers, dispatch, onClose }) {
  const [uid, setUid] = useState(record.assignedUser || "");
  return (
    <Modal title={`${record.assignedUser ? "Reassign" : "Assign"} ${record.id}`} sub={record.companyName} onClose={onClose}>
      <div className="field"><label>Assign to</label>
        <select value={uid} onChange={e=>setUid(e.target.value)}>
          <option value="">— Unassigned —</option>
          {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={()=>{ dispatch({type:"ASSIGN_DATA_RECORD", id:record.id, userId: uid || null}); onClose(); }}>Save</button>
      </div>
    </Modal>
  );
}

// Read-only per-record status columns shared by DataByUserTab and DataSetsTab — a simple Stamp
// once done, since these are just for viewing another user's progress, not acting on it (sending/
// calling stays on that user's own My Data tab).
function DataChannelStatus({ done, doneLabel }) {
  return done ? <Stamp tone="success">{doneLabel}</Stamp> : <span style={{ color:"var(--ink-soft)", fontSize:12 }}>—</span>;
}

// "data manager can see each user's list" — pick any sales user and view everything assigned to
// or owned by them, same shape as their own My Data tab but read-only (sending/calling stays with
// the owning user).
function DataByUserTab({ state }) {
  const salesUsers = state.employees.filter(e => e.roles.some(r => ["sales_exec","sales_manager"].includes(r)));
  const [uid, setUid] = useState(salesUsers[0]?.id || "");
  const rows = state.dataRecords.filter(d =>
    (d.dataCategory === "Own" && d.dataOwner === uid) || (d.dataCategory === "Company" && d.assignedUser === uid)
  );
  const pg = usePagination(rows);

  return (
    <div>
      <div className="field" style={{ maxWidth: 320, marginBottom: 16 }}>
        <label>Salesperson</label>
        <select value={uid} onChange={e=>setUid(e.target.value)}>
          {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <ReportTableCard title={`${state.employees.find(e=>e.id===uid)?.name || "—"}'s data`} empty={rows.length===0 ? "No data assigned to this user." : null} emptyIcon={Database}>
        <table className="agw-table">
          <thead><tr><th>Company</th><th>Contact</th><th>Mobile</th><th>Email</th><th>Category</th><th>Status</th><th>Email</th><th>WhatsApp</th><th>Call</th></tr></thead>
          <tbody>
            {pg.pageRows.map(d => (
              <tr key={d.id}>
                <td>{d.companyName}<div className="mono" style={{fontSize:11,color:"var(--ink-soft)"}}>{d.id}</div></td>
                <td>{d.contactName}</td>
                <td className="mono" style={{fontSize:12}}>{d.mobile}</td>
                <td style={{fontSize:12}}>{d.email}</td>
                <td><span className="pill">{d.dataCategory}</span></td>
                <td><Stamp tone={statusTone(d.status)}>{d.status}</Stamp></td>
                <td><DataChannelStatus done={!!d.emailSentAt} doneLabel="Sent" /></td>
                <td><DataChannelStatus done={!!d.whatsappSentAt} doneLabel="Delivered" /></td>
                <td><DataChannelStatus done={!!d.callCompletedAt} doneLabel="Completed" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar {...pg} />
      </ReportTableCard>
    </div>
  );
}

// "each set data can select and see report — final curated data — we can export." Data Set Name
// is just a free-text label set at Add Data/Import time (AddDataTab), so the set list here is
// derived from whatever distinct values actually show up on records, not a separately managed
// entity — deliberately simple, per how this was asked for.
function DataSetsTab({ state, dispatch }) {
  const datasetNames = [...new Set(state.dataRecords.map(d => d.datasetName).filter(Boolean))].sort();
  const [selected, setSelected] = useState(datasetNames[0] || "");
  const rows = selected ? state.dataRecords.filter(d => d.datasetName === selected) : [];
  const pg = usePagination(rows);

  const stats = {
    total: rows.length,
    emailSent: rows.filter(d=>d.emailSentAt).length,
    whatsappDelivered: rows.filter(d=>d.whatsappSentAt).length,
    callCompleted: rows.filter(d=>d.callCompletedAt).length,
    converted: rows.filter(d=>d.status==="Converted to Lead").length,
    archived: rows.filter(d=>d.status==="Archived").length,
  };

  const runExport = () => {
    const headers = ["ID","Company Name","Contact Person","Mobile","Email","Data Category","Status","Email Sent","WhatsApp Delivered","Call Completed","Assigned To"];
    const dataRows = rows.map(d=>[d.id, d.companyName, d.contactName, d.mobile, d.email, d.dataCategory, d.status,
      d.emailSentAt ? "Yes" : "No", d.whatsappSentAt ? "Yes" : "No", d.callCompletedAt ? "Yes" : "No",
      state.employees.find(e=>e.id===(d.assignedUser||d.dataOwner))?.name || ""]);
    exportCSV(`data-set-${selected.replace(/\s+/g,"-").toLowerCase()}.csv`, headers, dataRows);
    dispatch({ type:"LOG_DATA_EXPORT", exportedBy:"Data Manager", count: rows.length, purpose: `Data Set: ${selected}`, format: "CSV" });
  };

  if (datasetNames.length === 0) return <Empty icon={Database} text="No named data sets yet — give a data set a name in Add Data or Import to see it here." />;

  return (
    <div>
      <div className="field" style={{ maxWidth: 360, marginBottom: 16 }}>
        <label>Data set</label>
        <select value={selected} onChange={e=>setSelected(e.target.value)}>
          {datasetNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(6,1fr)", marginBottom: 18 }}>
        <div className="agw-card"><div className="kpi-label">Total</div><div className="kpi-value disp">{stats.total}</div></div>
        <div className="agw-card"><div className="kpi-label">Email sent</div><div className="kpi-value disp">{stats.emailSent}</div></div>
        <div className="agw-card"><div className="kpi-label">WhatsApp delivered</div><div className="kpi-value disp">{stats.whatsappDelivered}</div></div>
        <div className="agw-card"><div className="kpi-label">Call completed</div><div className="kpi-value disp">{stats.callCompleted}</div></div>
        <div className="agw-card"><div className="kpi-label">Converted to leads</div><div className="kpi-value disp">{stats.converted}</div></div>
        <div className="agw-card"><div className="kpi-label">Archived</div><div className="kpi-value disp">{stats.archived}</div></div>
      </div>

      <ReportTableCard title={selected} onExport={rows.length ? runExport : null} empty={rows.length===0 ? "No records in this data set." : null} emptyIcon={Database}>
        <table className="agw-table">
          <thead><tr><th>Company</th><th>Contact</th><th>Mobile</th><th>Email</th><th>Category</th><th>Assigned to</th><th>Status</th><th>Email</th><th>WhatsApp</th><th>Call</th></tr></thead>
          <tbody>
            {pg.pageRows.map(d => (
              <tr key={d.id}>
                <td>{d.companyName}<div className="mono" style={{fontSize:11,color:"var(--ink-soft)"}}>{d.id}</div></td>
                <td>{d.contactName}</td>
                <td className="mono" style={{fontSize:12}}>{d.mobile}</td>
                <td style={{fontSize:12}}>{d.email}</td>
                <td><span className="pill">{d.dataCategory}</span></td>
                <td>{state.employees.find(e=>e.id===(d.assignedUser||d.dataOwner))?.name || "—"}</td>
                <td><Stamp tone={statusTone(d.status)}>{d.status}</Stamp></td>
                <td><DataChannelStatus done={!!d.emailSentAt} doneLabel="Sent" /></td>
                <td><DataChannelStatus done={!!d.whatsappSentAt} doneLabel="Delivered" /></td>
                <td><DataChannelStatus done={!!d.callCompletedAt} doneLabel="Completed" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar {...pg} />
      </ReportTableCard>
    </div>
  );
}

function AddDataTab({ state, dispatch, role, userId }) {
  const canManage = role === "data_manager" || ADMIN_LIKE.includes(role);
  const blank = { companyName:"", contactName:"", mobile:"", email:"", reference:"", source:"", businessCategory:"", location:"", dataCategory:"Own", datasetName:"", assignTo:"" };
  const [form, setForm] = useState(blank);
  const [dupError, setDupError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  // Same pool DataPoolTab's Assign draws from — a data set can be handed straight to a rep at
  // upload time instead of always landing in the pool for a separate assign step afterward.
  const assignableUsers = state.employees.filter(e => e.active !== false && e.roles.some(r => ["sales_exec","sales_manager"].includes(r)));

  const submit = () => {
    const dup = findDuplicateDataRecord(state.dataRecords, form);
    if (dup) { setDupError(`Duplicate Data Already Exists (matches ${dup.id} — ${dup.companyName})`); return; }
    dispatch({ type:"ADD_DATA_RECORD", payload: { ...form, dataOwner: form.dataCategory==="Own" ? userId : null, createdBy: userId } });
    setForm(blank); setDupError(null);
  };

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  // Parsing and dedup happen server-side (the same logic the manual "Add data" form's duplicate
  // check runs against) so this only ever dedupes against records this browser has actually
  // loaded — a sales_exec's local state.dataRecords is scoped to their own data, so a client-side
  // check here would miss company-wide duplicates and silently let them through.
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const result = await dispatch({ type:"IMPORT_DATA_RECORDS", file, dataCategory: form.dataCategory, datasetName: form.datasetName, assignTo: form.assignTo });
      setImportResult(result);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Import failed — please try again.");
    } finally {
      setImporting(false);
    }
  };

  const downloadSampleTemplate = () => {
    const headers = ["Company Name","Contact Person Name","Mobile Number","Email Address","Reference","Source","Business Category","Location"];
    const sampleRow = ["Al Waha Trading","Ahmed Al Sayed","+974 5511 2233","ahmed@alwaha.qa","Referred by Sameer","LinkedIn","Trading","Doha"];
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, "data-import-sample.xlsx");
  };

  return (
    <div className="agw-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <div className="agw-card">
        <strong style={{ fontSize:14 }}>Add data manually</strong>
        {dupError && <div className="side-note" style={{ borderColor:"#EFC3BC", background:"var(--danger-tint)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{dupError}</div>}
        <div className="field" style={{ marginTop:10 }}><label>Data Set Name (optional)</label><input value={form.datasetName} onChange={e=>setForm({...form,datasetName:e.target.value})} placeholder="e.g. August Trade Fair List" /></div>
        <div className="row2">
          <div className="field"><label>Company Name</label><input value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} /></div>
          <div className="field"><label>Contact Person Name</label><input value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>Mobile Number</label><input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})} placeholder="+974 ..." /></div>
          <div className="field"><label>Email Address</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>Reference</label><input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} /></div>
          <div className="field"><label>Source</label><input value={form.source} onChange={e=>setForm({...form,source:e.target.value})} placeholder="LinkedIn, Trade directory..." /></div>
        </div>
        <div className="row2">
          <div className="field"><label>Business Category</label><input value={form.businessCategory} onChange={e=>setForm({...form,businessCategory:e.target.value})} /></div>
          <div className="field"><label>Location (optional)</label><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} /></div>
        </div>
        {canManage && (
          <div className="row2">
            <div className="field"><label>Data Category</label>
              <select value={form.dataCategory} onChange={e=>setForm({...form,dataCategory:e.target.value})}>
                <option value="Own">Own Data</option>
                <option value="Company">Company Provided Data</option>
              </select>
            </div>
            {form.dataCategory === "Company" && (
              <div className="field"><label>Assign to (optional)</label>
                <select value={form.assignTo} onChange={e=>setForm({...form,assignTo:e.target.value})}>
                  <option value="">— Leave in pool —</option>
                  {assignableUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        <button className="btn btn-primary" disabled={!form.companyName || (!form.mobile && !form.email)} onClick={submit}>Add data</button>
      </div>

      <div className="agw-card">
        <strong style={{ fontSize:14 }}>Import from Excel</strong>
        <p className="modal-sub">Upload a .xlsx, .xls or .csv file. Duplicate records (matched by mobile, email, or company name) are skipped automatically — the entire database stays duplicate-free.</p>
        <button className="btn btn-sm btn-ghost" onClick={downloadSampleTemplate} style={{ marginBottom:10 }}>
          <Download size={13} /> Download sample template
        </button>
        <div className="field"><label>Data Set Name (optional)</label><input value={form.datasetName} onChange={e=>setForm({...form,datasetName:e.target.value})} placeholder="e.g. August Trade Fair List" /></div>
        {canManage && (
          <div className="row2">
            <div className="field"><label>Import as</label>
              <select value={form.dataCategory} onChange={e=>setForm({...form,dataCategory:e.target.value})}>
                <option value="Own">Own Data</option>
                <option value="Company">Company Provided Data</option>
              </select>
            </div>
            {form.dataCategory === "Company" && (
              <div className="field"><label>Assign to (optional)</label>
                <select value={form.assignTo} onChange={e=>setForm({...form,assignTo:e.target.value})}>
                  <option value="">— Leave in pool —</option>
                  {assignableUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={importing} />
        {importing && <div className="side-note" style={{ marginTop:12 }}>Importing…</div>}
        {importError && <div className="side-note" style={{ marginTop:12, color:"var(--danger)" }}><AlertTriangle size={13} style={{verticalAlign:-2,marginRight:4}}/>{importError}</div>}
        {importResult && (
          <div className="side-note" style={{ marginTop:12 }}>
            {importResult.total} row{importResult.total!==1?"s":""} read — {importResult.imported} imported, {importResult.duplicates} duplicate{importResult.duplicates!==1?"s":""} skipped.
          </div>
        )}
      </div>
    </div>
  );
}

function ArchivedDataTab({ state, dispatch }) {
  const rows = state.dataRecords.filter(d => d.status === "Archived");
  const pg = usePagination(rows);
  return (
    <ReportTableCard title="Archived data" empty={rows.length===0 ? "No archived records." : null} emptyIcon={ArchiveX}
      onExport={rows.length ? ()=>exportCSV("archived-data.csv", ["ID","Company","Contact","Mobile","Email","Reason","Category"],
        rows.map(d=>[d.id,d.companyName,d.contactName,d.mobile,d.email,d.archivedReason,d.dataCategory])) : null}>
      <table className="agw-table">
        <thead><tr><th>Company</th><th>Contact</th><th>Mobile</th><th>Email</th><th>Reason</th><th>Category</th></tr></thead>
        <tbody>
          {pg.pageRows.map(d => (
            <tr key={d.id}>
              <td>{d.companyName}</td><td>{d.contactName}</td>
              <td className="mono" style={{fontSize:12}}>{d.mobile}</td><td style={{fontSize:12}}>{d.email}</td>
              <td><Stamp tone="danger">{d.archivedReason}</Stamp></td>
              <td><span className="pill">{d.dataCategory}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationBar {...pg} />
    </ReportTableCard>
  );
}

function DataTemplatesTab({ state, dispatch }) {
  const [subject, setSubject] = useState(state.dataSettings.emailTemplate.subject);
  const [body, setBody] = useState(state.dataSettings.emailTemplate.body);
  const [waBody, setWaBody] = useState(state.dataSettings.whatsappTemplate.body);
  return (
    <div className="agw-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <div className="agw-card">
        <strong style={{ fontSize:14 }}>Default email template</strong>
        <div className="field" style={{ marginTop:10 }}><label>Subject</label><input value={subject} onChange={e=>setSubject(e.target.value)} /></div>
        <div className="field"><label>Message</label><textarea rows={8} value={body} onChange={e=>setBody(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={()=>dispatch({type:"UPDATE_DATA_SETTINGS", payload:{emailTemplate:{subject,body}}})}>Save email template</button>
      </div>
      <div className="agw-card">
        <strong style={{ fontSize:14 }}>Default WhatsApp template</strong>
        <div className="field" style={{ marginTop:10 }}><label>Message</label><textarea rows={10} value={waBody} onChange={e=>setWaBody(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={()=>dispatch({type:"UPDATE_DATA_SETTINGS", payload:{whatsappTemplate:{body:waBody}}})}>Save WhatsApp template</button>
      </div>
    </div>
  );
}

function DataSettingsTab({ state, dispatch }) {
  const s = state.dataSettings;
  const [form, setForm] = useState({ dailyEmailTarget:s.dailyEmailTarget, dailyWhatsappTarget:s.dailyWhatsappTarget, dailyCallTarget:s.dailyCallTarget,
    emailIntervalMinutes:s.emailIntervalMinutes, whatsappIntervalMinutes:s.whatsappIntervalMinutes,
    recyclingEnabled:s.recyclingEnabled, recyclingDays:s.recyclingDays });
  return (
    <div className="agw-card" style={{ maxWidth: 560 }}>
      <strong style={{ fontSize:14 }}>Daily outreach targets</strong>
      <div className="row3" style={{ marginTop:10 }}>
        <div className="field"><label>Daily email target</label><input type="number" value={form.dailyEmailTarget} onChange={e=>setForm({...form,dailyEmailTarget:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
        <div className="field"><label>Daily WhatsApp target</label><input type="number" value={form.dailyWhatsappTarget} onChange={e=>setForm({...form,dailyWhatsappTarget:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
        <div className="field"><label>Daily call target</label><input type="number" value={form.dailyCallTarget} onChange={e=>setForm({...form,dailyCallTarget:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Email interval (minutes)</label><input type="number" value={form.emailIntervalMinutes} onChange={e=>setForm({...form,emailIntervalMinutes:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
        <div className="field"><label>WhatsApp interval (minutes)</label><input type="number" value={form.whatsappIntervalMinutes} onChange={e=>setForm({...form,whatsappIntervalMinutes:(e.target.value === "" ? "" : Number(e.target.value))})} /></div>
      </div>
      <div style={{ borderTop:"1px solid var(--hair)", marginTop:14, paddingTop:14 }}>
        <strong style={{ fontSize:14 }}>Data recycling</strong>
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, marginTop:10 }}>
          <input type="checkbox" checked={form.recyclingEnabled} onChange={e=>setForm({...form,recyclingEnabled:e.target.checked})} />
          Enable recycling
        </label>
        <div className="field" style={{ marginTop:8 }}><label>Recycling period (days)</label><input type="number" value={form.recyclingDays} onChange={e=>setForm({...form,recyclingDays:(e.target.value === "" ? "" : Number(e.target.value))})} disabled={!form.recyclingEnabled} /></div>
      </div>
      <button className="btn btn-primary" style={{ marginTop:14 }} onClick={()=>dispatch({type:"UPDATE_DATA_SETTINGS", payload:form})}>Save settings</button>
    </div>
  );
}

function DataReportsTab({ state, dispatch }) {
  const records = state.dataRecords;
  const total = records.length;
  const ownData = records.filter(d=>d.dataCategory==="Own").length;
  const companyPool = records.filter(d=>d.dataCategory==="Company" && !d.assignedUser && d.status!=="Archived" && d.status!=="Converted to Lead").length;
  const assignedData = records.filter(d=>d.dataCategory==="Company" && d.assignedUser).length;
  const archivedData = records.filter(d=>d.status==="Archived").length;
  const convertedLeads = records.filter(d=>d.status==="Converted to Lead").length;
  const emailSent = records.filter(d=>d.emailSentAt).length;
  const whatsappSent = records.filter(d=>d.whatsappSentAt).length;

  const userRows = state.employees.filter(e=>e.roles.some(r=>["sales_exec","sales_manager"].includes(r))).map(e => {
    const act = todayDataActivity(e, state);
    return { e, own: records.filter(d=>d.dataCategory==="Own" && d.dataOwner===e.id).length,
      assigned: records.filter(d=>d.dataCategory==="Company" && d.assignedUser===e.id).length,
      emailsToday: act.emailsSent, whatsappsToday: act.whatsappsSent, callsToday: act.callsCompleted };
  });

  const [exportScope, setExportScope] = useState("All Data");
  const [exportFormat, setExportFormat] = useState("CSV");

  const runExport = () => {
    let rows = records;
    if (exportScope === "Own Data") rows = records.filter(d=>d.dataCategory==="Own");
    if (exportScope === "Company Data") rows = records.filter(d=>d.dataCategory==="Company");
    if (exportScope === "Interested Data") rows = records.filter(d=>d.status==="Interested");
    if (exportScope === "Converted Data") rows = records.filter(d=>d.status==="Converted to Lead");
    if (exportScope === "Clean Data Only") rows = records.filter(d=>d.status!=="Archived");

    const headers = ["ID","Company Name","Contact Person","Mobile","Email","Reference","Source","Business Category","Location","Data Category","Status","Created Date"];
    const dataRows = rows.map(d=>[d.id,d.companyName,d.contactName,d.mobile,d.email,d.reference,d.source,d.businessCategory,d.location,d.dataCategory,d.status,fmtDate(d.createdDate)]);
    const filename = `data-export-${exportScope.replace(/\s+/g,"-").toLowerCase()}`;

    if (exportFormat === "CSV") {
      exportCSV(`${filename}.csv`, headers, dataRows);
    } else {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      XLSX.writeFile(wb, `${filename}.xlsx`);
    }
    dispatch({ type:"LOG_DATA_EXPORT", exportedBy:"Data Manager", count: rows.length, purpose: exportScope, format: exportFormat });
  };

  return (
    <div>
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 12 }}>
        <div className="agw-card"><div className="kpi-label">Total data</div><div className="kpi-value disp">{total}</div></div>
        <div className="agw-card"><div className="kpi-label">Own data</div><div className="kpi-value disp">{ownData}</div></div>
        <div className="agw-card"><div className="kpi-label">Company Data Pool</div><div className="kpi-value disp">{companyPool}</div></div>
        <div className="agw-card"><div className="kpi-label">Assigned data</div><div className="kpi-value disp">{assignedData}</div></div>
      </div>
      <div className="agw-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 18 }}>
        <div className="agw-card"><div className="kpi-label">Archived data</div><div className="kpi-value disp">{archivedData}</div></div>
        <div className="agw-card"><div className="kpi-label">Converted to leads</div><div className="kpi-value disp">{convertedLeads}</div></div>
        <div className="agw-card"><div className="kpi-label">Emails sent</div><div className="kpi-value disp">{emailSent}</div></div>
        <div className="agw-card"><div className="kpi-label">WhatsApp sent</div><div className="kpi-value disp">{whatsappSent}</div></div>
      </div>

      <ReportTableCard title="User activity">
        <table className="agw-table">
          <thead><tr><th>User</th><th>Own data</th><th>Company assigned</th><th>Emails today</th><th>WhatsApp today</th><th>Calls today</th></tr></thead>
          <tbody>
            {userRows.map(r => (
              <tr key={r.e.id}>
                <td style={{display:"flex",alignItems:"center",gap:8}}><span className="avatar">{r.e.initials}</span>{r.e.name}</td>
                <td>{r.own}</td><td>{r.assigned}</td><td>{r.emailsToday}</td><td>{r.whatsappsToday}</td><td>{r.callsToday}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>

      <div className="agw-card" style={{ marginTop: 18 }}>
        <strong style={{ fontSize:14 }}>Export data for marketing</strong>
        <div className="row2" style={{ marginTop:10 }}>
          <div className="field"><label>Scope</label>
            <select value={exportScope} onChange={e=>setExportScope(e.target.value)}>
              {["All Data","Own Data","Company Data","Interested Data","Converted Data","Clean Data Only"].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field"><label>Format</label>
            <select value={exportFormat} onChange={e=>setExportFormat(e.target.value)}>
              <option>CSV</option><option>Excel</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary" onClick={runExport}><Download size={14}/> Export</button>
      </div>

      <ReportTableCard title="Export history" empty={state.dataExportHistory.length===0 ? "No exports yet." : null}>
        <table className="agw-table">
          <thead><tr><th>Exported by</th><th>Date</th><th>Records</th><th>Purpose</th><th>Format</th></tr></thead>
          <tbody>
            {state.dataExportHistory.map(x => (
              <tr key={x.id}><td>{x.exportedBy}</td><td className="mono" style={{fontSize:12}}>{fmtDate(x.exportDate)}</td><td>{x.count}</td><td>{x.purpose}</td><td>{x.format}</td></tr>
            ))}
          </tbody>
        </table>
      </ReportTableCard>
    </div>
  );
}
