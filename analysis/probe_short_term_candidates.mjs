import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeMarket } from "../src/market-analysis.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "analysis", "output");
const HORIZON_DAYS = 10;

const inputs = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "backtest_inputs.json"), "utf8"));
const selectiveByDate = readSelectiveDefense(path.join(OUTPUT_DIR, "selective_defense_daily.csv"));

const rows = inputs.map((row) => {
  const derived = { ...(row.derived || {}), ...(selectiveByDate.get(row.date) || {}) };
  const analysis = analyzeMarket(row.values || {}, null, { derived });
  const outcome = forwardOutcome(inputs, row, HORIZON_DAYS);
  return {
    ...row,
    derived,
    analysis,
    outcome,
    isExpansion: analysis.actions.primary?.endsWith("拡大") === true,
    isReduction: analysis.actions.primary?.endsWith("縮小") === true
  };
});

const evaluationStart = rows.findIndex((row) => row.date >= "2007-10-17");
const evaluated = rows.slice(evaluationStart);

const candidates = [
  {
    name: "base",
    expansion: (row) => row.isExpansion,
    reduction: (row) => row.isReduction
  },
  {
    name: "no_expansion_when_trim_avoid",
    expansion: (row) => row.isExpansion && row.analysis.guardrails.trimPermission !== "avoid",
    reduction: (row) => row.isReduction
  },
  {
    name: "recovery_needs_positive_10d",
    expansion: (row) => row.isExpansion && !(
      row.analysis.regime.key === "recovering_stress" &&
      (n(row.derived.sp500Change10d) < 0 || n(row.derived.nasdaq100Change10d) < 0)
    ),
    reduction: (row) => row.isReduction
  },
  {
    name: "recovery_needs_recovery35",
    expansion: (row) => row.isExpansion && !(
      row.analysis.regime.key === "recovering_stress" &&
      n(row.analysis.axes.recovery) < 35
    ),
    reduction: (row) => row.isReduction
  },
  {
    name: "constructive_no_late_greed",
    expansion: (row) => row.isExpansion && !(
      row.analysis.regime.key === "constructive" &&
      n(row.values.fearGreed) >= 65 &&
      n(row.derived.qqqSpyChange20d) >= 2
    ),
    reduction: (row) => row.isReduction
  },
  {
    name: "constructive_no_rate_fade",
    expansion: (row) => row.isExpansion && !(
      row.analysis.regime.key === "constructive" &&
      n(row.analysis.scores.rateBearScore) >= 38 &&
      n(row.derived.qqqSpyChange20d) < 1.5
    ),
    reduction: (row) => row.isReduction
  },
  {
    name: "risk_on_needs_nasdaq_5d",
    expansion: (row) => row.isExpansion && !(
      row.analysis.regime.key === "risk_on" &&
      n(row.analysis.scores.peakOutScore) >= 60 &&
      n(row.derived.nasdaq100Change5d) < 0
    ),
    reduction: (row) => row.isReduction
  },
  {
    name: "constructive_quality_filters",
    expansion: (row) => row.isExpansion && !constructiveLateGreed(row) && !constructiveRateFade(row),
    reduction: (row) => row.isReduction
  },
  {
    name: "expansion_quality_without_trim_avoid",
    expansion: (row) => row.isExpansion && !constructiveLateGreed(row) && !constructiveRateFade(row) && !riskOnWeakNasdaq(row),
    reduction: (row) => row.isReduction
  },
  {
    name: "risk_on_precrash_peak_guard",
    expansion: (row) => row.isExpansion && !(
      row.analysis.regime.key === "risk_on" &&
      n(row.analysis.scores.preCrashRiskScore) >= 30 &&
      n(row.analysis.scores.peakOutScore) >= 60
    ),
    reduction: (row) => row.isReduction
  },
  {
    name: "risk_on_precrash_peak_guard35",
    expansion: (row) => row.isExpansion && !(
      row.analysis.regime.key === "risk_on" &&
      n(row.analysis.scores.preCrashRiskScore) >= 35 &&
      n(row.analysis.scores.peakOutScore) >= 60
    ),
    reduction: (row) => row.isReduction
  },
  {
    name: "risk_on_precrash_peak_guard40",
    expansion: (row) => row.isExpansion && !(
      row.analysis.regime.key === "risk_on" &&
      n(row.analysis.scores.preCrashRiskScore) >= 40 &&
      n(row.analysis.scores.peakOutScore) >= 60
    ),
    reduction: (row) => row.isReduction
  },
  {
    name: "expansion_needs_qqq_not_negative",
    expansion: (row) => row.isExpansion && n(row.derived.qqqSpyChange20d) >= 0,
    reduction: (row) => row.isReduction
  },
  {
    name: "combined_expansion_quality",
    expansion: (row) => (
      row.isExpansion &&
      row.analysis.guardrails.trimPermission !== "avoid" &&
      !(
        row.analysis.regime.key === "constructive" &&
        n(row.values.fearGreed) >= 65 &&
        n(row.derived.qqqSpyChange20d) >= 2
      ) &&
      !(
        row.analysis.regime.key === "constructive" &&
        n(row.analysis.scores.rateBearScore) >= 38 &&
        n(row.derived.qqqSpyChange20d) < 1.5
      ) &&
      !(
        row.analysis.regime.key === "risk_on" &&
        n(row.analysis.scores.peakOutScore) >= 60 &&
        n(row.derived.nasdaq100Change5d) < 0
      )
    ),
    reduction: (row) => row.isReduction
  },
  {
    name: "credit_crisis_hold_vix_relief",
    expansion: (row) => row.isExpansion,
    reduction: (row) => row.isReduction && !creditCrisisHoldVixRelief(row)
  },
  {
    name: "credit_crisis_hold_price_repair",
    expansion: (row) => row.isExpansion,
    reduction: (row) => row.isReduction && !creditCrisisHoldPriceRepair(row)
  },
  {
    name: "credit_crisis_hold_combined",
    expansion: (row) => row.isExpansion,
    reduction: (row) => row.isReduction && !(
      creditCrisisHoldVixRelief(row) || creditCrisisHoldPriceRepair(row)
    )
  },
  {
    name: "combined_all_quality",
    expansion: (row) => (
      row.isExpansion &&
      row.analysis.guardrails.trimPermission !== "avoid" &&
      !(
        row.analysis.regime.key === "constructive" &&
        n(row.values.fearGreed) >= 65 &&
        n(row.derived.qqqSpyChange20d) >= 2
      ) &&
      !(
        row.analysis.regime.key === "constructive" &&
        n(row.analysis.scores.rateBearScore) >= 38 &&
        n(row.derived.qqqSpyChange20d) < 1.5
      ) &&
      !(
        row.analysis.regime.key === "risk_on" &&
        n(row.analysis.scores.peakOutScore) >= 60 &&
        n(row.derived.nasdaq100Change5d) < 0
      )
    ),
    reduction: (row) => row.isReduction && !(
      creditCrisisHoldVixRelief(row) || creditCrisisHoldPriceRepair(row)
    )
  }
];

