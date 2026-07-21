const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");
const { quoteTotal } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);
// Reports are visible to Admin-tier, Sales Manager, Accounts, and the read-only Executive role.
router.use(requireRole(["admin_like", "sales_manager", "accounts", "executive"]));

const range = (req) => [req.query.from || "1970-01-01", req.query.to || "2999-12-31"];

router.get("/business-volume", async (req, res) => {
  const [from, to] = range(req);
  const rows = await query(
    `SELECT * FROM quotations WHERE fee_type = 'Professional Fee' AND DATE(created_at) BETWEEN ? AND ?`, [from, to]
  );
  const parsed = rows.map((q) => ({ ...q, items: JSON.parse(q.items), ...quoteTotal(JSON.parse(q.items), q.order_discount) }));
  const approved = parsed.filter((q) => q.status === "Approved");
  res.json({
    quotationsIssued: parsed.length,
    totalQuoted: parsed.reduce((a, q) => a + q.total, 0),
    approvedValue: approved.reduce((a, q) => a + q.total, 0),
    winRate: parsed.length ? Math.round((approved.length / parsed.length) * 100) : 0,
    rows: parsed,
  });
});

router.get("/sales-by-person", async (req, res) => {
  const [from, to] = range(req);
  const owners = await query(`SELECT id, name FROM users WHERE JSON_CONTAINS(roles, '"sales_exec"') OR JSON_CONTAINS(roles, '"sales_manager"')`);
  const out = [];
  for (const owner of owners) {
    const leads = await query("SELECT COUNT(*) AS c FROM leads WHERE owner = ? AND DATE(created_at) BETWEEN ? AND ?", [owner.id, from, to]);
    const deals = await query("SELECT COUNT(*) AS c, SUM(stage='Won') AS won FROM deals WHERE owner = ? AND DATE(created_at) BETWEEN ? AND ?", [owner.id, from, to]);
    const quotes = await query(
      `SELECT q.* FROM quotations q LEFT JOIN deals d ON d.id = q.deal_id WHERE (d.owner = ? OR q.owner = ?) AND DATE(q.created_at) BETWEEN ? AND ?`,
      [owner.id, owner.id, from, to]
    );
    const parsedQuotes = quotes.map((q) => ({ ...q, items: JSON.parse(q.items), ...quoteTotal(JSON.parse(q.items), q.order_discount) }));
    const businessVolume = parsedQuotes.filter((q) => q.status === "Approved" && q.fee_type === "Professional Fee").reduce((a, q) => a + q.total, 0);
    const pendingQuotes = parsedQuotes.filter((q) => !["Approved", "Rejected", "Expired"].includes(q.status)).length;
    const pendingLeads = await query("SELECT COUNT(*) AS c FROM leads WHERE owner = ? AND status NOT IN ('Qualified','Unqualified')", [owner.id]);

    out.push({
      owner: owner.name,
      leads: leads[0].c,
      deals: deals[0].c,
      dealsWon: deals[0].won || 0,
      quotations: parsedQuotes.length,
      businessVolume,
      pending: pendingQuotes + pendingLeads[0].c,
    });
  }
  res.json(out.sort((a, b) => b.businessVolume - a.businessVolume));
});

router.get("/collections", async (req, res) => {
  const [from, to] = range(req);
  const invoices = await query("SELECT * FROM invoices WHERE fee_type = 'Professional Fee' AND DATE(created_at) BETWEEN ? AND ?", [from, to]);
  const payments = await query("SELECT * FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices) AND DATE(paid_at) BETWEEN ? AND ?", [from, to]);
  const totalInvoiced = invoices.reduce((a, i) => a + Number(i.amount), 0);
  const totalCollected = payments.reduce((a, p) => a + Number(p.amount), 0);
  res.json({ invoicesRaised: invoices.length, totalInvoiced, totalCollected, rows: invoices });
});

router.get("/customers", async (req, res) => {
  const [from, to] = range(req);
  const customers = await query("SELECT name FROM customers");
  const out = [];
  for (const c of customers) {
    const quotes = await query("SELECT * FROM quotations WHERE customer = ? AND status='Approved' AND fee_type='Professional Fee' AND DATE(created_at) BETWEEN ? AND ?", [c.name, from, to]);
    const parsedQuotes = quotes.map((q) => ({ ...quoteTotal(JSON.parse(q.items), q.order_discount) }));
    const invoices = await query("SELECT * FROM invoices WHERE customer = ? AND fee_type='Professional Fee' AND DATE(created_at) BETWEEN ? AND ?", [c.name, from, to]);
    const payments = await query("SELECT SUM(amount) AS s FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE customer = ?)", [c.name]);
    const jobs = await query("SELECT COUNT(*) AS c FROM job_cards WHERE customer = ? AND DATE(created_at) BETWEEN ? AND ?", [c.name, from, to]);
    const invoiced = invoices.reduce((a, i) => a + Number(i.amount), 0);
    const quotedValue = parsedQuotes.reduce((a, q) => a + q.total, 0);
    if (quotedValue || invoiced || jobs[0].c) out.push({ customer: c.name, quotedValue, invoiced, paid: Number(payments[0].s || 0), jobCards: jobs[0].c });
  }
  res.json(out.sort((a, b) => b.invoiced - a.invoiced));
});

router.get("/user-base", async (req, res) => {
  const users = await query("SELECT * FROM users");
  res.json(users.map((u) => ({ ...u, roles: JSON.parse(u.roles) })));
});

router.get("/attendance-hr", async (req, res) => {
  const [from, to] = range(req);
  const users = await query("SELECT id, name, dept, leave_balance FROM users WHERE active = 1");
  const out = [];
  for (const u of users) {
    const att = await query("SELECT status, COUNT(*) AS c FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY status", [u.id, from, to]);
    const present = att.find((a) => a.status === "Present")?.c || 0;
    const marked = att.reduce((a, x) => a + x.c, 0);
    const pending = await query("SELECT COUNT(*) AS c FROM leave_requests WHERE user_id = ? AND status = 'Pending'", [u.id]);
    out.push({ ...u, attendanceRate: marked ? Math.round((present / marked) * 100) : null, pendingLeave: pending[0].c });
  }
  res.json(out);
});

router.get("/operations", async (req, res) => {
  const [from, to] = range(req);
  const rows = await query("SELECT * FROM job_cards WHERE DATE(created_at) BETWEEN ? AND ?", [from, to]);
  const completed = rows.filter((r) => r.status === "Completed").length;
  res.json({
    created: rows.length,
    completed,
    cancelled: rows.filter((r) => r.status === "Cancelled").length,
    completionRate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
    rows,
  });
});

module.exports = router;
