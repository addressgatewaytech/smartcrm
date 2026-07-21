const mysql = require("mysql2/promise");
require("dotenv").config();

// Connection pool — reused across all requests. Hostinger MySQL works fine with
// a small pool since shared hosting caps concurrent connections per database.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // return DATE/DATETIME as strings (YYYY-MM-DD[ HH:MM:SS]) — matches the JSON shape the frontend expects
  decimalNumbers: true, // return DECIMAL/NEWDECIMAL columns as JS numbers, not strings — without this, e.g. `"5000" >= "15000.00"`
                         // is a lexicographic string comparison (true!), not a numeric one, silently corrupting invoice payment-status logic.
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// For transactions (e.g. quotation -> sales order -> invoice chains)
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, withTransaction };
