// Sends a Data Manager bulk email campaign one message at a time, waiting a random interval
// between each so the mail server (and the recipients' spam filters) never see a burst.
//
// Deliberately NOT a polling job like the other services here: the MySQL plan caps connections per
// hour (see the note in server.js), so this keeps one in-process timer per running campaign and
// touches the database only when it actually sends — zero queries while nothing is running. Each
// campaign row's next_send_at is the durable copy, so a restart/deploy resumes exactly where it was
// (see resumeRunningCampaigns). Only one campaign runs at a time (enforced by the start route),
// which keeps the per-day limit meaningful for the single shared mailbox.
const { query } = require("../config/db");
// Held as the module object (not destructured) so a test can swap sendMail without real SMTP.
const mailer = require("../utils/mailer");

const timers = new Map();          // campaignId -> pending Timeout
const failureStreak = new Map();   // campaignId -> consecutive server-side send failures
const MAX_CONSECUTIVE_FAILURES = 3;
const DAILY_LIMIT_RECHECK_MS = 30 * 60 * 1000;
const FALLBACK_NAME = "Sir/Madam";
const SUPPORTED_PLACEHOLDERS = ["name", "email"];

// Same "only the production server runs background sends" rule as every job in server.js — a dev
// instance pointed at the production DB must never email real people.
const sendingEnabled = () => process.env.NODE_ENV === "production";

const randomSeconds = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// {{name}} / {{ Name }} / {{email}} — tolerant of spaces and case, since people type these by hand.
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;
function fillTemplate(str, vars) {
  return String(str || "").replace(PLACEHOLDER, (whole, key) => {
    const v = vars[key.toLowerCase()];
    return v === undefined ? whole : v;
  });
}
// Anything in {{ }} that isn't supported would go out to a real recipient as literal "{{company}}".
function findUnknownPlaceholders(...texts) {
  const bad = new Set();
  for (const t of texts) for (const m of String(t || "").matchAll(PLACEHOLDER)) if (!SUPPORTED_PLACEHOLDERS.includes(m[1].toLowerCase())) bad.add(m[0]);
  return [...bad];
}

function arm(campaignId, delayMs = 0) {
  if (!sendingEnabled()) {
    console.log(`[campaigns] NODE_ENV is not "production" — campaign ${campaignId} will not send from this instance.`);
    return;
  }
  disarm(campaignId);
  timers.set(campaignId, setTimeout(() => {
    timers.delete(campaignId);
    processCampaign(campaignId).catch((err) => console.error(`[campaigns] ${campaignId} tick failed:`, err));
  }, delayMs));
}

function disarm(campaignId) {
  clearTimeout(timers.get(campaignId));
  timers.delete(campaignId);
}

async function pause(id, reason) {
  await query("UPDATE email_campaigns SET status = 'Paused', last_error = ?, next_send_at = NULL WHERE id = ? AND status = 'Running'", [reason ? String(reason).slice(0, 500) : null, id]);
  failureStreak.delete(id);
  disarm(id);
}

async function complete(id) {
  await query("UPDATE email_campaigns SET status = 'Completed', completed_at = NOW(), next_send_at = NULL WHERE id = ? AND status = 'Running'", [id]);
  failureStreak.delete(id);
  disarm(id);
}

// 550-553 = the server refused this specific address (bad mailbox, blocked domain, ...): that's a
// problem with the row, not with the mail server, so it must not count toward pausing the campaign.
const isRecipientSpecificFailure = (result) =>
  (Array.isArray(result?.rejected) && result.rejected.length > 0) || [550, 551, 552, 553].includes(result?.responseCode);

async function processCampaign(id) {
  const [c] = await query("SELECT * FROM email_campaigns WHERE id = ?", [id]);
  if (!c || c.status !== "Running") return;

  if (!mailer.isSmtpConfigured()) {
    await pause(id, "Email sending isn't set up on the server (SMTP settings are missing).");
    return;
  }

  const [{ sent_today }] = await query(
    "SELECT COUNT(*) AS sent_today FROM email_campaign_recipients WHERE campaign_id = ? AND status = 'Sent' AND DATE(sent_at) = CURDATE()", [id]
  );
  if (Number(sent_today) >= c.daily_limit) { arm(id, DAILY_LIMIT_RECHECK_MS); return; }

  const [next] = await query("SELECT id, email, name FROM email_campaign_recipients WHERE campaign_id = ? AND status = 'Pending' ORDER BY seq LIMIT 1", [id]);
  if (!next) { await complete(id); return; }
  // Atomic claim — if some other process/instance grabbed this row first, just look again shortly.
  const claim = await query("UPDATE email_campaign_recipients SET status = 'Sending' WHERE id = ? AND status = 'Pending'", [next.id]);
  if (!claim.affectedRows) { arm(id, 2000); return; }

  const vars = { name: (next.name || "").trim() || FALLBACK_NAME, email: next.email };
  const result = await mailer.sendMail({ to: next.email, subject: fillTemplate(c.subject, vars), text: fillTemplate(c.body, vars), critical: true });
  // Only a real transport response counts as sent — sendMail also returns { simulated } (no SMTP),
  // { skipped } and { failed }, none of which may ever be recorded as delivered.
  const sent = !!result && !result.failed && !result.simulated && !result.skipped && !isRecipientSpecificFailure(result);

  if (sent) {
    await query("UPDATE email_campaign_recipients SET status = 'Sent', sent_at = NOW(), error = NULL WHERE id = ?", [next.id]);
    failureStreak.delete(id);
  } else {
    const reason = String(result?.error || (isRecipientSpecificFailure(result) ? "Address refused by the mail server" : "Email was not sent")).slice(0, 255);
    await query("UPDATE email_campaign_recipients SET status = 'Failed', error = ? WHERE id = ?", [reason, next.id]);
    if (!isRecipientSpecificFailure(result)) {
      const streak = (failureStreak.get(id) || 0) + 1;
      failureStreak.set(id, streak);
      if (streak >= MAX_CONSECUTIVE_FAILURES) {
        await pause(id, `Paused after ${streak} emails in a row couldn't be sent. Last error: ${reason}`);
        return;
      }
    }
  }

  const [{ pending }] = await query("SELECT COUNT(*) AS pending FROM email_campaign_recipients WHERE campaign_id = ? AND status = 'Pending'", [id]);
  if (!Number(pending)) { await complete(id); return; }

  // Re-read: it may have been paused/deleted/edited while that email was in flight.
  const [cur] = await query("SELECT status, min_interval_seconds AS mn, max_interval_seconds AS mx FROM email_campaigns WHERE id = ?", [id]);
  if (!cur || cur.status !== "Running") return;
  const delay = randomSeconds(cur.mn, cur.mx);
  await query("UPDATE email_campaigns SET next_send_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ? AND status = 'Running'", [delay, id]);
  arm(id, delay * 1000);
}

// Called once at server start (production only). Anything left mid-send by a crash goes back to
// Pending, and each still-Running campaign is re-armed for whatever time was left on its interval.
async function resumeRunningCampaigns() {
  await query("UPDATE email_campaign_recipients SET status = 'Pending' WHERE status = 'Sending'");
  const running = await query("SELECT id, GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), next_send_at)) AS wait_seconds FROM email_campaigns WHERE status = 'Running'");
  for (const c of running) arm(c.id, Number(c.wait_seconds || 0) * 1000);
  return running.length;
}

module.exports = { arm, disarm, processCampaign, resumeRunningCampaigns, fillTemplate, findUnknownPlaceholders, SUPPORTED_PLACEHOLDERS, FALLBACK_NAME };
