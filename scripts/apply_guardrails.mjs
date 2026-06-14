import fs from "node:fs";
import { buildGuardrails } from "../src/guardrails.js";

const latestPath = new URL("../data/latest.json", import.meta.url);
const historyPath = new URL("../data/history.json", import.meta.url);
const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));

latest.guardrails = buildGuardrails(
  calculateAxes(latest.values || {}),
  latest.values || {},
  latest.derived || {},
  latest.scores || {},
  latest.regime || {}
);

fs.writeFileSync(latestPath, JSON.stringify(latest, null, 2) + "\n", "utf8");

if (fs.existsSync(historyPath)) {
  const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  const matching = [...history].reverse().find((item) => item.updated_at === latest.updated_at);
  if (matching) matching.guardrails = latest.guardrails;
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + "\n", "utf8");
}

function calculateAxes(values) {
  return {
    heat: average([
      [high(values.spDeviation, [[14, 90], [8, 68], [4, 52]], 30), 1],
      [high(values.nasdaqDeviation, [[18, 92], [10, 70], [5, 52]], 30), 1],
      [high(values.fearGreed, [[75, 90], [55, 65], [45, 45]], 25), 0.8],
      [high(values.creditTrend, [[6, 78], [2, 58], [0, 42]], 25), 0.6],
      [high(values.oilDeviation, [[25, 68], [10, 52]], 35), 0.4]
    ]),
    stress: average([
      [high(values.vix, [[35, 92], [25, 72], [18, 48]], 25), 1.1],
      [low(values.fearGreed, [[20, 78], [35, 56], [45, 42]], 20), 0.7],
      [high(values.us10yChange, [[30, 78], [15, 60], [5, 42]], 25), 0.7],
      [high(values.realYield, [[2.2, 76], [1.7, 58], [1.2, 42]], 25), 0.6],
      [low(values.creditTrend, [[-6, 84], [-2, 62], [0, 42]], 24), 0.9]
    ]),
    recovery: average([
      [low(values.vixChange, [[-6, 82], [-2, 66], [0, 50]], 25), 1],
      [high(values.fearGreedChange, [[20, 82], [8, 66], [0, 50]], 22), 0.8],
      [high(values.creditTrend, [[4, 68], [2, 58], [0, 45]], 25), 0.8],
      [high(values.spDeviation, [[0, 46], [-3, 36]], 24), 0.4]
    ])
  };
}

function average(parts) {
  let total = 0;
  let weight = 0;
  for (const [score, partWeight] of parts) {
    if (score === null) continue;
    total += score * partWeight;
    weight += partWeight;
  }
  return weight ? Math.round(total / weight) : 0;
}

function high(value, rules, fallback) {
  if (!Number.isFinite(Number(value))) return null;
  for (const [threshold, score] of rules) {
    if (Number(value) >= threshold) return score;
  }
  return fallback;
}

function low(value, rules, fallback) {
  if (!Number.isFinite(Number(value))) return null;
  for (const [threshold, score] of rules) {
    if (Number(value) <= threshold) return score;
  }
  return fallback;
}
