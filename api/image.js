// GET  /api/image?id=… — serves an uploaded image (public; cached by browsers and Vercel's CDN).
// POST /api/image { dataUrl } — stores a resized logo or blader photo (signed-in staff) and
//   returns its URL. Uploads expire after a day unless a saved guild or blader uses them.
const crypto = require("crypto");
const { route, send, jsonBody, redis, requireWrite, queryParam, DATA_URL, HttpError, KEYS } = require("./_lib");

const MAX_CHARS = 600 * 1024;
const UNSAVED_TTL_SECONDS = 24 * 3600;

// Shared with /api/logo, which serves logos uploaded before /api/image existed.
async function serveImage(res, key) {
  const [dataUrl] = await redis(["GET", key]);
  const match = dataUrl && DATA_URL.exec(dataUrl);
  if (!match) throw new HttpError(404, "That image doesn't exist.");
  res.statusCode = 200;
  res.setHeader("Content-Type", match[1]);
  res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(Buffer.from(match[2], "base64"));
}

function imageId(req) {
  const id = queryParam(req, "id");
  if (!/^[a-f0-9]{24}$/.test(id)) throw new HttpError(400, "That image link isn't valid.");
  return id;
}

module.exports = route({
  GET: async (req, res) => serveImage(res, KEYS.image(imageId(req))),

  POST: async (req, res) => {
    await requireWrite(req);
    const { dataUrl } = jsonBody(req);
    if (typeof dataUrl !== "string" || !DATA_URL.test(dataUrl)) throw new HttpError(400, "Upload a PNG, JPG or WebP image.");
    if (dataUrl.length > MAX_CHARS) throw new HttpError(413, "That image is too large. Use one under 450 KB.");

    const id = crypto.randomBytes(12).toString("hex");
    await redis(["SET", KEYS.image(id), dataUrl, "EX", UNSAVED_TTL_SECONDS]);
    send(res, 200, { url: `/api/image?id=${id}` });
  },
});

module.exports.serveImage = serveImage;
module.exports.imageId = imageId;
