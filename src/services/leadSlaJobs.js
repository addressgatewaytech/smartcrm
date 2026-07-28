// Lead Assignment Manager SLA sweep — shared between the scheduled cron job (server.js) and
// direct/manual invocation (testing, or an on-demand admin trigger), same pattern as
// dataManagerJobs.js. Finds leads whose 5-minute (or next-working-day) response deadline has
// passed with no follow-up logged yet, flags them as violated (once — this is a permanent
// performance record, not recomputed if a follow-up lands late afterward), and notifies both the
// lead's owner and Lead Assignment Manager/admin-tier.
const { query } = require("../config/db");
const { nextId } = require("../utils/helpers");

async function checkOverdueLeads() {
  const overdue = await query(`
    SELECT l.id, l.company, l.owner FROM leads l
    WHERE l.sla_violated = 0 AND l.sla_due_at IS NOT NULL AND l.sla_due_at < NOW()
      AND NOT EXISTS (SELECT 1 FROM lead_followups f WHERE f.lead_id = l.id AND f.at >= l.assigned_at)
  `);
  for (const lead of overdue) {
    await query("UPDATE leads SET sla_violated = 1 WHERE id = ?", [lead.id]);
    const audience = [...(lead.owner ? [lead.owner] : []), "lead_manager", "super_admin", "admin", "admin_exec"];
    await query("INSERT INTO notifications (id, type, title, body, audience) VALUES (?, 'lead_sla', ?, ?, ?)",
      [nextId("NT"), "Lead follow-up overdue", `${lead.id} — ${lead.company} — first follow-up SLA was missed.`, JSON.stringify(audience)]);
  }
  return overdue.length;
}

module.exports = { checkOverdueLeads };
