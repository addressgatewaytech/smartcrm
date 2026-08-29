const express = require("express");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, nextSequentialId, daysFromNow, quoteTotal, professionalFeeTotal, findOrCreateCustomer } = require("../utils/helpers");
const { generateQuotationPdf, THEMES } = require("../utils/quotationPdf");
const validTheme = (t) => (t && THEMES[t] ? t : "charcoal");
const { requireRoleOrApprovalTypeDesignation, isAssignedApprover, approverAudience } = require("../utils/designationApproval");

// Sales Manager / Admin-tier can always send a quotation straight to the client; anyone else
// needs to submit it for approval first (see /:id/submit-for-approval and /:id/approve-discount)
// unless the Approval Process Workflow (Users & Roles) has assigned their designation as an
// approver for "Quotation Approval".
async function canSendDirectly(user) {
  if (user.roles.includes("sales_manager") || isAdminLike(user.roles)) return true;
  return isAssignedApprover(user.id, "quotation_approval");
}

// Notifies whoever can actually approve this quotation — Sales Manager/Admin-tier plus anyone
// whose designation is assigned as a "Quotation Approval" approver — the moment it lands in
// Pending Manager Approval, from any of the three paths that can put it there (create with a
// discount, edit into a discount, or the explicit submit-for-approval action).
async function notifyQuotationApprovers(id, customer) {
  const audience = await approverAudience("quotation_approval", ["sales_manager", "super_admin", "admin", "admin_exec"]);
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'approval', ?, ?, ?)",
    [nextId("NT"), "Quotation awaiting approval", `${id} for ${customer} has a discount and needs approval before it can be sent.`, JSON.stringify(audience)]);
}

const router = express.Router();
router.use(requireAuth);

// Keeps deals.value honest: rather than a manually-typed estimate, a deal's value is always
// whichever quotation was most recently created for it (its real Professional Fee total) — or 0
// if it has no quotation yet. Called after any create/edit/delete that could change what "the
// latest quotation" is or what it totals to.
async function syncDealValue(dealId) {
  if (!dealId) return;
  const [latest] = await query(
    "SELECT items, order_discount, order_discount_type, fee_type FROM quotations WHERE deal_id = ? ORDER BY created_at DESC LIMIT 1",
    [dealId]
  );
  const value = latest ? professionalFeeTotal(latest.items || [], latest.order_discount, latest.fee_type, latest.order_discount_type) : 0;
  await query("UPDATE deals SET value = ? WHERE id = ?", [value, dealId]);
}

function parseRow(r) {
  return {
    ...r,
    items: r.items || [],
    email_cc: r.email_cc || [],
    ...quoteTotal(r.items || [], r.order_discount, r.order_discount_type),
  };
}

router.get("/", async (req, res) => {
  // Same visibility rule as /leads and /deals — only Sales/Ops Manager and Admin-tier see
  // everyone's quotations; everyone else only their own.
  const canSeeAll = isAdminLike(req.user.roles) || req.user.roles.includes("viewer") || req.user.roles.includes("sales_manager") || req.user.roles.includes("ops_manager");
  const rows = canSeeAll
    ? await query("SELECT * FROM quotations ORDER BY created_at DESC")
    : await query("SELECT * FROM quotations WHERE owner = ? OR owner IS NULL ORDER BY created_at DESC", [req.user.id]);
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
  // Quotations only store the customer's name, not their id, so the address is looked up by
  // name at PDF-generation time rather than duplicated onto every quotation row.
  const [customer] = await query("SELECT address FROM customers WHERE name = ?", [row.customer]);
  generateQuotationPdf({ ...parseRow(row), customer_address: customer?.address || "" }, res);
});

