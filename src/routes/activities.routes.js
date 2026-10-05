const express = require("express");
const { requireAuth } = require("../middleware/auth");
const ACTIVITIES = require("../data/ecommerceActivities.json");

const router = express.Router();
router.use(requireAuth);

// Read-only reference list (e-commerce approved business activities). Small enough to ship whole
// to the client, where the Activity Finder does the search and suggestions.
router.get("/", (req, res) => {
  res.json(ACTIVITIES);
});

module.exports = router;
