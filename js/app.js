/* ==========================================================================
   GUM Guild Wars — application logic
   ========================================================================== */

(function () {
  "use strict";

  const CFG = window.LEAGUE_CONFIG;
  const BRACKETS = Object.keys(CFG.brackets);
  // With one bracket, bracket labels and filters add nothing.
  const SINGLE_BRACKET = BRACKETS.length === 1;
  const inBracket = (b) => (SINGLE_BRACKET ? "" : `, bracket ${esc(b)}`);
  const FINISHES = {
    spin: { label: "Stamina", long: "Stamina finish", color: "var(--f-spin)" },
    over: { label: "Over", long: "Over finish", color: "var(--f-over)" },
    burst: { label: "Burst", long: "Burst finish", color: "var(--f-burst)" },
    extreme: { label: "Extreme", long: "Extreme finish", color: "var(--f-extreme)" },
  };

  // Guild roles set in the admin (`guildRole` on each blader). Each guild has at most one
  // Guild Leader and one Battle Master; everyone else is a member and shows no role tag.
  const GUILD_ROLES = {
    leader: { label: "Guild Leader", icon: "fa-chess-king" },
    "battle-master": { label: "Battle Master", icon: "fa-shield-halved" },
  };
  const roleOrder = (p) => (p.guildRole in GUILD_ROLES ? Object.keys(GUILD_ROLES).indexOf(p.guildRole) : Infinity);

  const state = {
    raw: null,
    players: [],
    playersByKey: new Map(),
    teams: [],
    teamsByName: new Map(),
    league: [], // qualified bladers sorted by MVP tie-break
    currentWeek: null,
    finish: "spin",
    search: { tab: "team", bracket: "ALL", stack: [] },
    history: { bracket: "ALL" },
    map: null,
    shareBlob: null,
  };

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  const fmt2 = (n) => (Number(n) || 0).toFixed(2);
  const pct = (n, digits = 0) => `${((Number(n) || 0) * 100).toFixed(digits)}%`;
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
  const signClass = (n) => (n > 0 ? "gain" : n < 0 ? "loss" : "");
  const record = (w, l) => `${w}–${l}`;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  function initials(name) {
    const parts = String(name).replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
  }

  function hash(text) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  // Photos are uploaded by organizers in the league admin (CFG.leagueUrl).
  const playerPhoto = (p) => p.photo || "";

  // Guild colours from the data: `colors: [fill, border]` (border defaults to the fill).
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

  function inkFor(hex) {
    const h = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : hex;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.55 ? "#000" : "#fff";
  }

  function guildStyle(teamName, prefix) {
    const team = state.teamsByName.get(teamName);
    const [fill, line] = ((team && team.colors) || []).filter((c) => HEX.test(c));
    if (!fill) return "";
    return `--${prefix}-bg:${fill};--${prefix}-line:${line || fill};--${prefix}-ink:${inkFor(fill)}`;
  }

  // Images uploaded in the admin are loaded with CORS so profile cards can draw them onto a canvas.
  const ADMIN_ORIGIN = CFG.leagueUrl ? new URL(CFG.leagueUrl).origin : null;
  const imgTag = (src, attrs = "") =>
    `<img src="${esc(src)}" alt=""${ADMIN_ORIGIN && src.startsWith(`${ADMIN_ORIGIN}/`) ? ' crossorigin="anonymous"' : ""}${attrs}>`;

  function avatarHtml(label, photo = "", teamName = "") {
    const style = guildStyle(teamName, "av");
    const tone = style ? "guild" : hash(label) % 2 ? "pink" : "";
    const inner = photo ? imgTag(photo) : esc(initials(label));
    return `<span class="avatar ${tone}" ${style ? `style="${style}"` : ""} aria-hidden="true">${inner}</span>`;
  }

  const playerAvatar = (p) => avatarHtml(p.name, playerPhoto(p), p.team);
  const teamAvatar = (t) => avatarHtml(t.name, t.logo, t.name);
  const bracketBadge = (b) => (SINGLE_BRACKET ? "" : `<span class="bracket-badge" title="Bracket ${esc(b)}">${esc(b)}</span>`);

  function portraitHtml(p, extra = "") {
    const photo = playerPhoto(p);
    return `<div class="portrait">${extra}${photo ? imgTag(photo) : esc(initials(p.name))}</div>`;
  }

  function meter(value, { color, segmented = false, cls = "" } = {}) {
    const w = Math.min(Math.max(value, 0), 1) * 100;
    return `<div class="meter ${segmented ? "segmented" : ""} ${cls}" style="--meter:${color || "var(--teal)"}"><span data-width="${w}"></span></div>`;
  }

  function animateMeters(root) {
    requestAnimationFrame(() => $$(".meter > span[data-width]", root).forEach((el) => (el.style.width = `${el.dataset.width}%`)));
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  const shortDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const longDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  // ---------------------------------------------------------------------------
  // Data loading + stat computation
  // ---------------------------------------------------------------------------

  async function loadData() {
    return leagueToRaw(await fetchLeague());
  }

  // Everything saved in the league admin (CFG.leagueUrl). Retries once, since the
  // admin's API can be slow or briefly unavailable on a cold start.
  async function fetchLeague() {
    if (!CFG.leagueUrl) throw new Error("No league data source is set. Add leagueUrl in js/data.js.");
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(CFG.leagueUrl, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`The league data request failed with status ${res.status}.`);
        const league = await res.json();
        // Uploaded logos and photos are /api/image paths on the admin's deployment. The
        // `cors` param gives them a new URL, so browsers don't reuse copies cached before
        // the admin sent CORS headers (images are cached as immutable for a year).
        const fromAdmin = (ref) => {
          if (!ref || !ref.startsWith("/api/")) return ref;
          const url = new URL(ref, CFG.leagueUrl);
          url.searchParams.set("cors", "1");
          return url.href;
        };
        league.guilds = (league.guilds || []).map((g) => ({ ...g, logo: fromAdmin(g.logo) }));
        league.players = (league.players || []).map((p) => ({ ...p, photo: fromAdmin(p.photo) }));
        league.season = { weeks: [], matches: [], ...league.season };
        league.results = league.results || {};
        return league;
      } catch (err) {
        lastError = err.name === "AbortError" ? new Error("The league data took too long to load.") : err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`${lastError.message} Please try again in a moment.`);
  }

  // Converts the admin's data into the shape buildModel() uses. Only finished
  // matches count: battles still in progress don't affect any stats.
  function leagueToRaw(league) {
    const { season, results } = league;
    CFG.season = season.number || CFG.season;
    if (season.venue) CFG.venue = season.venue;

    const bracketOf = new Map(league.guilds.map((t) => [t.name, t.bracket || "A"]));
    const weekLabel = new Map(season.weeks.map((w) => [w.id, w.label]));
    const matches = season.matches.map((m) => {
      const r = results[m.id];
      const base = { id: m.id, weekId: m.weekId, week: weekLabel.get(m.weekId), bracket: bracketOf.get(m.team1) || "A", round: m.round, team1: m.team1, team2: m.team2, target: Boolean(m.target), bouts: [] };
      if (r?.status === "final") base.bouts = r.bouts.map(({ p1, p2, p1Pts, p2Pts, rounds }) => ({ p1, p2, p1Pts, p2Pts, rounds }));
      if (r?.status === "default") base.defaultWinner = r.defaultWinner === 1 ? m.team1 : m.team2;
      return base;
    });

    const weeks = season.weeks
      .map((w, i) => ({ w, i }))
      .sort((a, b) => (a.w.date || "9999").localeCompare(b.w.date || "9999") || a.i - b.i)
      .map(({ w }) => {
        const inWeek = matches.filter((m) => m.week === w.label);
        const done = inWeek.filter((m) => m.bouts.length || m.defaultWinner).length;
        // Weeks without fixtures (openings, raids) are complete once the admin marks them done.
        return { id: w.id, label: w.label, date: w.date, location: w.location || "", progress: inWeek.length ? Math.round((done / inWeek.length) * 100) : w.done ? 100 : 0 };
      });

    return {
      updatedAt: league.updatedAt,
      weeks,
      teams: league.guilds,
      players: league.players.map((p) => ({ ...p, achievements: p.achievements || [] })),
      matches,
      exp: league.exp || {},
    };
  }

  // The standings maths lives in js/data.js (leagueTools), shared with the admin.
  const { leagueSort } = window.leagueTools;

  // The season's own match days (Grand Opening, Grand Raids, Guild Sieges). Other days on the admin's
  // schedule, such as GUM Weekly Pods, stay off the season path and out of "this week".
  const isSeasonDay = (w) => /opening|raid|siege/i.test(w.label);

  function computeCurrentWeek(weeks) {
    const live = weeks.find((w) => w.progress > 0 && w.progress < 100);
    if (live) return live.label;
    const started = weeks.filter((w) => w.progress > 0);
    return (started.at(-1) || weeks[0] || { label: "Week 1" }).label;
  }

  function buildModel(raw) {
    state.raw = raw;
    state.currentWeek = computeCurrentWeek((raw.weeks || []).filter(isSeasonDay));
    // Only Guild Sieges record battles, so the "current" finish table follows the current siege:
    // the one in progress, else the latest played, else the first.
    state.currentSiege = computeCurrentWeek((raw.weeks || []).filter((w) => /siege/i.test(w.label)));

    // Guild records and blader stats: leagueTools.leagueStats in data.js (shared with the admin's Leaderboards tab).
    const { teams, teamsByName, players, playersByKey, league } = window.leagueTools.leagueStats(raw.teams, raw.players, raw.matches, { weekly: state.currentSiege });

    // Guild EXP and Guild Skill EXP (see leagueTools.guildExp in data.js). Siege results count in the order they
    // were played: match day by date, then round, then fixture order.
    const weekOrder = new Map((raw.weeks || []).map((w, i) => [w.id, i]));
    const sieges = raw.matches
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.result)
      .sort((a, b) => (weekOrder.get(a.m.weekId) ?? 1e9) - (weekOrder.get(b.m.weekId) ?? 1e9) || (a.m.round || 0) - (b.m.round || 0) || a.i - b.i)
      .map(({ m }) => ({ winner: m.result.winner, loser: m.result.winner === m.team1 ? m.team2 : m.team1, attacker: m.team1, target: m.target }));
    const exp = window.leagueTools.guildExp(teams.map((t) => t.name), sieges, raw.exp || {}, new Map(players.map((p) => [p.key, p.team])));
    teams.forEach((t) => (t.xp = exp.get(t.name)));
    // GGW2 player achievements each blader has unlocked (shown as cards on their profile, apart from the exclusive badges).
    players.forEach((p) => (p.unlocked = new Set()));
    (CFG.playerAchievements || []).forEach((a) => (raw.exp?.playerAchievements?.[a.id] || []).forEach((k) => playersByKey.get(k)?.unlocked.add(a.id)));
    state.expSkills = (raw.exp?.skills || []).slice().sort((a, b) => a.exp - b.exp);
    // The required Guild EXP: the Guild EXP bar is full here, but guilds keep earning past it.
    state.expCap = raw.exp?.cap || 0;

    state.teams = teams;
    state.teamsByName = teamsByName;
    state.players = players;
    state.playersByKey = playersByKey;
    state.league = league;
    state.league.forEach((p, i) => (p.leagueRank = i + 1));

    BRACKETS.forEach((b) => {
      state.league.filter((p) => p.bracket === b).forEach((p, i) => (p.bracketRank = i + 1));
      state.teams.filter((t) => t.bracket === b).forEach((t, i) => (t.bracketRank = i + 1));
    });

    Object.keys(FINISHES).forEach((f) => {
      const field = `${f}PG`;
      state.league
        .slice()
        .sort((a, b) => b.overall[field] - a.overall[field] || leagueSort(a, b))
        .forEach((p, i) => ((p.finishRanks ||= {})[f] = i + 1));
    });
  }

  // ---------------------------------------------------------------------------
  // Dashboard rendering
  // ---------------------------------------------------------------------------

  function applyBranding() {
    const seasonLabel = `Season ${CFG.season}`;
    document.title = CFG.name;
    $$('[data-bind="seasonLabel"]').forEach((el) => (el.textContent = seasonLabel));
    $$('[data-bind="brandName"]').forEach((el) => (el.textContent = CFG.name));
    $$('[data-bind="venue"]').forEach((el) => (el.textContent = CFG.venue));
    $$('[data-bind="minGames"]').forEach((el) => (el.textContent = CFG.minGames || 1));

    const social = $("#nav-social");
    if (CFG.socialUrl) {
      social.href = CFG.socialUrl;
      social.lastChild.textContent = ` ${CFG.socialLabel || "Social"}`;
    } else {
      social.remove();
    }

    const credits = (CFG.footer.credits || [])
      // Credits without a url are plain text.
      .map((c) => `<span>${esc(c.label)} ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>` : esc(c.name)}</span>`)
      .join("");
    const { copyright, copyrightUrl } = CFG.footer;
    const owner = copyrightUrl ? `<a href="${esc(copyrightUrl)}" target="_blank" rel="noopener">${esc(copyright)}</a>` : esc(copyright);
    $("#footer").innerHTML = `<span>&copy; ${owner}</span>${credits}`;

    $("#finish-pills").innerHTML = Object.entries(FINISHES)
      .map(([f, info]) => `<button class="command-tab" role="tab" data-finish="${f}"><span class="swatch" style="--sw:${info.color}"></span>${esc(info.long)}</button>`)
      .join("");

    const filterPills = ["ALL", ...BRACKETS]
      .map((b) => `<button class="command-tab" data-bracket="${esc(b)}">${b === "ALL" ? "All brackets" : `Bracket ${esc(b)}`}</button>`)
      .join("");
    $("#search-bracket-pills").innerHTML = filterPills;
    $("#history-bracket-pills").innerHTML = filterPills;
    setActiveTab($("#search-bracket-pills"), "ALL");
    setActiveTab($("#history-bracket-pills"), "ALL");
    if (SINGLE_BRACKET) {
      ["#search-bracket-pills", "#history-bracket-pills"].forEach((s) => $(s).classList.add("hidden"));
    }

    $("#bracket-launchers").innerHTML = BRACKETS.map((b) => {
      const { url } = CFG.brackets[b];
      const inner = `
        <span class="letter">${esc(b)}</span>
        <span>
          <span class="name">Bracket ${esc(b)}</span>
          <span class="status">${url ? 'Open live standings <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>' : "Link not added yet"}</span>
        </span>`;
      return url
        ? `<a class="bracket-launch" href="${esc(url)}" target="_blank" rel="noopener">${inner}</a>`
        : `<div class="bracket-launch unavailable">${inner}</div>`;
    }).join("");
  }

  function setActiveTab(container, value) {
    $$(".command-tab", container).forEach((t) => {
      const on = (t.dataset.bracket ?? t.dataset.finish ?? t.dataset.searchTab) === value;
      t.classList.toggle("active", on);
      if (t.getAttribute("role") === "tab") t.setAttribute("aria-selected", on);
    });
  }

  // The schedule page: a one-month calendar (match days marked by kind; the selected day's details show
  // under it), the next Weekly Pod, and the next Guild Siege with its match-ups. Undated days sit under the calendar.
  function renderSchedule() {
    const weeks = state.raw.weeks || [];
    if (!weeks.length) {
      $("#schedule-list").innerHTML = emptyState("fa-calendar", "No schedule yet", "Match days appear here once they're set.");
      return;
    }
    if (!weeks[state.scheduleDay]) state.scheduleDay = null;
    const kind = (w) => (/siege/i.test(w.label) ? "siege" : /raid/i.test(w.label) ? "raid" : "event");
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = iso(new Date());
    // Philippine holidays from CFG.holidays: { date, name, type: "regular" | "special" }.
    const holidayOn = new Map((CFG.holidays || []).map((h) => [h.date, h]));
    const holidayTag = (h) => `<span class="cal-holiday ${h.type === "regular" ? "regular" : ""}" title="${esc(`${h.name} (${h.type === "regular" ? "regular holiday" : "special non-working day"})`)}">${esc(h.name)}</span>`;
    const byDate = new Map();
    weeks.forEach((w, i) => w.date && byDate.set(w.date, [...(byDate.get(w.date) || []), i]));
    const dayButton = (i, inner) => {
      const w = weeks[i];
      return `<button class="cal-event ${kind(w)} ${i === state.scheduleDay ? "selected" : ""} ${w.progress >= 100 ? "done" : ""}" data-schedule-day="${i}" aria-pressed="${i === state.scheduleDay}" aria-label="${esc(`${w.label}, ${w.date ? longDate(w.date) : "date to be set"}`)}">${inner}</button>`;
    };

    const w = weeks[state.scheduleDay];
    const status = (x) => (x.progress >= 100 ? "Complete" : x.progress > 0 ? `${x.progress}% played` : "Upcoming");
    const detailFor = (x) => `
      <section class="cal-detail ${kind(x)}" aria-live="polite">
        <h4>${esc(x.label)}</h4>
        ${holidayOn.has(x.date) ? `<p class="cal-holiday-note"><i class="fas fa-flag" aria-hidden="true"></i> ${esc(holidayOn.get(x.date).name)}, ${holidayOn.get(x.date).type === "regular" ? "a regular holiday" : "a special non-working day"}</p>` : ""}
        <p class="cal-meta"><span>${x.date ? esc(longDate(x.date)) : "Date to be set"}</span>${x.location ? `<span><i class="fas fa-location-dot" aria-hidden="true"></i> ${esc(x.location)}</span>` : ""}<span>${esc(status(x))}</span></p>
      </section>`;
    const placeholder = `
      <section class="cal-detail placeholder" aria-live="polite">
        <p class="muted"><i class="fa-regular fa-hand-pointer" aria-hidden="true"></i> Pick a match day on the calendar to see its details here. Guild Sieges open in the siege panel.</p>
      </section>`;
    const dated = weeks.filter((w) => w.date).map((w) => w.date).sort();
    const months = [];
    if (dated.length) {
      const [y0, m0] = dated[0].split("-").map(Number);
      const [y1, m1] = dated.at(-1).split("-").map(Number);
      for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? ((m = 1), y++) : m++) months.push([y, m]);
    }
    const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
    // Start on this month (or the first month with match days); the arrows move from there.
    if (state.scheduleMonth == null || !months[state.scheduleMonth]) {
      const now = months.findIndex(([y, m]) => ym(y, m) === today.slice(0, 7));
      state.scheduleMonth = now >= 0 ? now : 0;
    }
    // Sunday first; Thursday and Saturday get two letters so they differ from Tuesday and Sunday.
    const weekdays = ["S", "M", "T", "W", "TH", "F", "ST"];
    const monthGrid = ([y, m]) => {
      const first = new Date(y, m - 1, 1);
      const days = new Date(y, m, 0).getDate();
      const cells = Array.from({ length: first.getDay() }, () => '<span class="cal-day blank"></span>');
      for (let d = 1; d <= days; d++) {
        const date = iso(new Date(y, m - 1, d));
        const events = byDate.get(date) || [];
        const holiday = holidayOn.get(date);
        const hTag = holiday ? holidayTag(holiday) : "";
        cells.push(`
          <div class="cal-day ${date === today ? "today" : ""} ${events.length ? "has-event" : ""} ${holiday ? "holiday" : ""}">
            ${events.length ? events.map((i) => dayButton(i, `<span class="cal-num">${d}</span><span class="cal-label">${esc(weeks[i].label)}</span>${hTag}`)).join("") : `<span class="cal-num">${d}</span>${hTag}`}
          </div>`);
      }
      return `
        <div class="cal-grid">
          ${weekdays.map((d) => `<span class="cal-weekday" aria-hidden="true">${esc(d)}</span>`).join("")}
          ${cells.join("")}
        </div>`;
    };
    const shown = months[state.scheduleMonth];
    const monthTitle = shown ? new Date(shown[0], shown[1] - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "No dates yet";
    const undated = weeks.map((x, i) => i).filter((i) => !weeks[i].date);
    // The selected day's details show under the calendar when it's in the month on screen (or undated).
    // A selected Guild Siege shows in the siege panel instead.
    const showDetail = Boolean(w) && kind(w) !== "siege" && (w.date ? Boolean(shown) && w.date.startsWith(ym(...shown)) : true);

    // The next Weekly Pod and Guild Siege from today, with a countdown.
    const next = (test) => weeks.filter((x) => test(x) && x.date && x.date >= today && x.progress < 100).sort((p, q) => p.date.localeCompare(q.date))[0];
    const countdown = (date) => {
      const days = Math.round((new Date(`${date}T00:00:00`) - new Date(`${today}T00:00:00`)) / 864e5);
      return days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : days < 0 ? `${-days} days ago` : `In ${days} days`;
    };
    const upcoming = (x, kicker) => `
      <p class="sched-kicker">${esc(kicker)}</p>
      <h3 class="sched-title">${esc(x.label)}</h3>
      <p class="sched-when">
        ${x.date ? `<span class="sched-countdown">${esc(x.progress >= 100 ? "Complete" : countdown(x.date))}</span>` : ""}
        <span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${x.date ? esc(longDate(x.date)) : "Date to be set"}</span>
        ${x.location ? `<span><i class="fas fa-location-dot" aria-hidden="true"></i> ${esc(x.location)}</span>` : ""}
        ${holidayOn.has(x.date) ? `<span class="cal-holiday-note"><i class="fas fa-flag" aria-hidden="true"></i> ${esc(holidayOn.get(x.date).name)}</span>` : ""}
      </p>`;
    const none = (kicker, text) => `<p class="sched-kicker">${esc(kicker)}</p><p class="muted">${esc(text)}</p>`;
    const pod = next((x) => /pod/i.test(x.label));
    // The siege panel shows the Guild Siege picked on the calendar, or else the next one.
    const nextSiege = next((x) => kind(x) === "siege");
    const siege = w && kind(w) === "siege" ? w : nextSiege;
    const siegeFixtures = siege ? state.raw.matches.filter((m) => m.week === siege.label) : [];
    const siegeMatchups = siegeFixtures.length
      ? `<ul class="fixtures">${siegeFixtures.map((m, j) => (m.round && m.round !== siegeFixtures[j - 1]?.round ? `<li class="fixture-round">Round ${m.round}</li>` : "") + fixtureRow(m)).join("")}</ul>`
      : `<p class="muted">Match-ups haven't been set yet.</p>`;

    $("#schedule-list").innerHTML = `
      <div class="sched-layout">
        <section class="sched-panel sched-cal" aria-label="Calendar">
          <div class="cal-nav">
            <button class="icon-btn" data-schedule-month="-1" aria-label="Previous month" ${state.scheduleMonth > 0 ? "" : "disabled"}><i class="fas fa-chevron-left" aria-hidden="true"></i></button>
            <h2>${esc(monthTitle)}</h2>
            <button class="icon-btn" data-schedule-month="1" aria-label="Next month" ${state.scheduleMonth < months.length - 1 ? "" : "disabled"}><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
          </div>
          <ul class="cal-legend" aria-label="Key">
            <li><span class="swatch siege"></span>Guild Siege</li>
            <li><span class="swatch raid"></span>Grand Raid</li>
            <li><span class="swatch event"></span>EXP Farming</li>
            <li><span class="swatch holiday"></span>Holiday</li>
          </ul>
          ${shown ? monthGrid(shown) : ""}
          ${undated.length ? `<div class="cal-undated"><span class="muted">Date to be set:</span>${undated.map((i) => dayButton(i, `<span class="cal-label">${esc(weeks[i].label)}</span>`)).join("")}</div>` : ""}
          ${showDetail ? detailFor(w) : placeholder}
        </section>
        <section class="sched-panel sched-pod" aria-label="Next EXP Farm Event">
          ${pod ? upcoming(pod, "Upcoming EXP Farm Event") : none("Upcoming EXP Farm Event", "No EXP Farm Event coming up.")}
        </section>
        <section class="sched-panel sched-siege" aria-label="Next Guild Siege">
          ${siege ? upcoming(siege, siege === nextSiege ? "Upcoming Guild Siege" : "Guild Siege") + siegeMatchups : none("Upcoming Guild Siege", "No Guild Siege coming up.")}
        </section>
      </div>`;
  }

  // One match-up: both guilds, with the score once it's played (bout wins, or a default win).
  // The fixture's first guild attacks, the second defends (a target fixture is a target attack).
  const sideTag = (m, attacking) =>
    attacking
      ? `<small class="fixture-role attack"><i class="fas ${m.target ? "fa-crosshairs" : "fa-burst"}" aria-hidden="true"></i> ${m.target ? "Target attack" : "Attack"}</small>`
      : `<small class="fixture-role defend"><i class="fas fa-shield-halved" aria-hidden="true"></i> Defend</small>`;

  function fixtureRow(m) {
    const side = (name) => {
      const t = state.teamsByName.get(name) || { name };
      const won = m.result?.winner === name;
      return `<span class="fixture-team ${won ? "won" : ""}">${teamAvatar(t)}<span class="fixture-name"><span>${esc(name)}</span>${sideTag(m, name === m.team1)}</span></span>`;
    };
    const r = m.result;
    const mid = !r ? '<span class="fixture-vs">vs</span>' : r.byDefault ? '<span class="fixture-vs">Default</span>' : `<b class="fixture-score">${r.bouts1}–${r.bouts2}</b>`;
    const bouts = (m.bouts || []).map((b) => boutRow(b, 1, m.team1, m.team2)).join("");
    return `<li class="fixture">${side(m.team1)}${mid}${side(m.team2)}</li>${bouts ? `<li class="fixture-bouts">${bouts}</li>` : ""}`;
  }

  // One battle between two bladers, from side `mine`'s point of view, with a dot per round.
  function boutRow(b, mine, myTeam, oppTeam) {
    const me = playerOrUnknown(mine === 1 ? b.p1 : b.p2);
    const them = playerOrUnknown(mine === 1 ? b.p2 : b.p1);
    const a = mine === 1 ? b.p1Pts : b.p2Pts;
    const z = mine === 1 ? b.p2Pts : b.p1Pts;
    const outcome = a > z ? "win" : a < z ? "loss" : "draw";
    const rounds = (b.rounds || [])
      .map((rd) => {
        const info = FINISHES[rd.finish];
        const ours = rd.winner === mine;
        return `<span class="${ours ? "" : "theirs"}" style="--sw:${info ? info.color : "var(--ash)"}" title="${esc(`${ours ? me.name : them.name} won by ${info ? info.long.toLowerCase() : rd.finish}`)}"></span>`;
      })
      .join("");
    return `
      <div class="bout">
        <div class="bout-side">
          <span class="bout-player" ${me.key ? `data-open-player="${esc(me.key)}"` : ""}>${esc(me.name)}</span>
          <span class="bout-team">${esc(myTeam)}</span>
        </div>
        <div class="bout-center">
          <span class="bout-score">${a}–${z}</span>
          <div class="bout-rounds">${rounds}</div>
          <span class="outcome ${outcome}">${outcome === "win" ? "Win" : outcome === "loss" ? "Loss" : "Draw"}</span>
        </div>
        <div class="bout-side right">
          <span class="bout-player" ${them.key ? `data-open-player="${esc(them.key)}"` : ""}>${esc(them.name)}</span>
          <span class="bout-team">${esc(oppTeam)}</span>
        </div>
      </div>`;
  }

  function renderHero() {
    const weeks = (state.raw.weeks || []).filter(isSeasonDay);
    const played = state.raw.matches.filter((m) => m.bouts?.length || m.defaultWinner).length;
    const total = state.raw.matches.length;
    const withGames = state.players.filter((p) => p.overall.games);
    const avgPPG = withGames.length ? withGames.reduce((s, p) => s + p.overall.ppg, 0) / withGames.length : 0;
    const current = weeks.find((w) => w.label === state.currentWeek);
    // Weeks arrive sorted by date, so the first one opens the season.
    const opener = weeks[0];
    const weekText = !opener
      ? "The season hasn't started yet."
      : !weeks.some((w) => w.progress > 0)
        ? // Non-breaking spaces keep the day and date ("Sun, Oct 25") on one line.
          `The season opens with ${opener.label}${opener.date ? ` on ${longDate(opener.date).replace(/ /g, " ")}` : ""}.`
        : current.progress >= 100
          ? `${current.label} is complete.`
          : `${current.label} is underway.`;

    // Match days (weeks) and match-ups (matches) are set separately in the admin.
    const progressText = !total
      ? weeks.length
        ? "Match-ups haven't been set yet."
        : "The schedule hasn't been posted yet."
      : !played
        ? `${plural(total, "guild match", "guild matches")} on the schedule.`
        : `${played} of ${total} guild matches are done, and bladers average ${fmt2(avgPPG)} points a game.`;
    $("#hero-status").textContent = `Season ${CFG.season}. ${weekText} ${progressText}`;

    const updated = state.raw.updatedAt ? new Date(state.raw.updatedAt) : new Date();
    setText("update-time", `Standings updated ${updated.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);

    const container = $("#progress-container");
    container.innerHTML = weeks
      .map((w, i) => {
        const v = Math.min(Math.max(Number(w.progress) || 0, 0), 100);
        const status = v >= 100 ? "done" : w.label === state.currentWeek && v > 0 ? "live" : "";
        const meta = status === "done" ? "Complete" : status === "live" ? `${v}% played` : shortDate(w.date);
        return `
          <li class="stage ${status}" style="--p:${v}%" ${status === "live" ? 'aria-current="step"' : ""}>
            <span class="stage-node">${i + 1}</span>
            <span class="stage-label">${esc(w.label)}</span>
            <span class="stage-meta">${esc(meta)}</span>
          </li>`;
      })
      .join("");

    // One-line summary, shown on phones where the stage labels are hidden.
    const liveIdx = weeks.findIndex((w) => w.label === state.currentWeek && w.progress > 0 && w.progress < 100);
    const nextWeek = weeks.find((w) => !(w.progress > 0));
    let caption;
    if (!weeks.length) caption = "";
    else if (liveIdx >= 0) caption = `${weeks[liveIdx].label} of ${weeks.length} is ${weeks[liveIdx].progress}% played.`;
    else if (!nextWeek) caption = `All ${weeks.length} weeks are complete.`;
    else caption = "";
    if (nextWeek) caption += ` ${nextWeek.label} starts ${shortDate(nextWeek.date)}.`;
    setText("season-caption", caption.trim());
  }

  function renderTopBladers() {
    const top10 = state.league.slice(0, 10);
    const sheet = $("#mvp-hero");
    const list = $("#mvp-list");
    if (!top10.length) {
      sheet.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-hourglass-half"></i><h4>No qualified bladers yet</h4><p>Rankings appear once bladers have played enough games.</p></div>`;
      list.innerHTML = "";
      return;
    }

    const first = top10[0];
    const o = first.overall;
    const maxPPG = Math.max(...state.league.map((p) => p.overall.ppg), 1);
    sheet.dataset.openPlayer = first.key;
    sheet.setAttribute("aria-label", `Open ${first.name}'s profile`);
    sheet.innerHTML = `
      ${portraitHtml(first, '<span class="rank-crown">#1</span>')}
      <div>
        <h3 class="char-name">${esc(first.name)}</h3>
        <p class="char-guild">${esc(first.team)}${inBracket(first.bracket)}</p>
        <p class="char-score"><b>${fmt2(first.mvp)}</b><span>MVP score</span></p>
      </div>
      <dl class="gauges">
        <div class="gauge"><dt>Win rate <b>${pct(o.winRate)} (${record(o.wins, o.losses)})</b></dt><dd>${meter(o.winRate, { segmented: true })}</dd></div>
        <div class="gauge"><dt>Points per game <b>${fmt2(o.ppg)}</b></dt><dd>${meter(o.ppg / maxPPG, { segmented: true, color: "var(--pink)" })}</dd></div>
        <div class="gauge"><dt>Attendance <b>${pct(first.attendance)}</b></dt><dd>${meter(first.attendance, { segmented: true })}</dd></div>
        <div class="gauge"><dt>Defense <b>${fmt2(o.defense)} of ${CFG.pointsToWin}</b></dt><dd>${meter(o.defense / CFG.pointsToWin, { segmented: true, color: "var(--pink)" })}</dd></div>
      </dl>`;

    list.innerHTML = top10
      .slice(1)
      .map(
        (p, i) => `
        <li class="party-row" data-open-player="${esc(p.key)}">
          <span class="party-rank">#${i + 2}</span>
          ${playerAvatar(p)}
          <div class="party-name">
            ${esc(p.name)}<span class="party-guild">${esc(p.team)}</span>
            ${meter(p.mvp / first.mvp, { cls: "party-xp" })}
          </div>
          <span class="party-score">${fmt2(p.mvp)}</span>
        </li>`
      )
      .join("");

    animateMeters(sheet);
    animateMeters(list);
  }

  function renderTitles() {
    const league = state.league;
    const best = (fn) => league.reduce((top, p) => (!top || fn(p) > fn(top) ? p : top), null);
    // The top guild once it has played; the grid puts it beside Strongest Blader.
    const topGuild = state.teams[0]?.played ? state.teams[0] : null;
    const rows = [
      { title: "Strongest Blader", p: league[0], value: (p) => fmt2(p.mvp), unit: "MVP score" },
      { title: "Guild Dominator", team: topGuild },
      { title: "Stamina King", finish: "spin", p: best((p) => p.overall.spinPG), value: (p) => fmt2(p.overall.spinPG), unit: "stamina finishes per game" },
      { title: "Overlord", finish: "over", p: best((p) => p.overall.overPG), value: (p) => fmt2(p.overall.overPG), unit: "over finishes per game" },
      { title: "Burst God", finish: "burst", p: best((p) => p.overall.burstPG), value: (p) => fmt2(p.overall.burstPG), unit: "burst finishes per game" },
      { title: "Extreme Champion", finish: "extreme", p: best((p) => p.overall.extremePG), value: (p) => fmt2(p.overall.extremePG), unit: "extreme finishes per game" },
    ];

    $("#titles-list").innerHTML = rows
      .map((r) => {
        const sw = r.finish ? `<span class="title-swatch" style="--sw:${FINISHES[r.finish].color}" aria-hidden="true"></span>` : "";
        if (r.team) {
          return `
          <div class="title-row" data-open-team="${esc(r.team.name)}">
            <dt>${esc(r.title)}</dt>
            <dd class="holder">Held by <b>${esc(r.team.name)}</b></dd>
            <dd class="score"><span class="value">${esc(record(r.team.wins, r.team.losses))}</span><span class="unit">match record</span></dd>
          </div>`;
        }
        if (!r.p) {
          return `<div class="title-row"><dt>${sw}${esc(r.title)}</dt><dd class="holder">Unclaimed</dd><dd class="score"><span class="value">–</span></dd></div>`;
        }
        return `
          <div class="title-row" data-open-player="${esc(r.p.key)}">
            <dt>${sw}${esc(r.title)}</dt>
            <dd class="holder">Held by <b>${esc(r.p.name)}</b> of ${esc(r.p.team)}</dd>
            <dd class="score"><span class="value">${esc(r.value(r.p))}</span><span class="unit">${esc(r.unit)}</span></dd>
          </div>`;
      })
      .join("");
  }

  function renderMeta() {
    const totals = Object.fromEntries(Object.keys(FINISHES).map((f) => [f, 0]));
    state.players.forEach((p) => Object.keys(totals).forEach((f) => (totals[f] += p.overall[f])));
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    const share = (f) => (total ? totals[f] / total : 0);

    const bar = $("#meta-bar");
    bar.setAttribute(
      "aria-label",
      `Rounds won by finish: ${Object.entries(FINISHES).map(([f, i]) => `${i.long} ${totals[f]} (${pct(share(f), 1)})`).join(", ")}`
    );
    bar.innerHTML = Object.entries(FINISHES)
      .map(
        ([f, info]) =>
          `<span class="meta-seg" style="flex:${totals[f] || 0.0001};--sw:${info.color}" data-tip="<b>${esc(info.long)}</b><br>${totals[f]} rounds <span class='muted'>${pct(share(f), 1)}</span>"></span>`
      )
      .join("");

    $("#meta-legend").innerHTML = Object.entries(FINISHES)
      .map(
        ([f, info]) => `
        <li>
          <span class="swatch" style="--sw:${info.color}"></span>
          <span>${esc(info.long)}</span>
          <b>${totals[f]}</b>
          <span class="muted">${pct(share(f), 1)}</span>
        </li>`
      )
      .join("");
  }

  function rankCell(i) {
    return `<td class="rank-cell ${i === 0 ? "first" : ""}">${i + 1}</td>`;
  }

  function playerRows(list, valueFn, emptyMsg) {
    if (!list.length) return `<tr><td colspan="3" class="empty">${esc(emptyMsg)}</td></tr>`;
    return list
      .map(
        (p, i) => `
        <tr data-open-player="${esc(p.key)}">
          ${rankCell(i)}
          <td>
            <div class="name-cell">
              ${playerAvatar(p)}
              <div class="stack"><span class="primary">${esc(p.name)}</span><span class="secondary">${esc(p.team)}</span></div>
            </div>
          </td>
          <td class="num strong">${valueFn(p)}</td>
        </tr>`
      )
      .join("");
  }

  function renderFinishTables() {
    const f = state.finish;
    const info = FINISHES[f];
    const field = `${f}PG`;
    setActiveTab($("#finish-pills"), f);
    $$("[data-finish-label]").forEach((el) => (el.textContent = `${info.label} per game`));
    $("#overall-finish-title").textContent = "Whole Season";
    $("#weekly-finish-title").textContent = state.currentSiege;

    const overall = state.league
      .slice()
      .sort((a, b) => b.overall[field] - a.overall[field] || leagueSort(a, b))
      .slice(0, 10);
    const weekly = state.players
      .filter((p) => p.weekly.games > 0)
      .sort((a, b) => b.weekly[field] - a.weekly[field] || b.weekly.mvp - a.weekly.mvp)
      .slice(0, 10);

    $("#overall-finish-body").innerHTML = playerRows(overall, (p) => fmt2(p.overall[field]), "No qualified bladers yet.");
    $("#weekly-finish-body").innerHTML = playerRows(weekly, (p) => fmt2(p.weekly[field]), `No battles recorded in ${state.currentSiege} yet.`);
  }

  function wrMeter(wr) {
    const above = wr >= 0.5;
    const left = above ? 50 : wr * 100;
    const width = Math.abs(wr - 0.5) * 100;
    const color = above ? "var(--teal)" : "var(--pink)";
    return `<div class="wr-meter" data-tip="Win rate <b>${pct(wr, 1)}</b><br><span class='muted'>Center line is 50%</span>"><span style="left:${left}%;width:${width}%;background:${color}"></span></div>`;
  }

  function renderRanking() {
    const top = state.teams.slice(0, 10);
    $("#team-leaderboard").innerHTML = top.length
      ? top
          .map(
            (t, i) => `
          <li class="rank-row" data-open-team="${esc(t.name)}">
            <span class="pos">${i + 1}</span>
            ${teamAvatar(t)}
            <div class="guild">
              <div class="guild-name">${esc(t.name)}</div>
              <div class="guild-meta">${SINGLE_BRACKET ? "" : `<span>Bracket ${esc(t.bracket)}</span>`}<span>${t.points} points</span></div>
            </div>
            <span class="record"><b>${record(t.wins, t.losses)}</b></span>
            ${wrMeter(t.winRate)}
            <span class="wr">${pct(t.winRate)}</span>
          </li>`
          )
          .join("")
      : `<li class="empty-state"><i class="fas fa-shield-halved"></i><h4>No guild results yet</h4><p>The ranking fills in after the first matches are played.</p></li>`;
  }

  // A guild's map marker: its logo when the data has one, otherwise its initials.
  function guildPinHtml(t, cls = "") {
    const style = guildStyle(t.name, "pin");
    const tone = style ? "" : hash(t.name) % 2 ? "pink" : "";
    const inner = t.logo
      ? imgTag(t.logo, ` onerror="this.replaceWith(document.createTextNode('${esc(initials(t.name))}'))"`)
      : esc(initials(t.name));
    return `<span class="guild-pin ${tone} ${cls}" ${style ? `style="${style}"` : ""}>${inner}</span>`;
  }

  function guildPin(t) {
    return L.divIcon({
      className: "guild-pin-wrap",
      html: guildPinHtml(t),
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -22],
      tooltipAnchor: [0, -22],
    });
  }

  function renderMap() {
    $("#location-map").classList.remove("skel");
    if (!window.L) {
      $("#location-map").innerHTML = `<div class="empty-state"><i class="fas fa-map"></i><h4>The map couldn't load</h4><p>Check your connection and reload the page.</p></div>`;
      return;
    }
    if (state.map) state.map.remove();

    // Mouse wheel zooms while the pointer is over the map; a smaller step keeps it smooth.
    const map = L.map("location-map", { scrollWheelZoom: true, wheelPxPerZoomLevel: 90, zoomSnap: 0.5 }).setView(CFG.map.center, CFG.map.zoom);
    state.map = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const located = state.teams.filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng));
    if (!located.length) return;

    // Guilds close together merge into a stack that splits apart on zoom or click. The stack
    // shows one of its guilds (one with an uploaded logo if there is one) plus a count.
    const layer = L.markerClusterGroup
      ? L.markerClusterGroup({
          maxClusterRadius: 44,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          spiderfyDistanceMultiplier: 1.6,
          iconCreateFunction: (cluster) => {
            const guilds = cluster.getAllChildMarkers().map((m) => m.options.guild);
            const lead = guilds.find((g) => g.logo) || guilds[0];
            return L.divIcon({
              className: "guild-pin-wrap",
              html: `<span class="guild-stack" title="${esc(guilds.map((g) => g.name).join(", "))}">${guildPinHtml(lead, "stacked")}<b class="stack-count">${guilds.length}</b></span>`,
              iconSize: [44, 44],
              iconAnchor: [22, 22],
            });
          },
        })
      : L.layerGroup();
    layer.addTo(map);

    // One marker per guild at its exact home location.
    located.forEach((t) => {
      L.marker([t.lat, t.lng], { icon: guildPin(t), guild: t, riseOnHover: true, title: t.name, keyboard: true })
        .bindTooltip(esc(t.name), { direction: "top", className: "guild-tip" })
        .bindPopup(
          `<div class="map-popup-head">${esc(t.name)}</div>
           <div>${record(t.wins, t.losses)} record, ${pct(t.winRate)} win rate, ${t.points} points</div>
           <a href="#" class="map-popup-link" data-open-team="${esc(t.name)}">View guild</a>`
        )
        .addTo(layer);
    });

    // Frame every guild instead of relying on a fixed centre.
    const bounds = L.latLngBounds(located.map((t) => [t.lat, t.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: false });

    setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: false });
    }, 150);
  }

  function renderDashboard() {
    renderSchedule();
    renderHero();
    renderTopBladers();
    renderTitles();
    renderMeta();
    renderFinishTables();
    renderRanking();
    renderMap();
  }

  // ---------------------------------------------------------------------------
  // Modals
  // ---------------------------------------------------------------------------

  function openModal(id) {
    closeMobileMenu();
    $(`#${id}`).classList.add("open");
    document.body.classList.add("scroll-locked");
  }

  function closeModal(id) {
    $(`#${id}`).classList.remove("open");
    if (id === "search-modal") closeSharePreview();
    if (!$$(".modal-overlay.open").length) {
      document.body.classList.remove("scroll-locked");
    }
  }

  // ---------------------------------------------------------------------------
  // Theme: dark (default) or light, saved on the device. index.html applies it before paint.
  // ---------------------------------------------------------------------------

  const WIPE_MS = 700;
  const WIPE_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // Private browsing can block storage; the theme still applies for this visit.
    }
    syncThemeToggle();
  }

  function syncThemeToggle() {
    const light = document.documentElement.dataset.theme === "light";
    $$("[data-action=toggle-theme]").forEach((b) => {
      b.setAttribute("aria-pressed", String(light));
      b.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
      const icon = `<i class="fas ${light ? "fa-moon" : "fa-sun"}" aria-hidden="true"></i>`;
      b.innerHTML = "iconOnly" in b.dataset ? icon : `${icon} <span>${light ? "Dark mode" : "Light mode"}</span>`;
    });
    $('meta[name="theme-color"]')?.setAttribute("content", light ? "#f5f7f7" : "#000000");
  }

  // The new theme is revealed by a vertical wipe: left to right into light, right to left into dark,
  // with a glowing line riding the edge. Uses the View Transitions API; without it (or with reduced
  // motion) the theme just switches.
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce) return setTheme(next);

    const toLight = next === "light";
    // The line joins the transition as its own layer (view-transition-name in the CSS), so it is drawn
    // above the page snapshots; its layer is slid across in step with the wipe.
    const line = document.createElement("div");
    line.className = "theme-wipe-line";
    document.body.append(line);
    const transition = document.startViewTransition(() => setTheme(next));
    transition.ready.then(() => {
      const timing = { duration: WIPE_MS, easing: WIPE_EASE };
      document.documentElement.animate(
        { clipPath: toLight ? ["inset(0 100% 0 0)", "inset(0 0 0 0)"] : ["inset(0 0 0 100%)", "inset(0 0 0 0)"] },
        { ...timing, pseudoElement: "::view-transition-new(root)" }
      );
      // Animating left (not transform) keeps the line on the same frames as the clip-path wipe;
      // a transform would run on the compositor and drift ahead of the edge.
      const edge = `${innerWidth - 2}px`;
      document.documentElement.animate(
        { left: toLight ? ["0px", edge] : [edge, "0px"] },
        { ...timing, pseudoElement: "::view-transition-group(theme-wipe-line)" }
      );
    });
    transition.finished.finally(() => line.remove());
  }

  // Pages: the dashboard at /, or the schedule at /Schedules (vercel.json serves index.html there).
  // Only switching pages scrolls to the top, so in-page "#" links (like the map popups') don't jump.
  // Switching slides the pages sideways (a View Transition, styled by data-slide in the CSS); the
  // first load, reduced motion and browsers without View Transitions just swap.
  function route() {
    // Old #schedule links still land on the schedule.
    if (location.hash === "#schedule") history.replaceState(null, "", "/Schedules");
    const page = /^\/schedules\/?$/i.test(location.pathname) ? "schedule" : "dashboard";
    $$("[data-page-link]").forEach((a) => a.classList.toggle("active", a.dataset.pageLink === page));
    if (page === state.page) return;
    const first = !state.page;
    state.page = page;
    if (first || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return showPage(page);
    const root = document.documentElement;
    root.dataset.slide = page === "schedule" ? "forward" : "back";
    document.startViewTransition(() => showPage(page)).finished.finally(() => delete root.dataset.slide);
  }

  function showPage(page) {
    closeMobileMenu();
    $("#dashboard").classList.toggle("hidden", page !== "dashboard");
    $("#schedule-page").classList.toggle("hidden", page !== "schedule");
    // On desktop the schedule page fits the screen (see body.on-schedule in the CSS).
    document.body.classList.toggle("on-schedule", page === "schedule");
    window.scrollTo({ top: 0, behavior: "instant" });
    // The map can't measure itself while hidden, so redraw it once the dashboard is back.
    if (page === "dashboard" && state.map) renderMap();
  }

  function closeMobileMenu() {
    $("#menu-toggle").classList.remove("is-active");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    $("#navbar-menu").classList.remove("active");
  }

  // ----- Search: a small view stack (search → roster → profile) -----

  function showSearchView(view, arg) {
    const s = state.search;
    $("#search-controls").classList.toggle("hidden", view !== "search");
    $("#search-results").classList.toggle("hidden", view !== "search");
    $("#roster-view").classList.toggle("hidden", view !== "roster");
    $("#profile-view").classList.toggle("hidden", view !== "profile");
    $("#search-back").classList.toggle("hidden", s.stack.length <= 1);
    closeSharePreview();

    if (view === "search") {
      setText("search-title", "Search");
      renderSearchResults();
    } else if (view === "roster") {
      renderRoster(arg);
    } else if (view === "profile") {
      renderProfile(arg);
    }
  }

  function pushSearchView(view, arg) {
    state.search.stack.push({ view, arg });
    showSearchView(view, arg);
    const el = view === "search" ? $("#search-results") : view === "roster" ? $("#roster-view") : $("#profile-view");
    el.scrollTop = 0;
  }

  function popSearchView() {
    const stack = state.search.stack;
    if (stack.length <= 1) return;
    stack.pop();
    const top = stack.at(-1);
    showSearchView(top.view, top.arg);
  }

  function openSearch(tab = state.search.tab) {
    state.search.stack = [];
    setSearchTab(tab, false);
    $("#search-input").value = "";
    pushSearchView("search");
    openModal("search-modal");
    setTimeout(() => $("#search-input").focus(), 50);
  }

  function ensureSearchOpen() {
    if (!$("#search-modal").classList.contains("open")) {
      state.search.stack = [];
      openModal("search-modal");
    }
  }

  function openTeam(name) {
    if (!state.teamsByName.has(name)) return;
    ensureSearchOpen();
    pushSearchView("roster", name);
  }

  function openPlayer(key) {
    if (!state.playersByKey.has(key)) return;
    ensureSearchOpen();
    pushSearchView("profile", key);
  }

  function setSearchTab(tab, rerender = true) {
    state.search.tab = tab;
    $$("[data-search-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.searchTab === tab);
      b.setAttribute("aria-selected", b.dataset.searchTab === tab);
    });
    $("#search-input").placeholder = tab === "team" ? "Search guilds or cities" : "Search bladers, IDs or guilds";
    if (rerender) renderSearchResults();
  }

  function emptyState(icon, title, text) {
    return `<div class="empty-state"><i class="fas ${icon}" aria-hidden="true"></i><h4>${esc(title)}</h4><p>${esc(text)}</p></div>`;
  }

  function renderSearchResults() {
    const q = $("#search-input").value.trim().toLowerCase();
    const bracket = state.search.bracket;
    const inBracket = (b) => bracket === "ALL" || b === bracket;
    const out = $("#search-results");

    if (state.search.tab === "team") {
      const teams = state.teams
        .filter((t) => inBracket(t.bracket))
        .filter((t) => !q || t.name.toLowerCase().includes(q) || String(t.location).toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
      out.innerHTML = teams.length
        ? `<ul class="list">${teams
            .map(
              (t) => `
            <li class="list-item" data-open-team="${esc(t.name)}">
              ${teamAvatar(t)}
              <div class="stack">
                <span class="primary">${esc(t.name)}</span>
                <span class="secondary"><span>${esc(t.location)}</span><span>${record(t.wins, t.losses)} record</span></span>
              </div>
              ${bracketBadge(t.bracket)}
              <i class="fas fa-chevron-right chev" aria-hidden="true"></i>
            </li>`
            )
            .join("")}</ul>`
        : emptyState("fa-shield-halved", "No guilds match that search", "Try another name, city or bracket.");
    } else {
      const players = state.players
        .filter((p) => inBracket(p.bracket))
        .filter((p) => !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
        .sort((a, b) => (a.leagueRank || 1e9) - (b.leagueRank || 1e9) || a.name.localeCompare(b.name))
        .slice(0, 100);
      out.innerHTML = players.length
        ? `<div class="roster">${players.map((p) => bladerCard(p)).join("")}</div>`
        : emptyState("fa-user-slash", "No bladers match that search", "Try another name, blader ID, guild or bracket.");
    }
  }

  function rankTag(p) {
    return p.eligible
      ? `<span class="tag ${p.leagueRank === 1 ? "top" : ""}">League #${p.leagueRank}</span>`
      : `<span class="tag unranked">Not ranked yet</span>`;
  }

  function roleTag(p) {
    const role = GUILD_ROLES[p.guildRole];
    return role ? `<span class="tag role"><i class="fas ${role.icon}" aria-hidden="true"></i>${role.label}</span>` : "";
  }

  // `showGuild` is off inside a guild's own roster, where the guild is already obvious.
  function bladerCard(p, showGuild = true) {
    return `
      <div class="blader-card" data-open-player="${esc(p.key)}">
        ${playerAvatar(p)}
        <div class="blader-info">
          <div class="blader-name">${esc(p.name)}${p.ign ? ` | ${esc(p.ign)}` : ""}</div>
          <div class="blader-tags">${roleTag(p)}${rankTag(p)}${bracketBadge(p.bracket)}${showGuild ? `<span class="tag">${esc(p.team)}</span>` : ""}</div>
        </div>
        <div class="blader-score"><b>${fmt2(p.mvp)}</b><span>MVP score</span></div>
      </div>`;
  }

  function renderRoster(teamName) {
    const t = state.teamsByName.get(teamName);
    $("#search-title").innerHTML = `${teamAvatar(t)}${esc(t.name)}`;
    // Guild Leader first, then Battle Master, then everyone else by MVP score.
    const roster = state.players.filter((p) => p.team === t.name).sort((a, b) => roleOrder(a) - roleOrder(b) || b.mvp - a.mvp);
    $("#roster-view").innerHTML = `
      <div class="roster" id="guild-capture">
        <div class="stat-strip">
          <div><b>${t.played ? `#${t.bracketRank}` : "–"}</b><span>${SINGLE_BRACKET ? "League rank" : `In bracket ${esc(t.bracket)}`}</span></div>
          <div><b>${record(t.wins, t.losses)}</b><span>Record</span></div>
          <div><b>${pct(t.winRate)}</b><span>Win rate</span></div>
          <div><b>${t.points}</b><span>Points</span></div>
        </div>
        <div class="roster-meta">
          <p>${esc(t.location || "")}</p>
          <div class="roster-actions" data-html2canvas-ignore="true">
            <button class="btn-secondary" data-action="share-guild"><i class="fas fa-share" aria-hidden="true"></i> Share</button>
            <button class="btn-secondary" data-history-team="${esc(t.name)}"><i class="fas fa-scroll" aria-hidden="true"></i> Battle log</button>
          </div>
        </div>
        ${guildExpBlock(t)}
        ${roster.map((p) => bladerCard(p, false)).join("") || emptyState("fa-user-slash", "No bladers on this guild", "Bladers appear here once they're registered.")}
        ${guildQuestBlock(t)}
      </div>`;
    animateMeters($("#roster-view"));
  }

  // Guild Quest badges (CFG.guildQuests), unlocked once the admin marks the quest complete for this guild.
  function guildQuestBlock(t) {
    const quests = CFG.guildQuests || [];
    if (!quests.length) return "";
    const done = state.raw.exp?.quests || {};
    const unlocked = quests.filter((q) => (done[q.id] || []).includes(t.name)).length;
    const badges = quests
      .map((q) => {
        const on = (done[q.id] || []).includes(t.name);
        return `
        <li class="quest ${on ? "unlocked" : ""}">
          <span class="quest-badge" aria-hidden="true"><i class="fas ${on ? esc(q.icon || "fa-medal") : "fa-lock"}"></i><b>${esc(q.numeral)}</b></span>
          <span class="quest-text"><b>${esc(q.name)}</b><span>${esc(q.text)}</span></span>
          <span class="quest-state">${on ? "Unlocked" : "Locked"}</span>
        </li>`;
      })
      .join("");
    return `
      <div class="stat-block guild-quests">
        <h5>Guild Quest Badges <span class="exp-total">${unlocked} <small>/ ${quests.length}</small></span></h5>
        <ul class="quests">${badges}</ul>
      </div>`;
  }

  // Two bars on the guild profile: Guild EXP (gains only, full at the admin's required Guild EXP) and Guild Skill EXP
  // (sieges only, 0 to skillExpMax, with a marker per skill). Each shows once the admin sets it up.
  function guildExpBlock(t) {
    const skills = state.expSkills;
    const cap = state.expCap;
    const x = t.xp;
    if (!x || (!cap && !skills.length)) return "";
    const fmt = (n) => n.toLocaleString();
    const signedFmt = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));
    const sources = (p) => `<p class="exp-sources">Pods & Raids ${signedFmt(p.events)} · Achievements ${signedFmt(p.achievements)} · Shop ${signedFmt(p.shop)}</p>`;
    const bar = (title, value, max, color, marks = "") => `
      <h5>${title} <span class="exp-total">${fmt(value)} <small>/ ${fmt(max)}</small></span></h5>
      <div class="exp-track">${meter(value / max, { color })}${marks}</div>`;

    let skillPart = "";
    if (skills.length) {
      const top = CFG.skillExpMax;
      const on = (i) => i < x.unlocked;
      const marks = skills.map((s, i) => `<span class="exp-mark ${on(i) ? "unlocked" : ""}" style="left:${(s.exp / top) * 100}%" aria-hidden="true"></span>`).join("");
      const list = skills
        .map(
          (s, i) => `
          <li class="skill ${on(i) ? "unlocked" : ""}">
            <i class="fas ${on(i) ? "fa-lock-open" : "fa-lock"}" aria-hidden="true"></i>
            <span class="skill-text"><b>${esc(s.name)}</b>${s.description ? `<span>${esc(s.description)}</span>` : ""}</span>
            <span class="skill-exp">${fmt(s.exp)} Skill EXP</span>
          </li>`
        )
        .join("");
      skillPart = bar("Skill EXP", x.skillExp, top, "var(--teal)", marks) + `<p class="exp-sources">Siege results ${signedFmt(x.siege)}</p>` + `<ul class="skills">${list}</ul>`;
    }

    return `
      <div class="stat-block guild-exp">
        ${cap ? bar("Guild EXP", x.exp, cap, "var(--pink)") + sources(x.guild) : ""}
        ${skillPart}
      </div>`;
  }

  // GGW2 unlockable achievements (CFG.playerAchievements) as a grid of badge cards, unlocked when the
  // admin awards them. Each card shows the Guild EXP it gives; a tap shows the condition as a toast.
  function playerAchievementCards(p) {
    const list = CFG.playerAchievements || [];
    if (!list.length) return "";
    const cards = list
      .map((a) => {
        const on = p.unlocked?.has(a.id);
        return `
        <li>
          <button class="ach-card ${on ? "unlocked" : ""}" data-ach-info="${esc(a.id)}" aria-label="${esc(`${a.name}, ${on ? "unlocked" : "locked"}, +${a.exp} EXP. ${a.text}`)}">
            <span class="ach-emblem" aria-hidden="true"><i class="fas ${esc(a.icon || "fa-medal")}"></i></span>
            <span class="ach-name">${esc(a.name)}</span>
            <span class="ach-exp">+${a.exp} EXP</span>
            ${on ? "" : '<i class="fas fa-lock ach-lock" aria-hidden="true"></i>'}
          </button>
        </li>`;
      })
      .join("");
    const count = list.filter((a) => p.unlocked?.has(a.id)).length;
    return `
      <div class="stat-block">
        <h5 class="ach-head">GGW2 Achievements <span class="exp-total">${count} <small>/ ${list.length}</small></span></h5>
        <ul class="ach-grid">${cards}</ul>
      </div>`;
  }

  function renderProfile(key) {
    const p = state.playersByKey.get(key);
    const o = p.overall;
    setText("search-title", "Blader profile");
    const champion = p.achievements.some((a) => /champion/i.test(a));
    const maxFinish = Math.max(1, ...Object.keys(FINISHES).map((f) => o[f]));

    const finishes = Object.entries(FINISHES)
      .map(
        ([f, info]) => `
        <div class="finish-row">
          <span class="label"><span class="swatch" style="--sw:${info.color}"></span>${esc(info.label)}</span>
          ${meter(o[f] / maxFinish, { color: info.color })}
          <span class="val">${o[f]} <small>${fmt2(o[`${f}PG`])} per game</small></span>
        </div>`
      )
      .join("");

    const achievements = p.achievements
      .map((a) => {
        const won = /champion/i.test(a);
        return `<span class="achievement ${won ? "won" : ""}"><i class="fas ${won ? "fa-trophy" : "fa-medal"}" aria-hidden="true"></i>${esc(a)}</span>`;
      })
      .join("");

    $("#profile-view").innerHTML = `
      <div class="profile ${champion ? "champion" : ""}" id="profile-capture">
        <div class="profile-head">
          <div style="position:relative">
            ${portraitHtml(p)}
            <button class="share-btn" data-html2canvas-ignore="true" data-action="share-profile" aria-label="Share this profile"><i class="fas fa-share" aria-hidden="true"></i></button>
          </div>
          <div>
            <h2 class="profile-name">${esc(p.name)}</h2>
            <div class="profile-tags">
              <button class="guild-link" data-open-team="${esc(p.team)}">${esc(p.team)}</button>
              ${p.ign ? `<span class="tag ign" title="In-game name"><i class="fas fa-gamepad" aria-hidden="true"></i>${esc(p.ign)}</span>` : ""}
              ${bracketBadge(p.bracket)}
              ${roleTag(p)}
              ${champion ? '<span class="tag top"><i class="fas fa-crown" aria-hidden="true"></i> Champion</span>' : ""}
            </div>
          </div>
        </div>

        <div class="stat-strip">
          <div class="${p.leagueRank === 1 ? "first" : ""}"><b>${p.eligible ? `#${p.leagueRank}` : "–"}</b><span>League rank</span></div>
          ${SINGLE_BRACKET
            ? `<div><b>${o.games}</b><span>Games played</span></div>`
            : `<div class="${p.bracketRank === 1 ? "first" : ""}"><b>${p.eligible ? `#${p.bracketRank}` : "–"}</b><span>In bracket ${esc(p.bracket)}</span></div>`}
          <div><b>${pct(o.winRate)}</b><span>Win rate, ${record(o.wins, o.losses)}</span></div>
        </div>
        ${p.eligible ? "" : `<p class="section-note">Not ranked yet. Bladers need ${CFG.minGames || 1} games and at least half of their guild's matches.</p>`}

        <div class="stat-block">
          <h5>Season stats</h5>
          ${statRow("MVP score", fmt2(p.mvp))}
          ${statRow("Games played", o.games)}
          ${statRow("Total points", o.points)}
          ${statRow("Points per game", fmt2(o.ppg))}
          ${statRow("Points given up per game", o.games ? fmt2(o.conceded / o.games) : "–")}
          ${statRow("Attendance", pct(p.attendance))}
          ${statRow("Beys used", p.beys ?? "–")}
        </div>

        <div class="stat-block">
          <h5>How they win rounds</h5>
          <div class="finish-rows">${finishes}</div>
        </div>

        ${achievements ? `<div class="stat-block" data-html2canvas-ignore="true"><h5>Exclusive Badge</h5><div class="achievements">${achievements}</div></div>` : ""}
        ${playerAchievementCards(p)}
      </div>`;
    animateMeters($("#profile-view"));
  }

  function statRow(label, value) {
    return `<div class="stat-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  }

  // ----- Profile sharing -----

  // html2canvas is only needed for sharing, so it's fetched on first use instead of on page load.
  const HTML2CANVAS_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
  let html2canvasLoading = null;

  function loadHtml2canvas() {
    if (window.html2canvas) return Promise.resolve();
    html2canvasLoading ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = HTML2CANVAS_URL;
      script.onload = resolve;
      script.onerror = () => {
        html2canvasLoading = null;
        script.remove();
        reject(new Error("html2canvas failed to load"));
      };
      document.head.append(script);
    });
    return html2canvasLoading;
  }

  // Draws `target` to an image and opens the share preview. `onclone` can adjust the copy
  // that gets drawn (the page itself is left alone).
  async function shareCard(target, fileName, onclone) {
    if (!target) return;
    toast("Making the card…");
    try {
      await loadHtml2canvas();
    } catch (err) {
      console.error(err);
      toast("Sharing isn't available right now. Check your connection and try again.");
      return;
    }
    try {
      // Share images always use the dark theme, whatever the visitor is viewing in.
      const canvas = await html2canvas(target, {
        backgroundColor: "#000000",
        scale: 2,
        useCORS: true,
        onclone: (doc) => {
          doc.documentElement.dataset.theme = "dark";
          if (onclone) onclone(doc);
        },
      });
      state.shareBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      state.shareFileName = fileName;
      $("#share-image").src = canvas.toDataURL("image/png");
      $("#share-overlay").classList.add("open");
    } catch (err) {
      console.error(err);
      toast("Couldn't make the card. Try again.");
    }
  }

  function shareProfile() {
    const key = state.search.stack.at(-1)?.arg || "blader";
    // .share-capture shrinks the achievement cards in the image on phones (see the CSS). It goes on the
    // page itself only while html2canvas copies it, because html2canvas takes pseudo-element styles (the
    // card frames and icons) from the page, not from its copy.
    const el = $("#profile-capture");
    const done = () => el.classList.remove("share-capture");
    el.classList.add("share-capture");
    return shareCard(el, `${key}-profile.png`, done).finally(done);
  }

  // The guild's logo and name live in the modal header, so the card gets its own heading.
  function shareGuild() {
    const t = state.teamsByName.get(state.search.stack.at(-1)?.arg);
    if (!t) return;
    return shareCard($("#guild-capture"), `${t.name}-guild.png`, (doc) => {
      doc.getElementById("guild-capture").insertAdjacentHTML("afterbegin", `<div class="guild-card-head">${teamAvatar(t)}<span>${esc(t.name)}</span></div>`);
    });
  }

  const shareFileName = () => state.shareFileName || "card.png";

  function downloadShareImage() {
    if (!state.shareBlob) return;
    const url = URL.createObjectURL(state.shareBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = shareFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Image saved.");
  }

  async function nativeShare() {
    if (!state.shareBlob) return;
    const file = new File([state.shareBlob], shareFileName(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: CFG.name });
      } catch (err) {
        if (err.name !== "AbortError") toast("Sharing failed. Save the image instead.");
      }
    } else {
      downloadShareImage();
      toast("This device can't share images, so the card was saved instead.");
    }
  }

  function closeSharePreview() {
    $("#share-overlay").classList.remove("open");
  }

  // ----- Battle log -----

  function openHistory(teamName) {
    openModal("history-modal");
    if (teamName) showTeamHistory(teamName);
    else showHistoryTeams();
  }

  function showHistoryTeams() {
    setText("history-title", "Battle log");
    $("#history-back").classList.add("hidden");
    $("#history-controls").classList.remove("hidden");
    $("#history-teams").classList.remove("hidden");
    $("#history-matches").classList.add("hidden");
    renderHistoryTeams();
  }

  function renderHistoryTeams() {
    const q = $("#history-input").value.trim().toLowerCase();
    const b = state.history.bracket;
    const teams = state.teams
      .filter((t) => b === "ALL" || t.bracket === b)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || String(t.location).toLowerCase().includes(q))
      .sort((x, y) => x.name.localeCompare(y.name));

    $("#history-teams").innerHTML = teams.length
      ? `<ul class="list">${teams
          .map(
            (t) => `
          <li class="list-item" data-history-team="${esc(t.name)}">
            ${teamAvatar(t)}
            <div class="stack">
              <span class="primary">${esc(t.name)}</span>
              <span class="secondary"><span>${plural(t.played, "match", "matches")} played</span><span>${record(t.wins, t.losses)} record</span></span>
            </div>
            ${bracketBadge(t.bracket)}
            <i class="fas fa-chevron-right chev" aria-hidden="true"></i>
          </li>`
          )
          .join("")}</ul>`
      : emptyState("fa-shield-halved", "No guilds match that search", "Try another name, city or bracket.");
  }

  function showTeamHistory(teamName) {
    const t = state.teamsByName.get(teamName);
    if (!t) return;
    setText("history-title", "Battle log");
    $("#history-back").classList.remove("hidden");
    $("#history-controls").classList.add("hidden");
    $("#history-teams").classList.add("hidden");
    const view = $("#history-matches");
    view.classList.remove("hidden");
    view.scrollTop = 0;

    const matches = state.raw.matches.filter((m) => m.bouts?.length && (m.team1 === t.name || m.team2 === t.name));
    const totalBouts = matches.reduce((s, m) => s + m.bouts.length, 0);

    const encounters = matches
      .map((m, i) => {
        const mine = m.team1 === t.name ? 1 : 2;
        const opp = mine === 1 ? m.team2 : m.team1;
        const r = m.result;
        const myBouts = mine === 1 ? r.bouts1 : r.bouts2;
        const oppBouts = mine === 1 ? r.bouts2 : r.bouts1;
        const myPts = mine === 1 ? r.pts1 : r.pts2;
        const oppPts = mine === 1 ? r.pts2 : r.pts1;
        const won = r.winner === t.name;

        const bouts = m.bouts.map((b) => boutRow(b, mine, t.name, opp)).join("");

        return `
          <div class="encounter ${won ? "won" : "lost"}" id="enc-${i}">
            <button class="encounter-head" data-toggle-group="enc-${i}" aria-expanded="false" aria-controls="enc-${i}-bouts">
              <span>
                <span class="encounter-title">${esc(t.name)}<span class="vs">vs</span>${esc(opp)}</span>
                <span class="encounter-sub">${sideTag(m, mine === 1)}<span>${esc(m.week)}</span><span>${plural(m.bouts.length, "battle")}</span><span>${myPts}–${oppPts} points</span></span>
              </span>
              <span class="encounter-result">
                <span class="outcome ${won ? "win" : "loss"}">${won ? "Win" : "Loss"}</span>
                <span class="encounter-score" title="Battles won and lost">${myBouts}–${oppBouts}</span>
                <i class="fas fa-chevron-down encounter-chev" aria-hidden="true"></i>
              </span>
            </button>
            <div class="encounter-bouts" id="enc-${i}-bouts">${bouts}</div>
          </div>`;
      })
      .join("");

    const roundKey = `
      <div class="round-key" aria-label="Round key">
        ${Object.values(FINISHES).map((info) => `<span><span class="swatch" style="--sw:${info.color}"></span>${esc(info.label)}</span>`).join("")}
        <span><span class="swatch solid"></span>Round won by ${esc(t.name)}</span>
        <span><span class="swatch hollow"></span>Round won by the opponent</span>
      </div>`;

    view.innerHTML = `
      <div class="log-hero">
        <div class="log-identity">
          ${teamAvatar(t)}
          <div>
            <h2>${esc(t.name)}</h2>
            <p>${esc(t.location)}${inBracket(t.bracket)}</p>
          </div>
        </div>
        <div class="stat-strip">
          <div><b>${record(t.wins, t.losses)}</b><span>Record</span></div>
          <div><b>${pct(t.winRate)}</b><span>Win rate</span></div>
          <div><b>${t.points}</b><span>Points</span></div>
          <div><b class="${signClass(t.setDiff)}">${signed(t.setDiff)}</b><span>Sets ±</span></div>
          <div><b class="${signClass(t.ptDiff)}">${signed(t.ptDiff)}</b><span>Points ±</span></div>
        </div>
      </div>
      <p class="log-note">A guild match with no battles listed was decided by default or disqualification, so it adds no blader stats.</p>
      <div class="log-list">
        ${matches.length
          ? `<div class="log-toolbar">
              <p>${plural(matches.length, "guild match", "guild matches")}, ${plural(totalBouts, "battle")}</p>
              <div class="actions">
                <button class="small-btn" data-toggle-all="1">Expand all</button>
                <button class="small-btn" data-toggle-all="0">Collapse all</button>
              </div>
            </div>
            ${roundKey}
            ${encounters}`
          : emptyState("fa-scroll", "No battles recorded yet", `${t.name}'s matches will show here once they're played.`)}
      </div>`;
  }

  function playerOrUnknown(key) {
    const p = state.playersByKey.get(key);
    return p ? { key: p.key, name: p.name } : { key: "", name: "Unknown blader" };
  }

  function setEncounter(el, expand) {
    el.classList.toggle("expanded", expand);
    $(".encounter-head", el)?.setAttribute("aria-expanded", expand);
  }

  // ---------------------------------------------------------------------------
  // Tooltip (hover layer for the finish bar and win-rate meters)
  // ---------------------------------------------------------------------------

  function bindTooltip() {
    const tip = $("#tooltip");
    document.addEventListener("mousemove", (e) => {
      const target = e.target.closest("[data-tip]");
      if (!target) {
        tip.classList.remove("show");
        return;
      }
      tip.innerHTML = target.dataset.tip;
      tip.style.left = `${e.clientX}px`;
      tip.style.top = `${e.clientY}px`;
      tip.classList.add("show");
    });
    document.addEventListener("scroll", () => tip.classList.remove("show"), { passive: true });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function bindEvents() {
    // Page links switch pages in place (no reload); ctrl/cmd-click still opens a new tab.
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-route]");
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      if (a.pathname !== location.pathname) history.pushState(null, "", a.pathname);
      route();
    });

    $("#menu-toggle").addEventListener("click", () => {
      const open = !$("#navbar-menu").classList.contains("active");
      $("#menu-toggle").classList.toggle("is-active", open);
      $("#menu-toggle").setAttribute("aria-expanded", open);
      $("#navbar-menu").classList.toggle("active", open);
    });

    $("#finish-pills").addEventListener("click", (e) => {
      const tab = e.target.closest("[data-finish]");
      if (!tab) return;
      state.finish = tab.dataset.finish;
      renderFinishTables();
    });

    $("#search-bracket-pills").addEventListener("click", (e) => {
      const tab = e.target.closest("[data-bracket]");
      if (!tab) return;
      state.search.bracket = tab.dataset.bracket;
      setActiveTab($("#search-bracket-pills"), state.search.bracket);
      renderSearchResults();
    });

    $("#history-bracket-pills").addEventListener("click", (e) => {
      const tab = e.target.closest("[data-bracket]");
      if (!tab) return;
      state.history.bracket = tab.dataset.bracket;
      setActiveTab($("#history-bracket-pills"), state.history.bracket);
      renderHistoryTeams();
    });

    $$("[data-search-tab]").forEach((b) => b.addEventListener("click", () => setSearchTab(b.dataset.searchTab)));
    $("#search-input").addEventListener("input", renderSearchResults);
    $("#history-input").addEventListener("input", renderHistoryTeams);
    $("#search-back").addEventListener("click", popSearchView);
    $("#history-back").addEventListener("click", showHistoryTeams);

    $("#share-native").addEventListener("click", nativeShare);
    $("#share-download").addEventListener("click", downloadShareImage);
    $("#share-cancel").addEventListener("click", closeSharePreview);

    // Close a modal via its close button or by clicking the backdrop.
    $$("[data-modal]").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal || e.target.closest("[data-close]")) closeModal(modal.id);
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if ($("#share-overlay").classList.contains("open")) return closeSharePreview();
      const open = $$(".modal-overlay.open").at(-1);
      if (open) closeModal(open.id);
      else closeMobileMenu();
    });

    // Rows and cards that open something are keyboard reachable.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = e.target.closest("[data-open-player]:not(button), [data-open-team]:not(button), [data-history-team]:not(button)");
      if (el && el === e.target) {
        e.preventDefault();
        el.click();
      }
    });

    // Global delegation for actions and "open guild/blader" links.
    document.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]");
      if (action) {
        switch (action.dataset.action) {
          case "open-search": return openSearch();
          case "open-history": return openHistory();
          case "open-brackets": return openModal("brackets-modal");
          case "share-profile": return shareProfile();
          case "share-guild": return shareGuild();
          case "toggle-theme": return toggleTheme();
        }
      }

      const ach = e.target.closest("[data-ach-info]");
      if (ach) {
        const info = (CFG.playerAchievements || []).find((x) => x.id === ach.dataset.achInfo);
        return toast(`${info.name}: ${info.text}`);
      }

      const month = e.target.closest("[data-schedule-month]");
      if (month) {
        state.scheduleMonth += Number(month.dataset.scheduleMonth);
        return renderSchedule();
      }

      const day = e.target.closest("[data-schedule-day]");
      if (day) {
        state.scheduleDay = Number(day.dataset.scheduleDay);
        renderSchedule();
        // Bring the details into view: under the calendar, or the siege panel for a Guild Siege.
        return ($(".cal-detail") || $(".sched-siege")).scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      const toggle = e.target.closest("[data-toggle-group]");
      if (toggle) {
        const el = $(`#${toggle.dataset.toggleGroup}`);
        return setEncounter(el, !el.classList.contains("expanded"));
      }

      const toggleAll = e.target.closest("[data-toggle-all]");
      if (toggleAll) {
        const expand = toggleAll.dataset.toggleAll === "1";
        return $$("#history-matches .encounter").forEach((el) => setEncounter(el, expand));
      }

      const historyTeam = e.target.closest("[data-history-team]");
      if (historyTeam) {
        if (!$("#history-modal").classList.contains("open")) openModal("history-modal");
        return showTeamHistory(historyTeam.dataset.historyTeam);
      }

      const player = e.target.closest("[data-open-player]");
      if (player) {
        e.preventDefault();
        if ($("#history-modal").classList.contains("open")) closeModal("history-modal");
        return openPlayer(player.dataset.openPlayer);
      }

      const team = e.target.closest("[data-open-team]");
      if (team) {
        e.preventDefault();
        return openTeam(team.dataset.openTeam);
      }
    });
  }

  // Make clickable rows focusable for keyboard users.
  function makeRowsFocusable() {
    $$("[data-open-player]:not(button), [data-open-team]:not(button):not(a)").forEach((el) => {
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  async function init() {
    bindEvents();
    bindTooltip();
    syncThemeToggle();
    route();
    window.addEventListener("popstate", route);
    try {
      const raw = await loadData();
      // After loading, so the season number and venue from the admin are used.
      applyBranding();
      buildModel(raw);
      renderDashboard();
      makeRowsFocusable();
      new MutationObserver(makeRowsFocusable).observe(document.body, { childList: true, subtree: true });
      $("#dashboard").classList.add("ready");
    } catch (err) {
      console.error(err);
      // The page shows skeletons while loading; the full-screen loader only appears to report a failure.
      $("#loader").classList.add("failed");
      $("#loader").innerHTML = `<div class="load-error"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i><br>The dashboard couldn't load. ${esc(err.message)}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
