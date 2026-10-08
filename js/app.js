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
      const base = { id: m.id, week: weekLabel.get(m.weekId), bracket: bracketOf.get(m.team1) || "A", team1: m.team1, team2: m.team2, bouts: [] };
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
        return { label: w.label, date: w.date, progress: inWeek.length ? Math.round((done / inWeek.length) * 100) : 0 };
      });

    return {
      updatedAt: league.updatedAt,
      weeks,
      teams: league.guilds,
      players: league.players.map((p) => ({ ...p, achievements: p.achievements || [] })),
      matches,
    };
  }

  function emptyLine() {
    return { games: 0, wins: 0, losses: 0, points: 0, conceded: 0, spin: 0, over: 0, burst: 0, extreme: 0 };
  }

  function addBout(line, myPts, oppPts, rounds, side) {
    line.games++;
    line.points += myPts;
    line.conceded += oppPts;
    if (myPts > oppPts) line.wins++;
    else if (myPts < oppPts) line.losses++;
    rounds.forEach((r) => {
      if (r.winner === side && line[r.finish] !== undefined) line[r.finish]++;
    });
  }

  function finalizeLine(line) {
    const g = line.games || 0;
    line.winRate = g ? line.wins / g : 0;
    line.ppg = g ? line.points / g : 0;
    Object.keys(FINISHES).forEach((f) => (line[`${f}PG`] = g ? line[f] / g : 0));
    line.defense = g ? CFG.pointsToWin - line.conceded / g : 0;
    line.ptDiff = line.points - line.conceded;
    return line;
  }

  function mvpScore(line, attendance) {
    if (!line.games) return 0;
    // Smoothed win rate so a 2–0 record doesn't outrank a 9–1 record.
    const smoothedWR = (line.wins + 1) / (line.games + 2);
    return smoothedWR * 6 + line.ppg * 1 + line.extremePG * 1.5 + Math.max(line.defense, 0) * 0.5 + attendance * 2;
  }

  // League tie-break: MVP score > win rate > point differential
  function leagueSort(a, b) {
    return b.mvp - a.mvp || b.winRate - a.winRate || b.ptDiff - a.ptDiff || a.name.localeCompare(b.name);
  }

  // Guild tie-break: match wins > win rate > set diff > points diff
  function teamSort(a, b) {
    return b.wins - a.wins || b.winRate - a.winRate || b.setDiff - a.setDiff || b.ptDiff - a.ptDiff || a.name.localeCompare(b.name);
  }

  function computeCurrentWeek(weeks) {
    const live = weeks.find((w) => w.progress > 0 && w.progress < 100);
    if (live) return live.label;
    const started = weeks.filter((w) => w.progress > 0);
    return (started.at(-1) || weeks[0] || { label: "Week 1" }).label;
  }

  function buildModel(raw) {
    state.raw = raw;
    state.currentWeek = computeCurrentWeek(raw.weeks || []);

    const teams = raw.teams.map((t) => ({ ...t, wins: 0, losses: 0, played: 0, points: 0, conceded: 0, setWins: 0, setLosses: 0 }));
    const teamsByName = new Map(teams.map((t) => [t.name, t]));

    const players = raw.players.map((p) => ({
      ...p,
      achievements: p.achievements || [],
      overall: emptyLine(),
      weekly: emptyLine(),
      appearances: new Set(),
    }));
    const playersByKey = new Map(players.map((p) => [p.key, p]));

    raw.matches.forEach((m) => {
      const t1 = teamsByName.get(m.team1);
      const t2 = teamsByName.get(m.team2);

      // Default/DQ wins count for the guilds' records only, not for blader stats.
      if (m.defaultWinner) {
        const winner1 = m.defaultWinner === m.team1;
        m.result = { bouts1: 0, bouts2: 0, pts1: 0, pts2: 0, winner: m.defaultWinner, byDefault: true };
        [[t1, winner1], [t2, !winner1]].forEach(([t, won]) => {
          if (!t) return;
          t.played++;
          if (won) t.wins++;
          else t.losses++;
        });
        return;
      }

      if (!m.bouts || !m.bouts.length) return;
      let b1 = 0;
      let b2 = 0;
      let pts1 = 0;
      let pts2 = 0;

      m.bouts.forEach((bout) => {
        pts1 += bout.p1Pts;
        pts2 += bout.p2Pts;
        if (bout.p1Pts > bout.p2Pts) b1++;
        else if (bout.p2Pts > bout.p1Pts) b2++;

        const rounds = bout.rounds || [];
        [[playersByKey.get(bout.p1), bout.p1Pts, bout.p2Pts, 1], [playersByKey.get(bout.p2), bout.p2Pts, bout.p1Pts, 2]].forEach(([p, mine, theirs, side]) => {
          if (!p) return;
          addBout(p.overall, mine, theirs, rounds, side);
          if (m.week === state.currentWeek) addBout(p.weekly, mine, theirs, rounds, side);
          p.appearances.add(m.id);
        });
      });

      const winner1 = b1 > b2 || (b1 === b2 && pts1 >= pts2);
      m.result = { bouts1: b1, bouts2: b2, pts1, pts2, winner: winner1 ? m.team1 : m.team2 };

      [[t1, b1, b2, pts1, pts2, winner1], [t2, b2, b1, pts2, pts1, !winner1]].forEach(([t, bw, bl, pf, pa, won]) => {
        if (!t) return;
        t.played++;
        t.setWins += bw;
        t.setLosses += bl;
        t.points += pf;
        t.conceded += pa;
        if (won) t.wins++;
        else t.losses++;
      });
    });

    teams.forEach((t) => {
      t.winRate = t.played ? t.wins / t.played : 0;
      t.setDiff = t.setWins - t.setLosses;
      t.ptDiff = t.points - t.conceded;
    });

    players.forEach((p) => {
      const team = teamsByName.get(p.team);
      p.bracket = team ? team.bracket : "-";
      finalizeLine(p.overall);
      finalizeLine(p.weekly);
      p.attendance = team && team.played ? Math.min(p.appearances.size / team.played, 1) : 0;
      p.eligible = p.overall.games >= (CFG.minGames || 1) && p.attendance >= CFG.eligibilityAttendance;
      p.mvp = mvpScore(p.overall, p.attendance);
      p.weekly.mvp = mvpScore(p.weekly, 1);
      p.winRate = p.overall.winRate;
      p.ptDiff = p.overall.ptDiff;
    });

    state.teams = teams.slice().sort(teamSort);
    state.teamsByName = teamsByName;
    state.players = players;
    state.playersByKey = playersByKey;
    state.league = players.filter((p) => p.eligible).sort(leagueSort);
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
      .map((c) => `<span>${esc(c.label)} <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a></span>`)
      .join("");
    $("#footer").innerHTML = `<span>&copy; ${esc(CFG.footer.copyright)}</span>${credits}`;

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

  function renderSchedule() {
    const weeks = state.raw.weeks || [];

    $("#schedule-list").innerHTML = weeks
      .map((w, i) => {
        const count = state.raw.matches.filter((m) => m.week === w.label).length;
        const status = w.progress >= 100 ? "Complete" : w.progress > 0 ? `${w.progress}% played` : "Upcoming";
        return `
          <li class="list-item static">
            <span class="avatar ${w.label === state.currentWeek ? "pink" : ""}" aria-hidden="true">${i + 1}</span>
            <div class="stack">
              <span class="primary">${esc(w.label)}</span>
              <span class="secondary"><span>${esc(longDate(w.date))}</span><span>${plural(count, "team match", "team matches")}</span><span>${esc(status)}</span></span>
            </div>
          </li>`;
      })
      .join("");
  }

  function renderHero() {
    const weeks = state.raw.weeks || [];
    const played = state.raw.matches.filter((m) => m.bouts?.length || m.defaultWinner).length;
    const total = state.raw.matches.length;
    const withGames = state.players.filter((p) => p.overall.games);
    const avgPPG = withGames.length ? withGames.reduce((s, p) => s + p.overall.ppg, 0) / withGames.length : 0;
    const current = weeks.find((w) => w.label === state.currentWeek);
    const weekText = !current
      ? "The season hasn't started yet."
      : current.progress >= 100
        ? `${current.label} is complete.`
        : `${current.label} is underway.`;

    const progressText = !total
      ? "The schedule hasn't been posted yet."
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
    const rows = [
      { title: "MVP leader", p: league[0], value: (p) => fmt2(p.mvp), unit: "MVP score" },
      { title: "Top scorer", p: best((p) => p.overall.points), value: (p) => p.overall.points, unit: "points this season" },
      { title: "Sharpest blade", p: league.slice().sort((a, b) => b.winRate - a.winRate || b.mvp - a.mvp)[0], value: (p) => pct(p.winRate), unit: "win rate" },
      { title: "Iron wall", p: best((p) => p.overall.defense), value: (p) => fmt2(p.overall.conceded / p.overall.games), unit: "points given up per game" },
      { title: "Stamina King", finish: "spin", p: best((p) => p.overall.spinPG), value: (p) => fmt2(p.overall.spinPG), unit: "stamina finishes per game" },
      { title: "Overlord", finish: "over", p: best((p) => p.overall.overPG), value: (p) => fmt2(p.overall.overPG), unit: "over finishes per game" },
      { title: "Burst God", finish: "burst", p: best((p) => p.overall.burstPG), value: (p) => fmt2(p.overall.burstPG), unit: "burst finishes per game" },
      { title: "Extreme Champion", finish: "extreme", p: best((p) => p.overall.extremePG), value: (p) => fmt2(p.overall.extremePG), unit: "extreme finishes per game" },
    ];

    $("#titles-list").innerHTML = rows
      .map((r) => {
        const sw = r.finish ? `<span class="title-swatch" style="--sw:${FINISHES[r.finish].color}" aria-hidden="true"></span>` : "";
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
    $("#overall-finish-title").textContent = "Whole season";
    $("#weekly-finish-title").textContent = state.currentWeek;

    const overall = state.league
      .slice()
      .sort((a, b) => b.overall[field] - a.overall[field] || leagueSort(a, b))
      .slice(0, 10);
    const weekly = state.players
      .filter((p) => p.weekly.games > 0)
      .sort((a, b) => b.weekly[field] - a.weekly[field] || b.weekly.mvp - a.weekly.mvp)
      .slice(0, 10);

    $("#overall-finish-body").innerHTML = playerRows(overall, (p) => fmt2(p.overall[field]), "No qualified bladers yet.");
    $("#weekly-finish-body").innerHTML = playerRows(weekly, (p) => fmt2(p.weekly[field]), `No battles recorded in ${state.currentWeek} yet.`);
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
        ? `<div class="roster">${players.map(bladerCard).join("")}</div>`
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

  function bladerCard(p) {
    return `
      <div class="blader-card" data-open-player="${esc(p.key)}">
        ${playerAvatar(p)}
        <div class="blader-info">
          <div class="blader-name">${esc(p.name)}${p.ign ? ` | ${esc(p.ign)}` : ""}</div>
          <div class="blader-tags">${roleTag(p)}${rankTag(p)}${bracketBadge(p.bracket)}<span class="tag">${esc(p.team)}</span></div>
        </div>
        <div class="blader-score"><b>${fmt2(p.mvp)}</b><span>MVP score</span></div>
      </div>`;
  }

  function renderRoster(teamName) {
    const t = state.teamsByName.get(teamName);
    setText("search-title", t.name);
    // Guild Leader first, then Battle Master, then everyone else by MVP score.
    const roster = state.players.filter((p) => p.team === t.name).sort((a, b) => roleOrder(a) - roleOrder(b) || b.mvp - a.mvp);
    $("#roster-view").innerHTML = `
      <div class="roster">
        <div class="stat-strip">
          <div><b>#${t.bracketRank}</b><span>${SINGLE_BRACKET ? "League rank" : `In bracket ${esc(t.bracket)}`}</span></div>
          <div><b>${record(t.wins, t.losses)}</b><span>Record</span></div>
          <div><b>${pct(t.winRate)}</b><span>Win rate</span></div>
          <div><b>${t.points}</b><span>Points</span></div>
        </div>
        <div class="roster-meta">
          <p>${t.location ? `${esc(t.location)}, ` : ""}${plural(roster.length, "blader")}</p>
          <button class="btn-secondary" data-history-team="${esc(t.name)}"><i class="fas fa-scroll" aria-hidden="true"></i> Battle log</button>
        </div>
        ${roster.map(bladerCard).join("") || emptyState("fa-user-slash", "No bladers on this guild", "Bladers appear here once they're registered.")}
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
              <span class="tag">${esc(p.key)}</span>
              <button class="guild-link" data-open-team="${esc(p.team)}">${esc(p.team)}</button>
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

        ${achievements ? `<div class="stat-block"><h5>Achievements</h5><div class="achievements">${achievements}</div></div>` : ""}
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

  async function shareProfile() {
    const target = $("#profile-capture");
    if (!target) return;
    toast("Making the profile card…");
    try {
      await loadHtml2canvas();
    } catch (err) {
      console.error(err);
      toast("Sharing isn't available right now. Check your connection and try again.");
      return;
    }
    try {
      const canvas = await html2canvas(target, { backgroundColor: "#000000", scale: 2, useCORS: true });
      state.shareBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      $("#share-image").src = canvas.toDataURL("image/png");
      $("#share-overlay").classList.add("open");
    } catch (err) {
      console.error(err);
      toast("Couldn't make the profile card. Try again.");
    }
  }

  const shareFileName = () => `${state.search.stack.at(-1)?.arg || "blader"}-profile.png`;

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

        const bouts = m.bouts
          .map((b) => {
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
                  <span class="bout-team">${esc(t.name)}</span>
                </div>
                <div class="bout-center">
                  <span class="bout-score">${a}–${z}</span>
                  <div class="bout-rounds">${rounds}</div>
                  <span class="outcome ${outcome}">${outcome === "win" ? "Win" : outcome === "loss" ? "Loss" : "Draw"}</span>
                </div>
                <div class="bout-side right">
                  <span class="bout-player" ${them.key ? `data-open-player="${esc(them.key)}"` : ""}>${esc(them.name)}</span>
                  <span class="bout-team">${esc(opp)}</span>
                </div>
              </div>`;
          })
          .join("");

        return `
          <div class="encounter ${won ? "won" : "lost"}" id="enc-${i}">
            <button class="encounter-head" data-toggle-group="enc-${i}" aria-expanded="false" aria-controls="enc-${i}-bouts">
              <span>
                <span class="encounter-title">${esc(t.name)}<span class="vs">vs</span>${esc(opp)}</span>
                <span class="encounter-sub"><span>${esc(m.week)}</span><span>${plural(m.bouts.length, "battle")}</span><span>${myPts}–${oppPts} points</span></span>
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
          case "open-schedule": return openModal("schedule-modal");
          case "open-brackets": return openModal("brackets-modal");
          case "share-profile": return shareProfile();
        }
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

  // Keep the loading screen up long enough to read, even when data is instant.
  const MIN_LOADER_MS = 600;
  const bootStart = performance.now();

  function hideLoader() {
    const wait = Math.max(0, MIN_LOADER_MS - (performance.now() - bootStart));
    setTimeout(() => {
      const loader = $("#loader");
      loader.style.opacity = "0";
      $("#dashboard").classList.add("ready");
      setTimeout(() => (loader.style.display = "none"), 300);
    }, wait);
  }

  async function init() {
    bindEvents();
    bindTooltip();
    try {
      const raw = await loadData();
      // After loading, so the season number and venue from the admin are used.
      applyBranding();
      buildModel(raw);
      renderDashboard();
      makeRowsFocusable();
      new MutationObserver(makeRowsFocusable).observe(document.body, { childList: true, subtree: true });
      hideLoader();
    } catch (err) {
      console.error(err);
      $("#loader").innerHTML = `<div class="load-error"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i><br>The dashboard couldn't load. ${esc(err.message)}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
