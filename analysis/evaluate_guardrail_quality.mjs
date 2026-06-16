import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeMarket } from "../src/market-analysis.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "analysis", "output");
const label = process.argv[2] || "current";
const outputPath = path.join(OUTPUT_DIR, `guardrail_quality_${label}.json`);
const HORIZON_DAYS = Number(process.env.GUARDRAIL_HORIZON_DAYS || 10);

const inputs = JSON.parse(
  fs.readFileSync(path.join(OUTPUT_DIR, "backtest_inputs.json"), "utf8")
);
const selectiveByDate = readSelectiveDefense(
  path.join(OUTPUT_DIR, "selective_defense_daily.csv")
);
const events = readEvents(path.join(OUTPUT_DIR, "backtest_events.csv"));

const rows = inputs.map((row) => {
  const selective = selectiveByDate.get(row.date) || {};
  const derived = { ...(row.derived || {}), ...selective };
  const analysis = analyzeMarket(row.values || {}, null, { derived });
  return {
    date: row.date,
    sp500: row.sp500,
    values: row.values || {},
    derived,
    axes: analysis.axes,
    scores: analysis.scores,
    regime: analysis.regime,
    action: analysis.actions.primary,
    expansionAction: analysis.actions.primary?.endsWith("拡大") === true,
    reductionAction: analysis.actions.primary?.endsWith("縮小") === true,
    guardrails: analysis.guardrails
  };
});

const evaluationStart = rows.findIndex((row) => row.date >= "2007-10-17");
const evaluated = rows.slice(evaluationStart);
const indexes = new Map(rows.map((row, index) => [row.date, index]));
const eventWindows = events.map((event) => ({
  ...event,
  peakIndex: indexes.get(event.peakDate),
  troughIndex: indexes.get(event.troughDate),
  triggerIndex: indexes.get(event.triggerDate)
}));

const defensive = evaluateEpisodes(
  rows,
  eventWindows,
  (row) => isDefensive(row.guardrails.trimPermission),
  evaluationStart
);
const blocked = evaluateEpisodes(
  rows,
  eventWindows,
  (row) => row.guardrails.addPermission === "blocked",
  evaluationStart
);

const eventResults = eventWindows.map((event) => {
  const firstDefense = firstIndex(
    rows,
    event.peakIndex,
    event.troughIndex,
    (row) => isDefensive(row.guardrails.trimPermission)
  );
  const firstBlocked = firstIndex(
    rows,
    event.peakIndex,
    event.troughIndex,
    (row) => row.guardrails.addPermission === "blocked"
  );
  const cross5 = crossingIndex(rows, event.peakIndex, event.troughIndex, -0.05);
  const cross10 = crossingIndex(rows, event.peakIndex, event.troughIndex, -0.10);
  const sellTooMuchWindowStart = Math.max(event.peakIndex, event.troughIndex - 5);
  const sellTooMuchWindowEnd = Math.min(rows.length - 1, event.troughIndex + 10);
  const avoidIndex = firstIndex(
    rows,
    sellTooMuchWindowStart,
    sellTooMuchWindowEnd,
    (row) => ["avoid", "hold_defense"].includes(row.guardrails.trimPermission)
  );
  const peakPrice = rows[event.peakIndex].sp500;

  return {
    event: event.name,
    peakDate: event.peakDate,
    troughDate: event.troughDate,
    firstBlockedDate: firstBlocked === null ? null : rows[firstBlocked].date,
    blockedDrawdownPct: firstBlocked === null
      ? null
      : round((rows[firstBlocked].sp500 / peakPrice - 1) * 100),
    blockedBefore5Pct: firstBlocked !== null && firstBlocked <= cross5,
    blockedBefore10Pct: firstBlocked !== null && firstBlocked <= cross10,
    firstDefensiveDate: firstDefense === null ? null : rows[firstDefense].date,
    defensiveDrawdownPct: firstDefense === null
      ? null
      : round((rows[firstDefense].sp500 / peakPrice - 1) * 100),
    defensiveBefore10Pct: firstDefense !== null && firstDefense <= cross10,
    defensiveAt12Pct: isDefensive(rows[event.triggerIndex]?.guardrails.trimPermission),
    sellTooMuchProtectionNearTrough: avoidIndex !== null,
    sellTooMuchProtectionDate: avoidIndex === null ? null : rows[avoidIndex].date,
    sellTooMuchProtectionLagDays: avoidIndex === null ? null : avoidIndex - event.troughIndex
  };
});

