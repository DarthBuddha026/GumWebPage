// Self-check for leagueTools.guildExp (js/data.js). Run: node test/guild-exp.js
const assert = require("assert");
global.window = {};
require("../js/data.js");
const { guildExp } = window.leagueTools;

const exp = {
  cap: 250,
  rules: { siegeWin: 100, siegeLoss: 10, raidAttend: 20, raidMissed: 0, raidBattleWin: 5, raidBattleLoss: 0 },
  skillRules: { siegeWin: 60, siegeLoss: -40, raidAttend: 15, raidMissed: -25, raidBattleWin: 10, raidBattleLoss: -10 },
  skills: [{ name: "Rally", exp: 50 }, { name: "Fortify", exp: 100 }, { name: "Warcry", exp: 150 }],
  achievements: [{ id: "a1", name: "Flawless", target: "guild", exp: 50, skillExp: 20 }, { id: "a2", name: "Rash", target: "blader", exp: 30, skillExp: -100 }],
  awards: [{ achievementId: "a1", weekId: "w3", guild: "A" }, { achievementId: "a2", weekId: "w3", player: "pb" }],
  raids: { w2: { attended: ["A"], battles: [{ p1: "pa", p2: "pb", winner: 2 }] } },
};
const weeks = [{ id: "w1" }, { id: "w2" }, { id: "w3" }, { id: "w4" }];
const winners = [
  { weekId: "w1", winner: "A", loser: "B" },
  { weekId: "w4", winner: "B", loser: "A" },
  { weekId: "w4", winner: "B", loser: "A" },
];
const teams = new Map([["pa", "A"], ["pb", "B"]]);
const r = guildExp(["A", "B"], weeks, winners, exp, teams);
const A = r.get("A");
const B = r.get("B");

// Guild EXP only goes up. A: 100 -> 120 -> 170 -> 190.
assert.strictEqual(A.exp, 190);
assert.deepStrictEqual(A.guild, { siege: 120, raids: 20, achievements: 50 });
// Skill EXP takes the penalties: A 60 -> 65 -> 85 (Fortify unlocked) -> 5 after two losses, so every skill locks again.
assert.strictEqual(A.skillExp, 5);
assert.strictEqual(A.unlocked, 0);
// B's Skill EXP can't go below 0 (w1 -40, w2 -15, w3 -100 all stop at 0), then two wins give 120: two skills unlocked.
assert.strictEqual(B.skillExp, 120);
assert.strictEqual(B.unlocked, 2);
// B's Guild EXP: 10 -> 15 -> 45 -> 245, under the 250 cap.
assert.strictEqual(B.exp, 245);
assert.deepStrictEqual(B.awards, [{ name: "Rash", exp: 30, skillExp: -100, player: "pb" }]);

// The cap holds Guild EXP; Skill EXP stops at the last skill (150).
const more = guildExp(["A", "B"], weeks, [...winners, { weekId: "w4", winner: "B", loser: "A" }], { ...exp, cap: 200 }, teams);
assert.strictEqual(more.get("B").exp, 200);
assert.strictEqual(more.get("B").skillExp, 150);
assert.strictEqual(more.get("B").unlocked, 3);

console.log("guildExp ok");
