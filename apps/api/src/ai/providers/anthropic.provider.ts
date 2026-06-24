import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger
} from "@nestjs/common";
import type { AiDraftInput, AiDraftResult } from "../ai.types";
import type { CategoryAssessment } from "../classifier/category-classifier";
import type { RiskAssessment } from "../classifier/risk-heuristics";
import {
  buildEmailContextMessage,
  buildToneSystemBlock,
  resolveToneProfile
} from "../prompts/build-user-prompt";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "../prompts/system-prompt";
import { aiDraftJsonSchema } from "./anthropic-schema";
import type { AiProvider } from "./ai-provider.interface";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_EFFORT: "low" | "medium" | "high" = "medium";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

/**
 * Real Anthropic provider. Wires Claude Sonnet 4.6 with:
 *   - Prompt caching on the system prompt and the per-user tone block
 *     (two layers — see PROMPT_VERSION in system-prompt.ts).
 *   - Structured JSON output via `output_config.format` (Sonnet 4.6 does
 *     not accept assistant-turn prefills — would 400).
 *   - Adaptive thinking + medium effort by default.
 *   - SDK auto-retry (3) and a 30s request timeout.
 *
 * The calling AiService still enforces the heuristic risk + category
 * floor — providers can return any value; AiService snaps them back if
 * the model tries to soften them.
 */
@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly effort: "low" | "medium" | "high";

  constructor(opts: AnthropicProviderOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      maxRetries: MAX_RETRIES,
      timeout: REQUEST_TIMEOUT_MS
    });
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.effort = opts.effort ?? DEFAULT_EFFORT;
    this.logger.log(
      `AnthropicProvider ready (model=${this.model}, effort=${this.effort}, prompt=${PROMPT_VERSION})`
    );
  }

  async generate(args: {
    input: AiDraftInput;
    pre: { risk: RiskAssessment; category: CategoryAssessment };
  }): Promise<AiDraftResult> {
    const { input, pre } = args;
    const { profile, toneApplied } = resolveToneProfile(input);
    const toneBlock = buildToneSystemBlock({ toneApplied, tone: profile });
    const userMessage = buildEmailContextMessage({
      input,
      risk: pre.risk,
      category: pre.category
    });

    let response;
    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: this.maxTokens,
        thinking: { type: "adaptive" },
        output_config: {
          effort: this.effort,
          format: zodOutputFormat(aiDraftJsonSchema)
        },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" }
          },
          {
            type: "text",
            text: toneBlock,
            cache_control: { type: "ephemeral" }
          }
        ],
        messages: [{ role: "user", content: userMessage }]
      });
    } catch (err) {
      throw this.translateError(err);
    }

    if (response.usage) {
      this.logger.log(
        `tokens in=${response.usage.input_tokens} ` +
          `cache_read=${response.usage.cache_read_input_tokens ?? 0} ` +
          `cache_write=${response.usage.cache_creation_input_tokens ?? 0} ` +
          `out=${response.usage.output_tokens}`
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      this.logger.error(
        `Sonnet 4.6 returned no parseable JSON (stop_reason=${response.stop_reason}).`
      );
      throw new InternalServerErrorException(
        "AI draft did not match the expected JSON shape."
      );
    }

    return {
      summary: parsed.summary,
      senderIntent: parsed.senderIntent,
      contextUsed: parsed.contextUsed.slice(0, 4),
      draftReply: parsed.draftReply,
      confidenceScore: clampScore(parsed.confidenceScore),
      riskLevel: parsed.riskLevel,
      riskReason: parsed.riskReason,
      category: parsed.category,
      toneApplied: parsed.toneApplied
    };
  }

  /**
   * Convert SDK exceptions into framework exceptions the controllers can
   * surface cleanly. The SDK already retried 429/5xx automatically, so by
   * the time we get here the error is one we shouldn't retry on.
   */
  private translateError(err: unknown): Error {
    if (err instanceof Anthropic.AuthenticationError) {
      this.logger.error("Anthropic auth failed — check ANTHROPIC_API_KEY.");
      return new InternalServerErrorException(
        "AI provider is misconfigured (auth)."
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      this.logger.warn("Anthropic rate-limited after retries.");
      return new InternalServerErrorException(
        "AI provider is rate-limited. Try again shortly."
      );
    }
    if (err instanceof Anthropic.BadRequestError) {
      this.logger.error(`Anthropic 400: ${err.message}`);
      if (/credit balance is too low/i.test(err.message)) {
        // 402 Payment Required maps semantically; the caller can detect this
        // and prompt the operator to top up credits at console.anthropic.com.
        return new HttpException(
          "Anthropic credit balance is too low. Top up at console.anthropic.com/settings/billing and retry.",
          HttpStatus.PAYMENT_REQUIRED
        );
      }
      return new InternalServerErrorException(
        "AI provider rejected the request."
      );
    }
    if (err instanceof Anthropic.APIError) {
      this.logger.error(
        `Anthropic ${err.status ?? "unknown"}: ${err.message}`
      );
      return new InternalServerErrorException("AI provider failed.");
    }
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`Anthropic unknown error: ${message}`);
    return new InternalServerErrorException("AI provider failed.");
  }
}

function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}
