// Lead follow-up reminder sweep — same one-time "reminder_sent" pattern as leadSlaJobs.js and
// todoReminderJob.js, but this one also emails the lead's owner (see companyFinanceJobs.js for
// the same email-on-top-of-notification precedent), since a missed follow-up on a live lead is a
// real business cost, not just an in-app nudge.
const { query } = require("../config/db");
const { nextId } = require("../utils/helpers");
const { sendMail } = require("../utils/mailer");

async function checkFollowUpReminders() {
  const due = await query(`
    SELECT id, name, company, phone, email, owner FROM leads
    WHERE follow_up_reminder_sent = 0 AND next_follow_up IS NOT NULL AND next_follow_up <= CURDATE()
      AND status NOT IN ('Converted', 'Unqualified')
  `);
  if (!due.length) return 0;
  for (const lead of due) {
    await query("UPDATE leads SET follow_up_reminder_sent = 1 WHERE id = ?", [lead.id]);
    if (!lead.owner) continue; // unassigned lead — nobody to remind yet

    const [lastFollowUp] = await query("SELECT note FROM lead_followups WHERE lead_id = ? ORDER BY at DESC LIMIT 1", [lead.id]);
    const [owner] = await query("SELECT email FROM users WHERE id = ?", [lead.owner]);

    const title = "Follow-up due";
    const body = `${lead.company} (${lead.name}) — Mobile: ${lead.phone || "—"} — Email: ${lead.email || "—"}. Last follow-up: ${lastFollowUp?.note?.trim() || "No follow-up notes yet."}`;
    await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'lead_followup', ?, ?, ?)",
      [nextId("NT"), title, body, JSON.stringify([lead.owner])]);

    if (owner?.email) {
      await sendMail({ to: owner.email, subject: `Follow-up due — ${lead.company}`, text: body });
    }
  }
  return due.length;
}

module.exports = { checkFollowUpReminders };
