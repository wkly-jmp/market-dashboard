const T = {
  addBlocked: {
    creditStress: 68, preCrash: 64, rateBear: 64, rateBearPeakOut: 62,
    vixChange5d: 4, sp500Change5d: -2, nasdaq100Change5d: -3,
    creditTrend5d: -0.8, creditTrend10d: -1.2, nasdaqDeviation: 18,
    qqqSpyChange20d: 3, sp500Change10d: 1, heat: 72, stress: 60
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
const FRESHNESS_SOURCE_IDS = [
  "vix", "spDeviation", "nasdaqDeviation", "creditTrend", "us10y", "realYield"
];

export function buildGuardrails(axes, values, derived, scores, regime, quality = null) {
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
  const vixSpDecline = ge(vix5, a.vixChange5d) && le(sp5, a.sp500Change5d);
  const vixNasdaqDecline = ge(vix5, a.vixChange5d) && le(nasdaq5, a.nasdaq100Change5d);
  const creditTrendWorsening = le(credit5, a.creditTrend5d) && le(credit10, a.creditTrend10d);
  const vixDeclineConfirmed =
    (vixSpDecline && vixNasdaqDecline) ||
    (
      (vixSpDecline || vixNasdaqDecline) &&
      (
        creditTrendWorsening ||
        regimeKey === "selective_risk_watch" ||
        ge(stress, a.stress)
      )
    );
  const creditTrendConfirmed =
    creditTrendWorsening &&
    (
      regimeKey === "selective_risk_watch" ||
      vixSpDecline ||
      vixNasdaqDecline ||
      ge(stress, a.stress)
    );

  reason(addReasons, regimeKey === "selective_defense", "選択型防御が成立しているため、買い増しを止めます。");
  reason(addReasons, regimeKey === "credit_crisis", "信用危機判定中のため、買い増しを止めます。");
  reason(addReasons, ge(creditStress, a.creditStress), "信用ストレスが高く、買い増しに不向きです。");
  reason(addReasons, ge(preCrash, a.preCrash), "過熱・内部劣化の兆候が強まっています。");
  reason(
    addReasons,
    ge(rateBear, a.rateBear) && ge(creditStress, 35) && lt(peakOut, a.rateBearPeakOut),
    "金利圧力と信用ストレスが重なり、底打ち確認も不足しています。"
  );
  reason(addReasons, vixSpDecline && vixDeclineConfirmed, "VIX上昇とS&P500下落に、別の悪化条件も重なっています。");
  reason(addReasons, vixNasdaqDecline && vixDeclineConfirmed, "VIX上昇とNasdaq100下落に、別の悪化条件も重なっています。");
  reason(addReasons, creditTrendConfirmed, "信用選好の悪化に、価格・VIX・市場ストレスの裏付けがあります。");
  reason(
    addReasons,
    ge(nasdaqDeviation, a.nasdaqDeviation) && ge(qqqSpy20, a.qqqSpyChange20d) && le(sp10, a.sp500Change10d),
    "Nasdaq主導の過熱に対して、S&P500の上昇が鈍っています。"
  );
  reason(addReasons, ge(heat, a.heat) && ge(stress, a.stress), "過熱とストレスが同時に高まっています。");

  let addPermission = addReasons.length ? "blocked" : "normal";
  if (addPermission !== "blocked") {
    reason(addReasons, regimeKey === "selective_risk_watch", "危機条件の継続確認中のため、買い増しを急ぎません。");
    reason(addReasons, ["caution", "overheat", "overheat_fading"].includes(regimeKey), "現行局面は追加を急がない判定です。");
    reason(addReasons, ge(vix, c.vix) && gt(vix5, 0), "VIXが18以上で、直近5日も上昇しています。");
    reason(addReasons, le(fearGreed, c.fearGreed) && lt(peakOut, c.fearPeakOut), "悲観が強い一方、底打ち確認が不足しています。");
    reason(addReasons, ge(rateBear, c.rateBear) && lt(peakOut, c.ratePeakOut), "金利圧力に対して回復確認が弱い状態です。");
    reason(addReasons, (vixSpDecline || vixNasdaqDecline) && !vixDeclineConfirmed, "VIXと一部指数は悪化していますが、市場全体の確認が不足しているため追加は小さくします。");
    reason(addReasons, creditTrendWorsening && !creditTrendConfirmed, "信用選好は悪化していますが、市場全体の裏付けが弱いため追加は小さくします。");
    reason(addReasons, ge(heat, c.heat), "過熱度が高く、追加ペースを抑える局面です。");
    reason(addReasons, ge(stress, c.stress), "ストレス度が高く、追加は小さく限定すべき局面です。");
    reason(addReasons, regimeKey === "constructive" && ge(fearGreed, 65) && ge(qqqSpy20, 2), "回復局面でも短期の楽観とNasdaq優位が進み、追いかけ買いは小さくします。");
    reason(addReasons, regimeKey === "constructive" && ge(rateBear, 38) && lt(qqqSpy20, 1.5), "回復局面でも金利圧力が残り、Nasdaq優位も弱いため追加は小さくします。");
    reason(addReasons, regimeKey === "risk_on" && ge(peakOut, 60) && lt(nasdaq5, 0), "リスクオンでもNasdaq100の短期失速があり、追加は小さくします。");
    if (addReasons.length) addPermission = "cautious";
  }
  if (addPermission === "normal") {
    addReasons.push("通常ペース可。ただし既存ルールと対象ETFのトレンド確認を優先します。");
  }

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
  const recoveryContext = fearOrPanic || (ge(peakOut, 65) && le(vixDrawdown, -20));
  const creditStillWorsening = le(credit5, a.creditTrend5d) || le(credit10, a.creditTrend10d);
  const strongShortBounce =
    ge(peakOut, 65) &&
    le(vixDrawdown, -15) &&
    (derived?.sp500NoNewLow3d === true || derived?.nasdaq100NoNewLow3d === true);
  const creditCrisisVixRelief =
    regimeKey === "credit_crisis" &&
    ge(peakOut, 35) &&
    le(vixDrawdown, -10) &&
    (
      derived?.sp500NoNewLow3d === true ||
      derived?.nasdaq100NoNewLow3d === true ||
      ge(credit5, -2)
    );
  const creditCrisisReversal =
    creditCrisisVixRelief ||
    (
      regimeKey === "credit_crisis" &&
      ge(peakOut, 45) &&
      le(vixDrawdown, -12) &&
      ge(credit5, -1.5) &&
      (
        derived?.sp500NoNewLow3d === true ||
        derived?.nasdaq100NoNewLow3d === true ||
        (gt(sp5, 0) && gt(nasdaq5, 0) && lt(vix5, 0))
      )
    );
  const holdDefense =
    (
      regimeKey === "selective_defense" &&
      basicSafety &&
      (
        (recoveryContext && reversal && !creditStillWorsening) ||
        strongShortBounce
      )
    ) ||
    creditCrisisReversal;
  const defensive =
    regimeKey === "selective_defense" ||
    regimeKey === "credit_crisis" ||
    (ge(creditStress, d.creditStress) && lt(peakOut, d.creditPeakOut)) ||
    (ge(rateBear, d.rateBear) && lt(peakOut, d.ratePeakOut));

  reason(trimReasons, holdDefense, "防御状態は維持しつつ、反転確認があるため追加の大幅縮小を止めます。");
  reason(trimReasons, regimeKey === "selective_defense" && !holdDefense, "選択型防御が成立しているため、防御余力を確保します。");
  reason(trimReasons, regimeKey === "credit_crisis", "信用危機判定を優先し、防御余力を確保します。");
  reason(trimReasons, ge(creditStress, d.creditStress) && lt(peakOut, d.creditPeakOut), "信用ストレスが強く、底打ち確認も不足しています。");
  reason(trimReasons, ge(rateBear, d.rateBear) && lt(peakOut, d.ratePeakOut), "強い金利主導ベアで、回復確認が不足しています。");
  reason(trimReasons, le(credit5, d.creditTrend5d) || le(credit10, d.creditTrend10d), "信用選好の急悪化を確認しています。");

  let trimPermission = holdDefense ? "hold_defense" : defensive ? "defensive_priority" : "allowed";
  if (!defensive) {
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

  const freshness = freshnessFor(quality);
  const confidence = lowerConfidence(
    confidenceFor(values, derived, scores),
    freshness.confidence
  );
  warnings.push(...freshness.warnings);
  if (confidence !== "high") {
    warnings.push("データ品質または鮮度のため、guardrails 判定の信頼度を下げています。");
  }
  if (confidence === "low" && !["defensive_priority", "hold_defense"].includes(trimPermission)) {
    if (addPermission !== "blocked") addPermission = "cautious";
    if (trimPermission !== "avoid") trimPermission = "cautious";
    addReasons.unshift("主要データが不足しているため、積極的な変更判断を保留します。");
  }

  let mainLabel = mainLabelFor(addPermission, trimPermission);
  if (
    confidence === "low" &&
    !["defensive_priority", "hold_defense"].includes(trimPermission) &&
    addPermission !== "blocked"
  ) {
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
  const marketCoreMissing =
    n(values, "vix") === null ||
    n(values, "creditTrend") === null ||
    (n(values, "spDeviation") === null && n(values, "nasdaqDeviation") === null);
  const derivedMissing = REQUIRED_DERIVED.filter((key) => derived?.[key] === null || derived?.[key] === undefined).length;
  const scoreMissing = REQUIRED_SCORES.filter((key) => n(scores, key) === null).length;
  if (marketCoreMissing || criticalMissing >= 2) return "low";
  if (criticalMissing === 0 && derivedMissing <= 2 && scoreMissing === 0) return "high";
  return "medium";
}

function freshnessFor(quality) {
  if (!quality) return { confidence: "high", warnings: [] };
  if (quality.status && quality.status !== "ok") {
    return {
      confidence: "low",
      warnings: ["データ取得状態が正常ではないため、新規判断を保留します。"]
    };
  }

  const now = quality.now ? new Date(quality.now) : new Date();
  if (!Number.isFinite(now.getTime())) {
    return { confidence: "medium", warnings: ["データ鮮度を確認できません。"] };
  }
  const sourceAges = FRESHNESS_SOURCE_IDS.map((id) => {
    const date = quality.sources?.[id]?.date;
    return date ? businessDaysSince(date, now) : null;
  });
  const missingDates = sourceAges.filter((age) => age === null).length;
  const availableAges = sourceAges.filter((age) => age !== null);
  const oldestAge = availableAges.length ? Math.max(...availableAges) : null;

  if (missingDates >= 2 || oldestAge === null) {
    return {
      confidence: "low",
      warnings: ["主要データの日付を確認できないため、新規判断を保留します。"]
    };
  }
  if (oldestAge >= 5) {
    return {
      confidence: "low",
      warnings: [`主要データが${oldestAge}営業日前のため、新規判断を保留します。`]
    };
  }
  if (missingDates === 1 || oldestAge >= 3) {
    return {
      confidence: "medium",
      warnings: [`主要データの鮮度に注意が必要です（最大${oldestAge}営業日前）。`]
    };
  }
  return { confidence: "high", warnings: [] };
}

function lowerConfidence(left, right) {
  const levels = { high: 0, medium: 1, low: 2 };
  return levels[left] >= levels[right] ? left : right;
}

function businessDaysSince(dateText, now) {
  const match = String(dateText).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!Number.isFinite(start.getTime()) || start > end) return null;
  let days = 0;
  for (let cursor = new Date(start); cursor < end;) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

function mainLabelFor(addPermission, trimPermission) {
  if (trimPermission === "hold_defense") return "防御維持・追加縮小なし";
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