for (const candidate of candidates) {
  const expansion = summarizeForward(candidate.expansion);
  const reduction = summarizeForward(candidate.reduction);
  console.log(JSON.stringify({
    name: candidate.name,
    expansion,
    reduction
  }));
}

function creditCrisisHoldVixRelief(row) {
  return row.analysis.regime.key === "credit_crisis" &&
    n(row.analysis.scores.peakOutScore) >= 35 &&
    n(row.derived.vixDrawdownFrom10dHigh) <= -10 &&
    (
      row.derived.sp500NoNewLow3d === true ||
      row.derived.nasdaq100NoNewLow3d === true ||
      n(row.derived.creditTrend5d) >= -2
    );
}

function constructiveLateGreed(row) {
  return row.analysis.regime.key === "constructive" &&
    n(row.values.fearGreed) >= 65 &&
    n(row.derived.qqqSpyChange20d) >= 2;
}

function constructiveRateFade(row) {
  return row.analysis.regime.key === "constructive" &&
    n(row.analysis.scores.rateBearScore) >= 38 &&
    n(row.derived.qqqSpyChange20d) < 1.5;
}

function riskOnWeakNasdaq(row) {
  return row.analysis.regime.key === "risk_on" &&
    n(row.analysis.scores.peakOutScore) >= 60 &&
    n(row.derived.nasdaq100Change5d) < 0;
}

function creditCrisisHoldPriceRepair(row) {
  return row.analysis.regime.key === "credit_crisis" &&
    n(row.analysis.scores.peakOutScore) >= 40 &&
    n(row.derived.sp500Change10d) > 0 &&
    n(row.derived.nasdaq100Change10d) > 0 &&
    n(row.derived.vixDrawdownFrom10dHigh) <= -5;
}

function summarizeForward(predicate) {
  const active = evaluated.map((row, offset) => ({ row, index: evaluationStart + offset }))
    .filter(({ row }) => predicate(row));
  const episodes = [];
  let current = null;
  for (const item of active) {
    if (!current || item.index !== current.endIndex + 1) {
      current = { startIndex: item.index, endIndex: item.index, rows: [item.row] };
      episodes.push(current);
    } else {
      current.endIndex = item.index;
      current.rows.push(item.row);
    }
  }
  const episodeOutcomes = episodes.map((episode) => rows[episode.startIndex].outcome);
  const dayOutcomes = active.map(({ row }) => row.outcome);
  return {
    days: active.length,
    episodes: episodes.length,
    future3Gain: episodeOutcomes.filter((item) => item.maxGainPct >= 3).length,
    future3Decline: episodeOutcomes.filter((item) => item.maxDrawdownPct <= -3).length,
    avgGain: average(episodeOutcomes.map((item) => item.maxGainPct)),
    avgDrawdown: average(episodeOutcomes.map((item) => item.maxDrawdownPct)),
    day3Gain: dayOutcomes.filter((item) => item.maxGainPct >= 3).length,
    day3Decline: dayOutcomes.filter((item) => item.maxDrawdownPct <= -3).length
  };
}

function forwardOutcome(allRows, row, horizonDays) {
  const index = allRows.indexOf(row);
  const price = row.sp500;
  let maxDrawdownPct = 0;
  let maxGainPct = 0;
  for (let cursor = index + 1; cursor <= Math.min(allRows.length - 1, index + horizonDays); cursor += 1) {
    const changePct = (allRows[cursor].sp500 / price - 1) * 100;
    maxDrawdownPct = Math.min(maxDrawdownPct, changePct);
    maxGainPct = Math.max(maxGainPct, changePct);
  }
  return { maxDrawdownPct, maxGainPct };
}

function readSelectiveDefense(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  return new Map(lines.map((line) => {
    const columns = line.split(",");
    const item = {};
    header.forEach((key, index) => {
      item[key] = valueFromCsv(columns[index]);
    });
    return [item.date, {
      selectiveDefenseActive: item.defensive,
      selectiveDefenseRisk: item.risk,
      selectiveDefenseBadCount: item.bad_count,
      selectivePriceRisk: item.bad_price,
      selectiveVolatilityRisk: item.bad_volatility,
      selectiveCreditRisk: item.bad_credit,
      selectiveBreadthRisk: item.bad_breadth
    }];
  }));
}

function valueFromCsv(value) {
  if (value === "True") return true;
  if (value === "False") return false;
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100
    : null;
}
