const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");

const router = express.Router();
router.use(requireAuth);

// Every distinct designation currently in use, merged with any configured parent — a
// designation with no row yet (nobody has set its approver) still shows up, with parentDesignation
// null, so the org chart always reflects the current roster even before anyone touches it.
router.get("/hierarchy", async (req, res) => {
  const configured = await query("SELECT designation, parent_designation AS parentDesignation FROM designation_hierarchy");
  const inUse = await query("SELECT DISTINCT designation FROM users WHERE designation IS NOT NULL AND designation != ''");
  const parentOf = new Map(configured.map((r) => [r.designation, r.parentDesignation]));
  inUse.forEach((u) => { if (!parentOf.has(u.designation)) parentOf.set(u.designation, null); });
  res.json([...parentOf.entries()].map(([designation, parentDesignation]) => ({ designation, parentDesignation })));
});

router.put("/hierarchy", requireRole(["super_admin", "admin"]), async (req, res) => {
  const { designation, parentDesignation } = req.body;
  if (!designation?.trim()) return res.status(400).json({ error: "Designation is required" });
  if (parentDesignation === designation) return res.status(400).json({ error: "A designation cannot approve itself" });

  if (parentDesignation) {
    const rows = await query("SELECT designation, parent_designation FROM designation_hierarchy");
    const parentOf = new Map(rows.map((r) => [r.designation, r.parent_designation]));
    let cur = parentOf.get(parentDesignation) || null;
    let hops = 0;
    while (cur && hops < 20) {
      if (cur === designation) return res.status(400).json({ error: "That would create a circular approval chain" });
      cur = parentOf.get(cur) || null;
      hops++;
    }
  }

  await query(
    `INSERT INTO designation_hierarchy (designation, parent_designation) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE parent_designation = VALUES(parent_designation)`,
    [designation, parentDesignation || null]
  );
  res.json({ ok: true });
});

module.exports = router;
