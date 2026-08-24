const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { pollOnce } = require("../espn");

const router = express.Router();

function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

// --- Auth ---

router.get("/login", (req, res) => {
  res.render("admin/login", { error: null });
});

router.post("/login", (req, res) => {
  if (req.body.password && req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }
  res.render("admin/login", { error: "Wrong password." });
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.redirect("/admin/login");
});

// Everything below requires login
router.use(requireAdmin);

router.get("/", (req, res) => {
  const teams = db.prepare("SELECT * FROM teams ORDER BY name ASC").all();
  const articles = db
    .prepare("SELECT * FROM articles ORDER BY created_at DESC")
    .all();
  res.render("admin/dashboard", { teams, articles });
});

// Force an immediate re-sync with ESPN (also refreshes the teams table)
router.post("/sync", async (req, res) => {
  await pollOnce();
  res.redirect("/admin");
});

// --- Rosters ---

router.get("/rosters/:teamId", (req, res) => {
  const teamId = Number(req.params.teamId);
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId);
  if (!team) return res.status(404).send("Team not found. Try syncing with ESPN first.");
  const roster = db
    .prepare(
      "SELECT * FROM rosters WHERE team_id = ? ORDER BY is_starter DESC, sort_order ASC, id ASC"
    )
    .all(teamId);
  res.render("admin/rosters", { team, roster });
});

router.post("/rosters/:teamId/add", (req, res) => {
  const teamId = Number(req.params.teamId);
  const { player_name, nfl_team, position, slot, is_starter } = req.body;
  if (!player_name || !player_name.trim()) return res.redirect(`/admin/rosters/${teamId}`);
  db.prepare(
    `INSERT INTO rosters (team_id, player_name, nfl_team, position, slot, is_starter, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM rosters WHERE team_id = ?))`
  ).run(
    teamId,
    player_name.trim(),
    nfl_team || null,
    position || null,
    slot || null,
    is_starter ? 1 : 0,
    teamId
  );
  res.redirect(`/admin/rosters/${teamId}`);
});

router.post("/rosters/:teamId/:rosterId/edit", (req, res) => {
  const { teamId, rosterId } = req.params;
  const { player_name, nfl_team, position, slot, is_starter } = req.body;
  db.prepare(
    `UPDATE rosters SET player_name = ?, nfl_team = ?, position = ?, slot = ?, is_starter = ?
     WHERE id = ? AND team_id = ?`
  ).run(
    player_name.trim(),
    nfl_team || null,
    position || null,
    slot || null,
    is_starter ? 1 : 0,
    rosterId,
    teamId
  );
  res.redirect(`/admin/rosters/${teamId}`);
});

router.post("/rosters/:teamId/:rosterId/delete", (req, res) => {
  const { teamId, rosterId } = req.params;
  db.prepare("DELETE FROM rosters WHERE id = ? AND team_id = ?").run(rosterId, teamId);
  res.redirect(`/admin/rosters/${teamId}`);
});

// --- Articles / blurbs ---

router.get("/articles/new", (req, res) => {
  res.render("admin/article-edit", { article: null });
});

router.post("/articles/new", (req, res) => {
  const { title, kind, body, author, publish } = req.body;
  if (!title || !title.trim() || !body || !body.trim()) {
    return res.render("admin/article-edit", {
      article: { title, kind, body, author },
      error: "Title and body are required.",
    });
  }
  let slug = slugify(title);
  const exists = db.prepare("SELECT id FROM articles WHERE slug = ?").get(slug);
  if (exists) slug = `${slug}-${Date.now().toString(36)}`;

  db.prepare(
    `INSERT INTO articles (title, slug, kind, body, author, published_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    title.trim(),
    slug,
    kind === "blurb" ? "blurb" : "article",
    body,
    author || null,
    publish ? new Date().toISOString() : null
  );
  res.redirect("/admin");
});

router.get("/articles/:id/edit", (req, res) => {
  const article = db.prepare("SELECT * FROM articles WHERE id = ?").get(req.params.id);
  if (!article) return res.status(404).send("Not found");
  res.render("admin/article-edit", { article });
});

router.post("/articles/:id/edit", (req, res) => {
  const { title, kind, body, author, publish } = req.body;
  const existing = db.prepare("SELECT * FROM articles WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).send("Not found");

  const published_at = publish
    ? existing.published_at || new Date().toISOString()
    : null;

  db.prepare(
    `UPDATE articles SET title = ?, kind = ?, body = ?, author = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    title.trim(),
    kind === "blurb" ? "blurb" : "article",
    body,
    author || null,
    published_at,
    req.params.id
  );
  res.redirect("/admin");
});

router.post("/articles/:id/delete", (req, res) => {
  db.prepare("DELETE FROM articles WHERE id = ?").run(req.params.id);
  res.redirect("/admin");
});

module.exports = router;
