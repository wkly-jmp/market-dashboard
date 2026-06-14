import { analyzeMarket } from "./scoring.js";
import { buildGuardrails } from "./guardrails.js";

let latest = null;

initGuardrailView();

async function initGuardrailView() {
  try {
    latest = await fetch("data/latest.json?guardrails=" + Date.now()).then((response) => response.json());
    render();
    document.addEventListener("input", render);
  } catch {
    renderGuardrails(null);
  }
}

function render() {
  if (!latest) return;
  const values = { ...(latest.values || {}) };
  document.querySelectorAll("[id^='override-']").forEach((input) => {
    const key = input.id.replace("override-", "");
    if (input.value !== "" && Number.isFinite(Number(input.value))) {
      values[key] = Number(input.value);
    }
  });

  const analysis = analyzeMarket(values, null, {
    derived: latest.derived || {},
    scores: latest.scores || {},
    regime: latest.regime || null
  });
  renderGuardrails(buildGuardrails(
    analysis.axes,
    values,
    analysis.derived,
    analysis.scores,
    analysis.regime
  ));
}

function renderGuardrails(guardrails) {
  const card = document.getElementById("guardrailCard");
  if (!card) return;
  const main = document.getElementById("guardrailMain");
  const confidence = document.getElementById("guardrailConfidence");
  const add = document.getElementById("guardrailAdd");
  const trim = document.getElementById("guardrailTrim");
  const reasons = document.getElementById("guardrailReasons");
  const warnings = document.getElementById("guardrailWarnings");

  if (!guardrails) {
    card.dataset.tone = "unknown";
    main.textContent = "未判定";
    confidence.textContent = "信頼度 --";
    add.textContent = "未判定";
    trim.textContent = "未判定";
    reasons.innerHTML = "<li>ガードレールを判定できませんでした。</li>";
    warnings.innerHTML = "";
    return;
  }

  const addLabels = { blocked: "避ける", cautious: "小さく打診まで", normal: "通常ペース可" };
  const trimLabels = {
    avoid: "大幅縮小は避ける",
    cautious: "小さく慎重に",
    allowed: "通常判断",
    defensive_priority: "防御優先"
  };
  const confidenceLabels = { high: "高", medium: "中", low: "低" };

  main.textContent = guardrails.mainLabel;
  confidence.textContent = "信頼度 " + confidenceLabels[guardrails.confidence];
  add.textContent = addLabels[guardrails.addPermission];
  trim.textContent = trimLabels[guardrails.trimPermission];
  reasons.innerHTML = guardrails.reasons.map((text) => "<li>" + escapeHtml(text) + "</li>").join("");
  warnings.innerHTML = guardrails.warnings.map((text) => "<p>" + escapeHtml(text) + "</p>").join("");

  card.dataset.tone =
    guardrails.trimPermission === "defensive_priority" || guardrails.addPermission === "blocked"
      ? "danger"
      : guardrails.trimPermission === "avoid"
        ? "avoid"
        : guardrails.addPermission === "cautious" || guardrails.trimPermission === "cautious"
          ? "cautious"
          : "normal";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
