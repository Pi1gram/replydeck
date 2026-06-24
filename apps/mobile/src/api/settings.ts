import { api } from "./client";

export type ToneId = "formal" | "business" | "friends";

export type ToneProfile = {
  defaultTone: ToneId;
  averageReplyLength: string | null;
  preferredGreetings: string[];
  preferredSignOffs: string[];
  avoidPhrases: string[];
  styleNotes: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type SenderProfile = {
  senderEmail: string;
  senderDomain: string | null;
  relationship: string | null;
  formality: string | null;
  usualReplyLength: string | null;
  preferredTone: ToneId | null;
  pinAlwaysReview: boolean;
  notes: string[];
};

export const getToneProfile = (): Promise<ToneProfile | null> =>
  api.getOrNull<ToneProfile>("/settings/tone-profile");

export const updateToneProfile = (
  patch: Partial<ToneProfile>
): Promise<ToneProfile> =>
  api.patch<ToneProfile>("/settings/tone-profile", patch);

export const listSenderProfiles = (
  domainFilter?: string
): Promise<SenderProfile[]> => {
  const qs = domainFilter
    ? `?domain=${encodeURIComponent(domainFilter)}`
    : "";
  return api.get<SenderProfile[]>(`/settings/sender-profiles${qs}`);
};

export const getSenderProfile = (
  email: string
): Promise<SenderProfile | null> =>
  api.getOrNull<SenderProfile>(
    `/settings/sender-profiles/${encodeURIComponent(email)}`
  );

export const createSenderProfile = (
  body: { senderEmail: string } & Partial<SenderProfile>
): Promise<SenderProfile> =>
  api.post<SenderProfile>("/settings/sender-profiles", body);

export const updateSenderProfile = (
  email: string,
  patch: Partial<SenderProfile>
): Promise<SenderProfile> =>
  api.patch<SenderProfile>(
    `/settings/sender-profiles/${encodeURIComponent(email)}`,
    patch
  );

export const deleteSenderProfile = (email: string): Promise<void> =>
  api.del(`/settings/sender-profiles/${encodeURIComponent(email)}`);
