import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma.module";
import { LearningService } from "./learning.service";

@Module({
  imports: [PrismaModule],
  providers: [LearningService],
  exports: [LearningService]
})
export class LearningModule {}
