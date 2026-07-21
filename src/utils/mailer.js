const nodemailer = require("nodemailer");

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD } : undefined,
  });
}

/** Sends an email if SMTP is configured; otherwise logs it (so the app still "works" pre-setup). */
async function sendMail({ to, subject, text, cc }) {
  if (!transporter) {
    console.log(`[mailer] SMTP not configured — would have sent to ${to} (cc: ${(cc || []).join(", ")}), subject: "${subject}"`);
    return { simulated: true };
  }
  return transporter.sendMail({ from: process.env.SMTP_FROM, to, cc: (cc || []).join(","), subject, text });
}

module.exports = { sendMail };
