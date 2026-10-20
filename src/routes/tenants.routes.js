// Tenant Management — office rooms rented out to third parties. Deliberately self-contained: its
// own two tables (tenants, tenant_payments), no link into the Company Finance/Cheques module. A
// tenant's month-by-month rent ledger is lazily backfilled (see monthsBetween/GET /) rather than
// needing a cron job to create each new month ahead of time.
const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireModuleView } = require("../middleware/roles");
const { nextId, today } = require("../utils/helpers");
const { generateTablePdf } = require("../utils/reportPdf");

const router = express.Router();
router.use(requireAuth);
// Reading this module (the list, the SOA PDF) follows the per-user Module Access grid, same as
// Company Finance — a grant on "tenants" is what actually lets someone in. Writes below stay
// role-gated.
router.use(requireModuleView("tenants"));

// Same access tier as Company Finance — this deals with real money even though it's a separate
// module. ACCESS_ROLES is for requireRole (which special-cases "admin_like"); NOTIFY_ROLES is the
// literal role list a notification's audience is actually matched against.
const ACCESS_ROLES = ["admin_like", "accounts"];
const NOTIFY_ROLES = ["super_admin", "admin", "admin_exec", "accounts"];

function monthsBetween(startDate, endDate) {
  const months = [];
  const d = new Date(startDate); d.setDate(1);
  const end = new Date(endDate); end.setDate(1);
  while (d <= end) {
    months.push(d.toISOString().slice(0, 10));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

// Backfills any month from each tenant's start_date through the current month that doesn't have
// a row yet, then returns every tenant with its full payment ledger embedded — same shape as
// customers/KYC docs, so the frontend just keeps one dispatch+refresh("tenants") pattern instead
// of a separate per-tenant detail fetch.
router.get("/", async (req, res) => {
  const tenants = await query("SELECT * FROM tenants ORDER BY room");
  const now = today();
  for (const t of tenants) {
    for (const m of monthsBetween(t.start_date, now)) {
      await query(
        "INSERT IGNORE INTO tenant_payments (id, tenant_id, month, amount_due) VALUES (?,?,?,?)",
        [nextId("TP"), t.id, m, t.monthly_rent]
      );
    }
  }
  const payments = tenants.length
    ? await query(`SELECT * FROM tenant_payments WHERE tenant_id IN (${tenants.map(() => "?").join(",")}) ORDER BY month DESC`, tenants.map((t) => t.id))
    : [];
  res.json(tenants.map((t) => ({
    ...t,
    payments: payments.filter((p) => p.tenant_id === t.id),
  })));
});

router.post("/", requireRole(ACCESS_ROLES), async (req, res) => {
  const { room, tenantName, contact, phone, monthlyRent, startDate, notes } = req.body;
  if (!room?.trim() || !tenantName?.trim() || !startDate) {
    return res.status(400).json({ error: "room, tenantName, and startDate are required" });
  }
  const id = nextId("TN");
  await query(
    "INSERT INTO tenants (id, room, tenant_name, contact, phone, monthly_rent, start_date, notes) VALUES (?,?,?,?,?,?,?,?)",
    [id, room.trim(), tenantName.trim(), contact || null, phone || null, monthlyRent || 0, startDate, notes || null]
  );
  res.status(201).json({ id });
});

router.patch("/:id", requireRole(ACCESS_ROLES), async (req, res) => {
  const [row] = await query("SELECT id FROM tenants WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const b = req.body;
  const fields = [];
  const params = [];
  for (const [col, key] of [["room", "room"], ["tenant_name", "tenantName"], ["contact", "contact"], ["phone", "phone"], ["monthly_rent", "monthlyRent"], ["status", "status"], ["notes", "notes"]]) {
    if (b[key] !== undefined) { fields.push(`${col} = ?`); params.push(b[key]); }
  }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE tenants SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM tenants WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Records (or corrects) the payment against one month — a full overwrite, not an incremental
// patch, since "add payment" always means entering the real, current state of that month's rent
// (amount actually paid, how, and — if a cheque — its own details). Recording a fresh cheque here
// always resets cheque_deposited to 0: entering payment details is "a cheque was received", not
// "and it's already been banked" — see the separate /deposited route for that.
// amountDue is optional and, unlike the other fields, NOT reset to a default when omitted — it's
// the month's rent, not a payment detail, so a plain "record this payment" call (no amountDue in
// the body) must leave it exactly as it was.
router.patch("/:id/payments/:paymentId", requireRole(ACCESS_ROLES), async (req, res) => {
  const [row] = await query("SELECT * FROM tenant_payments WHERE id = ? AND tenant_id = ?", [req.params.paymentId, req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const b = req.body;
  const isCheque = b.mode === "Cheque";
  const amountDue = b.amountDue !== undefined ? Number(b.amountDue) || 0 : row.amount_due;
  await query(
    `UPDATE tenant_payments SET amount_due=?, amount_paid=?, paid_at=?, mode=?, cheque_number=?, cheque_bank=?, cheque_date=?, cheque_deposited=0, notes=? WHERE id = ?`,
    [amountDue, b.amountPaid || 0, b.paidAt || null, b.mode || null,
      isCheque ? (b.chequeNumber || null) : null, isCheque ? (b.chequeBank || null) : null, isCheque ? (b.chequeDate || null) : null,
      b.notes || null, req.params.paymentId]
  );
  res.json({ ok: true });
});

// Manually adds one month to a tenant's rent ledger — for a month outside the normal
// start_date-through-today range that GET / lazily backfills (most often a future month, added
// ahead of time). Defaults amountDue to the tenant's current monthly_rent when not given.
router.post("/:id/payments", requireRole(ACCESS_ROLES), async (req, res) => {
  const [tenant] = await query("SELECT id, monthly_rent FROM tenants WHERE id = ?", [req.params.id]);
  if (!tenant) return res.status(404).json({ error: "Not found" });
  const { month, amountDue } = req.body;
  if (!month) return res.status(400).json({ error: "month is required" });
  const normalizedMonth = `${String(month).slice(0, 7)}-01`;
  const [existing] = await query("SELECT id FROM tenant_payments WHERE tenant_id = ? AND month = ?", [req.params.id, normalizedMonth]);
  if (existing) return res.status(409).json({ error: "That month already has a row." });
  const id = nextId("TP");
  await query(
    "INSERT INTO tenant_payments (id, tenant_id, month, amount_due) VALUES (?,?,?,?)",
    [id, req.params.id, normalizedMonth, amountDue !== undefined ? Number(amountDue) || 0 : tenant.monthly_rent]
  );
  res.status(201).json({ id });
});

// Removes one month from the ledger. Only allowed before any payment has been recorded against
// it, so a paid month's record can never silently disappear — correct the amount instead. Note:
// a month inside the tenant's normal start_date-through-today range will simply be re-created by
// GET /'s backfill the next time this tenant is opened (same reason it's safe to allow at all —
// nothing paid is ever lost); it only "sticks" for a future month added ahead of schedule.
router.delete("/:id/payments/:paymentId", requireRole(ACCESS_ROLES), async (req, res) => {
  const [row] = await query("SELECT amount_paid FROM tenant_payments WHERE id = ? AND tenant_id = ?", [req.params.paymentId, req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (Number(row.amount_paid) > 0) return res.status(400).json({ error: "Can't remove a month that already has a payment recorded." });
  await query("DELETE FROM tenant_payments WHERE id = ?", [req.params.paymentId]);
  res.json({ ok: true });
});

router.post("/:id/payments/:paymentId/deposited", requireRole(ACCESS_ROLES), async (req, res) => {
  const result = await query("UPDATE tenant_payments SET cheque_deposited = 1 WHERE id = ? AND tenant_id = ?", [req.params.paymentId, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// Manual, on-demand reminder — not a scheduled sweep. Posts one notification to Admin/Accounts;
// staff press this whenever they want the deposit flagged, rather than the app deciding when.
router.post("/:id/payments/:paymentId/remind-deposit", requireRole(ACCESS_ROLES), async (req, res) => {
  const [p] = await query(
    `SELECT tp.*, t.room, t.tenant_name FROM tenant_payments tp JOIN tenants t ON t.id = tp.tenant_id WHERE tp.id = ? AND tp.tenant_id = ?`,
    [req.params.paymentId, req.params.id]
  );
  if (!p) return res.status(404).json({ error: "Not found" });
  const title = "Cheque deposit reminder";
  const body = `Cheque ${p.cheque_number || "—"} from ${p.tenant_name} (${p.room}) — rent for ${p.month} — is still pending deposit.`;
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'tenant_cheque_deposit', ?, ?, ?)",
    [nextId("NT"), title, body, JSON.stringify(NOTIFY_ROLES)]);
  res.json({ ok: true });
});

// Statement of Account — every month on file for this tenant, oldest first, reusing the same
// generic table-PDF renderer every other report in the app already uses.
router.get("/:id/statement/pdf", async (req, res) => {
  const [tenant] = await query("SELECT * FROM tenants WHERE id = ?", [req.params.id]);
  if (!tenant) return res.status(404).json({ error: "Not found" });
  const payments = await query("SELECT * FROM tenant_payments WHERE tenant_id = ? ORDER BY month ASC", [req.params.id]);
  const money = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
  const rows = payments.map((p) => ({
    Month: String(p.month).slice(0, 7),
    "Rent Due (QAR)": money(p.amount_due),
    "Paid (QAR)": money(p.amount_paid),
    "Balance (QAR)": money(Number(p.amount_due) - Number(p.amount_paid)),
    "Paid On": p.paid_at ? String(p.paid_at).slice(0, 10) : "",
    Mode: p.mode || "",
  }));
  const totalDue = payments.reduce((a, p) => a + Number(p.amount_due), 0);
  const totalPaid = payments.reduce((a, p) => a + Number(p.amount_paid), 0);
  rows.unshift({
    Month: "TOTAL",
    "Rent Due (QAR)": money(totalDue),
    "Paid (QAR)": money(totalPaid),
    "Balance (QAR)": money(totalDue - totalPaid),
    "Paid On": "",
    Mode: "",
  });
  generateTablePdf({
    title: "Statement of Account",
    subtitle: `${tenant.room} — ${tenant.tenant_name}`,
    columns: [
      { key: "Month", label: "Month", width: 70 },
      { key: "Rent Due (QAR)", label: "Rent Due (QAR)", align: "right" },
      { key: "Paid (QAR)", label: "Paid (QAR)", align: "right" },
      { key: "Balance (QAR)", label: "Balance (QAR)", align: "right" },
      { key: "Paid On", label: "Paid On", width: 70 },
      { key: "Mode", label: "Mode", width: 80 },
    ],
    rows,
  }, res);
});

module.exports = router;
