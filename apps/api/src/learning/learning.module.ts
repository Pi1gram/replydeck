import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma.module";
import { EmbeddingsModule } from "../knowledge/embeddings/embeddings.module";
import { LearningService } from "./learning.service";

@Module({
  imports: [PrismaModule, EmbeddingsModule],
  providers: [LearningService],
  exports: [LearningService]
})
export class LearningModule {}
