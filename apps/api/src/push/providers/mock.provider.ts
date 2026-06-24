import { Injectable, Logger } from "@nestjs/common";
import type {
  PushDeliveryProvider,
  PushPayload
} from "../push-delivery.types";

/**
 * Deterministic no-network provider. Used:
 *   - in unit + e2e tests (no APNs / FCM keys required),
 *   - in dev when `PUSH_DRIVER=mock` (default),
 *   - as the fallback any time a real driver isn't configured.
 *
 * Logs the payload at debug level and reports success. The point is to
 * keep the upstream send pipeline (token lookup, fan-out, audit logging)
 * fully exercised so swapping in a real driver is a one-line change.
 */
@Injectable()
export class MockPushProvider implements PushDeliveryProvider {
  readonly name = "mock";
  private readonly logger = new Logger(MockPushProvider.name);

  async send(
    token: string,
    payload: PushPayload
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.debug(
      `[mock-push] token=${redactToken(token)} cardId=${payload.cardId} ` +
        `category=${payload.category ?? "NEW_CARD"} title=${JSON.stringify(
          payload.title
        )}`
    );
    return { success: true };
  }
}

function redactToken(token: string): string {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
