// Office-hours helpers for the Lead Assignment Manager SLA rule and Attendance lateness/early-
// departure detection — one shared definition of "office hours" for both, per Address Gateway's
// actual business week (Doha, Qatar: Sunday-Thursday, 9:00 AM-5:00 PM; Friday/Saturday are the
// weekend). Qatar Standard Time is a fixed UTC+3 with no DST, so we compute against that fixed
// offset explicitly rather than trusting the server process's own TZ setting (Hostinger's Node
// process may well be running in UTC).
const QATAR_OFFSET_MINUTES = 3 * 60;
const OFFICE_START_HOUR = 9;
const OFFICE_END_HOUR = 17;
const WORKING_DAYS = [0, 1, 2, 3, 4]; // Sun-Thu (JS getDay()/getUTCDay() convention: 0=Sunday)

// Shifts a real UTC instant so that its UTC getters (getUTCDay/getUTCHours/...) read as Qatar
// local calendar/clock values — avoids any dependence on the server process's own timezone.
function toQatarTime(date) {
  return new Date(date.getTime() + QATAR_OFFSET_MINUTES * 60000);
}

function isWorkingDay(date) {
  return WORKING_DAYS.includes(toQatarTime(date).getUTCDay());
}

function isOfficeHours(date) {
  if (!isWorkingDay(date)) return false;
  const hour = toQatarTime(date).getUTCHours();
  return hour >= OFFICE_START_HOUR && hour < OFFICE_END_HOUR;
}

// The real UTC instant corresponding to 9:00 AM Qatar-local on the next working day after `date`.
function nextWorkingDayStart(date) {
  let q = toQatarTime(date);
  do {
    q = new Date(q.getTime() + 24 * 60 * 60 * 1000);
  } while (!WORKING_DAYS.includes(q.getUTCDay()));
  const qatarLocalNineAm = Date.UTC(q.getUTCFullYear(), q.getUTCMonth(), q.getUTCDate(), OFFICE_START_HOUR, 0, 0);
  return new Date(qatarLocalNineAm - QATAR_OFFSET_MINUTES * 60000);
}

// The SLA deadline for a lead assigned at `assignedAt` — 5 minutes later if that falls within
// office hours, otherwise 9:00 AM Qatar-local on the next working day.
function nextSlaDeadline(assignedAt) {
  const assigned = new Date(assignedAt);
  if (isOfficeHours(assigned)) return new Date(assigned.getTime() + 5 * 60 * 1000);
  return nextWorkingDayStart(assigned);
}

module.exports = {
  OFFICE_START_HOUR, OFFICE_END_HOUR,
  toQatarTime, isWorkingDay, isOfficeHours, nextWorkingDayStart, nextSlaDeadline,
};
