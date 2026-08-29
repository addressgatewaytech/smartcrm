// Company Finance reminder sweeps — same pattern as leadSlaJobs.js/todoReminderJob.js (find "due"
// rows, notify once via reminder_notified, exported for both the cron schedule in server.js and
// direct/manual invocation). Unlike those two, these also email the audience — a missed cheque
// deposit or software renewal has real money attached, so an in-app notification alone isn't
// enough of a safety net.
const { query } = require("../config/db");
const { nextId, renderTemplate } = require("../utils/helpers");
const { sendMail } = require("../utils/mailer");

const AUDIENCE_ROLES = ["super_admin", "admin", "admin_exec", "accounts"];

async function audienceEmails() {
  const users = await query("SELECT email, roles FROM users WHERE active = 1 AND email IS NOT NULL AND email != ''");
  return users
    .filter((u) => { const roles = typeof u.roles === "string" ? JSON.parse(u.roles) : u.roles; return roles.some((r) => AUDIENCE_ROLES.includes(r)); })
    .map((u) => u.email);
}

// Editable subject/body — see email_templates in schema.sql and Settings > Email Templates.
async function template(key) {
  const [row] = await query("SELECT subject, body FROM email_templates WHERE template_key = ?", [key]);
  return row || { subject: "", body: "" };
}

async function checkChequeDeposits() {
  const due = await query(`
    SELECT id, direction, cheque_number, amount, party_name, deposit_date FROM cheques
    WHERE status = 'Pending' AND reminder_notified = 0 AND deposit_date <= CURDATE() + INTERVAL 2 DAY
  `);
  if (!due.length) return 0;
  const emails = await audienceEmails();
  const tpl = await template("cheque_deposit");
  for (const c of due) {
    await query("UPDATE cheques SET reminder_notified = 1 WHERE id = ?", [c.id]);
    const vars = { direction: c.direction, chequeNumber: c.cheque_number, partyName: c.party_name, amount: c.amount, depositDate: c.deposit_date };
    const title = renderTemplate(tpl.subject, vars);
    const body = renderTemplate(tpl.body, vars);
    await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'cheque_deposit', ?, ?, ?)",
      [nextId("NT"), title, body, JSON.stringify(AUDIENCE_ROLES)]);
    if (emails.length) await sendMail({ to: emails.join(","), subject: title, text: body });
  }
  return due.length;
}

async function checkSoftwareRenewals() {
  const due = await query(`
    SELECT id, software_name, cost, renewal_date, email_notify FROM company_software_subscriptions
    WHERE status = 'Active' AND reminder_notified = 0 AND renewal_date <= CURDATE() + INTERVAL 7 DAY
  `);
  if (!due.length) return 0;
  const emails = await audienceEmails();
  const tpl = await template("software_renewal");
  for (const s of due) {
    await query("UPDATE company_software_subscriptions SET reminder_notified = 1 WHERE id = ?", [s.id]);
    const vars = { softwareName: s.software_name, cost: s.cost, renewalDate: s.renewal_date };
    const title = renderTemplate(tpl.subject, vars);
    const body = renderTemplate(tpl.body, vars);
    await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'software_renewal', ?, ?, ?)",
      [nextId("NT"), title, body, JSON.stringify(AUDIENCE_ROLES)]);
    // The in-app bell above always fires — email_notify only opts a specific entry out of the
    // email, for subscriptions that don't need Admin/Accounts pinged by inbox every renewal.
    if (emails.length && s.email_notify) await sendMail({ to: emails.join(","), subject: title, text: body });
  }
  return due.length;
}

module.exports = { checkChequeDeposits, checkSoftwareRenewals };
