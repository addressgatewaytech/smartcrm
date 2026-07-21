const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, isAdminLike } = require("../middleware/roles");
const { nextId, today, normPhone, normEmail, normCompany } = require("../utils/helpers");
const { sendMail } = require("../utils/mailer");
const { runAutoAssign, runEndOfDayReturn, runRecycling } = require("../services/dataManagerJobs");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.use(requireAuth);
const canManage = (roles) => isAdminLike(roles) || roles.includes("data_manager");

// --- Duplicate check (mandatory across the whole database, every entry path) ---------------
async function findDuplicate({ mobile, email, companyName }) {
  const m = normPhone(mobile), e = normEmail(email), c = normCompany(companyName);
  const clauses = [];
  const params = [];
  if (m) { clauses.push("mobile_normalized = ?"); params.push(m); }
  if (e) { clauses.push("email_normalized = ?"); params.push(e); }
  if (c) { clauses.push("LOWER(TRIM(company_name)) = ?"); params.push(c); }
  if (!clauses.length) return null;
  const [row] = await query(`SELECT * FROM data_records WHERE ${clauses.join(" OR ")} LIMIT 1`, params);
  return row || null;
}

// Called from leads.routes.js whenever a new CRM Lead is created (the one required
// Data-Manager <-> Lead integration point from the spec).
async function checkExistingData(lead) {
  const match = await findDuplicate({ mobile: lead.phone, email: lead.email, companyName: lead.company });
  if (!match) return;
  const audience = ["super_admin", "admin", "admin_exec", "data_manager"];
  if (match.data_owner) audience.push(match.data_owner);
  await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'approval', ?, ?, ?)", [
    nextId("NT"),
    "Existing Data Found",
    `New lead ${lead.id} (${lead.company}) matches Data Manager record ${match.id} — ${match.company_name}, status: ${match.status}.`,
    JSON.stringify(audience),
  ]);
}

// --- CRUD ------------------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const admin = canManage(req.user.roles);
  const rows = admin
    ? await query("SELECT * FROM data_records ORDER BY created_date DESC")
    : await query("SELECT * FROM data_records WHERE (data_category='Own' AND data_owner=?) OR (data_category='Company' AND assigned_user=?) ORDER BY created_date DESC", [req.user.id, req.user.id]);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const b = req.body;
  const dup = await findDuplicate(b);
  if (dup) return res.status(409).json({ error: "Duplicate Data Already Exists", matchId: dup.id });

  const id = nextId("DR");
  await query(
    `INSERT INTO data_records (id, company_name, contact_name, mobile, mobile_normalized, email, email_normalized, reference, source, business_category, location, data_category, data_owner, assigned_user, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, b.companyName, b.contactName || null, b.mobile || null, normPhone(b.mobile), b.email || null, normEmail(b.email), b.reference || null, b.source || null,
      b.businessCategory || null, b.location || null, b.dataCategory, b.dataCategory === "Own" ? req.user.id : null, null, req.user.id]
  );
  res.status(201).json({ id });
});

// Bulk Excel/CSV import — dedupes against the DB AND within the uploaded batch itself.
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const dataCategory = req.body.dataCategory || "Own";

  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const pick = (row, keys) => { for (const k of keys) if (String(row[k] ?? "").trim()) return String(row[k]).trim(); return ""; };

  const mapped = json.map((row) => ({
    companyName: pick(row, ["Company Name", "company", "Company"]),
    contactName: pick(row, ["Contact Person Name", "Contact Name", "contact", "Name"]),
    mobile: pick(row, ["Mobile Number", "Mobile", "Phone", "mobile"]),
    email: pick(row, ["Email Address", "Email", "email"]),
    reference: pick(row, ["Reference", "reference"]),
    source: pick(row, ["Source", "source"]) || "Excel Import",
    businessCategory: pick(row, ["Business Category", "Category", "businessCategory"]),
    location: pick(row, ["Location", "location"]),
  })).filter((r) => r.companyName || r.mobile || r.email);

  const seenBatch = [];
  let dupCount = 0;
  let importedCount = 0;
  for (const r of mapped) {
    const dupExisting = await findDuplicate(r);
    const dupBatch = seenBatch.find((s) => (normPhone(s.mobile) && normPhone(s.mobile) === normPhone(r.mobile)) || (normEmail(s.email) && normEmail(s.email) === normEmail(r.email)) || (normCompany(s.companyName) && normCompany(s.companyName) === normCompany(r.companyName)));
    if (dupExisting || dupBatch) { dupCount++; continue; }
    seenBatch.push(r);
    await query(
      `INSERT INTO data_records (id, company_name, contact_name, mobile, mobile_normalized, email, email_normalized, reference, source, business_category, location, data_category, data_owner, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [nextId("DR"), r.companyName, r.contactName, r.mobile, normPhone(r.mobile), r.email, normEmail(r.email), r.reference, r.source, r.businessCategory, r.location, dataCategory, dataCategory === "Own" ? req.user.id : null, req.user.id]
    );
    importedCount++;
  }
  res.json({ total: mapped.length, imported: importedCount, duplicates: dupCount });
});

