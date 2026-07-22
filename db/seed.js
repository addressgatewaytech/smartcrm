// Seeds an initial admin user, the services list, and default subscription plans/data settings
// so the platform is usable immediately after deploy. Safe-ish to re-run (uses INSERT IGNORE /
// ON DUPLICATE KEY) but intended as a one-time setup step.
require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const SERVICES = [
  "100% Foreign Ownership Company Formation",
  "Company Formation with Qatari Partner",
  "Growth Partner Program",
  "Bank Account Opening",
  "PRO Services",
  "Office Space Assistance",
];

const DEFAULT_EMAIL_BODY = `Greetings from Address Gateway.

We provide Company Formation, PRO Services, Accounting, Digital Marketing, and Business Support Services in Qatar.

We would be pleased to discuss how we can support your business.

Thank you.`;

const DEFAULT_WHATSAPP_BODY = `Hello,

Greetings from Address Gateway.
We provide Company Formation, PRO Services, Accounting, Digital Marketing, and Business Support Services in Qatar.
Please let us know if we can assist your business.

Thank you.`;

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log("Seeding services...");
  for (const s of SERVICES) {
    await conn.execute("INSERT IGNORE INTO services (name) VALUES (?)", [s]);
    await conn.execute("INSERT IGNORE INTO checklist_templates (service, steps) VALUES (?, ?)", [s, JSON.stringify([])]);
  }

  console.log("Seeding first Admin user (change this password immediately after first login)...");
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  await conn.execute(
    `INSERT IGNORE INTO users (id, name, email, password_hash, roles, dept, initials, designation, leave_balance, active, joined_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
    ["u1", "Admin User", "admin@addressgateway.com", passwordHash, JSON.stringify(["super_admin"]), "Management", "AD", "Super Admin", 21, 1]
  );

  console.log("Seeding Growth Partner Program & Office Space Assistance plans...");
  await conn.execute(
    `INSERT IGNORE INTO subscription_plans (name, description, terms) VALUES (?, ?, ?)`,
    [
      "Growth Partner Program",
      "Government-relations (PRO) support packages across four tiers — Basic, Standard, Silver and Gold — bundling transactions, Hukoomi services, training and translation.",
      JSON.stringify([
        "Scope of Service: covers online government transactions only, processed through the relevant ministry portals (MOI, MOL, MOCI, and other applicable Hukoomi platforms).",
        "Physical/In-Person Attendance: any service requiring an approval, in-person visit, or physical attendance at a ministry or government office is treated as an additional service and charged separately.",
        "Package Validity: the selected package is valid for twelve (12) months from the date of subscription/activation, unless otherwise agreed in writing.",
        "Transaction & Employee Limits: each package includes a defined number of transactions and covered employees; usage beyond the included limit is charged separately at the applicable standard rate.",
        "Non-Transferability & Non-Rollover: unused transactions, training sessions, or legal advising sessions do not roll over and are not transferable to another company or package.",
      ]),
    ]
  );
  const tiers = [
    ["Basic", 1000, "Up to 10 employees per company", 30, "MOI and MOL", 4, 250, 1, 0, 0, 1],
    ["Standard", 2500, "Up to 30 employees per company", 100, "MOI, MOL, Civil Defense", 12, 250, 1, 1, 0, 3],
    ["Silver", 5000, "Up to 100 employees per company", 250, "MOI, MOL, Civil Defense, 4 ministry visits*", 12, 250, 3, 1, 0, 5],
    ["Gold", 8000, "Up to 200 employees per company", 500, "MOI, MOL, Civil Defense, 4 ministry visits*", 12, 250, 5, 1, 1, 10],
  ];
  for (const t of tiers) {
    await conn.execute(
      `INSERT IGNORE INTO subscription_tiers
       (plan_name, tier_name, annual_fee, company_size, transactions_included, hukoomi_services,
        training_sessions, training_rate, training_team_members, legal_advising, dedicated_pro, translation_pages)
       VALUES ('Growth Partner Program', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t
    );
  }

  await conn.execute(
    `INSERT IGNORE INTO subscription_plans (name, description, terms) VALUES (?, ?, ?)`,
    [
      "Office Space Assistance",
      "Annual office space consultation & documentation service for Trade License purposes only — renews yearly.",
      JSON.stringify([
        "100% of the Professional Consultation Fee must be paid in advance before commencement of services.",
        "This proposal is strictly for Trade License registration and consultation purposes only.",
        "No physical office space, workstation, or business premises will be provided under this proposal.",
      ]),
    ]
  );
  await conn.execute(
    `INSERT IGNORE INTO subscription_tiers (plan_name, tier_name, annual_fee, extra_features)
     VALUES ('Office Space Assistance', 'Standard', 12000, ?)`,
    [JSON.stringify([
      { label: "Coverage", value: "Office Space Assistance - Consultation" },
      { label: "Scope", value: "Only Trade License Purpose - No physical space available" },
    ])]
  );

  console.log("Seeding Data Manager default settings & templates...");
  await conn.execute(
    `INSERT IGNORE INTO data_settings (id, email_subject, email_body, whatsapp_body) VALUES (1, ?, ?, ?)`,
    ["Business Introduction", DEFAULT_EMAIL_BODY, DEFAULT_WHATSAPP_BODY]
  );

  console.log("Seeding app-wide settings...");
  await conn.execute(`INSERT IGNORE INTO app_settings (id) VALUES (1)`);

  console.log("\nDone. First login: admin@addressgateway.com / ChangeMe123!  — change this immediately.");
  await conn.end();
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
