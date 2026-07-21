-- Address Gateway CRM & Workflow Platform — MySQL schema
-- Run this once against an empty database (Hostinger hPanel > Databases > phpMyAdmin, or `npm run db:migrate`).
-- Uses JSON columns for nested lists (items, checklist, docs, roles, audience, etc.) to keep the
-- shape close to the existing frontend/prototype, while keeping anything filtered/joined-on as a real column.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- USERS / STAFF / ROLES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(20)  PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(190) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  roles         JSON         NOT NULL,            -- e.g. ["sales_exec"] — a user can hold multiple roles
  dept          VARCHAR(100),
  initials      VARCHAR(5),
  designation   VARCHAR(200),                     -- derived (roles joined) but cached for display/reports
  photo_url     VARCHAR(500),
  leave_balance INT DEFAULT 21,
  active        TINYINT(1) DEFAULT 1,
  joined_date   DATE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  id          VARCHAR(30) PRIMARY KEY,
  user_id     VARCHAR(20) NOT NULL,
  date        DATE NOT NULL,
  status      ENUM('Present','Absent','Half Day','Leave','Vacation') NOT NULL DEFAULT 'Present',
  in_time     VARCHAR(8),
  out_time    VARCHAR(8),
  marked_by   VARCHAR(20),
  UNIQUE KEY uniq_user_date (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leave_requests (
  id           VARCHAR(20) PRIMARY KEY,
  user_id      VARCHAR(20) NOT NULL,
  type         ENUM('Annual','Sick','Unpaid','Emergency') NOT NULL,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  reason       TEXT,
  status       ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_by   VARCHAR(20),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Punch (missing attendance) correction requests. Business rules enforced in app code:
--  - max 3 per user per calendar month
--  - must be requested by 11:30 the day after `date`
CREATE TABLE IF NOT EXISTS punch_requests (
  id           VARCHAR(20) PRIMARY KEY,
  user_id      VARCHAR(20) NOT NULL,
  date         DATE NOT NULL,
  in_time      VARCHAR(8),
  out_time     VARCHAR(8),
  reason       TEXT NOT NULL,
  status       ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_by   VARCHAR(20),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_docs (
  id         VARCHAR(30) PRIMARY KEY,
  user_id    VARCHAR(20) NOT NULL,
  type       VARCHAR(100) NOT NULL,
  number     VARCHAR(100),
  expiry     DATE,
  cloud_link VARCHAR(500),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- SERVICES (admin-extensible list used across Leads/Deals/Quotations/Job Cards)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  name VARCHAR(150) PRIMARY KEY
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS checklist_templates (
  service VARCHAR(150) PRIMARY KEY,
  steps   JSON NOT NULL,   -- array of strings
  FOREIGN KEY (service) REFERENCES services(name) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotation_templates (
  service      VARCHAR(150) NOT NULL,
  fee_type     ENUM('Professional Fee','Government Fee') NOT NULL,
  subject      VARCHAR(500),
  items        JSON NOT NULL,      -- [{category, service, description, note, qty, price, discountPct}]
  notes        TEXT,
  terms        TEXT,
  order_discount DECIMAL(12,2) DEFAULT 0,
  bank         TEXT,
  footer_note  TEXT,
  PRIMARY KEY (service, fee_type),
  FOREIGN KEY (service) REFERENCES services(name) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- LEADS / DEALS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id             VARCHAR(20) PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  company        VARCHAR(200) NOT NULL,
  phone          VARCHAR(50),
  email          VARCHAR(190),
  reference      VARCHAR(255),
  source         VARCHAR(100),
  service        VARCHAR(150),
  owner          VARCHAR(20),
  status         ENUM('New','Contacted','Follow-up Scheduled','Interested','Not Interested','Qualified','Unqualified') DEFAULT 'New',
  next_follow_up DATE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_followups (
  id      VARCHAR(20) PRIMARY KEY,
  lead_id VARCHAR(20) NOT NULL,
  note    TEXT,
  outcome VARCHAR(100),
  at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deals (
  id             VARCHAR(20) PRIMARY KEY,
  lead_id        VARCHAR(20),
  customer       VARCHAR(200) NOT NULL,
  service        VARCHAR(150),
  value          DECIMAL(12,2) DEFAULT 0,
  owner          VARCHAR(20),
  stage          ENUM('Open','Quotation Sent','Won','Lost') DEFAULT 'Open',
  expected_close DATE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  FOREIGN KEY (owner) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- CUSTOMERS / KYC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id           VARCHAR(20) PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  type         ENUM('Company','Individual') DEFAULT 'Company',
  contact      VARCHAR(150),
  phone        VARCHAR(50),
  email        VARCHAR(190),
  company_size ENUM('Up to 10 Employees','Up to 30 Employees','Up to 100 Employees','Up to 200 Employees'),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_docs (
  id          VARCHAR(30) PRIMARY KEY,
  customer_id VARCHAR(20) NOT NULL,
  type        VARCHAR(100) NOT NULL,
  number      VARCHAR(100),
  expiry      DATE,
  cloud_link  VARCHAR(500),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_staff (
  id          VARCHAR(30) PRIMARY KEY,
  customer_id VARCHAR(20) NOT NULL,
  name        VARCHAR(150),
  designation VARCHAR(150),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_staff_docs (
  id               VARCHAR(30) PRIMARY KEY,
  customer_staff_id VARCHAR(30) NOT NULL,
  type             VARCHAR(100) NOT NULL,
  number           VARCHAR(100),
  expiry           DATE,
  cloud_link       VARCHAR(500),
  FOREIGN KEY (customer_staff_id) REFERENCES customer_staff(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- QUOTATIONS -> SALES ORDERS -> INVOICES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotations (
  id               VARCHAR(20) PRIMARY KEY,
  deal_id          VARCHAR(20),
  customer         VARCHAR(200) NOT NULL,
  fee_type         ENUM('Professional Fee','Government Fee') DEFAULT 'Professional Fee',
  subject          VARCHAR(500),
  items            JSON NOT NULL,     -- [{category, service, description, note, qty, price, discountPct}]
  order_discount   DECIMAL(12,2) DEFAULT 0,
  bank             TEXT,
  footer_note      TEXT,
  notes            TEXT,
  terms            TEXT,
  status           ENUM('Draft','Pending Manager Approval','Sent','Under Negotiation','Approved','Rejected','Expired') DEFAULT 'Draft',
  valid_till       DATE,
  owner            VARCHAR(20),
  favorite         TINYINT(1) DEFAULT 0,
  emailed_to_client TINYINT(1) DEFAULT 0,
  emailed_at       TIMESTAMP NULL,
  email_cc         JSON,              -- array of internal user names cc'd
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL,
  FOREIGN KEY (owner) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_orders (
  id             VARCHAR(20) PRIMARY KEY,
  quotation_id   VARCHAR(20) NOT NULL,
  customer       VARCHAR(200) NOT NULL,
  service        VARCHAR(150),
  fee_type       ENUM('Professional Fee','Government Fee') DEFAULT 'Professional Fee',
  amount         DECIMAL(12,2) NOT NULL,
  order_discount DECIMAL(12,2) DEFAULT 0,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
  id                VARCHAR(20) PRIMARY KEY,
  sales_order_id    VARCHAR(20) NULL,          -- nullable: subscription-generated invoices have no sales order
  subscription_id   VARCHAR(20) NULL,
  customer          VARCHAR(200) NOT NULL,
  fee_type          ENUM('Professional Fee','Government Fee') DEFAULT 'Professional Fee',
  amount            DECIMAL(12,2) NOT NULL,
  status            ENUM('Sent','Partially Paid','Paid','Overdue') DEFAULT 'Sent',
  due_date          DATE,
  emailed_to_client TINYINT(1) DEFAULT 0,
  emailed_at        TIMESTAMP NULL,
  email_cc          JSON,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_payments (
  id         VARCHAR(30) PRIMARY KEY,
  invoice_id VARCHAR(20) NOT NULL,
  amount     DECIMAL(12,2) NOT NULL,
  mode       VARCHAR(50),
  paid_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  recorded_by VARCHAR(20),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- JOB CARDS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_cards (
  id             VARCHAR(20) PRIMARY KEY,
  sales_order_id VARCHAR(20) NULL,
  customer       VARCHAR(200) NOT NULL,
  service        VARCHAR(150),
  description    VARCHAR(500),
  status         ENUM('Pending Approval','Created','Assigned','In Progress','On Hold','Completed','Cancelled') DEFAULT 'Created',
  priority       ENUM('Low','Normal','High','Urgent') DEFAULT 'Normal',
  target_date    DATE,
  checklist      JSON,           -- [{id, label, done}]
  cancel_reason  TEXT,
  created_by     VARCHAR(20),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_card_assignees (
  job_card_id VARCHAR(20) NOT NULL,
  user_id     VARCHAR(20) NOT NULL,
  PRIMARY KEY (job_card_id, user_id),
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_card_status_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  job_card_id VARCHAR(20) NOT NULL,
  status      VARCHAR(50) NOT NULL,
  at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  by_user     VARCHAR(20),
  note        VARCHAR(255),
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- SUBSCRIPTIONS (Plans & Services catalog + customer subscriptions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  name        VARCHAR(150) PRIMARY KEY,
  description TEXT,
  terms       JSON            -- array of strings
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscription_tiers (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  plan_name            VARCHAR(150) NOT NULL,
  tier_name            VARCHAR(100) NOT NULL,
  annual_fee           DECIMAL(12,2) NOT NULL DEFAULT 0,
  company_size         VARCHAR(100),
  transactions_included INT,
  hukoomi_services     VARCHAR(255),
  training_sessions    INT,
  training_rate        DECIMAL(12,2),
  training_team_members INT,
  legal_advising       INT,
  dedicated_pro        TINYINT(1),
  translation_pages    INT,
  extra_features       JSON,        -- [{label, value}] for plans that don't fit the fixed fields above
  UNIQUE KEY uniq_plan_tier (plan_name, tier_name),
  FOREIGN KEY (plan_name) REFERENCES subscription_plans(name) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id                     VARCHAR(20) PRIMARY KEY,
  customer_id            VARCHAR(20) NOT NULL,
  customer               VARCHAR(200) NOT NULL,
  plan_name              VARCHAR(150) NOT NULL,
  tier_name              VARCHAR(100) NOT NULL,
  annual_fee             DECIMAL(12,2) NOT NULL,
  start_date             DATE NOT NULL,
  expiry_date            DATE NOT NULL,
  status                 ENUM('Active','Cancelled') DEFAULT 'Active',
  training_sessions_used INT DEFAULT 0,
  legal_advising_used    INT DEFAULT 0,
  translation_pages_used INT DEFAULT 0,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  -- NOTE: transactions_used is NEVER stored — always computed live as a COUNT of job_cards
  -- for this customer where job_cards.created_at >= start_date and status NOT IN
  -- ('Cancelled','Pending Approval'). See src/routes/subscriptions.routes.js.
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- INCENTIVES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incentive_rules (
  id     VARCHAR(20) PRIMARY KEY,
  role   VARCHAR(50) NOT NULL,
  period ENUM('Daily','Weekly','Monthly') NOT NULL,
  metric VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           VARCHAR(20) PRIMARY KEY,
  type         VARCHAR(50),
  title        VARCHAR(255) NOT NULL,
  body         TEXT,
  audience     JSON NOT NULL,   -- array mixing role keys and specific user IDs
  read_flag    TINYINT(1) DEFAULT 0,
  email_sent   TINYINT(1) DEFAULT 0,
  emailed_at   TIMESTAMP NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- DATA MANAGER MODULE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_records (
  id                VARCHAR(20) PRIMARY KEY,
  company_name      VARCHAR(200) NOT NULL,
  contact_name      VARCHAR(150),
  mobile            VARCHAR(50),
  mobile_normalized VARCHAR(50),          -- digits only, for fast duplicate lookup
  email             VARCHAR(190),
  email_normalized  VARCHAR(190),         -- lowercased/trimmed, for fast duplicate lookup
  reference         VARCHAR(255),
  source            VARCHAR(100),
  business_category VARCHAR(150),
  location          VARCHAR(150),
  data_category     ENUM('Own','Company') NOT NULL,
  data_owner        VARCHAR(20) NULL,      -- Own Data only
  assigned_user     VARCHAR(20) NULL,      -- Company Data only, nullable = in the pool
  status            ENUM('New','Contacted','Interested','Not Interested','Converted to Lead','Archived') DEFAULT 'New',
  remarks           TEXT,
  archived_reason   VARCHAR(100),
  created_by        VARCHAR(20),
  lead_id           VARCHAR(20) NULL,
  last_contact_date DATE,
  email_sent_at     TIMESTAMP NULL,
  whatsapp_sent_at  TIMESTAMP NULL,
  created_date      DATE DEFAULT (CURRENT_DATE),
  INDEX idx_mobile_norm (mobile_normalized),
  INDEX idx_email_norm (email_normalized),
  INDEX idx_company_name (company_name),
  FOREIGN KEY (data_owner) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_user) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS data_export_history (
  id           VARCHAR(20) PRIMARY KEY,
  exported_by  VARCHAR(150),
  export_date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  record_count INT,
  purpose      VARCHAR(100),
  format       VARCHAR(20)
) ENGINE=InnoDB;

-- Singleton settings row (id always = 1)
CREATE TABLE IF NOT EXISTS data_settings (
  id                      INT PRIMARY KEY DEFAULT 1,
  daily_email_target      INT DEFAULT 25,
  daily_whatsapp_target   INT DEFAULT 25,
  email_interval_minutes  INT DEFAULT 5,
  whatsapp_interval_minutes INT DEFAULT 10,
  recycling_enabled       TINYINT(1) DEFAULT 1,
  recycling_days          INT DEFAULT 30,
  email_subject           VARCHAR(255) DEFAULT 'Business Introduction',
  email_body              TEXT,
  whatsapp_body           TEXT
) ENGINE=InnoDB;

-- Per-user daily counters for the Data Manager send-limit/cooldown rules.
CREATE TABLE IF NOT EXISTS data_user_activity (
  user_id         VARCHAR(20) NOT NULL,
  activity_date   DATE NOT NULL,
  emails_sent     INT DEFAULT 0,
  whatsapps_sent  INT DEFAULT 0,
  last_email_at   TIMESTAMP NULL,
  last_whatsapp_at TIMESTAMP NULL,
  PRIMARY KEY (user_id, activity_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- ACTIVITY LOG (shared audit trail shown on the Dashboard)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  text    VARCHAR(500) NOT NULL,
  at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
