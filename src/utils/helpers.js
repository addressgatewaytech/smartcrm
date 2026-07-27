// Shared helpers used across route modules.
const crypto = require("crypto");

/**
 * Generates prototype-style IDs, e.g. nextId("LD") -> "LD-KX3F9A1B2C".
 * Built from a base36 timestamp + random bytes rather than an in-process counter —
 * a counter resets to its start value on every restart (which happens on every Hostinger
 * redeploy), causing primary-key collisions with rows already in the database.
 */
function nextId(prefix) {
  const time = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${time}${rand}`;
}

/**
 * Branded sequential IDs for Leads/Deals/Quotations (AGBSLS10100, AGBSDS10100, AGBSQS10100, ...).
 * Must run inside a transaction — the row lock (FOR UPDATE) on id_counters is what makes the
 * increment atomic under concurrent requests; a plain SELECT+UPDATE without the transaction/lock
 * would let two simultaneous creates read the same next_value and collide.
 */
async function nextSequentialId(conn, prefix, entity) {
  const [[row]] = await conn.execute("SELECT next_value FROM id_counters WHERE entity = ? FOR UPDATE", [entity]);
  const value = row.next_value;
  await conn.execute("UPDATE id_counters SET next_value = next_value + 1 WHERE entity = ?", [entity]);
  return `${prefix}${value}`;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const normPhone = (p) => (p || "").replace(/[^\d]/g, "");
const normEmail = (e) => (e || "").trim().toLowerCase();
const normCompany = (c) => (c || "").trim().toLowerCase();

const money = (n) => `QAR ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Single source of truth for "is this the same customer" — used by both POST/PATCH /customers
 * (block outright) and lead creation (auto-link instead of creating a second profile). A previous
 * per-route implementation only checked name (exact case-insensitive) and phone (exact string, so
 * "+974 5049 4933" didn't match "50494933"); this normalizes phone/email/name the same way
 * Data Manager's own dedup already does, so a typo'd space or missing country code doesn't let a
 * duplicate slip through.
 * `query` is the db query function; `excludeId` skips a row when checking an existing customer's
 * own edit. Returns the matching row ({id, name, ...}) plus which field matched, or null.
 */
async function findDuplicateCustomer(query, { name, phone, email }, excludeId = null) {
  const rows = await query(
    `SELECT id, name, phone, email FROM customers${excludeId ? " WHERE id != ?" : ""}`,
    excludeId ? [excludeId] : []
  );
  const nName = normCompany(name);
  const nPhone = normPhone(phone);
  const nEmail = normEmail(email);
  for (const c of rows) {
    if (nName && normCompany(c.name) === nName) return { match: c, field: "name" };
    if (nPhone && normPhone(c.phone) === nPhone) return { match: c, field: "phone" };
    if (nEmail && normEmail(c.email) === nEmail) return { match: c, field: "email" };
  }
  return null;
}

/** Sum of a quotation/order's line items after per-item and order-level discount. */
function quoteTotal(items, orderDiscount = 0) {
  const subtotal = (items || []).reduce((a, it) => a + it.qty * it.price * (1 - (it.discountPct || 0) / 100), 0);
  return { subtotal, total: Math.max(0, subtotal - (orderDiscount || 0)) };
}

/**
 * Only Professional Fee line items count toward business volume, pipeline value, and incentive
 * calculations — Government Fee items are pass-through with no markup. A line item's effective
 * fee type is its own `feeType` if tagged, falling back to the quotation's whole-document
 * `feeType` for quotations created before per-line tagging existed (so a historical standalone
 * Government Fee quotation, whose items were never individually tagged, still resolves to fully
 * excluded — same as before). The order-level discount is allocated proportionally across the
 * two fee-type subtotals, so it degrades to the exact old value for a quotation that's 100% one
 * type either way.
 */
function professionalFeeTotal(items, orderDiscount, quotationFeeType) {
  const list = items || [];
  const lineAmount = (it) => it.qty * it.price * (1 - (it.discountPct || 0) / 100);
  const isGovernmentFee = (it) => (it.feeType || quotationFeeType || "Professional Fee") === "Government Fee";
  const subtotal = list.reduce((a, it) => a + lineAmount(it), 0);
  if (subtotal <= 0) return 0;
  const profSubtotal = list.filter((it) => !isGovernmentFee(it)).reduce((a, it) => a + lineAmount(it), 0);
  const profShare = profSubtotal / subtotal;
  return Math.max(0, profSubtotal - (orderDiscount || 0) * profShare);
}

module.exports = { nextId, nextSequentialId, today, daysFromNow, normPhone, normEmail, normCompany, money, quoteTotal, professionalFeeTotal, findDuplicateCustomer };
