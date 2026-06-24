import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

/**
 * Admin telemetry + tester provisioning. Token-gated (ADMIN_TOKEN);
 * see AdminTokenGuard.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
