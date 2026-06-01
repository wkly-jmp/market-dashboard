import {
  calculateDeltas,
  calculateScore,
  decideDrive,
  detectCorrections,
  FIELDS,
  judgeMomentum
} from "./scoring.js";
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
  scoreValue: document.getElementById("scoreValue"),
  marketLabel: document.getElementById("marketLabel"),
  compareAge: document.getElementById("compareAge"),
  gauge: document.getElementById("gauge"),
  lampBlue: document.getElementById("lampBlue"),
  lampYellow: document.getElementById("lampYellow"),
  lampRed: document.getElementById("lampRed"),
  signalText: document.getElementById("signalText"),
  speedValue: document.getElementById("speedValue"),
  directionText: document.getElementById("directionText"),
  momentumStatus: document.getElementById("momentumStatus"),
  momentumDetail: document.getElementById("momentumDetail"),
  actionTitle: document.getElementById("actionTitle"),
  actionDetail: document.getElementById("actionDetail"),
  badgeArea: document.getElementById("badgeArea"),
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
let currentScore = null;

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
  const memoText = elements.memo.value || "";
  const calculated = calculateScore(built.values);
  const previousSnapshot = getComparisonSnapshot(built.values);
  const deltas = calculateDeltas(built.values, previousSnapshot);
  const momentum = judgeMomentum(built.values, previousSnapshot, deltas);
  const corrections = detectCorrections(built.values, memoText);
  const drive = decideDrive(calculated.score, corrections, momentum);

  currentValues = built.values;
  currentScore = calculated.score;

  renderDataStatus(latestData);
  renderWarnings(latestData, built.inputWarnings);
  renderMain(calculated.score, drive, momentum);
  renderBadges(corrections);
  renderCards(calculated.cards, deltas);
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

function renderMain(score, drive, momentum) {
  elements.scoreValue.textContent = score === null ? "--" : score;
  elements.marketLabel.textContent = drive.label;
  elements.gauge.style.setProperty("--needle", score === null ? "50%" : clamp(score, 0, 100) + "%");
  elements.signalText.textContent = signalLabel(drive.signal);
  elements.speedValue.textContent = drive.speed;
  elements.directionText.textContent = drive.direction;
  elements.actionTitle.textContent = drive.title;
  elements.actionDetail.textContent = drive.detail;
  elements.momentumStatus.textContent = momentum.label;
  elements.momentumDetail.textContent = momentum.detail;

  if (momentum.previousAgeDays === null) {
    elements.compareAge.textContent = "前回比較：比較なし";
  } else {
    elements.compareAge.textContent = "前回比較：" + momentum.previousAgeDays + "日前の履歴を使用" + (momentum.previousAt ? "（" + momentum.previousAt + "）" : "");
  }

  [elements.lampBlue, elements.lampYellow, elements.lampRed].forEach((lamp) => {
    lamp.classList.remove("active");
  });

  if (drive.signal === "blue") elements.lampBlue.classList.add("active");
  if (drive.signal === "yellow") elements.lampYellow.classList.add("active");
  if (drive.signal === "red") elements.lampRed.classList.add("active");
  if (drive.signal === "blue-yellow") {
    elements.lampBlue.classList.add("active");
    elements.lampYellow.classList.add("active");
  }
  if (drive.signal === "yellow-red") {
    elements.lampYellow.classList.add("active");
    elements.lampRed.classList.add("active");
  }
}

function renderBadges(corrections) {
  const badges = [];
  if (corrections.crisis) badges.push({ text: "危機警戒", className: "crisis" });
  if (corrections.overheat) badges.push({ text: "過熱警戒", className: "overheat" });
  if (corrections.rate) badges.push({ text: "金利警戒", className: "rate" });
  if (corrections.fx) badges.push({ text: "為替警戒", className: "fx" });

  elements.badgeArea.innerHTML = badges.map((badge) => {
    return '<span class="badge ' + badge.className + '">' + badge.text + "</span>";
  }).join("");
}

function renderCards(cards, deltas) {
  const visibleCards = cards.filter((card) => card.source === "auto" || card.score !== null);

  elements.indicatorCards.innerHTML = visibleCards.map((card) => {
    const width = card.score === null ? 0 : card.score;
    const delta = deltas[card.id] || { text: "比較なし", tone: "none" };
    const deltaClass = delta.tone === "good" ? "good" : delta.tone === "bad" ? "bad" : "";
    return [
      '<article class="indicator-card">',
      '<div class="indicator-head">',
      '<h3 class="indicator-name">' + escapeHtml(card.name) + "</h3>",
      '<span class="indicator-value">' + escapeHtml(card.value) + "</span>",
      "</div>",
      '<div class="delta ' + deltaClass + '">' + escapeHtml(delta.text) + "</div>",
      '<span class="tag ' + card.tone + '">' + escapeHtml(card.label) + "</span>",
      "<p>" + escapeHtml(card.comment) + "</p>",
      '<div class="contribution" title="スコア寄与"><span style="--w: ' + width + '%;"></span></div>',
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
    const previous = saveSnapshot(currentValues, currentScore, latestData, elements.memo.value || "");
    render();
    if (!previous) {
      elements.compareAge.textContent = "前回比較：今回が初回保存";
    }
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

function signalLabel(signal) {
  const labels = {
    blue: "青：分割で拡大候補",
    yellow: "黄：維持・様子見",
    red: "赤：新規抑制・縮小候補",
    "blue-yellow": "青〜黄：小さく拡大候補",
    "yellow-red": "黄〜赤：慎重・縮小候補"
  };
  return labels[signal] || "未判定";
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
