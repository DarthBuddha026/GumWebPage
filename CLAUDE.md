# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GUM Guild Wars: a static, installable (PWA) dashboard for a Beyblade league. It shows standings, MVP rankings, finish stats, a battle log and a guild territory map. It uses plain HTML/CSS/vanilla JS with no build step, no package manager and no tests. It deploys to Vercel as a static site (`.vercel` is gitignored).

The league admin (organizer login, guild/blader editing, schedule, score entry) and its `/api` used to live here. It now has its own repository and Vercel deployment, `GUM-GuildWars-Admin`. This repo only *reads* from it.

## Running locally

Serve the folder over HTTP rather than opening `index.html` as a `file://`. The service worker only registers on `http(s)`, and `fetch` needs a real origin:

```
npx serve .        # or: python -m http.server 8000
```

Third-party libraries load from CDNs: Leaflet and markercluster (unpkg/cdnjs), Font Awesome, Google Fonts, and html2canvas, which is fetched lazily the first time a profile is shared.

## Architecture

The scripts load in order with `defer`. Each file is an IIFE that communicates through `window` globals:

- **`js/data.js`** holds `window.LEAGUE_CONFIG`, which is all the site configuration: branding, the guild list with colors, map coordinates and brackets, scoring rules (`finishPoints`, `pointsToWin`), eligibility thresholds (`minGames`, `eligibilityAttendance`) and the data source URLs. It also defines `window.generateMockData()`, a deterministic seeded generator for sample data, and `window.leagueTools.roundRobin`.
- **`js/app.js`** contains all the app logic in one closure, built around a single `state` object. Its pipeline is `init → loadData → applyBranding → buildModel → renderDashboard`.

### Data sources (`loadData` in app.js)

`loadData` checks these in priority order:
1. `CFG.dataUrl`: if set, it fetches a raw dataset that has the same shape as `generateMockData()`'s return value.
2. `CFG.leagueUrl` (the admin's `/api/league`): fetched with a 5s timeout. Guilds from this source replace `CFG.teams`. `leagueToRaw()` converts the admin's `{season, results, guilds, players}` into the raw shape. Only matches with `status: "final"` (bouts) or `"default"` (forfeit winner) count. Image refs that start with `/api/` are rewritten to absolute URLs on the admin's domain.
3. Fallback: `generateMockData()`. The raw data then has `mock: true`, which adds the `mock-mode` body class and shows the "Sample data" ticker.

The **raw shape** that every source must produce is `{ mock, updatedAt, weeks: [{label, date, progress}], teams, players, matches: [{id, week, bracket, team1, team2, bouts: [{p1, p2, p1Pts, p2Pts, rounds: [{winner, finish}]}], defaultWinner?}] }`. `buildModel()` derives all stats from this shape: per-player `overall`/`weekly` stat lines, MVP score, qualification, and team records. Anything you change in the shape has to be reflected in all three producers.

### Domain rules (in app.js)
- The finish types are `spin` (shown as "Stamina"), `over`, `burst` and `extreme`. The `FINISHES` map at the top of app.js and the `--f-*` CSS variables must stay in sync with `CFG.finishPoints`.
- To be ranked, a player needs `minGames` games **and** attendance of at least `eligibilityAttendance` of their guild's matches.
- Player ordering (`leagueSort`) is MVP score, then win rate, then point diff. Guild ordering (`teamSort`) is match wins, then win rate, then set diff, then point diff.
- When only one bracket is configured, bracket labels and filters are hidden (`SINGLE_BRACKET`).

### UI conventions
- `index.html` holds the static skeleton plus empty containers (by `id`) that app.js fills with template strings. Always pass interpolated data through `esc()`.
- Elements with `data-bind="..."` get their text from config in `applyBranding()`. Clicks are delegated through `data-action="..."` attributes in `bindEvents()`. Modals use `data-modal` / `data-close`.
- The search modal is a view stack (`state.search.stack`) that goes search → roster → profile.

### Service worker
`sw.js` is network-first and caches only same-origin files. League API data is never cached. **When you change the `SHELL` file list or need clients to refresh their cached assets, bump the `CACHE` version string** (for example `gum-guild-wars-v5` → `v6`).
