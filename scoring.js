export const FIELDS = [
  { id: "vix", name: "VIX", shortName: "VIX", weight: 16, unit: "", deltaUnit: "", source: "auto", calc: scoreVix, min: 0 },
  { id: "vixChange", name: "VIX 1か月変化", shortName: "VIX変化", weight: 8, unit: "", deltaUnit: "", source: "auto", calc: scoreVixChange },
  { id: "spDeviation", name: "S&P500 200日線乖離", shortName: "S&P500乖離", weight: 14, unit: "%", deltaUnit: "pt", source: "auto", calc: scoreSpDeviation },
  { id: "nasdaqDeviation", name: "Nasdaq100 200日線乖離", shortName: "Nasdaq100乖離", weight: 12, unit: "%", deltaUnit: "pt", source: "auto", calc: scoreNasdaqDeviation },
  { id: "us10y", name: "米10年金利", shortName: "米10年金利", weight: 10, unit: "%", deltaUnit: "pt", source: "auto", calc: scoreUs10y, min: 0 },
  { id: "us10yChange", name: "米10年金利 1か月変化", shortName: "金利1か月変化", weight: 10, unit: "bp", deltaUnit: "bp", source: "auto", calc: scoreUs10yChange },
  { id: "usdjpy", name: "ドル円", shortName: "ドル円", weight: 6, unit: "円", deltaUnit: "円", source: "auto", calc: scoreUsdJpy, min: 0 },
  { id: "creditSpread", name: "信用スプレッド代理", shortName: "信用スプレッド", weight: 10, unit: "%", deltaUnit: "pt", source: "auto", calc: scoreCreditSpread, min: 0 },
  { id: "financialStress", name: "金融ストレス指数", shortName: "金融ストレス", weight: 10, unit: "", deltaUnit: "", source: "auto", calc: scoreFinancialStress },
  { id: "realYield", name: "米10年実質金利", shortName: "実質金利", weight: 8, unit: "%", deltaUnit: "pt", source: "auto", calc: scoreRealYield },
  { id: "yieldCurve", name: "10年-2年金利差", shortName: "長短金利差", weight: 6, unit: "%", deltaUnit: "pt", source: "auto", calc: scoreYieldCurve },
  { id: "dollarDeviation", name: "ドル指数 200日線乖離", shortName: "ドル指数乖離", weight: 6, unit: "%", deltaUnit: "pt", source: "auto", calc: scoreDollarDeviation },
  { id: "oilDeviation", name: "原油価格 200日線乖離", shortName: "原油乖離", weight: 4, unit: "%", deltaUnit: "pt", source: "auto", calc: scoreOilDeviation },
  { id: "fearGreed", name: "Fear & Greed Index", shortName: "Fear & Greed", weight: 18, unit: "", deltaUnit: "", source: "manual", calc: scoreFearGreed, min: 0, max: 100 },
  { id: "spAbove200", name: "S&P500 200日線上銘柄比率", shortName: "200日線上比率", weight: 8, unit: "%", deltaUnit: "pt", source: "manual", calc: scoreSpAbove200, min: 0, max: 100 },
  { id: "putCall", name: "Put/Call Ratio", shortName: "Put/Call", weight: 6, unit: "", deltaUnit: "", source: "manual", calc: scorePutCall, min: 0 },
  { id: "naaim", name: "NAAIM Exposure Index", shortName: "NAAIM", weight: 6, unit: "", deltaUnit: "", source: "manual", calc: scoreNaaim },
  { id: "aaii", name: "AAII Bull-Bear Spread", shortName: "AAII", weight: 6, unit: "%", deltaUnit: "pt", source: "manual", calc: scoreAaii },
  { id: "goldDeviation", name: "金価格 200日線乖離", shortName: "金乖離", weight: 4, unit: "%", deltaUnit: "pt", source: "manual", calc: scoreGoldDeviation }
];

export const AUTO_FIELD_IDS = FIELDS.filter((field) => field.source === "auto").map((field) => field.id);
export const MANUAL_FIELD_IDS = FIELDS.filter((field) => field.source === "manual").map((field) => field.id);

