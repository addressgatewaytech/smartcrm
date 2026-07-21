# Address Gateway CRM & Workflow Platform — Backend

Node.js + Express + MySQL backend implementing the full business logic from `Address-Gateway-Backend-Requirements.md`. This is the API layer only — pair it with a frontend (the existing prototype's components can be adapted, or build a fresh one against this API).

## What's implemented

- **Auth**: JWT login, bcrypt password hashing, role-based access control on every route.
- **Leads → Deals → Quotations → Sales Orders → Invoices**, including the **Government Fee rule** (never creates a Sales Order/Invoice/Job Card — enforced server-side in `quotations.routes.js`) and the discount-approval routing.
- **Job Cards**: both creation paths (normal, via onboarding; and direct-create, which requires Accounts/Admin approval before assignment).
- **Subscriptions**: plan/tier catalog (admin-extensible) + customer subscriptions, with **transaction usage always computed live from Job Cards** (never stored — see `subscriptions.routes.js`).
- **Customers & KYC**, including the per-customer dashboard aggregation (quotations/invoices/statement/job cards).
- **HR**: employees, attendance, leave requests, and punch (attendance-correction) requests with both business rules enforced server-side (3/month cap, 11:30 AM next-day deadline).
- **Incentives**, computed per employee, excluding Government Fee activity.
- **Notifications** with confirm-and-send email (falls back to console logging if SMTP isn't configured yet).
- **Reports**: all 8 tabs from the spec, period-filterable via `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- **Data Manager module**: duplicate prevention (mandatory, server-side, on every entry path), Excel/CSV import, Company Data Pool + auto-assignment, timed send limits (25/day + cooldown, enforced server-side), archiving, recycling, export + export history, and the required integration point with Leads (existing-data detection).
- **Scheduled jobs** (`node-cron`): daily auto-assignment (07:00), end-of-day return (23:00), recycling (01:00) — replacing the prototype's manual trigger buttons.
- **PDF generation**: `GET /api/quotations/:id/pdf` streams a real A4 PDF (PDFKit — no headless browser needed, so it runs fine on Hostinger shared hosting) with a footer note that repeats on every page. See `src/utils/quotationPdf.js`.

## Local setup

```bash
npm install
cp .env.example .env        # then fill in real DB credentials + JWT secret
npm run db:migrate          # creates all tables
npm run db:seed             # seeds services, Growth Partner Program, Office Space Assistance, and one admin user
npm run dev                 # starts on http://localhost:3000
```

First login after seeding: `admin@addressgateway.com` / `ChangeMe123!` — change this immediately via `POST /api/auth/change-password`.

## Deployed instance

Live at **https://gatewaysmartcrm.com**, running on Hostinger's Node.js App product (GitHub-connected, auto-deploys on push to `main`).

## Deploying to Hostinger

1. Push this project to a GitHub repository (private is fine).
2. In **hPanel → Databases → MySQL Databases**, create a database + user. Note the **Host** shown on that page (or under a "Remote MySQL" section) — it's often a specific server hostname (e.g. `srv2046.hstgr.io`), not `localhost`, if the Node.js app runs on separate infrastructure from the database (it does, on Hostinger's newer Node.js App product — check via SSH if unsure, see gotchas below).
3. If connecting from separate infrastructure, enable **Remote MySQL** access for that database (hPanel → Databases → Remote MySQL) so the app can reach it.
4. In **hPanel → Websites**, create/select a site, then find its **Node.js App** management (a distinct product from classic shared hosting — look for it specifically; not every plan/site has it enabled). Connect it to this GitHub repo/branch.
5. Set the environment variables from `.env.example` in the app's **Environment Variables** panel (there's usually an "Import .env" option to paste them all at once) — use the MySQL details from steps 2–3. Do **not** set `PORT` — the platform manages that itself.
6. After the first deploy, SSH into the app (its own SSH Access panel — separate credentials from any other hosting account on the same Hostinger account) and run:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   (The env vars from step 5 aren't exported into a plain SSH shell — either export them inline for this one-off command, or temporarily drop a `.env` file in the app directory and delete it after.)
7. Connect your custom domain via the app's "Connect domain" flow. Redeploys happen automatically on push if auto-deployment is enabled.

### Gotchas discovered during a real deployment

- **Root path**: the app needs a `GET /` handler returning 200 — some platforms probe `/` to confirm the app is healthy before finishing domain/proxy setup. Without it, custom-domain connection can silently fail with no error shown.
- **JSON columns**: `mysql2` auto-deserializes native MySQL `JSON` columns into real JS values. Do **not** wrap them in `JSON.parse()` again when reading — this crashes every route touching a JSON column (`roles`, `items`, `checklist`, `audience`, `terms`, `extra_features`, `email_cc`) with `SyntaxError: Unexpected token ... in JSON`. Writing works fine either way (stringified or raw), since the driver serializes objects automatically.
- **Domain-connection UI can be flaky per-domain**: if a custom domain's "Connect domain" wizard gets stuck (Confirm button does nothing, no error), it may be specific to that domain's existing DNS/mail configuration rather than a platform-wide bug — test with a fresh/unused domain to isolate before escalating to support.

## What's a stub / needs a decision before go-live

- **Email**: `src/utils/mailer.js` sends via SMTP if `SMTP_HOST` is set in `.env`; otherwise it just logs what would have been sent. Fill in real SMTP credentials (Hostinger's own email hosting works fine here) when ready.
- **WhatsApp**: the Data Manager "send WhatsApp" endpoint records the send server-side but expects the actual `wa.me` deep link to be opened client-side (same low-cost approach the prototype used). Swap in the WhatsApp Business API here if/when there's budget for it.
- **File storage**: profile photos and KYC documents currently save to local disk (`/uploads`) via `multer`. Fine for a single Hostinger instance; move to object storage first if you ever scale to multiple server instances.
- **Multi-instance caution**: if Hostinger ever runs more than one instance of this app, guard the `node-cron` jobs in `server.js` behind a leader-election check (or move them to a separate worker process) so they don't fire multiple times.

## Project structure

```
server.js                        — app entry point, mounts all routes + cron jobs
db/schema.sql                    — full MySQL schema
db/migrate.js, db/seed.js        — setup scripts
src/config/db.js                 — MySQL connection pool
src/middleware/auth.js           — JWT verification
src/middleware/roles.js          — role constants + requireRole() middleware
src/utils/helpers.js             — ID generation, date/normalization helpers, quote totals
src/utils/mailer.js              — email sending (SMTP or console-log fallback)
src/services/dataManagerJobs.js  — shared logic for cron + on-demand Data Manager actions
src/routes/*.routes.js           — one file per module (see list above)
```
