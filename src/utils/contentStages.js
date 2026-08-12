// The 9 fixed production stages a Content Creator's task moves through, in order. Index into this
// array is what task_content_stages.stage_index refers to — keep this in sync with the identical
// array in frontend/src/contentStagesHelpers.js (same convention as ROLE_LABEL across
// src/middleware/roles.js and frontend/src/ui.jsx).
const CONTENT_STAGES = [
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

module.exports = { CONTENT_STAGES };
