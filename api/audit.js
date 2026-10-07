// GET /api/audit — the 100 most recent changes (signed-in users only).
const { route, send, redis, requireUser, KEYS } = require("./_lib");

module.exports = route({
  GET: async (req, res) => {
    await requireUser(req);
    const [entries] = await redis(["LRANGE", KEYS.audit, 0, 99]);
    send(res, 200, { entries: (entries || []).map((e) => JSON.parse(e)) });
  },
});
