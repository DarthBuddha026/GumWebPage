// GET /api/result?matchId=… — one match result (signed-in staff; the public reads /api/league).
// PUT /api/result { matchId, baseVersion, status, defaultWinner?, bouts? } — saves one match:
//   status "played": battles with round-by-round results; points are computed here.
//                    The match is final once every battle is won, otherwise it's in progress.
//   status "default": a default/DQ win for guild 1 or 2, with no battles.
//   status "none": clears the result.
// Each match has its own key, so organizers scoring different matches never conflict.
const {
  route, send, jsonBody, redis, checkVersion, requireUser, requireWrite, cleanResult, queryParam,
  auditCommands, HttpError, KEYS,
} = require("./_lib");

async function loadMatch(matchId) {
  if (!/^m[a-z0-9]{1,16}$/.test(matchId)) throw new HttpError(400, "That match ID isn't valid.");
  const [seasonRaw, playersRaw, resultRaw] = await redis(["GET", KEYS.season], ["GET", KEYS.players], ["GET", KEYS.result(matchId)]);
  const season = seasonRaw ? JSON.parse(seasonRaw) : { matches: [], weeks: [] };
  const match = season.matches.find((m) => m.id === matchId);
  if (!match) throw new HttpError(404, "That match isn't on the schedule any more. Reload the schedule.");
  const players = playersRaw ? JSON.parse(playersRaw).players : [];
  const result = resultRaw ? JSON.parse(resultRaw) : { version: 0, status: "none", bouts: [] };
  return { season, match, players, result };
}

module.exports = route({
  GET: async (req, res) => {
    await requireUser(req);
    const { result } = await loadMatch(queryParam(req, "matchId"));
    send(res, 200, result);
  },

  PUT: async (req, res) => {
    const user = await requireWrite(req);
    const body = jsonBody(req);
    const { season, match, players, result: current } = await loadMatch(String(body.matchId || ""));
    checkVersion(current, body.baseVersion, "this match");
    const title = `${match.team1} vs ${match.team2}`;
    const week = season.weeks.find((w) => w.id === match.weekId)?.label || "";

    if (body.status === "none") {
      await redis(["DEL", KEYS.result(match.id)], ...auditCommands(user, "Cleared a result", `${week} ${title}`.trim()));
      return send(res, 200, { version: 0, status: "none", bouts: [] });
    }

    const clean = cleanResult(body, match, players);
    const doc = { version: current.version + 1, matchId: match.id, ...clean, updatedBy: user.displayName || user.username, updatedAt: new Date().toISOString() };

    let detail;
    if (clean.status === "default") {
      detail = `${title}: default win for ${clean.defaultWinner === 1 ? match.team1 : match.team2}`;
    } else {
      const won1 = clean.bouts.filter((b) => b.complete && b.p1Pts > b.p2Pts).length;
      const won2 = clean.bouts.filter((b) => b.complete && b.p2Pts > b.p1Pts).length;
      detail = `${title}, ${won1}–${won2}${clean.status === "final" ? " (final)" : " (in progress)"}`;
    }

    await redis(["SET", KEYS.result(match.id), JSON.stringify(doc)], ...auditCommands(user, "Saved a result", `${week} ${detail}`.trim()));
    send(res, 200, doc);
  },
});
