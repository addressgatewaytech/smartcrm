const jwt = require("jsonwebtoken");

// Verifies the JWT on every protected route and attaches { id, roles } to req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, roles, activeRole }
    // A Viewer holds no operational role and must never be able to write anything, regardless of
    // whether the specific route below happens to have its own requireRole gate — several routes
    // (e.g. deals.routes.js) have none at all beyond ownership-scoping. Enforced once, globally,
    // here, rather than requiring every route file to remember to exclude "viewer".
    if ((payload.roles || []).includes("viewer") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return res.status(403).json({ error: "Viewers have read-only access" });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAuth };
