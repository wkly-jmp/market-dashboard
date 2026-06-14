const T = {
  addBlocked: {
    creditStress: 68, preCrash: 64, rateBear: 64, rateBearPeakOut: 62,
    vixChange5d: 4, sp500Change5d: -2, nasdaq100Change5d: -3,
    creditTrend5d: -0.8, creditTrend10d: -1.2, nasdaqDeviation: 15,
    qqqSpyChange20d: 2, sp500Change10d: 1, heat: 72, stress: 50
  },
  addCautious: {
    vix: 18, fearGreed: 35, fearPeakOut: 55, rateBear: 45,
    ratePeakOut: 50, heat: 65, stress: 55
  },
  trimDefensive: {
    creditStress: 68, creditPeakOut: 58, rateBear: 74,
    ratePeakOut: 62, creditTrend5d: -2, creditTrend10d: -3
  },
  trimAvoid: {
    creditStress: 60, fearGreed: 25, panic: 55, vix: 25,
    sp500Change10d: -5, nasdaq100Change10d: -7, peakOut: 50,
    vixDrawdown: -5, creditTrend5d: -0.5
  },
  trimCautious: {
    fearGreed: 35, panic: 45, stress: 58, creditStress: 68,
    sp500Change5d: -3, nasdaq100Change5d: -5
  }
};

const CRITICAL_VALUES = ["vix", "spDeviation", "nasdaqDeviation", "creditTrend", "us10y", "realYield"];
const REQUIRED_DERIVED = [
  "vixChange5d", "vixDrawdownFrom10dHigh", "sp500Change5d", "sp500Change10d",
  "nasdaq100Change5d", "nasdaq100Change10d", "creditTrend5d", "creditTrend10d",
  "qqqSpyChange20d", "sp500NoNewLow3d", "nasdaq100NoNewLow3d"
];
const REQUIRED_SCORES = [
  "panicScore", "peakOutScore", "preCrashRiskScore", "rateBearScore", "creditStressScore"
];

