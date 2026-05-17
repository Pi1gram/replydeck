export type RiskLevel = "low" | "medium" | "high";

export type EmailCardStatus =
  | "pending"
  | "sent"
  | "rejected"
  | "later"
  | "edited";

export type EmailCard = {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  receivedAt: string;
  summary: string;
  senderIntent: string;
  contextUsed: string[];
  draftReply: string;
  confidenceScore: number;
  riskLevel: RiskLevel;
  riskReason: string;
  status: EmailCardStatus;
};

export type CardAction =
  | "send"
  | "edit"
  | "reject"
  | "regenerate"
  | "later";