export function calculateScore(values) {
  const cards = [];
  let weightedTotal = 0;
  let activeWeight = 0;

  FIELDS.forEach((field) => {
    const value = normalizeNullableNumber(values[field.id]);

    if (value === null) {
      cards.push({
        id: field.id,
        source: field.source,
        name: field.name,
        value: "未入力",
        label: "未入力",
        comment: "この指標は総合スコアから除外しています。",
        score: null,
        tone: "empty"
      });
      return;
    }

    const judged = field.calc(value);
    weightedTotal += judged.score * field.weight;
    activeWeight += field.weight;
    cards.push({
      id: field.id,
      source: field.source,
      name: field.name,
      value: formatValue(value, field.unit),
      label: judged.label,
      comment: judged.comment,
      score: judged.score,
      tone: judged.tone
    });
  });

  if (activeWeight === 0) {
    return { score: null, cards };
  }

  return {
    score: Math.round(weightedTotal / activeWeight),
    cards
  };
}

export function detectCorrections(values, memoText = "") {
  const crisis =
    valueOver(values.vix, 35) ||
    valueOver(values.creditSpread, 3.2) ||
    valueOver(values.financialStress, 1) ||
    valueUnderOrEqual(values.spDeviation, -10) ||
    valueUnderOrEqual(values.nasdaqDeviation, -12);

  const overheat =
    valueOverOrEqual(values.fearGreed, 80) ||
    valueUnder(values.vix, 12) ||
    valueOverOrEqual(values.spDeviation, 12) ||
    valueOverOrEqual(values.nasdaqDeviation, 15) ||
    valueOver(values.naaim, 90);

  const rate =
    valueOverOrEqual(values.us10y, 4.8) ||
    valueOverOrEqual(values.us10yChange, 30) ||
    valueOverOrEqual(values.realYield, 2.2);

  const fx =
    valueOver(values.usdjpy, 160) ||
    memoText.includes("為替") && (memoText.includes("急変") || memoText.includes("大きく変動") || memoText.includes("短期"));

  return { crisis, overheat, rate, fx };
}

export function calculateDeltas(values, previousSnapshot) {
  const deltas = {};

  FIELDS.forEach((field) => {
    const current = normalizeNullableNumber(values[field.id]);
    const previous = previousSnapshot && previousSnapshot.values ? normalizeNullableNumber(previousSnapshot.values[field.id]) : null;

    if (current === null || previous === null) {
      deltas[field.id] = { text: "比較なし", value: null, tone: "none" };
      return;
    }

    const diff = current - previous;
    deltas[field.id] = {
      text: field.shortName + "：" + formatDelta(diff, field.deltaUnit),
      value: diff,
      tone: diff === 0 ? "none" : "neutral"
    };
  });

  return deltas;
}

