// POST /api/import { backup } — restores a backup made by /api/export (owner only).
// Replaces guilds, bladers, the schedule, results and images. Accounts are untouched.
// Everything is checked before anything is written.
const {
  route, send, jsonBody, redis, requireWrite, cleanGuilds, cleanPlayers, cleanSeason, cleanResult,
  imageKeyFromUrl, auditCommands, DATA_URL, HttpError, KEYS,
} = require("./_lib");

module.exports = route({
  POST: async (req, res) => {
    const user = await requireWrite(req, { role: "owner" });
    const { backup } = jsonBody(req);
    if (!backup || backup.format !== "gum-guild-wars-backup") throw new HttpError(400, "That file isn't a GUM Guild Wars backup.");

    const guilds = cleanGuilds(backup.guilds || []);
    const names = new Set(guilds.map((g) => g.name));
    const players = cleanPlayers(backup.players || [], names);
    const season = cleanSeason(backup.season || {}, names);

    const results = Object.entries(backup.results || {}).map(([id, r]) => {
      const match = season.matches.find((m) => m.id === id);
      if (!match) throw new HttpError(400, `The backup has a result for a fixture that isn't in its schedule (${id}).`);
      return [id, cleanResult(r, match, players)];
    });

    const images = Object.entries(backup.images || {}).map(([ref, dataUrl]) => {
      const key = imageKeyFromUrl(ref);
      if (!key || typeof dataUrl !== "string" || !DATA_URL.test(dataUrl)) throw new HttpError(400, "The backup has an image that isn't valid.");
      return [key, dataUrl];
    });

    // Bump past the current versions so open admin pages see a conflict and reload.
    const [guildsRaw, playersRaw, seasonRaw] = await redis(["GET", KEYS.guilds], ["GET", KEYS.players], ["GET", KEYS.season]);
    const version = (raw) => (raw ? JSON.parse(raw).version : 0) + 1;
    const oldMatchIds = seasonRaw ? JSON.parse(seasonRaw).matches.map((m) => m.id) : [];
    const now = new Date().toISOString();

    await redis(
      ["SET", KEYS.guilds, JSON.stringify({ version: version(guildsRaw), teams: guilds, updatedAt: now })],
      ["SET", KEYS.players, JSON.stringify({ version: version(playersRaw), players, updatedAt: now })],
      ["SET", KEYS.season, JSON.stringify({ version: version(seasonRaw), ...season, updatedAt: now })],
      ...(oldMatchIds.length ? [["DEL", ...oldMatchIds.map(KEYS.result)]] : []),
      ...results.map(([id, r]) => ["SET", KEYS.result(id), JSON.stringify({ version: 1, matchId: id, ...r, updatedBy: user.displayName, updatedAt: now })]),
      ...images.map(([key, dataUrl]) => ["SET", key, dataUrl]),
      ...auditCommands(user, "Restored a backup", `${guilds.length} guilds, ${players.length} bladers, ${season.matches.length} fixtures, ${results.length} results`)
    );

    send(res, 200, { guilds: guilds.length, players: players.length, fixtures: season.matches.length, results: results.length, images: images.length });
  },
});
