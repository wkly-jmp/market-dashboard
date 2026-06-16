import assert from "node:assert/strict";
import { buildGuardrails } from "../src/guardrails.js";

const axes = { heat: 40, stress: 30, recovery: 50 };
const values = {
  vix: 15,
  fearGreed: 50,
  nasdaqDeviation: 5,
  spDeviation: 3,
  creditTrend: 1,
  us10y: 4,
  realYield: 2
};
const derived = {
  vixChange5d: -2,
  vixDrawdownFrom10dHigh: -3,
  sp500Change5d: 1,
  sp500Change10d: 2,
  nasdaq100Change5d: 1,
  nasdaq100Change10d: 2,
  creditTrend5d: 0.2,
  creditTrend10d: 0.4,
  qqqSpyChange20d: 0,
  sp500NoNewLow3d: false,
  nasdaq100NoNewLow3d: false
};
const scores = {
  panicScore: 20,
  peakOutScore: 40,
  preCrashRiskScore: 20,
  rateBearScore: 20,
  creditStressScore: 20
};

const normal = buildGuardrails(axes, values, derived, scores, { key: "risk_on" });
assert.equal(normal.addPermission, "normal");
assert.equal(normal.trimPermission, "allowed");
assert.equal(normal.confidence, "high");

const blocked = buildGuardrails(
  axes,
  values,
  derived,
  { ...scores, preCrashRiskScore: 70 },
  { key: "risk_on" }
);
assert.equal(blocked.addPermission, "blocked");

const avoid = buildGuardrails(
  axes,
  { ...values, fearGreed: 20 },
  derived,
  { ...scores, peakOutScore: 60 },
  { key: "risk_on" }
);
assert.equal(avoid.trimPermission, "avoid");

const defensive = buildGuardrails(
  axes,
  values,
  { ...derived, creditTrend5d: -2.5 },
  scores,
  { key: "risk_on" }
);
assert.equal(defensive.trimPermission, "cautious");

const selectiveDefense = buildGuardrails(
  axes,
  values,
  derived,
  scores,
  { key: "selective_defense" }
);
assert.equal(selectiveDefense.addPermission, "blocked");
assert.equal(selectiveDefense.trimPermission, "defensive_priority");

const freshSources = Object.fromEntries(
  ["vix", "spDeviation", "nasdaqDeviation", "creditTrend", "us10y", "realYield"]
    .map((id) => [id, { date: "2026-06-12" }])
);
const weekendFresh = buildGuardrails(
  axes,
  values,
  derived,
  scores,
  { key: "risk_on" },
  {
    status: "ok",
    now: "2026-06-15T09:30:00+09:00",
    sources: freshSources
  }
);
assert.equal(weekendFresh.confidence, "high");

const stale = buildGuardrails(
  axes,
  values,
  derived,
  scores,
  { key: "risk_on" },
  {
    status: "ok",
    now: "2026-06-15T09:30:00+09:00",
    sources: Object.fromEntries(
      Object.keys(freshSources).map((id) => [id, { date: "2026-06-05" }])
    )
  }
);
assert.equal(stale.confidence, "low");
assert.equal(stale.addPermission, "cautious");
assert.equal(stale.mainLabel, "判断不能・維持");
assert.match(stale.warnings.join(" "), /営業日前/);

const missingCredit = buildGuardrails(
  axes,
  { ...values, creditTrend: null },
  derived,
  scores,
  { key: "risk_on" }
);
assert.equal(missingCredit.confidence, "low");
assert.equal(missingCredit.mainLabel, "判断不能・維持");

const missingOneRate = buildGuardrails(
  axes,
  { ...values, us10y: null },
  derived,
  scores,
  { key: "risk_on" }
);
assert.equal(missingOneRate.confidence, "medium");

console.log("guardrail scenarios passed");
