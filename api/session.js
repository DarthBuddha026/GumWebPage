// GET /api/session — setup status and the signed-in user (if any).
const { route, send, redisConfig, readAccounts, currentUser, publicUser } = require("./_lib");

module.exports = route({
  GET: async (req, res) => {
    const setup = { database: Boolean(redisConfig()), password: Boolean(process.env.ADMIN_PASSWORD), owner: false };
    let user = null;
    if (setup.database && setup.password) {
      const accounts = await readAccounts();
      setup.owner = accounts.users.some((u) => u.role === "owner");
      const found = await currentUser(req, accounts);
      user = found ? publicUser(found) : null;
    }
    send(res, 200, { setup, user });
  },
});
