-- Phase 7 — learn the user's voice from their SENT mail (abstracted profiles,
-- consent-gated). No raw email content is persisted by this feature; only
-- derived style features, relationship counts, and distilled topic memory.

-- Consent + provenance on the user.
ALTER TABLE "User"
  ADD COLUMN "sentMailLearningConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sentMailLearningConsentAt" TIMESTAMP(3),
  ADD COLUMN "sentMailLearnedAt" TIMESTAMP(3);

-- Provenance of learned voice on the tone profile.
ALTER TABLE "ToneProfile"
  ADD COLUMN "learnedFromSentAt" TIMESTAMP(3),
  ADD COLUMN "learnedSampleSize" INTEGER NOT NULL DEFAULT 0;

-- Relationship signals on the per-correspondent profile.
ALTER TABLE "SenderProfile"
  ADD COLUMN "messageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastContactedAt" TIMESTAMP(3),
  ADD COLUMN "learnedFromSentAt" TIMESTAMP(3);
