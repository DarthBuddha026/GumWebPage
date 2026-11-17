// Vercel Routing Middleware, scoped to /Schedules and /Handbook.
// They serve the same index.html as / (see vercel.json), whose og:url is the home page.
// Facebook sends shared links to og:url, so give each page its own before crawlers read it.
export const config = { matcher: ["/Schedules", "/schedules", "/Handbook", "/handbook"], runtime: "nodejs" };

const HOME_URL_TAG = '<meta property="og:url" content="https://gumverse.gg/">';

export default async function middleware(request) {
  const res = await fetch(new URL("/index.html", request.url));
  if (!res.ok) return; // fall through to the normal vercel.json rewrite
  const html = (await res.text()).replace(HOME_URL_TAG, `<meta property="og:url" content="https://gumverse.gg/${/handbook/i.test(new URL(request.url).pathname) ? "Handbook" : "Schedules"}">`);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
  });
}
