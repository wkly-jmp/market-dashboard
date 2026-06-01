import { AUTO_FIELD_IDS, FIELDS, MANUAL_FIELD_IDS, normalizeNullableNumber, validateValues } from "./scoring.js";

const STORAGE_KEY = "marketTemperatureDashboard";
const HISTORY_KEY = "marketTemperatureDashboardHistory";
const OVERRIDE_KEY = "marketTemperatureDashboardOverrides";
const MAX_HISTORY = 30;

export async function loadLatestData() {
  try {
    const response = await fetch("data/latest.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("data/latest.json の読み込みに失敗しました: " + response.status);
    }
    return await response.json();
  } catch (error) {
    return {
      updated_at: null,
      updated_at_jst: "",
      status: "error",
      values: {},
      sources: {},
      warnings: ["data/latest.json を読み込めませんでした。GitHub Pages配信またはローカルサーバーで確認してください。", error.message]
    };
  }
}

export function loadOverrides() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

export function saveOverrides(overrides) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
}

export function clearOverrides() {
  localStorage.removeItem(OVERRIDE_KEY);
}

export function buildValues(latestData, overrides) {
  const values = {};
  const inputWarnings = [];

  FIELDS.forEach((field) => {
    const sourceValue = field.source === "auto"
      ? normalizeNullableNumber(latestData.values ? latestData.values[field.id] : null)
      : null;

    const overrideKey = field.source === "auto" ? "override-" + field.id : "manual-" + field.id;
    const overrideValue = normalizeNullableNumber(overrides[overrideKey]);
    values[field.id] = overrideValue !== null ? overrideValue : sourceValue;
  });

  inputWarnings.push(...validateValues(values));
  return { values, inputWarnings };
}

export function collectOverridesFromForm() {
  const overrides = {};
  const ids = [
    ...AUTO_FIELD_IDS.map((id) => "override-" + id),
    ...MANUAL_FIELD_IDS.map((id) => "manual-" + id)
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element && element.value.trim() !== "") {
      overrides[id] = element.value.trim();
    }
  });

  const memo = document.getElementById("memo");
  overrides.memo = memo ? memo.value : "";
  return overrides;
}

export function hydrateOverrideForm(overrides) {
  [
    ...AUTO_FIELD_IDS.map((id) => "override-" + id),
    ...MANUAL_FIELD_IDS.map((id) => "manual-" + id)
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = overrides[id] || "";
  });

  const memo = document.getElementById("memo");
  if (memo) memo.value = overrides.memo || "";
}

export function resetOverrideForm() {
  [
    ...AUTO_FIELD_IDS.map((id) => "override-" + id),
    ...MANUAL_FIELD_IDS.map((id) => "manual-" + id)
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });

  const memo = document.getElementById("memo");
  if (memo) memo.value = "";
}

export function getHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export function saveSnapshot(values, score, latestData, memo) {
  const now = new Date();
  const snapshot = {
    values,
    score,
    memo,
    updatedAt: formatLocalDate(now),
    savedAt: now.toISOString(),
    dataUpdatedAt: latestData.updated_at || null,
    dataUpdatedAtJst: latestData.updated_at_jst || "",
    status: latestData.status || "unknown"
  };

  const history = getHistory();
  const previousSnapshot = history.length > 0 ? history[history.length - 1] : null;
  history.push(snapshot);
  while (history.length > MAX_HISTORY) history.shift();

  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return previousSnapshot;
}

export function getComparisonSnapshot(values) {
  const history = getHistory();
  if (history.length === 0) return null;

  const latest = history[history.length - 1];
  if (latest && latest.values && valuesAreSame(values, latest.values)) {
    return history.length >= 2 ? history[history.length - 2] : null;
  }

  return latest;
}

export function getDataWarnings(latestData) {
  const warnings = [];
  const dataAge = getSourceDataAgeDays(latestData);

  if (latestData.status && latestData.status !== "ok") {
    warnings.push({ level: "danger", text: "取得失敗：前回JSONまたは空データを表示しています。" });
  }

  if (dataAge !== null && dataAge >= 3) {
    warnings.push({ level: "warn", text: "データが " + dataAge + " 日前です。市場急変時は参考程度にしてください。" });
  }

  (latestData.warnings || []).forEach((warning) => {
    warnings.push({ level: "warn", text: warning });
  });

  getStaleSourceRows(latestData, 7).forEach((row) => {
    warnings.push({ level: "warn", text: row.name + " のデータ日付が古いです（" + row.date + "）。" });
  });

  return { warnings, dataAge };
}

export function getDataDateSummary(latestData) {
  const sources = latestData.sources || {};
  const dates = Object.values(sources)
    .map((source) => source.date)
    .filter(Boolean);

  if (dates.length === 0) return "--";

  const newest = dates.reduce((a, b) => a > b ? a : b);
  const oldest = dates.reduce((a, b) => a < b ? a : b);
  return oldest === newest ? newest : oldest + " 〜 " + newest;
}

export function getSourceRows(latestData) {
  const sources = latestData.sources || {};
  return AUTO_FIELD_IDS.map((id) => {
    const field = FIELDS.find((item) => item.id === id);
    const source = sources[id] || {};
    return {
      id,
      name: field ? field.name : id,
      series: source.series || "--",
      source: source.source || "FRED",
      date: source.time ? source.date + " " + source.time : source.date || "--"
    };
  });
}

export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return year + "/" + month + "/" + day + " " + hour + ":" + minute;
}

function valuesAreSame(a, b) {
  return FIELDS.every((field) => {
    const left = normalizeNullableNumber(a[field.id]);
    const right = normalizeNullableNumber(b[field.id]);
    if (left === null && right === null) return true;
    if (left === null || right === null) return false;
    return left === right;
  });
}

function getDataAgeDays(updatedAt) {
  if (!updatedAt) return null;
  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return null;
  return Math.floor((Date.now() - updated) / 86400000);
}

function getSourceDataAgeDays(latestData) {
  const dates = Object.values(latestData.sources || {})
    .map((source) => source.date)
    .filter(Boolean)
    .sort();

  if (dates.length === 0) return getDataAgeDays(latestData.updated_at);
  return getDataAgeDays(dates[dates.length - 1] + "T00:00:00Z");
}

function getStaleSourceRows(latestData, thresholdDays) {
  return getSourceRows(latestData).filter((row) => {
    if (!row.date || row.date === "--") return false;
    const age = getDataAgeDays(row.date + "T00:00:00Z");
    return age !== null && age >= thresholdDays;
  });
}
