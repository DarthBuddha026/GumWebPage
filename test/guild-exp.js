// Self-check for leagueTools.guildExp (js/data.js). Run: node test/guild-exp.js
const assert = require("assert");
global.window = {};
require("../js/data.js");
const { guildExp, earnedAchievements, entryExp, purchaseExp } = window.leagueTools;
const cfg = window.LEAGUE_CONFIG;
const sorted = (list) => list.slice().sort();

const teams = new Map([["pa", "A"], ["pb", "B"], ["pc", "A"]]);
const skills = [{ name: "Rally", exp: 50 }, { name: "Fortify", exp: 100 }, { name: "Warcry", exp: 150 }];

// ----- Guild Skill EXP: sieges only, one result at a time, 0..300 -----
const sieges = [
  { winner: "A", loser: "B", attacker: "A", target: false }, // A attack win +20, B defend loss -8 (stops at 0)
  { winner: "A", loser: "B", attacker: "B", target: false }, // A defend win +16, B attack loss -4 (stays 0)
  { winner: "B", loser: "A", attacker: "B", target: true }, // B successful target +40 (not +20 on top), A defend loss -8
  { winner: "A", loser: "B", attacker: "B", target: true }, // B's target attack failed: a normal attack loss -4; A defend win +16
];
const s = guildExp(["A", "B"], sieges, { skills }, teams);
assert.strictEqual(s.get("A").skillExp, 20 + 16 - 8 + 16);
assert.strictEqual(s.get("B").skillExp, 36); // 0 -> 0 -> 40 -> 36: the early losses can't push it below 0
assert.strictEqual(s.get("A").siege, 44);
assert.strictEqual(s.get("A").exp, 0); // sieges give no Guild EXP
assert.strictEqual(s.get("A").unlocked, 0);

// Skill EXP stops at 300 and skills relock when it drops below their threshold.
const many = Array.from({ length: 20 }, () => ({ winner: "A", loser: "B", attacker: "A", target: true }));
const top = guildExp(["A", "B"], [...many, { winner: "B", loser: "A", attacker: "A", target: false }], { skills: [...skills, { name: "Last", exp: 300 }] }, teams).get("A");
assert.strictEqual(top.skillExp, 296); // 300 cap, then -4
assert.strictEqual(top.unlocked, 3);

// ----- Guild EXP from Weekly Pods and Grand Raids -----
assert.strictEqual(entryExp({ entries: 1 }, "pod", cfg), 2);
assert.strictEqual(entryExp({ entries: 2 }, "raid", cfg), 8);
// Handbook champion totals: member 10/20, Battle Master 15/30, Guild Leader 20/40 (plus the entry).
assert.strictEqual(entryExp({ entries: 1, champion: true, role: "member" }, "pod", cfg) - 2, 10);
assert.strictEqual(entryExp({ entries: 1, champion: true, role: "battle-master" }, "pod", cfg) - 2, 15);
assert.strictEqual(entryExp({ entries: 1, champion: true, role: "leader" }, "raid", cfg) - 4, 40);
// Everything stacks: double entry 4 + Swiss 10 + Champion 10 + leader 10 + bounties 5 + 10 = 49, doubled in a raid.
const big = { entries: 2, swiss: true, champion: true, role: "leader", defeated: [{ role: "battle-master" }, { role: "leader" }] };
assert.strictEqual(entryExp(big, "pod", cfg), 49);
assert.strictEqual(entryExp(big, "raid", cfg), 98);
// Bounty Guild: +10 per member, stacking with the Leader's +10 and the Battle Master's +5; a member pays nothing without it.
assert.strictEqual(entryExp({ entries: 1, defeated: [{ role: "member", bounty: true }] }, "pod", cfg), 12);
assert.strictEqual(entryExp({ entries: 1, defeated: [{ role: "battle-master", bounty: true }] }, "pod", cfg), 17);
assert.strictEqual(entryExp({ entries: 1, defeated: [{ role: "leader", bounty: true }] }, "pod", cfg), 22);
assert.strictEqual(entryExp({ entries: 1, defeated: [{ role: "member" }] }, "pod", cfg), 2);
// At a Grand Raid it doubles like the rest: entry 4, Bounty Guild member +20.
assert.strictEqual(entryExp({ entries: 1, defeated: [{ role: "member", bounty: true }] }, "raid", cfg), 24);
// Both entries of a double-entry Guild Leader in the Bounty Guild beaten: each entry pays.
assert.strictEqual(entryExp({ entries: 1, defeated: [{ role: "leader", bounty: true, times: 2 }] }, "pod", cfg), 42);
assert.strictEqual(entryExp({ entries: 1, defeated: [{ role: "battle-master", times: 2 }] }, "raid", cfg), 24);

