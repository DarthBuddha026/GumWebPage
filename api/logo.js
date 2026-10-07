// GET /api/logo?id=… — serves guild logos uploaded before /api/image existed.
// New uploads go through /api/image.
const { route, KEYS } = require("./_lib");
const { serveImage, imageId } = require("./image");

module.exports = route({
  GET: async (req, res) => serveImage(res, KEYS.legacyLogo(imageId(req))),
});
