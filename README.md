# Fantasy Live

A public website for your ESPN Fantasy Football league: live-updating matchup
scores anyone can watch (no ESPN login required), plus an admin panel where
you manually manage rosters and publish articles/blurbs.

- **Public site** — live scoreboard (auto-refreshes every 20s), matchup detail
  pages with rosters, an articles feed.
- **Admin panel** (`/admin`) — one shared password. Sync team names from
  ESPN, hand-edit each team's roster, write and publish articles or short
  blurbs.
- **Stack** — Node.js + Express + EJS templates + SQLite (`better-sqlite3`).
  One process, one file-based database, no separate frontend build.

## How the pieces fit together

- **Live scores are read-only from ESPN.** A background job polls ESPN's
  fantasy API every `POLL_INTERVAL_MS` (default 30s) and caches the result in
  memory. The public site reads from that cache — it never calls ESPN
  directly on a page load, so it stays fast even with lots of visitors and
  won't get you rate-limited.
- **Team names** sync automatically from that same poll (or on-demand via the
  "Sync teams from ESPN" button in `/admin`).
- **Rosters are manual on purpose** (per your setup): the app doesn't try to
  pull or write real ESPN lineups. You add/edit/remove players per team from
  the admin panel, which also means you can label bench spots, add notes-ish
  slot names, etc. freely.
- **Articles/blurbs** are a simple CMS: title, body, author, and a
  published/draft toggle. Draft articles never appear on the public site.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

| Variable | What it is |
|---|---|
| `ESPN_LEAGUE_ID` | The number in your league's ESPN URL, e.g. `.../leagueId=123456` |
| `ESPN_SEASON_ID` | The year, e.g. `2026` |
| `ESPN_S2` / `ESPN_SWID` | Only needed for **private** leagues (see below) |
| `ADMIN_PASSWORD` | Password for `/admin` — change this |
| `SESSION_SECRET` | Any random string |
| `LEAGUE_DISPLAY_NAME` | Shown in the header/title |
| `POLL_INTERVAL_MS` | How often to refresh scores from ESPN |

Then:

```bash
npm start
```

Visit `http://localhost:3000`. Log into `/admin` with `ADMIN_PASSWORD`, click
**"Sync teams from ESPN"** to pull in team names, then open each team to add
its roster.

### Getting `ESPN_S2` and `ESPN_SWID` (private leagues only)

Most home leagues are private, so you'll need these two cookies:

1. In a browser, log into [fantasy.espn.com](https://fantasy.espn.com) and
   open your league.
2. Open DevTools (F12) → **Application** (Chrome) or **Storage** (Firefox) →
   **Cookies** → `https://fantasy.espn.com`.
3. Copy the values of the `espn_s2` and `SWID` cookies (SWID includes the
   curly braces, e.g. `{ABCD1234-...}`) into `.env`.

These cookies expire eventually (ESPN doesn't publish a fixed lifetime) —
if scores stop updating months from now, refresh them the same way.

If your league is public, leave both blank; the app works without them.

## Deploying

This is a normal Node app — it runs anywhere that runs Node 18+
(Render, Railway, Fly.io, a VPS, etc.). Notes:

- Set the same environment variables from `.env` in your host's dashboard.
- The SQLite file lives at `data/fantasy-live.db`. Make sure your host gives
  you a **persistent disk/volume** at that path — on platforms with an
  ephemeral filesystem (some free tiers), the database will reset on every
  deploy/restart unless you attach persistent storage.
- Only one process should run the ESPN polling loop. If you ever scale to
  multiple server instances, move the poller into a separate worker process
  so you don't hammer ESPN's API from N instances at once.

## Project layout

```
server.js          Express app entry point + starts the ESPN poller
db.js               SQLite connection + schema
espn.js             ESPN API client, in-memory score cache, polling loop
middleware/auth.js   Simple session-gate for /admin
routes/public.js     Scoreboard, matchup detail, articles
routes/api.js         /api/scores — polled by the browser for live updates
routes/admin.js       Login, roster CRUD, article CRUD
views/                EJS templates (public/ and admin/)
public/               CSS + the small client-side polling script
```

## Extending it

- **Live win-probability / projected points**: `espn.js` already parses
  `totalProjectedPoints` per team into `matchup.home.projected` /
  `matchup.away.projected` — just add them to the templates if you want them
  shown.
- **Player-level live scoring**: ESPN's `mBoxscore` view returns per-player
  stats, which isn't wired up here since rosters are manual, but it's the
  same fetch pattern in `espn.js` if you later want to auto-populate rosters
  and their live scores from ESPN instead of typing them in.
- **Multiple admins / roles**: currently one shared password. Swap
  `middleware/auth.js` and the login route for per-user accounts if you want
  individual logins later.
