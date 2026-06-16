import assert from "node:assert/strict";
import { analyzeMarket, buildGuardrails } from "../src/market-analysis.js";

function analyze(values, derived = {}) {
  return analyzeMarket(values, null, { derived });
}

const common = {
  oilDeviation: 0,
  yieldCurve: 0.2,
  realYield: 1.3,
  usdjpy: 150
};

const guardrailValues = {
  vix: 16,
  fearGreed: 50,
  spDeviation: 3,
  nasdaqDeviation: 4,
  creditTrend: 1,
  us10y: 4.2,
  realYield: 1.8
};

const guardrailDerived = {
  vixChange5d: -1,
  vixDrawdownFrom10dHigh: -3,
  sp500Change5d: 1,
  sp500Change10d: 2,
  nasdaq100Change5d: 1,
  nasdaq100Change10d: 2,
  creditTrend5d: 0.2,
  creditTrend10d: 0.3,
  qqqSpyChange20d: 0.5,
  sp500NoNewLow3d: true,
  nasdaq100NoNewLow3d: true
};

const guardrailScores = {
  panicScore: 25,
  peakOutScore: 55,
  preCrashRiskScore: 25,
  rateBearScore: 30,
  creditStressScore: 25
};

{
  const analysis = analyze({
    ...common,
    vix: 42,
    vixChange: -16,
    spDeviation: -20,
    nasdaqDeviation: -18,
    us10y: 1.1,
    us10yChange: -35,
    creditTrend: -1.2,
    fearGreed: 12,
    fearGreedChange: 8
  }, {
    vixChange5d: -14,
    vixChange10d: -20,
    vixDrawdownFrom10dHigh: -32,
    vixDrawdownFrom20dHigh: -38,
    sp500Change5d: 5,
    sp500Change10d: -10,
    nasdaq100Change5d: 7,
    nasdaq100Change10d: -12,
    sp500NoNewLow3d: true,
    nasdaq100NoNewLow3d: true,
    creditTrend5d: 0.6,
    creditTrend10d: 0.8,
    creditDrawdownFrom20dHigh: -1,
    oilChange20d: -12
  });

  assert.equal(analysis.regime.key, "buyable_fear");
  assert.equal(analysis.actions.primary, "維持");
  assert.match(analysis.actions.stance, /監視/);
}

{
  const analysis = analyze({
    ...common,
    vix: 55,
    vixChange: 24,
    spDeviation: -25,
    nasdaqDeviation: -30,
    us10y: 3.0,
    us10yChange: -30,
    creditTrend: -9,
    fearGreed: 8,
    fearGreedChange: -10
  }, {
    vixChange5d: 8,
    vixChange10d: 15,
    vixDrawdownFrom10dHigh: -1,
    vixDrawdownFrom20dHigh: -1,
    sp500Change5d: -9,
    sp500Change10d: -18,
    nasdaq100Change5d: -11,
    nasdaq100Change10d: -22,
    sp500NoNewLow3d: false,
    nasdaq100NoNewLow3d: false,
    creditTrend5d: -4,
    creditTrend10d: -8,
    creditDrawdownFrom20dHigh: -12
  });

  assert.equal(analysis.regime.key, "credit_crisis");
  assert.equal(analysis.actions.primary, "縮小");
}

{
  const analysis = analyze({
    ...common,
    vix: 28,
    vixChange: 6,
    spDeviation: -8,
    nasdaqDeviation: -22,
    us10y: 4.5,
    us10yChange: 38,
    creditTrend: -1.5,
    realYield: 2.1,
    fearGreed: 35,
    fearGreedChange: -5
  }, {
    vixChange5d: 1.5,
    vixChange10d: 3,
    vixDrawdownFrom10dHigh: -4,
    vixDrawdownFrom20dHigh: -6,
    sp500Change5d: -2,
    sp500Change10d: -5,
    nasdaq100Change5d: -5,
    nasdaq100Change10d: -10,
    sp500NoNewLow3d: false,
    nasdaq100NoNewLow3d: false,
    creditTrend5d: -0.4,
    creditTrend10d: -0.7,
    creditDrawdownFrom20dHigh: -1.5
  });

  assert.equal(analysis.regime.key, "rate_bear");
  assert.notEqual(analysis.regime.key, "buyable_fear");
  assert.ok(["維持", "やや縮小"].includes(analysis.actions.primary));
}

