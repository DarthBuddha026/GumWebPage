// Local preview: `node dev.mjs` (http://localhost:5500). Serves the files like Vercel does and runs
// middleware.js for its paths, so /api/league works. ADMIN_ORIGIN comes from the environment or a
// gitignored .env.local (one line: ADMIN_ORIGIN=https://…).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import middleware, { config } from "./middleware.js";

try { process.loadEnvFile(".env.local"); } catch {}
const PORT = Number(process.env.PORT) || 5500;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (config.matcher.includes(url.pathname)) {
    const out = await middleware(new Request(url, { method: req.method }));
    if (out) {
      res.writeHead(out.status, Object.fromEntries(out.headers));
      return res.end(Buffer.from(await out.arrayBuffer()));
    }
  }
  let file = path.join(process.cwd(), decodeURIComponent(url.pathname));
  if (!file.startsWith(process.cwd()) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(process.cwd(), "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}${process.env.ADMIN_ORIGIN ? "" : "  (ADMIN_ORIGIN is not set: league data won't load)"}`));
