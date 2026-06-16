export const FIELDS = [
  { id: "vix", name: "VIX", shortName: "VIX", unit: "", source: "auto", min: 0, describe: describeVix },
  { id: "vixChange", name: "VIX 1か月変化", shortName: "VIX変化", unit: "", source: "auto", describe: describeVixChange },
  { id: "spDeviation", name: "S&P500 200日線乖離", shortName: "S&P500乖離", unit: "%", source: "auto", describe: describeSpDeviation },
  { id: "nasdaqDeviation", name: "Nasdaq100 200日線乖離", shortName: "Nasdaq100乖離", unit: "%", source: "auto", describe: describeNasdaqDeviation },
  { id: "us10y", name: "米10年金利", shortName: "米10年金利", unit: "%", source: "auto", min: 0, describe: describeUs10y },
  { id: "us10yChange", name: "米10年金利 1か月変化", shortName: "金利変化", unit: "bp", source: "auto", describe: describeUs10yChange },
  { id: "usdjpy", name: "ドル円", shortName: "ドル円", unit: "円", source: "auto", min: 0, describe: describeUsdJpy },
  { id: "creditTrend", name: "信用選好 HYG/IEF 200日線乖離", shortName: "信用選好", unit: "%", source: "auto", describe: describeCreditTrend },
  { id: "realYield", name: "米10年実質金利", shortName: "実質金利", unit: "%", source: "auto", describe: describeRealYield },
  { id: "yieldCurve", name: "10年-2年金利差", shortName: "長短金利差", unit: "%", source: "auto", describe: describeYieldCurve },
  { id: "oilDeviation", name: "原油価格 200日線乖離", shortName: "原油乖離", unit: "%", source: "auto", describe: describeOilDeviation },
  { id: "fearGreed", name: "Fear & Greed Index", shortName: "Fear & Greed", unit: "", source: "auto", min: 0, max: 100, describe: describeFearGreed },
  { id: "fearGreedChange", name: "Fear & Greed 1か月変化", shortName: "F&G変化", unit: "", source: "auto", describe: describeFearGreedChange },
  { id: "spAbove200", name: "S&P500 200日線上銘柄比率", shortName: "200日線上比率", unit: "%", source: "manual", min: 0, max: 100, describe: describeSpAbove200 },
  { id: "putCall", name: "Put/Call Ratio", shortName: "Put/Call", unit: "", source: "manual", min: 0, describe: describePutCall },
  { id: "naaim", name: "NAAIM Exposure Index", shortName: "NAAIM", unit: "", source: "manual", describe: describeNaaim },
  { id: "aaii", name: "AAII Bull-Bear Spread", shortName: "AAII", unit: "%", source: "manual", describe: describeAaii },
  { id: "goldDeviation", name: "金価格 200日線乖離", shortName: "金乖離", unit: "%", source: "manual", describe: describeGoldDeviation }
];

export const AUTO_FIELD_IDS = FIELDS.filter((field) => field.source === "auto").map((field) => field.id);
export const MANUAL_FIELD_IDS = FIELDS.filter((field) => field.source === "manual").map((field) => field.id);

const DERIVED_NUMBER_IDS = [
  "vixChange5d",
  "vixChange10d",
  "vixDrawdownFrom10dHigh",
  "vixDrawdownFrom20dHigh",
  "sp500Change5d",
  "sp500Change10d",
  "nasdaq100Change5d",
  "nasdaq100Change10d",
  "creditTrend5d",
  "creditTrend10d",
  "creditTrend20d",
  "creditDrawdownFrom20dHigh",
  "usdJpyChange5d",
  "usdJpyChange20d",
  "goldChange20d",
  "oilChange20d",
  "qqqSpyChange5d",
  "qqqSpyChange20d",
  "selectiveDefenseBadCount",
  "selectiveDefenseRiskDays",
  "sp500Drawdown20d",
  "vixTermRatio",
  "rspSpyChange5d"
];

const DERIVED_BOOLEAN_IDS = [
  "sp500NoNewLow3d",
  "nasdaq100NoNewLow3d",
  "selectiveDefenseActive",
  "selectiveDefenseRisk",
  "selectivePriceRisk",
  "selectiveVolatilityRisk",
  "selectiveCreditRisk",
  "selectiveBreadthRisk"
];

const GUARDRAIL_THRESHOLDS = {
  addBlocked: {
    creditStress: 68,
    preCrash: 64,
    rateBear: 64,
    rateBearPeakOut: 62,
    vixChange5d: 4,
    sp500Change5d: -2,
    nasdaq100Change5d: -3,
    creditTrend5d: -0.8,
    creditTrend10d: -1.2,
    nasdaqDeviation: 15,
    qqqSpyChange20d: 2,
    sp500Change10d: 1,
    heat: 72,
    stress: 50
  },
  addCautious: {
    vix: 18,
    fearGreed: 35,
    fearPeakOut: 55,
    rateBear: 45,
    ratePeakOut: 50,
    heat: 65,
    stress: 55
  },
  trimDefensive: {
    creditStress: 68,
    creditPeakOut: 58,
    rateBear: 74,
    ratePeakOut: 62,
    creditTrend5d: -2,
    creditTrend10d: -3
  },
  trimAvoid: {
    creditStress: 60,
    fearGreed: 25,
    panic: 55,
    vix: 25,
    sp500Change10d: -5,
    nasdaq100Change10d: -7,
    peakOut: 50,
    vixDrawdown: -5,
    creditTrend5d: -0.5
  },
  trimCautious: {
    fearGreed: 35,
    panic: 45,
    stress: 58,
    creditStress: 68,
    sp500Change5d: -3,
    nasdaq100Change5d: -5
  }
};

const GUARDRAIL_CRITICAL_VALUE_IDS = [
  "vix",
  "spDeviation",
  "nasdaqDeviation",
  "creditTrend",
  "us10y",
  "realYield"
];

const GUARDRAIL_DERIVED_IDS = [
  "vixChange5d",
  "vixDrawdownFrom10dHigh",
  "sp500Change5d",
  "sp500Change10d",
  "nasdaq100Change5d",
  "nasdaq100Change10d",
  "creditTrend5d",
  "creditTrend10d",
  "qqqSpyChange20d",
  "sp500NoNewLow3d",
  "nasdaq100NoNewLow3d"
];

export function analyzeMarket(values, previousSnapshot, context = {}) {
  const current = normalizeValues(values);
  const derived = normalizeDerived(context.derived || {});
  const deltas = calculateDeltas(current, previousSnapshot);
  const indicators = FIELDS.map((field) => buildIndicator(field, current[field.id], deltas[field.id]));
  const usedIndicators = indicators.filter((item) => item.value !== null);

  const heat = weightedAverage(usedIndicators, "heat");
  const stress = weightedAverage(usedIndicators, "stress");
  const recovery = weightedAverage(usedIndicators, "recovery");
  const scores = buildScores({ heat, stress, recovery }, current, derived, context.scores || {});
  const regime = decideRegime({ heat, stress, recovery }, current, derived, scores, context.regime || null);
  const actions = decideActions({ heat, stress, recovery, regime, derived, scores });
  const guardrails = buildGuardrails({ heat, stress, recovery }, current, derived, scores, regime);

  return {
    axes: { heat, stress, recovery },
    derived,
    scores,
    regime,
    actions,
    guardrails,
    indicators,
    deltas,
    previous: buildPreviousSummary(previousSnapshot)
  };
}

