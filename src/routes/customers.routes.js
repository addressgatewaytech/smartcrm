const express = require("express");
const crypto = require("crypto");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike, requireRoleOrModuleEdit, hasModuleEdit } = require("../middleware/roles");
const { nextId, nextSequentialId, quoteTotal, findDuplicateCustomer, COMPULSORY_KYC_DOC_TYPES, seedDefaultKycDocs } = require("../utils/helpers");
const { generateOnboardingFormPdf } = require("../utils/onboardingFormPdf");
const { generateAccountStatementPdf } = require("../utils/accountStatementPdf");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const customers = await query("SELECT * FROM customers ORDER BY name");
  const docs = await query("SELECT * FROM customer_docs");
  const staff = await query("SELECT * FROM customer_staff");
  const staffDocs = await query("SELECT * FROM customer_staff_docs");

  // Only Admin-tier sees every customer; everyone else sees only their own — a customer they
  // created directly, or one linked to a lead/deal they own. Unlike before, a customer with no
  // traceable owner at all is now admin-only (not shown to everyone) — KYC records are sensitive
  // enough that "can't prove who it belongs to" should mean restricted, not wide open.
  // Sales Manager, Ops Manager, Ops Team Member, and PRO Head are the deliberate exceptions,
  // seeing every customer like Admin-tier — they service KYC/onboarding or manage the pipeline
  // across all clients operationally, not just ones they personally sourced as a lead (same
  // reasoning as Ops Manager/Ops Team Member already seeing every Job Card). A plain "pro" is not
  // exempted — same as any other individual contributor, they only see customers they can trace
  // ownership to.
  // An explicit can_edit grant on the Customers module (Users & Roles > Module Access) is also
  // exempt — a deliberate per-person elevation (e.g. someone whose whole job is KYC upkeep across
  // the client base) without changing their actual role and everything role-driven that comes
  // with it (approval authority, KPI shape, other module access, ...).
  const canSeeAll = isAdminLike(req.user.roles) || req.user.roles.includes("viewer") || req.user.roles.includes("sales_manager") || req.user.roles.includes("ops_manager") || req.user.roles.includes("ops_member") || req.user.roles.includes("pro_head") || (await hasModuleEdit(req.user.id, "customers"));
  let visible = customers;
  if (!canSeeAll) {
    // Customers have no direct owner column — ownership is derived from the customer's most
    // recent lead (a lead auto-creates its customer, so this covers most records), falling back to
    // the most recent deal, and finally to created_by for one added directly via "New customer".
    // Done here (not client-side) because /leads itself is scoped to the requesting user, so the
    // client never has enough data to derive anyone else's ownership.
    const leads = await query("SELECT company, owner, customer_id, created_at FROM leads ORDER BY created_at DESC");
    const deals = await query("SELECT customer, owner, customer_id, created_at FROM deals ORDER BY created_at DESC");
    // Case-insensitive, matching how findOrCreateCustomer itself matches names —
    // real data has inconsistent casing between a lead's company and its linked customer's name.
    const sameName = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
    const ownerFor = (customer) => {
      // Prefer the reliable customer_id link; fall back to name-matching only for legacy
      // leads/deals with no customer_id (predates this linking).
      const lead = leads.find((l) => l.customer_id === customer.id) || leads.find((l) => !l.customer_id && sameName(l.company, customer.name));
      if (lead) return lead.owner;
      const deal = deals.find((d) => d.customer_id === customer.id) || deals.find((d) => !d.customer_id && sameName(d.customer, customer.name));
      if (deal) return deal.owner;
      return customer.created_by || null;
    };
    visible = customers.filter((c) => ownerFor(c) === req.user.id);
  }

  res.json(visible.map((c) => ({
    ...c,
    docs: docs.filter((d) => d.customer_id === c.id),
    employees: staff.filter((s) => s.customer_id === c.id).map((s) => ({ ...s, docs: staffDocs.filter((d) => d.customer_staff_id === s.id) })),
  })));
});

