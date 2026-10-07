/* ==========================================================================
   Configuration + mock data source
   --------------------------------------------------------------------------
   Set `dataUrl` to a JSON endpoint that returns the same shape as
   generateMockData() to switch the dashboard to real data.
   ========================================================================== */

window.LEAGUE_CONFIG = {
  name: "GUM Guild Wars",
  shortName: "GW",
  season: 1,
  venue: "Main Event Hall — doors open 9:00 AM",
  socialUrl: "https://www.facebook.com/",
  socialLabel: "Facebook",
  footer: {
    copyright: "Gaming Underground Market",
    credits: [
      { label: "Statistics by", name: "GUM Technical", url: "#" },
      { label: "Built by", name: "Imperial DevStar", url: "#" },
    ],
  },

  // null → use generated mock data. Otherwise a URL returning the raw dataset.
  dataUrl: null,
  // The league admin's API (a separate deployment). Guilds, bladers, the schedule and
  // results come from here; null or unreachable → sample data.
  leagueUrl: "https://gum-guildwars-admin.vercel.app/api/league",
  // null → uploads are saved in this browser only. Otherwise a URL that accepts
  // a multipart POST with fields `playerKey` and `photo`.
  uploadUrl: null,

  // External standings links per bracket (leave url empty until it exists).
  // Add more letters (B, C, ...) and set each guild's `bracket` to split the league.
  brackets: {
    A: { url: "" },
  },

  // The guilds. `lat`/`lng` place the guild's logo on the map; `logo` is an image
  // path or URL (leave empty to show the guild's initials instead); `colors` is
  // [fill, border] in hex for the guild's badge and map marker (border is optional).
  teams: [
    { name: "Spartans", colors: ["#F4F4F4"], bracket: "A", location: "Batangas City", address: "Q3MF+VF4, Batangas City, 4200 Batangas", lat: 13.784638, lng: 121.073703, logo: "" },
    // Street-level: OpenStreetMap has Rizal Avenue in Poblacion but not house number 12.
    { name: "Dreadnoughts", colors: ["#8BA881"], bracket: "A", location: "Batangas City", address: "12 Rizal Ave, Poblacion, Batangas City, 4200 Batangas", lat: 13.755553, lng: 121.053293, logo: "" },
    { name: "Monarchs", colors: ["#FF5DA2"], bracket: "A", location: "Lipa City", address: "W4GW+M8C, Lipa City, Batangas", lat: 13.926688, lng: 121.145766, logo: "" },
    { name: "Warlords", colors: ["#C8102E", "#FFFFFF"], bracket: "A", location: "Lemery", address: "Illustre Avenue, corner P. Gomez, Lemery, 4209 Batangas", lat: 13.87915, lng: 120.916608, logo: "" },
    { name: "Nocturnals", colors: ["#1E4FB8", "#C0C7D0"], bracket: "A", location: "Ibaan", address: "R46H+X7F, Ibaan, Batangas", lat: 13.812438, lng: 121.128172, logo: "" },
    { name: "Hunters", colors: ["#000000", "#8C8C8C"], bracket: "A", location: "San Pascual", address: "S&R Building, San Antonio, San Pascual, 4204 Batangas", lat: 13.78927, lng: 121.016548, logo: "" },
    { name: "Knights", colors: ["#9E1B32", "#9AA0A6"], bracket: "A", location: "Batangas City", address: "Golden Country Homes, 15 Mars Street, Batangas City, 4200 Batangas", lat: 13.785969, lng: 121.073925, logo: "" },
    // Approximate: Parkway Square isn't on OpenStreetMap yet, so this is Lipa city centre.
    { name: "Wyverns", colors: ["#E53935"], bracket: "A", location: "Lipa City", address: "Parkway Square, Lipa City, Batangas", lat: 13.941648, lng: 121.138073, logo: "" },
    // Street-level: the highway through San Roque (OpenStreetMap doesn't list house number 20).
    { name: "Syndicates", colors: ["#000000", "#2D6BFF"], bracket: "A", location: "Santo Tomas", address: "20 Pan-Philippine Hwy, San Roque, Santo Tomas, 4232 Batangas", lat: 14.097774, lng: 121.147664, logo: "" },
  ],

  // Points awarded per finish type.
  finishPoints: { spin: 1, over: 2, burst: 2, extreme: 3 },
  pointsToWin: 4,

  // A player must meet both to appear on leaderboards / be ranked.
  eligibilityAttendance: 0.5,
  minGames: 3,

  map: { center: [13.84, 121.06], zoom: 11 },
};