{
  const analysis = analyze({
    ...common,
    vix: 15,
    vixChange: 4,
    spDeviation: 18,
    nasdaqDeviation: 28,
    us10y: 4.1,
    us10yChange: 20,
    creditTrend: 2.5,
    fearGreed: 72,
    fearGreedChange: -8
  }, {
    vixChange5d: 4,
    vixChange10d: 6,
    vixDrawdownFrom10dHigh: -1,
    vixDrawdownFrom20dHigh: -1,
    sp500Change5d: -1,
    sp500Change10d: -1,
    nasdaq100Change5d: 0,
    nasdaq100Change10d: 1,
    sp500NoNewLow3d: false,
    nasdaq100NoNewLow3d: true,
    creditTrend5d: -1.5,
    creditTrend10d: -2,
    creditDrawdownFrom20dHigh: -2.5,
    qqqSpyChange20d: 5
  });

  assert.equal(analysis.regime.key, "pre_crash_risk");
  assert.equal(analysis.actions.primary, "維持");
}

{
  const analysis = analyze({
    ...common,
    vix: 17,
    vixChange: -8,
    spDeviation: 0,
    nasdaqDeviation: 2,
    us10y: 3.7,
    us10yChange: -20,
    creditTrend: 5,
    fearGreed: 45,
    fearGreedChange: 12
  }, {
    vixChange5d: -4,
    vixChange10d: -7,
    vixDrawdownFrom10dHigh: -12,
    vixDrawdownFrom20dHigh: -15,
    sp500Change5d: 3,
    sp500Change10d: 6,
    nasdaq100Change5d: 4,
    nasdaq100Change10d: 8,
    sp500NoNewLow3d: true,
    nasdaq100NoNewLow3d: true,
    creditTrend5d: 1,
    creditTrend10d: 2,
    creditDrawdownFrom20dHigh: -0.2
  });

  assert.ok(["constructive", "recovering_stress"].includes(analysis.regime.key));
  assert.equal(analysis.actions.primary, "やや拡大");
}

{
  const analysis = analyze({
    ...common,
    vix: 24,
    vixChange: 7,
    spDeviation: -6,
    nasdaqDeviation: -8,
    us10y: 4.2,
    us10yChange: 8,
    creditTrend: -1,
    fearGreed: 32,
    fearGreedChange: -8
  }, {
    selectiveDefenseActive: true,
    selectiveDefenseRisk: false,
    selectiveDefenseBadCount: 3,
    selectiveDefenseRiskDays: 0,
    selectivePriceRisk: true,
    selectiveVolatilityRisk: true,
    selectiveCreditRisk: true,
    selectiveBreadthRisk: false
  });

  assert.equal(analysis.regime.key, "selective_defense");
  assert.equal(analysis.actions.primary, "縮小");
  assert.equal(analysis.guardrails.addPermission, "blocked");
  assert.equal(analysis.guardrails.trimPermission, "defensive_priority");
}

{
  const analysis = analyze({
    ...common,
    vix: 22,
    vixChange: 5,
    spDeviation: -4,
    nasdaqDeviation: -5,
    us10y: 4.2,
    us10yChange: 8,
    creditTrend: -0.5,
    fearGreed: 38,
    fearGreedChange: -5
  }, {
    selectiveDefenseActive: false,
    selectiveDefenseRisk: true,
    selectiveDefenseBadCount: 3,
    selectiveDefenseRiskDays: 2,
    selectivePriceRisk: true,
    selectiveVolatilityRisk: true,
    selectiveCreditRisk: false,
    selectiveBreadthRisk: true
  });

  assert.equal(analysis.regime.key, "selective_risk_watch");
  assert.equal(analysis.actions.primary, "維持");
  assert.match(analysis.actions.stance, /2\/4日/);
  assert.equal(analysis.guardrails.addPermission, "cautious");
}

