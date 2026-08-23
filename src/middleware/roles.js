const { query } = require("../config/db");

// Mirrors the role model from the prototype exactly — keep this in sync with any frontend role list.
const ADMIN_LIKE = ["super_admin", "admin", "admin_exec"];

const ROLE_LABEL = {
  super_admin: "Super Admin",
  admin: "Admin",
  admin_exec: "Admin Executive",
  sales_manager: "Sales Manager",
  sales_exec: "Sales Executive",
  ops_manager: "Operations Manager",
  ops_member: "Operations Team Member",
  pro_head: "PRO Head",
  pro: "PRO",
  accounts: "Accounts",
  hr: "HR",
  executive: "Executive",       // read-only: Dashboard + Reports only — see routes/reports.routes.js gating
  data_manager: "Data Manager",
  lead_manager: "Lead Manager", // Lead Assignment Manager module — assigns/reassigns leads, monitors SLA
  content_creator: "Content Creator", // Tasks assigned to this role get the 9-stage production tracker — see task_content_stages
  // Sees every business module read-only (not just Dashboard+Reports like "executive") — never
  // assignable as a lead/task/job-card owner, never in Sales Daily Task scope, and enforced
  // read-only at the API level regardless of any individual route's own gating — see requireAuth
  // in src/middleware/auth.js.
  viewer: "Viewer",
};

const isAdminLike = (roles) => (roles || []).some((r) => ADMIN_LIKE.includes(r));

// requireRole(["admin_like", "sales_manager"]) — pass "admin_like" as shorthand for the ADMIN_LIKE set.
function requireRole(allowed) {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const ok = allowed.some((role) => (role === "admin_like" ? isAdminLike(userRoles) : userRoles.includes(role)));
    if (!ok) return res.status(403).json({ error: "You do not have permission to perform this action" });
    next();
  };
}

// Gates a module's own list/read route behind the explicit per-user Module Access grid
// (user_module_permissions — see Users & Roles > Module Access) instead of a role check. Admin-tier
// always passes (they're never restricted by the grid). Additive alongside whatever requireRole/
// ownership-scoping a route already has — this only adds a new way to be blocked, never removes
// an existing one.
function requireModuleView(moduleKey) {
  return async (req, res, next) => {
    if (isAdminLike(req.user?.roles)) return next();
    try {
      const [row] = await query("SELECT can_view FROM user_module_permissions WHERE user_id = ? AND module = ?", [req.user.id, moduleKey]);
      if (row?.can_view) return next();
      return res.status(403).json({ error: "You do not have access to this module" });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ADMIN_LIKE, ROLE_LABEL, isAdminLike, requireRole, requireModuleView };
