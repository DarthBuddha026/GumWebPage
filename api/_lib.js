// Shared helpers for the admin API: Upstash Redis over REST, organizer accounts and
// sessions, the activity log, request handling and data validation.
// Files starting with "_" are not routes.

const crypto = require("crypto");

const KEYS = {
  guilds: "gw:guilds",
  players: "gw:players",
  season: "gw:season",
  accounts: "gw:accounts",
  audit: "gw:audit",
  result: (matchId) => `gw:result:${matchId}`,
  image: (id) => `gw:image:${id}`,
  legacyLogo: (id) => `gw:logo:${id}`,
};

// Keep in sync with finishPoints / pointsToWin in js/data.js.
const FINISH_POINTS = { spin: 1, over: 2, burst: 2, extreme: 3 };
const POINTS_TO_WIN = 4;

const SESSION_COOKIE = "gw_admin";
const SESSION_HOURS = 12;
const MAX_LOGIN_FAILURES = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const AUDIT_LENGTH = 500;
const MIN_PASSWORD = 10;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Upstash Redis (REST). The Vercel Marketplace integration sets KV_REST_API_*;
// a direct Upstash setup uses UPSTASH_REDIS_REST_*.
// ---------------------------------------------------------------------------

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

// Runs one or more Redis commands in a single round trip and returns their results.
async function redis(...commands) {
  if (!commands.length) return [];
  const config = redisConfig();
  if (!config) throw new HttpError(503, "The league database isn't connected yet. Add Upstash Redis to the Vercel project.");
  const res = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new HttpError(502, `The league database returned an error (${res.status}).`);
  const replies = await res.json();
  return replies.map((r) => {
    if (r.error) throw new HttpError(502, `The league database returned an error: ${r.error}`);
    return r.result;
  });
}

const parse = (raw, fallback) => (raw ? JSON.parse(raw) : fallback);

// Versioned JSON documents. `empty` is returned (with version 0) when the key is unset.
async function readDoc(key, empty) {
  const [raw] = await redis(["GET", key]);
  return parse(raw, { version: 0, ...empty });
}

function checkVersion(current, baseVersion, what) {
  if (Number(baseVersion) !== Number(current.version || 0)) {
    throw new HttpError(409, `Someone else changed ${what} since you opened it. Reload to get the latest, then make your change again.`);
  }
}

// ---------------------------------------------------------------------------
// Passwords (scrypt) and accounts
// ---------------------------------------------------------------------------

const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest();

function hashPassword(password, salt = crypto.randomBytes(16).toString("base64")) {
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash);
  const b = Buffer.from(user.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setupKeyMatches(input) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new HttpError(503, "ADMIN_PASSWORD isn't set in the Vercel project yet.");
  return crypto.timingSafeEqual(sha256(input), sha256(expected));
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    throw new HttpError(400, `Use a password of at least ${MIN_PASSWORD} characters.`);
  }
  if (password.length > 200) throw new HttpError(400, "That password is too long.");
}

function cleanUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,24}$/.test(username)) {
    throw new HttpError(400, "Usernames are 3–24 characters: letters, numbers, - and _.");
  }
  return username;
}

function cleanDisplayName(value, fallback) {
  const name = String(value || "").trim().slice(0, 40);
  return name || fallback;
}

const readAccounts = () => readDoc(KEYS.accounts, { users: [] });

// What the browser may see about a user.
const publicUser = (u) => ({
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  mustChangePassword: Boolean(u.mustChangePassword),
  createdAt: u.createdAt,
});

// ---------------------------------------------------------------------------
// Sessions: a signed, expiring HttpOnly cookie naming the user and their
// sessionVersion. Bumping sessionVersion (remove, reset) signs that user out.
// ---------------------------------------------------------------------------

function sessionKey() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new HttpError(503, "ADMIN_PASSWORD isn't set in the Vercel project yet.");
  return sha256(`gw-session:${process.env.ADMIN_SESSION_SECRET || ""}:${password}`);
}