const expansionRows = evaluated.filter((row) => row.expansionAction);
const reductionRows = evaluated.filter((row) => row.reductionAction);
const selectiveDefenseRows = evaluated.filter((row) => row.regime.key === "selective_defense");
const dataHoldRows = evaluated.filter((row) => row.regime.key === "data_quality_hold");
const forwardMetrics = {
  addBlocked: evaluateForwardEpisodes(
    rows,
    (row) => row.guardrails.addPermission === "blocked",
    evaluationStart,
    rows.length - 1
  ),
  defensive: evaluateForwardEpisodes(
    rows,
    (row) => isDefensive(row.guardrails.trimPermission),
    evaluationStart,
    rows.length - 1
  ),
  reductionAction: evaluateForwardEpisodes(
    rows,
    (row) => row.reductionAction,
    evaluationStart,
    rows.length - 1
  ),
  defensivePriority: evaluateForwardEpisodes(
    rows,
    (row) => row.guardrails.trimPermission === "defensive_priority",
    evaluationStart,
    rows.length - 1
  ),
  holdDefense: evaluateForwardEpisodes(
    rows,
    (row) => row.guardrails.trimPermission === "hold_defense",
    evaluationStart,
    rows.length - 1
  ),
  expansionAction: evaluateForwardEpisodes(
    rows,
    (row) => row.expansionAction,
    evaluationStart,
    rows.length - 1
  )
};
const periods = {
  development: summarizePeriod("2007-10-17", "2016-12-31"),
  validation: summarizePeriod("2017-01-01", "2022-12-31"),
  recent: summarizePeriod("2023-01-01", rows.at(-1)?.date || "9999-12-31")
};
const blockedSignalNames = [
  "selectiveDefense",
  "creditCrisis",
  "creditStress",
  "preCrash",
  "rateBear",
  "vixSpDecline",
  "vixNasdaqDecline",
  "creditTrend",
  "nasdaqDivergence",
  "heatStress"
];
const signalDiagnostics = {
  addBlocked: Object.fromEntries(blockedSignalNames.map((signal) => {
    const predicate = (row) => blockedSignalKeys(row).includes(signal);
    const signalDays = evaluated.filter(predicate).length;
    const exclusiveDays = evaluated.filter(
      (row) => predicate(row) && blockedSignalKeys(row).length === 1
    ).length;
    return [signal, {
      signalDays,
      exclusiveDays,
      activeDaysPct: round(signalDays / evaluated.length * 100),
      forward: evaluateForwardEpisodes(rows, predicate, evaluationStart, rows.length - 1),
      exclusiveForward: evaluateForwardEpisodes(
        rows,
        (row) => predicate(row) && blockedSignalKeys(row).length === 1,
        evaluationStart,
        rows.length - 1
      )
    }];
  })),
  expansion: Object.fromEntries(
    ["buyable_fear", "recovering_stress", "constructive", "risk_on"].map((regimeKey) => [
      regimeKey,
      evaluateForwardEpisodes(
        rows,
        (row) => row.expansionAction && row.regime.key === regimeKey,
        evaluationStart,
        rows.length - 1
      )
    ])
  ),
  regime: Object.fromEntries(
    ["buyable_fear", "recovering_stress", "constructive", "risk_on", "selective_defense", "credit_crisis", "rate_bear", "overheat_fading"].map((regimeKey) => [
      regimeKey,
      evaluateForwardEpisodes(
        rows,
        (row) => row.regime.key === regimeKey,
        evaluationStart,
        rows.length - 1
      )
    ])
  ),
  expansionByPermission: Object.fromEntries(
    ["normal", "cautious", "blocked"].map((permission) => [
      permission,
      evaluateForwardEpisodes(
        rows,
        (row) => row.expansionAction && row.guardrails.addPermission === permission,
        evaluationStart,
        rows.length - 1
      )
    ])
  )
};

