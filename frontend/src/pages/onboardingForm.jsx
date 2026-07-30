// Company-formation "Data Collection Form" — shared between the staff-facing tab on the Customer
// KYC card (OnboardingFormTab, below) and the standalone public page a client fills in themselves
// via a generated link (see App.jsx's public-route check + a dedicated public page component,
// which both import OnboardingFormFields from here so the two surfaces never drift apart).
import { useEffect, useState } from "react";
import { Link2, Copy, Check, Save } from "lucide-react";
import { ApiError } from "../api";

const ROW_COUNTS = { companyNames: 4, activities: 5, partners: 5, visas: 10 };
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

const padTo = (arr, n, blank) => {
  const out = (arr || []).slice(0, n).map((x) => ({ ...blank, ...x }));
  while (out.length < n) out.push({ ...blank });
  return out;
};

export function normalizeOnboardingForm(data) {
  return {
    companyNamesEn: padTo((data.companyNamesEn || []).map((v) => ({ v })), ROW_COUNTS.companyNames, { v: "" }).map((r) => r.v),
    companyNamesAr: padTo((data.companyNamesAr || []).map((v) => ({ v })), ROW_COUNTS.companyNames, { v: "" }).map((r) => r.v),
    activities: padTo(data.activities, ROW_COUNTS.activities, { en: "", ar: "", number: "" }),
    capitalAmount: data.capitalAmount ?? "",
    legalStatus: data.legalStatus || "WLL",
    partners: padTo(data.partners, ROW_COUNTS.partners, { name: "", idNumber: "", nationality: "", signatureAuthority: false, sharePercent: "", mobile: "", poBox: "", email: "" }),
    visas: padTo(data.visas, ROW_COUNTS.visas, { nationality: "", qty: "", occupation: "", gender: "" }),
    status: data.status || "Draft",
    submittedAt: data.submittedAt || null,
  };
}

// Strips back down to the shape the API expects (drops fully-blank trailing rows isn't required —
// the backend re-pads on read anyway — so this just passes the arrays through as-is).
function toPayload(form) {
  return {
    companyNamesEn: form.companyNamesEn, companyNamesAr: form.companyNamesAr,
    activities: form.activities, capitalAmount: form.capitalAmount === "" ? null : Number(form.capitalAmount),
    legalStatus: form.legalStatus, partners: form.partners, visas: form.visas,
  };
}