export function buildGuardrails(axes, values, derived, scores, regime) {
  const addReasons = [];
  const trimReasons = [];
  const warnings = [];
  const addBlocked = GUARDRAIL_THRESHOLDS.addBlocked;
  const addCautious = GUARDRAIL_THRESHOLDS.addCautious;
  const trimDefensive = GUARDRAIL_THRESHOLDS.trimDefensive;
  const trimAvoid = GUARDRAIL_THRESHOLDS.trimAvoid;
  const trimCautious = GUARDRAIL_THRESHOLDS.trimCautious;

  const heat = nullableValue(axes, "heat");
  const stress = nullableValue(axes, "stress");
  const vix = nullableValue(values, "vix");
  const fearGreed = nullableValue(values, "fearGreed");
  const nasdaqDeviation = nullableValue(values, "nasdaqDeviation");
  const vixChange5d = nullableValue(derived, "vixChange5d");
  const vixDrawdown = nullableValue(derived, "vixDrawdownFrom10dHigh");
  const sp500Change5d = nullableValue(derived, "sp500Change5d");
  const sp500Change10d = nullableValue(derived, "sp500Change10d");
  const nasdaq100Change5d = nullableValue(derived, "nasdaq100Change5d");
  const nasdaq100Change10d = nullableValue(derived, "nasdaq100Change10d");
  const creditTrend5d = nullableValue(derived, "creditTrend5d");
  const creditTrend10d = nullableValue(derived, "creditTrend10d");
  const qqqSpyChange20d = nullableValue(derived, "qqqSpyChange20d");
  const panic = nullableValue(scores, "panicScore");
  const peakOut = nullableValue(scores, "peakOutScore");
  const preCrash = nullableValue(scores, "preCrashRiskScore");
  const rateBear = nullableValue(scores, "rateBearScore");
  const creditStress = nullableValue(scores, "creditStressScore");
  const regimeKey = regime?.key || "";

  addReason(addReasons, regimeKey === "credit_crisis", "信用危機判定中のため、買い増しを止めます。");
  addReason(addReasons, atLeast(creditStress, addBlocked.creditStress), "信用ストレスが高く、買い増しに不向きです。");
  addReason(addReasons, atLeast(preCrash, addBlocked.preCrash), "過熱・内部劣化の兆候が強まっています。");
  addReason(
    addReasons,
    atLeast(rateBear, addBlocked.rateBear) && below(peakOut, addBlocked.rateBearPeakOut),
    "金利圧力が強く、底打ち確認も不足しています。"
  );
  addReason(
    addReasons,
    atLeast(vixChange5d, addBlocked.vixChange5d) && atMost(sp500Change5d, addBlocked.sp500Change5d),
    "VIX上昇とS&P500下落が同時進行しています。"
  );
  addReason(
    addReasons,
    atLeast(vixChange5d, addBlocked.vixChange5d) && atMost(nasdaq100Change5d, addBlocked.nasdaq100Change5d),
    "VIX上昇とNasdaq100下落が同時進行しています。"
  );
  addReason(
    addReasons,
    atMost(creditTrend5d, addBlocked.creditTrend5d) && atMost(creditTrend10d, addBlocked.creditTrend10d),
    "信用選好が5日・10日の両方で悪化しています。"
  );
  addReason(
    addReasons,
    atLeast(nasdaqDeviation, addBlocked.nasdaqDeviation) &&
      atLeast(qqqSpyChange20d, addBlocked.qqqSpyChange20d) &&
      atMost(sp500Change10d, addBlocked.sp500Change10d),
    "Nasdaq主導の過熱に対して、S&P500の上昇が鈍っています。"
  );
  addReason(
    addReasons,
    atLeast(heat, addBlocked.heat) && atLeast(stress, addBlocked.stress),
    "過熱とストレスが同時に高まっています。"
  );

  let addPermission = addReasons.length > 0 ? "blocked" : "normal";
  if (addPermission !== "blocked") {
    addReason(addReasons, ["caution", "overheat", "overheat_fading"].includes(regimeKey), "現行局面は追加を急がない判定です。");
    addReason(addReasons, atLeast(vix, addCautious.vix) && above(vixChange5d, 0), "VIXが18以上で、直近5日も上昇しています。");
    addReason(addReasons, atMost(fearGreed, addCautious.fearGreed) && below(peakOut, addCautious.fearPeakOut), "悲観が強い一方、底打ち確認が不足しています。");
    addReason(addReasons, atLeast(rateBear, addCautious.rateBear) && below(peakOut, addCautious.ratePeakOut), "金利圧力に対して回復確認が弱い状態です。");
    addReason(addReasons, atLeast(heat, addCautious.heat), "過熱度が高く、追加ペースを抑える局面です。");
    addReason(addReasons, atLeast(stress, addCautious.stress), "ストレス度が高く、追加は小さく限定すべき局面です。");
    if (addReasons.length > 0) addPermission = "cautious";
  }
  if (addPermission === "normal") {
    addReasons.push("通常ペース可。ただし既存ルールと対象ETFのトレンド確認を優先します。");
  }

  const defensivePriority =
    regimeKey === "credit_crisis" ||
    (atLeast(creditStress, trimDefensive.creditStress) && below(peakOut, trimDefensive.creditPeakOut)) ||
    (atLeast(rateBear, trimDefensive.rateBear) && below(peakOut, trimDefensive.ratePeakOut)) ||
    atMost(creditTrend5d, trimDefensive.creditTrend5d) ||
    atMost(creditTrend10d, trimDefensive.creditTrend10d);

  if (regimeKey === "credit_crisis") trimReasons.push("信用危機判定を優先し、防御余力を確保します。");
  if (atLeast(creditStress, trimDefensive.creditStress) && below(peakOut, trimDefensive.creditPeakOut)) {
    trimReasons.push("信用ストレスが強く、底打ち確認も不足しています。");
  }
  if (atLeast(rateBear, trimDefensive.rateBear) && below(peakOut, trimDefensive.ratePeakOut)) {
    trimReasons.push("強い金利主導ベアで、回復確認が不足しています。");
  }
  if (atMost(creditTrend5d, trimDefensive.creditTrend5d) || atMost(creditTrend10d, trimDefensive.creditTrend10d)) {
    trimReasons.push("信用選好の急悪化を確認しています。");
  }

  let trimPermission = defensivePriority ? "defensive_priority" : "allowed";
  if (!defensivePriority) {
    const basicSafety =
      below(creditStress, trimAvoid.creditStress) &&
      regimeKey !== "credit_crisis" &&
      !(atLeast(rateBear, trimDefensive.rateBear) && below(peakOut, trimDefensive.ratePeakOut));
    const fearOrPanic =
      atMost(fearGreed, trimAvoid.fearGreed) ||
      atLeast(panic, trimAvoid.panic) ||
      atLeast(vix, trimAvoid.vix) ||
      atMost(sp500Change10d, trimAvoid.sp500Change10d) ||
      atMost(nasdaq100Change10d, trimAvoid.nasdaq100Change10d);
    const reversalEvidence =
      atLeast(peakOut, trimAvoid.peakOut) ||
      atMost(vixDrawdown, trimAvoid.vixDrawdown) ||
      derived.sp500NoNewLow3d === true ||
      derived.nasdaq100NoNewLow3d === true ||
      atLeast(creditTrend5d, trimAvoid.creditTrend5d);

    if (basicSafety && fearOrPanic) {
      trimPermission = "avoid";
      trimReasons.push(
        reversalEvidence
          ? "恐怖局面ですが、信用危機ではなく反転確認もあるため、大幅な投げ売りを避けます。"
          : "恐怖水準が高く、信用市場が崩壊していないため、ここからの大幅縮小を避けます。"
      );
    } else {
      addReason(trimReasons, atMost(fearGreed, trimCautious.fearGreed), "悲観が強く、縮小は小さく分ける局面です。");
      addReason(trimReasons, atLeast(panic, trimCautious.panic), "パニック度が高く、安値での売りすぎに注意が必要です。");
      addReason(
        trimReasons,
        atLeast(stress, trimCautious.stress) && below(creditStress, trimCautious.creditStress),
        "市場ストレスは高いものの、信用危機水準には達していません。"
      );
      addReason(trimReasons, atMost(sp500Change5d, trimCautious.sp500Change5d), "S&P500の短期下落が大きく、縮小は慎重に行う局面です。");
      addReason(trimReasons, atMost(nasdaq100Change5d, trimCautious.nasdaq100Change5d), "Nasdaq100の短期下落が大きく、縮小は慎重に行う局面です。");
      if (trimReasons.length > 0) trimPermission = "cautious";
    }
  }

  const confidence = guardrailConfidence(values, derived, scores);
  if (confidence !== "high") {
    warnings.push("一部データ不足のため、guardrails 判定の信頼度を下げています。");
  }

  if (confidence === "low" && trimPermission !== "defensive_priority") {
    if (addPermission !== "blocked") addPermission = "cautious";
    if (trimPermission !== "avoid") trimPermission = "cautious";
    addReasons.unshift("主要データが不足しているため、積極的な変更判断を保留します。");
  }

  let mainLabel = guardrailMainLabel(addPermission, trimPermission);
  if (confidence === "low" && trimPermission !== "defensive_priority" && addPermission !== "blocked") {
    mainLabel = "判断不能・維持";
  }

  const reasons = [...new Set([...addReasons, ...trimReasons])].slice(0, 6);
  if (reasons.length === 0) reasons.push("強い禁止条件は確認されていません。");

  return {
    addPermission,
    trimPermission,
    mainLabel,
    confidence,
    reasons,
    warnings
  };
}

