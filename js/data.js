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

  // Guild Quest badges. Organizers mark which guilds completed each one in the admin's Guild EXP tab,
  // keyed by `id`, so keep ids stable when editing the text.
  guildQuests: [
    { id: "q1", numeral: "I", name: "The Siegebound Oath", text: "Attend at least 3 of the 4 Guild Sieges.", icon: "fa-flag" },
    { id: "q2", numeral: "II", name: "Assembly of the Grand Company", text: "At least 5 registered members of the same guild take part together in 1 Grand Raid.", icon: "fa-people-group" },
    { id: "q3", numeral: "III", name: "Chronicle of the Guild", text: "Create an official guild roster introduction video and submit it to GUM.", icon: "fa-video" },
    { id: "q4", numeral: "IV", name: "Trial of Fellowship", text: "At least 3 registered members of the same guild take part together in 2 separate Weekly Pods.", icon: "fa-handshake" },
    { id: "q5", numeral: "V", name: "Fellowship Beyond the Arena", text: "Submit a presentable video of at least 3 minutes showing the guild bonding outside regular tournament play.", icon: "fa-campground" },
  ],

  // ----- Guild EXP (GGW2 handbook, section II) -----
  // Guild EXP only goes up. It comes from Weekly Pods and Grand Raids, player achievements and shop support.
  // Weekly Pod values; a Grand Raid pays `raidMultiplier` times these. They all stack.
  eventExp: {
    single: 2, // single entry
    double: 4, // double entry (total)
    swiss: 10, // Swiss King or Queen
    champion: 10,
    championBattleMaster: 5, // on top of champion
    championLeader: 10, // on top of champion
    bountyBattleMaster: 5, // per opposing Battle Master defeated in the Top Cut
    bountyLeader: 10, // per opposing Guild Leader defeated in the Top Cut
    raidMultiplier: 2,
  },
  // Shop support, per approved receipt: the highest tier the qualifying amount reaches.
  shopExp: [
    { min: 1000, exp: 4 },
    { min: 500, exp: 2 },
  ],
  // Player achievements (section 2.6). Each registered blader can earn each one once; the EXP goes to their guild.
  // Organizers tick them in the admin's Guild EXP tab, keyed by `id`, so keep ids stable when editing the text.
  playerAchievements: [
    { id: "pa1", name: "War Machine", exp: 10, text: "Be deployed in three consecutive successful Guild attack legs during Guild Sieges." },
    { id: "pa2", name: "Fortress", exp: 10, text: "Be deployed in three consecutive successful Guild defense legs during Guild Sieges." },
    { id: "pa3", name: "Full Deployment", exp: 5, text: "Be part of a Guild whose entire official roster participates in all four Grand Raids." },
    { id: "pa4", name: "Perfect War", exp: 10, text: "Be deployed in a Guild Siege attack or defense leg won without losing an individual matchup." },
    { id: "pa5", name: "We Feast Tonight!", exp: 5, text: "Be deployed in and complete the Guild's first official Guild Siege encounter." },
    { id: "pa6", name: "Extreme Specialist", exp: 10, text: "Score at least two Xtreme Finishes in one individual matchup during a Grand Raid." },
    { id: "pa7", name: "Swiss King", exp: 5, text: "Become Swiss King or Queen at an EXP-accredited Weekly Pod or Grand Raid." },
    { id: "pa8", name: "The Strongest", exp: 5, text: "Become Champion at an EXP-accredited Weekly Pod or Grand Raid." },
    { id: "pa9", name: "King Slayer", exp: 5, text: "Defeat an opposing Guild's registered Guild Leader for the first time during the Top Cut of a Weekly Pod or Grand Raid." },
    { id: "pa10", name: "General Executioner", exp: 5, text: "Defeat an opposing Guild's registered Battle Master for the first time during the Top Cut of a Weekly Pod or Grand Raid." },
  ],

  // ----- Guild Skill EXP (section III, mastery results) -----
  // Only Guild Siege legs move it, one result at a time, and it stays between 0 and skillExpMax.
  // A successful target attack replaces Attack Win; a failed one is a normal Attack Loss.
  siegeSkillExp: { attackWin: 20, attackLoss: -4, defendWin: 16, defendLoss: -8, successfulTarget: 40 },
  skillExpMax: 300,
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

  // Guild EXP for one blader's entry at a Weekly Pod or Grand Raid. `role` and each defeat's `role` are the
  // roles recorded on the event date (leader / battle-master / member).
  function entryExp(entry, type, cfg) {
    const E = cfg.eventExp;
    let n = entry.entries === 2 ? E.double : E.single;
    if (entry.swiss) n += E.swiss;
    if (entry.champion) n += E.champion + (entry.role === "leader" ? E.championLeader : entry.role === "battle-master" ? E.championBattleMaster : 0);
    (entry.defeated || []).forEach((d) => (n += d.role === "leader" ? E.bountyLeader : E.bountyBattleMaster));
    return type === "raid" ? n * E.raidMultiplier : n;
  }

  // Guild EXP for one shop receipt: the highest tier its amount reaches.
  const purchaseExp = (amount, cfg) => cfg.shopExp.find((t) => amount >= t.min)?.exp || 0;

  // Each guild's season EXP from the admin's EXP document and the siege results.
  // Guild EXP (`exp`) only goes up: Weekly Pods and Grand Raids (`exp.events`), player achievements
  // (`exp.playerAchievements`: achievement id -> blader keys) and shop receipts (`exp.purchases`).
  // Guild Skill EXP (`skillExp`) comes only from sieges, applied one result at a time and kept between 0 and
  // skillExpMax; a skill is unlocked while Skill EXP is at or above its threshold.
  // sieges: [{ winner, loser, attacker, target }] in the order they were played; the attacker is the fixture's
  // first guild. playerTeam: Map of blader key -> guild name (EXP goes to the blader's current guild).
  function guildExp(guildNames, sieges, exp, playerTeam, cfg = window.LEAGUE_CONFIG) {
    const S = cfg.siegeSkillExp;
    const skills = (exp.skills || []).slice().sort((a, b) => a.exp - b.exp);
    const out = new Map(guildNames.map((g) => [g, { exp: 0, skillExp: 0, unlocked: 0, guild: { events: 0, achievements: 0, shop: 0 }, siege: 0 }]));
    const gain = (guild, part, n) => {
      const g = out.get(guild);
      if (!g || !n) return;
      g.exp += n;
      g.guild[part] += n;
    };

    sieges.forEach((m) => {
      const attackerWon = m.winner === m.attacker;
      const pay = attackerWon
        ? [[m.winner, m.target ? S.successfulTarget : S.attackWin], [m.loser, S.defendLoss]]
        : [[m.winner, S.defendWin], [m.loser, S.attackLoss]];
      pay.forEach(([guild, n]) => {
        const g = out.get(guild);
        if (!g) return;
        g.siege += n;
        g.skillExp = Math.min(cfg.skillExpMax, Math.max(0, g.skillExp + n));
      });
    });

    (exp.events || []).forEach((ev) => ev.entries.forEach((en) => gain(playerTeam.get(en.player), "events", entryExp(en, ev.type, cfg))));

    const achById = new Map((cfg.playerAchievements || []).map((a) => [a.id, a]));
    Object.entries(exp.playerAchievements || {}).forEach(([id, keys]) => {
      const a = achById.get(id);
      if (a) keys.forEach((k) => gain(playerTeam.get(k), "achievements", a.exp));
    });

    (exp.purchases || []).forEach((p) => gain(p.guild, "shop", purchaseExp(p.amount, cfg)));

    out.forEach((g) => (g.unlocked = skills.filter((s) => g.skillExp >= s.exp).length));
    return out;
  }

  window.leagueTools = { roundRobin, guildExp, entryExp, purchaseExp };
})();
