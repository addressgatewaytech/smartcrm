const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { nextId, quoteTotal } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const customers = await query("SELECT * FROM customers ORDER BY name");
  const docs = await query("SELECT * FROM customer_docs");
  const staff = await query("SELECT * FROM customer_staff");
  const staffDocs = await query("SELECT * FROM customer_staff_docs");
  res.json(customers.map((c) => ({
    ...c,
    docs: docs.filter((d) => d.customer_id === c.id),
    employees: staff.filter((s) => s.customer_id === c.id).map((s) => ({ ...s, docs: staffDocs.filter((d) => d.customer_staff_id === s.id) })),
  })));
});

router.post("/", async (req, res) => {
  const id = nextId("CU");
  const b = req.body;
  await query("INSERT INTO customers (id, name, type, contact, phone, email, address, company_size) VALUES (?,?,?,?,?,?,?,?)",
    [id, b.name, b.type || "Company", b.contact || null, b.phone || null, b.email || null, b.address || null, b.companySize || null]);
  res.status(201).json({ id });
});

router.patch("/:id", async (req, res) => {
  const b = req.body;
  await query("UPDATE customers SET name=COALESCE(?,name), type=COALESCE(?,type), contact=?, phone=?, email=?, address=?, company_size=? WHERE id=?",
    [b.name, b.type, b.contact || null, b.phone || null, b.email || null, b.address || null, b.companySize || null, req.params.id]);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
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