const summary = {
  generatedAt: new Date().toISOString(),
  label,
  horizonDays: HORIZON_DAYS,
  period: {
    start: evaluated[0]?.date || null,
    end: evaluated.at(-1)?.date || null,
    days: evaluated.length
  },
  eventMetrics: {
    eventCount: eventResults.length,
    blockedBefore5PctHits: eventResults.filter((item) => item.blockedBefore5Pct).length,
    blockedBefore10PctHits: eventResults.filter((item) => item.blockedBefore10Pct).length,
    averageBlockedDrawdownPct: average(
      eventResults.map((item) => item.blockedDrawdownPct).filter((value) => value !== null)
    ),
    defensiveBefore10PctHits: eventResults.filter((item) => item.defensiveBefore10Pct).length,
    defensiveAt12PctHits: eventResults.filter((item) => item.defensiveAt12Pct).length,
    averageDefensiveDrawdownPct: average(
      eventResults.map((item) => item.defensiveDrawdownPct).filter((value) => value !== null)
    ),
    sellTooMuchProtectionNearTroughHits: eventResults.filter(
      (item) => item.sellTooMuchProtectionNearTrough
    ).length
  },
  defensiveEpisodes: defensive,
  blockedEpisodes: blocked,
  forwardMetrics,
  periods,
  signalDiagnostics,
  consistency: {
    selectiveDefenseDays: selectiveDefenseRows.length,
    selectiveDefenseAddNotBlockedDays: selectiveDefenseRows.filter(
      (row) => row.guardrails.addPermission !== "blocked"
    ).length,
    selectiveDefenseTrimNotDefensiveDays: selectiveDefenseRows.filter(
      (row) => !isDefensive(row.guardrails.trimPermission)
    ).length,
    dataQualityHoldDays: dataHoldRows.length,
    dataQualityHoldLabelMismatchDays: dataHoldRows.filter(
      (row) => row.guardrails.mainLabel !== "判断不能・維持"
    ).length,
    expansionDays: expansionRows.length,
    expansionAddBlockedDays: expansionRows.filter(
      (row) => row.guardrails.addPermission === "blocked"
    ).length,
    expansionAddCautiousDays: expansionRows.filter(
      (row) => row.guardrails.addPermission === "cautious"
    ).length,
    reductionDays: reductionRows.length,
    reductionTrimDefensiveDays: reductionRows.filter(
      (row) => isDefensive(row.guardrails.trimPermission)
    ).length
  },
  distribution: {
    addPermission: countBy(evaluated, (row) => row.guardrails.addPermission),
    trimPermission: countBy(evaluated, (row) => row.guardrails.trimPermission),
    mainLabel: countBy(evaluated, (row) => row.guardrails.mainLabel),
    confidence: countBy(evaluated, (row) => row.guardrails.confidence)
  },
  events: eventResults
};

fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));

function readSelectiveDefense(filePath) {
  const rows = readCsv(filePath);
  return new Map(rows.map((row) => [
    row.date,
    {
      selectiveDefenseActive: booleanValue(row.defensive),
      selectiveDefenseRisk: booleanValue(row.risk),
      selectiveDefenseBadCount: numberValue(row.bad_count),
      selectivePriceRisk: booleanValue(row.bad_price),
      selectiveVolatilityRisk: booleanValue(row.bad_volatility),
      selectiveCreditRisk: booleanValue(row.bad_credit),
      selectiveBreadthRisk: booleanValue(row.bad_breadth)
    }
  ]));
}

