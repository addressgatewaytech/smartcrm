// Core Data Manager job logic, shared between the on-demand API routes (dataManager.routes.js)
// and the scheduled cron jobs (server.js). Keeping this here means cron doesn't need to make an
// authenticated HTTP call to its own server just to trigger the same logic.
const { query } = require("../config/db");

async function runAutoAssign() {
  const [{ daily_email_target }] = await query("SELECT daily_email_target FROM data_settings WHERE id = 1");
  const salesUsers = await query(`SELECT id FROM users WHERE active = 1 AND (JSON_CONTAINS(roles,'"sales_exec"') OR JSON_CONTAINS(roles,'"sales_manager"'))`);
  let assignedTotal = 0;
  for (const u of salesUsers) {
    const [{ available }] = await query(
      `SELECT COUNT(*) AS available FROM data_records WHERE status NOT IN ('Archived','Converted to Lead')
       AND ((data_category='Own' AND data_owner=?) OR (data_category='Company' AND assigned_user=?))`,
      [u.id, u.id]
    );
    const needed = Math.max(0, daily_email_target - available);
    if (needed > 0) {
      const result = await query(
        `UPDATE data_records SET assigned_user = ? WHERE data_category='Company' AND assigned_user IS NULL
         AND status NOT IN ('Archived','Converted to Lead') LIMIT ?`,
        [u.id, needed]
      );
      assignedTotal += result.affectedRows || 0;
    }
  }
  await query("INSERT INTO activity_log (text) VALUES (?)", [`Daily auto-assignment run — ${assignedTotal} record(s) distributed`]);
  return assignedTotal;
}

async function runEndOfDayReturn() {
  const result = await query(
    `UPDATE data_records SET assigned_user = NULL WHERE data_category='Company' AND assigned_user IS NOT NULL
     AND status='New' AND email_sent_at IS NULL AND whatsapp_sent_at IS NULL`
  );
  return result.affectedRows || 0;
}

async function runRecycling() {
  const [settings] = await query("SELECT * FROM data_settings WHERE id = 1");
  if (!settings.recycling_enabled) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - settings.recycling_days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const ownResult = await query(
    `UPDATE data_records SET status='New' WHERE data_category='Own' AND status NOT IN ('Archived','Converted to Lead') AND created_date <= ?`, [cutoffStr]
  );
  const companyResult = await query(
    `UPDATE data_records SET status='New', assigned_user=NULL WHERE data_category='Company' AND status NOT IN ('Archived','Converted to Lead') AND created_date <= ?`, [cutoffStr]
  );
  return (ownResult.affectedRows || 0) + (companyResult.affectedRows || 0);
}

module.exports = { runAutoAssign, runEndOfDayReturn, runRecycling };
