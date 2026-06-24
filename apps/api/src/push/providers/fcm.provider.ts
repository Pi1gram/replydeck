import { Injectable, Logger } from "@nestjs/common";
import type {
  PushDeliveryProvider,
  PushPayload
} from "../push-delivery.types";

export type FcmConfig = {
  /**
   * Path to the GCP service account JSON used to authenticate against
   * the FCM HTTP v1 API. Typically resolved from
   * `GOOGLE_APPLICATION_CREDENTIALS`.
   */
  credentialsPath?: string;
};

/**
 * FCM provider — stub until Phase 6 native build.
 *
 * Real impl plan: use `firebase-admin` initialized with the service
 * account JSON, then `getMessaging().send({ token, notification, data })`.
 *
 * Wave 1 pilot runs against `PUSH_DRIVER=mock`, so this throwing stub is
 * safe — no Android device will register a real FCM token until the
 * Phase 6 native build is in the Play Store internal track.
 */
@Injectable()
export class FcmProvider implements PushDeliveryProvider {
  readonly name = "fcm";
  private readonly logger = new Logger(FcmProvider.name);

  constructor(private readonly config: FcmConfig) {
    this.logger.log(
      `FcmProvider constructed (credentialsPath=${
        config.credentialsPath ? "set" : "unset"
      })`
    );
  }

  async send(
    _token: string,
    _payload: PushPayload
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error(
      "FCM provider not yet implemented — set PUSH_DRIVER=mock or wait for Phase 6 native build"
    );
  }
}