export function OnboardingFormFields({ form, setForm, readOnly }) {
  const setRow = (key, i, patch) => setForm((f) => ({ ...f, [key]: f[key].map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <strong style={{ fontSize: 13 }}>Preferred company names</strong>
        <p className="modal-sub" style={{ marginTop: 4, marginBottom: 8 }}>List in order of preference — English and Arabic.</p>
        {form.companyNamesEn.map((_, i) => (
          <div className="row2" key={i} style={{ marginBottom: 4 }}>
            <div className="field">
              <label>{LETTERS[i]}. English</label>
              <input disabled={readOnly} value={form.companyNamesEn[i]} onChange={(e) => setForm((f) => ({ ...f, companyNamesEn: f.companyNamesEn.map((v, idx) => (idx === i ? e.target.value : v)) }))} />
            </div>
            <div className="field">
              <label>{LETTERS[i]}. Arabic</label>
              <input disabled={readOnly} dir="rtl" value={form.companyNamesAr[i]} onChange={(e) => setForm((f) => ({ ...f, companyNamesAr: f.companyNamesAr.map((v, idx) => (idx === i ? e.target.value : v)) }))} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 18 }}>
        <strong style={{ fontSize: 13 }}>Activities</strong>
        {form.activities.map((a, i) => (
          <div className="row3" key={i} style={{ marginBottom: 4 }}>
            <div className="field"><label>{LETTERS[i]}. Activity (English)</label><input disabled={readOnly} value={a.en} onChange={(e) => setRow("activities", i, { en: e.target.value })} /></div>
            <div className="field"><label>Number</label><input disabled={readOnly} value={a.number} onChange={(e) => setRow("activities", i, { number: e.target.value })} /></div>
            <div className="field"><label>Activity (Arabic)</label><input disabled={readOnly} dir="rtl" value={a.ar} onChange={(e) => setRow("activities", i, { ar: e.target.value })} /></div>
          </div>
        ))}
      </div>

      <div className="row2" style={{ marginBottom: 18 }}>
        <div className="field"><label>Capital amount (QAR)</label><input disabled={readOnly} type="number" value={form.capitalAmount} onChange={(e) => setForm((f) => ({ ...f, capitalAmount: e.target.value }))} /></div>
        <div className="field"><label>Legal status</label><input disabled={readOnly} value={form.legalStatus} onChange={(e) => setForm((f) => ({ ...f, legalStatus: e.target.value }))} placeholder="e.g. WLL" /></div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <strong style={{ fontSize: 13 }}>Partners — shares &amp; contact details</strong>
        {form.partners.map((p, i) => (
          <div className="agw-card" key={i} style={{ marginTop: 8 }}>
            <strong style={{ fontSize: 12, color: "var(--ink-soft)" }}>Partner {i + 1}</strong>
            <div className="row3" style={{ marginTop: 6 }}>
              <div className="field"><label>Name</label><input disabled={readOnly} value={p.name} onChange={(e) => setRow("partners", i, { name: e.target.value })} /></div>
              <div className="field"><label>CR / QID / Passport no.</label><input disabled={readOnly} value={p.idNumber} onChange={(e) => setRow("partners", i, { idNumber: e.target.value })} /></div>
              <div className="field"><label>Nationality</label><input disabled={readOnly} value={p.nationality} onChange={(e) => setRow("partners", i, { nationality: e.target.value })} /></div>
            </div>
            <div className="row3">
              <div className="field"><label>% of share</label><input disabled={readOnly} type="number" min="0" max="100" value={p.sharePercent} onChange={(e) => setRow("partners", i, { sharePercent: e.target.value })} /></div>
              <div className="field" style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input disabled={readOnly} type="checkbox" checked={!!p.signatureAuthority} onChange={(e) => setRow("partners", i, { signatureAuthority: e.target.checked })} />
                  Signature authority
                </label>
              </div>
            </div>
            <div className="row3">
              <div className="field"><label>Mobile</label><input disabled={readOnly} value={p.mobile} onChange={(e) => setRow("partners", i, { mobile: e.target.value })} /></div>
              <div className="field"><label>P O Box</label><input disabled={readOnly} value={p.poBox} onChange={(e) => setRow("partners", i, { poBox: e.target.value })} /></div>
              <div className="field"><label>Email</label><input disabled={readOnly} value={p.email} onChange={(e) => setRow("partners", i, { email: e.target.value })} /></div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <strong style={{ fontSize: 13 }}>Visa details</strong>
        <div style={{ overflowX: "auto" }}>
          <table className="agw-table" style={{ minWidth: 600 }}>
            <thead><tr><th></th><th>Nationality</th><th>Qty</th><th>Occupation</th><th>Gender</th></tr></thead>
            <tbody>
              {form.visas.map((v, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: 11 }}>{LETTERS[i] || i + 1}</td>
                  <td><input disabled={readOnly} value={v.nationality} onChange={(e) => setRow("visas", i, { nationality: e.target.value })} /></td>
                  <td><input disabled={readOnly} type="number" min="0" style={{ width: 60 }} value={v.qty} onChange={(e) => setRow("visas", i, { qty: e.target.value })} /></td>
                  <td><input disabled={readOnly} value={v.occupation} onChange={(e) => setRow("visas", i, { occupation: e.target.value })} /></td>
                  <td>
                    <select disabled={readOnly} value={v.gender} onChange={(e) => setRow("visas", i, { gender: e.target.value })}>
                      <option value="">—</option><option>Male</option><option>Female</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Staff-facing tab, embedded inside CustomerDetailModal. Fetches on first mount (this data isn't
// part of the app's up-front global state — a per-customer form fetched only when opened).
export function OnboardingFormTab({ api, customerId }) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [linkInfo, setLinkInfo] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.customers.getOnboarding(customerId)
      .then((data) => { if (!cancelled) setForm(normalizeOnboardingForm(data)); })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load the onboarding form."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId]);

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await api.customers.saveOnboarding(customerId, toPayload(form));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const generateLink = async () => {
    setGeneratingLink(true); setError("");
    try {
      setLinkInfo(await api.customers.generateOnboardingLink(customerId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't generate the link — please try again.");
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyLink = () => {
    if (!linkInfo) return;
    navigator.clipboard.writeText(linkInfo.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="side-note">Loading onboarding form…</div>;
  if (!form) return null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <p className="modal-sub" style={{ margin: 0 }}>
          Company-formation data collection — fill it in here, or share a link so the client fills it in themselves.
          {form.status === "Submitted" && <span style={{ color: "var(--success)", fontWeight: 500 }}> · Client submitted this form.</span>}
        </p>
        <button className="btn btn-sm" disabled={generatingLink} onClick={generateLink}><Link2 size={13} /> {linkInfo ? "Regenerate link" : "Generate public link"}</button>
      </div>

      {linkInfo && (
        <div className="side-note" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span className="mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{linkInfo.url}</span>
          <button className="btn btn-sm" onClick={copyLink}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
        </div>
      )}

      <OnboardingFormFields form={form} setForm={setForm} />

      {error && <div className="side-note" style={{ borderColor: "#EFC3BC", background: "var(--danger-tint)", marginTop: 12 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}><Save size={14} /> {saved ? "Saved" : "Save"}</button>
      </div>
    </div>
  );
}

// The app's only unauthenticated page — reached at /onboarding/:token (see App.jsx's root-level
// path check, which renders this standalone, bypassing the login gate and the whole CRM shell
// entirely). Talks to the backend with plain fetch, deliberately not api.js, since that module is
// built around a Bearer-token auth flow this page has no part of.
export function PublicOnboardingPage({ token }) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/onboarding/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setCustomerName(data.customerName);
        setForm(normalizeOnboardingForm(data));
        setSubmitted(data.status === "Submitted");
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`/api/public/onboarding/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toPayload(form)),
      });
      if (!res.ok) throw new Error("submit failed");
      setSubmitted(true);
    } catch {
      setError("Couldn't submit the form — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const pageStyle = { minHeight: "100vh", background: "var(--page, #F5F6F8)", padding: "32px 16px", display: "flex", justifyContent: "center" };
  const cardStyle = { width: "100%", maxWidth: 760, background: "var(--surface, #fff)", borderRadius: 14, padding: "28px 28px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };

  if (loading) return <div style={pageStyle}><div style={cardStyle}>Loading form…</div></div>;
  if (notFound) return <div style={pageStyle}><div style={cardStyle}>This form link is invalid or has expired. Please contact Address Gateway for a new one.</div></div>;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: "0 0 4px" }}>Company Formation — Data Collection Form</h2>
        <p className="modal-sub" style={{ marginTop: 0, marginBottom: 20 }}>{customerName}</p>

        {submitted ? (
          <div className="side-note" style={{ borderColor: "var(--success)", marginBottom: 20 }}>
            Thank you — your information has been submitted. You can still make changes and resubmit below if needed.
          </div>
        ) : null}

        <OnboardingFormFields form={form} setForm={setForm} />

        {error && <div className="side-note" style={{ borderColor: "#EFC3BC", background: "var(--danger-tint)", marginTop: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn btn-primary" disabled={submitting} onClick={submit}>{submitted ? "Resubmit" : "Submit"}</button>
        </div>
      </div>
    </div>
  );
}
