const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");
const { APPROVAL_TYPES } = require("../utils/designationApproval");

const router = express.Router();
router.use(requireAuth);

router.get("/types", async (req, res) => {
  const rows = await query("SELECT approval_type, approver_designations FROM approval_type_assignments");
  const assigned = new Map(rows.map((r) => [r.approval_type, r.approver_designations || []]));
  res.json(APPROVAL_TYPES.map((t) => ({ ...t, approverDesignations: assigned.get(t.key) || [] })));
});

router.put("/types/:key", requireRole(["super_admin", "admin"]), async (req, res) => {
  if (!APPROVAL_TYPES.some((t) => t.key === req.params.key)) return res.status(404).json({ error: "Unknown approval type" });
  const designations = Array.isArray(req.body.approverDesignations) ? req.body.approverDesignations.filter(Boolean) : [];
  await query(
    `INSERT INTO approval_type_assignments (approval_type, approver_designations) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE approver_designations = VALUES(approver_designations)`,
    [req.params.key, JSON.stringify(designations)]
  );
  res.json({ ok: true });
});

module.exports = router;
