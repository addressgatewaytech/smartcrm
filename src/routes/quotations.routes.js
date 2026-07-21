const express = require("express");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, daysFromNow, quoteTotal } = require("../utils/helpers");
const { generateQuotationPdf } = require("../utils/quotationPdf");

const router = express.Router();
router.use(requireAuth);

function parseRow(r) {
  return {
    ...r,
    items: JSON.parse(r.items || "[]"),
    email_cc: r.email_cc ? JSON.parse(r.email_cc) : [],
    ...quoteTotal(JSON.parse(r.items || "[]"), r.order_discount),
  };
}

router.get("/", async (req, res) => {
  const isSalesExec = req.user.roles.includes("sales_exec") && !isAdminLike(req.user.roles) && !req.user.roles.includes("sales_manager");
  const rows = isSalesExec
    ? await query("SELECT * FROM quotations WHERE owner = ? OR owner IS NULL ORDER BY created_at DESC", [req.user.id])
    : await query("SELECT * FROM quotations ORDER BY created_at DESC");
  res.json(rows.map(parseRow));
});

router.get("/:id", async (req, res) => {
  const [row] = await query("SELECT * FROM quotations WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(parseRow(row));
});

// Real server-side A4 PDF (PDFKit) — replaces the prototype's HTML+print-dialog workaround.
router.get("/:id/pdf", async (req, res) => {
  const [row] = await query("SELECT * FROM quotations WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  generateQuotationPdf(parseRow(row), res);
});

router.post("/", async (req, res) => {
  const b = req.body;
  const id = nextId("QT");
  const hasDiscount = (b.items || []).some((it) => it.discountPct > 0) || (b.orderDiscount || 0) > 0;
  const status = hasDiscount ? "Pending Manager Approval" : "Draft";

  await query(
    `INSERT INTO quotations (id, deal_id, customer, fee_type, subject, items, order_discount, bank, footer_note, notes, terms, status, valid_till, owner, favorite)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
    [id, b.dealId || null, b.customer, b.feeType || "Professional Fee", b.subject || null, JSON.stringify(b.items || []), b.orderDiscount || 0,
      b.bank || null, b.footerNote || null, b.notes || null, b.terms || null, status, daysFromNow(14), b.owner || req.user.id]
  );
  if (b.dealId) await query("UPDATE deals SET stage = 'Quotation Sent' WHERE id = ?", [b.dealId]);
  res.status(201).json({ id, status });
});

router.patch("/:id", async (req, res) => {
  const [row] = await query("SELECT status FROM quotations WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!["Draft", "Pending Manager Approval"].includes(row.status)) {
    return res.status(400).json({ error: "Only Draft or Pending Manager Approval quotations can be edited" });
  }
  const b = req.body;
  const hasDiscount = (b.items || []).some((it) => it.discountPct > 0) || (b.orderDiscount || 0) > 0;
  await query(
    `UPDATE quotations SET customer=?, fee_type=?, subject=?, items=?, order_discount=?, bank=?, footer_note=?, notes=?, terms=?, status=?
     WHERE id = ?`,
    [b.customer, b.feeType, b.subject || null, JSON.stringify(b.items || []), b.orderDiscount || 0, b.bank || null, b.footerNote || null,
      b.notes || null, b.terms || null, hasDiscount ? "Pending Manager Approval" : "Draft", req.params.id]
  );
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const [row] = await query("SELECT status FROM quotations WHERE id = ?", [req.params.id]);
  if (row?.status !== "Draft") return res.status(400).json({ error: "Only Draft quotations can be removed" });
  await query("DELETE FROM quotations WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Sales Manager / Admin-tier approves a discounted quotation, moving it to Sent.
router.post("/:id/approve-discount", requireRole(["sales_manager", "admin_like"]), async (req, res) => {
  await query("UPDATE quotations SET status = 'Sent' WHERE id = ? AND status = 'Pending Manager Approval'", [req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/status", async (req, res) => {
  const { status } = req.body; // "Sent" | "Under Negotiation" | "Rejected" | "Approved" (Government Fee terminal state — see below)
  await query("UPDATE quotations SET status = ? WHERE id = ?", [status, req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/favorite", async (req, res) => {
  await query("UPDATE quotations SET favorite = 1 - favorite WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/emailed", async (req, res) => {
  const { cc } = req.body;
  await query("UPDATE quotations SET emailed_to_client = 1, emailed_at = NOW(), email_cc = ? WHERE id = ?", [JSON.stringify(cc || []), req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/clone", async (req, res) => {
  const [src] = await query("SELECT * FROM quotations WHERE id = ?", [req.params.id]);
  if (!src) return res.status(404).json({ error: "Not found" });
  const id = nextId("QT");
  const customer = req.body.customer || src.customer;
  const dealId = req.body.customer && req.body.customer !== src.customer ? null : src.deal_id;
  await query(
    `INSERT INTO quotations (id, deal_id, customer, fee_type, subject, items, order_discount, bank, footer_note, notes, terms, status, valid_till, owner, favorite)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'Draft',?,?,0)`,
    [id, dealId, customer, src.fee_type, src.subject, src.items, src.order_discount, src.bank, src.footer_note, src.notes, src.terms, daysFromNow(14), req.user.id]
  );
  res.status(201).json({ id });
});

// --- Convert to Sales Order ---------------------------------------------------------------
// CRITICAL RULE: Government Fee quotations NEVER create a Sales Order/Invoice/Job Card.
// Accepting one just marks it Approved and stops there — enforced here, not just in the UI.
router.post("/:id/convert-to-sales-order", async (req, res) => {
  const result = await withTransaction(async (conn) => {
    const [[q]] = await conn.execute("SELECT * FROM quotations WHERE id = ?", [req.params.id]);
    if (!q) throw new Error("Quotation not found");

    if (q.fee_type === "Government Fee") {
      await conn.execute("UPDATE quotations SET status = 'Approved' WHERE id = ?", [q.id]);
      return { salesOrderId: null, governmentFee: true };
    }

    await conn.execute("UPDATE quotations SET status = 'Approved' WHERE id = ?", [q.id]);
    const items = JSON.parse(q.items);
    const { total } = quoteTotal(items, q.order_discount);
    const soId = nextId("SO");
    await conn.execute(
      `INSERT INTO sales_orders (id, quotation_id, customer, service, fee_type, amount, order_discount) VALUES (?,?,?,?,?,?,?)`,
      [soId, q.id, q.customer, items[0]?.service || null, q.fee_type, total, q.order_discount]
    );
    if (q.deal_id) await conn.execute("UPDATE deals SET stage = 'Won' WHERE id = ?", [q.deal_id]);
    return { salesOrderId: soId, governmentFee: false };
  });
  res.json(result);
});

module.exports = router;
