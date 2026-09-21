// Sender mailboxes for Data Manager bulk email. Each is a real mailbox (its own login) that a campaign
// can send from instead of the server's default SMTP account. The mailbox password has to be kept so
// the worker can log in unattended, so it's stored AES-256-GCM encrypted — never returned by the API
// and never logged.
const crypto = require("crypto");
const { query } = require("../config/db");
// Held as the module object so a test can stub isSmtpConfigured without real SMTP.
const mailer = require("./mailer");

const SMTP_MISSING = "Email sending isn't set up on the server (SMTP settings are missing) — ask your administrator to configure it.";

// Prefer a dedicated key; falling back to JWT_SECRET means this works with no new production setting
// (the trade-off: rotating JWT_SECRET would make saved mailbox passwords unreadable — they'd need to
// be re-entered, which the UI handles as "password rejected").
const key = () => {
  const secret = process.env.SENDER_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("No SENDER_ENCRYPTION_KEY or JWT_SECRET is configured — can't store mailbox passwords securely.");
  return crypto.createHash("sha256").update(`agw-bulk-sender-v1:${secret}`).digest();
};

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

// Returns null (not a throw) for anything unreadable, so one bad row can't take down the worker.
function decryptSecret(stored) {
  try {
    const [v, iv, tag, enc] = String(stored || "").split(":");
    if (v !== "v1") return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// "Address Gateway <customerservice@addressgateway.com>" -> { name, email }; a bare address works too.
function parseFromHeader(str) {
  const s = String(str || "").trim();
  if (!s) return null;
  const m = s.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: "", email: s };
}

// What the mail server (SMTP_HOST etc.) does when a sender doesn't override it.
const smtpDefaults = () => ({ host: process.env.SMTP_HOST || "", port: Number(process.env.SMTP_PORT) || 587 });

// Builds the { host, port, user, pass, from } mailer.sendMail({ sender }) takes. Returns null when
// there's no mail server to talk to or no password.
function buildTransport({ name, email, host, port, pass }) {
  const d = smtpDefaults();
  const useHost = host || d.host;
  if (!useHost || pass === null || pass === undefined) return null;
  const display = String(name || "").replace(/["<>\r\n]/g, "").trim();
  return { host: useHost, port: port || d.port, user: email, pass, from: display ? `"${display}" <${email}>` : email };
}

// From a bulk_email_senders row. Null if the stored password can't be decrypted or there's no server.
const toTransportSender = (row) => buildTransport({ name: row.name, email: row.email, host: row.smtp_host, port: row.smtp_port, pass: decryptSecret(row.password_enc) });

// Which account a campaign sends from: { sender } (sender === null means the server's default account)
// or { error } with a message fit to show the user. Shared by Start, the worker and the test email so
// they can never disagree — in particular a campaign whose mailbox was deleted is refused rather than
// quietly falling back to the default account.
async function resolveCampaignSender(c) {
  if (c.sender_id) {
    const [row] = await query("SELECT * FROM bulk_email_senders WHERE id = ?", [c.sender_id]);
    if (!row) return { error: "The mailbox this campaign sends from no longer exists — edit the campaign and choose another sender." };
    const sender = toTransportSender(row);
    if (!sender) return { error: `The saved password for ${row.email} can't be used — open Sender mailboxes and re-enter it.` };
    return { sender };
  }
  if (c.sender_email) return { error: `The mailbox this campaign was set to send from (${c.sender_email}) has been removed — edit the campaign and choose another sender.` };
  if (!mailer.isSmtpConfigured()) return { error: SMTP_MISSING };
  return { sender: null };
}

module.exports = { SMTP_MISSING, encryptSecret, decryptSecret, parseFromHeader, smtpDefaults, buildTransport, toTransportSender, resolveCampaignSender };