export function validateValues(values) {
  const warnings = [];

  FIELDS.forEach((field) => {
    const value = normalizeNullableNumber(values[field.id]);
    if (value === null) return;

    if (field.min !== undefined && value < field.min) {
      values[field.id] = null;
      warnings.push(field.name + " は " + field.min + " 以上で入力してください。");
    }

    if (field.max !== undefined && value > field.max) {
      values[field.id] = null;
      warnings.push(field.name + " は " + field.max + " 以下で入力してください。");
    }
  });

  return warnings;
}

export function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableValue(data, key) {
  return normalizeNullableNumber(data?.[key]);
}

function atLeast(value, threshold) {
  return value !== null && value >= threshold;
}

function atMost(value, threshold) {
  return value !== null && value <= threshold;
}

function above(value, threshold) {
  return value !== null && value > threshold;
}

function below(value, threshold) {
  return value !== null && value < threshold;
}

function addReason(reasons, condition, text) {
  if (condition) reasons.push(text);
}

function guardrailConfidence(values, derived, scores) {
  const criticalMissing = GUARDRAIL_CRITICAL_VALUE_IDS
    .filter((key) => nullableValue(values, key) === null)
    .length;
  const derivedMissing = GUARDRAIL_DERIVED_IDS
    .filter((key) => derived?.[key] === null || derived?.[key] === undefined)
    .length;
  const scoreMissing = [
    "panicScore",
    "peakOutScore",
    "preCrashRiskScore",
    "rateBearScore",
    "creditStressScore"
  ].filter((key) => nullableValue(scores, key) === null).length;

  if (criticalMissing >= 2) return "low";
  if (criticalMissing === 0 && derivedMissing <= 2 && scoreMissing === 0) return "high";
  return "medium";
}

function guardrailMainLabel(addPermission, trimPermission) {
  if (trimPermission === "defensive_priority") return "防御優先";
  if (addPermission === "blocked" && trimPermission === "avoid") return "両面禁止・維持";
  if (addPermission === "blocked") return "買い増し禁止";
  if (trimPermission === "avoid") return "売りすぎ注意";
  if (addPermission === "cautious" && trimPermission === "cautious") return "慎重維持";
  if (addPermission === "cautious") return "小さく打診まで";
  return "通常維持";
}

function normalizeValues(values) {
  const normalized = {};
  FIELDS.forEach((field) => {
    normalized[field.id] = normalizeNullableNumber(values[field.id]);
  });
  return normalized;
}

function normalizeDerived(derived) {
  const normalized = {};
  DERIVED_NUMBER_IDS.forEach((id) => {
    normalized[id] = normalizeNullableNumber(derived[id]);
  });
  DERIVED_BOOLEAN_IDS.forEach((id) => {
    normalized[id] = typeof derived[id] === "boolean" ? derived[id] : null;
  });
  return normalized;
}

function buildIndicator(field, value, delta) {
  if (value === null) {
    return {
      id: field.id,
      source: field.source,
      name: field.name,
      value: null,
      displayValue: "未入力",
      delta,
      label: "未入力",
      comment: "この指標は今回の判定から除外しています。",
      tone: "empty",
      heat: null,
      stress: null,
      recovery: null,
      heatWeight: 0,
      stressWeight: 0,
      recoveryWeight: 0
    };
  }

  const described = field.describe(value, delta);
  return {
    id: field.id,
    source: field.source,
    name: field.name,
    value,
    displayValue: formatValue(value, field.unit),
    delta,
    ...described
  };
}

function calculateDeltas(values, previousSnapshot) {
  const deltas = {};

  FIELDS.forEach((field) => {
    const current = normalizeNullableNumber(values[field.id]);
    const previous = previousSnapshot && previousSnapshot.values ? normalizeNullableNumber(previousSnapshot.values[field.id]) : null;

    if (current === null || previous === null) {
      deltas[field.id] = { text: "比較なし", value: null, tone: "none" };
      return;
    }

    const diff = current - previous;
    const tone = classifyDeltaTone(field.id, diff, current, previous);
    deltas[field.id] = {
      text: field.shortName + "：" + formatDelta(diff, deltaUnit(field.id, field.unit)),
      value: diff,
      tone
    };
  });

  return deltas;
}

function classifyDeltaTone(id, diff, current, previous) {
  if (diff === 0) return "none";
  if (["spDeviation", "nasdaqDeviation", "creditTrend", "spAbove200", "naaim", "aaii", "yieldCurve", "fearGreed"].includes(id)) {
    return diff > 0 ? "good" : "bad";
  }
  if (["vix", "vixChange", "realYield", "putCall"].includes(id)) {
    return diff < 0 ? "good" : "bad";
  }
  if (id === "us10yChange") return Math.abs(current) < Math.abs(previous) ? "good" : "bad";
  return "neutral";
}

function weightedAverage(items, axis) {
  let total = 0;
  let weight = 0;
  const weightKey = axis + "Weight";

  items.forEach((item) => {
    if (item[axis] === null || item[axis] === undefined || item[weightKey] === 0) return;
    total += item[axis] * item[weightKey];
    weight += item[weightKey];
  });

  if (weight === 0) return null;
  return Math.round(total / weight);
}