// A quotation must come from an existing Deal — no more standalone/direct quotations with a
// free-text customer, so every quotation is traceable back through Deal -> Lead for reporting and
// pipeline management. (Cloning an existing quotation to a different customer is a separate,
// deliberate "use this as a template" path and is unaffected by this rule.)
router.post("/", async (req, res) => {
  const b = req.body;
  if (!b.dealId) return res.status(400).json({ error: "A quotation must be created from an existing deal" });
  const id = await withTransaction((conn) => nextSequentialId(conn, "AGBSQS", "quotation"));
  const hasDiscount = (b.items || []).some((it) => it.discountPct > 0) || (b.orderDiscount || 0) > 0;
  const status = hasDiscount ? "Pending Manager Approval" : "Draft";

  // A quotation created from a deal belongs to that deal's owner, not whoever happened to click
  // "Create quotation" — otherwise a manager/admin creating one on a sales_exec's behalf makes it
  // invisible to that sales_exec (owner-scoped GET / filters strictly by owner).
  let owner = b.owner;
  const [deal] = await query("SELECT owner, customer_id FROM deals WHERE id = ?", [b.dealId]);
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  if (!owner) owner = deal.owner;
  let customerId = deal.customer_id || null;
  let customerName = b.customer;
  owner = owner || req.user.id;
  // A deal predating customer_id linking resolves/creates its Customer link the same way a lead does.
  if (!customerId) {
    ({ customerId, resolvedName: customerName } = await findOrCreateCustomer(query, { name: b.customer, ownerId: owner }));
  } else {
    // Inherited straight from the deal — use that Customer's actual current name, not whatever
    // text happened to be typed on the quotation form, so the two can never end up mismatched.
    const [cust] = await query("SELECT name FROM customers WHERE id = ?", [customerId]);
    if (cust) customerName = cust.name;
  }

  await query(
    `INSERT INTO quotations (id, deal_id, customer, fee_type, theme, subject, items, order_discount, order_discount_type, package_tier, bank, footer_note, notes, terms, status, valid_till, owner, favorite, customer_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
    [id, b.dealId || null, customerName, b.feeType || "Professional Fee", validTheme(b.theme), b.subject || null, JSON.stringify(b.items || []), b.orderDiscount || 0,
      b.orderDiscountType === "percent" ? "percent" : "amount", b.packageTier || null, b.bank || null, b.footerNote || null, b.notes || null, b.terms || null, status, daysFromNow(14), owner, customerId]
  );
  if (b.dealId) {
    await query("UPDATE deals SET stage = 'Quotation Sent' WHERE id = ?", [b.dealId]);
    await syncDealValue(b.dealId);
  }
  if (status === "Pending Manager Approval") await notifyQuotationApprovers(id, customerName);
  res.status(201).json({ id, status });
});

router.patch("/:id", async (req, res) => {
  const [row] = await query("SELECT customer, fee_type, theme, status, deal_id, package_tier FROM quotations WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!["Draft", "Pending Manager Approval"].includes(row.status)) {
    return res.status(400).json({ error: "Only Draft or Pending Manager Approval quotations can be edited" });
  }
  const b = req.body;
  // Visual edit (the only edit path in the UI) only ever sends subject/items/notes/terms/discount/
  // bank/footerNote/theme — customer, feeType and packageTier aren't part of that form, so fall
  // back to the existing row rather than writing a SQL NULL bind error (or silently wiping the
  // package tier) every single save.
  let customer = b.customer ?? row.customer;
  const feeType = b.feeType ?? row.fee_type;
  const theme = b.theme !== undefined ? validTheme(b.theme) : row.theme;
  const packageTier = b.packageTier !== undefined ? b.packageTier : row.package_tier;
  const hasDiscount = (b.items || []).some((it) => it.discountPct > 0) || (b.orderDiscount || 0) > 0;
  const newStatus = hasDiscount ? "Pending Manager Approval" : "Draft";
  // Editing the customer name means it may now belong to a different (or new) Customer profile.
  // If that resolves to an existing customer via phone/email (not the typed name), use its real
  // name here too, instead of leaving the two mismatched.
  let customerId;
  if (b.customer !== undefined) {
    ({ customerId, resolvedName: customer } = await findOrCreateCustomer(query, { name: customer, ownerId: req.user.id }));
  }
  await query(
    `UPDATE quotations SET customer=?, fee_type=?, theme=?, subject=?, items=?, order_discount=?, order_discount_type=?, package_tier=?, bank=?, footer_note=?, notes=?, terms=?, status=?${customerId !== undefined ? ", customer_id=?" : ""}
     WHERE id = ?`,
    [customer, feeType, theme, b.subject || null, JSON.stringify(b.items || []), b.orderDiscount || 0, b.orderDiscountType === "percent" ? "percent" : "amount", packageTier,
      b.bank || null, b.footerNote || null, b.notes || null, b.terms || null, newStatus, ...(customerId !== undefined ? [customerId] : []), req.params.id]
  );
  // Only notify on the transition INTO Pending Manager Approval — not on every re-save of a
  // quotation that was already sitting there, which would spam the approver on each edit.
  if (newStatus === "Pending Manager Approval" && row.status !== "Pending Manager Approval") {
    await notifyQuotationApprovers(req.params.id, customer);
  }
  // Re-derives the deal's value from whichever quotation is actually latest for it — usually
  // this one, but syncDealValue re-queries rather than assuming, so it's correct either way.
  await syncDealValue(row.deal_id);
  res.json({ ok: true });
});

// Admin can delete a quotation regardless of status — the one thing still blocked is a quotation
// that already has a Sales Order, since sales_orders.quotation_id cascades on delete and would
// silently take real downstream records (invoices, payments, job cards) with it. Every other
// status (Sent, Rejected, Expired, Client Accepted before conversion, an Approved Government Fee
// quotation, ...) has nothing hanging off it and is safe to remove outright.
router.delete("/:id", requireRole(["admin_like"]), async (req, res) => {
  const [row] = await query("SELECT status, deal_id FROM quotations WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const [so] = await query("SELECT id FROM sales_orders WHERE quotation_id = ? LIMIT 1", [req.params.id]);
  if (so) return res.status(400).json({ error: "This quotation already has a Sales Order — remove that first (it cascades to any invoices/job cards)." });
  await query("DELETE FROM quotations WHERE id = ?", [req.params.id]);
  // Falls back to the next-latest quotation for this deal, or 0 if that was the only one.
  await syncDealValue(row.deal_id);
  res.json({ ok: true });
});

// Reopens a quotation for editing — moves it back to Draft (unlocking PATCH and the normal
// Submit-for-approval / Send-to-client flow) and returns the linked deal to "Quotation Sent" so
// the pipeline reflects that it's back under negotiation. Available any time after it's been
// sent to the client and before/at Approved (covers a client wanting changes mid-negotiation, not
// just after full approval) — Admin-only, since it can silently reopen a quotation a Sales
// Manager already signed off on. Does NOT touch any Sales Order/Invoice/Job Card already created
// from a previous approval — those are a separate record of what was actually agreed at the time;
// an admin can remove one via its own page if it truly was a mistake.
router.post("/:id/revise", requireRole(["admin_like"]), async (req, res) => {
  const [q] = await query("SELECT status, deal_id FROM quotations WHERE id = ?", [req.params.id]);
  if (!q) return res.status(404).json({ error: "Not found" });
  const revisable = ["Sent", "Under Negotiation", "Client Accepted", "Approved"];
  if (!revisable.includes(q.status)) return res.status(400).json({ error: "This quotation can't be revised from its current status" });
  await query("UPDATE quotations SET status = 'Draft' WHERE id = ?", [req.params.id]);
  if (q.deal_id) await query("UPDATE deals SET stage = 'Quotation Sent' WHERE id = ?", [q.deal_id]);
  res.json({ ok: true });
});

// Any Draft quotation can be submitted for approval, not just discounted ones — this is how a
// plain sales_exec (no direct-send privilege) gets a quotation in front of an approver before
// it can go to the client.
router.post("/:id/submit-for-approval", async (req, res) => {
  const result = await query("UPDATE quotations SET status = 'Pending Manager Approval' WHERE id = ? AND status = 'Draft'", [req.params.id]);
  if (result.affectedRows > 0) {
    const [q] = await query("SELECT customer FROM quotations WHERE id = ?", [req.params.id]);
    await notifyQuotationApprovers(req.params.id, q.customer);
  }
  res.json({ ok: true });
});

// Sales Manager / Admin-tier approves a quotation pending approval, moving it to Sent — or, if
// the Approval Process Workflow (Users & Roles) has assigned designations to "Quotation
// Approval", anyone holding one of those designations can too.
router.post("/:id/approve-discount", requireRoleOrApprovalTypeDesignation(["sales_manager", "admin_like"], "quotation_approval"), async (req, res) => {
  await query("UPDATE quotations SET status = 'Sent' WHERE id = ? AND status = 'Pending Manager Approval'", [req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/status", async (req, res) => {
  const { status } = req.body; // "Sent" | "Under Negotiation" | "Client Accepted" | "Rejected" | "Approved" (Government Fee terminal state — see below)

  if (status === "Sent") {
    const [q] = await query("SELECT status FROM quotations WHERE id = ?", [req.params.id]);
    if (!q) return res.status(404).json({ error: "Not found" });
    // A quotation pending approval must go through /:id/approve-discount, not this generic
    // route — otherwise anyone could bypass the approval gate entirely.
    if (q.status === "Pending Manager Approval") {
      return res.status(400).json({ error: "This quotation needs approval before it can be sent — use the approve action" });
    }
    if (q.status === "Draft" && !(await canSendDirectly(req.user))) {
      return res.status(403).json({ error: "Submit this quotation for approval before sending it to the client" });
    }
  }

  // The salesperson marks the client's verbal/written acceptance here — this is a communication
  // step, not a financial one, so it stays open to whoever's talking to the client (no accounts/
  // admin gate). Converting that acceptance into an actual Sales Order is the gated step, below.
  if (status === "Client Accepted") {
    const [q] = await query("SELECT status FROM quotations WHERE id = ?", [req.params.id]);
    if (!q) return res.status(404).json({ error: "Not found" });
    if (!["Sent", "Under Negotiation"].includes(q.status)) {
      return res.status(400).json({ error: "Only a Sent or Under Negotiation quotation can be marked as client accepted" });
    }
  }

  await query("UPDATE quotations SET status = ? WHERE id = ?", [status, req.params.id]);
  // Mirror convert-to-sales-order's deal-stage sync for direct status changes (e.g. a
  // Government Fee quotation's terminal "Approved", or a plain Rejected before any sales order exists).
  if (status === "Approved" || status === "Rejected") {
    const [q] = await query("SELECT deal_id FROM quotations WHERE id = ?", [req.params.id]);
    if (q?.deal_id) await query("UPDATE deals SET stage = ? WHERE id = ?", [status === "Approved" ? "Won" : "Lost", q.deal_id]);
  }
  res.json({ ok: true });
});

router.post("/:id/favorite", async (req, res) => {
  await query("UPDATE quotations SET favorite = 1 - favorite WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Reassigns which salesperson this quotation is attributed to. An administrative correction, not
// a content edit — so unlike PATCH, it's allowed regardless of status (Sent/Approved quotations
// can still have their attribution fixed).
router.post("/:id/owner", requireRole(["admin_like"]), async (req, res) => {
  const { owner } = req.body;
  if (!owner) return res.status(400).json({ error: "owner is required" });
  const [row] = await query("SELECT id FROM quotations WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  await query("UPDATE quotations SET owner = ? WHERE id = ?", [owner, req.params.id]);
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
  const id = await withTransaction((conn) => nextSequentialId(conn, "AGBSQS", "quotation"));
  let customer = req.body.customer || src.customer;
  const customerChanged = req.body.customer && req.body.customer !== src.customer;
  const dealId = customerChanged ? null : src.deal_id;
  let customerId = src.customer_id;
  if (customerChanged) {
    // If this resolves to an existing customer via phone/email (not the typed name), use its
    // real name for this cloned quotation's own `customer` too, instead of leaving them mismatched.
    ({ customerId, resolvedName: customer } = await findOrCreateCustomer(query, { name: customer, ownerId: req.user.id }));
  }
  await query(
    `INSERT INTO quotations (id, deal_id, customer, fee_type, theme, subject, items, order_discount, order_discount_type, package_tier, bank, footer_note, notes, terms, status, valid_till, owner, favorite, customer_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Draft',?,?,0,?)`,
    [id, dealId, customer, src.fee_type, src.theme, src.subject, src.items, src.order_discount, src.order_discount_type || "amount", src.package_tier || null, src.bank, src.footer_note, src.notes, src.terms, daysFromNow(14), req.user.id, customerId]
  );
  // Only meaningful when the clone kept the same deal (customer unchanged) — dealId is null
  // otherwise, and syncDealValue is a no-op for that.
  await syncDealValue(dealId);
  res.status(201).json({ id });
});

// --- Convert to Sales Order ---------------------------------------------------------------
// CRITICAL RULE: Government Fee quotations NEVER create a Sales Order/Invoice/Job Card.
// Accepting one just marks it Approved and stops there — enforced here, not just in the UI.
// Restricted to Accounts/Admin — a sales user's part in this workflow ends at marking the
// quotation Client Accepted (see /:id/status above); only Accounts turns that into a real
// Sales Order, and only once the client has actually accepted.
router.post("/:id/convert-to-sales-order", requireRole(["accounts", "admin_like"]), async (req, res) => {
  const [q0] = await query("SELECT status FROM quotations WHERE id = ?", [req.params.id]);
  if (!q0) return res.status(404).json({ error: "Not found" });
  if (q0.status !== "Client Accepted") {
    return res.status(400).json({ error: "Only a quotation the client has accepted can be converted to a sales order" });
  }

  const result = await withTransaction(async (conn) => {
    const [[q]] = await conn.execute("SELECT * FROM quotations WHERE id = ?", [req.params.id]);
    if (!q) throw new Error("Quotation not found");

    // Backward compatibility: a quotation created before per-item fee-type tagging existed is
    // still a single whole-document type — a pure Government Fee one (from that era) still never
    // creates a Sales Order. New quotations are always saved as top-level "Professional Fee" even
    // when they contain Government Fee line items internally (tagged per-item instead), so this
    // branch now only ever fires for historical standalone Government Fee quotations.
    if (q.fee_type === "Government Fee") {
      await conn.execute("UPDATE quotations SET status = 'Approved' WHERE id = ?", [q.id]);
      return { salesOrderId: null, governmentFee: true };
    }

    await conn.execute("UPDATE quotations SET status = 'Approved' WHERE id = ?", [q.id]);
    const items = q.items;
    // A Sales Order is a frozen snapshot of what was agreed — it always stores the resolved flat
    // QAR discount amount, never the quotation's original percent, so sales_orders/invoices and
    // their PDFs keep working unchanged regardless of how the quotation's discount was entered.
    const { total, discountAmount } = quoteTotal(items, q.order_discount, q.order_discount_type);
    const professionalFeeAmount = professionalFeeTotal(items, q.order_discount, q.fee_type, q.order_discount_type);
    const soId = await nextSequentialId(conn, "AGBSSO", "sales_order");
    await conn.execute(
      `INSERT INTO sales_orders (id, quotation_id, customer, service, fee_type, amount, professional_fee_amount, order_discount, package_tier, customer_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [soId, q.id, q.customer, items[0]?.service || null, q.fee_type, total, professionalFeeAmount, discountAmount, q.package_tier || null, q.customer_id]
    );
    if (q.deal_id) await conn.execute("UPDATE deals SET stage = 'Won', won_at = NOW() WHERE id = ?", [q.deal_id]);
    return { salesOrderId: soId, governmentFee: false };
  });
  res.json(result);
});

module.exports = router;
