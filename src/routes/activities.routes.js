const express = require("express");
const { requireAuth } = require("../middleware/auth");
const ACTIVITIES = require("../data/ecommerceActivities.json");

const router = express.Router();
router.use(requireAuth);

// Read-only reference list of business activities for company formation (started from the
// e-commerce approved list, now also covering other company types — see ecommerceActivities.json's
// "category" field for which list/company type each entry came from). Small enough to ship whole
// to the client, where the Activity Finder does the search and suggestions.
router.get("/", (req, res) => {
  res.json(ACTIVITIES);
});

module.exports = router;