router.post("/", async (req, res) => {
  const b = req.body;
  const dup = await findDuplicateCustomer(query, { name: b.name, phone: b.phone, email: b.email });
  if (dup) {
    return res.status(400).json({ error: `This looks like a duplicate of the existing customer "${dup.match.name}" (matched by ${dup.field}) — please use that profile instead of creating a new one.` });
  }
  const id = await withTransaction((conn) => nextSequentialId(conn, "AGBSCU", "customer"));
  await query("INSERT INTO customers (id, name, type, contact, phone, landline, contact_mobile, email, address, company_size, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [id, b.name, b.type || "Company", b.contact || null, b.phone || null, b.landline || null, b.contactMobile || null, b.email || null, b.address || null, b.companySize || null, req.user.id]);
  await seedDefaultKycDocs(query, id);
  res.status(201).json({ id });
});

// Ops Manager can update a customer's profile (name/contact/KYC-adjacent fields) as part of the
// same "update options" access — deletion stays Admin-tier only below, since that's destructive
// and wasn't asked for.
router.patch("/:id", requireRoleOrModuleEdit(["admin_like", "ops_manager", "ops_member", "pro_head", "pro"], "customers"), async (req, res) => {
  const b = req.body;
  const dup = await findDuplicateCustomer(query, { name: b.name, phone: b.phone, email: b.email }, req.params.id);
  if (dup) {
    return res.status(400).json({ error: `This would duplicate the existing customer "${dup.match.name}" (matched by ${dup.field}) — please merge into that profile instead.` });
  }
  // Can only move to Active once CR, CL, and EC each have an expiry date filled in — every other
  // status transition (including moving away from Active) is unrestricted.
  if (b.status === "Active") {
    const docs = await query("SELECT type, expiry FROM customer_docs WHERE customer_id = ? AND type IN (?,?,?)", [req.params.id, ...COMPULSORY_KYC_DOC_TYPES]);
    const missing = COMPULSORY_KYC_DOC_TYPES.filter((t) => !docs.some((d) => d.type === t && d.expiry));
    if (missing.length) {
      return res.status(400).json({ error: `Can't set this customer Active yet — ${missing.join(", ")} still need${missing.length === 1 ? "s" : ""} an expiry date.` });
    }
  }
  const [before] = await query("SELECT name FROM customers WHERE id = ?", [req.params.id]);
  // Only touches fields actually present in the payload — the Company Status picker sends just
  // {status}, and blindly overwriting every other column with "sent as undefined -> null" (the
  // old behavior here) would have wiped contact/phone/email/etc. on every status change.
  const fields = [];
  const params = [];
  if (b.name !== undefined) { fields.push("name = ?"); params.push(b.name); }
  if (b.type !== undefined) { fields.push("type = ?"); params.push(b.type); }
  if (b.contact !== undefined) { fields.push("contact = ?"); params.push(b.contact || null); }
  if (b.phone !== undefined) { fields.push("phone = ?"); params.push(b.phone || null); }
  if (b.landline !== undefined) { fields.push("landline = ?"); params.push(b.landline || null); }
  if (b.contactMobile !== undefined) { fields.push("contact_mobile = ?"); params.push(b.contactMobile || null); }
  if (b.email !== undefined) { fields.push("email = ?"); params.push(b.email || null); }
  if (b.address !== undefined) { fields.push("address = ?"); params.push(b.address || null); }
  if (b.companySize !== undefined) { fields.push("company_size = ?"); params.push(b.companySize || null); }
  if (b.status !== undefined) { fields.push("status = ?"); params.push(b.status); }
  if (fields.length) {
    params.push(req.params.id);
    await query(`UPDATE customers SET ${fields.join(", ")} WHERE id=?`, params);
  }
  // A corrected/renamed customer name is kept in sync everywhere that references this customer_id
  // — leads/deals/quotations/sales orders/invoices/job cards/subscriptions each store the name as
  // their own text snapshot (for display/PDFs/CSV), so without this cascade a rename here would
  // never be reflected anywhere else, exactly the bug this was built to fix.
  if (b.name && before && b.name !== before.name) {
    await query("UPDATE leads SET company = ? WHERE customer_id = ?", [b.name, req.params.id]);
    await query("UPDATE deals SET customer = ? WHERE customer_id = ?", [b.name, req.params.id]);
    await query("UPDATE quotations SET customer = ? WHERE customer_id = ?", [b.name, req.params.id]);
    await query("UPDATE sales_orders SET customer = ? WHERE customer_id = ?", [b.name, req.params.id]);
    await query("UPDATE invoices SET customer = ? WHERE customer_id = ?", [b.name, req.params.id]);
    await query("UPDATE job_cards SET customer = ? WHERE customer_id = ?", [b.name, req.params.id]);
    await query("UPDATE customer_subscriptions SET customer = ? WHERE customer_id = ?", [b.name, req.params.id]);
  }
  res.json({ ok: true });
});

// One shared cloud storage link for the customer's whole KYC set — replaces the old per-document
// links on customer_docs (see schema.sql), which meant a different file link for every document
// instead of one folder link for the customer.
// Same gate as PATCH /:id above (kept in sync — this was missed when ops_member/Module Access
// can_edit were added there, silently 403ing a save even though the Edit button showed for them).
router.patch("/:id/cloud-link", requireRoleOrModuleEdit(["admin_like", "ops_manager", "ops_member", "pro_head", "pro"], "customers"), async (req, res) => {
  const { url } = req.body;
  const trimmed = (url || "").trim();
  // A non-URL value (typo, pasted the wrong thing) would silently "save" and then do nothing
  // useful when clicked — the app's own catch-all route just reopens the CRM itself for a bare
  // relative href, which looks exactly like "the link is broken" with no indication why.
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    return res.status(400).json({ error: "That doesn't look like a valid link — it should start with http:// or https://" });
  }
  await query("UPDATE customers SET cloud_link = ? WHERE id = ?", [trimmed || null, req.params.id]);
  res.json({ ok: true });
});

