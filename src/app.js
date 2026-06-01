import { analyzeMarket } from "./scoring.js";
import {
  buildValues,
  clearOverrides,
  collectOverridesFromForm,
  getComparisonSnapshot,
  getDataDateSummary,
  getDataWarnings,
  getSourceRows,
  hydrateOverrideForm,
  loadLatestData,
  loadOverrides,
  resetOverrideForm,
  saveOverrides,
  saveSnapshot
} from "./data-loader.js";

const elements = {
  refreshButton: document.getElementById("refreshButton"),
  statusText: document.getElementById("statusText"),
  updatedAt: document.getElementById("updatedAt"),
  dataDates: document.getElementById("dataDates"),
  warningArea: document.getElementById("warningArea"),
  regimeTitle: document.getElementById("regimeTitle"),
  regimeIcon: document.getElementById("regimeIcon"),
  weatherLabel: document.getElementById("weatherLabel"),
  modeLabel: document.getElementById("modeLabel"),
  regimeSubtitle: document.getElementById("regimeSubtitle"),
  primaryAction: document.getElementById("primaryAction"),
  actionDetail: document.getElementById("actionDetail"),
  compareAge: document.getElementById("compareAge"),
  heatValue: document.getElementById("heatValue"),
  stressValue: document.getElementById("stressValue"),
  recoveryValue: document.getElementById("recoveryValue"),
  heatBar: document.getElementById("heatBar"),
  stressBar: document.getElementById("stressBar"),
  recoveryBar: document.getElementById("recoveryBar"),
  expansionLevel: document.getElementById("expansionLevel"),
  trimLevel: document.getElementById("trimLevel"),
  hedgeLevel: document.getElementById("hedgeLevel"),
  expansionTile: document.getElementById("expansionTile"),
  trimTile: document.getElementById("trimTile"),
  hedgeTile: document.getElementById("hedgeTile"),
  stanceNeedle: document.getElementById("stanceNeedle"),
  regimeMatrix: document.getElementById("regimeMatrix"),
  spotlightCards: document.getElementById("spotlightCards"),
  indicatorCards: document.getElementById("indicatorCards"),
  sourceList: document.getElementById("sourceList"),
  summaryText: document.getElementById("summaryText"),
  saveButton: document.getElementById("saveButton"),
  recalcButton: document.getElementById("recalcButton"),
  resetButton: document.getElementById("resetButton"),
  alerts: document.getElementById("alerts"),
  memo: document.getElementById("memo")
};

let latestData = null;
let currentValues = {};
let currentAnalysis = null;

async function init() {
  hydrateOverrideForm(loadOverrides());
  await reloadData();
  bindEvents();
}

async function reloadData() {
  latestData = await loadLatestData();
  render();
}

function render() {
  const overrides = collectOverridesFromForm();
  saveOverrides(overrides);

  const built = buildValues(latestData, overrides);
  const previousSnapshot = getComparisonSnapshot(built.values);
  const analysis = analyzeMarket(built.values, previousSnapshot);

  currentValues = built.values;
  currentAnalysis = analysis;

  renderDataStatus(latestData);
  renderWarnings(latestData, built.inputWarnings);
  renderRegime(analysis);
  renderSpotlights(analysis.indicators);
  renderAxes(analysis.axes);
  renderActions(analysis.actions);
  renderMatrix(analysis);
  renderCards(analysis.indicators);
  renderSources(latestData);
  renderSummary(overrides);
}

function renderDataStatus(data) {
  const status = data.status || "unknown";
  elements.statusText.textContent = status === "ok" ? "取得成功" : "取得失敗または未取得";
  elements.updatedAt.textContent = "最終更新：" + (data.updated_at_jst || data.updated_at || "--");
  elements.dataDates.textContent = "データ日付：" + getDataDateSummary(data);
}

