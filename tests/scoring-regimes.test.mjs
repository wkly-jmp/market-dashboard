import assert from "node:assert/strict";
import { analyzeMarket } from "../src/scoring.js";

function analyze(values, derived = {}) {
  return analyzeMarket(values, null, { derived });
}

const common = {
  oilDeviation: 0,
  yieldCurve: 0.2,
  realYield: 1.3,
  usdjpy: 150
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
  assert.equal(analysis.actions.primary, "やや拡大");
  assert.match(analysis.actions.stance, /打診/);
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
  assert.equal(analysis.actions.primary, "やや縮小");
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
  assert.ok(["拡大", "やや拡大"].includes(analysis.actions.primary));
}

console.log("scoring regime scenarios passed");
