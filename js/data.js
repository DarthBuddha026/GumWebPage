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

  // Philippine holidays shown on the schedule calendar. "regular" = regular holiday, "special" = special
  // non-working day. Add next year's list (and Eid al-Fitr / Eid al-Adha once proclaimed) as they're announced.
  holidays: [
    { date: "2026-01-01", name: "New Year's Day", type: "regular" },
    { date: "2026-02-17", name: "Chinese New Year", type: "special" },
    { date: "2026-04-02", name: "Maundy Thursday", type: "regular" },
    { date: "2026-04-03", name: "Good Friday", type: "regular" },
    { date: "2026-04-04", name: "Black Saturday", type: "special" },
    { date: "2026-04-09", name: "Araw ng Kagitingan", type: "regular" },
    { date: "2026-05-01", name: "Labor Day", type: "regular" },
    { date: "2026-06-12", name: "Independence Day", type: "regular" },
    { date: "2026-08-21", name: "Ninoy Aquino Day", type: "special" },
    { date: "2026-08-31", name: "National Heroes Day", type: "regular" },
    { date: "2026-10-31", name: "All Saints' Day Eve", type: "special" },
    { date: "2026-11-01", name: "All Saints' Day", type: "special" },
    { date: "2026-11-30", name: "Bonifacio Day", type: "regular" },
    { date: "2026-12-08", name: "Feast of the Immaculate Conception", type: "special" },
    { date: "2026-12-24", name: "Christmas Eve", type: "special" },
    { date: "2026-12-25", name: "Christmas Day", type: "regular" },
    { date: "2026-12-30", name: "Rizal Day", type: "regular" },
    { date: "2026-12-31", name: "Last Day of the Year", type: "special" },
  ],

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
    bountyGuild: 10, // per member of the Bounty Guild (Weekly Pods and Grand Raids) defeated in the Final Stage; stacks with the two above
    raidMultiplier: 2,
  },
  // Shop support, per approved receipt: the highest tier the qualifying amount reaches.
  shopExp: [
    { min: 1000, exp: 4 },
    { min: 500, exp: 2 },
  ],
  // Player achievements (section 2.6). Each registered blader can earn each one once; the EXP goes to their guild.
  // Organizers tick them in the admin's Guild EXP tab, keyed by `id`, so keep ids stable when editing the text.
  // One with `auto` isn't ticked: it comes from the recorded Weekly Pods, Grand Raids and siege scores (see earnedAchievements).
  // `icon` is the Font Awesome icon on the blader profile achievement badge.
  playerAchievements: [
    { id: "pa1", name: "War Machine", exp: 10, icon: "fa-hammer", auto: "attack-streak", text: "Be deployed in three consecutive successful Guild attack legs during Guild Sieges." },
    { id: "pa2", name: "Fortress", exp: 10, icon: "fa-chess-rook", auto: "defense-streak", text: "Be deployed in three consecutive successful Guild defense legs during Guild Sieges." },
    { id: "pa3", name: "Full Deployment", exp: 5, icon: "fa-people-group", auto: "full-deployment", text: "Be part of a Guild whose entire official roster participates in all four Grand Raids." },
    { id: "pa4", name: "Perfect War", exp: 10, icon: "fa-crown", auto: "perfect-leg", text: "Be deployed in a Guild Siege attack or defense leg won without losing an individual matchup." },
    { id: "pa5", name: "We Feast Tonight!", exp: 5, icon: "fa-drumstick-bite", auto: "first-encounter", text: "Be deployed in and complete the Guild's first official Guild Siege encounter." },
    { id: "pa6", name: "Extreme Specialist", exp: 10, icon: "fa-bolt", text: "Score at least two Xtreme Finishes in one individual matchup during a Grand Raid." },
    { id: "pa7", name: "Swiss King", exp: 5, icon: "fa-chess-king", auto: "swiss", text: "Become Swiss King or Queen at an EXP-accredited Weekly Pod or Grand Raid." },
    { id: "pa8", name: "The Strongest", exp: 5, icon: "fa-trophy", auto: "champion", text: "Become Champion at an EXP-accredited Weekly Pod or Grand Raid." },
    { id: "pa9", name: "King Slayer", exp: 5, icon: "fa-skull", auto: "leader", text: "Defeat an opposing Guild's registered Guild Leader for the first time during the Top Cut of a Weekly Pod or Grand Raid." },
    { id: "pa10", name: "General Executioner", exp: 5, icon: "fa-skull-crossbones", auto: "battle-master", text: "Defeat an opposing Guild's registered Battle Master for the first time during the Top Cut of a Weekly Pod or Grand Raid." },
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
  // roles recorded on the event date (leader / battle-master / member). A defeat's `bounty` marks a member of the
  // Bounty Guild drawn for the Weekly Pod or Grand Raid (doubled at raids like the rest). A defeat's `times: 2` means both
  // entries of a double-entry blader were beaten; each entry counts, so its lines appear (and pay) twice.
  // entryExpParts lists what the entry paid, one line each ({ kind, n, player? }, raid doubling included) for the
  // battle log; entryExp is their total.
  function entryExpParts(entry, type, cfg) {
    const E = cfg.eventExp;
    const x = type === "raid" ? E.raidMultiplier : 1;
    const parts = [entry.entries === 2 ? { kind: "double", n: E.double } : { kind: "single", n: E.single }];
    if (entry.swiss) parts.push({ kind: "swiss", n: E.swiss });
    if (entry.champion) {
      parts.push({ kind: "champion", n: E.champion });
      if (entry.role === "leader") parts.push({ kind: "champion-leader", n: E.championLeader });
      else if (entry.role === "battle-master") parts.push({ kind: "champion-battle-master", n: E.championBattleMaster });
    }
    (entry.defeated || []).flatMap((d) => (d.times === 2 ? [d, d] : [d])).forEach((d) => {
      if (d.role === "leader") parts.push({ kind: "bounty-leader", n: E.bountyLeader, player: d.player });
      else if (d.role === "battle-master") parts.push({ kind: "bounty-battle-master", n: E.bountyBattleMaster, player: d.player });
      if (d.bounty) parts.push({ kind: "bounty-guild", n: E.bountyGuild, player: d.player });
    });
    return parts.map((p) => ({ ...p, n: p.n * x }));
  }
  const entryExp = (entry, type, cfg) => entryExpParts(entry, type, cfg).reduce((sum, p) => sum + p.n, 0);

  // Guild EXP for one shop receipt: the highest tier its amount reaches.
  const purchaseExp = (amount, cfg) => cfg.shopExp.find((t) => amount >= t.min)?.exp || 0;

  // Who has each player achievement (achievement id -> blader keys). An `auto` one is worked out from the events (using
  // the roles recorded with each defeat) or the siege scores, so correcting either corrects it too; the rest are ticks.
  // legs: every Guild Siege fixture in play order, played or not: { week, round, attacker, defender, winner, bouts }.
  // `winner` is null until a leg is scored, and a leg won by default has no bouts, so nobody was deployed in it.
  const fromEvents = (test) => (exp) => new Set((exp.events || []).flatMap((ev) => ev.entries.filter(test).map((en) => en.player)));
  const deployed = (leg, side) => (leg.bouts || []).map((b) => (side === "attacker" ? b.p1 : b.p2)).filter(Boolean);

  // Won three legs in a row on this side, counting only the legs the blader was deployed in: losing one restarts their
  // run, sitting one out doesn't. A guild leg not scored yet restarts everyone's, since it could still be a loss.
  const streak = (side) => (exp, legs) => {
    const runs = new Map(); // guild -> blader -> legs in a row
    const earned = new Set();
    legs.forEach((leg) => {
      const guild = leg[side];
      if (!runs.has(guild)) runs.set(guild, new Map());
      const run = runs.get(guild);
      if (!leg.winner) return run.clear();
      new Set(deployed(leg, side)).forEach((k) => {
        const n = leg.winner === guild ? (run.get(k) || 0) + 1 : 0;
        run.set(k, n);
        if (n >= 3) earned.add(k);
      });
    });
    return earned;
  };

  // Every active blader on the guild's current roster entered all four Grand Raids. Each raid is one recorded event.
  const fullDeployment = (exp, legs, players) => {
    const raids = (exp.events || []).filter((ev) => ev.type === "raid").map((ev) => new Set(ev.entries.map((en) => en.player)));
    const active = players.filter((p) => p.active);
    if (raids.length < 4) return new Set();
    const missing = new Set(active.filter((p) => !raids.every((r) => r.has(p.key))).map((p) => p.team));
    return new Set(active.filter((p) => !missing.has(p.team)).map((p) => p.key));
  };

  // Deployed on the winning side of a leg where that side lost no bout.
  const perfectLeg = (exp, legs) => {
    const earned = new Set();
    legs.filter((leg) => leg.winner).forEach((leg) => {
      const attackerWon = leg.winner === leg.attacker;
      const lost = (leg.bouts || []).some((b) => (attackerWon ? b.p1Pts < b.p2Pts : b.p2Pts < b.p1Pts));
      if (!lost) deployed(leg, attackerWon ? "attacker" : "defender").forEach((k) => earned.add(k));
    });
    return earned;
  };

  // Deployed in the guild's first encounter (its first fixture and the return leg, same date and round) once every leg
  // of it is scored. It follows the schedule, so scoring a later encounter first doesn't count as the first.
  const firstEncounter = (exp, legs) => {
    const earned = new Set();
    new Set(legs.flatMap((leg) => [leg.attacker, leg.defender])).forEach((guild) => {
      const first = legs.find((leg) => leg.attacker === guild || leg.defender === guild);
      const other = first.attacker === guild ? first.defender : first.attacker;
      const encounter = legs.filter((leg) => leg.week === first.week && leg.round === first.round && [leg.attacker, leg.defender].includes(guild) && [leg.attacker, leg.defender].includes(other));
      if (!encounter.every((leg) => leg.winner)) return;
      encounter.forEach((leg) => deployed(leg, leg.attacker === guild ? "attacker" : "defender").forEach((k) => earned.add(k)));
    });
    return earned;
  };

  const AUTO_ACHIEVEMENTS = {
    "attack-streak": streak("attacker"),
    "defense-streak": streak("defender"),
    "full-deployment": fullDeployment,
    "perfect-leg": perfectLeg,
    "first-encounter": firstEncounter,
    swiss: fromEvents((en) => en.swiss),
    champion: fromEvents((en) => en.champion),
    leader: fromEvents((en) => (en.defeated || []).some((d) => d.role === "leader")),
    "battle-master": fromEvents((en) => (en.defeated || []).some((d) => d.role === "battle-master")),
  };
  function earnedAchievements(exp, legs = [], players = [], cfg = window.LEAGUE_CONFIG) {
    const earned = {};
    (cfg.playerAchievements || []).forEach((a) => {
      const work = AUTO_ACHIEVEMENTS[a.auto];
      earned[a.id] = work ? [...work(exp, legs, players)] : exp.playerAchievements?.[a.id] || [];
    });
    return earned;
  }

  // Each guild's season EXP from the admin's EXP document and the siege results.
  // Guild EXP (`exp`) only goes up: Weekly Pods and Grand Raids (`exp.events`), player achievements
  // (earnedAchievements) and shop receipts (`exp.purchases`).
  // Guild Skill EXP (`skillExp`) comes only from sieges, applied one result at a time and kept between 0 and
  // skillExpMax; a skill is unlocked while Skill EXP is at or above its threshold.
  // sieges: every fixture in the order they're played, [{ week, round, winner, loser, attacker, defender, target, bouts }]
  // (winner null until scored); the attacker is the fixture's first guild. playerTeam: Map of blader key -> guild name (EXP goes to the blader's current guild).
  // players: the bladers, for Full Deployment's roster.
  // `members` is each blader's share of the guild's EXP (blader key -> EXP); shop receipts belong to the guild alone.
  // `log` itemises every change for the battle log, in this order: siege results in play order
  // ({ kind: "siege", leg, result, n, applied, skillExp, unlocked, relocked }: `applied` is the change after clamping,
  // `unlocked`/`relocked` the skills it crossed), then { kind: "event", event, player, n, parts },
  // { kind: "achievement", achievement, player, n } and { kind: "shop", purchase, n }.
  function guildExp(guildNames, sieges, exp, playerTeam, players = [], cfg = window.LEAGUE_CONFIG) {
    const S = cfg.siegeSkillExp;
    const skills = (exp.skills || []).slice().sort((a, b) => a.exp - b.exp);
    const out = new Map(guildNames.map((g) => [g, { exp: 0, skillExp: 0, unlocked: 0, guild: { events: 0, achievements: 0, shop: 0 }, siege: 0, members: {}, log: [] }]));
    const gain = (guild, part, n, player, line) => {
      const g = out.get(guild);
      if (!g || !n) return;
      g.exp += n;
      g.guild[part] += n;
      if (player) g.members[player] = (g.members[player] || 0) + n;
      g.log.push({ ...line, player, n });
    };
    const reached = (v) => skills.filter((s) => v >= s.exp);

    sieges.filter((m) => m.winner).forEach((leg) => {
      const attackerWon = leg.winner === leg.attacker;
      const pay = attackerWon
        ? [[leg.winner, leg.target ? "successfulTarget" : "attackWin"], [leg.loser, "defendLoss"]]
        : [[leg.winner, "defendWin"], [leg.loser, "attackLoss"]];
      pay.forEach(([guild, result]) => {
        const g = out.get(guild);
        if (!g) return;
        const n = S[result];
        const before = g.skillExp;
        g.siege += n;
        g.skillExp = Math.min(cfg.skillExpMax, Math.max(0, g.skillExp + n));
        const was = reached(before);
        const now = reached(g.skillExp);
        g.log.push({
          kind: "siege", leg, result, n, applied: g.skillExp - before, skillExp: g.skillExp,
          unlocked: now.filter((s) => !was.includes(s)).map((s) => s.name),
          relocked: was.filter((s) => !now.includes(s)).map((s) => s.name),
        });
      });
    });

    (exp.events || []).forEach((ev) =>
      ev.entries.forEach((en) => {
        const parts = entryExpParts(en, ev.type, cfg);
        gain(playerTeam.get(en.player), "events", parts.reduce((sum, p) => sum + p.n, 0), en.player, { kind: "event", event: ev, parts });
      })
    );

    const earned = earnedAchievements(exp, sieges, players, cfg);
    (cfg.playerAchievements || []).forEach((a) => earned[a.id].forEach((k) => gain(playerTeam.get(k), "achievements", a.exp, k, { kind: "achievement", achievement: a })));

    (exp.purchases || []).forEach((p) => gain(p.guild, "shop", purchaseExp(p.amount, cfg), undefined, { kind: "shop", purchase: p }));

    out.forEach((g) => (g.unlocked = skills.filter((s) => g.skillExp >= s.exp).length));
    return out;
  }

  // ----- Blader and guild standings (the dashboard and the admin's Leaderboards tab) -----

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

  function finalizeLine(line, cfg) {
    const g = line.games || 0;
    line.winRate = g ? line.wins / g : 0;
    line.ppg = g ? line.points / g : 0;
    Object.keys(cfg.finishPoints).forEach((f) => (line[`${f}PG`] = g ? line[f] / g : 0));
    line.defense = g ? cfg.pointsToWin - line.conceded / g : 0;
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

  // Guild ranking, as in the Challonge bracket: match wins, then game wins, points difference,
  // points scored and Median-Buchholz. Guilds still level go to rankTeams' head-to-head.
  function teamSort(a, b) {
    return b.wins - a.wins || b.setWins - a.setWins || b.ptDiff - a.ptDiff || b.points - a.points || b.buchholz - a.buchholz;
  }

  // Sorts the guilds by teamSort; each group still level on all of it is ordered by game wins over
  // the other guilds in that group (head-to-head), then by name.
  function rankTeams(teams) {
    const sorted = teams.slice().sort(teamSort);
    for (let i = 0; i < sorted.length; ) {
      let j = i + 1;
      while (j < sorted.length && teamSort(sorted[i], sorted[j]) === 0) j++;
      const group = sorted.slice(i, j);
      const vs = (t) => group.reduce((n, o) => n + (t.gamesVs[o.name] || 0), 0);
      group.sort((a, b) => vs(b) - vs(a) || a.name.localeCompare(b.name));
      sorted.splice(i, group.length, ...group);
      i = j;
    }
    return sorted;
  }

  // Median-Buchholz: the match wins of every opponent faced (once per match), leaving out the best and
  // the worst when there are at least three.
  function medianBuchholz(opponentWins) {
    const w = opponentWins.slice().sort((a, b) => a - b);
    const kept = w.length >= 3 ? w.slice(1, -1) : w;
    return kept.reduce((sum, x) => sum + x, 0);
  }

  // Guild records and blader stats from the played fixtures. matches: [{ id, week, team1, team2, bouts, defaultWinner }]:
  // `bouts` from final results only ({ p1, p2, p1Pts, p2Pts, rounds }), `defaultWinner` a guild name. Each played match
  // gets a `result`. Bouts in the `weekly` week (a label) also go into each blader's `weekly` line.
  // Returns { teams (ranked), teamsByName, players, playersByKey, league (eligible bladers, best MVP first) }.
  function leagueStats(guilds, bladers, matches, { weekly } = {}, cfg = window.LEAGUE_CONFIG) {
    const teams = guilds.map((t) => ({ ...t, wins: 0, losses: 0, played: 0, points: 0, conceded: 0, setWins: 0, setLosses: 0, opponents: [], gamesVs: {} }));
    const teamsByName = new Map(teams.map((t) => [t.name, t]));

    const players = bladers.map((p) => ({
      ...p,
      achievements: p.achievements || [],
      overall: emptyLine(),
      weekly: emptyLine(),
      appearances: new Set(),
    }));
    const playersByKey = new Map(players.map((p) => [p.key, p]));

    matches.forEach((m) => {
      const t1 = teamsByName.get(m.team1);
      const t2 = teamsByName.get(m.team2);

      // Default/DQ wins count for the guilds' records only, not for blader stats.
      if (m.defaultWinner) {
        const winner1 = m.defaultWinner === m.team1;
        m.result = { bouts1: 0, bouts2: 0, pts1: 0, pts2: 0, winner: m.defaultWinner, byDefault: true };
        [[t1, winner1, t2], [t2, !winner1, t1]].forEach(([t, won, opp]) => {
          if (!t) return;
          t.played++;
          if (opp) t.opponents.push(opp);
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
          if (weekly && m.week === weekly) addBout(p.weekly, mine, theirs, rounds, side);
          p.appearances.add(m.id);
        });
      });

      const winner1 = b1 > b2 || (b1 === b2 && pts1 >= pts2);
      m.result = { bouts1: b1, bouts2: b2, pts1, pts2, winner: winner1 ? m.team1 : m.team2 };

      [[t1, b1, b2, pts1, pts2, winner1, t2], [t2, b2, b1, pts2, pts1, !winner1, t1]].forEach(([t, bw, bl, pf, pa, won, opp]) => {
        if (!t) return;
        t.played++;
        if (opp) {
          t.opponents.push(opp);
          t.gamesVs[opp.name] = (t.gamesVs[opp.name] || 0) + bw;
        }
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
    teams.forEach((t) => (t.buchholz = medianBuchholz(t.opponents.map((o) => o.wins))));

    players.forEach((p) => {
      const team = teamsByName.get(p.team);
      p.bracket = team ? team.bracket : "-";
      finalizeLine(p.overall, cfg);
      finalizeLine(p.weekly, cfg);
      p.attendance = team && team.played ? Math.min(p.appearances.size / team.played, 1) : 0;
      p.eligible = p.overall.games >= (cfg.minGames || 1) && p.attendance >= cfg.eligibilityAttendance;
      p.mvp = mvpScore(p.overall, p.attendance);
      p.weekly.mvp = mvpScore(p.weekly, 1);
      p.winRate = p.overall.winRate;
      p.ptDiff = p.overall.ptDiff;
    });

    return { teams: rankTeams(teams), teamsByName, players, playersByKey, league: players.filter((p) => p.eligible).sort(leagueSort) };
  }

  window.leagueTools = { roundRobin, guildExp, earnedAchievements, entryExp, entryExpParts, purchaseExp, leagueStats, leagueSort, rankTeams, medianBuchholz };
})();
