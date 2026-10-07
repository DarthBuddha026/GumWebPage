// GET /api/export — downloads a full backup (owner only): guilds, bladers, the schedule,
// every result and every uploaded image. Accounts are not included.
const { route, redis, requireUser, imageKeyFromUrl, auditCommands, KEYS } = require("./_lib");

module.exports = route({
  GET: async (req, res) => {
    const user = await requireUser(req, { role: "owner" });
    const [guildsRaw, playersRaw, seasonRaw] = await redis(["GET", KEYS.guilds], ["GET", KEYS.players], ["GET", KEYS.season]);
    const guilds = guildsRaw ? JSON.parse(guildsRaw).teams : null;
    const players = playersRaw ? JSON.parse(playersRaw).players : [];
    const season = seasonRaw ? JSON.parse(seasonRaw) : { season: { number: 1, venue: "" }, weeks: [], matches: [] };

    const results = {};
    const ids = season.matches.map((m) => m.id);
    if (ids.length) {
      const [raws] = await redis(["MGET", ...ids.map(KEYS.result)]);
      ids.forEach((id, i) => {
        if (!raws[i]) return;
        const { status, defaultWinner, bouts } = JSON.parse(raws[i]);
        results[id] = { status, defaultWinner, bouts: bouts.map(({ p1, p2, rounds }) => ({ p1, p2, rounds })) };
      });
    }

    const refs = [...new Set([...(guilds || []).map((t) => t.logo), ...players.map((p) => p.photo)].filter((r) => imageKeyFromUrl(r)))];
    const images = {};
    if (refs.length) {
      const [raws] = await redis(["MGET", ...refs.map(imageKeyFromUrl)]);
      refs.forEach((ref, i) => raws[i] && (images[ref] = raws[i]));
    }

    await redis(...auditCommands(user, "Downloaded a backup"));
    const backup = {
      format: "gum-guild-wars-backup",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      guilds,
      players,
      season: { season: season.season, weeks: season.weeks, matches: season.matches },
      results,
      images,
    };
    const stamp = backup.exportedAt.slice(0, 10);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gum-guild-wars-backup-${stamp}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(backup, null, 2));
  },
});
