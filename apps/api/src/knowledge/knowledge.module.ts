import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma.module";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";

/**
 * Phase 7 — per-client knowledge base. Learns the user's writing voice,
 * relationships, and topics from their SENT mail into abstracted profiles.
 * See docs/KNOWLEDGE_BASE_RESEARCH.md for the architecture and roadmap.
 */
@Module({
  imports: [PrismaModule, MicrosoftModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService]
})
export class KnowledgeModule {}
