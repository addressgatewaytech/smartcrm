require("dotenv").config();
const express = require("express");
// Patches Express's router so a rejected promise from an `async (req, res) => {...}` handler is
// forwarded to the error-handling middleware below, instead of becoming an unhandled rejection
// that crashes the whole process (Express 4 does not await async handlers on its own).
require("express-async-errors");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(path.join(__dirname, process.env.UPLOAD_DIR || "uploads")));

// Every /api response is dynamic — without this, some browsers (Safari in particular) will
// silently serve a stale cached GET response after a POST/PATCH/DELETE elsewhere, making the
// UI look like it "didn't update" even though the write succeeded.
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", require("./src/routes/auth.routes"));
app.use("/api/users", require("./src/routes/users.routes"));
app.use("/api/leads", require("./src/routes/leads.routes"));
app.use("/api/deals", require("./src/routes/deals.routes"));
app.use("/api/quotations", require("./src/routes/quotations.routes"));
app.use("/api/sales-orders", require("./src/routes/salesOrders.routes"));
app.use("/api/invoices", require("./src/routes/invoices.routes"));
app.use("/api/customers", require("./src/routes/customers.routes"));
app.use("/api/job-cards", require("./src/routes/jobCards.routes"));
app.use("/api/subscriptions", require("./src/routes/subscriptions.routes"));
app.use("/api/hr", require("./src/routes/hr.routes"));
app.use("/api/incentives", require("./src/routes/incentives.routes"));
app.use("/api/notifications", require("./src/routes/notifications.routes"));
app.use("/api/reports", require("./src/routes/reports.routes"));
app.use("/api/data-manager", require("./src/routes/dataManager.routes"));
app.use("/api/settings", require("./src/routes/settings.routes"));
app.use("/api", require("./src/routes/templates.routes")); // /api/services, /api/quotation-templates, /api/checklist-templates

// --- Frontend (built React app) ------------------------------------------------------------
// Served from the same Express app/domain as the API, so there's no separate hosting target
// and no CORS to configure. `frontend:build` (npm --prefix frontend run build) produces this.
// Also doubles as the "/" health probe some managed hosting platforms use before finishing
// custom-domain/proxy setup — without SOME 200 response at "/", that check can silently block.
// Vite content-hashes every JS/CSS filename (index-XXXXXXXX.js), so those are safe to cache
// forever — a new build always gets new filenames, never reuses one for different content.
// index.html is the opposite: it's the only thing that references those hashed filenames, so if
// IT gets cached (some browsers apply their own heuristic caching when no header says otherwise —
// Safari in particular, which is why this showed up as "different result on Mac"), a device can
// keep loading an old shell pointing at deleted assets indefinitely, long after a new deploy.
const frontendDist = path.join(__dirname, "frontend", "dist");
// sw.js and the manifest must never be cached either — the same staleness risk as index.html
// applies to the service worker script in particular, since a stuck old SW is even harder for a
// user to self-recover from than a stuck old page.
const NEVER_CACHE = ["index.html", "sw.js", "manifest.webmanifest"];
app.use(express.static(frontendDist, {
  setHeaders: (res, filePath) => {
    res.set("Cache-Control", NEVER_CACHE.some((f) => filePath.endsWith(f)) ? "no-store" : "public, max-age=31536000, immutable");
  },
}));
app.get(/^(?!\/api|\/uploads).*/, (req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(frontendDist, "index.html"), (err) => { if (err) next(); });
});

// Central error handler — keeps stack traces out of API responses in production.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === "production" ? "Something went wrong" : err.message });
});

// --- Scheduled jobs (the real-backend replacements for the prototype's manual trigger buttons) ---
// Data Manager: daily auto-assignment at 07:00, end-of-day return at 23:00, recycling check nightly at 01:00.
// NOTE: if you ever run more than one server instance/process, guard these behind a leader-election
// check or a dedicated worker process so the job doesn't fire once per instance.
if (process.env.NODE_ENV === "production") {
  const { runAutoAssign, runEndOfDayReturn, runRecycling } = require("./src/services/dataManagerJobs");
  cron.schedule("0 7 * * *", () => runAutoAssign().catch((e) => console.error("Cron auto-assign failed", e)));
  cron.schedule("0 23 * * *", () => runEndOfDayReturn().catch((e) => console.error("Cron end-of-day-return failed", e)));
  cron.schedule("0 1 * * *", () => runRecycling().catch((e) => console.error("Cron recycling failed", e)));
  console.log("Scheduled jobs registered (auto-assign 07:00, end-of-day return 23:00, recycling 01:00).");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Address Gateway backend listening on port ${PORT}`));
