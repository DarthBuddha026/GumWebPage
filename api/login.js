// POST /api/login { username, password } — signs in. An owner can also sign in with
// the setup key (ADMIN_PASSWORD) as an emergency fallback. Repeated wrong attempts
// from one address, or against one username, are locked out for 15 minutes.
const {
  route, send, jsonBody, redis, readAccounts, verifyPassword, setupKeyMatches, startSession,
  auditCommands, assertNotLockedOut, recordFailure, clearFailures, publicUser, HttpError,
} = require("./_lib");

module.exports = route({
  POST: async (req, res) => {
    const { username: rawName, password } = jsonBody(req);
    const username = String(rawName || "").trim().toLowerCase();
    if (!username || typeof password !== "string" || !password) throw new HttpError(400, "Enter your username and password.");

    const accounts = await readAccounts();
    if (!accounts.users.length) throw new HttpError(409, "The admin hasn't been set up yet.");

    await assertNotLockedOut(req, username);
    const user = accounts.users.find((u) => u.username === username);
    const viaSetupKey = Boolean(user && user.role === "owner" && setupKeyMatches(password));
    if (!user || !(viaSetupKey || verifyPassword(password, user))) {
      await recordFailure(req, username);
      throw new HttpError(401, "That username or password isn't right.");
    }

    await clearFailures(req, username);
    if (viaSetupKey) await redis(...auditCommands(user, "Signed in with the setup key"));
    startSession(res, user);
    send(res, 200, { user: publicUser(user) });
  },
});