function buildScores(axes, values, derived, payloadScores) {
  const supplemental = {
    panicScore: averageScore([
      [scoreLow(values.fearGreed, [[15, 95], [25, 78], [40, 48]], 18), 1.1],
      [scoreHigh(values.vix, [[40, 95], [32, 78], [25, 58], [20, 38]], 18), 1.2],
      [scoreLow(values.spDeviation, [[-15, 92], [-8, 68], [-3, 42]], 16), 0.9],
      [scoreLow(values.nasdaqDeviation, [[-20, 95], [-12, 72], [-4, 44]], 16), 0.9],
      [scoreLow(derived.sp500Change10d, [[-12, 92], [-6, 68], [-3, 45]], 16), 0.8],
      [scoreLow(derived.nasdaq100Change10d, [[-15, 95], [-8, 70], [-4, 46]], 16), 0.8]
    ]),
    peakOutScore: averageScore([
      [scoreLow(derived.vixDrawdownFrom10dHigh, [[-22, 88], [-12, 72], [-5, 55]], 18), 1.1],
      [scoreLow(derived.vixChange5d, [[-8, 88], [-3, 70], [-0.1, 55]], 20), 1],
      [scoreLow(derived.vixChange10d, [[-10, 86], [-4, 68], [-0.1, 52]], 22), 0.8],
      [boolScore(derived.sp500NoNewLow3d, 68, 18), 0.8],
      [boolScore(derived.nasdaq100NoNewLow3d, 68, 18), 0.8],
      [scoreHigh(derived.sp500Change5d, [[2, 72], [0, 60], [-2, 48]], 22), 0.7],
      [scoreHigh(derived.creditTrend5d, [[1, 72], [0, 58], [-0.5, 48]], 22), 1],
      [scoreHigh(values.fearGreedChange, [[15, 78], [5, 62], [0, 50]], 25), 0.7]
    ]),
    preCrashRiskScore: averageScore([
      [scoreHigh(values.spDeviation, [[18, 92], [12, 72], [8, 55]], 24), 0.9],
      [scoreHigh(values.nasdaqDeviation, [[25, 95], [15, 76], [10, 58]], 24), 0.9],
      [scoreLow(values.vix, [[13, 72], [16, 52]], 22), 0.4],
      [scoreHigh(derived.vixChange5d, [[5, 78], [2, 58], [0, 42]], 24), 0.8],
      [scoreLow(derived.creditTrend5d, [[-2, 82], [-0.8, 62], [-0.1, 45]], 24), 1],
      [scoreLow(derived.creditTrend10d, [[-3, 84], [-1.2, 64], [-0.2, 45]], 24), 0.9],
      [scoreHigh(values.us10yChange, [[30, 72], [15, 55]], 24), 0.6],
      [relativeStrengthWarning(derived), 0.6]
    ]),
    rateBearScore: averageScore([
      [scoreHigh(values.us10yChange, [[30, 88], [15, 68], [5, 48]], 22), 1.2],
      [scoreHigh(values.us10y, [[4.8, 78], [4.3, 58], [4, 44]], 24), 0.8],
      [scoreHigh(values.realYield, [[2.2, 78], [1.7, 60], [1.2, 42]], 24), 0.9],
      [scoreLow(values.nasdaqDeviation, [[-12, 86], [-4, 62], [0, 42]], 20), 0.9],
      [scoreLow(derived.nasdaq100Change10d, [[-8, 76], [-4, 58], [-1, 42]], 22), 0.7],
      [scoreLow(derived.creditTrend5d, [[-1.5, 68], [-0.5, 48]], 24), 0.5]
    ]),
    creditStressScore: averageScore([
      [scoreLow(values.creditTrend, [[-6, 92], [-2, 68], [0, 45]], 20), 1.2],
      [scoreLow(derived.creditTrend5d, [[-2, 86], [-0.8, 64], [-0.1, 45]], 20), 1],
      [scoreLow(derived.creditTrend10d, [[-3, 88], [-1.2, 66], [-0.2, 45]], 20), 1],
      [scoreLow(derived.creditDrawdownFrom20dHigh, [[-5, 82], [-2, 62], [-0.5, 44]], 20), 0.9],
      [scoreHigh(values.vix, [[35, 78], [28, 60], [22, 42]], 18), 0.5]
    ])
  };

  Object.keys(supplemental).forEach((key) => {
    if (supplemental[key] === null && payloadScores[key] !== undefined) {
      supplemental[key] = normalizeNullableNumber(payloadScores[key]);
    }
  });

  return { ...axes, ...supplemental };
}

function averageScore(parts) {
  let total = 0;
  let weight = 0;
  parts.forEach(([score, partWeight]) => {
    if (score === null || score === undefined) return;
    total += score * partWeight;
    weight += partWeight;
  });
  return weight === 0 ? null : Math.round(clamp(total / weight, 0, 100));
}

function scoreHigh(value, rules, fallback) {
  if (value === null || value === undefined) return null;
  for (const [threshold, score] of rules) {
    if (value >= threshold) return score;
  }
  return fallback;
}

function scoreLow(value, rules, fallback) {
  if (value === null || value === undefined) return null;
  for (const [threshold, score] of rules) {
    if (value <= threshold) return score;
  }
  return fallback;
}

function boolScore(value, trueScore, falseScore) {
  if (value === null || value === undefined) return null;
  return value ? trueScore : falseScore;
}

function relativeStrengthWarning(derived) {
  if (derived.qqqSpyChange20d === null || derived.sp500Change10d === null) return null;
  if (derived.qqqSpyChange20d >= 4 && derived.sp500Change10d <= 0) return 72;
  if (derived.qqqSpyChange20d >= 2 && derived.sp500Change10d <= 1) return 55;
  return 24;
}

function scoreValue(scores, key) {
  return normalizeNullableNumber(scores[key]);
}

