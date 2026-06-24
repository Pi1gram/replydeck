import { Injectable, NotFoundException } from "@nestjs/common";
import { PushPlatform, PushToken as PrismaPushToken } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";

export interface WirePushTokenFull {
  id: string;
  platform: PushPlatform;
  token: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface WirePushTokenPublic {
  id: string;
  platform: PushPlatform;
  createdAt: string;
  lastSeenAt: string;
}

function toWirePushTokenFull(row: PrismaPushToken): WirePushTokenFull {
  return {
    id: row.id,
    platform: row.platform,
    token: row.token,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString()
  };
}

function toWirePushTokenPublic(row: PrismaPushToken): WirePushTokenPublic {
  return {
    id: row.id,
    platform: row.platform,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString()
  };
}

@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertToken(
    userId: string,
    platform: PushPlatform,
    token: string
  ): Promise<WirePushTokenFull> {
    const now = new Date();

    const [row] = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.pushToken.upsert({
        where: { token },
        create: {
          userId,
          platform,
          token,
          lastSeenAt: now
        },
        update: {
          userId,
          platform,
          lastSeenAt: now
        }
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "push_token.registered",
          metadata: {
            pushTokenId: upserted.id,
            platform
          }
        }
      });
      return [upserted];
    });

    return toWirePushTokenFull(row);
  }

  async listForUser(userId: string): Promise<WirePushTokenPublic[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" }
    });
    return rows.map(toWirePushTokenPublic);
  }

  async deleteToken(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.pushToken.findUnique({
      where: { id }
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException(`Push token ${id} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pushToken.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId,
          action: "push_token.deleted",
          metadata: {
            pushTokenId: id,
            platform: existing.platform
          }
        }
      });
    });
  }
}
