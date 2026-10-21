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

- **`js/data.js`** holds `window.LEAGUE_CONFIG`: branding, bracket links, scoring rules (`finishPoints`, `pointsToWin`), eligibility thresholds (`minGames`, `eligibilityAttendance`), the map's default view and `leagueUrl`. It holds no league data.
- **`js/app.js`** contains all the app logic in one closure, built around a single `state` object. Its pipeline is `init → loadData → applyBranding → buildModel → renderDashboard`.

### Data source

All league data (guilds, bladers, the schedule and results) comes from the admin's `/api/league` (`CFG.leagueUrl`). The site has no sample or fallback data. `fetchLeague()` tries twice with a 10s timeout each; if both fail, a full-screen error replaces the page. While loading, the containers in `index.html` show `.skel` skeleton placeholders that the renders overwrite. The API sends `Access-Control-Allow-Origin: *`, so opening `index.html` from disk also works for a quick check.

`leagueToRaw()` converts the admin's `{season, results, guilds, players}` into the raw shape that `buildModel()` uses. Only matches with `status: "final"` (bouts) or `"default"` (forfeit winner) count. Image refs that start with `/api/` are rewritten to absolute URLs on the admin's domain.

The **raw shape** is `{ updatedAt, weeks: [{label, date, progress}], teams, players, matches: [{id, week, bracket, team1, team2, bouts: [{p1, p2, p1Pts, p2Pts, rounds: [{winner, finish}]}], defaultWinner?}] }`. `buildModel()` derives all stats from it: per-player `overall`/`weekly` stat lines, MVP score, qualification, and team records. Every render function has to cope with an empty season (guilds but no bladers, weeks or matches).

### Guild EXP
The scoring follows the GGW2 handbook, and its values live in `data.js` (`eventExp`, `shopExp`, `playerAchievements`, `siegeSkillExp`, `skillExpMax`), which the admin also loads, so both sites always agree. The league response carries `exp`: the required Guild EXP (`cap`), up to 3 guild skills, Weekly Pod / Grand Raid `events` (each blader's entries, Swiss, Champion and Top Cut defeats, with roles recorded on the event date), `playerAchievements` (`{ achievementId: [bladerKey] }`), shop `purchases` and `quests`, all edited in the admin's Guild EXP tab. **Guild EXP** only goes up and has no limit (the bar is full at `cap`): events (Grand Raids pay double), player achievements and shop receipts, credited to the blader's current guild. **Guild Skill EXP** comes only from siege results, one result at a time in play order, clamped to 0..`skillExpMax`; a skill is unlocked only while Skill EXP is at or above its threshold. The fixture's first guild attacks; `target` fixtures pay Successful Target instead of Attack Win. `leagueTools.guildExp()` in `data.js` does the maths; its self-check is `node test/guild-exp.js`. `guildExpBlock()` in app.js draws both bars on the guild profile.

**Guild Quest badges** are defined in `CFG.guildQuests` (data.js; the admin reads the same list). The admin stores which guilds completed each quest in `exp.quests` (`{ questId: [guildName] }`), and `guildQuestBlock()` shows them under the roster as locked or unlocked. Keep quest `id`s stable when editing the text.

### Domain rules (in app.js)
- The finish types are `spin` (shown as "Stamina"), `over`, `burst` and `extreme`. The `FINISHES` map at the top of app.js and the `--f-*` CSS variables must stay in sync with `CFG.finishPoints`.
- To be ranked, a player needs `minGames` games **and** attendance of at least `eligibilityAttendance` of their guild's matches.
- Player ordering (`leagueSort`) is MVP score, then win rate, then point diff. Guild ordering (`teamSort`) is match wins, then win rate, then set diff, then point diff.
- When only one bracket is configured, bracket labels and filters are hidden (`SINGLE_BRACKET`).

### UI conventions
- `index.html` holds the static skeleton plus empty containers (by `id`) that app.js fills with template strings. Always pass interpolated data through `esc()`.
- Elements with `data-bind="..."` get their text from config in `applyBranding()`. Clicks are delegated through `data-action="..."` attributes in `bindEvents()`. Modals use `data-modal` / `data-close`.
- The search modal is a view stack (`state.search.stack`) that goes search → roster → profile.

### Themes
Dark is the default; light is opt-in and saved in `localStorage.theme`. An inline script in `index.html` sets `<html data-theme>` before paint, and the light theme is only a `:root[data-theme="light"]` block that overrides the palette variables, plus a few `[data-theme="light"]` fixes (header, map tiles, overlays, glows). Use the variables (and `rgba(var(--bone-rgb), x)` for faint fills) instead of fixed colours, and avoid `color-mix()` in anything html2canvas captures, because it can't parse it. The nav toggle runs `toggleTheme()`, a View Transitions clip-path wipe with a glowing `.theme-wipe-line` on its own transition layer (moved with `left`, not `transform`, so it stays on the wipe edge). Share images are always rendered dark. The admin shares `styles.css` but never sets `data-theme`, so it stays dark.

### Service worker
`sw.js` is network-first and caches only same-origin files. League API data is never cached. **When you change the `SHELL` file list or need clients to refresh their cached assets, bump the `CACHE` version string** (for example `gum-guild-wars-v5` → `v6`).