function decideRegime(axes, values, derived, scores, payloadRegime) {
  const coreKeys = ["vix", "spDeviation", "nasdaqDeviation", "us10y", "us10yChange", "creditTrend", "realYield", "yieldCurve"];
  const coreCount = coreKeys.filter((key) => values[key] !== null).length;
  const missingDerived = [...DERIVED_NUMBER_IDS, ...DERIVED_BOOLEAN_IDS].filter((key) => derived[key] === null);
  const payloadWarnings = Array.isArray(payloadRegime?.warnings) ? payloadRegime.warnings : [];
  const warnings = [
    ...payloadWarnings,
    ...(missingDerived.length > 0 ? ["一部の派生指標は未取得のため、該当スコアから除外しています。"] : [])
  ];

  const panic = scoreValue(scores, "panicScore");
  const peakOut = scoreValue(scores, "peakOutScore");
  const preCrash = scoreValue(scores, "preCrashRiskScore");
  const rateBear = scoreValue(scores, "rateBearScore");
  const creditStress = scoreValue(scores, "creditStressScore");
  const noNewLow = derived.sp500NoNewLow3d === true || derived.nasdaq100NoNewLow3d === true;
  const recoveryExpansionConfirmed =
    atLeast(peakOut, 65) &&
    below(normalizeNullableNumber(derived.vixChange5d), 0) &&
    atLeast(normalizeNullableNumber(derived.creditTrend5d), 0) &&
    above(normalizeNullableNumber(derived.sp500Change5d), 0) &&
    above(normalizeNullableNumber(derived.nasdaq100Change5d), 0);
  const constructiveExpansionConfirmed =
    atLeast(peakOut, 55) &&
    above(normalizeNullableNumber(derived.sp500Change5d), 0) &&
    above(normalizeNullableNumber(derived.nasdaq100Change5d), 0);
  const selectiveReady =
    typeof derived.selectiveDefenseActive === "boolean" &&
    typeof derived.selectiveDefenseRisk === "boolean";
  const selectiveReasons = buildSelectiveDefenseReasons(derived);

  const axisCount = Object.values(axes).filter((value) => value !== null).length;

  if (coreCount < 6 || axisCount < 3) {
    return regimeOverride({
      key: "data_quality_hold",
      title: "データ品質確認",
      subtitle: "主要データが不足しているため、新規判断は保留",
      tone: "yellow",
      icon: "⚖️",
      weather: "確認",
      mode: "維持",
      positionSizeHint: "主要データ不足のため新規判断は保留",
      reasons: ["主要自動指標が6件未満です。"],
      warnings
    });
  }

  if (derived.selectiveDefenseActive === true) {
    return regimeOverride({
      key: "selective_defense",
      title: "選択型防御",
      subtitle: "価格・VIX・信用・市場の広がりが同時に悪化",
      tone: "danger",
      icon: "🛡️",
      weather: "防御",
      mode: "縮小",
      positionSizeHint: "危機条件の解除確認まで防御を維持",
      reasons: selectiveReasons.length > 0
        ? selectiveReasons
        : ["複数市場の悪化が4営業日継続しています。"],
      warnings
    });
  }

  if (atLeast(creditStress, 68) && atLeast(panic, 50) && below(peakOut, 58)) {
    return regimeOverride({
      key: "credit_crisis",
      title: "信用危機継続",
      subtitle: "恐怖は強いが、信用市場の悪化がまだ止まっていない",
      tone: "danger",
      icon: "⛈️",
      weather: "荒天",
      mode: "縮小",
      positionSizeHint: "現金余力優先。反発狙いは極小に限定",
      reasons: ["HYG/IEFの悪化が強く、恐怖が底打ち確認を上回っています。"],
      warnings
    });
  }

  if (derived.selectiveDefenseRisk === true) {
    const riskDaysValue = normalizeNullableNumber(derived.selectiveDefenseRiskDays);
    const riskDays = riskDaysValue === null ? "不明" : Math.round(riskDaysValue);
    return regimeOverride({
      key: "selective_risk_watch",
      title: "危機予兆を確認中",
      subtitle: "複数市場が悪化しているが、縮小条件の継続確認中",
      tone: "yellow",
      icon: "⚠️",
      weather: "警戒",
      mode: "維持",
      positionSizeHint: "縮小条件は" + riskDays + "/4日。4日継続までは警戒表示のみ",
      reasons: selectiveReasons,
      warnings
    });
  }

  if (atLeast(rateBear, 64) && atLeast(creditStress, 35) && below(peakOut, 62)) {
    return regimeOverride({
      key: "rate_bear",
      title: "金利主導ベア",
      subtitle: "金利・実質金利の圧力が、株式の反発を抑えている",
      tone: "yellow",
      icon: "🛡️",
      weather: "金利警戒",
      mode: "維持",
      positionSizeHint: "金利低下またはグロース回復確認まで拡大を急がない",
      reasons: ["金利・実質金利の圧力が、株式の短期回復を抑えています。"],
      warnings
    });
  }

  if (atLeast(preCrash, 64)) {
    return regimeOverride({
      key: "pre_crash_risk",
      title: "過熱・内部劣化",
      subtitle: "指数は強いが、ボラティリティまたは信用選好が先に悪化",
      tone: "danger",
      icon: "⚠️",
      weather: "雷注意",
      mode: "維持",
      positionSizeHint: "危機条件が4日継続するまでは警戒表示に限定",
      reasons: ["上方乖離が大きい一方で、VIXまたは信用選好に悪化の兆しがあります。"],
      warnings
    });
  }

  if (
    atLeast(panic, 64) &&
    atLeast(peakOut, 64) &&
    below(creditStress, 60) &&
    noNewLow &&
    (derived.creditTrend5d === null || derived.creditTrend5d >= -0.5) &&
    (derived.vixChange5d === null || derived.vixChange5d < 0)
  ) {
    return regimeOverride({
      key: "buyable_fear",
      title: "買える恐怖",
      subtitle: "恐怖は強いが、底打ち確認が出始めている",
      tone: "blue",
      icon: "🌦️",
      weather: "雨上がり",
      mode: "維持",
      positionSizeHint: "逆張り候補として監視。追加はVIX低下、信用改善、指数回復の継続待ち",
      reasons: ["恐怖は強いものの、VIX低下・安値更新停止・信用選好の下げ止まりがそろっています。"],
      warnings
    });
  }

  if (atLeast(panic, 45) && atLeast(peakOut, 55) && below(creditStress, 68)) {
    return regimeOverride({
      key: "recovering_stress",
      title: "悲観だが回復中",
      subtitle: "ストレスは残るが、改善の兆しが出ている",
      tone: "blue",
      icon: "🌦️",
      weather: "雨上がり",
      mode: recoveryExpansionConfirmed ? "やや拡大" : "維持",
      positionSizeHint: recoveryExpansionConfirmed
        ? "価格・VIX・信用の確認後に小さく分割"
        : "価格・VIX・信用の確認がそろうまで維持",
      reasons: ["悲観は残りますが、回復確認の指標が優勢です。"],
      warnings
    });
  }

  let baseRegime = decideBaseRegime(axes);
  if (baseRegime.key === "recovering_stress" && !recoveryExpansionConfirmed) {
    baseRegime = {
      ...baseRegime,
      mode: "維持",
      positionSizeHint: "価格・VIX・信用の確認がそろうまで維持"
    };
  }
  if (baseRegime.key === "constructive" && !constructiveExpansionConfirmed) {
    baseRegime = {
      ...baseRegime,
      mode: "維持",
      positionSizeHint: "指数の短期上昇と底打ち確認がそろうまで維持"
    };
  }
  if (
    selectiveReady &&
    ["crisis", "overheat_fading"].includes(baseRegime.key)
  ) {
    return regimeOverride({
      ...baseRegime,
      mode: "維持",
      positionSizeHint: "選択型防御条件が成立するまでは警戒表示",
      reasons: ["3軸スコアは警戒水準ですが、選択型防御条件は未成立です。"],
      warnings
    });
  }
  return enrichRegime(baseRegime, warnings);
}

function buildSelectiveDefenseReasons(derived) {
  const labels = [
    ["selectivePriceRisk", "S&P500の短期価格トレンドが悪化"],
    ["selectiveVolatilityRisk", "VIXまたはVIX期間構造が悪化"],
    ["selectiveCreditRisk", "HYG/IEFで信用選好が悪化"],
    ["selectiveBreadthRisk", "RSP/SPYで市場の広がりが悪化"]
  ];
  return labels
    .filter(([key]) => derived[key] === true)
    .map(([, label]) => label);
}

function regimeOverride(regime) {
  return {
    current: regime.title,
    positionJudgment: regime.mode,
    positionSizeHint: regime.positionSizeHint || regime.mode,
    reasons: regime.reasons || [],
    warnings: regime.warnings || [],
    ...regime
  };
}

function enrichRegime(regime, warnings = []) {
  return {
    current: regime.title,
    positionJudgment: regime.mode,
    positionSizeHint: regime.mode,
    reasons: ["補助スコアでは強い上書き条件が出ていません。"],
    warnings,
    ...regime
  };
}