const sign = (payload) => crypto.createHmac("sha256", sessionKey()).update(payload).digest("base64url");

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sessionCookie(value, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function startSession(res, user) {
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = `${user.username}.${user.sessionVersion || 0}.${expires}`;
  res.setHeader("Set-Cookie", sessionCookie(`${payload}.${sign(payload)}`, SESSION_HOURS * 3600));
}

function endSession(res) {
  res.setHeader("Set-Cookie", sessionCookie("", 0));
}

// Returns the signed-in user (from the accounts document), or null.
async function currentUser(req, accounts) {
  if (!process.env.ADMIN_PASSWORD) return null;
  const parts = readCookie(req, SESSION_COOKIE).split(".");
  if (parts.length !== 4) return null;
  const [username, sessionVersion, expires, signature] = parts;
  if (Number(expires) < Date.now()) return null;
  const expected = Buffer.from(sign(`${username}.${sessionVersion}.${expires}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

  const doc = accounts || (await readAccounts());
  const user = doc.users.find((u) => u.username === username);
  if (!user || String(user.sessionVersion || 0) !== sessionVersion) return null;
  return user;
}

// Guards a write: same-origin JSON from a signed-in user with the needed role.
// Returns the user. Users with a temporary password may only change it.
async function requireWrite(req, { role = "organizer", allowTemporaryPassword = false } = {}) {
  const type = String(req.headers["content-type"] || "");
  if (!type.startsWith("application/json")) throw new HttpError(415, "Send the request as JSON.");
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, "This request came from another site.");
  return requireUser(req, { role, allowTemporaryPassword });
}

async function requireUser(req, { role = "organizer", allowTemporaryPassword = false } = {}) {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, "Your session has ended. Sign in again.");
  if (user.mustChangePassword && !allowTemporaryPassword) throw new HttpError(403, "Change your temporary password first.");
  if (role === "owner" && user.role !== "owner") throw new HttpError(403, "Only the owner can do that.");
  return user;
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

// Returns Redis commands that record an action; add them to the same pipeline as the write.
function auditCommands(user, action, detail = "") {
  const entry = { at: new Date().toISOString(), by: user ? user.displayName || user.username : "system", action, detail: String(detail).slice(0, 300) };
  return [["LPUSH", KEYS.audit, JSON.stringify(entry)], ["LTRIM", KEYS.audit, 0, AUDIT_LENGTH - 1]];
}

// ---------------------------------------------------------------------------
// Login lockout (per IP and per username)
// ---------------------------------------------------------------------------

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

const failKeys = (req, username) => [`gw:login-fail:ip:${clientIp(req)}`, ...(username ? [`gw:login-fail:user:${username}`] : [])];

async function assertNotLockedOut(req, username) {
  const counts = await redis(...failKeys(req, username).map((k) => ["GET", k]));
  if (counts.some((n) => Number(n) >= MAX_LOGIN_FAILURES)) {
    throw new HttpError(429, "Too many wrong attempts. Wait 15 minutes, then try again.");
  }
}

async function recordFailure(req, username) {
  await redis(...failKeys(req, username).flatMap((k) => [["INCR", k], ["EXPIRE", k, LOGIN_WINDOW_SECONDS, "NX"]]));
}

async function clearFailures(req, username) {
  await redis(["DEL", ...failKeys(req, username)]);
}

// ---------------------------------------------------------------------------
// Requests and responses
// ---------------------------------------------------------------------------

function jsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    throw new HttpError(400, "The request body isn't valid JSON.");
  }
}

function send(res, status, body, cacheControl = "no-store") {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.end(JSON.stringify(body));
}

// Wraps a handler so thrown HttpErrors become JSON error responses.
function route(methods) {
  return async (req, res) => {
    const handler = methods[req.method];
    if (!handler) {
      res.setHeader("Allow", Object.keys(methods).join(", "));
      return send(res, 405, { error: `${req.method} isn't supported here.` });
    }
    try {
      await handler(req, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      send(res, status, { error: status === 500 ? "Something went wrong on the server. Try again." : err.message });
    }
  };
}

const queryParam = (req, name) => String(req.query?.[name] ?? new URL(req.url, "http://x").searchParams.get(name) ?? "");

// ---------------------------------------------------------------------------
// Images (guild logos, blader photos). Stored as data URLs; referenced as
// /api/image?id=… (or the older /api/logo?id=…).
// ---------------------------------------------------------------------------

const IMAGE_URL = /^\/api\/(image|logo)\?id=([a-f0-9]{24})$/;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/;
const IMAGE_PATH = /^(images|assets)\/[\w\-/]+\.(png|jpe?g|webp|gif)$/i;

function imageKeyFromUrl(url) {
  const m = IMAGE_URL.exec(url || "");
  if (!m) return null;
  return m[1] === "logo" ? KEYS.legacyLogo(m[2]) : KEYS.image(m[2]);
}

function cleanImageRef(value, label) {
  const ref = String(value || "").trim();
  const ok = !ref || IMAGE_URL.test(ref) || (IMAGE_PATH.test(ref) && !ref.includes("..")) || (/^https:\/\/[^\s"'<>]+$/.test(ref) && ref.length <= 500);
  if (!ok) throw new HttpError(400, `${label}: the image must be an uploaded picture, an images/ path or an https link.`);
  return ref;
}

// Commands that keep images still in use and delete ones no longer referenced.
function imageCommands(oldRefs, newRefs) {
  const keep = new Set(newRefs.map(imageKeyFromUrl).filter(Boolean));
  const dropped = [...new Set(oldRefs.map(imageKeyFromUrl).filter((k) => k && !keep.has(k)))];
  return [...[...keep].map((k) => ["PERSIST", k]), ...(dropped.length ? [["DEL", ...dropped]] : [])];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;

function text(value, max, label, owner) {
  const s = String(value ?? "").trim();
  if (s.length > max) throw new HttpError(400, `${owner}: ${label} must be ${max} characters or fewer.`);
  return s;
}

function uniqueBy(items, keyFn, message) {
  const seen = new Set();
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) throw new HttpError(400, message(item));
    seen.add(key);
  }
}

// ----- Guilds -----

function cleanGuild(input, index) {
  if (!input || typeof input !== "object") throw new HttpError(400, `Guild ${index + 1} is missing.`);
  const name = text(input.name, 40, "the name", `Guild ${index + 1}`);
  if (!name) throw new HttpError(400, `Guild ${index + 1} needs a name.`);

  const bracket = String(input.bracket || "A").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,3}$/.test(bracket)) throw new HttpError(400, `${name}: the bracket must be 1–3 letters or numbers.`);

  const colors = (Array.isArray(input.colors) ? input.colors : []).map((c) => String(c).trim()).filter(Boolean).slice(0, 2);
  if (!colors.length || !colors.every((c) => HEX.test(c))) throw new HttpError(400, `${name}: colours must be hex codes like #1E4FB8.`);

  const hasLat = input.lat !== null && input.lat !== undefined && input.lat !== "";
  const hasLng = input.lng !== null && input.lng !== undefined && input.lng !== "";
  if (hasLat !== hasLng) throw new HttpError(400, `${name}: give both latitude and longitude, or neither.`);
  let lat = null;
  let lng = null;
  if (hasLat) {
    lat = Number(input.lat);
    lng = Number(input.lng);
    if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) throw new HttpError(400, `${name}: the map location isn't a valid latitude and longitude.`);
    lat = Math.round(lat * 1e6) / 1e6;
    lng = Math.round(lng * 1e6) / 1e6;
  }

  return {
    name,
    colors,
    bracket,
    location: text(input.location, 60, "the city", name),
    address: text(input.address, 160, "the address", name),
    lat,
    lng,
    logo: cleanImageRef(input.logo, name),
  };
}

