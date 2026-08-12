// Shared read-only math for the Content Creator 9-stage production tracker — used by the
// ContentStagesTracker section of TaskDetailModal (tasks.jsx) and the Dashboard's Content Creator
// block (App.jsx), so "how far along is this task, and was it on time" is computed exactly the
// same way in both places. Mirrors salesTasksHelpers.js's role for Sales Daily Tasks.

// Keep this in sync with src/utils/contentStages.js (backend) — same convention as ROLE_LABEL
// across src/middleware/roles.js and frontend/src/ui.jsx.
export const CONTENT_STAGES = [
  "Discussion",
  "Confirmation",
  "Script",
  "Location & Schedule",
  "Shoot",
  "Edit",
  "First Out",
  "Correction",
  "Final Out – Delivered",
];

// Merges the raw per-stage rows (task.contentStages — indexed 0-8, possibly sparse/unsorted as
// they come off the API) with the fixed stage names into a full 9-row picture: which stage is
// current, overall % complete, and on-time vs late counts. A completed stage with no target date
// set is excluded from the on-time/late tally rather than guessed either way.
export function contentStageSnapshot(contentStages) {
  const byIndex = new Map((contentStages || []).map((s) => [s.stageIndex, s]));
  let currentIndex = CONTENT_STAGES.length; // sentinel: all stages done
  let completedCount = 0, onTimeCount = 0, lateCount = 0;

  const stages = CONTENT_STAGES.map((name, i) => {
    const row = byIndex.get(i) || {};
    const done = !!row.completedAt;
    if (done) completedCount++;
    if (!done && currentIndex === CONTENT_STAGES.length) currentIndex = i;

    let onTime = null;
    if (done && row.targetDate) {
      onTime = row.completedAt.slice(0, 10) <= row.targetDate.slice(0, 10);
      if (onTime) onTimeCount++; else lateCount++;
    }

    return {
      index: i,
      name,
      targetDate: row.targetDate || null,
      completedAt: row.completedAt || null,
      completedBy: row.completedBy || null,
      status: done ? "done" : i === currentIndex ? "current" : "locked",
      onTime,
    };
  });

  const completionPct = Math.round((completedCount / CONTENT_STAGES.length) * 100);
  return { stages, currentIndex, completedCount, completionPct, onTimeCount, lateCount };
}
