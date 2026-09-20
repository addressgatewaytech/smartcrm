// Data Manager > Bulk Email. Upload a name + email list, write a Subject/Body, and the server sends
// one personalised email at a time with a random wait between each (see
// services/emailCampaignWorker.js for the sending itself). Mounted at
// /api/data-manager/email-campaigns — before the main Data Manager router in server.js.
const express = require("express");
const multer = require("multer");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole, requireModuleView } = require("../middleware/roles");
const { nextId } = require("../utils/helpers");
const mailer = require("../utils/mailer");
const { parseRecipients } = require("../utils/campaignRecipients");
const worker = require("../services/emailCampaignWorker");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.use(requireAuth);
router.use(requireModuleView("dataManager"));
// Bulk outreach is a manager job — not something every Data Manager module user (e.g. a sales rep
// working their own data) can launch.
router.use(requireRole(["admin_like", "data_manager"]));

const MAX_RECIPIENTS = 5000;
// Floor/ceiling on the random wait — under 10s a burst starts to look like spam to the mail
// server, and over an hour is almost certainly a typo.
const MIN_ALLOWED_SECONDS = 10;
const MAX_ALLOWED_SECONDS = 3600;
const SMTP_MISSING = "Email sending isn't set up on the server (SMTP settings are missing) — ask your administrator to configure it.";

const shape = (c) => ({
  id: c.id, name: c.name, subject: c.subject, body: c.body,
  minIntervalSeconds: c.min_interval_seconds, maxIntervalSeconds: c.max_interval_seconds, dailyLimit: c.daily_limit,
  status: c.status, lastError: c.last_error, createdAt: c.created_at, startedAt: c.started_at, completedAt: c.completed_at,
  total: Number(c.total || 0), sent: Number(c.sent || 0), failed: Number(c.failed || 0), pending: Number(c.pending || 0),
  sentToday: Number(c.sent_today || 0),
  nextInSeconds: c.next_in_seconds === null || c.next_in_seconds === undefined ? null : Number(c.next_in_seconds),
});

const CAMPAIGN_SELECT = `
  SELECT c.*, COUNT(r.id) AS total,
    COALESCE(SUM(r.status = 'Sent'), 0) AS sent,
    COALESCE(SUM(r.status = 'Failed'), 0) AS failed,
    COALESCE(SUM(r.status IN ('Pending','Sending')), 0) AS pending,
    COALESCE(SUM(r.status = 'Sent' AND DATE(r.sent_at) = CURDATE()), 0) AS sent_today,
    CASE WHEN c.status = 'Running' AND c.next_send_at IS NOT NULL THEN GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), c.next_send_at)) END AS next_in_seconds
  FROM email_campaigns c LEFT JOIN email_campaign_recipients r ON r.campaign_id = c.id`;

const loadCampaign = async (id) => {
  const [c] = await query(`${CAMPAIGN_SELECT} WHERE c.id = ? GROUP BY c.id`, [id]);
  return c ? shape(c) : null;
};

// Returns { error } or { min, max, daily } from a request body, falling back to `defaults` for
// anything not supplied (PATCH sends only what changed).
function readPacing(b, defaults = { min: 60, max: 180, daily: 100 }) {
  const num = (v, d) => (v === undefined || v === null || v === "" ? d : Number(v));
  const min = num(b.minSeconds, defaults.min), max = num(b.maxSeconds, defaults.max), daily = num(b.dailyLimit, defaults.daily);
  if (![min, max, daily].every(Number.isInteger)) return { error: "Wait times and the daily limit must be whole numbers" };
  if (min < MIN_ALLOWED_SECONDS || max > MAX_ALLOWED_SECONDS) return { error: `The wait between emails must be between ${MIN_ALLOWED_SECONDS} and ${MAX_ALLOWED_SECONDS} seconds` };
  if (max < min) return { error: "The longest wait can't be shorter than the shortest wait" };
  if (daily < 1 || daily > 2000) return { error: "The daily limit must be between 1 and 2000 emails" };
  return { min, max, daily };
}

function checkContent(subject, body) {
  if (!subject || !body) return "Subject and email body are both required";
  const unknown = worker.findUnknownPlaceholders(subject, body);
  if (unknown.length) return `${unknown.join(", ")} isn't a supported placeholder — only {{name}} and {{email}} can be used`;
  return null;
}

// --- Saved bulk email template (Data Manager > Templates) -----------------------------------
router.get("/template", async (req, res) => {
  const [row] = await query("SELECT subject, body FROM bulk_email_template WHERE id = 1");
  res.json({ subject: row?.subject || "", body: row?.body || "" });
});

