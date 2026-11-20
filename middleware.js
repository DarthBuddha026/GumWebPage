// Vercel Routing Middleware.
// - /api/league and /api/image: fetched from the league's private data source (Vercel env var ADMIN_ORIGIN,
//   never written in this repo), so the browser only ever talks to this site. Read-only: GET, these two paths.
// - /Schedules and /Handbook serve the same index.html as / (see vercel.json), whose og:url is the home page.
//   Facebook sends shared links to og:url, so give each page its own before crawlers read it.
export const config = { matcher: ["/Schedules", "/schedules", "/Handbook", "/handbook", "/api/league", "/api/image"], runtime: "nodejs" };

const HOME_URL_TAG = '<meta property="og:url" content="https://gumverse.gg/">';
// Only these response headers are passed on, so nothing about the source leaks through.
const PASS_HEADERS = ["content-type", "cache-control", "x-content-type-options"];

export default async function middleware(request) {
  const { pathname, search } = new URL(request.url);

  if (pathname.startsWith("/api/")) {
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET" } });
    if (!process.env.ADMIN_ORIGIN) return new Response("League data is not configured.", { status: 503 });
    try {
      const res = await fetch(new URL(pathname + search, process.env.ADMIN_ORIGIN));
      const headers = new Headers();
      PASS_HEADERS.forEach((h) => res.headers.has(h) && headers.set(h, res.headers.get(h)));
      return new Response(res.body, { status: res.status, headers });
    } catch {
      return new Response("League data is unavailable.", { status: 502 });
    }
  }

  const res = await fetch(new URL("/index.html", request.url));
  if (!res.ok) return; // fall through to the normal vercel.json rewrite
  const html = (await res.text()).replace(HOME_URL_TAG, `<meta property="og:url" content="https://gumverse.gg/${/handbook/i.test(pathname) ? "Handbook" : "Schedules"}">`);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
  });
}
