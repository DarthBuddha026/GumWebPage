// GET /api/season — season details, weeks and fixtures (public).
// PUT /api/season { baseVersion, season, weeks, matches } — replaces the schedule (signed-in staff).
//   Deleting a fixture, or changing which guilds play in it, deletes its result.
const {
  route, send, jsonBody, redis, readDoc, checkVersion, requireWrite, cleanSeason, auditCommands, HttpError, KEYS,
} = require("./_lib");

module.exports = route({
  GET: async (req, res) => {
    send(res, 200, await readDoc(KEYS.season, { season: { number: 1, venue: "" }, weeks: [], matches: [], updatedAt: null }));
  },

  PUT: async (req, res) => {
    const user = await requireWrite(req);
    const body = jsonBody(req);
    const [guildsRaw, seasonRaw] = await redis(["GET", KEYS.guilds], ["GET", KEYS.season]);
    if (!guildsRaw) throw new HttpError(409, "Save the guilds once before building the schedule.");

    const guildNames = new Set(JSON.parse(guildsRaw).teams.map((t) => t.name));
    const current = seasonRaw ? JSON.parse(seasonRaw) : { version: 0, weeks: [], matches: [] };
    checkVersion(current, body.baseVersion, "the schedule");
    const next = cleanSeason(body, guildNames);

    // Results whose fixture is gone, or now has different guilds, no longer make sense.
    const after = new Map(next.matches.map((m) => [m.id, m]));
    const staleResults = current.matches
      .filter((m) => {
        const n = after.get(m.id);
        return !n || n.team1 !== m.team1 || n.team2 !== m.team2;
      })
      .map((m) => KEYS.result(m.id));

    const doc = { version: current.version + 1, ...next, updatedAt: new Date().toISOString() };
    const detail = `${next.weeks.length} weeks, ${next.matches.length} fixtures${staleResults.length ? `; cleared ${staleResults.length} result${staleResults.length === 1 ? "" : "s"}` : ""}`;
    await redis(
      ["SET", KEYS.season, JSON.stringify(doc)],
      ...(staleResults.length ? [["DEL", ...staleResults]] : []),
      ...auditCommands(user, "Saved the schedule", detail)
    );
    send(res, 200, doc);
  },
});
