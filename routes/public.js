const express = require("express");
const db = require("../db");
const { getCache } = require("../espn");

const router = express.Router();

router.get("/", (req, res) => {
  const cache = getCache();
  const articles = db
    .prepare(
      `SELECT * FROM articles WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 6`
    )
    .all();
  res.render("index", {
    leagueName: process.env.LEAGUE_DISPLAY_NAME || "The League",
    week: cache.week,
    matchups: cache.matchups,
    lastUpdated: cache.lastUpdated,
    error: cache.error,
    articles,
  });
});

router.get("/matchup/:teamId", (req, res) => {
  const cache = getCache();
  const teamId = Number(req.params.teamId);
  const matchup = cache.matchups.find(
    (m) => m.home?.teamId === teamId || m.away?.teamId === teamId
  );
  if (!matchup) return res.status(404).render("404");

  const rosterFor = (tid) =>
    db
      .prepare(
        `SELECT * FROM rosters WHERE team_id = ? ORDER BY is_starter DESC, sort_order ASC, id ASC`
      )
      .all(tid);

  res.render("matchup", {
    leagueName: process.env.LEAGUE_DISPLAY_NAME || "The League",
    week: cache.week,
    matchup,
    homeRoster: matchup.home ? rosterFor(matchup.home.teamId) : [],
    awayRoster: matchup.away ? rosterFor(matchup.away.teamId) : [],
  });
});

router.get("/articles", (req, res) => {
  const articles = db
    .prepare(
      `SELECT * FROM articles WHERE published_at IS NOT NULL ORDER BY published_at DESC`
    )
    .all();
  res.render("articles", {
    leagueName: process.env.LEAGUE_DISPLAY_NAME || "The League",
    articles,
  });
});

router.get("/articles/:slug", (req, res) => {
  const article = db
    .prepare(
      `SELECT * FROM articles WHERE slug = ? AND published_at IS NOT NULL`
    )
    .get(req.params.slug);
  if (!article) return res.status(404).render("404");
  res.render("article", {
    leagueName: process.env.LEAGUE_DISPLAY_NAME || "The League",
    article,
  });
});

module.exports = router;