function cleanGuilds(list) {
  if (!Array.isArray(list)) throw new HttpError(400, "Send the guilds as a list.");
  if (list.length > 60) throw new HttpError(400, "There can be at most 60 guilds.");
  const guilds = list.map(cleanGuild);
  uniqueBy(guilds, (g) => g.name.toLowerCase(), (g) => `Two guilds are named "${g.name}". Guild names must be unique.`);
  return guilds;
}

// ----- Bladers -----

function cleanPlayer(input, index, guildNames) {
  if (!input || typeof input !== "object") throw new HttpError(400, `Blader ${index + 1} is missing.`);
  const name = text(input.name, 40, "the name", `Blader ${index + 1}`);
  if (!name) throw new HttpError(400, `Blader ${index + 1} needs a name.`);
  const key = String(input.key || "").trim().toUpperCase();
  if (!/^GW-\d{4,6}$/.test(key)) throw new HttpError(400, `${name}: the blader ID must look like GW-0001.`);
  const team = String(input.team || "").trim();
  if (!guildNames.has(team)) throw new HttpError(400, `${name}: choose a guild that exists.`);
  const beys = Number(input.beys ?? 0);
  if (!Number.isInteger(beys) || beys < 0 || beys > 999) throw new HttpError(400, `${name}: beys used must be a whole number from 0 to 999.`);
  const achievements = (Array.isArray(input.achievements) ? input.achievements : [])
    .map((a) => text(a, 60, "each achievement", name))
    .filter(Boolean)
    .slice(0, 10);
  return { key, name, team, photo: cleanImageRef(input.photo, name), beys, achievements, active: input.active !== false };
}

