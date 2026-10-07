// POST /api/logout — ends the admin session.
const { route, send, endSession } = require("./_lib");

module.exports = route({
  POST: async (req, res) => {
    endSession(res);
    send(res, 200, { admin: false });
  },
});