// ----- Shop support tiers -----
assert.strictEqual(purchaseExp(499, cfg), 0);
assert.strictEqual(purchaseExp(500, cfg), 2);
assert.strictEqual(purchaseExp(999, cfg), 2);
assert.strictEqual(purchaseExp(1000, cfg), 4);

// ----- Everything together -----
const exp = {
  events: [
    { id: "e1", type: "pod", entries: [{ player: "pa", entries: 1, champion: true, role: "member" }, { player: "pb", entries: 1 }] },
    { id: "e2", type: "raid", entries: [{ player: "pc", entries: 1, swiss: true }, { player: "gone", entries: 1 }] }, // removed blader: ignored
  ],
  playerAchievements: { pa6: ["pa", "pc"], pa9: ["pb"], nope: ["pa"] }, // unknown ids and ticks on `auto` achievements are ignored
  purchases: [{ guild: "A", amount: 1500 }, { guild: "B", amount: 600 }, { guild: "Gone", amount: 5000 }],
};
const all = guildExp(["A", "B"], [], exp, teams);
// pa6 ticked for pa and pc (+10 each); The Strongest for pa and Swiss King for pc come from the events (+5 each).
assert.deepStrictEqual(all.get("A").guild, { events: 12 + 24, achievements: 10 + 10 + 5 + 5, shop: 4 });
assert.strictEqual(all.get("A").exp, 70);
assert.deepStrictEqual(all.get("B").guild, { events: 2, achievements: 0, shop: 2 });
// Each blader's share: events and achievements, not the guild's shop receipts.
assert.deepStrictEqual(all.get("A").members, { pa: 12 + 10 + 5, pc: 24 + 10 + 5 });
assert.deepStrictEqual(all.get("B").members, { pb: 2 });

// Achievements from events: each counts once however many events earn it, and only by the role recorded with the defeat.
const earned = earnedAchievements({
  events: [
    { type: "pod", entries: [{ player: "a", swiss: true, champion: true, role: "member", defeated: [{ player: "x", role: "leader" }] }, { player: "b", defeated: [{ player: "y", role: "battle-master" }] }, { player: "c", defeated: [{ player: "z", role: "member", bounty: true }] }] },
    { type: "raid", entries: [{ player: "a", swiss: true, champion: true, role: "leader", defeated: [{ player: "y", role: "leader" }] }] },
  ],
  playerAchievements: { pa6: ["t"], pa7: ["ticked"], pa9: ["ticked"] },
}, [], [], cfg);
assert.deepStrictEqual(earned.pa6, ["t"]);
assert.deepStrictEqual(earned.pa7, ["a"]);
assert.deepStrictEqual(earned.pa8, ["a"]);
assert.deepStrictEqual(earned.pa9, ["a"]);
assert.deepStrictEqual(earned.pa10, ["b"]);
assert.deepStrictEqual(earnedAchievements({}, [], [], cfg).pa7, []);

// Full Deployment: every active blader on the current roster in all four raids. Inactive bladers don't count or earn it.
const roster = [
  { key: "a1", team: "A", active: true }, { key: "a2", team: "A", active: true }, { key: "a3", team: "A", active: false },
  { key: "b1", team: "B", active: true }, { key: "b2", team: "B", active: true },
];
const raid = (...keys) => ({ type: "raid", entries: keys.map((player) => ({ player })) });
const raids = (n, ...keys) => Array.from({ length: n }, () => raid(...keys));
const full = (events) => sorted(earnedAchievements({ events, playerAchievements: { pa3: ["ticked"] } }, [], roster, cfg).pa3);
assert.deepStrictEqual(full(raids(4, "a1", "a2", "b1")), ["a1", "a2"]); // b2 missed them, so nobody in B has it; a3 is inactive
assert.deepStrictEqual(full(raids(3, "a1", "a2", "b1", "b2")), []); // only three so far
assert.deepStrictEqual(full([...raids(3, "a1", "a2"), raid("a1")]), []); // a2 missed one
assert.deepStrictEqual(full([...raids(4, "a1", "a2"), { type: "pod", entries: [] }]), ["a1", "a2"]); // pods don't count

