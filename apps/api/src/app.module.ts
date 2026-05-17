import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./common/prisma.module";
import { CryptoModule } from "./common/crypto.module";
import { DevUserGuard } from "./common/dev-user.guard";
import { UsersModule } from "./users/users.module";
import { EmailCardsModule } from "./email-cards/email-cards.module";
import { FeedbackEventsModule } from "./feedback-events/feedback-events.module";
import { AuditLogsModule } from "./audit-logs/audit-logs.module";
import { MicrosoftModule } from "./microsoft/microsoft.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CryptoModule,
    UsersModule,
    EmailCardsModule,
    FeedbackEventsModule,
    AuditLogsModule,
    MicrosoftModule,
    AuthModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: DevUserGuard
    }
  ]
})
export class AppModule {}
