# Address Gateway CRM & Workflow Platform

Node.js + Express + MySQL backend implementing the full business logic from `Address-Gateway-Backend-Requirements.md`, plus a React frontend (adapted from the original single-file prototype) wired to the real API and served by the same Express app.

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
- **Frontend** (`frontend/`): the original prototype's UI/CSS reused almost verbatim, with its in-memory `useReducer` mock store replaced by a real API-backed data layer (`frontend/src/store.jsx`) and its "Viewing as" role-switcher replaced by real JWT login. See "Frontend architecture" below.

## Local setup

```bash
npm install
cp .env.example .env        # then fill in real DB credentials + JWT secret
npm run db:migrate          # creates all tables
npm run db:seed             # seeds services, Growth Partner Program, Office Space Assistance, and one admin user
npm run dev                 # starts the API on http://localhost:3000
```

First login after seeding: `admin@addressgateway.com` / `ChangeMe123!` — change this immediately via `POST /api/auth/change-password`.

### Frontend

```bash
npm run frontend:dev         # Vite dev server on http://localhost:5173, proxies /api and /uploads to :3000
npm run frontend:build       # builds frontend/dist — commit this after any frontend change (see below)
```

For local development, run the API (`npm run dev`) and the frontend dev server (`npm run frontend:dev`) side by side — `frontend/vite.config.js` proxies API calls to `:3000`. To test the exact production setup, run `npm run frontend:build` then `npm start` and open `http://localhost:3000` — the Express server serves `frontend/dist` directly.

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

- **Root path**: the app needs a `GET /` handler returning 200 — some platforms probe `/` to confirm the app is healthy before finishing domain/proxy setup. Without it, custom-domain connection can silently fail with no error shown. (Now serves the frontend's `index.html` instead — see below.)
- **JSON columns**: `mysql2` auto-deserializes native MySQL `JSON` columns into real JS values. Do **not** wrap them in `JSON.parse()` again when reading — this crashes every route touching a JSON column (`roles`, `items`, `checklist`, `audience`, `terms`, `extra_features`, `email_cc`) with `SyntaxError: Unexpected token ... in JSON`. Writing works fine either way (stringified or raw), since the driver serializes objects automatically.
- **DECIMAL columns come back as strings**: without `decimalNumbers: true` on the mysql2 pool config, comparing two DECIMAL-sourced values (e.g. `total_paid >= invoice.amount`) is a *lexicographic string comparison* — `"5000" >= "15000.00"` is `true`. This silently corrupted invoice payment-status logic (a partial payment was marking invoices fully "Paid"). Fixed in `src/config/db.js`; still worth wrapping genuinely cross-value numeric comparisons in `Number(...)` defensively.
- **Domain-connection UI can be flaky per-domain**: if a custom domain's "Connect domain" wizard gets stuck (Confirm button does nothing, no error), it may be specific to that domain's existing DNS/mail configuration rather than a platform-wide bug — test with a fresh/unused domain to isolate before escalating to support.

## Frontend architecture

`frontend/src/App.jsx` is the original prototype almost unchanged — same components, same CSS, same UX. Three things were replaced:

1. **State**: the prototype's `initialState()` (hardcoded mock data) + `reducer()` (~80 client-side business-logic cases) were deleted entirely. `frontend/src/store.jsx`'s `useApiStore()` hook now fetches real data from every endpoint on load and exposes an async `dispatch(action)` that recognizes the *same action types* the components already call (`ADD_LEAD`, `CONVERT_TO_SALES_ORDER`, etc.) — but instead of mutating local state, each case calls the matching API endpoint and refetches the affected slice(s) from the server. Business logic (Government Fee rules, discount routing, checklist gating, ...) lives only on the backend now — the frontend does not duplicate it.
2. **Data shape**: the backend returns raw DB rows (snake_case: `next_follow_up`, `fee_type`, `order_discount`, ...). `frontend/src/mappers.js` converts every entity to the camelCase shape the prototype's components already expect (`nextFollowUp`, `feeType`, `orderDiscount`, ...), so the JSX itself needed almost no changes.
3. **Auth**: the "Viewing as" / "Acting as" user-switcher (there was no real login in the prototype) was replaced with a real login screen (`frontend/src/api.js` + the `Login` component in `App.jsx`) that calls `POST /api/auth/login`, stores the JWT, and gates the whole app on it. "Acting as" is kept for users with multiple roles (a real feature from the spec), but there's no more picking *which employee* you are.

A few backend endpoints didn't exist yet and were added while wiring this up (staff document CRUD, customer-employee update, subscription plan/tier edit+delete — see the git history around "Add endpoints the frontend needs"). A couple of prototype-only conveniences don't have a real backend equivalent and were simplified in the frontend to match what the API actually supports (e.g. Sales Orders → Invoice + Job Card is one atomic `/onboard` call here, not two separate steps).

**After changing anything under `frontend/`**, rebuild and commit the output — there's no confirmed build hook on the Hostinger side, so the built `frontend/dist` is committed directly and served by `server.js`:
```bash
npm run frontend:build
git add frontend/dist
```

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
frontend/src/App.jsx             — the whole UI (prototype's original component tree, adapted)
frontend/src/store.jsx           — API-backed replacement for the prototype's useReducer store
frontend/src/api.js              — fetch client for every backend endpoint
frontend/src/mappers.js          — snake_case (DB) -> camelCase (UI) shape conversion
frontend/dist/                   — built frontend, committed, served by server.js
```