router.put("/template", async (req, res) => {
  const subject = String(req.body.subject || "").trim();
  const body = String(req.body.body || "").trim();
  const problem = checkContent(subject, body);
  if (problem) return res.status(400).json({ error: problem });
  await query(
    `INSERT INTO bulk_email_template (id, subject, body, updated_by) VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE subject = VALUES(subject), body = VALUES(body), updated_by = VALUES(updated_by)`,
    [subject, body, req.user.id]
  );
  res.json({ ok: true });
});

// One real email to the person clicking, so they can see exactly how it will land before
// starting a campaign to hundreds of people.
router.post("/test-email", async (req, res) => {
  const subject = String(req.body.subject || "").trim();
  const body = String(req.body.body || "").trim();
  const problem = checkContent(subject, body);
  if (problem) return res.status(400).json({ error: problem });
  if (!mailer.isSmtpConfigured()) return res.status(400).json({ error: SMTP_MISSING });
  const [me] = await query("SELECT name, email FROM users WHERE id = ?", [req.user.id]);
  if (!me?.email) return res.status(400).json({ error: "Your account has no email address to send the test to" });
  const vars = { name: (me.name || "").split(" ")[0] || worker.FALLBACK_NAME, email: me.email };
  const result = await mailer.sendMail({ to: me.email, subject: `[TEST] ${worker.fillTemplate(subject, vars)}`, text: worker.fillTemplate(body, vars), critical: true });
  if (!result || result.failed || result.simulated || result.skipped) {
    return res.status(502).json({ error: `The test email couldn't be sent${result?.error ? `: ${result.error}` : ""}` });
  }
  res.json({ ok: true, to: me.email });
});

// --- Campaigns ------------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const rows = await query(`${CAMPAIGN_SELECT} GROUP BY c.id ORDER BY c.created_at DESC`);
  res.json(rows.map(shape));
});

// Creates a Draft — nothing is sent until someone presses Start, so the list can be reviewed first.
router.post("/", upload.single("file"), async (req, res) => {
  const b = req.body;
  const name = String(b.name || "").trim();
  const subject = String(b.subject || "").trim();
  const body = String(b.body || "").trim();
  if (!name) return res.status(400).json({ error: "Give the campaign a name" });
  const problem = checkContent(subject, body);
  if (problem) return res.status(400).json({ error: problem });
  const pacing = readPacing(b);
  if (pacing.error) return res.status(400).json({ error: pacing.error });
  if (!req.file) return res.status(400).json({ error: "Upload a CSV or Excel file that has an email column" });

  let parsed;
  try { parsed = parseRecipients(req.file.buffer); } catch { return res.status(400).json({ error: "That file couldn't be read — use a .csv or .xlsx file" }); }
  if (!parsed.recipients.length) {
    return res.status(400).json({ error: `No valid email addresses found in that file (${parsed.total} row${parsed.total === 1 ? "" : "s"} read, ${parsed.invalid} without a usable address)` });
  }
  if (parsed.recipients.length > MAX_RECIPIENTS) return res.status(400).json({ error: `That list has ${parsed.recipients.length} addresses — the limit per campaign is ${MAX_RECIPIENTS}. Split it into smaller files.` });

  const id = nextId("EC");
  await query(
    "INSERT INTO email_campaigns (id, name, subject, body, min_interval_seconds, max_interval_seconds, daily_limit, created_by) VALUES (?,?,?,?,?,?,?,?)",
    [id, name, subject, body, pacing.min, pacing.max, pacing.daily, req.user.id]
  );
  try {
    for (let i = 0; i < parsed.recipients.length; i += 200) {
      const chunk = parsed.recipients.slice(i, i + 200);
      await query(
        `INSERT INTO email_campaign_recipients (campaign_id, seq, email, name) VALUES ${chunk.map(() => "(?,?,?,?)").join(",")}`,
        chunk.flatMap((r, j) => [id, i + j + 1, r.email, r.name || null])
      );
    }
  } catch (err) {
    await query("DELETE FROM email_campaigns WHERE id = ?", [id]); // no half-loaded campaign left behind
    throw err;
  }
  res.status(201).json({ id, total: parsed.total, imported: parsed.recipients.length, invalid: parsed.invalid, duplicates: parsed.duplicates });
});

router.get("/:id", async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json(c);
});