export function judgeMomentum(values, previousSnapshot, deltas) {
  if (!previousSnapshot || !previousSnapshot.values) {
    return {
      status: "none",
      label: "回復モメンタム：比較なし",
      detail: "保存履歴が2件以上あると、前回比から改善・悪化を判定します。",
      recoveryCount: 0,
      deteriorationCount: 0,
      previousAgeDays: null,
      previousAt: ""
    };
  }

  let recoveryCount = 0;
  let deteriorationCount = 0;

  countMomentum("fearGreed", (diff) => diff >= 5, (diff) => diff <= -5);
  countMomentum("vix", (diff, current, previous) => diff <= -2 || percentChange(current, previous) <= -10, (diff, current, previous) => diff >= 2 || percentChange(current, previous) >= 10);
  countMomentum("vixChange", (diff) => diff < 0, (diff) => diff > 0);
  countMomentum("spDeviation", (diff) => diff > 0, (diff) => diff < 0);
  countMomentum("nasdaqDeviation", (diff) => diff > 0, (diff) => diff < 0);
  countMomentum("creditSpread", (diff) => diff < 0, (diff) => diff > 0);
  countMomentum("financialStress", (diff) => diff < 0, (diff) => diff > 0);
  countMomentum("realYield", (diff) => diff < 0, (diff) => diff > 0);
  countMomentum("yieldCurve", (diff) => diff > 0, (diff) => diff < 0);
  countMomentum("dollarDeviation", (diff) => diff < 0, (diff) => diff > 0);
  countMomentum("putCall", (diff) => diff < 0, (diff) => diff > 0);
  countMomentum("naaim", (diff) => diff > 0, (diff) => diff < 0);
  countMomentum("aaii", (diff) => diff > 0, (diff) => diff < 0);

  let status = "mixed";
  let label = "回復モメンタム：中立";
  let detail = "改善と悪化が拮抗。現在値の判定を中心に確認。";

  if (recoveryCount >= deteriorationCount + 2 && recoveryCount >= 2) {
    status = "improving";
    label = "回復モメンタム：改善";
    detail = "悲観から回復の兆し。分割・打診の信頼度を少し上げる材料。";
  } else if (deteriorationCount >= recoveryCount + 2 && deteriorationCount >= 2) {
    status = "worsening";
    label = "回復モメンタム：悪化";
    detail = "下落継続に注意。悲観局面でも青信号を弱め、速度を抑える材料。";
  }

  const ageDays = previousSnapshot.savedAt ? daysBetween(previousSnapshot.savedAt, new Date().toISOString()) : null;
  if (ageDays !== null && ageDays >= 7) {
    detail += " 前回比較が古いため、モメンタム判定は参考程度。";
  }

  return {
    status,
    label,
    detail: detail + " 改善 " + recoveryCount + " 件 / 悪化 " + deteriorationCount + " 件。",
    recoveryCount,
    deteriorationCount,
    previousAgeDays: ageDays,
    previousAt: previousSnapshot.updatedAt || previousSnapshot.updated_at_jst || ""
  };

  function countMomentum(id, isRecovery, isDeterioration) {
    const delta = deltas[id] ? deltas[id].value : null;
    const current = normalizeNullableNumber(values[id]);
    const previous = previousSnapshot.values ? normalizeNullableNumber(previousSnapshot.values[id]) : null;

    if (delta === null || current === null || previous === null) return;

    if (isRecovery(delta, current, previous)) {
      recoveryCount += 1;
      deltas[id].tone = "good";
    } else if (isDeterioration(delta, current, previous)) {
      deteriorationCount += 1;
      deltas[id].tone = "bad";
    }
  }
}

