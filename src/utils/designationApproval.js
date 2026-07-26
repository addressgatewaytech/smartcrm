const { query } = require("../config/db");
const { isAdminLike } = require("../middleware/roles");

// Every fixed approval type in the system, with its built-in (always-allowed) role gate —
// shown in the Approval Process Workflow UI so admins know what already works even with no
// designations assigned yet.
const APPROVAL_TYPES = [
  { key: "quotation_discount", label: "Quotation Discount Approval", builtInRoles: ["Sales Manager", "Admin-tier"] },
  { key: "job_card_signoff", label: "Job Card Sign-off", builtInRoles: ["Accounts", "Admin-tier"] },
  { key: "leave_request", label: "Leave Request Approval", builtInRoles: ["HR", "Admin-tier"] },
  { key: "punch_request", label: "Punch Request Approval", builtInRoles: ["HR", "Admin-tier"] },
];

// Same shape as requireRole(baseRoles), but additive: also lets a caller through if their own
// designation is on the assigned approver list for `approvalTypeKey` (Approval Process Workflow,
// Users & Roles). Never removes access requireRole alone would have granted — if nobody has
// assigned designations for a type yet, behavior is identical to plain requireRole.
function requireRoleOrApprovalTypeDesignation(baseRoles, approvalTypeKey) {
  return async (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const roleOk = baseRoles.some((role) => (role === "admin_like" ? isAdminLike(userRoles) : userRoles.includes(role)));
    if (roleOk) return next();

    try {
      const [row] = await query("SELECT approver_designations FROM approval_type_assignments WHERE approval_type = ?", [approvalTypeKey]);
      const allowed = row?.approver_designations || [];
      if (!allowed.length) return res.status(403).json({ error: "You do not have permission to perform this action" });
      const [approver] = await query("SELECT designation FROM users WHERE id = ?", [req.user.id]);
      if (!approver?.designation || !allowed.includes(approver.designation)) {
        return res.status(403).json({ error: "You do not have permission to perform this action" });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { APPROVAL_TYPES, requireRoleOrApprovalTypeDesignation };