function cleanPlayers(list, guildNames) {
  if (!Array.isArray(list)) throw new HttpError(400, "Send the bladers as a list.");
  if (list.length > 600) throw new HttpError(400, "There can be at most 600 bladers.");
  const players = list.map((p, i) => cleanPlayer(p, i, guildNames));
  uniqueBy(players, (p) => p.key, (p) => `Two bladers share the ID ${p.key}.`);
  uniqueBy(players, (p) => p.name.toLowerCase(), (p) => `Two bladers are named "${p.name}". Blader names must be unique.`);
  return players;
}

// ----- Season (weeks and fixtures) -----

function cleanSeason(input, guildNames) {
  if (!input || typeof input !== "object") throw new HttpError(400, "Send the season details.");
  const number = Number(input.season?.number ?? 1);
  if (!Number.isInteger(number) || number < 1 || number > 99) throw new HttpError(400, "The season number must be from 1 to 99.");
  const season = { number, venue: text(input.season?.venue, 120, "the venue", "Season") };

  const weeksIn = Array.isArray(input.weeks) ? input.weeks : [];
  if (weeksIn.length > 60) throw new HttpError(400, "There can be at most 60 weeks.");
  const weeks = weeksIn.map((w, i) => {
    const id = String(w?.id || "");
    if (!/^w[a-z0-9]{1,16}$/.test(id)) throw new HttpError(400, `Week ${i + 1} has an invalid ID.`);
    const label = text(w.label, 24, "the name", `Week ${i + 1}`);
    if (!label) throw new HttpError(400, `Week ${i + 1} needs a name.`);
    const date = String(w.date || "").trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, `${label}: the date must look like 2026-10-18.`);
    return { id, label, date };
  });
  uniqueBy(weeks, (w) => w.id, () => "Two weeks share an ID.");
  uniqueBy(weeks, (w) => w.label.toLowerCase(), (w) => `Two weeks are named "${w.label}".`);
  const weekIds = new Set(weeks.map((w) => w.id));

  const matchesIn = Array.isArray(input.matches) ? input.matches : [];
  if (matchesIn.length > 500) throw new HttpError(400, "There can be at most 500 fixtures.");
  const matches = matchesIn.map((m, i) => {
    const id = String(m?.id || "");
    if (!/^m[a-z0-9]{1,16}$/.test(id)) throw new HttpError(400, `Fixture ${i + 1} has an invalid ID.`);
    if (!weekIds.has(m.weekId)) throw new HttpError(400, `Fixture ${i + 1} is in a week that doesn't exist.`);
    const team1 = String(m.team1 || "");
    const team2 = String(m.team2 || "");
    if (!guildNames.has(team1) || !guildNames.has(team2)) throw new HttpError(400, `Fixture ${i + 1} uses a guild that doesn't exist.`);
    if (team1 === team2) throw new HttpError(400, `Fixture ${i + 1}: a guild can't play itself.`);
    return { id, weekId: m.weekId, team1, team2 };
  });
  uniqueBy(matches, (m) => m.id, () => "Two fixtures share an ID.");

  return { season, weeks, matches };
}

