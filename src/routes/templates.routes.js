const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireModuleView } = require("../middleware/roles");
const { nextId } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

// --- Services list (admin-extensible, used everywhere) -----------------------------------
router.get("/services", async (req, res) => {
  const rows = await query("SELECT name FROM services ORDER BY name");
  res.json(rows.map((r) => r.name));
});

router.post("/services", requireRole(["admin_like", "sales_manager", "ops_manager", "hr", "data_manager", "pro_head", "pro"]), async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Service name is required" });
  await query("INSERT IGNORE INTO services (name) VALUES (?)", [name.trim()]);
  await query("INSERT IGNORE INTO checklist_templates (service, steps) VALUES (?, '[]')", [name.trim()]);
  res.status(201).json({ ok: true });
});

router.delete("/services/:name", requireRole(["admin_like"]), async (req, res) => {
  await query("DELETE FROM services WHERE name = ?", [req.params.name]);
  res.json({ ok: true });
});

// --- Service costs (internal delivery cost per service, e.g. Office Space Assistance = 2,000 QAR —
// subtracted from Professional Fee to get Business Volume; see service_costs in schema.sql) -------
router.get("/service-costs", async (req, res) => {
  const rows = await query("SELECT service, cost FROM service_costs");
  const byService = {};
  for (const r of rows) byService[r.service] = Number(r.cost);
  res.json(byService);
});

router.put("/service-costs/:service", requireRole(["admin_like", "sales_manager"]), async (req, res) => {
  const { cost } = req.body;
  await query(
    "INSERT INTO service_costs (service, cost) VALUES (?, ?) ON DUPLICATE KEY UPDATE cost = VALUES(cost)",
    [req.params.service, cost || 0]
  );
  res.json({ ok: true });
});

// --- Item catalog (reusable quotation line items — pick one instead of retyping) ----------
router.get("/item-catalog", async (req, res) => {
  const rows = await query("SELECT * FROM item_catalog WHERE active = 1 ORDER BY name");
  res.json(rows);
});

router.post("/item-catalog", requireRole(["admin_like", "sales_manager", "ops_manager", "hr", "data_manager", "pro_head", "pro"]), async (req, res) => {
  const { name, description, note, feeType, price, service } = req.body;
  if (!name?.trim() || !description?.trim()) return res.status(400).json({ error: "Name and description are required" });
  const id = nextId("IC");
  await query(
    "INSERT INTO item_catalog (id, name, description, note, fee_type, price, service) VALUES (?,?,?,?,?,?,?)",
    [id, name.trim(), description.trim(), note || null, feeType || "Government Fee", price || 0, service || null]
  );
  res.status(201).json({ id });
});

router.patch("/item-catalog/:id", requireRole(["admin_like", "sales_manager", "ops_manager", "hr", "data_manager", "pro_head", "pro"]), async (req, res) => {
  const { name, description, note, feeType, price, service } = req.body;
  await query(
    "UPDATE item_catalog SET name=?, description=?, note=?, fee_type=?, price=?, service=? WHERE id=?",
    [name.trim(), description.trim(), note || null, feeType || "Government Fee", price || 0, service || null, req.params.id]
  );
  res.json({ ok: true });
});

router.delete("/item-catalog/:id", requireRole(["admin_like"]), async (req, res) => {
  await query("UPDATE item_catalog SET active = 0 WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// --- Quotation templates (one per service — Government Fee lines live alongside Professional
// Fee ones in the same `items` array, tagged per-item; see quotation_templates in schema.sql) ---
router.get("/quotation-templates", async (req, res) => {
  const rows = await query("SELECT * FROM quotation_templates");
  const grouped = {};
  for (const r of rows) grouped[r.service] = { ...r, items: r.items || [] };
  res.json(grouped);
});

router.put("/quotation-templates/:service", requireRole(["admin_like", "sales_manager"]), async (req, res) => {
  const { service } = req.params;
  const b = req.body;
  await query(
    `INSERT INTO quotation_templates (service, subject, items, notes, terms, order_discount, order_discount_type, bank, footer_note)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE subject=VALUES(subject), items=VALUES(items), notes=VALUES(notes), terms=VALUES(terms),
       order_discount=VALUES(order_discount), order_discount_type=VALUES(order_discount_type), bank=VALUES(bank), footer_note=VALUES(footer_note)`,
    [service, b.subject || null, JSON.stringify(b.items || []), b.notes || null, b.terms || null, b.orderDiscount || 0,
      b.orderDiscountType === "percent" ? "percent" : "amount", b.bank || null, b.footerNote || null]
  );
  res.json({ ok: true });
});

// Clears the saved template for a service (the service itself stays — only its template content
// is removed) so the next "New quotation" for it just starts blank instead of loading stale content.
router.delete("/quotation-templates/:service", requireRole(["admin_like", "sales_manager"]), async (req, res) => {
  await query("DELETE FROM quotation_templates WHERE service = ?", [req.params.service]);
  res.json({ ok: true });
});

// --- Checklist templates (per service, used to seed Job Card checklists) -----------------
// Unlike /quotation-templates above (read inside the Quote Builder by anyone with quotations
// access) or /services and /item-catalog (base data read everywhere), this GET is only ever
// consulted by the Templates admin page itself — safe to gate on its own module permission.
router.get("/checklist-templates", requireModuleView("templates"), async (req, res) => {
  const rows = await query("SELECT * FROM checklist_templates");
  const out = {};
  for (const r of rows) out[r.service] = r.steps || [];
  res.json(out);
});

router.put("/checklist-templates/:service", requireRole(["admin_like", "ops_manager", "pro_head", "pro"]), async (req, res) => {
  await query("UPDATE checklist_templates SET steps = ? WHERE service = ?", [JSON.stringify(req.body.steps || []), req.params.service]);
  res.json({ ok: true });
});

module.exports = router;