function renderWarnings(data, inputWarnings) {
  const dataWarnings = getDataWarnings(data).warnings;
  const warnings = [
    ...dataWarnings,
    ...inputWarnings.map((text) => ({ level: "warn", text }))
  ];

  elements.warningArea.innerHTML = warnings.map((warning) => {
    return '<span class="warning ' + warning.level + '">' + escapeHtml(warning.text) + "</span>";
  }).join("");

  if (inputWarnings.length === 0) {
    elements.alerts.classList.remove("show");
    elements.alerts.textContent = "";
  } else {
    elements.alerts.classList.add("show");
    elements.alerts.innerHTML = inputWarnings.map((warning) => "<div>" + escapeHtml(warning) + "</div>").join("");
  }
}

function renderRegime(analysis) {
  const { regime, actions, previous } = analysis;
  elements.regimeTitle.textContent = regime.title;
  elements.regimeIcon.textContent = regime.icon || "⚖️";
  elements.weatherLabel.textContent = regime.weather || "中立";
  elements.modeLabel.textContent = regime.mode || "維持";
  elements.regimeSubtitle.textContent = regime.subtitle;
  elements.primaryAction.textContent = actions.primary;
  elements.actionDetail.textContent = actions.stance;
  elements.compareAge.textContent = previous.text;
  document.body.dataset.regime = regime.tone;
  elements.stanceNeedle.style.setProperty("--stance", calculateStancePosition(analysis.axes) + "%");
}

function renderSpotlights(indicators) {
  const ids = ["fearGreed", "fearGreedChange", "usdjpy"];
  const selected = ids
    .map((id) => indicators.find((indicator) => indicator.id === id))
    .filter(Boolean);

  elements.spotlightCards.innerHTML = selected.map((card) => {
    const deltaClass = card.delta.tone === "good" ? "good" : card.delta.tone === "bad" ? "bad" : "";
    return [
      '<article class="spotlight-card ' + card.tone + '">',
      '<span class="spotlight-kicker">' + escapeHtml(card.name) + '</span>',
      '<div class="spotlight-value">' + escapeHtml(card.displayValue) + '</div>',
      '<div class="delta ' + deltaClass + '">' + escapeHtml(card.delta.text) + '</div>',
      '<p>' + escapeHtml(card.comment) + '</p>',
      '</article>'
    ].join("");
  }).join("");
}

function renderAxes(axes) {
  setAxis(elements.heatValue, elements.heatBar, axes.heat);
  setAxis(elements.stressValue, elements.stressBar, axes.stress);
  setAxis(elements.recoveryValue, elements.recoveryBar, axes.recovery);
}

function renderActions(actions) {
  setActionTile(elements.expansionTile, elements.expansionLevel, actions.expansion);
  setActionTile(elements.trimTile, elements.trimLevel, actions.trim);
  setActionTile(elements.hedgeTile, elements.hedgeLevel, actions.hedge);
}

function setActionTile(tile, label, level) {
  label.textContent = level;
  tile.dataset.level = level;
  tile.style.setProperty("--level", levelToPercent(level) + "%");
}

function levelToPercent(level) {
  if (level === "高") return 100;
  if (level === "中") return 62;
  if (level === "低") return 28;
  return 0;
}

function calculateStancePosition(axes) {
  const attack = axes.recovery * 0.55 + (100 - axes.stress) * 0.3 + (100 - axes.heat) * 0.15;
  return clamp(100 - attack, 4, 96);
}

function renderMatrix(analysis) {
  const { heat, stress, recovery } = analysis.axes;
  const x = clamp(heat, 0, 100);
  const y = clamp(100 - stress, 0, 100);
  const label = recovery >= 60 ? "回復強め" : recovery <= 35 ? "回復弱め" : "回復中立";

  elements.regimeMatrix.innerHTML = [
    '<div class="matrix">',
    '<span class="matrix-label top-left">低過熱 / 低ストレス</span>',
    '<span class="matrix-label top-right">高過熱 / 低ストレス</span>',
    '<span class="matrix-label bottom-left">低過熱 / 高ストレス</span>',
    '<span class="matrix-label bottom-right">高過熱 / 高ストレス</span>',
    '<span class="matrix-dot" style="left: ' + x + '%; top: ' + y + '%;">',
    '<span>' + escapeHtml(label) + '</span>',
    '</span>',
    '</div>'
  ].join("");
}

