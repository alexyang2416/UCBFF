const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "fantasy-live.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,       -- ESPN team id, kept in sync automatically
    name TEXT NOT NULL,
    abbrev TEXT,
    owner TEXT,
    logo TEXT
  );

  CREATE TABLE IF NOT EXISTS rosters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    nfl_team TEXT,
    position TEXT,        -- QB, RB, WR, TE, D/ST, K
    slot TEXT,             -- Starting slot label, e.g. "QB", "RB1", "FLEX", "BENCH"
    is_starter INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    kind TEXT DEFAULT 'article',   -- 'article' or 'blurb'
    body TEXT NOT NULL,
    author TEXT,
    published_at TEXT,             -- NULL = draft, not shown publicly
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