// ----- Results -----

// Validates a match result against the fixture and the guild rosters, and
// computes each battle's points from its rounds.
function cleanResult(input, match, players) {
  const status = input.status;
  if (status === "default") {
    const winner = Number(input.defaultWinner);
    if (winner !== 1 && winner !== 2) throw new HttpError(400, "Choose which guild wins by default.");
    return { status: "default", defaultWinner: winner, bouts: [] };
  }

  const roster = (team) => new Set(players.filter((p) => p.team === team).map((p) => p.key));
  const roster1 = roster(match.team1);
  const roster2 = roster(match.team2);
  const boutsIn = Array.isArray(input.bouts) ? input.bouts : [];
  if (!boutsIn.length) throw new HttpError(400, "Add at least one battle.");
  if (boutsIn.length > 9) throw new HttpError(400, "A match can have at most 9 battles.");

  const bouts = boutsIn.map((b, i) => {
    const label = `Battle ${i + 1}`;
    const p1 = String(b?.p1 || "");
    const p2 = String(b?.p2 || "");
    if (p1 && !roster1.has(p1)) throw new HttpError(400, `${label}: the first blader isn't on ${match.team1}.`);
    if (p2 && !roster2.has(p2)) throw new HttpError(400, `${label}: the second blader isn't on ${match.team2}.`);
    const roundsIn = Array.isArray(b?.rounds) ? b.rounds : [];
    if (roundsIn.length && (!p1 || !p2)) throw new HttpError(400, `${label}: choose both bladers before adding rounds.`);

    let p1Pts = 0;
    let p2Pts = 0;
    const rounds = roundsIn.map((r, j) => {
      if (p1Pts >= POINTS_TO_WIN || p2Pts >= POINTS_TO_WIN) throw new HttpError(400, `${label}: round ${j + 1} comes after the battle was already won.`);
      const winner = Number(r?.winner);
      const finish = String(r?.finish || "");
      if (winner !== 1 && winner !== 2) throw new HttpError(400, `${label}, round ${j + 1}: choose who won.`);
      if (!(finish in FINISH_POINTS)) throw new HttpError(400, `${label}, round ${j + 1}: choose how the round was won.`);
      if (winner === 1) p1Pts += FINISH_POINTS[finish];
      else p2Pts += FINISH_POINTS[finish];
      return { winner, finish };
    });
    const complete = p1Pts >= POINTS_TO_WIN || p2Pts >= POINTS_TO_WIN;
    return { p1, p2, p1Pts, p2Pts, rounds, complete };
  });

  const final = bouts.every((b) => b.complete);
  return { status: final ? "final" : "live", defaultWinner: null, bouts };
}

module.exports = {
  KEYS,
  FINISH_POINTS,
  POINTS_TO_WIN,
  HttpError,
  redis,
  redisConfig,
  readDoc,
  checkVersion,
  hashPassword,
  verifyPassword,
  setupKeyMatches,
  validatePassword,
  cleanUsername,
  cleanDisplayName,
  readAccounts,
  publicUser,
  startSession,
  endSession,
  currentUser,
  requireWrite,
  requireUser,
  auditCommands,
  clientIp,
  assertNotLockedOut,
  recordFailure,
  clearFailures,
  jsonBody,
  send,
  route,
  queryParam,
  DATA_URL,
  imageKeyFromUrl,
  imageCommands,
  cleanGuilds,
  cleanPlayers,
  cleanSeason,
  cleanResult,
};
