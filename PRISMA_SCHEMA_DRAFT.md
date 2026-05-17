# Prisma Schema Draft – ReplyDeck

Use this as the starting database design.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum EmailProvider {
  OUTLOOK
  GMAIL
}

enum EmailCardStatus {
  PENDING
  SENT
  REJECTED
  LATER
  EDITED
}

enum RiskLevel {
  LOW
  MEDIUM
  HIGH
}

enum FeedbackAction {
  APPROVED
  EDITED
  REJECTED
  REGENERATED
  SAVED_LATER
}

enum MemoryScope {
  USER
  SENDER
  THREAD
  COMPANY
}

enum MemorySourceType {
  APPROVED_REPLY
  EDITED_REPLY
  REJECTED_REPLY
  SENT_EMAIL
  THREAD_SUMMARY
  SENDER_PROFILE
}

enum SensitivityLevel {
  LOW
  MEDIUM
  HIGH
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  connectedAccounts ConnectedEmailAccount[]
  emailCards        EmailCard[]
  toneProfile       ToneProfile?
  senderProfiles    SenderProfile[]
  memoryItems       MemoryItem[]
  feedbackEvents    FeedbackEvent[]
  auditLogs         AuditLog[]
  subscription      Subscription?
  usageCounter      UsageCounter?
}

model ConnectedEmailAccount {
  id                    String        @id @default(cuid())
  userId                String
  provider              EmailProvider
  providerUserId        String?
  email                 String
  encryptedAccessToken  String
  encryptedRefreshToken String
  scopes                String[]
  expiresAt             DateTime?
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model EmailThread {
  id                 String   @id @default(cuid())
  userId             String
  providerThreadId   String
  subject            String?
  threadSummary      String?
  lastMessageAt      DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  messages EmailMessage[]
  cards    EmailCard[]

  @@index([userId])
  @@unique([userId, providerThreadId])
}

model EmailMessage {
  id                String   @id @default(cuid())
  userId            String
  threadId          String?
  providerMessageId String
  fromName          String?
  fromEmail         String
  subject           String?
  snippet           String?
  bodyPreview       String?
  receivedAt        DateTime?
  hasAttachments    Boolean  @default(false)
  createdAt         DateTime @default(now())

  thread EmailThread? @relation(fields: [threadId], references: [id])
  cards  EmailCard[]

  @@index([userId])
  @@unique([userId, providerMessageId])
}

model EmailCard {
  id                String          @id @default(cuid())
  userId            String
  messageId         String?
  threadId          String?
  fromName          String?
  fromEmail         String
  subject           String?
  summary           String
  senderIntent      String?
  contextUsed       Json?
  draftReply        String
  confidenceScore   Int
  riskLevel         RiskLevel
  riskReason        String?
  status            EmailCardStatus @default(PENDING)
  sentAt            DateTime?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  message EmailMessage? @relation(fields: [messageId], references: [id])
  thread  EmailThread?  @relation(fields: [threadId], references: [id])

  feedbackEvents FeedbackEvent[]
  auditLogs      AuditLog[]

  @@index([userId, status])
}

model ToneProfile {
  id                  String   @id @default(cuid())
  userId              String   @unique
  defaultTone         String?
  averageReplyLength  String?
  preferredGreetings  String[]
  preferredSignOffs   String[]
  avoidPhrases        String[]
  styleNotes          String[]
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model SenderProfile {
  id               String   @id @default(cuid())
  userId           String
  senderEmail      String
  senderName       String?
  relationship     String?
  formality        String?
  usualReplyLength String?
  preferredTone    String?
  notes            String[]
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, senderEmail])
}

model MemoryItem {
  id               String            @id @default(cuid())
  userId           String
  scope            MemoryScope
  sourceType       MemorySourceType
  sourceId         String?
  content          String
  embedding        Unsupported("vector")?
  sensitivityLevel SensitivityLevel  @default(LOW)
  createdAt        DateTime          @default(now())
  expiresAt        DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, scope])
}

model FeedbackEvent {
  id          String         @id @default(cuid())
  userId      String
  emailCardId String
  action      FeedbackAction
  beforeText  String?
  afterText   String?
  createdAt   DateTime       @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  emailCard EmailCard @relation(fields: [emailCardId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([emailCardId])
}

model AuditLog {
  id          String   @id @default(cuid())
  userId      String
  emailCardId String?
  action      String
  metadata    Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())

  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  emailCard EmailCard? @relation(fields: [emailCardId], references: [id])

  @@index([userId])
}

model Subscription {
  id                   String   @id @default(cuid())
  userId               String   @unique
  stripeCustomerId      String?
  stripeSubscriptionId  String?
  plan                 String   @default("FREE")
  status               String   @default("inactive")
  monthlyCardLimit      Int      @default(50)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model UsageCounter {
  id                 String   @id @default(cuid())
  userId             String   @unique
  cardsUsedThisMonth Int      @default(0)
  billingPeriodStart DateTime?
  billingPeriodEnd   DateTime?
  updatedAt          DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```
