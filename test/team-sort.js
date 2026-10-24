// Self-check for the guild ranking (teamSort, rankTeams and medianBuchholz in js/app.js). Run: node test/team-sort.js
const assert = require("assert");
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../js/app.js", "utf8");
// app.js is one browser closure, so lift just these functions out of it.
const fn = (name) => src.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n  }`))[0];
const { rankTeams, medianBuchholz } = new Function(`${fn("teamSort")}\n${fn("rankTeams")}\n${fn("medianBuchholz")}\nreturn { rankTeams, medianBuchholz };`)();

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

console.log("team-sort ok");
