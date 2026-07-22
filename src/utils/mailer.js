const nodemailer = require("nodemailer");

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
}

/**
 * Sends an email if SMTP is configured; otherwise logs it (so the app still "works" pre-setup).
 * Never throws — a mail-server hiccup (e.g. a blocked outbound port on shared hosting) shouldn't
 * crash the request that triggered it (forgot-password, notification emails, etc).
 */
async function sendMail({ to, subject, text, cc }) {
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
