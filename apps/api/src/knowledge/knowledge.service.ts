import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import {
  MemoryScope,
  MemorySourceType,
  SensitivityLevel,
  ToneId
} from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { MicrosoftService, SentMessage } from "../microsoft/microsoft.service";
import { EmbeddingService } from "./embeddings/embedding.service";
import {
  extractRecipientSignals,
  extractStyleFeatures,
  FormalityLabel,
  RecipientSignal,
  SentEmailSample,
  StyleFeatures
} from "./stylometry";

// Don't create an unbounded number of SenderProfiles from one learning pass.
// Cap to the user's most-frequent correspondents.
const MAX_RECIPIENTS_LEARNED = 50;
const MAX_GREETINGS = 5;
const MAX_SIGNOFFS = 5;
// Marker prefix on tone styleNotes that THIS feature owns, so repeated passes
// replace rather than accumulate them.
const LEARNED_NOTE_PREFIX = "(learned) ";
const CONTENT_MAX = 400;

const FORMALITY_TO_TONE: Record<FormalityLabel, ToneId> = {
  formal: ToneId.FORMAL,
  business: ToneId.BUSINESS,
  friends: ToneId.FRIENDS
};

export interface LearnResult {
  learned: boolean;
  reason?: string;
  sampleSize: number;
  recipientsLearned: number;
  style?: StyleFeatures;
}

