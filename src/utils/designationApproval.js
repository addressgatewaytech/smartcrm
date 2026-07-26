const { query } = require("../config/db");
const { requireRole, isAdminLike } = require("../middleware/roles");

// Walks the configured chain (child -> parent -> parent's parent -> ...) starting from
// `ofDesignation` and returns true if `ancestorDesignation` appears anywhere above it.
// Capped at 20 hops as a cheap guard against a chain that somehow slipped past the
// cycle check below.
async function isDesignationAncestor(ancestorDesignation, ofDesignation) {
  if (!ancestorDesignation || !ofDesignation || ancestorDesignation === ofDesignation) return false;
  const rows = await query("SELECT designation, parent_designation FROM designation_hierarchy");
  const parentOf = new Map(rows.map((r) => [r.designation, r.parent_designation]));
  let cur = parentOf.get(ofDesignation) || null;
  let hops = 0;
  while (cur && hops < 20) {
    if (cur === ancestorDesignation) return true;
    cur = parentOf.get(cur) || null;
    hops++;
  }
  return false;
}

// Same shape as requireRole(baseRoles), but additive: also lets a caller through if their
// designation is a configured approver (ancestor in designation_hierarchy) of the target
// user's designation. `resolveTargetUserId(req)` returns the id of the user whose request is
// being approved/rejected. Never removes access requireRole alone would have granted — if the
// hierarchy is unconfigured for a given pair, behavior is identical to plain requireRole.
function requireRoleOrDesignationApprover(baseRoles, resolveTargetUserId) {
  return async (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const roleOk = baseRoles.some((role) => (role === "admin_like" ? isAdminLike(userRoles) : userRoles.includes(role)));
    if (roleOk) return next();

    try {
      const targetUserId = await resolveTargetUserId(req);
      if (!targetUserId) return res.status(403).json({ error: "You do not have permission to perform this action" });
      const [approver] = await query("SELECT designation FROM users WHERE id = ?", [req.user.id]);
      const [target] = await query("SELECT designation FROM users WHERE id = ?", [targetUserId]);
      const ok = await isDesignationAncestor(approver?.designation, target?.designation);
      if (!ok) return res.status(403).json({ error: "You do not have permission to perform this action" });
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { isDesignationAncestor, requireRoleOrDesignationApprover };