// Achievements from siege scores. A leg: attacker A or B, bouts as [attacker's blader, defender's blader, attacker won?].
const leg = (week, round, attacker, defender, winner, bouts = []) => ({
  week, round, attacker, defender, winner,
  bouts: bouts.map(([p1, p2, won]) => ({ p1, p2, p1Pts: won ? 4 : 1, p2Pts: won ? 1 : 4 })),
});
const fromLegs = (legs) => earnedAchievements({ playerAchievements: { pa1: ["ticked"], pa2: ["ticked"], pa4: ["ticked"], pa5: ["ticked"] } }, legs, [], cfg);

// War Machine: three of the guild's attack legs won in a row, deployed in each. Legs elsewhere don't interrupt.
const three = [
  leg("w1", 1, "A", "B", "A", [["a1", "b1", true], ["a2", "b2", true]]),
  leg("w1", 1, "C", "D", "C", [["c1", "d1", true]]),
  leg("w1", 2, "A", "C", "A", [["a1", "c1", true], ["a2", "c2", true]]),
  leg("w2", 1, "A", "D", "A", [["a1", "d1", true], ["a3", "d2", true]]),
];
assert.deepStrictEqual(fromLegs(three).pa1, ["a1"]); // a2 has only played two, a3 one; the tick is ignored
assert.deepStrictEqual(fromLegs(three.slice(0, 3)).pa1, []); // only two so far
// A lost leg ends the run of those deployed in it, and one not scored yet ends everyone's.
assert.deepStrictEqual(fromLegs([three[0], leg("w1", 2, "A", "C", "C", [["a1", "c1", false]]), three[2], three[3]]).pa1, []);
assert.deepStrictEqual(fromLegs([three[0], leg("w1", 2, "A", "C", null), three[2], three[3]]).pa1, []);
// Sitting out doesn't: not a win the blader missed, a loss they missed, or a leg won by default (no bouts, nobody deployed).
const sitOut = [leg("w3", 1, "A", "B", "A", [["a2", "b1", true]])];
assert.deepStrictEqual(sorted(fromLegs([...three, ...sitOut]).pa1), ["a1", "a2"]); // a2 sat out the third and fourth
assert.deepStrictEqual(sorted(fromLegs([three[0], leg("w1", 2, "A", "C", "C", [["a3", "c1", false]]), three[2], three[3]]).pa1), ["a1"]);
assert.deepStrictEqual(fromLegs([three[0], leg("w1", 2, "A", "C", "A"), three[2], three[3]]).pa1, ["a1"]);
// Losing later doesn't take back a run already earned.
assert.deepStrictEqual(fromLegs([...three, leg("w3", 1, "A", "B", "B", [["a1", "b1", false]])]).pa1, ["a1"]);
// Fortress: the same for defense legs, on the defenders. Attacks in between don't interrupt it.
const held = [
  leg("w1", 1, "B", "A", "A", [["b1", "a1", false], ["b2", "a2", false]]),
  leg("w1", 1, "A", "B", "B", [["a1", "b1", false]]),
  leg("w1", 2, "C", "A", "A", [["c1", "a1", false], ["c2", "a2", true], ["c3", "a3", false]]),
  leg("w2", 1, "D", "A", "A", [["d1", "a1", false]]),
];
assert.deepStrictEqual(fromLegs(held).pa2, ["a1"]);
assert.deepStrictEqual(fromLegs(held).pa1, []);