function decideBaseRegime(axes) {
  const { heat, stress, recovery } = axes;

  if (stress >= 72 && recovery < 45) {
    return {
      key: "crisis",
      title: "危機警戒",
      subtitle: "悲観は強いが、まだ急いで増やす局面ではない",
      tone: "danger",
      icon: "⛈️",
      weather: "荒天",
      mode: "縮小"
    };
  }

  if (stress >= 58 && recovery >= 58) {
    return {
      key: "recovering_stress",
      title: "悲観だが回復中",
      subtitle: "ストレスは残るが、改善の兆しが出ている",
      tone: "blue",
      icon: "🌦️",
      weather: "雨上がり",
      mode: "やや拡大"
    };
  }

  if (heat >= 72 && stress >= 50) {
    return {
      key: "overheat_fading",
      title: "過熱から失速",
      subtitle: "買われすぎにストレス上昇が重なり始めている",
      tone: "danger",
      icon: "⚠️",
      weather: "雷注意",
      mode: "やや縮小"
    };
  }

  if (heat >= 72 && stress < 50) {
    return {
      key: "overheat",
      title: "過熱リスクオン",
      subtitle: "リスク選好が進み、新規追加は慎重に見る局面",
      tone: "red",
      icon: "🔥",
      weather: "熱波",
      mode: "維持"
    };
  }

  if (heat < 45 && stress < 55 && recovery >= 55) {
    return {
      key: "constructive",
      title: "健全な回復",
      subtitle: "過熱は限定的で、回復モメンタムが優勢",
      tone: "green",
      icon: "⚔️",
      weather: "晴れ",
      mode: "やや拡大"
    };
  }

  if (stress < 45 && heat >= 45 && heat < 70) {
    return {
      key: "risk_on",
      title: "通常のリスクオン",
      subtitle: "市場環境は比較的安定。追いかけすぎには注意",
      tone: "yellow",
      icon: "🌤️",
      weather: "晴れ寄り",
      mode: "維持"
    };
  }

  if (stress >= 50 && recovery < 50) {
    return {
      key: "caution",
      title: "警戒・様子見",
      subtitle: "ストレスが残り、改善確認を待ちたい局面",
      tone: "yellow",
      icon: "🛡️",
      weather: "くもり",
      mode: "維持"
    };
  }

  return {
    key: "neutral",
    title: "中立・維持",
    subtitle: "強い方向感は限定的。ポジションは維持中心",
    tone: "neutral",
    icon: "⚖️",
    weather: "中立",
    mode: "維持"
  };
}

function decideActions(axes) {
  const { heat, stress, recovery, regime, derived = {}, scores = {} } = axes;

  if (regime.key === "data_quality_hold") {
    return {
      primary: "維持",
      stance: "主要データ不足のため、新規の拡大・縮小判断は保留。取得状況を確認してから再判定。",
      expansion: "低",
      trim: "低",
      hedge: "中",
      positionSizeHint: regime.positionSizeHint
    };
  }

  if (regime.key === "selective_defense") {
    return {
      primary: "縮小",
      stance: "複数市場の悪化が4営業日継続。解除条件がそろうまで防御を維持。",
      expansion: "低",
      trim: "高",
      hedge: "高",
      positionSizeHint: regime.positionSizeHint
    };
  }

  if (regime.key === "selective_risk_watch") {
    return {
      primary: "維持",
      stance: regime.positionSizeHint,
      expansion: "低",
      trim: "低",
      hedge: "中",
      positionSizeHint: regime.positionSizeHint
    };
  }

  if (regime.key === "credit_crisis") {
    return {
      primary: "縮小",
      stance: "信用市場の悪化が止まっていない局面。現金余力を優先し、反発狙いは極小に限定。",
      expansion: "低",
      trim: "高",
      hedge: "高",
      positionSizeHint: regime.positionSizeHint
    };
  }

  if (regime.key === "rate_bear") {
    return {
      primary: regime.mode,
      stance: "金利主導で株式が重い局面。金利低下、実質金利低下、Nasdaq回復を待ってから追加。",
      expansion: "低",
      trim: regime.mode === "やや縮小" ? "中" : "低",
      hedge: "中",
      positionSizeHint: regime.positionSizeHint
    };
  }

  if (regime.key === "pre_crash_risk") {
    return {
      primary: regime.mode,
      stance: "指数の強さに対して内部指標が悪化。選択型防御条件が続くか確認。",
      expansion: "低",
      trim: "低",
      hedge: "中",
      positionSizeHint: regime.positionSizeHint
    };
  }

  if (regime.key === "buyable_fear") {
    return {
      primary: "維持",
      stance: "逆張り候補として監視。VIX低下継続、信用選好改善、指数の短期回復がそろうまで追加しない。",
      expansion: "低",
      trim: "低",
      hedge: "中",
      positionSizeHint: regime.positionSizeHint
    };
  }

  if (regime.key === "crisis") {
    return {
      primary: regime.mode,
      stance: regime.mode === "縮小"
        ? "現金余力を残し、拡大する場合もかなり小さく分割。"
        : "ストレスは高いが、選択型防御条件が続くか確認。",
      expansion: "低",
      trim: regime.mode === "縮小" ? "中" : "低",
      hedge: "高"
    };
  }

  if (regime.key === "recovering_stress") {
    const recoveryExpansionConfirmed =
      atLeast(scoreValue(scores, "peakOutScore"), 65) &&
      below(normalizeNullableNumber(derived.vixChange5d), 0) &&
      atLeast(normalizeNullableNumber(derived.creditTrend5d), 0) &&
      above(normalizeNullableNumber(derived.sp500Change5d), 0) &&
      above(normalizeNullableNumber(derived.nasdaq100Change5d), 0);
    return {
      primary: recoveryExpansionConfirmed ? "やや拡大" : "維持",
      stance: recoveryExpansionConfirmed
        ? "悲観が改善し、価格・VIX・信用の確認もそろったため小さく分割。"
        : "回復候補だが確認が不足。価格・VIX・信用がそろうまで維持。",
      expansion: recoveryExpansionConfirmed ? "中" : "低",
      trim: "低",
      hedge: stress >= 70 ? "中" : "低"
    };
  }

  if (regime.key === "constructive") {
    const constructiveExpansionConfirmed =
      atLeast(scoreValue(scores, "peakOutScore"), 55) &&
      above(normalizeNullableNumber(derived.sp500Change5d), 0) &&
      above(normalizeNullableNumber(derived.nasdaq100Change5d), 0);
    return {
      primary: constructiveExpansionConfirmed ? "やや拡大" : "維持",
      stance: constructiveExpansionConfirmed
        ? "短期の回復候補。通常より小さく分割し、10営業日以内の逆行で停止。"
        : "回復候補だが短期価格確認が不足。指数の短期上昇を待つ。",
      expansion: "中",
      trim: "低",
      hedge: "低"
    };
  }

  if (regime.key === "overheat_fading") {
    return {
      primary: regime.mode,
      stance: "過熱に失速の兆し。選択型防御条件が続くか確認。",
      expansion: "低",
      trim: regime.mode === "やや縮小" ? "高" : "低",
      hedge: "中"
    };
  }

  if (regime.key === "overheat") {
    return {
      primary: regime.mode,
      stance: "リスクオンは続いているが過熱寄り。新規追加は慎重、分割幅は小さく。",
      expansion: heat >= 82 ? "低" : "中",
      trim: "中",
      hedge: "低"
    };
  }

  if (regime.key === "risk_on") {
    return {
      primary: recovery >= 55 && heat < 70 ? "やや拡大" : "維持",
      stance: "環境は悪くないが、過熱と回復のバランスを確認。",
      expansion: recovery >= 55 ? "中" : "低",
      trim: heat >= 65 ? "中" : "低",
      hedge: "低"
    };
  }

  if (regime.key === "caution") {
    return {
      primary: regime.mode,
      stance: "悪化が止まるまで無理に増やさない。改善確認後に分割。",
      expansion: "低",
      trim: "中",
      hedge: "中"
    };
  }

  return {
    primary: "維持",
    stance: "強い優位性は限定的。新規判断は小さく。",
    expansion: recovery >= 55 ? "中" : "低",
    trim: heat >= 65 ? "中" : "低",
    hedge: stress >= 55 ? "中" : "低"
  };
}