function readEvents(filePath) {
  return readCsv(filePath).map((row) => ({
    name: row.event,
    peakDate: row.peak_date,
    troughDate: row.trough_date,
    triggerDate: row.trigger_date
  }));
}

function readCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function evaluateEpisodes(allRows, windows, predicate, startIndex, endIndex = allRows.length - 1) {
  const episodes = episodeRanges(allRows, predicate, startIndex, endIndex);
  const falseEpisodes = episodes.filter(([start, end]) => !windows.some(
    (event) => start <= event.troughIndex && end >= event.peakIndex
  ));
  const years = Math.max((Date.parse(allRows[endIndex].date) - Date.parse(allRows[startIndex].date)) /
    (365.2425 * 24 * 60 * 60 * 1000), 1);
  const activeDays = allRows.slice(startIndex, endIndex + 1).filter(predicate).length;
  const durations = episodes.map(([start, end]) => end - start + 1);

  return {
    episodeCount: episodes.length,
    falseEpisodeCount: falseEpisodes.length,
    falseEpisodesPerYear: round(falseEpisodes.length / years),
    activeDaysPct: round(activeDays / (endIndex - startIndex + 1) * 100),
    averageDurationDays: average(durations),
    medianDurationDays: median(durations)
  };
}

function evaluateForwardEpisodes(
  allRows,
  predicate,
  startIndex,
  endIndex,
  horizonDays = HORIZON_DAYS
) {
  const episodes = episodeRanges(allRows, predicate, startIndex, endIndex);
  const outcomes = episodes.map(([start, end]) => {
    const basePrice = allRows[start]?.sp500;
    const future = allRows.slice(start + 1, Math.min(allRows.length, start + horizonDays + 1));
    const returns = Number.isFinite(basePrice)
      ? future
        .map((row) => Number.isFinite(row.sp500) ? (row.sp500 / basePrice - 1) * 100 : null)
        .filter((value) => value !== null)
      : [];
    return {
      startDate: allRows[start]?.date || null,
      endDate: allRows[end]?.date || null,
      durationDays: end - start + 1,
      maxDrawdownPct: returns.length ? round(Math.min(0, ...returns)) : null,
      maxGainPct: returns.length ? round(Math.max(0, ...returns)) : null
    };
  });
  const usable = outcomes.filter((item) => item.maxDrawdownPct !== null);
  const dayOutcomes = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (!predicate(allRows[index])) continue;
    const basePrice = allRows[index]?.sp500;
    const future = allRows.slice(index + 1, Math.min(allRows.length, index + horizonDays + 1));
    const returns = Number.isFinite(basePrice)
      ? future
        .map((row) => Number.isFinite(row.sp500) ? (row.sp500 / basePrice - 1) * 100 : null)
        .filter((value) => value !== null)
      : [];
    if (returns.length) {
      dayOutcomes.push({
        maxDrawdownPct: round(Math.min(0, ...returns)),
        maxGainPct: round(Math.max(0, ...returns))
      });
    }
  }

  return {
    episodeCount: episodes.length,
    activeDayCount: dayOutcomes.length,
    averageDurationDays: average(outcomes.map((item) => item.durationDays)),
    medianDurationDays: median(outcomes.map((item) => item.durationDays)),
    future3PctDeclineHits: usable.filter((item) => item.maxDrawdownPct <= -3).length,
    future5PctDeclineHits: usable.filter((item) => item.maxDrawdownPct <= -5).length,
    future8PctDeclineHits: usable.filter((item) => item.maxDrawdownPct <= -8).length,
    future3PctGainHits: usable.filter((item) => item.maxGainPct >= 3).length,
    future5PctGainHits: usable.filter((item) => item.maxGainPct >= 5).length,
    adverse3PctHits: usable.filter((item) => item.maxDrawdownPct <= -3).length,
    adverse5PctHits: usable.filter((item) => item.maxDrawdownPct <= -5).length,
    averageMaxDrawdownPct: average(usable.map((item) => item.maxDrawdownPct)),
    averageMaxGainPct: average(usable.map((item) => item.maxGainPct)),
    dayFuture3PctDeclineHits: dayOutcomes.filter((item) => item.maxDrawdownPct <= -3).length,
    dayFuture5PctDeclineHits: dayOutcomes.filter((item) => item.maxDrawdownPct <= -5).length,
    dayFuture3PctGainHits: dayOutcomes.filter((item) => item.maxGainPct >= 3).length,
    dayFuture5PctGainHits: dayOutcomes.filter((item) => item.maxGainPct >= 5).length,
    dayAverageMaxDrawdownPct: average(dayOutcomes.map((item) => item.maxDrawdownPct)),
    dayAverageMaxGainPct: average(dayOutcomes.map((item) => item.maxGainPct))
  };
}

