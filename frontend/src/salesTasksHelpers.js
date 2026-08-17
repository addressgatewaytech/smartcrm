// Shared read-only math for Sales Daily Tasks — used by the "Sales Daily Tasks" Task-page tab,
// the Dashboard block, and the Reports tab, so "how much has this salesperson done" is computed
// exactly the same way everywhere instead of three slightly-different copies of the same logic.
//
// The 11 Manual activities are summed from state.salesTaskLogs (per user/def/day). The 2 Auto
// activities (Confirmed Sales, Revenue Target) are never logged — they're computed live from
// state.quotations/salesOrders/invoices, traced back to the owning salesperson via
// quotation.owner, exactly like every other per-salesperson figure already shown on the Dashboard.

export const todayStr = () => new Date().toISOString().slice(0, 10);

export function firstOfMonthStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Monday of the current week (ISO-style week start), for a "week-to-date" range the same way
// firstOfMonthStr gives a "month-to-date" range.
export function firstOfWeekStr(d = new Date()) {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

function manualCompletedInRange(logs, userId, taskDefId, from, to) {
  return logs
    .filter((l) => l.userId === userId && l.taskDefId === taskDefId && l.activityDate >= from && l.activityDate <= to)
    .reduce((a, l) => a + l.completedCount, 0);
}

// Sum of Sales Order Professional Fee amounts created in [from,to], owned by this salesperson.
export function confirmedSalesInRange(quotations, salesOrders, userId, from, to) {
  const ownedQuoteIds = new Set(quotations.filter((q) => q.owner === userId).map((q) => q.id));
  return salesOrders
    .filter((so) => ownedQuoteIds.has(so.quotationId) && (so.createdAt || "").slice(0, 10) >= from && (so.createdAt || "").slice(0, 10) <= to)
    .reduce((a, so) => a + so.professionalFeeAmount, 0);
}

// Sum of payments recorded in [from,to] against invoices traced back to this salesperson's
// sales orders. Subscription-generated invoices (no salesOrderId) are outside this by design —
// there's no salesperson quotation to attribute them to.
export function revenueInRange(quotations, salesOrders, invoices, userId, from, to) {
  const ownedQuoteIds = new Set(quotations.filter((q) => q.owner === userId).map((q) => q.id));
  const ownedSoIds = new Set(salesOrders.filter((so) => ownedQuoteIds.has(so.quotationId)).map((so) => so.id));
  let total = 0;
  invoices.forEach((inv) => {
    if (!inv.salesOrderId || !ownedSoIds.has(inv.salesOrderId)) return;
    inv.payments.forEach((p) => {
      const d = (p.date || "").slice(0, 10);
      if (d >= from && d <= to) total += p.amount;
    });
  });
  return total;
}

function completedForDef(def, data, userId, from, to) {
  if (def.source === "Auto") {
    if (def.key === "confirmed_sales") return confirmedSalesInRange(data.quotations, data.salesOrders, userId, from, to);
    if (def.key === "revenue_target") return revenueInRange(data.quotations, data.salesOrders, data.invoices, userId, from, to);
    return 0;
  }
  return manualCompletedInRange(data.logs, userId, def.id, from, to);
}

// Sales Daily Tasks completion, on a 3-tier traffic-light scale: under 70% is behind (red), 70%
// up to (not including) 100% is close but not finished (yellow), and only a fully completed 100%
// reads as green. Used everywhere a salesperson's completion % is shown: the Dashboard self-view
// and team table, the Sales Daily Tasks tab, and the Reports tab.
export function dailyCompletionColor(pct) {
  if (pct < 70) return "var(--danger)";
  if (pct < 100) return "var(--warning)";
  return "var(--success)";
}

export function statusFor(completed, target) {
  if (completed <= 0) return "Pending";
  if (completed >= target) return "Completed";
  return "In Progress";
}

// Full per-user snapshot for [from,to] across all 13 defs. A target is a *daily* number — over an
// N-day range the "should have done" total scales to target × N, so a single-day call (from===to,
// the self/dashboard "today" view) always sees target === def.target unscaled.
export function userTaskSnapshot(defs, data, userId, from, to) {
  const daysInRange = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
  const rows = defs.map((def) => {
    const completed = completedForDef(def, data, userId, from, to);
    const target = def.target * daysInRange;
    return { def, completed, target, remaining: Math.max(0, target - completed), status: statusFor(completed, target) };
  });
  const completedCount = rows.filter((r) => r.status === "Completed").length;
  const pendingCount = rows.length - completedCount;
  const completionPct = rows.length ? Math.round((completedCount / rows.length) * 100) : 0;
  // A graded average attainment (each activity capped at 100%, then averaged) rather than summing
  // completed/target across activities directly — that would let the 2 money targets (QAR 1,000+
  // QAR 10,000) swamp the 11 count targets (2-10) purely from unit-scale, not real performance.
  const attainments = rows.map((r) => (r.target > 0 ? Math.min(100, (r.completed / r.target) * 100) : 0));
  const targetAchievementPct = attainments.length ? Math.round(attainments.reduce((a, b) => a + b, 0) / attainments.length) : 0;
  const revenue = revenueInRange(data.quotations, data.salesOrders, data.invoices, userId, from, to);
  const sales = confirmedSalesInRange(data.quotations, data.salesOrders, userId, from, to);
  const overallStatus = completionPct === 100 ? "Completed" : completionPct === 0 ? "Pending" : "In Progress";
  return { rows, completedCount, pendingCount, completionPct, targetAchievementPct, revenue, sales, overallStatus };
}
