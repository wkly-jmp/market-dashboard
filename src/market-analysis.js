import { analyzeMarket as analyzeBaseMarket } from "./scoring.js";
import { buildGuardrails } from "./guardrails.js";

export { buildGuardrails };

export function analyzeMarket(values, previousSnapshot, context = {}) {
  const analysis = analyzeBaseMarket(values, previousSnapshot, context);
  const guardrails = buildGuardrails(
    analysis.axes,
    values,
    analysis.derived,
    analysis.scores,
    analysis.regime,
    context.quality || null
  );
  return {
    ...analysis,
    actions: reconcileActionsWithGuardrails(analysis.actions, guardrails),
    guardrails
  };
}

function reconcileActionsWithGuardrails(actions, guardrails) {
  if (
    actions?.primary?.endsWith("縮小") &&
    ["hold_defense", "avoid"].includes(guardrails.trimPermission)
  ) {
    return {
      ...actions,
      primary: "維持",
      stance: guardrails.trimPermission === "hold_defense"
        ? "防御状態は維持するが、短期反発リスクがあるため追加縮小は行わない。"
        : "短期の売りすぎリスクが高いため、大幅縮小は避けて維持を優先。",
      trim: "低"
    };
  }
  if (actions?.primary?.endsWith("拡大") && guardrails.addPermission === "blocked") {
    return {
      ...actions,
      primary: "維持",
      stance: "買い増し禁止条件が優先されるため、短期の新規追加は見送る。",
      expansion: "低"
    };
  }
  if (actions?.primary?.endsWith("拡大") && guardrails.addPermission === "cautious") {
    return {
      ...actions,
      primary: "維持",
      stance: "買い増しは小さな打診まで。短期の主判定としては維持を優先。",
      expansion: "低"
    };
  }
  return actions;
}
