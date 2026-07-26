const express = require("express");
const { query, pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");

const router = express.Router();
router.use(requireAuth);

// JSON/JS-object columns (roles, items, checklist, ...) come back from mysql2 already
// deserialized — pool.escape() doesn't know to re-serialize a plain object/array back into the
// JSON text MySQL expects, so that case is handled explicitly. Date/DECIMAL columns are already
// strings/numbers per this pool's config (dateStrings, decimalNumbers), so pool.escape() alone
// produces valid SQL for those.
function escapeValue(v) {
  if (v === null || v === undefined) return "NULL";
  if (Buffer.isBuffer(v)) return pool.escape(v);
  if (typeof v === "object") return pool.escape(JSON.stringify(v));
  return pool.escape(v);
}

// Full, restorable SQL dump of every table — the closest thing to `mysqldump` available without
// shelling out to a binary that may not exist on Hostinger's Node.js App product. Admin-tier only;
// streams straight to the response since a full dump can be sizeable.
router.get("/backup", requireRole(["admin_like"]), async (req, res) => {
  const filename = `smartcrm-backup-${new Date().toISOString().slice(0, 10)}.sql`;
  res.setHeader("Content-Type", "application/sql");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  try {
    const [tables] = await pool.query("SHOW TABLES");
    const tableNames = tables.map((row) => Object.values(row)[0]);

    res.write(`-- Address Gateway CRM & Workflow Platform — full backup\n-- Generated ${new Date().toISOString()}\n\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`);

    for (const table of tableNames) {
      const [[createRow]] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
      const createStmt = createRow["Create Table"];
      res.write(`-- ----------------------------\n-- Table: ${table}\n-- ----------------------------\nDROP TABLE IF EXISTS \`${table}\`;\n${createStmt};\n\n`);

      const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
      if (rows.length) {
        const columns = Object.keys(rows[0]);
        const colList = columns.map((c) => `\`${c}\``).join(", ");
        for (const row of rows) {
          const values = columns.map((c) => escapeValue(row[c])).join(", ");
          res.write(`INSERT INTO \`${table}\` (${colList}) VALUES (${values});\n`);
        }
        res.write("\n");
      }
    }

    res.write("SET FOREIGN_KEY_CHECKS = 1;\n");
    res.end();
  } catch (err) {
    console.error("Backup generation failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Backup failed — please try again" });
    else res.end();
  }
});

// Singleton row (id = 1). Password-reset OTP emails always bypass this (see mailer.js's
// `critical` flag) — this toggle only governs everything else (notifications, data manager
// outreach emails, etc.), matching the request to be able to turn off "nice to have" email
// without ever risking locking someone out of a password reset.
router.get("/", async (req, res) => {
  const [settings] = await query("SELECT * FROM app_settings WHERE id = 1");
  res.json(settings);
});

router.patch("/", requireRole(["admin_like"]), async (req, res) => {
  const { emailNotificationsEnabled } = req.body;
  if (emailNotificationsEnabled === undefined) return res.status(400).json({ error: "Nothing to update" });
  await query("UPDATE app_settings SET email_notifications_enabled = ? WHERE id = 1", [emailNotificationsEnabled ? 1 : 0]);
  res.json({ ok: true });
});

module.exports = router;