function summarizePeriod(startDate, endDate) {
  const startIndex = rows.findIndex((row) => row.date >= startDate);
  let endIndex = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].date <= endDate) {
      endIndex = index;
      break;
    }
  }
  if (startIndex < 0 || endIndex < startIndex) return null;

  const periodRows = rows.slice(startIndex, endIndex + 1);
  const periodEvents = eventResults.filter(
    (event) => event.peakDate >= startDate && event.peakDate <= endDate
  );
  const periodDefensive = evaluateEpisodes(
    rows,
    eventWindows,
    (row) => isDefensive(row.guardrails.trimPermission),
    startIndex,
    endIndex
  );
  const periodBlocked = evaluateEpisodes(
    rows,
    eventWindows,
    (row) => row.guardrails.addPermission === "blocked",
    startIndex,
    endIndex
  );

  return {
    start: rows[startIndex].date,
    end: rows[endIndex].date,
    days: periodRows.length,
    eventCount: periodEvents.length,
    blockedBefore5PctHits: periodEvents.filter((event) => event.blockedBefore5Pct).length,
    blockedBefore10PctHits: periodEvents.filter((event) => event.blockedBefore10Pct).length,
    defensiveBefore10PctHits: periodEvents.filter((event) => event.defensiveBefore10Pct).length,
    defensiveAt12PctHits: periodEvents.filter((event) => event.defensiveAt12Pct).length,
    sellTooMuchProtectionNearTroughHits: periodEvents.filter(
      (event) => event.sellTooMuchProtectionNearTrough
    ).length,
    defensiveEpisodes: periodDefensive,
    blockedEpisodes: periodBlocked,
    forwardMetrics: {
      addBlocked: evaluateForwardEpisodes(
        rows,
        (row) => row.guardrails.addPermission === "blocked",
        startIndex,
        endIndex
      ),
      defensive: evaluateForwardEpisodes(
        rows,
        (row) => isDefensive(row.guardrails.trimPermission),
        startIndex,
        endIndex
      ),
      reductionAction: evaluateForwardEpisodes(
        rows,
        (row) => row.reductionAction,
        startIndex,
        endIndex
      ),
      expansionAction: evaluateForwardEpisodes(
        rows,
        (row) => row.expansionAction,
        startIndex,
        endIndex
      )
    },
    distribution: {
      addPermission: countBy(periodRows, (row) => row.guardrails.addPermission),
      trimPermission: countBy(periodRows, (row) => row.guardrails.trimPermission),
      confidence: countBy(periodRows, (row) => row.guardrails.confidence)
    }
  };
}

function episodeRanges(allRows, predicate, startIndex, endIndex) {
  const episodes = [];
  let episodeStart = null;
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (predicate(allRows[index]) && episodeStart === null) {
      episodeStart = index;
    } else if (!predicate(allRows[index]) && episodeStart !== null) {
      episodes.push([episodeStart, index - 1]);
      episodeStart = null;
    }
  }
  if (episodeStart !== null) episodes.push([episodeStart, endIndex]);
  return episodes;
}

