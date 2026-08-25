// Shared helpers used across route modules.
const crypto = require("crypto");
const { withTransaction } = require("../config/db");

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

// The three KYC documents every customer needs before they can become Active (see PATCH
// /customers/:id) — CR (Commercial Registration), CL (Commercial License), EC (Establishment
// Card). Every customer gets an empty placeholder row for each the moment it's created, whichever
// path created it, so there's always something on file to fill in rather than a document that has
// to be remembered and added by hand later.
const COMPULSORY_KYC_DOC_TYPES = ["CR", "CP", "EC"];
async function seedDefaultKycDocs(query, customerId) {
  for (const type of COMPULSORY_KYC_DOC_TYPES) {
    await query("INSERT INTO customer_docs (id, customer_id, type, number, expiry, cloud_link) VALUES (?,?,?,NULL,NULL,NULL)", [nextId("DOC"), customerId, type]);
  }
}

/**
 * Resolves the Customer a freehand "customer name" typed on a Lead/Deal/Quotation/Job Card
 * belongs to — reusing another Customer already on file (matched by name, or by phone/email
 * under a different name, via findDuplicateCustomer) rather than creating a duplicate profile;
 * only creates a new Customer when nothing matches. Returns { customerId, duplicateOf } —
 * duplicateOf is set (existing customer name) only when the match came from phone/email, not
 * name, so the caller can surface "this looks like an existing customer" instead of silently
 * merging into it.
 */
async function findOrCreateCustomer(query, { name, phone, email, contact, ownerId }) {
  const dup = await findDuplicateCustomer(query, { name, phone, email });
  if (dup) return { customerId: dup.match.id, duplicateOf: dup.field === "name" ? null : dup.match.name };

  // Branded sequential ID (AGBSCU10100, ...), same format as every other entity — its own short
  // transaction since callers pass the plain `query` function, not a shared connection.
  const customerId = await withTransaction((conn) => nextSequentialId(conn, "AGBSCU", "customer"));
  // created_by is the persisted ownership signal GET /customers scopes by — every call site passes
  // whoever the new lead/deal/quotation/job-card actually belongs to (not necessarily the
  // requesting user, e.g. an admin creating a lead on a rep's behalf), so the customer this record
  // spawns lands in the right person's list from the moment it exists.
  await query("INSERT INTO customers (id, name, type, contact, phone, email, created_by) VALUES (?,?,?,?,?,?,?)",
    [customerId, name, "Company", contact || null, phone || null, email || null, ownerId || null]);
  await seedDefaultKycDocs(query, customerId);
  return { customerId, duplicateOf: null };
}

/**
 * Sum of a quotation/order's line items after per-item and order-level discount.
 * orderDiscountType controls how `orderDiscount` is applied: 'amount' (default, a flat QAR value
 * subtracted once) or 'percent' (a percentage of the post-item-discount subtotal). itemDiscountTotal
 * is the total already folded into each line's amount via its own discountPct — broken out here so
 * callers can show it as its own line instead of it silently vanishing into the subtotal.
 */
function quoteTotal(items, orderDiscount = 0, orderDiscountType = "amount") {
  const list = items || [];
  const grossSubtotal = list.reduce((a, it) => a + it.qty * it.price, 0);
  const subtotal = list.reduce((a, it) => a + it.qty * it.price * (1 - (it.discountPct || 0) / 100), 0);
  const itemDiscountTotal = grossSubtotal - subtotal;
  const pct = Math.min(100, Math.max(0, orderDiscount || 0));
  const discountAmount = orderDiscountType === "percent" ? subtotal * (pct / 100) : (orderDiscount || 0);
  return { grossSubtotal, subtotal, itemDiscountTotal, discountAmount, total: Math.max(0, subtotal - discountAmount) };
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
function professionalFeeTotal(items, orderDiscount, quotationFeeType, orderDiscountType = "amount") {
  const list = items || [];
  const lineAmount = (it) => it.qty * it.price * (1 - (it.discountPct || 0) / 100);
  const isGovernmentFee = (it) => (it.feeType || quotationFeeType || "Professional Fee") === "Government Fee";
  const subtotal = list.reduce((a, it) => a + lineAmount(it), 0);
  if (subtotal <= 0) return 0;
  const profSubtotal = list.filter((it) => !isGovernmentFee(it)).reduce((a, it) => a + lineAmount(it), 0);
  const profShare = profSubtotal / subtotal;
  const pct = Math.min(100, Math.max(0, orderDiscount || 0));
  const discountAmount = orderDiscountType === "percent" ? subtotal * (pct / 100) : (orderDiscount || 0);
  return Math.max(0, profSubtotal - discountAmount * profShare);
}

module.exports = { nextId, nextSequentialId, today, daysFromNow, normPhone, normEmail, normCompany, money, quoteTotal, professionalFeeTotal, findDuplicateCustomer, findOrCreateCustomer, COMPULSORY_KYC_DOC_TYPES, seedDefaultKycDocs };
