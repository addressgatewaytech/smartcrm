const express = require("express");
const { query } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { nextId } = require("../utils/helpers");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const rows = await query("SELECT * FROM deals ORDER BY created_at DESC");
  res.json(rows);
});

router.post("/", async (req, res) => {
  const id = nextId("DL");
  const b = req.body;
  await query(
    `INSERT INTO deals (id, lead_id, customer, service, value, owner, stage, expected_close) VALUES (?,?,?,?,?,?,?,?)`,
    [id, b.leadId || null, b.customer, b.service || null, b.value || 0, b.owner || req.user.id, b.stage || "Open", b.expectedClose || null]
  );
  res.status(201).json({ id });
});

router.patch("/:id", async (req, res) => {
  const b = req.body;
  const fields = [];
  const params = [];
  for (const [col, key] of [["customer", "customer"], ["service", "service"], ["value", "value"], ["stage", "stage"], ["expected_close", "expectedClose"]]) {
    if (b[key] !== undefined) { fields.push(`${col} = ?`); params.push(b[key]); }
  }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE deals SET ${fields.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await query("DELETE FROM deals WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
