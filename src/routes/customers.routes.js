const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, quoteTotal } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const customers = await query("SELECT * FROM customers ORDER BY name");
  const docs = await query("SELECT * FROM customer_docs");
  const staff = await query("SELECT * FROM customer_staff");
  const staffDocs = await query("SELECT * FROM customer_staff_docs");

  const canSeeAll = isAdminLike(req.user.roles) || req.user.roles.includes("sales_manager");
  let visible = customers;
  if (!canSeeAll) {
    // Customers have no owner column — ownership is derived from the customer's most recent lead
    // (a lead auto-creates its customer, so this covers most records), falling back to the most
    // recent deal. Done here (not client-side) because /leads itself is scoped to the requesting
    // user for a sales_exec, so the client never has enough data to derive anyone else's ownership.
    // Only hides a customer this user can prove belongs to someone else — one with no lead/deal
    // match (e.g. added directly) stays visible rather than vanishing on its creator.
    const leads = await query("SELECT company, owner, created_at FROM leads ORDER BY created_at DESC");
    const deals = await query("SELECT customer, owner, created_at FROM deals ORDER BY created_at DESC");
    // Case-insensitive, matching how findOrCreateCustomerForLead itself matches names in leads.routes.js —
    // real data has inconsistent casing between a lead's company and its linked customer's name.
    const sameName = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
    const ownerFor = (name) => {
      const lead = leads.find((l) => sameName(l.company, name));
      if (lead) return lead.owner;
      const deal = deals.find((d) => sameName(d.customer, name));
      return deal ? deal.owner : null;
    };
    visible = customers.filter((c) => { const owner = ownerFor(c.name); return owner == null || owner === req.user.id; });
  }

  res.json(visible.map((c) => ({
    ...c,
    docs: docs.filter((d) => d.customer_id === c.id),
    employees: staff.filter((s) => s.customer_id === c.id).map((s) => ({ ...s, docs: staffDocs.filter((d) => d.customer_staff_id === s.id) })),
  })));
});

router.post("/", async (req, res) => {
  const id = nextId("CU");
  const b = req.body;
  await query("INSERT INTO customers (id, name, type, contact, phone, landline, contact_mobile, email, address, company_size) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id, b.name, b.type || "Company", b.contact || null, b.phone || null, b.landline || null, b.contactMobile || null, b.email || null, b.address || null, b.companySize || null]);
  res.status(201).json({ id });
});

router.patch("/:id", requireRole(["admin_like"]), async (req, res) => {
  const b = req.body;
  await query("UPDATE customers SET name=COALESCE(?,name), type=COALESCE(?,type), contact=?, phone=?, landline=?, contact_mobile=?, email=?, address=?, company_size=? WHERE id=?",
    [b.name, b.type, b.contact || null, b.phone || null, b.landline || null, b.contactMobile || null, b.email || null, b.address || null, b.companySize || null, req.params.id]);
  res.json({ ok: true });
});

router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM customers WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// --- KYC documents -------------------------------------------------------------------------
router.post("/:id/docs", async (req, res) => {
  const b = req.body;
  const docId = nextId("DOC");
  await query("INSERT INTO customer_docs (id, customer_id, type, number, expiry, cloud_link) VALUES (?,?,?,?,?,?)",
    [docId, req.params.id, b.type, b.number || null, b.expiry || null, b.cloudLink || null]);
  res.status(201).json({ id: docId });
});
router.patch("/:id/docs/:docId", async (req, res) => {
  const b = req.body;
  await query("UPDATE customer_docs SET type=COALESCE(?,type), number=?, expiry=?, cloud_link=? WHERE id=? AND customer_id=?",
    [b.type, b.number || null, b.expiry || null, b.cloudLink || null, req.params.docId, req.params.id]);
  res.json({ ok: true });
});
router.delete("/:id/docs/:docId", async (req, res) => {
  await query("DELETE FROM customer_docs WHERE id = ? AND customer_id = ?", [req.params.docId, req.params.id]);
  res.json({ ok: true });
});

// --- Customer's own staff + their documents ------------------------------------------------
router.post("/:id/employees", async (req, res) => {
  const empId = nextId("CE");
  await query("INSERT INTO customer_staff (id, customer_id, name, designation) VALUES (?,?,?,?)", [empId, req.params.id, req.body.name, req.body.designation || null]);
  res.status(201).json({ id: empId });
});
router.patch("/:id/employees/:empId", async (req, res) => {
  const b = req.body;
  await query("UPDATE customer_staff SET name=COALESCE(?,name), designation=? WHERE id=? AND customer_id=?",
    [b.name, b.designation || null, req.params.empId, req.params.id]);
  res.json({ ok: true });
});
router.delete("/:id/employees/:empId", async (req, res) => {
  await query("DELETE FROM customer_staff WHERE id = ? AND customer_id = ?", [req.params.empId, req.params.id]);
  res.json({ ok: true });
});
router.post("/:id/employees/:empId/docs", async (req, res) => {
  const b = req.body;
  const docId = nextId("CEDOC");
  await query("INSERT INTO customer_staff_docs (id, customer_staff_id, type, number, expiry, cloud_link) VALUES (?,?,?,?,?,?)",
    [docId, req.params.empId, b.type, b.number || null, b.expiry || null, b.cloudLink || null]);
  res.status(201).json({ id: docId });
});
router.patch("/:id/employees/:empId/docs/:docId", async (req, res) => {
  const b = req.body;
  await query("UPDATE customer_staff_docs SET type=COALESCE(?,type), number=?, expiry=?, cloud_link=? WHERE id=? AND customer_staff_id=?",
    [b.type, b.number || null, b.expiry || null, b.cloudLink || null, req.params.docId, req.params.empId]);
  res.json({ ok: true });
});
router.delete("/:id/employees/:empId/docs/:docId", async (req, res) => {
  await query("DELETE FROM customer_staff_docs WHERE id = ? AND customer_staff_id = ?", [req.params.docId, req.params.empId]);
  res.json({ ok: true });
});

// --- Per-customer dashboard: quotations / invoices+statement / job cards, matched by name ---
router.get("/:id/dashboard", async (req, res) => {
  const [customer] = await query("SELECT name FROM customers WHERE id = ?", [req.params.id]);
  if (!customer) return res.status(404).json({ error: "Not found" });

  const quotations = await query("SELECT * FROM quotations WHERE customer = ? ORDER BY created_at DESC", [customer.name]);
  const invoices = await query("SELECT * FROM invoices WHERE customer = ? ORDER BY created_at DESC", [customer.name]);
  const payments = await query("SELECT * FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE customer = ?)", [customer.name]);
  const jobCards = await query("SELECT * FROM job_cards WHERE customer = ? ORDER BY created_at DESC", [customer.name]);

  const totalInvoiced = invoices.reduce((a, i) => a + Number(i.amount), 0);
  const totalPaid = payments.reduce((a, p) => a + Number(p.amount), 0);

  res.json({
    quotations: quotations.map((q) => ({ ...q, items: q.items, ...quoteTotal(q.items, q.order_discount) })),
    invoices: invoices.map((inv) => ({ ...inv, payments: payments.filter((p) => p.invoice_id === inv.id) })),
    jobCards,
    statement: { totalInvoiced, totalPaid, balance: totalInvoiced - totalPaid },
  });
});

module.exports = router;
