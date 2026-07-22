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
 * toggle (currently just the password-reset OTP) — everything else respects it.
 */
async function sendMail({ to, subject, text, cc, critical = false }) {
  if (!critical && !(await emailNotificationsEnabled())) {
    console.log(`[mailer] Email notifications disabled — skipped send to ${to}, subject: "${subject}"`);
    return { skipped: true };
  }
  if (!transporter) {
    console.log(`[mailer] SMTP not configured — would have sent to ${to} (cc: ${(cc || []).join(", ")}), subject: "${subject}"`);
    return { simulated: true };
  }
  try {
    return await transporter.sendMail({ from: process.env.SMTP_FROM, to, cc: (cc || []).join(","), subject, text });
  } catch (err) {
    console.error(`[mailer] Failed to send email to ${to}:`, err.message);
    return { failed: true, error: err.message };
  }
}

module.exports = { sendMail };