router.get("/:id/recipients", async (req, res) => {
  const rows = await query(
    "SELECT id, seq, email, name, status, sent_at, error FROM email_campaign_recipients WHERE campaign_id = ? ORDER BY seq LIMIT ?",
    [req.params.id, MAX_RECIPIENTS]
  );
  res.json(rows.map((r) => ({ id: r.id, seq: r.seq, email: r.email, name: r.name, status: r.status, sentAt: r.sent_at, error: r.error })));
});

// Only a campaign that isn't actively sending can be edited — changing the wording (or the pace)
// under an email already in flight would make "what did recipients actually get" ambiguous.
router.patch("/:id", async (req, res) => {
  const [c] = await query("SELECT * FROM email_campaigns WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Not found" });
  if (!["Draft", "Paused"].includes(c.status)) return res.status(400).json({ error: c.status === "Running" ? "Pause the campaign before editing it" : "A finished campaign can't be edited" });
  const b = req.body;
  const name = b.name !== undefined ? String(b.name).trim() : c.name;
  const subject = b.subject !== undefined ? String(b.subject).trim() : c.subject;
  const body = b.body !== undefined ? String(b.body).trim() : c.body;
  if (!name) return res.status(400).json({ error: "Give the campaign a name" });
  const problem = checkContent(subject, body);
  if (problem) return res.status(400).json({ error: problem });
  const pacing = readPacing(b, { min: c.min_interval_seconds, max: c.max_interval_seconds, daily: c.daily_limit });
  if (pacing.error) return res.status(400).json({ error: pacing.error });
  await query(
    "UPDATE email_campaigns SET name = ?, subject = ?, body = ?, min_interval_seconds = ?, max_interval_seconds = ?, daily_limit = ? WHERE id = ?",
    [name, subject, body, pacing.min, pacing.max, pacing.daily, req.params.id]
  );
  res.json({ ok: true });
});

router.post("/:id/start", async (req, res) => {
  const [c] = await query("SELECT id, status FROM email_campaigns WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Not found" });
  if (c.status === "Running") return res.status(400).json({ error: "This campaign is already running" });
  if (c.status === "Completed") return res.status(400).json({ error: "This campaign has already finished — use Retry failed to resend any that didn't go out" });
  if (!mailer.isSmtpConfigured()) return res.status(400).json({ error: SMTP_MISSING });
  // One at a time — every campaign shares the one mailbox, so two running together would double the
  // real pace and blow past the daily limit each of them thinks it's respecting.
  const [other] = await query("SELECT name FROM email_campaigns WHERE status = 'Running' AND id != ? LIMIT 1", [req.params.id]);
  if (other) return res.status(409).json({ error: `"${other.name}" is already sending — pause it first, then start this one` });
  const [{ pending }] = await query("SELECT COUNT(*) AS pending FROM email_campaign_recipients WHERE campaign_id = ? AND status = 'Pending'", [req.params.id]);
  if (!Number(pending)) return res.status(400).json({ error: "There are no unsent recipients left in this campaign" });
  await query("UPDATE email_campaigns SET status = 'Running', started_at = COALESCE(started_at, NOW()), next_send_at = NOW(), last_error = NULL WHERE id = ?", [req.params.id]);
  worker.arm(req.params.id, 0);
  res.json({ ok: true });
});

router.post("/:id/pause", async (req, res) => {
  const result = await query("UPDATE email_campaigns SET status = 'Paused', next_send_at = NULL WHERE id = ? AND status = 'Running'", [req.params.id]);
  if (!result.affectedRows) return res.status(400).json({ error: "This campaign isn't running" });
  worker.disarm(req.params.id);
  res.json({ ok: true });
});

// Puts failed recipients back in the queue. On a finished campaign this reopens it as Paused so the
// manager chooses when the retries go out.
router.post("/:id/retry-failed", async (req, res) => {
  const [c] = await query("SELECT status FROM email_campaigns WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Not found" });
  const result = await query("UPDATE email_campaign_recipients SET status = 'Pending', error = NULL WHERE campaign_id = ? AND status = 'Failed'", [req.params.id]);
  if (!result.affectedRows) return res.status(400).json({ error: "No failed emails to retry" });
  if (c.status === "Completed") await query("UPDATE email_campaigns SET status = 'Paused', completed_at = NULL WHERE id = ?", [req.params.id]);
  res.json({ retried: result.affectedRows });
});

router.delete("/:id", async (req, res) => {
  worker.disarm(req.params.id);
  await query("DELETE FROM email_campaigns WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
