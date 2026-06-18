import { Module } from "@nestjs/common";
import { PushDeliveryService } from "./push-delivery.service";
import { ApnsProvider } from "./providers/apns.provider";
import { FcmProvider } from "./providers/fcm.provider";
import { MockPushProvider } from "./providers/mock.provider";
import { PushTokensController } from "./push-tokens.controller";
import { PushTokensService } from "./push-tokens.service";

/**
 * Push delivery module.
 *
 * `PushDeliveryService` constructs concrete providers itself based on
 * `PUSH_DRIVER` so Nest doesn't have to choose between APNs/FCM/mock at
 * boot. We still register `MockPushProvider` (and stubs for APNs/FCM) as
 * Nest providers so tests can override them and so DI can wire them in
 * future if we move to per-provider injection.
 */
@Module({
  controllers: [PushTokensController],
  providers: [
    PushTokensService,
    PushDeliveryService,
    MockPushProvider,
    {
      provide: ApnsProvider,
      useFactory: () => new ApnsProvider({})
    },
    {
      provide: FcmProvider,
      useFactory: () => new FcmProvider({})
    }
  ],
  exports: [PushTokensService, PushDeliveryService]
})
export class PushModule {}
