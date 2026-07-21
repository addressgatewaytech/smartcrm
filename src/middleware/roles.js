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
  accounts: "Accounts",
  hr: "HR",
  executive: "Executive",       // read-only: Dashboard + Reports only — see routes/reports.routes.js gating
  data_manager: "Data Manager",
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

module.exports = { ADMIN_LIKE, ROLE_LABEL, isAdminLike, requireRole };
