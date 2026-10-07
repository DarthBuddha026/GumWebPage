// POST /api/password { currentPassword, newPassword } — change your own password.
// Signs out your other devices and keeps this one signed in.
const {
  route, send, jsonBody, redis, readAccounts, requireWrite, verifyPassword, hashPassword,
  validatePassword, startSession, auditCommands, publicUser, HttpError, KEYS,
} = require("./_lib");

module.exports = route({
  POST: async (req, res) => {
    const user = await requireWrite(req, { allowTemporaryPassword: true });
    const { currentPassword, newPassword } = jsonBody(req);
    if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, user)) {
      throw new HttpError(401, "Your current password isn't right.");
    }
    validatePassword(newPassword);
    if (newPassword === currentPassword) throw new HttpError(400, "Choose a password different from your current one.");

    const accounts = await readAccounts();
    const stored = accounts.users.find((u) => u.username === user.username);
    Object.assign(stored, hashPassword(newPassword), { mustChangePassword: false, sessionVersion: (stored.sessionVersion || 0) + 1 });

    await redis(
      ["SET", KEYS.accounts, JSON.stringify({ ...accounts, version: accounts.version + 1 })],
      ...auditCommands(stored, "Changed their password")
    );
    startSession(res, stored);
    send(res, 200, { user: publicUser(stored) });
  },
});