function renderCards(indicators) {
  const priority = [
    "fearGreed",
    "fearGreedChange",
    "vix",
    "vixChange",
    "spDeviation",
    "nasdaqDeviation",
    "creditSpread",
    "financialStress",
    "realYield",
    "yieldCurve",
    "us10y",
    "us10yChange",
    "usdjpy",
    "oilDeviation"
  ];
  const visibleCards = indicators
    .filter((card) => card.source === "auto" || card.value !== null)
    .sort((a, b) => {
      const ai = priority.includes(a.id) ? priority.indexOf(a.id) : 999;
      const bi = priority.includes(b.id) ? priority.indexOf(b.id) : 999;
      return ai - bi;
    });

  elements.indicatorCards.innerHTML = visibleCards.map((card) => {
    const deltaClass = card.delta.tone === "good" ? "good" : card.delta.tone === "bad" ? "bad" : "";
    return [
      '<article class="indicator-card">',
      '<div class="indicator-head">',
      '<h3 class="indicator-name">' + escapeHtml(card.name) + "</h3>",
      '<span class="indicator-value">' + escapeHtml(card.displayValue) + "</span>",
      "</div>",
      '<div class="delta ' + deltaClass + '">' + escapeHtml(card.delta.text) + "</div>",
      '<span class="tag ' + card.tone + '">' + escapeHtml(card.label) + "</span>",
      "<p>" + escapeHtml(card.comment) + "</p>",
      '<div class="mini-bars">',
      miniBar("過熱", card.heat),
      miniBar("ストレス", card.stress),
      miniBar("回復", card.recovery),
      "</div>",
      "</article>"
    ].join("");
  }).join("");
}

function renderSources(data) {
  elements.sourceList.innerHTML = getSourceRows(data).map((row) => {
    return [
      '<div class="source-item">',
      '<p><strong>' + escapeHtml(row.name) + "</strong></p>",
      "<p>" + escapeHtml(row.source) + " / " + escapeHtml(row.series) + " / " + escapeHtml(row.date) + "</p>",
      "</div>"
    ].join("");
  }).join("");
}

function renderSummary(overrides) {
  const filled = Object.keys(overrides).filter((key) => key !== "memo" && overrides[key] !== "").length;
  elements.summaryText.textContent = filled > 0
    ? "手動上書き・任意メモ（" + filled + "件）"
    : "手動上書き・任意メモ";
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", reloadData);
  elements.recalcButton.addEventListener("click", render);
  elements.saveButton.addEventListener("click", () => {
    const score = currentAnalysis ? Math.round((currentAnalysis.axes.heat + currentAnalysis.axes.stress + currentAnalysis.axes.recovery) / 3) : null;
    saveSnapshot(currentValues, score, latestData, elements.memo.value || "");
    render();
  });
  elements.resetButton.addEventListener("click", () => {
    if (!confirm("手動上書きと任意メモをリセットしますか？")) return;
    clearOverrides();
    resetOverrideForm();
    render();
  });

  document.querySelectorAll("input, textarea").forEach((element) => {
    element.addEventListener("input", render);
  });
}

function setAxis(valueElement, barElement, value) {
  valueElement.textContent = value;
  barElement.style.setProperty("--value", clamp(value, 0, 100) + "%");
}

function miniBar(label, value) {
  if (value === null || value === undefined) return "";
  return [
    '<div class="mini-bar">',
    '<span>' + label + '</span>',
    '<div><i style="width: ' + clamp(value, 0, 100) + '%;"></i></div>',
    '<b>' + Math.round(value) + '</b>',
    '</div>'
  ].join("");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

init();