router.post("/:id/assign", requireRole(["admin_like", "data_manager"]), async (req, res) => {
  await query("UPDATE data_records SET assigned_user = ? WHERE id = ?", [req.body.userId || null, req.params.id]);
  res.json({ ok: true });
});

// --- Daily auto-assignment (should be wired to node-cron in production; also callable on demand) ---
router.post("/auto-assign", requireRole(["admin_like", "data_manager"]), async (req, res) => {
  const assigned = await runAutoAssign();
  res.json({ assigned });
});

router.post("/end-of-day-return", requireRole(["admin_like", "data_manager"]), async (req, res) => {
  const returned = await runEndOfDayReturn();
  res.json({ returned });
});

router.post("/recycle", requireRole(["admin_like", "data_manager"]), async (req, res) => {
  const recycled = await runRecycling();
  res.json({ recycled });
});

// --- Send email / WhatsApp — enforces daily cap + cooldown server-side ---------------------
async function getActivity(userId) {
  const [row] = await query("SELECT * FROM data_user_activity WHERE user_id = ? AND activity_date = ?", [userId, today()]);
  return row || { emails_sent: 0, whatsapps_sent: 0, last_email_at: null, last_whatsapp_at: null };
}

router.post("/:id/send-email", async (req, res) => {
  const [settings] = await query("SELECT * FROM data_settings WHERE id = 1");
  const activity = await getActivity(req.user.id);
  if (activity.emails_sent >= settings.daily_email_target) return res.status(400).json({ error: "Daily email limit reached" });
  if (activity.last_email_at) {
    const minsSince = (Date.now() - new Date(activity.last_email_at).getTime()) / 60000;
    if (minsSince < settings.email_interval_minutes) return res.status(400).json({ error: `Wait ${Math.ceil(settings.email_interval_minutes - minsSince)} more minute(s)` });
  }

  const [record] = await query("SELECT * FROM data_records WHERE id = ?", [req.params.id]);
  const subject = req.body.subject || settings.email_subject;
  const body = req.body.body || settings.email_body;
  await sendMail({ to: record.email, subject, text: body });

  await query("UPDATE data_records SET email_sent_at = NOW(), last_contact_date = CURDATE(), status = IF(status='New','Contacted',status) WHERE id = ?", [req.params.id]);
  await query(
    `INSERT INTO data_user_activity (user_id, activity_date, emails_sent, last_email_at) VALUES (?,?,1,NOW())
     ON DUPLICATE KEY UPDATE emails_sent = emails_sent + 1, last_email_at = NOW()`,
    [req.user.id, today()]
  );
  res.json({ ok: true });
});