// Perfect War: on the winning side of a leg, with no bout lost, attacking or defending.
assert.deepStrictEqual(sorted(fromLegs(held).pa4), ["a1", "a2", "b1"]); // the third leg dropped a bout, so a3 isn't in; b1 won leg two unbeaten
assert.deepStrictEqual(fromLegs([leg("w1", 1, "A", "B", "A", [["a1", "b1", true], ["a2", "b2", false], ["a3", "b3", true]])]).pa4, []);
assert.deepStrictEqual(fromLegs([leg("w1", 1, "A", "B", "A")]).pa4, []); // by default
assert.deepStrictEqual(fromLegs([leg("w1", 1, "A", "B", null, [])]).pa4, []);

// We Feast Tonight!: deployed in the guild's first encounter, once both its legs are scored, for both guilds.
const out = leg("w1", 1, "A", "B", "A", [["a1", "b1", true]]);
const back = leg("w1", 1, "B", "A", "B", [["b2", "a2", true]]);
const later = leg("w2", 1, "A", "C", "A", [["a9", "c1", true]]);
assert.deepStrictEqual(fromLegs([out, leg("w1", 1, "B", "A", null), later]).pa5, ["c1"]); // A and B's return leg isn't scored yet; C's first is complete
assert.deepStrictEqual(sorted(fromLegs([out, back, later]).pa5), ["a1", "a2", "b1", "b2", "c1"]); // a9 played a later one; C's first is this
// Scoring a later encounter first doesn't make it the guild's first.
assert.deepStrictEqual(fromLegs([leg("w1", 1, "A", "B", null), leg("w1", 1, "B", "A", null), leg("w2", 1, "A", "C", "A", [["a9", "c1", true]])]).pa5, ["c1"]);
// A guild's first encounter is the first on the schedule, whichever side it starts on, and a default still completes it.
assert.deepStrictEqual(sorted(fromLegs([leg("w1", 1, "B", "A", "A"), leg("w1", 1, "A", "B", "A", [["a1", "b1", true]])]).pa5), ["a1", "b1"]);
// Unscored legs pay no Skill EXP.
assert.strictEqual(guildExp(["A", "B"], [leg("w1", 1, "A", "B", null)], {}, teams).get("A").skillExp, 0);

// Every blader can earn at most the 70 Achievement EXP the handbook allows.
assert.strictEqual(cfg.playerAchievements.reduce((n, a) => n + a.exp, 0), 70);

// ----- The itemised log the battle log shows -----
// Siege lines: the result, the change after clamping, the running Skill EXP and the skills crossed.
const logA = guildExp(["A", "B"], [...many.slice(0, 3), { winner: "B", loser: "A", attacker: "A", target: false }], { skills }, teams).get("A").log;
assert.deepStrictEqual(logA.map((l) => [l.result, l.applied, l.skillExp, l.unlocked, l.relocked]), [
  ["successfulTarget", 40, 40, [], []],
  ["successfulTarget", 40, 80, ["Rally"], []],
  ["successfulTarget", 40, 120, ["Fortify"], []],
  ["attackLoss", -4, 116, [], []],
]);
const logB = guildExp(["A", "B"], sieges.slice(0, 1), { skills }, teams).get("B").log;
assert.deepStrictEqual([logB[0].n, logB[0].applied], [-8, 0]); // a loss at 0 changes nothing
// Event lines carry each part (raid doubling included) and add up to the entry; the totals still match.
assert.deepStrictEqual(window.leagueTools.entryExpParts({ entries: 1, champion: true, role: "leader", defeated: [{ player: "x", role: "leader", bounty: true }] }, "raid", cfg), [
  { kind: "single", n: 4 }, { kind: "champion", n: 20 }, { kind: "champion-leader", n: 20 }, { kind: "bounty-leader", n: 20, player: "x" }, { kind: "bounty-guild", n: 20, player: "x" },
]);
const logAll = all.get("A").log;
assert.strictEqual(logAll.reduce((n, l) => n + l.n, 0), all.get("A").exp);
assert.deepStrictEqual(logAll.filter((l) => l.kind === "event").map((l) => [l.player, l.n, l.parts.reduce((n, p) => n + p.n, 0)]), [["pa", 12, 12], ["pc", 24, 24]]);
assert.deepStrictEqual(logAll.filter((l) => l.kind === "shop").map((l) => [l.player, l.n]), [[undefined, 4]]);
assert.strictEqual(logAll.filter((l) => l.kind === "achievement").length, 4);

console.log("guildExp ok");