function buildPreviousSummary(previousSnapshot) {
  if (!previousSnapshot || !previousSnapshot.savedAt) {
    return { text: "前回比較：比較なし", ageDays: null };
  }

  const ageDays = daysBetween(previousSnapshot.savedAt, new Date().toISOString());
  let text = "前回比較：" + ageDays + "日前の履歴を使用";
  if (previousSnapshot.updatedAt || previousSnapshot.updated_at_jst) {
    text += "（" + (previousSnapshot.updatedAt || previousSnapshot.updated_at_jst) + "）";
  }
  if (ageDays >= 7) {
    text += " / 比較が古いため参考程度";
  }

  return { text, ageDays };
}

function describeFearGreed(value) {
  if (value <= 25) return axis("悲観", "センチメントは強い悲観。回復確認があれば逆張り候補。", "pessimistic", 10, 45, 45, 8, 7, 4);
  if (value <= 45) return axis("やや悲観", "センチメントは弱め。改善モメンタムと合わせて確認。", "pessimistic", 25, 30, 45, 8, 6, 4);
  if (value <= 55) return axis("中立", "センチメントは中立圏。", "neutral", 45, 20, 35, 6, 4, 3);
  if (value <= 75) return axis("強気", "楽観が強まりつつあり、追いかけすぎに注意。", "overheated", 65, 20, 35, 8, 3, 3);
  return axis("過熱", "楽観が極端。新規追加は慎重。", "overheated", 88, 25, 20, 10, 3, 3);
}

function describeFearGreedChange(value) {
  if (value >= 20) return axis("急改善", "Fear & Greedが大きく改善。悲観からの回復を強く示す。", "pessimistic", 58, 28, 82, 5, 5, 10);
  if (value >= 8) return axis("改善", "Fear & Greedが改善。回復モメンタムを補強。", "pessimistic", 52, 28, 68, 4, 4, 9);
  if (value > -8) return axis("中立", "Fear & Greedの変化は中立圏。", "neutral", 45, 30, 45, 3, 3, 4);
  if (value > -20) return axis("悪化", "Fear & Greedが悪化。センチメントの失速に注意。", "warning", 35, 55, 25, 4, 5, 8);
  return axis("急悪化", "Fear & Greedが大きく悪化。リスク回避が強い。", "warning", 20, 75, 15, 4, 6, 10);
}

function describeVix(value) {
  if (value < 12) return axis("低ボラ過熱", "VIXが低く、安心感が強すぎる可能性。", "overheated", 78, 12, 35, 10, 10, 5);
  if (value <= 18) return axis("安定", "市場ストレスは限定的。", "neutral", 45, 22, 45, 8, 10, 6);
  if (value <= 25) return axis("やや警戒", "ボラティリティが上昇。無理な拡大は控えめ。", "warning", 25, 48, 35, 6, 10, 5);
  if (value <= 35) return axis("恐怖", "恐怖水準。改善確認が重要。", "pessimistic", 10, 72, 25, 4, 12, 4);
  return axis("危機警戒", "強い恐怖。急いで増やす局面ではない。", "warning", 5, 92, 15, 4, 14, 3);
}

function describeVixChange(value) {
  if (value <= -6) return axis("大きく改善", "VIXが大きく低下。ストレス緩和の兆し。", "pessimistic", 35, 20, 82, 3, 8, 12);
  if (value < -2) return axis("改善", "VIXは低下傾向。回復モメンタムを補強。", "pessimistic", 40, 28, 68, 3, 8, 10);
  if (value <= 2) return axis("中立", "VIX変化は中立圏。", "neutral", 45, 35, 45, 2, 5, 5);
  if (value <= 6) return axis("悪化", "VIXが上昇。市場ストレスの悪化に注意。", "warning", 30, 62, 25, 2, 8, 10);
  return axis("急悪化", "VIXが急上昇。リスク回避が強まっている。", "warning", 20, 82, 15, 2, 10, 12);
}

function describeSpDeviation(value) {
  if (value <= -10) return axis("大幅下振れ", "長期線を大きく下回る。割安候補だが危機確認が必要。", "pessimistic", 8, 75, 28, 12, 10, 6);
  if (value <= -3) return axis("弱い", "長期線を下回り、悲観寄り。", "pessimistic", 18, 52, 35, 10, 8, 5);
  if (value <= 5) return axis("中立", "長期線近辺。", "neutral", 42, 30, 42, 8, 5, 4);
  if (value <= 12) return axis("強い", "上方乖離が進み、追いかけは慎重。", "overheated", 65, 22, 45, 10, 4, 4);
  return axis("過熱", "上方乖離が大きい。短期過熱に注意。", "overheated", 88, 28, 30, 12, 5, 4);
}

function describeNasdaqDeviation(value) {
  if (value <= -12) return axis("大幅下振れ", "グロースが大きく崩れている。危機確認が必要。", "pessimistic", 8, 78, 25, 10, 9, 5);
  if (value <= -4) return axis("弱い", "Nasdaqは長期線を下回り弱め。", "pessimistic", 20, 55, 35, 9, 7, 5);
  if (value <= 6) return axis("中立", "グロース市場は中立圏。", "neutral", 42, 30, 42, 7, 5, 4);
  if (value <= 15) return axis("強い", "グロースの上方乖離が進行。", "overheated", 68, 25, 45, 10, 4, 4);
  return axis("過熱", "グロース過熱。新規追加は慎重。", "overheated", 92, 32, 28, 12, 5, 4);
}

function describeUs10y(value) {
  if (value < 3.5) return axis("支援的", "金利水準は株式に比較的支援的。", "neutral", 35, 25, 45, 4, 7, 3);
  if (value <= 4.3) return axis("中立", "金利は中立圏。", "neutral", 45, 38, 40, 4, 7, 3);
  if (value < 4.8) return axis("やや警戒", "金利がやや重く、バリュエーションに圧力。", "warning", 50, 58, 30, 4, 8, 3);
  return axis("警戒", "高金利。グロース・金・REITへの圧力に注意。", "warning", 55, 76, 22, 4, 9, 3);
}

function describeUs10yChange(value) {
  if (value >= 30) return axis("急上昇", "金利急上昇。リスク資産への圧力。", "warning", 45, 78, 20, 3, 8, 5);
  if (value >= 15) return axis("上昇", "金利上昇がやや速い。", "warning", 45, 60, 30, 3, 7, 5);
  if (value >= -15) return axis("中立", "金利変化は中立圏。", "neutral", 40, 35, 45, 2, 5, 4);
  return axis("低下", "金利低下はリスク資産に支援的。", "pessimistic", 35, 25, 62, 2, 5, 6);
}