router.post("/:id/send-whatsapp", async (req, res) => {
  const [settings] = await query("SELECT * FROM data_settings WHERE id = 1");
  const activity = await getActivity(req.user.id);
  if (activity.whatsapps_sent >= settings.daily_whatsapp_target) return res.status(400).json({ error: "Daily WhatsApp limit reached" });
  if (activity.last_whatsapp_at) {
    const minsSince = (Date.now() - new Date(activity.last_whatsapp_at).getTime()) / 60000;
    if (minsSince < settings.whatsapp_interval_minutes) return res.status(400).json({ error: `Wait ${Math.ceil(settings.whatsapp_interval_minutes - minsSince)} more minute(s)` });
  }

  await query("UPDATE data_records SET whatsapp_sent_at = NOW(), last_contact_date = CURDATE(), status = IF(status='New','Contacted',status) WHERE id = ?", [req.params.id]);
  await query(
    `INSERT INTO data_user_activity (user_id, activity_date, whatsapps_sent, last_whatsapp_at) VALUES (?,?,1,NOW())
     ON DUPLICATE KEY UPDATE whatsapps_sent = whatsapps_sent + 1, last_whatsapp_at = NOW()`,
    [req.user.id, today()]
  );
  res.json({ ok: true }); // actual WhatsApp send happens client-side via wa.me deep link, or wire the WhatsApp Business API here
});

router.post("/:id/archive", async (req, res) => {
  await query("UPDATE data_records SET status='Archived', archived_reason=?, assigned_user=NULL WHERE id=?", [req.body.reason, req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/convert-to-lead", async (req, res) => {
  const [record] = await query("SELECT * FROM data_records WHERE id = ?", [req.params.id]);
  if (!record) return res.status(404).json({ error: "Not found" });
  const leadId = nextId("LD");
  await query(
    `INSERT INTO leads (id, name, company, phone, email, reference, source, owner, status) VALUES (?,?,?,?,?,?,?,?, 'New')`,
    [leadId, record.contact_name, record.company_name, record.mobile, record.email, record.reference, record.source || "Data Manager", req.user.id]
  );
  await query("UPDATE data_records SET status='Converted to Lead', lead_id=? WHERE id=?", [leadId, req.params.id]);
  res.status(201).json({ leadId });
});

// --- Settings / templates --------------------------------------------------------------------
router.get("/settings", async (req, res) => {
  const [settings] = await query("SELECT * FROM data_settings WHERE id = 1");
  res.json(settings);
});
router.patch("/settings", requireRole(["admin_like", "data_manager"]), async (req, res) => {
  const b = req.body;
  const fields = [];
  const params = [];
  for (const [col, key] of [
    ["daily_email_target", "dailyEmailTarget"], ["daily_whatsapp_target", "dailyWhatsappTarget"],
    ["email_interval_minutes", "emailIntervalMinutes"], ["whatsapp_interval_minutes", "whatsappIntervalMinutes"],
    ["recycling_enabled", "recyclingEnabled"], ["recycling_days", "recyclingDays"],
    ["email_subject", "emailSubject"], ["email_body", "emailBody"], ["whatsapp_body", "whatsappBody"],
  ]) {
    if (b[key] !== undefined) { fields.push(`${col} = ?`); params.push(b[key]); }
  }
  if (fields.length) await query(`UPDATE data_settings SET ${fields.join(", ")} WHERE id = 1`, params);
  res.json({ ok: true });
});

// --- Export (logs every export, per spec) ----------------------------------------------------
router.get("/export", async (req, res) => {
  const scope = req.query.scope || "All Data";
  let where = "1=1";
  if (scope === "Own Data") where = "data_category='Own'";
  if (scope === "Company Data") where = "data_category='Company'";
  if (scope === "Interested Data") where = "status='Interested'";
  if (scope === "Converted Data") where = "status='Converted to Lead'";
  if (scope === "Clean Data Only") where = "status != 'Archived'";

  const rows = await query(`SELECT * FROM data_records WHERE ${where}`);
  await query("INSERT INTO data_export_history (id, exported_by, record_count, purpose, format) VALUES (?,?,?,?,?)",
    [nextId("EXP"), req.user.id, rows.length, scope, req.query.format || "CSV"]);
  res.json(rows); // frontend renders this to CSV/XLSX client-side, or swap in a server-side XLSX.write here
});

router.get("/export-history", requireRole(["admin_like", "data_manager"]), async (req, res) => {
  res.json(await query("SELECT * FROM data_export_history ORDER BY export_date DESC"));
});

module.exports = router;
module.exports.internal = { checkExistingData };
