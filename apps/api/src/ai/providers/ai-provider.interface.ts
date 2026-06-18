import type { AiDraftInput, AiDraftResult } from "../ai.types";
import type { CategoryAssessment } from "../classifier/category-classifier";
import type { RiskAssessment } from "../classifier/risk-heuristics";

/**
 * Provider interface — `AiService` orchestrates risk + category classification
 * and then delegates the actual draft generation to a provider implementation.
 *
 * Providers MUST NOT downgrade riskLevel below `pre.risk.riskLevel`. If they
 * try, the service will snap the value back up to the heuristic floor.
 */
export interface AiProvider {
  readonly name: string;
  generate(args: {
    input: AiDraftInput;
    pre: { risk: RiskAssessment; category: CategoryAssessment };
  }): Promise<AiDraftResult>;
}
