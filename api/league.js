// GET /api/league — everything the public dashboard needs in one request: guilds, bladers,
// the schedule and every match result. Cached briefly by Vercel's CDN.
const { route, send, redis, KEYS } = require("./_lib");

const parse = (raw, empty) => (raw ? JSON.parse(raw) : { version: 0, ...empty });

module.exports = route({
  GET: async (req, res) => {
    const [guildsRaw, playersRaw, seasonRaw] = await redis(["GET", KEYS.guilds], ["GET", KEYS.players], ["GET", KEYS.season]);
    const guilds = parse(guildsRaw, { teams: null });
    const players = parse(playersRaw, { players: [] });
    const season = parse(seasonRaw, { season: { number: 1, venue: "" }, weeks: [], matches: [] });

    const ids = season.matches.map((m) => m.id);
    const results = {};
    if (ids.length) {
      const [raws] = await redis(["MGET", ...ids.map(KEYS.result)]);
      ids.forEach((id, i) => {
        if (!raws[i]) return;
        const r = JSON.parse(raws[i]);
        results[id] = { status: r.status, defaultWinner: r.defaultWinner, bouts: r.bouts, updatedAt: r.updatedAt };
      });
    }

    const updatedAt = [guilds.updatedAt, players.updatedAt, season.updatedAt, ...Object.values(results).map((r) => r.updatedAt)]
      .filter(Boolean)
      .sort()
      .pop() || null;

    send(
      res,
      200,
      {
        updatedAt,
        guilds: guilds.teams,
        players: players.players,
        season: { ...season.season, weeks: season.weeks, matches: season.matches },
        results,
      },
      "public, max-age=0, s-maxage=5, stale-while-revalidate=30"
    );
  },
});