router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM customers WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Merges `sourceId` into this customer (:id, "target") — moves every lead/deal/quotation/sales
// order/invoice/job card/subscription/KYC doc/staff record/onboarding form off the source and
// onto the target (syncing each table's own denormalized customer name-snapshot column exactly
// like the rename cascade above does), fills any of the target's blank profile fields from the
// source (never overwrites one already set — this completes the record, it doesn't replace data
// someone already entered), then deletes the now-empty source. Admin-tier only — same boundary as
// plain deletion just above, since this ends in one too.
// Known gap: cheques.party_name is free text with no customer_id FK, so a merge won't rename or
// move any cheques tied to the source customer's name.
router.post("/:id/merge", requireRole(["admin_like"]), async (req, res) => {
  const targetId = req.params.id;
  const { sourceId } = req.body;
  if (!sourceId || sourceId === targetId) return res.status(400).json({ error: "A different customer to merge from is required" });

  await withTransaction(async (conn) => {
    const [[target]] = await conn.execute("SELECT * FROM customers WHERE id = ?", [targetId]);
    const [[source]] = await conn.execute("SELECT * FROM customers WHERE id = ?", [sourceId]);
    if (!target) throw Object.assign(new Error("Target customer not found"), { status: 404 });
    if (!source) throw Object.assign(new Error("Source customer not found"), { status: 404 });

    const fillable = ["type", "contact", "phone", "landline", "contact_mobile", "email", "address", "company_size", "cloud_link"];
    const filled = fillable.map((col) => target[col] || source[col] || null);
    await conn.execute(
      `UPDATE customers SET type=?, contact=?, phone=?, landline=?, contact_mobile=?, email=?, address=?, company_size=?, cloud_link=? WHERE id=?`,
      [...filled, targetId]
    );

    await conn.execute("UPDATE leads SET customer_id=?, company=? WHERE customer_id=?", [targetId, target.name, sourceId]);
    await conn.execute("UPDATE deals SET customer_id=?, customer=? WHERE customer_id=?", [targetId, target.name, sourceId]);
    await conn.execute("UPDATE quotations SET customer_id=?, customer=? WHERE customer_id=?", [targetId, target.name, sourceId]);
    await conn.execute("UPDATE sales_orders SET customer_id=?, customer=? WHERE customer_id=?", [targetId, target.name, sourceId]);
    await conn.execute("UPDATE invoices SET customer_id=?, customer=? WHERE customer_id=?", [targetId, target.name, sourceId]);
    await conn.execute("UPDATE job_cards SET customer_id=?, customer=? WHERE customer_id=?", [targetId, target.name, sourceId]);
    await conn.execute("UPDATE customer_subscriptions SET customer_id=?, customer=? WHERE customer_id=?", [targetId, target.name, sourceId]);
    await conn.execute("UPDATE customer_docs SET customer_id=? WHERE customer_id=?", [targetId, sourceId]);
    await conn.execute("UPDATE customer_staff SET customer_id=? WHERE customer_id=?", [targetId, sourceId]);
    await conn.execute("UPDATE onboarding_forms SET customer_id=? WHERE customer_id=?", [targetId, sourceId]);

    await conn.execute("DELETE FROM customers WHERE id=?", [sourceId]);
  });
  res.json({ ok: true, targetId });
});

