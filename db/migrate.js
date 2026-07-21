// Runs schema.sql against the configured database. Safe to re-run (uses CREATE TABLE IF NOT EXISTS).
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  console.log("Connected. Running schema.sql ...");
  await conn.query(schema);
  console.log("Schema applied successfully.");
  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
