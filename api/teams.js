// GET /api/teams — the published guild list (public; `teams` is null until the first save).
// PUT /api/teams { baseVersion, teams, renames? } — replaces the list (signed-in staff).
//   `renames` ({ oldName: newName }) carries a rename through to bladers and fixtures.
//   Removing a guild that still has bladers or fixtures is refused.
const {
  route, send, jsonBody, redis, readDoc, checkVersion, requireWrite, cleanGuilds, imageCommands,
  auditCommands, HttpError, KEYS,
} = require("./_lib");

const summary = (before, after) => {
  const was = new Map((before || []).map((t) => [t.name, JSON.stringify(t)]));
  const now = new Map(after.map((t) => [t.name, JSON.stringify(t)]));
  const added = [...now.keys()].filter((n) => !was.has(n));
  const removed = [...was.keys()].filter((n) => !now.has(n));
  const edited = [...now.keys()].filter((n) => was.has(n) && was.get(n) !== now.get(n));
  return [added.length && `added ${added.join(", ")}`, removed.length && `removed ${removed.join(", ")}`, edited.length && `edited ${edited.join(", ")}`]
    .filter(Boolean)
    .join("; ");
};

module.exports = route({
  GET: async (req, res) => {
    send(res, 200, await readDoc(KEYS.guilds, { teams: null, updatedAt: null }));
  },

  PUT: async (req, res) => {
    const user = await requireWrite(req);
    const body = jsonBody(req);
    const teams = cleanGuilds(body.teams);
    const [guildsRaw, playersRaw, seasonRaw] = await redis(["GET", KEYS.guilds], ["GET", KEYS.players], ["GET", KEYS.season]);
    const current = guildsRaw ? JSON.parse(guildsRaw) : { version: 0, teams: null };
    checkVersion(current, body.baseVersion, "the guilds");

    const names = new Set(teams.map((t) => t.name));
    const players = playersRaw ? JSON.parse(playersRaw) : null;
    const season = seasonRaw ? JSON.parse(seasonRaw) : null;

    // Carry renames through to bladers and fixtures.
    const renames = body.renames && typeof body.renames === "object" ? body.renames : {};
    const rename = (name) => (Object.prototype.hasOwnProperty.call(renames, name) && names.has(renames[name]) ? renames[name] : name);
    let playersChanged = false;
    let seasonChanged = false;
    if (players) {
      players.players.forEach((p) => {
        const next = rename(p.team);
        if (next !== p.team) [p.team, playersChanged] = [next, true];
      });
    }
    if (season) {
      season.matches.forEach((m) => {
        const [a, b] = [rename(m.team1), rename(m.team2)];
        if (a !== m.team1 || b !== m.team2) [m.team1, m.team2, seasonChanged] = [a, b, true];
      });
    }

    // Refuse to orphan bladers or fixtures.
    const stuck = new Map();
    const note = (name, what) => {
      if (names.has(name)) return;
      const s = stuck.get(name) || { bladers: 0, fixtures: 0 };
      s[what]++;
      stuck.set(name, s);
    };
    (players?.players || []).forEach((p) => note(p.team, "bladers"));
    (season?.matches || []).forEach((m) => [m.team1, m.team2].forEach((t) => note(t, "fixtures")));
    if (stuck.size) {
      const [name, s] = [...stuck][0];
      const parts = [s.bladers && `${s.bladers} blader${s.bladers === 1 ? "" : "s"}`, s.fixtures && `${s.fixtures} fixture${s.fixtures === 1 ? "" : "s"}`].filter(Boolean);
      throw new HttpError(409, `${name} still has ${parts.join(" and ")}. Move or remove them first, then delete the guild.`);
    }

    const now = new Date().toISOString();
    const doc = { version: current.version + 1, teams, updatedAt: now };
    await redis(
      ["SET", KEYS.guilds, JSON.stringify(doc)],
      ...(playersChanged ? [["SET", KEYS.players, JSON.stringify({ ...players, version: players.version + 1, updatedAt: now })]] : []),
      ...(seasonChanged ? [["SET", KEYS.season, JSON.stringify({ ...season, version: season.version + 1, updatedAt: now })]] : []),
      ...imageCommands((current.teams || []).map((t) => t.logo), teams.map((t) => t.logo)),
      ...auditCommands(user, "Saved guilds", summary(current.teams, teams) || "no changes")
    );

    send(res, 200, doc);
  },
});
