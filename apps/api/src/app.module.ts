import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
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
import { AiModule } from "./ai/ai.module";
import { SettingsModule } from "./settings/settings.module";
import { LearningModule } from "./learning/learning.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { PushModule } from "./push/push.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      useFactory: () => {
        const url = process.env.REDIS_URL;
        if (!url) {
          // No Redis configured — provide a lazy-connect default so BullMQ
          // doesn't blow up at bootstrap. MicrosoftModule gates queue
          // registration on REDIS_URL, so nothing actually connects.
          return {
            connection: {
              host: "127.0.0.1",
              port: 6379,
              lazyConnect: true
            }
          };
        }
        const u = new URL(url);
        return {
          connection: {
            host: u.hostname,
            port: Number(u.port || 6379),
            username: u.username || undefined,
            password: u.password || undefined,
            db:
              u.pathname && u.pathname.length > 1
                ? Number(u.pathname.slice(1))
                : 0
          }
        };
      }
    }),
    PrismaModule,
    CryptoModule,
    UsersModule,
    EmailCardsModule,
    FeedbackEventsModule,
    AuditLogsModule,
    MicrosoftModule,
    AuthModule,
    AiModule,
    LearningModule,
    KnowledgeModule,
    PushModule,
    SettingsModule,
    HealthModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: DevUserGuard
    }
  ]
})
export class AppModule {}