function describeUsdJpy(value) {
  if (value < 145) return axis("円高寄り", "円高寄り。外貨資産の円換算に注意。", "neutral", 35, 35, 40, 2, 4, 2);
  if (value <= 155) return axis("中立", "ドル円は中立圏。", "neutral", 45, 30, 42, 2, 3, 2);
  if (value <= 160) return axis("円安警戒", "円安で円ベース評価が振れやすい。", "warning", 58, 48, 32, 3, 5, 2);
  return axis("急変警戒", "為替介入・急変リスクに注意。", "warning", 65, 68, 22, 3, 6, 2);
}

function describeCreditTrend(value) {
  if (value <= -6) return axis("信用悪化", "HYGが米国債に大きく劣後。信用市場は防御優先。", "warning", 10, 84, 18, 5, 13, 7);
  if (value <= -2) return axis("信用警戒", "ハイイールド債が相対的に弱く、リスク選好は鈍い。", "warning", 25, 62, 30, 5, 12, 7);
  if (value < 2) return axis("中立", "信用市場のリスク選好は中立圏。", "neutral", 45, 35, 45, 5, 10, 6);
  if (value < 6) return axis("信用安定", "HYGが米国債に優位。リスク選好は良好。", "neutral", 58, 24, 58, 6, 11, 8);
  return axis("信用過熱", "信用市場のリスク選好が強い。追いかけすぎには注意。", "overheated", 76, 22, 44, 7, 10, 6);
}

function describeRealYield(value) {
  if (value < 0.5) return axis("支援的", "実質金利は低く、リスク資産に支援的。", "neutral", 42, 22, 48, 4, 7, 4);
  if (value < 1.5) return axis("中立", "実質金利は中立圏。", "neutral", 45, 35, 42, 4, 7, 4);
  if (value < 2.2) return axis("警戒", "実質金利が高め。グロースや金に圧力。", "warning", 50, 58, 30, 4, 8, 4);
  return axis("高金利圧力", "実質金利が高い。バリュエーション圧力に注意。", "warning", 58, 76, 22, 4, 9, 4);
}

function describeYieldCurve(value) {
  if (value < -0.5) return axis("逆イールド深い", "景気後退リスクを示す可能性。", "warning", 25, 62, 25, 2, 7, 4);
  if (value < 0) return axis("逆イールド", "景気サイクル面では警戒。", "warning", 32, 50, 32, 2, 6, 4);
  if (value <= 1.5) return axis("中立", "長短金利差は中立圏。", "neutral", 45, 35, 45, 2, 5, 4);
  return axis("順イールド", "景気拡大寄りの環境。", "neutral", 52, 28, 50, 2, 5, 4);
}

function describeOilDeviation(value) {
  if (value <= -20) return axis("原油弱い", "景気減速懸念を示す場合がある。", "warning", 20, 52, 28, 2, 4, 2);
  if (value <= 10) return axis("中立", "原油は中立圏。", "neutral", 42, 35, 42, 2, 4, 2);
  if (value <= 25) return axis("インフレ警戒", "原油が強く、インフレ再燃に注意。", "warning", 55, 55, 30, 3, 5, 2);
  return axis("原油過熱", "原油の上方乖離が大きい。金利・インフレ圧力に注意。", "warning", 68, 70, 20, 3, 6, 2);
}

function describeSpAbove200(value) {
  if (value < 30) return axis("広がり弱い", "上昇参加銘柄が少ない。", "pessimistic", 12, 62, 24, 5, 5, 3);
  if (value < 45) return axis("やや弱い", "市場の広がりは限定的。", "pessimistic", 28, 45, 35, 4, 4, 3);
  if (value <= 65) return axis("中立", "上昇の広がりは中立圏。", "neutral", 45, 30, 45, 4, 3, 3);
  if (value <= 80) return axis("良好", "市場の広がりは良好。", "neutral", 58, 22, 55, 5, 3, 4);
  return axis("広がり過熱", "参加銘柄が広がりすぎ、短期過熱の可能性。", "overheated", 78, 25, 38, 6, 3, 3);
}

function describePutCall(value) {
  if (value < 0.7) return axis("楽観", "オプション市場は楽観寄り。", "overheated", 72, 20, 35, 5, 4, 3);
  if (value <= 1) return axis("中立", "オプション市場のセンチメントは中立圏。", "neutral", 45, 30, 42, 4, 4, 3);
  if (value <= 1.3) return axis("ヘッジ増", "ヘッジ需要が増加。", "warning", 25, 55, 32, 3, 5, 4);
  return axis("悲観", "極端な悲観。改善確認で逆張り候補。", "pessimistic", 12, 70, 28, 3, 5, 4);
}

function describeNaaim(value) {
  if (value < 30) return axis("低ポジション", "投資家ポジションは低く、悲観寄り。", "pessimistic", 18, 42, 35, 5, 4, 3);
  if (value <= 70) return axis("中立", "ポジションは中立圏。", "neutral", 45, 28, 42, 4, 3, 3);
  if (value <= 90) return axis("強気", "強気姿勢が強く、過熱に近づく。", "overheated", 68, 25, 35, 5, 3, 3);
  return axis("過熱", "エクスポージャー過多。", "overheated", 88, 28, 22, 6, 3, 3);
}

function describeAaii(value) {
  if (value <= -20) return axis("悲観", "個人投資家心理は悲観。", "pessimistic", 18, 45, 35, 4, 4, 3);
  if (value <= 20) return axis("中立", "個人投資家心理は中立圏。", "neutral", 45, 28, 42, 4, 3, 3);
  if (value <= 40) return axis("強気", "強気が優勢。過熱に注意。", "overheated", 66, 24, 35, 5, 3, 3);
  return axis("過熱", "個人投資家の強気が極端。", "overheated", 84, 28, 22, 6, 3, 3);
}

function describeGoldDeviation(value) {
  if (value <= -8) return axis("弱い", "金は長期線を下回り弱い。", "pessimistic", 28, 35, 28, 2, 2, 2);
  if (value <= 8) return axis("中立", "金は中立圏。", "neutral", 45, 30, 40, 2, 2, 2);
  if (value <= 18) return axis("強い", "金は強いが、短期過熱にはまだ余地。", "overheated", 62, 42, 35, 3, 3, 2);
  return axis("過熱", "金の短期過熱。追いかけ買いに注意。", "overheated", 78, 50, 25, 3, 3, 2);
}

function axis(label, comment, tone, heat, stress, recovery, heatWeight, stressWeight, recoveryWeight) {
  return { label, comment, tone, heat, stress, recovery, heatWeight, stressWeight, recoveryWeight };
}

function formatValue(value, unit) {
  return Number.isInteger(value) ? value + unit : Math.round(value * 100) / 100 + unit;
}

function formatDelta(diff, unit) {
  const rounded = Math.round(diff * 100) / 100;
  const sign = rounded > 0 ? "+" : "";
  return sign + rounded + unit;
}

function deltaUnit(id, unit) {
  if (["spDeviation", "nasdaqDeviation", "creditTrend", "realYield", "yieldCurve", "oilDeviation", "spAbove200", "aaii", "goldDeviation"].includes(id)) return "pt";
  return unit;
}

function daysBetween(oldIso, newIso) {
  const oldTime = new Date(oldIso).getTime();
  const newTime = new Date(newIso).getTime();
  if (!Number.isFinite(oldTime) || !Number.isFinite(newTime)) return null;
  return Math.floor((newTime - oldTime) / 86400000);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
