// Company Finance reminder sweeps — same pattern as leadSlaJobs.js/todoReminderJob.js (find "due"
// rows, notify once via reminder_notified, exported for both the cron schedule in server.js and
// direct/manual invocation). Unlike those two, these also email the audience — a missed cheque
// deposit or software renewal has real money attached, so an in-app notification alone isn't
// enough of a safety net.
const { query } = require("../config/db");
const { nextId } = require("../utils/helpers");
const { sendMail } = require("../utils/mailer");

const AUDIENCE_ROLES = ["super_admin", "admin", "admin_exec", "accounts"];

async function audienceEmails() {
  const users = await query("SELECT email, roles FROM users WHERE active = 1 AND email IS NOT NULL AND email != ''");
  return users
    .filter((u) => { const roles = typeof u.roles === "string" ? JSON.parse(u.roles) : u.roles; return roles.some((r) => AUDIENCE_ROLES.includes(r)); })
    .map((u) => u.email);
}

async function checkChequeDeposits() {
  const due = await query(`
    SELECT id, direction, cheque_number, amount, party_name, deposit_date FROM cheques
    WHERE status = 'Pending' AND reminder_notified = 0 AND deposit_date <= CURDATE() + INTERVAL 2 DAY
  `);
  if (!due.length) return 0;
  const emails = await audienceEmails();
  for (const c of due) {
    await query("UPDATE cheques SET reminder_notified = 1 WHERE id = ?", [c.id]);
    const title = `${c.direction} cheque due for deposit`;
    const body = `${c.cheque_number} — ${c.party_name} — QAR ${c.amount} — deposit by ${c.deposit_date}`;
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
  for (const s of due) {
    await query("UPDATE company_software_subscriptions SET reminder_notified = 1 WHERE id = ?", [s.id]);
    const title = "Software subscription renewal due";
    const body = `${s.software_name} — QAR ${s.cost} — renews ${s.renewal_date}`;
    await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'software_renewal', ?, ?, ?)",
      [nextId("NT"), title, body, JSON.stringify(AUDIENCE_ROLES)]);
    // The in-app bell above always fires — email_notify only opts a specific entry out of the
    // email, for subscriptions that don't need Admin/Accounts pinged by inbox every renewal.
    if (emails.length && s.email_notify) await sendMail({ to: emails.join(","), subject: title, text: body });
  }
  return due.length;
}

module.exports = { checkChequeDeposits, checkSoftwareRenewals };