{
  const guardrails = buildGuardrails(
    { heat: 42, stress: 82, recovery: 24 },
    { ...guardrailValues, vix: 42, creditTrend: -6 },
    {
      ...guardrailDerived,
      vixChange5d: 7,
      sp500Change5d: -6,
      creditTrend5d: -2.4,
      creditTrend10d: -3.5,
      sp500NoNewLow3d: false,
      nasdaq100NoNewLow3d: false
    },
    { ...guardrailScores, panicScore: 82, peakOutScore: 35, creditStressScore: 78 },
    { key: "credit_crisis" }
  );

  assert.equal(guardrails.addPermission, "blocked");
  assert.equal(guardrails.trimPermission, "defensive_priority");
  assert.equal(guardrails.mainLabel, "防御優先");
}

{
  const guardrails = buildGuardrails(
    { heat: 28, stress: 60, recovery: 68 },
    { ...guardrailValues, vix: 30, fearGreed: 15, spDeviation: -9, nasdaqDeviation: -12 },
    {
      ...guardrailDerived,
      vixChange5d: -6,
      vixDrawdownFrom10dHigh: -14,
      sp500Change5d: 2,
      sp500Change10d: -6,
      nasdaq100Change5d: 3,
      nasdaq100Change10d: -8,
      creditTrend5d: 0.4
    },
    { ...guardrailScores, panicScore: 72, peakOutScore: 70, creditStressScore: 42 },
    { key: "recovering_stress" }
  );

  assert.equal(guardrails.trimPermission, "avoid");
  assert.equal(guardrails.mainLabel, "売りすぎ注意");
}

{
  const guardrails = buildGuardrails(
    { heat: 30, stress: 65, recovery: 65 },
    { ...guardrailValues, vix: 30, fearGreed: 18 },
    {
      ...guardrailDerived,
      vixChange5d: -5,
      vixDrawdownFrom10dHigh: -12,
      sp500Change10d: -7,
      nasdaq100Change10d: -9,
      creditTrend5d: 0.2,
      creditTrend10d: -0.2
    },
    { ...guardrailScores, panicScore: 70, peakOutScore: 65, creditStressScore: 40 },
    { key: "selective_defense" }
  );

  assert.equal(guardrails.addPermission, "blocked");
  assert.equal(guardrails.trimPermission, "hold_defense");
  assert.equal(guardrails.mainLabel, "防御維持・追加縮小なし");
}

{
  const guardrails = buildGuardrails(
    { heat: 75, stress: 38, recovery: 45 },
    { ...guardrailValues, nasdaqDeviation: 18 },
    {
      ...guardrailDerived,
      sp500Change10d: 0,
      qqqSpyChange20d: 3
    },
    guardrailScores,
    { key: "overheat" }
  );

  assert.equal(guardrails.addPermission, "blocked");
  assert.equal(guardrails.trimPermission, "allowed");
  assert.equal(guardrails.mainLabel, "買い増し禁止");
}

{
  const guardrails = buildGuardrails(
    { heat: 0, stress: 0, recovery: 0 },
    {
      vix: null,
      fearGreed: null,
      spDeviation: null,
      nasdaqDeviation: null,
      creditTrend: null,
      us10y: 4,
      realYield: 1.5
    },
    {},
    {},
    { key: "data_quality_hold" }
  );

  assert.equal(guardrails.confidence, "low");
  assert.equal(guardrails.addPermission, "cautious");
  assert.equal(guardrails.trimPermission, "cautious");
  assert.equal(guardrails.mainLabel, "判断不能・維持");
  assert.ok(guardrails.warnings.some((warning) => warning.includes("信頼度")));
}

{
  const analysis = analyzeMarket({}, null, {});
  assert.deepEqual(analysis.axes, { heat: null, stress: null, recovery: null });
  assert.equal(analysis.regime.key, "data_quality_hold");
  assert.equal(analysis.actions.primary, "維持");
  assert.equal(analysis.guardrails.mainLabel, "判断不能・維持");
}

console.log("scoring regime scenarios passed");