export function decideDrive(score, corrections, momentum) {
  if (score === null) {
    return {
      label: "未入力",
      signal: "yellow",
      speed: 0,
      direction: "維持",
      title: "データ待ち",
      detail: "data/latest.json または手動上書き値を確認してください。"
    };
  }

  let drive;
  if (score <= 25) {
    drive = { label: "極端な悲観", signal: "blue", speed: 60, direction: "拡大方向", title: "分割で拡大候補", detail: "悲観寄り。分割でリスクを増やす候補。" };
  } else if (score <= 40) {
    drive = { label: "悲観寄り", signal: "blue-yellow", speed: 40, direction: "やや拡大方向", title: "小さく分割・打診候補", detail: "やや悲観。小さく分割で確認する候補。" };
  } else if (score <= 60) {
    drive = { label: "中立", signal: "yellow", speed: 20, direction: "維持", title: "維持・様子見", detail: "中立。無理に動かず維持中心。" };
  } else if (score <= 75) {
    drive = { label: "やや過熱", signal: "yellow-red", speed: 40, direction: "やや縮小方向", title: "新規抑制・一部縮小候補", detail: "やや過熱。買い増し慎重、一部利確候補。" };
  } else {
    drive = { label: "過熱", signal: "red", speed: 60, direction: "縮小方向", title: "新規抑制・縮小候補", detail: "過熱。リスク縮小・ストップロス厳格化候補。" };
  }

  applyMomentumToDrive(score, drive, corrections, momentum);
  applyCorrectionsToDrive(drive, corrections);
  return drive;
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

function applyMomentumToDrive(score, drive, corrections, momentum) {
  if (!momentum || momentum.status === "none" || momentum.status === "mixed") return;

  const pessimistic = score <= 40;
  const neutral = score > 40 && score <= 60;
  const overheated = score > 60;

  if (momentum.status === "improving") {
    if (pessimistic) {
      drive.speed += corrections.crisis ? 5 : 10;
      drive.detail += " 回復モメンタム改善。悲観から回復の兆し。";
    } else if (neutral) {
      drive.signal = "blue-yellow";
      drive.direction = "維持〜小さく拡大候補";
      drive.speed = Math.max(drive.speed, 30);
      drive.detail += " 回復モメンタム改善。維持から小さな打診候補。";
    } else if (overheated) {
      drive.speed = Math.max(20, drive.speed - 10);
      drive.detail += " 回復モメンタム改善。ただし過熱寄りのため買い増しは慎重、縮小は急がない。";
    }
  }

  if (momentum.status === "worsening") {
    if (pessimistic) {
      drive.signal = drive.signal === "blue" ? "blue-yellow" : "yellow";
      drive.speed -= score <= 25 ? 20 : 10;
      drive.detail += " 回復モメンタム悪化。下落継続に注意。";
    } else if (neutral) {
      drive.signal = "yellow-red";
      drive.direction = "維持〜やや警戒";
      drive.speed = Math.max(drive.speed, 30);
      drive.detail += " 回復モメンタム悪化。維持しつつやや警戒。";
    } else if (overheated) {
      drive.signal = "red";
      drive.direction = "縮小方向";
      drive.speed += 10;
      drive.detail += " 過熱から失速の兆し。縮小方向を強める候補。";
    }
  }

  drive.speed = clamp(drive.speed, 0, 80);
}

function applyCorrectionsToDrive(drive, corrections) {
  if (corrections.crisis) {
    drive.speed = Math.min(drive.speed, 30);
    drive.detail += " 悲観だが危機警戒。買い増しは急がず、危機警戒のため急がない。";
    if (drive.signal === "blue") drive.title = "慎重に分割・打診候補";
  }

  if (corrections.overheat) {
    drive.signal = drive.signal === "blue" || drive.signal === "blue-yellow" ? "yellow-red" : "red";
    if (drive.direction.includes("拡大")) {
      drive.speed = 0;
      drive.direction = "維持";
    }
    drive.title = "新規抑制・縮小候補";
    drive.detail += " 過熱警戒。新規リスク追加は慎重。";
  }

  if (corrections.rate) {
    drive.detail += " 金利上昇警戒。グロース株・金・REITへの圧力に注意。";
  }

  if (corrections.fx) {
    drive.detail += " 円ベースPFでは為替変動リスクに注意。";
  }

  drive.speed = clamp(drive.speed, 0, 80);
}

function scoreFearGreed(value) {
  if (value <= 25) return result(15, "悲観", "強い恐怖水準。逆張り候補だが他の危機指標も確認。", "pessimistic");
  if (value <= 45) return result(35, "やや悲観", "センチメントは弱め。分割でリスク追加を検討する余地。", "pessimistic");
  if (value <= 55) return result(50, "中立", "センチメントは中立圏。単独では大きな方向感なし。", "neutral");
  if (value <= 75) return result(68, "やや過熱", "楽観が強まりつつあり、買い増しは慎重。", "overheated");
  return result(88, "過熱", "楽観が極端。新規リスク追加は抑制候補。", "overheated");
}

function scoreVix(value) {
  if (value < 12) return result(82, "過熱", "ボラティリティが低く、楽観・油断が強い可能性。", "overheated");
  if (value <= 18) return result(52, "中立", "通常の変動率。市場ストレスは限定的。", "neutral");
  if (value <= 25) return result(38, "警戒", "やや不安定。リスク追加は分割前提。", "warning");
  if (value <= 35) return result(22, "悲観", "恐怖水準。反発余地と下落継続リスクを同時に確認。", "pessimistic");
  return result(10, "警戒", "強い恐怖。危機警戒として速度制限。", "warning");
}

function scoreVixChange(value) {
  if (value <= -6) return result(38, "改善", "VIXが大きく低下。ストレス緩和の兆し。", "pessimistic");
  if (value < -2) return result(44, "やや改善", "VIXは低下傾向。回復モメンタムを補強。", "pessimistic");
  if (value <= 2) return result(50, "中立", "VIX変化は中立圏。", "neutral");
  if (value <= 6) return result(34, "警戒", "VIXが上昇。市場ストレスの悪化に注意。", "warning");
  return result(18, "警戒", "VIXが急上昇。短期的なリスク回避に注意。", "warning");
}

function scoreSpDeviation(value) {
  if (value <= -10) return result(15, "悲観", "200日線を大きく下回る。悲観だが危機警戒も必要。", "pessimistic");
  if (value <= -3) return result(35, "やや悲観", "長期線を下回り、弱めの地合い。", "pessimistic");
  if (value <= 5) return result(50, "中立", "長期線近辺。市場温度は中立圏。", "neutral");
  if (value <= 12) return result(68, "やや過熱", "上方乖離が進み、買い増しは慎重。", "overheated");
  return result(88, "過熱", "上方乖離が大きい。短期過熱に注意。", "overheated");
}

function scoreNasdaqDeviation(value) {
  if (value <= -12) return result(15, "悲観", "グロースが大きく崩れている。危機警戒も確認。", "pessimistic");
  if (value <= -4) return result(35, "やや悲観", "Nasdaqは長期線を下回り弱め。", "pessimistic");
  if (value <= 6) return result(50, "中立", "グロース市場は中立圏。", "neutral");
  if (value <= 15) return result(70, "やや過熱", "グロースの上方乖離が進行。", "overheated");
  return result(90, "過熱", "グロース過熱。買い増し停止候補。", "overheated");
}

function scoreUs10y(value) {
  if (value < 3.5) return result(40, "支援的", "金利水準は株式に比較的支援的。", "pessimistic");
  if (value <= 4.3) return result(50, "中立", "金利は中立圏。", "neutral");
  if (value < 4.8) return result(64, "警戒", "金利がやや重く、バリュエーションに圧力。", "warning");
  return result(75, "警戒", "高金利警戒。グロース・金・REITへの圧力に注意。", "warning");
}

function scoreUs10yChange(value) {
  if (value >= 30) return result(76, "警戒", "金利急上昇。リスク資産への圧力に注意。", "warning");
  if (value >= 15) return result(64, "やや警戒", "金利上昇がやや速い。", "warning");
  if (value >= -15) return result(50, "中立", "金利変化は中立圏。", "neutral");
  return result(38, "支援的", "金利低下はリスク資産に支援的。", "pessimistic");
}

function scoreUsdJpy(value) {
  if (value < 145) return result(45, "円高寄り", "円高寄り。外貨資産の円換算に注意。", "neutral");
  if (value <= 155) return result(50, "中立", "ドル円は中立圏。", "neutral");
  if (value <= 160) return result(62, "警戒", "円安警戒。為替要因で円ベース評価が振れやすい。", "warning");
  return result(72, "警戒", "為替介入・急変警戒。円ベースPFでは変動リスク大。", "warning");
}

function scoreCreditSpread(value) {
  if (value < 1.5) return result(68, "過熱", "信用不安はかなり低い。リスク選好が強すぎる可能性。", "overheated");
  if (value < 2.3) return result(54, "中立", "信用スプレッドは落ち着いている。", "neutral");
  if (value < 3.2) return result(34, "警戒", "信用スプレッドが拡大。景気・信用不安に注意。", "warning");
  return result(16, "警戒", "信用ストレスが強い。危機補正の対象。", "warning");
}

function scoreFinancialStress(value) {
  if (value < -0.8) return result(66, "楽観", "金融ストレスはかなり低く、リスク選好が強い可能性。", "overheated");
  if (value < 0) return result(54, "中立", "金融ストレスは低めで安定。", "neutral");
  if (value < 1) return result(34, "警戒", "金融ストレスが上昇。市場環境の悪化に注意。", "warning");
  return result(14, "警戒", "金融ストレスが高い。危機補正の対象。", "warning");
}

function scoreRealYield(value) {
  if (value < 0.5) return result(42, "支援的", "実質金利は低く、リスク資産に比較的支援的。", "pessimistic");
  if (value < 1.5) return result(50, "中立", "実質金利は中立圏。", "neutral");
  if (value < 2.2) return result(64, "警戒", "実質金利が高めで、グロースや金に圧力。", "warning");
  return result(76, "警戒", "実質金利が高い。バリュエーション圧力に注意。", "warning");
}

function scoreYieldCurve(value) {
  if (value < -0.5) return result(28, "警戒", "長短金利差が大きく逆転。景気後退リスクに注意。", "warning");
  if (value < 0) return result(38, "やや警戒", "逆イールド。景気サイクル面では警戒。", "warning");
  if (value <= 1.5) return result(50, "中立", "長短金利差は中立圏。", "neutral");
  return result(60, "景気拡大寄り", "順イールドが大きく、景気拡大寄りの環境。", "neutral");
}

function scoreDollarDeviation(value) {
  if (value <= -5) return result(42, "ドル安", "ドル安方向。海外リスク資産には支援的な面もある。", "pessimistic");
  if (value <= 5) return result(50, "中立", "ドル指数は200日線近辺。", "neutral");
  if (value <= 10) return result(62, "警戒", "ドル高が進み、新興国・外貨建て資産に圧力。", "warning");
  return result(72, "警戒", "ドル高が強い。グローバル金融環境に注意。", "warning");
}

function scoreSpAbove200(value) {
  if (value < 30) return result(20, "悲観", "上昇参加銘柄が少なく、地合いは弱い。", "pessimistic");
  if (value < 45) return result(36, "やや悲観", "市場の広がりは限定的。", "pessimistic");
  if (value <= 65) return result(50, "中立", "上昇の広がりは中立圏。", "neutral");
  if (value <= 80) return result(62, "良好", "市場の広がりは良好。過熱までは限定的。", "neutral");
  return result(78, "過熱", "参加銘柄が広がりすぎ、短期過熱の可能性。", "overheated");
}

function scorePutCall(value) {
  if (value < 0.7) return result(78, "過熱", "楽観が強い可能性。買い増しは慎重。", "overheated");
  if (value <= 1) return result(50, "中立", "オプション市場のセンチメントは中立圏。", "neutral");
  if (value <= 1.3) return result(36, "警戒", "ヘッジ需要が増加。分割判断が必要。", "warning");
  return result(22, "悲観", "極端な悲観。逆張り候補だが危機指標も確認。", "pessimistic");
}

function scoreNaaim(value) {
  if (value < 30) return result(25, "悲観", "投資家ポジションは低く、悲観寄り。", "pessimistic");
  if (value <= 70) return result(50, "中立", "ポジションは中立圏。", "neutral");
  if (value <= 90) return result(68, "強気", "強気姿勢が強く、過熱に近づく。", "overheated");
  return result(88, "過熱", "エクスポージャー過多。過熱警戒。", "overheated");
}

function scoreAaii(value) {
  if (value <= -20) return result(24, "悲観", "個人投資家心理は悲観に傾いている。", "pessimistic");
  if (value <= 20) return result(50, "中立", "個人投資家心理は中立圏。", "neutral");
  if (value <= 40) return result(66, "強気", "強気が優勢。過熱に注意。", "overheated");
  return result(84, "過熱", "個人投資家の強気が極端。", "overheated");
}

function scoreGoldDeviation(value) {
  if (value <= -8) return result(35, "弱い", "金は長期線を下回り弱い。", "pessimistic");
  if (value <= 8) return result(50, "中立", "金は中立圏。", "neutral");
  if (value <= 18) return result(66, "強い", "金は強いが、短期過熱にはまだ余地。", "overheated");
  return result(84, "過熱", "金の短期過熱。貴金属PFの追いかけ買いに注意。", "overheated");
}

function scoreOilDeviation(value) {
  if (value <= -20) return result(34, "弱い", "原油が大きく弱い。景気減速懸念を示す場合がある。", "warning");
  if (value <= 10) return result(50, "中立", "原油は中立圏。", "neutral");
  if (value <= 25) return result(62, "警戒", "原油が強く、インフレ再燃に注意。", "warning");
  return result(74, "警戒", "原油の上方乖離が大きい。金利・インフレ圧力に注意。", "warning");
}

function result(score, label, comment, tone) {
  return { score, label, comment, tone };
}

function valueOver(value, limit) {
  const number = normalizeNullableNumber(value);
  return number !== null && number > limit;
}

function valueOverOrEqual(value, limit) {
  const number = normalizeNullableNumber(value);
  return number !== null && number >= limit;
}

function valueUnder(value, limit) {
  const number = normalizeNullableNumber(value);
  return number !== null && number < limit;
}

function valueUnderOrEqual(value, limit) {
  const number = normalizeNullableNumber(value);
  return number !== null && number <= limit;
}

function formatValue(value, unit) {
  return Number.isInteger(value) ? value + unit : Math.round(value * 100) / 100 + unit;
}

function formatDelta(diff, unit) {
  const rounded = Math.round(diff * 100) / 100;
  const sign = rounded > 0 ? "+" : "";
  return sign + rounded + unit;
}

function percentChange(current, previous) {
  if (previous === 0) return 0;
  return (current - previous) / Math.abs(previous) * 100;
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
