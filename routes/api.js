const express = require("express");
const { getCache } = require("../espn");

const router = express.Router();

router.get("/scores", (req, res) => {
  const cache = getCache();
  res.json({
    week: cache.week,
    matchups: cache.matchups,
    lastUpdated: cache.lastUpdated,
    error: cache.error,
  });
});

module.exports = router;