(function () {
  // Small deterministic PRNG so the mock dataset is stable between reloads.
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const LOCATIONS = [
    { name: "Quezon City", lat: 14.676, lng: 121.0437 },
    { name: "Caloocan", lat: 14.6507, lng: 120.9676 },
    { name: "Valenzuela", lat: 14.7011, lng: 120.983 },
    { name: "Manila", lat: 14.5995, lng: 120.9842 },
    { name: "Makati", lat: 14.5547, lng: 121.0244 },
    { name: "Mandaluyong", lat: 14.5794, lng: 121.0359 },
    { name: "Taguig", lat: 14.5176, lng: 121.0509 },
    { name: "Pasig", lat: 14.5764, lng: 121.0851 },
    { name: "Marikina", lat: 14.6507, lng: 121.1029 },
    { name: "Antipolo", lat: 14.6255, lng: 121.1245 },
    { name: "Pasay", lat: 14.5378, lng: 121.0014 },
    { name: "Parañaque", lat: 14.4793, lng: 121.0198 },
    { name: "Las Piñas", lat: 14.4445, lng: 120.9939 },
    { name: "Muntinlupa", lat: 14.4081, lng: 121.0415 },
    { name: "Cavite", lat: 14.4791, lng: 120.897 },
    { name: "Laguna", lat: 14.27, lng: 121.13 },
  ];

  const TEAM_ADJ = ["Crimson", "Iron", "Storm", "Shadow", "Golden", "Vortex", "Neon", "Silent", "Blazing", "Frost", "Thunder", "Lunar", "Savage", "Royal", "Phantom", "Cyber"];
  const TEAM_NOUN = ["Dragons", "Spinners", "Pegasus", "Titans", "Ravens", "Wolves", "Strikers", "Cyclones", "Knights", "Vipers", "Hawks", "Reapers", "Sentinels", "Comets", "Phoenix", "Rhinos"];
  const NAME_A = ["Kai", "Ren", "Zed", "Rio", "Jax", "Leo", "Max", "Ace", "Nico", "Sky", "Dax", "Eli", "Kenji", "Taro", "Miko", "Yuri", "Jun", "Ash", "Luca", "Vin"];
  const NAME_B = ["blade", "storm", "fang", "spin", "drift", "volt", "nova", "rush", "strike", "wing", "core", "flux", "hawk", "byte", "fire", "frost"];

  const ACHIEVEMENT_POOL = [
    "Season 0 Champion",
    "Season 0 Finalist",
    "Regional Open Champion",
    "Regional Open Finalist",
    "Top 8 — Invitational",
    "Perfect Week Award",
    "Most Extreme Finishes",
  ];

  function pickWeighted(rand, weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (const [k, w] of Object.entries(weights)) {
      if ((r -= w) <= 0) return k;
    }
    return Object.keys(weights)[0];
  }

  // Round-robin pairings (circle method). Returns an array of rounds.
  function roundRobin(items) {
    const list = items.slice();
    if (list.length % 2) list.push(null);
    const rounds = [];
    for (let r = 0; r < list.length - 1; r++) {
      const pairs = [];
      for (let i = 0; i < list.length / 2; i++) {
        const a = list[i];
        const b = list[list.length - 1 - i];
        if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      list.splice(1, 0, list.pop());
    }
    return rounds;
  }

  // Shared with the league admin (schedule generator).
  window.leagueTools = { roundRobin };

  window.generateMockData = function (seed = 7) {
    const rand = mulberry32(seed);
    const cfg = window.LEAGUE_CONFIG;
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const brackets = Object.keys(cfg.brackets);
    const teamsPerBracket = 8;
    const rosterSize = 5;

    // --- Teams: the configured guilds, or generated ones if none are listed ---
    const usedTeamNames = new Set();
    const teams = [];
    if (cfg.teams && cfg.teams.length) {
      cfg.teams.forEach((t) => teams.push({ ...t, bracket: t.bracket || brackets[0], logo: t.logo || "" }));
    } else brackets.forEach((bracket) => {
      for (let i = 0; i < teamsPerBracket; i++) {
        let name;
        do name = `${pick(TEAM_ADJ)} ${pick(TEAM_NOUN)}`;
        while (usedTeamNames.has(name));
        usedTeamNames.add(name);
        const loc = pick(LOCATIONS);
        teams.push({
          name,
          bracket,
          location: loc.name,
          lat: loc.lat + (rand() - 0.5) * 0.05,
          lng: loc.lng + (rand() - 0.5) * 0.05,
          logo: "",
        });
      }
    });

    // --- Players ---
    const usedPlayerNames = new Set();
    const players = [];
    const skill = {};
    const style = {};
    let keySeq = 1;
    teams.forEach((team) => {
      for (let i = 0; i < rosterSize; i++) {
        let name;
        do name = `${pick(NAME_A)}${pick(NAME_B).replace(/^./, (c) => c.toUpperCase())}`;
        while (usedPlayerNames.has(name));
        usedPlayerNames.add(name);
        const key = `GW-${String(keySeq++).padStart(4, "0")}`;
        const achievements = [];
        if (rand() < 0.12) achievements.push(pick(ACHIEVEMENT_POOL));
        if (rand() < 0.05) achievements.push(pick(ACHIEVEMENT_POOL));
        players.push({ key, name, team: team.name, photo: "", achievements: [...new Set(achievements)], beys: 0 });
        skill[key] = 0.6 + rand() * 0.9;
        style[key] = { spin: 1 + rand() * 3, over: 1 + rand() * 3, burst: 1 + rand() * 2.5, extreme: 0.3 + rand() * 1.2 };
      }
    });
    players.forEach((p) => (p.beys = 3 + Math.floor(rand() * 9)));

    const rosterOf = (teamName) => players.filter((p) => p.team === teamName);

    // --- Schedule ---
    // A round robin needs (guilds - 1) weeks, or one extra week for a bye with an odd count.
    const biggestBracket = Math.max(...brackets.map((b) => teams.filter((t) => t.bracket === b).length));
    const weekCount = Math.max(1, biggestBracket % 2 ? biggestBracket : biggestBracket - 1);
    const completedWeeks = Math.min(4, weekCount - 1);
    const liveWeekShare = 0.5;
    const startDate = Date.UTC(2026, 8, 6); // first Sunday of the season
    const weeks = Array.from({ length: weekCount }, (_, i) => {
      const date = new Date(startDate + i * 7 * 86400000);
      return { label: `Week ${i + 1}`, date: date.toISOString().slice(0, 10), progress: 0 };
    });

    const matches = [];
    let matchSeq = 1;

    function playBout(p1, p2) {
      const rounds = [];
      let s1 = 0;
      let s2 = 0;
      const pWin = skill[p1.key] / (skill[p1.key] + skill[p2.key]);
      while (s1 < cfg.pointsToWin && s2 < cfg.pointsToWin && rounds.length < 12) {
        const p1Wins = rand() < pWin;
        const winner = p1Wins ? p1 : p2;
        const finish = pickWeighted(rand, style[winner.key]);
        const pts = cfg.finishPoints[finish];
        if (p1Wins) s1 += pts;
        else s2 += pts;
        rounds.push({ winner: p1Wins ? 1 : 2, finish });
      }
      return { p1: p1.key, p2: p2.key, p1Pts: s1, p2Pts: s2, rounds };
    }

    function lineup(teamName) {
      // Most of the time the roster's top 3 by "availability" show up.
      return rosterOf(teamName)
        .map((p) => ({ p, r: rand() + (skill[p.key] - 1) * 0.3 }))
        .sort((a, b) => b.r - a.r)
        .slice(0, 3)
        .map((x) => x.p);
    }

    brackets.forEach((bracket) => {
      const bracketTeams = teams.filter((t) => t.bracket === bracket).map((t) => t.name);
      roundRobin(bracketTeams).forEach((pairs, w) => {
        pairs.forEach(([t1, t2], i) => {
          const played = w < completedWeeks || (w === completedWeeks && i < pairs.length * liveWeekShare);
          const m = { id: `M${matchSeq++}`, week: weeks[w].label, bracket, team1: t1, team2: t2, bouts: [] };
          if (played) {
            const l1 = lineup(t1);
            const l2 = lineup(t2);
            for (let b = 0; b < 3; b++) m.bouts.push(playBout(l1[b], l2[b]));
          }
          matches.push(m);
        });
      });
    });

    weeks.forEach((wk) => {
      const inWeek = matches.filter((m) => m.week === wk.label);
      const done = inWeek.filter((m) => m.bouts.length).length;
      wk.progress = inWeek.length ? Math.round((done / inWeek.length) * 100) : 0;
    });

    return {
      mock: true,
      updatedAt: new Date().toISOString(),
      weeks,
      teams,
      players,
      matches,
    };
  };
})();
