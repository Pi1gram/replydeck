import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { missingScopes } from "../microsoft/scope-utils";
import { CreateAdminUserDto } from "./dto/create-admin-user.dto";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  outlook: {
    connected: boolean;
    email: string | null;
    needsReconnect: boolean;
    missingScopes: string[];
  };
  learning: {
    consent: boolean;
    lastLearnedAt: string | null;
    learnedSampleSize: number;
    senderProfiles: number;
    memoryItems: number;
  };
  autoSendEnabled: boolean;
  cards: { total: number; pending: number; sent: number };
  autoSent: number;
}

export interface AdminOverview {
  generatedAt: string;
  totals: {
    users: number;
    connected: number;
    needReconnect: number;
    cards: number;
    sent: number;
    autoSent: number;
  };
  users: AdminUserRow[];
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(
    dto: CreateAdminUserDto
  ): Promise<{ id: string; email: string; name: string | null }> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.upsert({
      where: { email },
      update: dto.name ? { name: dto.name } : {},
      create: { email, name: dto.name ?? null }
    });
    return { id: user.id, email: user.email, name: user.name };
  }

  async overview(): Promise<AdminOverview> {
    const [
      users,
      cardGroups,
      feedbackGroups,
      memoryGroups,
      senderGroups
    ] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        include: { connectedAccounts: true, toneProfile: true }
      }),
      this.prisma.emailCard.groupBy({
        by: ["userId", "status"],
        _count: { _all: true }
      }),
      this.prisma.feedbackEvent.groupBy({
        by: ["userId", "action"],
        _count: { _all: true }
      }),
      this.prisma.memoryItem.groupBy({
        by: ["userId"],
        _count: { _all: true }
      }),
      this.prisma.senderProfile.groupBy({
        by: ["userId"],
        _count: { _all: true }
      })
    ]);

    const memoryByUser = countMap(memoryGroups);
    const senderByUser = countMap(senderGroups);

    const cardsByUser = new Map<string, { total: number; pending: number; sent: number }>();
    for (const g of cardGroups) {
      const row = cardsByUser.get(g.userId) ?? { total: 0, pending: 0, sent: 0 };
      const n = g._count._all;
      row.total += n;
      if (g.status === "PENDING") row.pending += n;
      if (g.status === "SENT") row.sent += n;
      cardsByUser.set(g.userId, row);
    }

    const autoSentByUser = new Map<string, number>();
    for (const g of feedbackGroups) {
      if (g.action === "AUTO_SENT") {
        autoSentByUser.set(
          g.userId,
          (autoSentByUser.get(g.userId) ?? 0) + g._count._all
        );
      }
    }

    const rows: AdminUserRow[] = users.map((u) => {
      const account = u.connectedAccounts[0] ?? null;
      const missing = account ? missingScopes(account.scopes) : [];
      const cards = cardsByUser.get(u.id) ?? { total: 0, pending: 0, sent: 0 };
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt.toISOString(),
        outlook: {
          connected: !!account,
          email: account?.email ?? null,
          needsReconnect: !!account && missing.length > 0,
          missingScopes: missing
        },
        learning: {
          consent: u.sentMailLearningConsent,
          lastLearnedAt: u.sentMailLearnedAt?.toISOString() ?? null,
          learnedSampleSize: u.toneProfile?.learnedSampleSize ?? 0,
          senderProfiles: senderByUser.get(u.id) ?? 0,
          memoryItems: memoryByUser.get(u.id) ?? 0
        },
        autoSendEnabled: u.toneProfile?.autoSendEnabled ?? false,
        cards,
        autoSent: autoSentByUser.get(u.id) ?? 0
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        users: rows.length,
        connected: rows.filter((r) => r.outlook.connected).length,
        needReconnect: rows.filter((r) => r.outlook.needsReconnect).length,
        cards: rows.reduce((s, r) => s + r.cards.total, 0),
        sent: rows.reduce((s, r) => s + r.cards.sent, 0),
        autoSent: rows.reduce((s, r) => s + r.autoSent, 0)
      },
      users: rows
    };
  }
}

function countMap(
  groups: Array<{ userId: string; _count: { _all: number } }>
): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of groups) m.set(g.userId, g._count._all);
  return m;
}
