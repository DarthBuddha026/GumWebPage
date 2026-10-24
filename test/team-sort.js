// Self-check for the guild ranking (rankTeams and medianBuchholz in js/data.js). Run: node test/team-sort.js
const assert = require("assert");
global.window = {};
require("../js/data.js");
const { rankTeams, medianBuchholz } = window.leagueTools;

// Median-Buchholz drops the best and worst opponent once there are three or more.
assert.strictEqual(medianBuchholz([]), 0);
assert.strictEqual(medianBuchholz([3, 1]), 4);
assert.strictEqual(medianBuchholz([5, 1, 2, 4]), 6);

const g = (name, wins, setWins, ptDiff, points, buchholz, gamesVs = {}) => ({ name, wins, setWins, ptDiff, points, buchholz, gamesVs });
const order = (...teams) => rankTeams(teams).map((t) => t.name).join(" ");
assert.strictEqual(order(g("A", 2, 9, 0, 0, 0), g("B", 3, 1, 0, 0, 0)), "B A"); // match wins first
assert.strictEqual(order(g("A", 2, 5, 9, 9, 9), g("B", 2, 6, 0, 0, 0)), "B A"); // then game wins
assert.strictEqual(order(g("A", 2, 6, 1, 9, 9), g("B", 2, 6, 4, 0, 0)), "B A"); // then points difference
assert.strictEqual(order(g("A", 2, 6, 4, 20, 9), g("B", 2, 6, 4, 22, 0)), "B A"); // then points scored
assert.strictEqual(order(g("A", 2, 6, 4, 22, 3), g("B", 2, 6, 4, 22, 5)), "B A"); // then Median-Buchholz
// Then game wins over the other guilds still tied: C beat A 3 games to 1 and B 2 to 2, so C > B > A here.
assert.strictEqual(
  order(g("A", 2, 6, 4, 22, 5, { B: 1, C: 1 }), g("B", 2, 6, 4, 22, 5, { A: 2, C: 2 }), g("C", 2, 6, 4, 22, 5, { A: 3, B: 2 }), g("D", 9, 0, 0, 0, 0)),
  "D C B A"
);
assert.strictEqual(order(g("B", 2, 6, 4, 22, 5), g("A", 2, 6, 4, 22, 5)), "A B"); // then name

// leagueStats: guild records and blader stats from the played fixtures.
const bout = (p1, p2, p1Pts, p2Pts, rounds) => ({ p1, p2, p1Pts, p2Pts, rounds });
const st = window.leagueTools.leagueStats(
  [{ name: "A" }, { name: "B" }],
  [{ key: "a", name: "Ann", team: "A" }, { key: "b", name: "Bo", team: "B" }],
  [
    { id: "m1", team1: "A", team2: "B", bouts: [bout("a", "b", 4, 1, [{ winner: 1, finish: "extreme" }, { winner: 2, finish: "spin" }, { winner: 1, finish: "spin" }])] },
    { id: "m2", team1: "B", team2: "A", bouts: [], defaultWinner: "B" }, // default: guild records only
    { id: "m3", team1: "A", team2: "B", bouts: [] }, // not played
  ]
);
assert.deepStrictEqual(st.teams.map((t) => [t.name, t.wins, t.losses, t.setWins]), [["A", 1, 1, 1], ["B", 1, 1, 0]]);
const ann = st.playersByKey.get("a");
assert.deepStrictEqual([ann.overall.games, ann.overall.extreme, ann.overall.spin, ann.attendance], [1, 1, 1, 0.5]);
assert.strictEqual(st.league.length, 0); // under minGames
assert.strictEqual(st.players[1].overall.spin, 1);

console.log("team-sort ok");
