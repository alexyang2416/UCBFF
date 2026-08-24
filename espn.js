const db = require("./db");

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID;
const SEASON_ID = process.env.ESPN_SEASON_ID;
const ESPN_S2 = process.env.ESPN_S2;
const ESPN_SWID = process.env.ESPN_SWID;

const BASE_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON_ID}/segments/0/leagues/${LEAGUE_ID}`;

// In-memory cache of the last successful poll. The public site always reads
// from this, never hits ESPN directly on a page load.
const cache = {
  lastUpdated: null,
  week: null,
  matchups: [],
  error: null,
};

function authHeaders() {
  const headers = { Accept: "application/json" };
  // Only needed for private leagues. Public leagues work with no cookies.
  if (ESPN_S2 && ESPN_SWID) {
    headers.Cookie = `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}`;
  }
  return headers;
}

function upsertTeams(teamsPayload) {
  const upsert = db.prepare(`
    INSERT INTO teams (id, name, abbrev, owner, logo)
    VALUES (@id, @name, @abbrev, @owner, @logo)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      abbrev = excluded.abbrev,
      owner = excluded.owner,
      logo = excluded.logo
  `);
  const ownersById = new Map();
  for (const m of teamsPayload.members || []) {
    ownersById.set(m.id, [m.firstName, m.lastName].filter(Boolean).join(" "));
  }
  const tx = db.transaction((teams) => {
    for (const t of teams) {
      const owner =
        (t.owners || []).map((oid) => ownersById.get(oid)).filter(Boolean)[0] ||
        null;
      // ESPN has two ways a team's display name can show up:
      //  - `name`: the actual custom name a manager typed in (e.g. "Big Game Moves")
      //  - `location` + `nickname`: an older split-name format. When a manager
      //    hasn't customized these, ESPN silently fills them with the manager's
      //    own first/last name, which is why unedited teams can show up looking
      //    like a person's name instead of a team name.
      // Prefer the real custom name first, and only fall back to the legacy
      // location/nickname combo (then abbreviation) if no custom name exists.
      const customName = (t.name || "").trim();
      const legacyName = [t.location, t.nickname].filter(Boolean).join(" ").trim();

      upsert.run({
        id: t.id,
        name: customName || legacyName || t.abbrev || `Team ${t.id}`,
        abbrev: t.abbrev || null,
        owner,
        logo: t.logo || null,
      });
    }
  });
  tx(teamsPayload.teams || []);
}

function teamLookup() {
  const rows = db.prepare("SELECT id, name, abbrev, owner, logo FROM teams").all();
  const map = new Map();
  for (const r of rows) map.set(r.id, r);
  return map;
}

function normalizeMatchups(payload) {
  const currentWeek = payload.scoreboard?.matchupPeriodId || payload.status?.currentMatchupPeriod;
  const teams = teamLookup();

  const relevant = (payload.schedule || []).filter(
    (m) => m.matchupPeriodId === currentWeek
  );

  const matchups = relevant.map((m) => {
    const buildSide = (side) => {
      if (!side || side.teamId == null) return null;
      const team = teams.get(side.teamId);
      return {
        teamId: side.teamId,
        name: team ? team.name : `Team ${side.teamId}`,
        abbrev: team ? team.abbrev : null,
        owner: team ? team.owner : null,
        logo: team ? team.logo : null,
        score: round1(side.totalPoints ?? 0),
        projected: round1(side.totalProjectedPoints ?? side.totalPoints ?? 0),
      };
    };
    return {
      matchupId: m.id,
      winner: m.winner, // "HOME" | "AWAY" | "UNDECIDED"
      home: buildSide(m.home),
      away: buildSide(m.away),
    };
  });

  return { week: currentWeek, matchups };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

async function pollOnce() {
  if (!LEAGUE_ID || !SEASON_ID) {
    cache.error = "ESPN_LEAGUE_ID or ESPN_SEASON_ID is not set in .env";
    return;
  }
  try {
    const url = `${BASE_URL}?view=mScoreboard&view=mMatchupScore&view=mTeam&view=mRoster`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      throw new Error(`ESPN API responded ${res.status} ${res.statusText}`);
    }
    const payload = await res.json();
    upsertTeams(payload);
    const normalized = normalizeMatchups(payload);
    cache.week = normalized.week;
    cache.matchups = normalized.matchups;
    cache.lastUpdated = new Date().toISOString();
    cache.error = null;
  } catch (err) {
    cache.error = err.message;
    // Keep serving the last known-good cache on failure; don't blank the site.
  }
}

let pollTimer = null;
function startPolling() {
  const intervalMs = Number(process.env.POLL_INTERVAL_MS || 30000);
  pollOnce();
  pollTimer = setInterval(pollOnce, intervalMs);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
}

function getCache() {
  return cache;
}

module.exports = { startPolling, stopPolling, pollOnce, getCache };
