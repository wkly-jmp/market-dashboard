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

const blocked = buildGuardrails(axes, values, derived, { ...scores, preCrashRiskScore: 70 }, { key: "risk_on" });
assert.equal(blocked.addPermission, "blocked");

const avoid = buildGuardrails(axes, { ...values, fearGreed: 20 }, derived, { ...scores, peakOutScore: 60 }, { key: "risk_on" });
assert.equal(avoid.trimPermission, "avoid");

const defensive = buildGuardrails(axes, values, { ...derived, creditTrend5d: -2.5 }, scores, { key: "risk_on" });
assert.equal(defensive.trimPermission, "defensive_priority");

console.log("guardrail scenarios passed");
