// Unauthenticated counterpart of the Onboarding Form routes in customers.routes.js — the only
// public-facing (no login) surface in the app. Reached via a random per-customer token, never by
// customer/user id, so guessing a neighboring record isn't feasible. Only ever exposes the
// customer's name plus this one form's own fields — no other KYC/financial data is reachable
// through this path. Input here is untrusted (comes straight from a client's browser with no
// auth), so every field is capped/typed before it's persisted.
const express = require("express");
const { query } = require("../config/db");

const router = express.Router();

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : null;
};

function sanitizeCompanyNames(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 4).map((s) => str(s, 200));
}
function sanitizeActivities(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 5).map((a) => ({
    en: str(a?.en, 200), ar: str(a?.ar, 200), number: str(a?.number, 50),
  }));
}
function sanitizePartners(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 5).map((p) => ({
    name: str(p?.name, 150), idNumber: str(p?.idNumber, 50), nationality: str(p?.nationality, 80),
    signatureAuthority: !!p?.signatureAuthority, sharePercent: num(p?.sharePercent, 100),
    mobile: str(p?.mobile, 50), poBox: str(p?.poBox, 50), email: str(p?.email, 190),
  }));
}
function sanitizeVisas(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 10).map((v) => ({
    nationality: str(v?.nationality, 80), qty: num(v?.qty, 999), occupation: str(v?.occupation, 100),
    gender: str(v?.gender, 20),
  }));
}

router.get("/:token", async (req, res) => {
  const [row] = await query(
    `SELECT f.*, c.name AS customer_name FROM onboarding_forms f JOIN customers c ON c.id = f.customer_id WHERE f.token = ?`,
    [req.params.token]
  );
  if (!row) return res.status(404).json({ error: "This form link is invalid." });
  res.json({
    customerName: row.customer_name,
    companyNamesEn: row.company_names_en || [], companyNamesAr: row.company_names_ar || [],
    activities: row.activities || [], capitalAmount: row.capital_amount,
    legalStatus: row.legal_status || "WLL", partners: row.partners || [], visas: row.visas || [],
    status: row.status, submittedAt: row.submitted_at,
  });
});

router.post("/:token", async (req, res) => {
  const [row] = await query("SELECT id FROM onboarding_forms WHERE token = ?", [req.params.token]);
  if (!row) return res.status(404).json({ error: "This form link is invalid." });
  const b = req.body || {};
  await query(
    `UPDATE onboarding_forms SET company_names_en=?, company_names_ar=?, activities=?, capital_amount=?, legal_status=?, partners=?, visas=?, status='Submitted', submitted_at=NOW() WHERE token = ?`,
    [
      JSON.stringify(sanitizeCompanyNames(b.companyNamesEn)),
      JSON.stringify(sanitizeCompanyNames(b.companyNamesAr)),
      JSON.stringify(sanitizeActivities(b.activities)),
      num(b.capitalAmount, 999999999),
      str(b.legalStatus, 50) || "WLL",
      JSON.stringify(sanitizePartners(b.partners)),
      JSON.stringify(sanitizeVisas(b.visas)),
      req.params.token,
    ]
  );
  res.json({ ok: true });
});

module.exports = router;
