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

/** Sum of a quotation/order's line items after per-item and order-level discount. */
function quoteTotal(items, orderDiscount = 0) {
  const subtotal = (items || []).reduce((a, it) => a + it.qty * it.price * (1 - (it.discountPct || 0) / 100), 0);
  return { subtotal, total: Math.max(0, subtotal - (orderDiscount || 0)) };
}

module.exports = { nextId, today, daysFromNow, normPhone, normEmail, normCompany, money, quoteTotal };