export interface KnowledgeStatus {
  consent: boolean;
  consentAt: string | null;
  lastLearnedAt: string | null;
  learnedSampleSize: number;
  senderProfilesLearned: number;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly microsoft: MicrosoftService,
    private readonly embeddings: EmbeddingService
  ) {}

  async setConsent(userId: string, granted: boolean): Promise<KnowledgeStatus> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          sentMailLearningConsent: granted,
          sentMailLearningConsentAt: granted ? new Date() : null
        }
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: granted
            ? "knowledge.consent.granted"
            : "knowledge.consent.revoked"
        }
      });
    });
    return this.getStatus(userId);
  }

  async getStatus(userId: string): Promise<KnowledgeStatus> {
    const [user, tone, senderCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.toneProfile.findUnique({ where: { userId } }),
      this.prisma.senderProfile.count({
        where: { userId, learnedFromSentAt: { not: null } }
      })
    ]);

    return {
      consent: user?.sentMailLearningConsent ?? false,
      consentAt: user?.sentMailLearningConsentAt?.toISOString() ?? null,
      lastLearnedAt: user?.sentMailLearnedAt?.toISOString() ?? null,
      learnedSampleSize: tone?.learnedSampleSize ?? 0,
      senderProfilesLearned: senderCount
    };
  }

  /**
   * Pull the user's recent sent mail, derive abstracted style + relationship
   * signals, and persist them into ToneProfile / SenderProfile / MemoryItem.
   * Gated on the user's consent. Stores no raw email content.
   */
  async learnFromSentMail(userId: string, top = 100): Promise<LearnResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.sentMailLearningConsent) {
      throw new ForbiddenException(
        "Sent-mail learning requires consent. POST /knowledge/consent { granted: true } first."
      );
    }

    const sent = await this.microsoft.getSentMessages(userId, top);
    if (sent.length === 0) {
      return {
        learned: false,
        reason: "No sent messages found.",
        sampleSize: 0,
        recipientsLearned: 0
      };
    }

    const samples = sent.map(toSample);
    const style = extractStyleFeatures(samples);
    const recipients = extractRecipientSignals(samples).slice(
      0,
      MAX_RECIPIENTS_LEARNED
    );

    const now = new Date();
    await this.persistToneProfile(userId, style, now);
    await this.persistSenderProfiles(userId, recipients, now);
    await this.persistTopicMemory(userId, style, recipients);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { sentMailLearnedAt: now }
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "knowledge.learned_from_sent",
          metadata: {
            sampleSize: style.sampleSize,
            recipientsLearned: recipients.length,
            formality: style.formality
          }
        }
      });
    });

    this.logger.log(
      `Learned voice for ${userId}: ${style.sampleSize} samples, ` +
        `${recipients.length} correspondents, formality=${style.formality}`
    );

    return {
      learned: true,
      sampleSize: style.sampleSize,
      recipientsLearned: recipients.length,
      style
    };
  }

  /**
   * Merge learned voice into the tone profile. Preserves the user's explicit
   * choices: greetings/sign-offs are UNIONed (not replaced), averageReplyLength
   * is only filled when unset, and defaultTone is never overwritten by
   * learning. Provenance fields always update.
   */
  private async persistToneProfile(
    userId: string,
    style: StyleFeatures,
    now: Date
  ): Promise<void> {
    const existing = await this.prisma.toneProfile.findUnique({
      where: { userId }
    });

    const greetings = unionCapped(
      existing?.preferredGreetings ?? [],
      style.preferredGreetings,
      MAX_GREETINGS
    );
    const signOffs = unionCapped(
      existing?.preferredSignOffs ?? [],
      style.preferredSignOffs,
      MAX_SIGNOFFS
    );
    const styleNotes = [
      ...(existing?.styleNotes ?? []).filter(
        (n) => !n.startsWith(LEARNED_NOTE_PREFIX)
      ),
      `${LEARNED_NOTE_PREFIX}Tends to write ${style.formality} replies, ${style.averageReplyLength}.`
    ];
    const averageReplyLength =
      existing?.averageReplyLength && existing.averageReplyLength.length > 0
        ? existing.averageReplyLength
        : style.averageReplyLength;

    await this.prisma.toneProfile.upsert({
      where: { userId },
      create: {
        user: { connect: { id: userId } },
        preferredGreetings: greetings,
        preferredSignOffs: signOffs,
        styleNotes,
        averageReplyLength,
        learnedFromSentAt: now,
        learnedSampleSize: style.sampleSize
      },
      update: {
        preferredGreetings: greetings,
        preferredSignOffs: signOffs,
        styleNotes,
        averageReplyLength,
        learnedFromSentAt: now,
        learnedSampleSize: style.sampleSize
      }
    });
  }

  /**
   * Upsert per-correspondent profiles. Sets relationship counts/recency and
   * provenance every pass; fills formality/usualReplyLength/preferredTone only
   * when the user hasn't set them; never touches pin/auto-send flags.
   */
  private async persistSenderProfiles(
    userId: string,
    recipients: RecipientSignal[],
    now: Date
  ): Promise<void> {
    for (const r of recipients) {
      const existing = await this.prisma.senderProfile.findUnique({
        where: { userId_senderEmail: { userId, senderEmail: r.email } }
      });

      await this.prisma.senderProfile.upsert({
        where: { userId_senderEmail: { userId, senderEmail: r.email } },
        create: {
          userId,
          senderEmail: r.email,
          senderDomain: r.domain,
          formality: r.formality,
          usualReplyLength: r.usualReplyLength,
          preferredTone: FORMALITY_TO_TONE[r.formality],
          messageCount: r.messageCount,
          lastContactedAt: new Date(r.lastContactedAt),
          learnedFromSentAt: now
        },
        update: {
          senderDomain: existing?.senderDomain ?? r.domain,
          // Preserve explicit user edits; only fill blanks from learning.
          formality: existing?.formality ?? r.formality,
          usualReplyLength: existing?.usualReplyLength ?? r.usualReplyLength,
          preferredTone:
            existing?.preferredTone ?? FORMALITY_TO_TONE[r.formality],
          messageCount: r.messageCount,
          lastContactedAt: new Date(r.lastContactedAt),
          learnedFromSentAt: now
        }
      });
    }
  }

  /**
   * Write a small, idempotent set of abstracted topic/voice memory items the
   * draft pipeline can retrieve. Clears the prior learned set first so repeated
   * passes don't accumulate. All content is aggregate facts — no raw bodies.
   */
  private async persistTopicMemory(
    userId: string,
    style: StyleFeatures,
    recipients: RecipientSignal[]
  ): Promise<void> {
    const facts: string[] = [];
    const greeting = style.preferredGreetings[0];
    const signOff = style.preferredSignOffs[0];
    facts.push(
      truncate(
        `User writes ${style.formality} emails, typically ${style.averageReplyLength}` +
          `${greeting ? `, usually opening with "${greeting}"` : ""}` +
          `${signOff ? ` and signing off with "${signOff}"` : ""}.`,
        CONTENT_MAX
      )
    );

    for (const domain of topDomains(recipients, 3)) {
      facts.push(
        truncate(
          `User frequently corresponds with people at ${domain.domain} (${domain.count} recent messages).`,
          CONTENT_MAX
        )
      );
    }

    // Best-effort embeddings for semantic retrieval; degrade to recency if the
    // provider fails (never block a learning pass on it).
    let vectors: number[][] = [];
    let embeddingModel: string | null = null;
    try {
      vectors = await this.embeddings.embedBatch(facts);
      embeddingModel = this.embeddings.model;
    } catch (err) {
      this.logger.warn(
        `Topic-memory embedding failed; storing without vectors: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.memoryItem.deleteMany({
        where: {
          userId,
          scope: MemoryScope.USER,
          sourceType: MemorySourceType.SENT_EMAIL
        }
      });
      for (let i = 0; i < facts.length; i += 1) {
        await tx.memoryItem.create({
          data: {
            userId,
            scope: MemoryScope.USER,
            sourceType: MemorySourceType.SENT_EMAIL,
            sensitivity: SensitivityLevel.LOW,
            content: facts[i],
            embedding: vectors[i] ?? [],
            embeddingModel: vectors[i] ? embeddingModel : null
          }
        });
      }
    });
  }
}

function toSample(m: SentMessage): SentEmailSample {
  return {
    bodyPreview: m.bodyPreview,
    subject: m.subject,
    recipients: m.recipients,
    sentAt: m.sentAt
  };
}

function unionCapped(
  existing: string[],
  learned: string[],
  cap: number
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of [...existing, ...learned]) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

function topDomains(
  recipients: RecipientSignal[],
  limit: number
): Array<{ domain: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of recipients) {
    if (!r.domain) continue;
    counts.set(r.domain, (counts.get(r.domain) ?? 0) + r.messageCount);
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count }));
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  if (limit <= 1) return "…";
  return `${value.slice(0, limit - 1)}…`;
}
