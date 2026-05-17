import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, limit?: number) {
    const safeLimit = Math.min(
      Math.max(1, Number.isFinite(limit) ? Number(limit) : DEFAULT_LIMIT),
      MAX_LIMIT
    );
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: safeLimit
    });
  }
}
