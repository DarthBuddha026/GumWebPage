// POST /api/setup { setupKey, username, displayName, password } — first run only:
// creates the owner account using ADMIN_PASSWORD as the setup key, then signs in.
const {
  route, send, jsonBody, redis, readAccounts, setupKeyMatches, hashPassword, validatePassword,
  cleanUsername, cleanDisplayName, startSession, auditCommands, assertNotLockedOut, recordFailure,
  clearFailures, publicUser, HttpError, KEYS,
} = require("./_lib");

module.exports = route({
  POST: async (req, res) => {
    const body = jsonBody(req);
    const accounts = await readAccounts();
    if (accounts.users.length) throw new HttpError(409, "Setup is already done. Sign in instead.");

    await assertNotLockedOut(req);
    if (typeof body.setupKey !== "string" || !setupKeyMatches(body.setupKey)) {
      await recordFailure(req);
      throw new HttpError(401, "That setup key isn't right. It's the ADMIN_PASSWORD value in Vercel.");
    }

    const username = cleanUsername(body.username);
    validatePassword(body.password);
    const owner = {
      username,
      displayName: cleanDisplayName(body.displayName, username),
      role: "owner",
      ...hashPassword(body.password),
      sessionVersion: 1,
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
    };

    await redis(
      ["SET", KEYS.accounts, JSON.stringify({ version: 1, users: [owner] })],
      ...auditCommands(owner, "Set up the admin", `Created the owner account ${username}`)
    );
    await clearFailures(req);
    startSession(res, owner);
    send(res, 200, { user: publicUser(owner) });
  },
});
