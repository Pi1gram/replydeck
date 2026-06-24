import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  Prisma,
  SenderProfile as PrismaSenderProfile,
  ToneId,
  ToneProfile as PrismaToneProfile
} from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import {
  LowercaseTone,
  UpsertToneProfileDto
} from "./dto/upsert-tone-profile.dto";
import {
  CreateSenderProfileDto,
  UpdateSenderProfileDto
} from "./dto/upsert-sender-profile.dto";

const TONE_TO_PRISMA: Record<LowercaseTone, ToneId> = {
  formal: ToneId.FORMAL,
  business: ToneId.BUSINESS,
  friends: ToneId.FRIENDS
};

export interface WireToneProfile {
  id: string;
  defaultTone: LowercaseTone;
  averageReplyLength: string | null;
  preferredGreetings: string[];
  preferredSignOffs: string[];
  avoidPhrases: string[];
  styleNotes: string[];
  autoSendEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WireSenderProfile {
  id: string;
  senderEmail: string;
  senderDomain: string | null;
  relationship: string | null;
  formality: string | null;
  usualReplyLength: string | null;
  preferredTone: LowercaseTone | null;
  pinAlwaysReview: boolean;
  autoSendAllowed: boolean;
  autoSendDenied: boolean;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

function toWireToneProfile(row: PrismaToneProfile): WireToneProfile {
  return {
    id: row.id,
    defaultTone: row.defaultTone.toLowerCase() as LowercaseTone,
    averageReplyLength: row.averageReplyLength,
    preferredGreetings: row.preferredGreetings,
    preferredSignOffs: row.preferredSignOffs,
    avoidPhrases: row.avoidPhrases,
    styleNotes: row.styleNotes,
    autoSendEnabled: row.autoSendEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toWireSenderProfile(row: PrismaSenderProfile): WireSenderProfile {
  return {
    id: row.id,
    senderEmail: row.senderEmail,
    senderDomain: row.senderDomain,
    relationship: row.relationship,
    formality: row.formality,
    usualReplyLength: row.usualReplyLength,
    preferredTone: row.preferredTone
      ? (row.preferredTone.toLowerCase() as LowercaseTone)
      : null,
    pinAlwaysReview: row.pinAlwaysReview,
    autoSendAllowed: row.autoSendAllowed,
    autoSendDenied: row.autoSendDenied,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function deriveDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/**
 * `autoSendAllowed` and `autoSendDenied` are a mutually-exclusive override
 * pair. Both true is nonsense — the sender is simultaneously allow-listed
 * and deny-listed — so reject the request at the API boundary rather than
 * silently letting `decideAutoSend` resolve it.
 */
function assertAutoSendNotBothTrue(
  allowed: boolean | undefined,
  denied: boolean | undefined
): void {
  if (allowed === true && denied === true) {
    throw new BadRequestException(
      "autoSendAllowed and autoSendDenied cannot both be true"
    );
  }
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getToneProfile(userId: string): Promise<WireToneProfile> {
    const row = await this.prisma.toneProfile.findUnique({
      where: { userId }
    });
    if (!row) {
      throw new NotFoundException("Tone profile not set");
    }
    return toWireToneProfile(row);
  }

  async upsertToneProfile(
    userId: string,
    dto: UpsertToneProfileDto
  ): Promise<WireToneProfile> {
    const updateData: Prisma.ToneProfileUpdateInput = {};
    if (dto.defaultTone !== undefined) {
      updateData.defaultTone = TONE_TO_PRISMA[dto.defaultTone];
    }
    if (dto.averageReplyLength !== undefined) {
      updateData.averageReplyLength = dto.averageReplyLength;
    }
    if (dto.preferredGreetings !== undefined) {
      updateData.preferredGreetings = dto.preferredGreetings;
    }
    if (dto.preferredSignOffs !== undefined) {
      updateData.preferredSignOffs = dto.preferredSignOffs;
    }
    if (dto.avoidPhrases !== undefined) {
      updateData.avoidPhrases = dto.avoidPhrases;
    }
    if (dto.styleNotes !== undefined) {
      updateData.styleNotes = dto.styleNotes;
    }
    if (dto.autoSendEnabled !== undefined) {
      updateData.autoSendEnabled = dto.autoSendEnabled;
    }

    const createData: Prisma.ToneProfileCreateInput = {
      user: { connect: { id: userId } },
      ...(dto.defaultTone !== undefined
        ? { defaultTone: TONE_TO_PRISMA[dto.defaultTone] }
        : {}),
      ...(dto.averageReplyLength !== undefined
        ? { averageReplyLength: dto.averageReplyLength }
        : {}),
      ...(dto.preferredGreetings !== undefined
        ? { preferredGreetings: dto.preferredGreetings }
        : {}),
      ...(dto.preferredSignOffs !== undefined
        ? { preferredSignOffs: dto.preferredSignOffs }
        : {}),
      ...(dto.avoidPhrases !== undefined
        ? { avoidPhrases: dto.avoidPhrases }
        : {}),
      ...(dto.styleNotes !== undefined ? { styleNotes: dto.styleNotes } : {}),
      ...(dto.autoSendEnabled !== undefined
        ? { autoSendEnabled: dto.autoSendEnabled }
        : {})
    };

    const [row] = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.toneProfile.upsert({
        where: { userId },
        create: createData,
        update: updateData
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "settings.tone_profile.updated",
          metadata: {
            fields: Object.keys(dto)
          }
        }
      });
      return [upserted];
    });

    return toWireToneProfile(row);
  }

  async listSenderProfiles(
    userId: string,
    domain?: string
  ): Promise<WireSenderProfile[]> {
    const where: Prisma.SenderProfileWhereInput = { userId };
    if (domain && domain.trim().length > 0) {
      where.senderDomain = domain.trim().toLowerCase();
    }
    const rows = await this.prisma.senderProfile.findMany({
      where,
      orderBy: { updatedAt: "desc" }
    });
    return rows.map(toWireSenderProfile);
  }

  async getSenderProfile(
    userId: string,
    email: string
  ): Promise<WireSenderProfile> {
    const senderEmail = decodeURIComponent(email).toLowerCase();
    const row = await this.prisma.senderProfile.findUnique({
      where: {
        userId_senderEmail: { userId, senderEmail }
      }
    });
    if (!row || row.userId !== userId) {
      throw new NotFoundException(
        `Sender profile for ${senderEmail} not found`
      );
    }
    return toWireSenderProfile(row);
  }

  async createSenderProfile(
    userId: string,
    dto: CreateSenderProfileDto
  ): Promise<WireSenderProfile> {
    assertAutoSendNotBothTrue(dto.autoSendAllowed, dto.autoSendDenied);
    const senderEmail = dto.senderEmail.toLowerCase();
    const senderDomain =
      dto.senderDomain && dto.senderDomain.trim().length > 0
        ? dto.senderDomain.trim().toLowerCase()
        : deriveDomain(senderEmail);

    const existing = await this.prisma.senderProfile.findUnique({
      where: { userId_senderEmail: { userId, senderEmail } }
    });
    if (existing) {
      throw new ConflictException(
        `Sender profile for ${senderEmail} already exists`
      );
    }

    const [row] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.senderProfile.create({
        data: {
          userId,
          senderEmail,
          senderDomain,
          relationship: dto.relationship,
          formality: dto.formality,
          usualReplyLength: dto.usualReplyLength,
          preferredTone: dto.preferredTone
            ? TONE_TO_PRISMA[dto.preferredTone]
            : undefined,
          pinAlwaysReview: dto.pinAlwaysReview ?? false,
          autoSendAllowed: dto.autoSendAllowed ?? false,
          autoSendDenied: dto.autoSendDenied ?? false,
          notes: dto.notes ?? []
        }
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "settings.sender_profile.created",
          metadata: { senderEmail, senderDomain }
        }
      });
      return [created];
    });

    return toWireSenderProfile(row);
  }