function blockedSignalKeys(row) {
  const signals = [];
  const values = row.values || {};
  const derived = row.derived || {};
  const scores = row.scores || {};
  const axes = row.axes || {};
  const regimeKey = row.regime?.key || "";
  const vix5 = numeric(derived.vixChange5d);
  const sp5 = numeric(derived.sp500Change5d);
  const sp10 = numeric(derived.sp500Change10d);
  const nasdaq5 = numeric(derived.nasdaq100Change5d);
  const credit5 = numeric(derived.creditTrend5d);
  const credit10 = numeric(derived.creditTrend10d);
  const qqqSpy20 = numeric(derived.qqqSpyChange20d);
  const peakOut = numeric(scores.peakOutScore);
  const stress = numeric(axes.stress);
  const vixSpDecline = vix5 !== null && vix5 >= 4 && sp5 !== null && sp5 <= -2;
  const vixNasdaqDecline =
    vix5 !== null && vix5 >= 4 && nasdaq5 !== null && nasdaq5 <= -3;
  const creditTrendWorsening =
    credit5 !== null && credit5 <= -0.8 && credit10 !== null && credit10 <= -1.2;
  const vixDeclineConfirmed =
    (vixSpDecline && vixNasdaqDecline) ||
    (
      (vixSpDecline || vixNasdaqDecline) &&
      (
        creditTrendWorsening ||
        regimeKey === "selective_risk_watch" ||
        (stress !== null && stress >= 50)
      )
    );
  const creditTrendConfirmed =
    creditTrendWorsening &&
    (
      regimeKey === "selective_risk_watch" ||
      vixSpDecline ||
      vixNasdaqDecline ||
      (stress !== null && stress >= 50)
    );

  addSignal(signals, regimeKey === "selective_defense", "selectiveDefense");
  addSignal(signals, regimeKey === "credit_crisis", "creditCrisis");
  addSignal(signals, numeric(scores.creditStressScore) >= 68, "creditStress");
  addSignal(signals, numeric(scores.preCrashRiskScore) >= 64, "preCrash");
  addSignal(
    signals,
    numeric(scores.rateBearScore) >= 64 &&
      numeric(scores.creditStressScore) >= 35 &&
      peakOut !== null && peakOut < 62,
    "rateBear"
  );
  addSignal(signals, vixSpDecline && vixDeclineConfirmed, "vixSpDecline");
  addSignal(signals, vixNasdaqDecline && vixDeclineConfirmed, "vixNasdaqDecline");
  addSignal(signals, creditTrendConfirmed, "creditTrend");
  addSignal(
    signals,
    numeric(values.nasdaqDeviation) >= 15 &&
      qqqSpy20 !== null && qqqSpy20 >= 2 &&
      sp10 !== null && sp10 <= 1,
    "nasdaqDivergence"
  );
  addSignal(
    signals,
    numeric(axes.heat) >= 72 && numeric(axes.stress) >= 50,
    "heatStress"
  );
  return signals;
}

function addSignal(signals, condition, name) {
  if (condition) signals.push(name);
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstIndex(allRows, start, end, predicate) {
  for (let index = start; index <= end; index += 1) {
    if (predicate(allRows[index])) return index;
  }
  return null;
}

function crossingIndex(allRows, peak, trough, threshold) {
  const peakPrice = allRows[peak].sp500;
  for (let index = peak; index <= trough; index += 1) {
    if (allRows[index].sp500 / peakPrice - 1 <= threshold) return index;
  }
  return trough;
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item) ?? "null";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function isDefensive(permission) {
  return ["defensive_priority", "hold_defense"].includes(permission);
}

function average(values) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? round(sorted[middle])
    : round((sorted[middle - 1] + sorted[middle]) / 2);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function booleanValue(value) {
  if (value === "True") return true;
  if (value === "False") return false;
  return null;
}

function numberValue(value) {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
