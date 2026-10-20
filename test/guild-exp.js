// Self-check for leagueTools.guildExp (js/data.js). Run: node test/guild-exp.js
const assert = require("assert");
global.window = {};
require("../js/data.js");
const { guildExp, entryExp, purchaseExp } = window.leagueTools;
const cfg = window.LEAGUE_CONFIG;

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
  playerAchievements: { pa1: ["pa", "pc"], pa7: ["pc"], nope: ["pa"] }, // unknown achievement ids are ignored
  purchases: [{ guild: "A", amount: 1500 }, { guild: "B", amount: 600 }, { guild: "Gone", amount: 5000 }],
};
const all = guildExp(["A", "B"], [], exp, teams);
assert.deepStrictEqual(all.get("A").guild, { events: 12 + 24, achievements: 10 + 10 + 5, shop: 4 });
assert.strictEqual(all.get("A").exp, 65);
assert.deepStrictEqual(all.get("B").guild, { events: 2, achievements: 0, shop: 2 });

// Every blader can earn at most the 70 Achievement EXP the handbook allows.
assert.strictEqual(cfg.playerAchievements.reduce((n, a) => n + a.exp, 0), 70);

console.log("guildExp ok");