export function buildGuardrails(axes, values, derived, scores, regime) {
  const addReasons = [];
  const trimReasons = [];
  const warnings = [];
  const a = T.addBlocked;
  const c = T.addCautious;
  const d = T.trimDefensive;
  const x = T.trimAvoid;
  const q = T.trimCautious;

  const heat = n(axes, "heat");
  const stress = n(axes, "stress");
  const vix = n(values, "vix");
  const fearGreed = n(values, "fearGreed");
  const nasdaqDeviation = n(values, "nasdaqDeviation");
  const vix5 = n(derived, "vixChange5d");
  const vixDrawdown = n(derived, "vixDrawdownFrom10dHigh");
  const sp5 = n(derived, "sp500Change5d");
  const sp10 = n(derived, "sp500Change10d");
  const nasdaq5 = n(derived, "nasdaq100Change5d");
  const nasdaq10 = n(derived, "nasdaq100Change10d");
  const credit5 = n(derived, "creditTrend5d");
  const credit10 = n(derived, "creditTrend10d");
  const qqqSpy20 = n(derived, "qqqSpyChange20d");
  const panic = n(scores, "panicScore");
  const peakOut = n(scores, "peakOutScore");
  const preCrash = n(scores, "preCrashRiskScore");
  const rateBear = n(scores, "rateBearScore");
  const creditStress = n(scores, "creditStressScore");
  const regimeKey = regime?.key || "";

  reason(addReasons, regimeKey === "credit_crisis", "信用危機判定中のため、買い増しを止めます。");
  reason(addReasons, ge(creditStress, a.creditStress), "信用ストレスが高く、買い増しに不向きです。");
  reason(addReasons, ge(preCrash, a.preCrash), "過熱・内部劣化の兆候が強まっています。");
  reason(addReasons, ge(rateBear, a.rateBear) && lt(peakOut, a.rateBearPeakOut), "金利圧力が強く、底打ち確認も不足しています。");
  reason(addReasons, ge(vix5, a.vixChange5d) && le(sp5, a.sp500Change5d), "VIX上昇とS&P500下落が同時進行しています。");
  reason(addReasons, ge(vix5, a.vixChange5d) && le(nasdaq5, a.nasdaq100Change5d), "VIX上昇とNasdaq100下落が同時進行しています。");
  reason(addReasons, le(credit5, a.creditTrend5d) && le(credit10, a.creditTrend10d), "信用選好が5日・10日の両方で悪化しています。");
  reason(
    addReasons,
    ge(nasdaqDeviation, a.nasdaqDeviation) && ge(qqqSpy20, a.qqqSpyChange20d) && le(sp10, a.sp500Change10d),
    "Nasdaq主導の過熱に対して、S&P500の上昇が鈍っています。"
  );
  reason(addReasons, ge(heat, a.heat) && ge(stress, a.stress), "過熱とストレスが同時に高まっています。");

  let addPermission = addReasons.length ? "blocked" : "normal";
  if (addPermission !== "blocked") {
    reason(addReasons, ["caution", "overheat", "overheat_fading"].includes(regimeKey), "現行局面は追加を急がない判定です。");
    reason(addReasons, ge(vix, c.vix) && gt(vix5, 0), "VIXが18以上で、直近5日も上昇しています。");
    reason(addReasons, le(fearGreed, c.fearGreed) && lt(peakOut, c.fearPeakOut), "悲観が強い一方、底打ち確認が不足しています。");
    reason(addReasons, ge(rateBear, c.rateBear) && lt(peakOut, c.ratePeakOut), "金利圧力に対して回復確認が弱い状態です。");
    reason(addReasons, ge(heat, c.heat), "過熱度が高く、追加ペースを抑える局面です。");
    reason(addReasons, ge(stress, c.stress), "ストレス度が高く、追加は小さく限定すべき局面です。");
    if (addReasons.length) addPermission = "cautious";
  }
  if (addPermission === "normal") {
    addReasons.push("通常ペース可。ただし既存ルールと対象ETFのトレンド確認を優先します。");
  }

  const defensive =
    regimeKey === "credit_crisis" ||
    (ge(creditStress, d.creditStress) && lt(peakOut, d.creditPeakOut)) ||
    (ge(rateBear, d.rateBear) && lt(peakOut, d.ratePeakOut)) ||
    le(credit5, d.creditTrend5d) ||
    le(credit10, d.creditTrend10d);

  reason(trimReasons, regimeKey === "credit_crisis", "信用危機判定を優先し、防御余力を確保します。");
  reason(trimReasons, ge(creditStress, d.creditStress) && lt(peakOut, d.creditPeakOut), "信用ストレスが強く、底打ち確認も不足しています。");
  reason(trimReasons, ge(rateBear, d.rateBear) && lt(peakOut, d.ratePeakOut), "強い金利主導ベアで、回復確認が不足しています。");
  reason(trimReasons, le(credit5, d.creditTrend5d) || le(credit10, d.creditTrend10d), "信用選好の急悪化を確認しています。");

  let trimPermission = defensive ? "defensive_priority" : "allowed";
  if (!defensive) {
    const basicSafety =
      lt(creditStress, x.creditStress) &&
      regimeKey !== "credit_crisis" &&
      !(ge(rateBear, d.rateBear) && lt(peakOut, d.ratePeakOut));
    const fearOrPanic =
      le(fearGreed, x.fearGreed) || ge(panic, x.panic) || ge(vix, x.vix) ||
      le(sp10, x.sp500Change10d) || le(nasdaq10, x.nasdaq100Change10d);
    const reversal =
      ge(peakOut, x.peakOut) || le(vixDrawdown, x.vixDrawdown) ||
      derived?.sp500NoNewLow3d === true || derived?.nasdaq100NoNewLow3d === true ||
      ge(credit5, x.creditTrend5d);

    if (basicSafety && fearOrPanic) {
      trimPermission = "avoid";
      trimReasons.push(
        reversal
          ? "恐怖局面ですが、信用危機ではなく反転確認もあるため、大幅な投げ売りを避けます。"
          : "恐怖水準が高く、信用市場が崩壊していないため、ここからの大幅縮小を避けます。"
      );
    } else {
      reason(trimReasons, le(fearGreed, q.fearGreed), "悲観が強く、縮小は小さく分ける局面です。");
      reason(trimReasons, ge(panic, q.panic), "パニック度が高く、安値での売りすぎに注意が必要です。");
      reason(trimReasons, ge(stress, q.stress) && lt(creditStress, q.creditStress), "市場ストレスは高いものの、信用危機水準には達していません。");
      reason(trimReasons, le(sp5, q.sp500Change5d), "S&P500の短期下落が大きく、縮小は慎重に行う局面です。");
      reason(trimReasons, le(nasdaq5, q.nasdaq100Change5d), "Nasdaq100の短期下落が大きく、縮小は慎重に行う局面です。");
      if (trimReasons.length) trimPermission = "cautious";
    }
  }

  const confidence = confidenceFor(values, derived, scores);
  if (confidence !== "high") {
    warnings.push("一部データ不足のため、guardrails 判定の信頼度を下げています。");
  }
  if (confidence === "low" && trimPermission !== "defensive_priority") {
    if (addPermission !== "blocked") addPermission = "cautious";
    if (trimPermission !== "avoid") trimPermission = "cautious";
    addReasons.unshift("主要データが不足しているため、積極的な変更判断を保留します。");
  }

  let mainLabel = mainLabelFor(addPermission, trimPermission);
  if (confidence === "low" && trimPermission !== "defensive_priority" && addPermission !== "blocked") {
    mainLabel = "判断不能・維持";
  }

  return {
    addPermission,
    trimPermission,
    mainLabel,
    confidence,
    reasons: [...new Set([...addReasons, ...trimReasons])].slice(0, 6),
    warnings
  };
}

function confidenceFor(values, derived, scores) {
  const criticalMissing = CRITICAL_VALUES.filter((key) => n(values, key) === null).length;
  const derivedMissing = REQUIRED_DERIVED.filter((key) => derived?.[key] === null || derived?.[key] === undefined).length;
  const scoreMissing = REQUIRED_SCORES.filter((key) => n(scores, key) === null).length;
  if (criticalMissing >= 2) return "low";
  if (criticalMissing === 0 && derivedMissing <= 2 && scoreMissing === 0) return "high";
  return "medium";
}

function mainLabelFor(addPermission, trimPermission) {
  if (trimPermission === "defensive_priority") return "防御優先";
  if (addPermission === "blocked" && trimPermission === "avoid") return "両面禁止・維持";
  if (addPermission === "blocked") return "買い増し禁止";
  if (trimPermission === "avoid") return "売りすぎ注意";
  if (addPermission === "cautious" && trimPermission === "cautious") return "慎重維持";
  if (addPermission === "cautious") return "小さく打診まで";
  return "通常維持";
}

function n(data, key) {
  const value = data?.[key];
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function reason(reasons, condition, text) {
  if (condition) reasons.push(text);
}

function ge(value, threshold) { return value !== null && value >= threshold; }
function le(value, threshold) { return value !== null && value <= threshold; }
function gt(value, threshold) { return value !== null && value > threshold; }
function lt(value, threshold) { return value !== null && value < threshold; }