  async updateSenderProfile(
    userId: string,
    email: string,
    dto: UpdateSenderProfileDto
  ): Promise<WireSenderProfile> {
    const senderEmail = decodeURIComponent(email).toLowerCase();
    const existing = await this.prisma.senderProfile.findUnique({
      where: { userId_senderEmail: { userId, senderEmail } }
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException(
        `Sender profile for ${senderEmail} not found`
      );
    }

    // Resolve the post-update state for the two mutually-exclusive flags
    // (using the existing row when the DTO doesn't override). Throw before
    // touching the DB so a half-applied patch can't slip through.
    const nextAutoSendAllowed =
      dto.autoSendAllowed !== undefined
        ? dto.autoSendAllowed
        : existing.autoSendAllowed;
    const nextAutoSendDenied =
      dto.autoSendDenied !== undefined
        ? dto.autoSendDenied
        : existing.autoSendDenied;
    assertAutoSendNotBothTrue(nextAutoSendAllowed, nextAutoSendDenied);

    const updateData: Prisma.SenderProfileUpdateInput = {};
    if (dto.senderDomain !== undefined) {
      updateData.senderDomain = dto.senderDomain;
    }
    if (dto.relationship !== undefined) {
      updateData.relationship = dto.relationship;
    }
    if (dto.formality !== undefined) {
      updateData.formality = dto.formality;
    }
    if (dto.usualReplyLength !== undefined) {
      updateData.usualReplyLength = dto.usualReplyLength;
    }
    if (dto.preferredTone !== undefined) {
      updateData.preferredTone = TONE_TO_PRISMA[dto.preferredTone];
    }
    if (dto.pinAlwaysReview !== undefined) {
      updateData.pinAlwaysReview = dto.pinAlwaysReview;
    }
    if (dto.autoSendAllowed !== undefined) {
      updateData.autoSendAllowed = dto.autoSendAllowed;
    }
    if (dto.autoSendDenied !== undefined) {
      updateData.autoSendDenied = dto.autoSendDenied;
    }
    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }

    const [row] = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.senderProfile.update({
        where: { userId_senderEmail: { userId, senderEmail } },
        data: updateData
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "settings.sender_profile.updated",
          metadata: {
            senderEmail,
            fields: Object.keys(dto)
          }
        }
      });
      return [updated];
    });

    return toWireSenderProfile(row);
  }

  async deleteSenderProfile(userId: string, email: string): Promise<void> {
    const senderEmail = decodeURIComponent(email).toLowerCase();
    const existing = await this.prisma.senderProfile.findUnique({
      where: { userId_senderEmail: { userId, senderEmail } }
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException(
        `Sender profile for ${senderEmail} not found`
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.senderProfile.delete({
        where: { userId_senderEmail: { userId, senderEmail } }
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "settings.sender_profile.deleted",
          metadata: { senderEmail }
        }
      });
    });
  }
}
