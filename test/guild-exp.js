// Self-check for leagueTools.guildExp (js/data.js). Run: node test/guild-exp.js
const assert = require("assert");
global.window = {};
require("../js/data.js");
const { guildExp } = window.leagueTools;

const exp = {
  rules: { siegeWin: 100, siegeLoss: -80, raidAttend: 20, raidMissed: -10, raidBattleWin: 5, raidBattleLoss: -5 },
  skills: [{ name: "Rally", exp: 100 }, { name: "Fortify", exp: 300 }, { name: "Warcry", exp: 600 }],
  achievements: [{ id: "a1", name: "Flawless", target: "guild", exp: 50 }, { id: "a2", name: "Ace", target: "blader", exp: 30 }],
  awards: [{ achievementId: "a1", weekId: "w3", guild: "A" }, { achievementId: "a2", weekId: "w3", player: "pb" }],
  raids: { w2: { attended: ["A"], battles: [{ p1: "pa", p2: "pb", winner: 2 }] } },
};
const weeks = [{ id: "w1" }, { id: "w2" }, { id: "w3" }, { id: "w4" }];
const winners = [
  { weekId: "w1", winner: "A", loser: "B" }, // A 100 (unlocks Rally), B 0 (can't go below 0)
  { weekId: "w4", winner: "B", loser: "A" },
  { weekId: "w4", winner: "B", loser: "A" }, // A takes -160 on w4 but stops at Rally's 100
];
const r = guildExp(["A", "B"], weeks, winners, exp, new Map([["pa", "A"], ["pb", "B"]]));
const A = r.get("A");
const B = r.get("B");

// A: w1 100 -> w2 +20 attend -5 battle = 115 -> w3 +50 = 165 -> w4 -160 floored at 100.
assert.strictEqual(A.exp, 100);
assert.strictEqual(A.unlocked, 1);
assert.deepStrictEqual([A.siege, A.raids, A.achievements], [-60, 15, 50]);
// B: w1 -80 floored at 0 -> w2 -10 missed +5 battle, floored at 0 -> w3 +30 (Ace) = 30 -> w4 +200 = 230.
assert.strictEqual(B.exp, 230);
assert.strictEqual(B.unlocked, 1);
assert.deepStrictEqual(B.awards, [{ name: "Ace", exp: 30, player: "pb" }]);

console.log("guildExp ok");