// --- KYC documents -------------------------------------------------------------------------
router.post("/:id/docs", async (req, res) => {
  const b = req.body;
  if (COMPULSORY_KYC_DOC_TYPES.includes(b.type) && !b.expiry) {
    return res.status(400).json({ error: `${b.type} needs an expiry date.` });
  }
  const docId = nextId("DOC");
  await query("INSERT INTO customer_docs (id, customer_id, type, number, expiry, cloud_link) VALUES (?,?,?,?,?,?)",
    [docId, req.params.id, b.type, b.number || null, b.expiry || null, b.cloudLink || null]);
  res.status(201).json({ id: docId });
});
router.patch("/:id/docs/:docId", async (req, res) => {
  const b = req.body;
  const [existing] = await query("SELECT type FROM customer_docs WHERE id = ? AND customer_id = ?", [req.params.docId, req.params.id]);
  const effectiveType = b.type || existing?.type;
  if (COMPULSORY_KYC_DOC_TYPES.includes(effectiveType) && !b.expiry) {
    return res.status(400).json({ error: `${effectiveType} needs an expiry date.` });
  }
  // cloud_link is COALESCE'd, not overwritten — the form no longer sends it (superseded by the
  // customer-level link), so an edit here must not silently wipe a document's historical value.
  await query("UPDATE customer_docs SET type=COALESCE(?,type), number=?, expiry=?, cloud_link=COALESCE(?,cloud_link) WHERE id=? AND customer_id=?",
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

  // Prefer the reliable customer_id link; only fall back to the fragile name match for legacy
  // rows created before this customer was linked (customer_id IS NULL) — a linked row with a
  // stale/mismatched name (the exact bug this was built to fix) is still found correctly.
  const byCustomer = "(customer_id = ? OR (customer_id IS NULL AND customer = ?))";
  const quotations = await query(`SELECT * FROM quotations WHERE ${byCustomer} ORDER BY created_at DESC`, [req.params.id, customer.name]);
  const invoices = await query(`SELECT * FROM invoices WHERE ${byCustomer} ORDER BY created_at DESC`, [req.params.id, customer.name]);
  const payments = await query(`SELECT * FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE ${byCustomer})`, [req.params.id, customer.name]);
  const jobCards = await query(`SELECT * FROM job_cards WHERE ${byCustomer} ORDER BY created_at DESC`, [req.params.id, customer.name]);

  const totalInvoiced = invoices.reduce((a, i) => a + Number(i.amount), 0);
  const totalPaid = payments.reduce((a, p) => a + Number(p.amount), 0);

  res.json({
    quotations: quotations.map((q) => ({ ...q, items: q.items, ...quoteTotal(q.items, q.order_discount, q.order_discount_type) })),
    invoices: invoices.map((inv) => ({ ...inv, payments: payments.filter((p) => p.invoice_id === inv.id) })),
    jobCards,
    statement: { totalInvoiced, totalPaid, balance: totalInvoiced - totalPaid },
  });
});

router.get("/:id/statement/pdf", async (req, res) => {
  const [customer] = await query("SELECT id, name FROM customers WHERE id = ?", [req.params.id]);
  if (!customer) return res.status(404).json({ error: "Not found" });

  const byCustomer = "(customer_id = ? OR (customer_id IS NULL AND customer = ?))";
  const invoices = await query(`SELECT * FROM invoices WHERE ${byCustomer} ORDER BY created_at ASC`, [req.params.id, customer.name]);
  const payments = await query(`SELECT * FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE ${byCustomer})`, [req.params.id, customer.name]);
  // pool.execute() (prepared statements) doesn't auto-expand an array param into IN (?,?,...) the
  // way pool.query() does — build the placeholders explicitly instead.
  const soIds = [...new Set(invoices.map((i) => i.sales_order_id).filter(Boolean))];
  const subIds = [...new Set(invoices.map((i) => i.subscription_id).filter(Boolean))];
  const salesOrders = soIds.length ? await query(`SELECT id, service FROM sales_orders WHERE id IN (${soIds.map(() => "?").join(",")})`, soIds) : [];
  const subscriptions = subIds.length ? await query(`SELECT id, plan_name FROM customer_subscriptions WHERE id IN (${subIds.map(() => "?").join(",")})`, subIds) : [];

  const totalInvoiced = invoices.reduce((a, i) => a + Number(i.amount), 0);
  const totalPaid = payments.reduce((a, p) => a + Number(p.amount), 0);

  const invoicesWithService = invoices.map((inv) => ({
    ...inv,
    payments: payments.filter((p) => p.invoice_id === inv.id),
    service: salesOrders.find((so) => so.id === inv.sales_order_id)?.service
      || subscriptions.find((s) => s.id === inv.subscription_id)?.plan_name
      || null,
  }));

  generateAccountStatementPdf(customer, invoicesWithService, { totalInvoiced, totalPaid, balance: totalInvoiced - totalPaid }, res);
});

// --- Onboarding Form (company-formation data collection) -----------------------------------
// A customer can have several forms over time (e.g. repeat company formations) — each its own
// permanent record. Staff can view/fill one directly here, or generate a public link (a random
// token, unique per form) so the client fills it in themselves — see publicOnboarding.routes.js
// for the unauthenticated counterpart of GET/PATCH below.
const mapOnboardingForm = (row) => ({
  id: row.id,
  companyNamesEn: row.company_names_en || [], companyNamesAr: row.company_names_ar || [],
  activities: row.activities || [], capitalAmount: row.capital_amount,
  legalStatus: row.legal_status || "WLL", partners: row.partners || [], visas: row.visas || [],
  status: row.status, submittedAt: row.submitted_at, createdAt: row.created_at,
});

router.get("/:id/onboarding", async (req, res) => {
  const rows = await query("SELECT * FROM onboarding_forms WHERE customer_id = ? ORDER BY created_at DESC", [req.params.id]);
  res.json(rows.map(mapOnboardingForm));
});

router.post("/:id/onboarding", async (req, res) => {
  const [customer] = await query("SELECT id FROM customers WHERE id = ?", [req.params.id]);
  if (!customer) return res.status(404).json({ error: "Not found" });
  const id = nextId("OB");
  const token = crypto.randomBytes(24).toString("hex");
  await query(
    `INSERT INTO onboarding_forms (id, customer_id, token, company_names_en, company_names_ar, activities, partners, visas, created_by) VALUES (?,?,?,'[]','[]','[]','[]','[]',?)`,
    [id, req.params.id, token, req.user.id]
  );
  const [row] = await query("SELECT * FROM onboarding_forms WHERE id = ?", [id]);
  res.status(201).json(mapOnboardingForm(row));
});

router.patch("/:id/onboarding/:formId", async (req, res) => {
  const b = req.body;
  const result = await query(
    `UPDATE onboarding_forms SET company_names_en=?, company_names_ar=?, activities=?, capital_amount=?, legal_status=?, partners=?, visas=? WHERE id = ? AND customer_id = ?`,
    [
      JSON.stringify(b.companyNamesEn || []), JSON.stringify(b.companyNamesAr || []),
      JSON.stringify(b.activities || []), b.capitalAmount ?? null, b.legalStatus || "WLL",
      JSON.stringify(b.partners || []), JSON.stringify(b.visas || []),
      req.params.formId, req.params.id,
    ]
  );
  if (!result.affectedRows) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

router.post("/:id/onboarding/:formId/link", async (req, res) => {
  const [row] = await query("SELECT token FROM onboarding_forms WHERE id = ? AND customer_id = ?", [req.params.formId, req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const url = `${req.protocol}://${req.get("host")}/onboarding/${row.token}`;
  res.json({ token: row.token, url });
});

router.get("/:id/onboarding/:formId/pdf", async (req, res) => {
  const [form] = await query("SELECT * FROM onboarding_forms WHERE id = ? AND customer_id = ?", [req.params.formId, req.params.id]);
  if (!form) return res.status(404).json({ error: "Not found" });
  const [customer] = await query("SELECT name FROM customers WHERE id = ?", [req.params.id]);
  generateOnboardingFormPdf(form, customer?.name || "", res);
});

module.exports = router;
