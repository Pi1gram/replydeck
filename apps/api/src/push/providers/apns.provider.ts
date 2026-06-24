import { Injectable, Logger } from "@nestjs/common";
import type {
  PushDeliveryProvider,
  PushPayload
} from "../push-delivery.types";

export type ApnsConfig = {
  keyPath?: string;
  keyId?: string;
  teamId?: string;
  bundleId?: string;
};

/**
 * APNs provider — stub until Phase 6 native build.
 *
 * Real impl plan: use `@parse/node-apn` with token-based auth (.p8 key +
 * key id + team id). Bundle id is the topic. We do NOT ship the .p8 in
 * the repo; `APNS_KEY_PATH` points at a file mounted into the container.
 *
 * Wave 1 pilot runs against `PUSH_DRIVER=mock`, so this throwing stub is
 * safe — devices won't register a real APNs token until the Phase 6
 * native build is in TestFlight.
 */
@Injectable()
export class ApnsProvider implements PushDeliveryProvider {
  readonly name = "apns";
  private readonly logger = new Logger(ApnsProvider.name);

  constructor(private readonly config: ApnsConfig) {
    this.logger.log(
      `ApnsProvider constructed (bundleId=${config.bundleId ?? "unset"}, ` +
        `keyId=${config.keyId ? "set" : "unset"}, ` +
        `teamId=${config.teamId ? "set" : "unset"}, ` +
        `keyPath=${config.keyPath ? "set" : "unset"})`
    );
  }

  async send(
    _token: string,
    _payload: PushPayload
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error(
      "APNs provider not yet implemented — set PUSH_DRIVER=mock or wait for Phase 6 native build"
    );
  }
}
