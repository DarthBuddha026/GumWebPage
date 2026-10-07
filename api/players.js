// GET /api/players — all bladers (public).
// PUT /api/players { baseVersion, players } — replaces the list (signed-in staff).
//   Every blader must belong to a saved guild. Bladers who already have battle
//   results can't be deleted (mark them inactive instead).
const {
  route, send, jsonBody, redis, readDoc, checkVersion, requireWrite, cleanPlayers, imageCommands,
  auditCommands, HttpError, KEYS,
} = require("./_lib");

const playedKeys = async (season) => {
  const ids = (season?.matches || []).map((m) => m.id);
  if (!ids.length) return new Set();
  const [raws] = await redis(["MGET", ...ids.map(KEYS.result)]);
  const keys = new Set();
  (raws || []).filter(Boolean).forEach((raw) => JSON.parse(raw).bouts.forEach((b) => [b.p1, b.p2].forEach((k) => k && keys.add(k))));
  return keys;
};

const summary = (before, after) => {
  const was = new Map(before.map((p) => [p.key, p]));
  const now = new Map(after.map((p) => [p.key, p]));
  const added = after.filter((p) => !was.has(p.key)).map((p) => p.name);
  const removed = before.filter((p) => !now.has(p.key)).map((p) => p.name);
  const edited = after.filter((p) => was.has(p.key) && JSON.stringify(was.get(p.key)) !== JSON.stringify(p)).map((p) => p.name);
  return [added.length && `added ${added.join(", ")}`, removed.length && `removed ${removed.join(", ")}`, edited.length && `edited ${edited.join(", ")}`]
    .filter(Boolean)
    .join("; ");
};

module.exports = route({
  GET: async (req, res) => {
    send(res, 200, await readDoc(KEYS.players, { players: [], updatedAt: null }));
  },

  PUT: async (req, res) => {
    const user = await requireWrite(req);
    const body = jsonBody(req);
    const [guildsRaw, playersRaw, seasonRaw] = await redis(["GET", KEYS.guilds], ["GET", KEYS.players], ["GET", KEYS.season]);
    if (!guildsRaw) throw new HttpError(409, "Save the guilds once before adding bladers.");

    const guildNames = new Set(JSON.parse(guildsRaw).teams.map((t) => t.name));
    const current = playersRaw ? JSON.parse(playersRaw) : { version: 0, players: [] };
    checkVersion(current, body.baseVersion, "the bladers");
    const players = cleanPlayers(body.players, guildNames);

    const remaining = new Set(players.map((p) => p.key));
    const removed = current.players.filter((p) => !remaining.has(p.key));
    if (removed.length) {
      const played = await playedKeys(seasonRaw && JSON.parse(seasonRaw));
      const blocked = removed.find((p) => played.has(p.key));
      if (blocked) throw new HttpError(409, `${blocked.name} has battle results, so they can't be deleted. Mark them inactive instead.`);
    }

    const doc = { version: current.version + 1, players, updatedAt: new Date().toISOString() };
    await redis(
      ["SET", KEYS.players, JSON.stringify(doc)],
      ...imageCommands(current.players.map((p) => p.photo), players.map((p) => p.photo)),
      ...auditCommands(user, "Saved bladers", summary(current.players, players) || "no changes")
    );
    send(res, 200, doc);
  },
});
