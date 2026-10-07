// GET  /api/accounts — list everyone who can sign in (owner only).
// POST /api/accounts — manage organizers (owner only):
//   { action: "add", username, displayName, password }   temporary password, must change on first sign-in
//   { action: "reset", username, password }              new temporary password, signs them out
//   { action: "remove", username }                       removes access immediately
const {
  route, send, jsonBody, redis, readAccounts, requireUser, requireWrite, hashPassword, validatePassword,
  cleanUsername, cleanDisplayName, auditCommands, publicUser, HttpError, KEYS,
} = require("./_lib");

module.exports = route({
  GET: async (req, res) => {
    await requireUser(req, { role: "owner" });
    const accounts = await readAccounts();
    send(res, 200, { users: accounts.users.map(publicUser) });
  },

  POST: async (req, res) => {
    const owner = await requireWrite(req, { role: "owner" });
    const body = jsonBody(req);
    const accounts = await readAccounts();
    const username = cleanUsername(body.username);
    const existing = accounts.users.find((u) => u.username === username);
    let audit;

    if (body.action === "add") {
      if (existing) throw new HttpError(409, `The username ${username} is already taken.`);
      if (accounts.users.length >= 25) throw new HttpError(400, "There can be at most 25 accounts.");
      validatePassword(body.password);
      accounts.users.push({
        username,
        displayName: cleanDisplayName(body.displayName, username),
        role: "organizer",
        ...hashPassword(body.password),
        sessionVersion: 1,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      });
      audit = auditCommands(owner, "Added an organizer", username);
    } else if (body.action === "reset") {
      if (!existing) throw new HttpError(404, `There's no account called ${username}.`);
      if (existing.username === owner.username) throw new HttpError(400, "Change your own password from the password form instead.");
      validatePassword(body.password);
      Object.assign(existing, hashPassword(body.password), { mustChangePassword: true, sessionVersion: (existing.sessionVersion || 0) + 1 });
      audit = auditCommands(owner, "Reset a password", username);
    } else if (body.action === "remove") {
      if (!existing) throw new HttpError(404, `There's no account called ${username}.`);
      if (existing.username === owner.username) throw new HttpError(400, "You can't remove your own account.");
      if (existing.role === "owner") throw new HttpError(400, "Owner accounts can't be removed here.");
      accounts.users = accounts.users.filter((u) => u.username !== username);
      audit = auditCommands(owner, "Removed an organizer", username);
    } else {
      throw new HttpError(400, "Unknown action.");
    }

    await redis(["SET", KEYS.accounts, JSON.stringify({ ...accounts, version: accounts.version + 1 })], ...audit);
    send(res, 200, { users: accounts.users.map(publicUser) });
  },
});
