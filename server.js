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

// Root path: some managed hosting platforms probe "/" to confirm the app is up before
// finishing custom-domain/proxy setup — without this, that check gets a 404 and can silently
// block those flows.
app.get("/", (req, res) => res.json({ ok: true, service: "Address Gateway Backend", health: "/api/health" }));

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
app.use("/api", require("./src/routes/templates.routes")); // /api/services, /api/quotation-templates, /api/checklist-templates

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
