const express = require("express");
const { query, withTransaction } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireModuleView } = require("../middleware/roles");
const { nextId } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);
// Self-contained, like Data Manager — nothing outside this module reads cheques or software
// subscriptions, so the whole router can be gated at once instead of picking routes by hand.
router.use(requireModuleView("companyFinance"));

// --- Cheques (both directions) --------------------------------------------------------------
router.get("/cheques", async (req, res) => {
  const rows = await query("SELECT * FROM cheques ORDER BY deposit_date ASC");
  res.json(rows);
});

router.post("/cheques", requireRole(["admin_like", "accounts"]), async (req, res) => {
  const b = req.body;
  if (!b.direction || !b.chequeNumber || !b.amount || !b.partyName || !b.depositDate) {
    return res.status(400).json({ error: "Direction, cheque number, amount, party name, and deposit date are required" });
  }
  const id = nextId("CHQ");
  await query(
    `INSERT INTO cheques (id, direction, cheque_number, bank_name, amount, party_name, purpose, invoice_id, cheque_date, deposit_date, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, b.direction, b.chequeNumber, b.bankName || null, b.amount, b.partyName, b.purpose || null,
      b.direction === "Incoming" ? b.invoiceId || null : null, b.chequeDate || null, b.depositDate, b.notes || null, req.user.id]
  );
  res.status(201).json({ id });
});

// Recomputes an invoice's paid/balance status the same way invoices.routes.js's own payment
// routes do (see recalcInvoiceStatus there) — kept local rather than shared, since this is the
// only place outside that file that needs to touch invoice_payments. Status reflects whether the
// Professional Fee portion is collected, not the full invoice amount (a mixed invoice's
// Government Fee is a pass-through never actually being chased) — falls back to the full amount
// for a pure Government Fee invoice (professional_fee_amount 0), same as before this distinction
// existed. A payment's pf_amount is null for a cheque auto-recorded here (no split support yet) or
// anything predating that column, in which case its full amount counts toward Professional Fee.
async function recomputeInvoiceStatus(conn, invoiceId) {
  const [[invoice]] = await conn.execute("SELECT amount, professional_fee_amount FROM invoices WHERE id = ?", [invoiceId]);
  if (!invoice) return;
  const [payments] = await conn.execute("SELECT amount, pf_amount FROM invoice_payments WHERE invoice_id = ?", [invoiceId]);
  const pf = Number(invoice.professional_fee_amount || 0);
  let paid, target;
  if (pf > 0.005) {
    paid = payments.reduce((a, p) => a + Number(p.pf_amount != null ? p.pf_amount : p.amount), 0);
    target = pf;
  } else {
    paid = payments.reduce((a, p) => a + Number(p.amount), 0);
    target = Number(invoice.amount);
  }
  const status = paid >= target ? "Paid" : paid > 0 ? "Partially Paid" : "Sent";
  await conn.execute("UPDATE invoices SET status = ? WHERE id = ?", [status, invoiceId]);
}

router.patch("/cheques/:id", requireRole(["admin_like", "accounts"]), async (req, res) => {
  const { status, clearedAt } = req.body;
  const [cheque] = await query("SELECT * FROM cheques WHERE id = ?", [req.params.id]);
  if (!cheque) return res.status(404).json({ error: "Not found" });

  await withTransaction(async (conn) => {
    await conn.execute("UPDATE cheques SET status = ? WHERE id = ?", [status, req.params.id]);
    // An Incoming cheque linked to an invoice, once actually cleared by the bank, is a real
    // payment against that invoice — record it automatically so the invoice's balance reflects
    // it without Accounts having to enter the same amount twice.
    if (status === "Cleared" && cheque.direction === "Incoming" && cheque.invoice_id) {
      await conn.execute(
        "INSERT INTO invoice_payments (id, invoice_id, amount, mode, recorded_by, paid_at) VALUES (?,?,?,?,?,COALESCE(?, NOW()))",
        [nextId("PMT"), cheque.invoice_id, cheque.amount, "Cheque", req.user.id, clearedAt || null]
      );
      await recomputeInvoiceStatus(conn, cheque.invoice_id);
    }
  });
  res.json({ ok: true });
});

router.delete("/cheques/:id", requireRole(["admin_like", "accounts"]), async (req, res) => {
  await query("DELETE FROM cheques WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// --- Company software subscriptions (internal expense, distinct from customer_subscriptions) ---
router.get("/software-subscriptions", async (req, res) => {
  const rows = await query("SELECT * FROM company_software_subscriptions ORDER BY renewal_date ASC");
  res.json(rows);
});

router.post("/software-subscriptions", requireRole(["admin_like", "accounts"]), async (req, res) => {
  const b = req.body;
  if (!b.softwareName || !b.cost || !b.renewalDate) {
    return res.status(400).json({ error: "Software name, cost, and renewal date are required" });
  }
  const id = nextId("SWS");
  await query(
    `INSERT INTO company_software_subscriptions (id, software_name, vendor, cost, billing_cycle, renewal_date, payment_method, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, b.softwareName, b.vendor || null, b.cost, b.billingCycle || "Yearly", b.renewalDate, b.paymentMethod || null, b.notes || null, req.user.id]
  );
  res.status(201).json({ id });
});

// Editing renewalDate (e.g. after actually renewing) resets reminder_notified so the next cycle
// gets its own reminder — no separate "renew" action needed.
router.patch("/software-subscriptions/:id", requireRole(["admin_like", "accounts"]), async (req, res) => {
  const b = req.body;
  const fields = [];
  const params = [];
  if (b.softwareName !== undefined) { fields.push("software_name = ?"); params.push(b.softwareName); }
  if (b.vendor !== undefined) { fields.push("vendor = ?"); params.push(b.vendor || null); }
  if (b.cost !== undefined) { fields.push("cost = ?"); params.push(b.cost); }
  if (b.billingCycle !== undefined) { fields.push("billing_cycle = ?"); params.push(b.billingCycle); }
  if (b.paymentMethod !== undefined) { fields.push("payment_method = ?"); params.push(b.paymentMethod || null); }
  if (b.notes !== undefined) { fields.push("notes = ?"); params.push(b.notes || null); }
  if (b.status !== undefined) { fields.push("status = ?"); params.push(b.status); }
  if (b.emailNotify !== undefined) { fields.push("email_notify = ?"); params.push(b.emailNotify ? 1 : 0); }
  if (b.renewalDate !== undefined) { fields.push("renewal_date = ?"); params.push(b.renewalDate); fields.push("reminder_notified = 0"); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE company_software_subscriptions SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

router.delete("/software-subscriptions/:id", requireRole(["admin_like", "accounts"]), async (req, res) => {
  await query("DELETE FROM company_software_subscriptions WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
