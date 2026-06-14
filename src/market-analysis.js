import { analyzeMarket as analyzeBaseMarket } from "./scoring.js";
import { buildGuardrails } from "./guardrails.js";

export { buildGuardrails };

export function analyzeMarket(values, previousSnapshot, context = {}) {
  const analysis = analyzeBaseMarket(values, previousSnapshot, context);
  return {
    ...analysis,
    guardrails: analysis.guardrails || buildGuardrails(
      analysis.axes,
      values,
      analysis.derived,
      analysis.scores,
      analysis.regime
    )
  };
}
