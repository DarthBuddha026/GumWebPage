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

  // Each guild's season EXP from the admin's EXP document. Every event gives two amounts:
  // Guild EXP (`rules`, achievements' `exp`): gains only, never drops, no limit (`cap` is only the required
  // Guild EXP, where the dashboard's bar is full).
  // Guild Skill EXP (`skillRules`, achievements' `skillExp`): takes penalties, stays between 0 and the
  // last skill's EXP, and a skill is unlocked only while Skill EXP is at or above its threshold.
  // weeks: [{ id }] in schedule order; winners: [{ weekId, winner, loser, attacker, target }] for decided sieges;
  // playerTeam: Map of blader key -> guild name. Totals are clamped once per match day.
  // ponytail: clamping is per match day, not per event; split days into events if that matters.
  function guildExp(guildNames, weeks, winners, exp, playerTeam) {
    const skills = (exp.skills || []).slice().sort((a, b) => a.exp - b.exp);
    const skillTop = skills.length ? skills.at(-1).exp : Infinity;
    const achById = new Map((exp.achievements || []).map((a) => [a.id, a]));
    const parts = () => ({ siege: 0, raids: 0, achievements: 0 });
    const out = new Map(guildNames.map((g) => [g, { exp: 0, skillExp: 0, unlocked: 0, guild: parts(), skill: parts(), awards: [] }]));

    weeks.forEach((w) => {
      const delta = new Map();
      // rule: a key in rules/skillRules, or an achievement { exp, skillExp }.
      const add = (guild, part, rule) => {
        const g = out.get(guild);
        if (!g) return;
        const gain = Math.max(0, (typeof rule === "string" ? exp.rules?.[rule] : rule.exp) || 0);
        const skill = (typeof rule === "string" ? exp.skillRules?.[rule] : rule.skillExp) || 0;
        g.guild[part] += gain;
        g.skill[part] += skill;
        const d = delta.get(guild) || [0, 0];
        delta.set(guild, [d[0] + gain, d[1] + skill]);
      };

      // The attacker is the fixture's first guild. A successful target is paid instead of Attack Win.
      winners.filter((m) => m.weekId === w.id).forEach((m) => {
        if (m.winner === m.attacker) {
          add(m.winner, "siege", m.target ? "successfulTarget" : "attackWin");
          add(m.loser, "siege", "defendLoss");
        } else {
          add(m.winner, "siege", "defendWin");
          add(m.loser, "siege", "attackLoss");
        }
      });

      const raid = (exp.raids || {})[w.id];
      if (raid) {
        raid.attended.forEach((g) => add(g, "raids", "raidAttend"));
        raid.battles.forEach((b) => {
          add(playerTeam.get(b.winner === 1 ? b.p1 : b.p2), "raids", "raidBattleWin");
        });
      }

      (exp.awards || []).filter((a) => a.weekId === w.id).forEach((a) => {
        const ach = achById.get(a.achievementId);
        const guild = a.guild || playerTeam.get(a.player);
        if (!ach || !out.has(guild)) return;
        add(guild, "achievements", ach);
        out.get(guild).awards.push({ name: ach.name, exp: ach.exp, skillExp: ach.skillExp || 0, player: a.player || null });
      });

      delta.forEach(([gain, skill], name) => {
        const g = out.get(name);
        g.exp += gain;
        g.skillExp = Math.min(skillTop, Math.max(0, g.skillExp + skill));
      });
    });

    out.forEach((g) => (g.unlocked = skills.filter((s) => g.skillExp >= s.exp).length));
    return out;
  }

  window.leagueTools = { roundRobin, guildExp };
})();
