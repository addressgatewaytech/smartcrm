const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");

const router = express.Router();
router.use(requireAuth);

// --- Services list (admin-extensible, used everywhere) -----------------------------------
router.get("/services", async (req, res) => {
  const rows = await query("SELECT name FROM services ORDER BY name");
  res.json(rows.map((r) => r.name));
});

router.post("/services", requireRole(["admin_like", "sales_manager", "ops_manager", "hr", "data_manager"]), async (req, res) => {
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

// --- Quotation templates (keyed by service + feeType) -------------------------------------
router.get("/quotation-templates", async (req, res) => {
  const rows = await query("SELECT * FROM quotation_templates");
  const grouped = {};
  for (const r of rows) {
    grouped[r.service] = grouped[r.service] || {};
    grouped[r.service][r.fee_type] = { ...r, items: JSON.parse(r.items || "[]") };
  }
  res.json(grouped);
});

router.put("/quotation-templates/:service/:feeType", requireRole(["admin_like", "sales_manager"]), async (req, res) => {
  const { service, feeType } = req.params;
  const b = req.body;
  await query(
    `INSERT INTO quotation_templates (service, fee_type, subject, items, notes, terms, order_discount, bank, footer_note)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE subject=VALUES(subject), items=VALUES(items), notes=VALUES(notes), terms=VALUES(terms),
       order_discount=VALUES(order_discount), bank=VALUES(bank), footer_note=VALUES(footer_note)`,
    [service, decodeURIComponent(feeType), b.subject || null, JSON.stringify(b.items || []), b.notes || null, b.terms || null, b.orderDiscount || 0, b.bank || null, b.footerNote || null]
  );
  res.json({ ok: true });
});

// --- Checklist templates (per service, used to seed Job Card checklists) -----------------
router.get("/checklist-templates", async (req, res) => {
  const rows = await query("SELECT * FROM checklist_templates");
  const out = {};
  for (const r of rows) out[r.service] = JSON.parse(r.steps || "[]");
  res.json(out);
});

router.put("/checklist-templates/:service", requireRole(["admin_like", "ops_manager"]), async (req, res) => {
  await query("UPDATE checklist_templates SET steps = ? WHERE service = ?", [JSON.stringify(req.body.steps || []), req.params.service]);
  res.json({ ok: true });
});

module.exports = router;
