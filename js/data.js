/* ==========================================================================
   Configuration
   --------------------------------------------------------------------------
   Guilds, bladers, the schedule and results all come from the league admin
   (`leagueUrl`). This file holds site settings, scoring rules and a small
   helper the admin loads from here.
   ========================================================================== */

window.LEAGUE_CONFIG = {
  name: "GUM Guild Wars",
  shortName: "GW",
  season: 1,
  venue: "Main Event Hall — doors open 9:00 AM",
  socialUrl: "https://www.facebook.com/gumverseofficial",
  socialLabel: "Facebook",
  footer: {
    copyright: "Gaming Underground Market",
    copyrightUrl: "https://www.facebook.com/gamingundergroundmarket",
    credits: [
      { label: "Statistics by", name: "GUM Technical" },
      { label: "Built by", name: "Imperial DevStar", url: "https://lrvelasquez.vercel.app/" },
    ],
  },

  // The league admin's API (a separate deployment). Guilds, bladers, the schedule
  // and results all come from here.
  leagueUrl: "https://gumverse-dashboard.vercel.app/api/league",

  // External standings links per bracket (leave url empty until it exists).
  // Add more letters (B, C, ...) and set each guild's `bracket` in the admin to split the league.
  brackets: {
    A: { url: "" },
  },

  // Points awarded per finish type.
  finishPoints: { spin: 1, over: 2, burst: 2, extreme: 3 },
  pointsToWin: 4,

  // A player must meet both to appear on leaderboards / be ranked.
  eligibilityAttendance: 0.5,
  minGames: 3,

  map: { center: [13.84, 121.06], zoom: 11 },
};

// Shared with the league admin, which loads this file for its schedule generator.
(function () {
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

  // Each guild's season EXP from the admin's EXP document (cap, rules, skills, achievements, awards, raids).
  // weeks: [{ id, label }] in schedule order; winners: [{ weekId, winner, loser }] for decided sieges;
  // playerTeam: Map of blader key -> guild name. EXP is applied one match day at a time: it never goes
  // below 0, never below the EXP of a skill the guild has already unlocked, and never above the cap.
  // ponytail: the floor is checked per match day, not per event; split days into events if that matters.
  function guildExp(guildNames, weeks, winners, exp, playerTeam) {
    const rules = exp.rules || {};
    const skills = (exp.skills || []).slice().sort((a, b) => a.exp - b.exp);
    const cap = exp.cap > 0 ? exp.cap : Infinity;
    const achById = new Map((exp.achievements || []).map((a) => [a.id, a]));
    const out = new Map(guildNames.map((g) => [g, { exp: 0, siege: 0, raids: 0, achievements: 0, unlocked: 0, awards: [] }]));

    weeks.forEach((w) => {
      const delta = new Map();
      const add = (guild, part, n) => {
        const g = out.get(guild);
        if (!g || !n) return;
        g[part] += n;
        delta.set(guild, (delta.get(guild) || 0) + n);
      };

      winners.filter((m) => m.weekId === w.id).forEach((m) => {
        add(m.winner, "siege", rules.siegeWin);
        add(m.loser, "siege", rules.siegeLoss);
      });

      const raid = (exp.raids || {})[w.id];
      if (raid) {
        if (raid.attended.length) guildNames.forEach((g) => add(g, "raids", raid.attended.includes(g) ? rules.raidAttend : rules.raidMissed));
        raid.battles.forEach((b) => {
          add(playerTeam.get(b.winner === 1 ? b.p1 : b.p2), "raids", rules.raidBattleWin);
          add(playerTeam.get(b.winner === 1 ? b.p2 : b.p1), "raids", rules.raidBattleLoss);
        });
      }

      (exp.awards || []).filter((a) => a.weekId === w.id).forEach((a) => {
        const ach = achById.get(a.achievementId);
        const guild = a.guild || playerTeam.get(a.player);
        if (!ach || !out.has(guild)) return;
        add(guild, "achievements", ach.exp);
        out.get(guild).awards.push({ name: ach.name, exp: ach.exp, player: a.player || null });
      });

      out.forEach((g, name) => {
        const floor = g.unlocked ? skills[g.unlocked - 1].exp : 0;
        g.exp = Math.min(cap, Math.max(floor, g.exp + (delta.get(name) || 0)));
        while (g.unlocked < skills.length && g.exp >= skills[g.unlocked].exp) g.unlocked++;
      });
    });
    return out;
  }

  window.leagueTools = { roundRobin, guildExp };
})();
