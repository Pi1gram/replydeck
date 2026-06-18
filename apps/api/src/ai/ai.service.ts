import {
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { RiskLevel } from "@replydeck/shared";
import type { AiDraftInput, AiDraftResult } from "./ai.types";
import { classifyCategory } from "./classifier/category-classifier";
import { assessRisk } from "./classifier/risk-heuristics";
import { PROMPT_VERSION } from "./prompts/system-prompt";
import { AiProvider } from "./providers/ai-provider.interface";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { MockProvider } from "./providers/mock.provider";

export const AI_PROVIDER_TOKEN = "AI_PROVIDER";

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly provider: AiProvider,
    private readonly config: ConfigService
  ) {
    this.logger.log(
      `AiService initialised with provider=${provider.name}, prompt=${PROMPT_VERSION}`
    );
    void this.config;
  }

  /**
   * Generate a draft for an email card. Risk + category are computed
   * heuristically first; the provider can refine them upward but never
   * downward.
   */
  async generateDraft(input: AiDraftInput): Promise<AiDraftResult> {
    const risk = assessRisk(input);
    const category = classifyCategory(input, risk);

    let result: AiDraftResult;
    try {
      result = await this.provider.generate({
        input,
        pre: { risk, category }
      });
    } catch (err) {
      this.logger.error(
        `Provider ${this.provider.name} failed: ${(err as Error).message}`
      );
      // Preserve HTTP status from the provider (e.g. 402 credit balance,
      // 401 auth) so the mobile app can show an actionable error rather
      // than a generic 500.
      if (err instanceof HttpException) {
        throw err;
      }
      throw new InternalServerErrorException("Draft generation failed.");
    }

    // Floor: never let the provider downgrade risk below the heuristic.
    if (RISK_RANK[result.riskLevel] < RISK_RANK[risk.riskLevel]) {
      this.logger.warn(
        `Provider tried to downgrade risk ${risk.riskLevel} → ${result.riskLevel}; snapping back.`
      );
      result = {
        ...result,
        riskLevel: risk.riskLevel,
        riskReason: risk.riskReason
      };
    }

    // Category A is never auto-sendable. If the provider returned C/B on
    // a heuristic-A email, snap back to A.
    if (category.category === "A" && result.category !== "A") {
      this.logger.warn(
        `Provider tried to widen category A → ${result.category}; snapping back.`
      );
      result = { ...result, category: "A" };
    }

    return result;
  }
}

/**
 * Factory selected by `AI_PROVIDER` env var:
 *   AI_PROVIDER=mock        → MockProvider (default; deterministic)
 *   AI_PROVIDER=anthropic   → AnthropicProvider (requires ANTHROPIC_API_KEY)
 *
 * Optional Anthropic overrides:
 *   ANTHROPIC_MODEL=claude-sonnet-4-6    (default — see anthropic.provider.ts)
 *   ANTHROPIC_MAX_TOKENS=1024            (default)
 *   ANTHROPIC_EFFORT=low|medium|high     (default medium)
 *
 * If anthropic is selected but the key is missing, falls back to mock so
 * dev/test environments don't break just because nobody's exported a key.
 */
export function aiProviderFactory(
  config: ConfigService,
  mock: MockProvider
): AiProvider {
  const selected = (config.get<string>("AI_PROVIDER") ?? "mock").toLowerCase();
  if (selected !== "anthropic") {
    return mock;
  }
  const apiKey = config.get<string>("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return mock;
  }
  const maxTokensRaw = config.get<string>("ANTHROPIC_MAX_TOKENS");
  const effortRaw = (
    config.get<string>("ANTHROPIC_EFFORT") ?? "medium"
  ).toLowerCase();
  const effort: "low" | "medium" | "high" =
    effortRaw === "low" || effortRaw === "high" ? effortRaw : "medium";
  return new AnthropicProvider({
    apiKey,
    model: config.get<string>("ANTHROPIC_MODEL"),
    maxTokens: maxTokensRaw ? parseInt(maxTokensRaw, 10) : undefined,
    effort
  });
}
