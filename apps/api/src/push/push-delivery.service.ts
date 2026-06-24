import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PushPlatform } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { ApnsProvider } from "./providers/apns.provider";
import { ExpoPushProvider } from "./providers/expo.provider";
import { FcmProvider } from "./providers/fcm.provider";
import { MockPushProvider } from "./providers/mock.provider";
import type {
  PushDeliveryProvider,
  PushDriver,
  PushPayload
} from "./push-delivery.types";

export type PushSendSummary = {
  sent: number;
  failed: number;
  /**
   * Per-device send results. Useful for callers that want to surface
   * "device X is stale" (e.g. token retirement after repeated APNs
   * BadDeviceToken).
   */
  results: Array<{
    token: string;
    platform: PushPlatform;
    provider: string;
    success: boolean;
    error?: string;
  }>;
};

/**
 * Single dispatcher for push delivery. Picks a provider per device based
 * on `PushToken.platform` and the configured `PUSH_DRIVER`.
 *
 * Driver selection (read once at boot from env):
 *   PUSH_DRIVER=mock  → MockPushProvider for everything (default)
 *   PUSH_DRIVER=apns  → ApnsProvider for iOS;   Android tokens skipped
 *   PUSH_DRIVER=fcm   → FcmProvider for Android; iOS tokens skipped
 *   PUSH_DRIVER=expo  → reserved; throws on send (no impl yet)
 *
 * The "skip the wrong platform" behaviour for `apns`/`fcm` is deliberate:
 * once the real keys land we may still be missing one of the two. Better
 * to deliver to half the fleet than to fail-closed across the board.
 *
 * Audit log:
 *   - `push.delivered` on success per device
 *   - `push.failed`    on failure per device (with error reason)
 */
@Injectable()
export class PushDeliveryService {
  private readonly logger = new Logger(PushDeliveryService.name);
  private readonly driver: PushDriver;
  private readonly mock: MockPushProvider;
  private readonly apns?: ApnsProvider;
  private readonly fcm?: FcmProvider;
  private readonly expo?: ExpoPushProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    this.driver = normalizeDriver(this.config.get<string>("PUSH_DRIVER"));
    this.mock = new MockPushProvider();

    if (this.driver === "apns") {
      this.apns = new ApnsProvider({
        keyPath: this.config.get<string>("APNS_KEY_PATH"),
        keyId: this.config.get<string>("APNS_KEY_ID"),
        teamId: this.config.get<string>("APNS_TEAM_ID"),
        bundleId: this.config.get<string>("APNS_BUNDLE_ID")
      });
    }
    if (this.driver === "fcm") {
      this.fcm = new FcmProvider({
        credentialsPath: this.config.get<string>(
          "GOOGLE_APPLICATION_CREDENTIALS"
        )
      });
    }
    if (this.driver === "expo") {
      this.expo = new ExpoPushProvider();
    }

    this.logger.log(`PushDeliveryService initialised with driver=${this.driver}`);
  }

  /**
   * Fan-out to every push token on file for `userId`. Sends in parallel
   * and writes one audit row per device.
   *
   * Returns a summary even when the user has zero tokens registered (no
   * crash, no audit row) — that's the steady state for users who haven't
   * granted notification permission yet.
   */
  async sendToUser(
    userId: string,
    payload: PushPayload
  ): Promise<PushSendSummary> {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true, platform: true }
    });

    if (tokens.length === 0) {
      return { sent: 0, failed: 0, results: [] };
    }

    const settled = await Promise.all(
      tokens.map((t) =>
        this.deliverOne(userId, t.token, t.platform, payload).then((r) => ({
          token: t.token,
          platform: t.platform,
          ...r
        }))
      )
    );

    const sent = settled.filter((r) => r.success).length;
    const failed = settled.length - sent;
    return { sent, failed, results: settled };
  }

  /**
   * Single-device send. Looks up the token row to determine platform.
   * If the token isn't on file, falls back to "assume iOS" only when the
   * driver is mock — otherwise this is a misconfiguration and we fail
   * loudly so the caller doesn't silently no-op.
   */
  async sendToDevice(
    token: string,
    payload: PushPayload
  ): Promise<{ success: boolean; error?: string; provider: string }> {
    const row = await this.prisma.pushToken.findUnique({
      where: { token },
      select: { userId: true, platform: true }
    });

    if (!row) {
      this.logger.warn(
        `sendToDevice: token not in db; cannot determine platform or userId`
      );
      return {
        success: false,
        error: "Unknown push token",
        provider: "unknown"
      };
    }

    const result = await this.deliverOne(
      row.userId,
      token,
      row.platform,
      payload
    );
    return result;
  }

  /** Internal: pick provider, send, write audit. */
  private async deliverOne(
    userId: string,
    token: string,
    platform: PushPlatform,
    payload: PushPayload
  ): Promise<{ success: boolean; error?: string; provider: string }> {
    const provider = this.pickProvider(platform);

    if (!provider) {
      const error = `No provider for platform=${platform} under driver=${this.driver}`;
      this.logger.warn(`${error} (token=${redactToken(token)})`);
      await this.writeAudit(userId, payload, "push.failed", {
        provider: "none",
        platform,
        error
      });
      return { success: false, error, provider: "none" };
    }

    let result: { success: boolean; error?: string };
    try {
      result = await provider.send(token, payload);
    } catch (err) {
      const message = (err as Error).message ?? "Unknown error";
      this.logger.error(
        `Provider ${provider.name} threw while sending to ${platform}: ${message}`
      );
      await this.writeAudit(userId, payload, "push.failed", {
        provider: provider.name,
        platform,
        error: message
      });
      return { success: false, error: message, provider: provider.name };
    }

    if (result.success) {
      await this.writeAudit(userId, payload, "push.delivered", {
        provider: provider.name,
        platform
      });
    } else {
      await this.writeAudit(userId, payload, "push.failed", {
        provider: provider.name,
        platform,
        error: result.error ?? "unknown"
      });
    }
    return { ...result, provider: provider.name };
  }

  private pickProvider(
    platform: PushPlatform
  ): PushDeliveryProvider | undefined {
    switch (this.driver) {
      case "mock":
        return this.mock;
      case "apns":
        // iOS only; Android skipped on purpose until FCM is also wired.
        return platform === PushPlatform.IOS ? this.apns : undefined;
      case "fcm":
        // Android only; iOS skipped on purpose until APNs is also wired.
        return platform === PushPlatform.ANDROID ? this.fcm : undefined;
      case "expo":
        // Expo handles both iOS and Android routing via its push gateway;
        // a single provider instance covers all platforms.
        return this.expo;
      default:
        return this.mock;
    }
  }

  private async writeAudit(
    userId: string,
    payload: PushPayload,
    action: "push.delivered" | "push.failed",
    extra: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          emailCardId: payload.cardId || null,
          action,
          metadata: {
            cardId: payload.cardId,
            category: payload.category ?? "NEW_CARD",
            threadId: payload.threadId ?? null,
            ...extra
          }
        }
      });
    } catch (err) {
      // Audit failure must never break the send pipeline.
      this.logger.error(
        `Failed to write audit row ${action}: ${(err as Error).message}`
      );
    }
  }
}

function normalizeDriver(raw: string | undefined): PushDriver {
  const v = (raw ?? "mock").toLowerCase();
  if (v === "apns" || v === "fcm" || v === "expo" || v === "mock") {
    return v;
  }
  return "mock";
}

function redactToken(token: string): string {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
