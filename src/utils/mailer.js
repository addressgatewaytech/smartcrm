const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { query } = require("../config/db");

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
}

async function emailNotificationsEnabled() {
  try {
    const [row] = await query("SELECT email_notifications_enabled FROM app_settings WHERE id = 1");
    return !row || !!row.email_notifications_enabled;
  } catch {
    return true; // fail open — a settings-table hiccup shouldn't silently block mail
  }
}

/**
 * Sends an email if SMTP is configured; otherwise logs it (so the app still "works" pre-setup).
 * Never throws — a mail-server hiccup (e.g. a blocked outbound port on shared hosting) shouldn't
 * crash the request that triggered it (forgot-password, notification emails, etc).
 *
 * Pass `critical: true` for mail that must always go out regardless of the admin's Settings
 * toggle — the password-reset OTP, and Data Manager bulk email campaigns (a manager explicitly
 * started one; that's outreach, not a system notification the toggle is meant to mute).
 * Everything else respects it.
 *
 * Returns the transport's info object on a real send; `{ failed, error }`, `{ simulated }` (no
 * SMTP configured) or `{ skipped }` (muted by the toggle) otherwise. Callers that must know whether
 * mail truly left (bulk campaigns) should check isSmtpConfigured() first and treat anything but a
 * real info object as "not sent".
 */
async function sendMail({ to, subject, text, cc, critical = false, sender = null }) {
  if (!critical && !(await emailNotificationsEnabled())) {
    console.log(`[mailer] Email notifications disabled — skipped send to ${to}, subject: "${subject}"`);
    return { skipped: true };
  }
  // `sender` (a bulk-email sender mailbox: { host, port, user, pass, from }) sends through that
  // mailbox's own login instead of the server's default SMTP account.
  const useTransporter = sender ? senderTransport(sender) : transporter;
  if (!useTransporter) {
    console.log(`[mailer] SMTP not configured — would have sent to ${to} (cc: ${(cc || []).join(", ")}), subject: "${subject}"`);
    return { simulated: true };
  }
  try {
    return await useTransporter.sendMail({ from: sender ? sender.from : process.env.SMTP_FROM, to, cc: (cc || []).join(","), subject, text });
  } catch (err) {
    console.error(`[mailer] Failed to send email to ${to}:`, err.message);
    // code/responseCode let a caller tell "this one address was refused" (5xx 550-553) from "the mail
    // server itself is unreachable / rejecting our login" — bulk campaigns pause on the latter only.
    return { failed: true, error: err.message, code: err.code, responseCode: err.responseCode };
  }
}

const isSmtpConfigured = () => !!transporter;

// One transport per distinct mailbox login (kept so a campaign reuses the same connection settings
// for every email). Keyed on the password too, so editing a mailbox's password takes effect at once.
const senderTransports = new Map();
function senderTransport(s) {
  const k = [s.host, s.port, s.user, crypto.createHash("sha256").update(s.pass).digest("hex")].join("|");
  if (!senderTransports.has(k)) {
    senderTransports.set(k, nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: Number(s.port) === 465,
      auth: { user: s.user, pass: s.pass },
      // A mailbox that can't be reached should fail in seconds, not hang a save or a send for minutes.
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    }));
  }
  return senderTransports.get(k);
}

/** Checks a mailbox's login without sending anything. Resolves { ok: true } or { ok: false, error, code }. */
async function verifySender(s) {
  try {
    await senderTransport(s).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code, responseCode: err.responseCode };
  }
}

module.exports = { sendMail, isSmtpConfigured, verifySender };
