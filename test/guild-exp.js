// Self-check for leagueTools.guildExp (js/data.js). Run: node test/guild-exp.js
const assert = require("assert");
global.window = {};
require("../js/data.js");
const { guildExp } = window.leagueTools;

const exp = {
  cap: 300,
  rules: { attackWin: 100, attackLoss: 10, defendWin: 80, defendLoss: 5, successfulTarget: 120, raidAttend: 20, raidBattleWin: 5 },
  skillRules: { attackWin: 60, attackLoss: -40, defendWin: 50, defendLoss: -30, successfulTarget: 70, raidAttend: 15, raidBattleWin: 10 },
  skills: [{ name: "Rally", exp: 50 }, { name: "Fortify", exp: 100 }, { name: "Warcry", exp: 150 }],
  achievements: [{ id: "a1", name: "Flawless", target: "guild", exp: 50, skillExp: 20 }, { id: "a2", name: "Rash", target: "blader", exp: 30, skillExp: -100 }],
  awards: [{ achievementId: "a1", weekId: "w3", guild: "A" }, { achievementId: "a2", weekId: "w3", player: "pb" }],
  raids: { w2: { attended: ["A"], battles: [{ p1: "pa", p2: "pb", winner: 2 }] } },
};
const weeks = [{ id: "w1" }, { id: "w2" }, { id: "w3" }, { id: "w4" }];
// A attacks B in w1 and wins (plain Attack Win). B attacks A twice in w4 and wins both as a successful target.
const winners = [
  { weekId: "w1", winner: "A", loser: "B", attacker: "A", target: false },
  { weekId: "w4", winner: "B", loser: "A", attacker: "B", target: true },
  { weekId: "w4", winner: "B", loser: "A", attacker: "B", target: true },
];
const teams = new Map([["pa", "A"], ["pb", "B"]]);
const r = guildExp(["A", "B"], weeks, winners, exp, teams);
const A = r.get("A");
const B = r.get("B");

// Guild EXP only goes up. A: 100 (attack win) -> 120 (raid attended) -> 170 (award) -> 180 (two defend losses, +5 each).
assert.strictEqual(A.exp, 180);
assert.deepStrictEqual(A.guild, { siege: 110, raids: 20, achievements: 50 });
// A has no missed-raid penalty and gets nothing for the raid battle it lost.
// A Skill EXP: 60 -> 75 -> 95 -> 35 after two defend losses (-30 each): under Rally (50), so nothing is unlocked.
assert.strictEqual(A.skillExp, 35);
assert.strictEqual(A.unlocked, 0);
// B Skill EXP: w1 defend loss -30 stops at 0, w2 raid battle win +10, w3 -100 stops at 0, w4 two successful targets +140.
assert.strictEqual(B.skillExp, 140);
assert.strictEqual(B.unlocked, 2);
// B Guild EXP: 5 -> 10 -> 40 -> 280 (two successful targets, no Attack Win on top), under the 300 cap.
assert.strictEqual(B.exp, 280);
assert.deepStrictEqual(B.awards, [{ name: "Rash", exp: 30, skillExp: -100, player: "pb" }]);

// A defender win and an attacker loss: A defends against B in w1 and wins; B attacks and loses.
const d = guildExp(["A", "B"], [{ id: "w1" }], [{ weekId: "w1", winner: "A", loser: "B", attacker: "B", target: false }], exp, teams);
assert.strictEqual(d.get("A").exp, 80);
assert.strictEqual(d.get("A").skillExp, 50);
assert.strictEqual(d.get("B").exp, 10);
assert.strictEqual(d.get("B").skillExp, 0);

// The cap holds Guild EXP; Skill EXP stops at the last skill (150).
const more = guildExp(["A", "B"], weeks, [...winners, { weekId: "w4", winner: "B", loser: "A", attacker: "B", target: true }], { ...exp, cap: 200 }, teams);
assert.strictEqual(more.get("B").exp, 200);
assert.strictEqual(more.get("B").skillExp, 150);
assert.strictEqual(more.get("B").unlocked, 3);

console.log("guildExp ok");
