import type { EmailCard } from "@replydeck/shared";

import { api } from "./client";

export const listCards = (status?: string) =>
  api.get<EmailCard[]>(`/email-cards${status ? `?status=${status}` : ""}`);

export const getCard = (id: string) => api.get<EmailCard>(`/email-cards/${id}`);

export const approveCard = (id: string) =>
  api.post<EmailCard>(`/email-cards/${id}/approve`);

export const rejectCard = (id: string) =>
  api.post<EmailCard>(`/email-cards/${id}/reject`);

export const laterCard = (id: string) =>
  api.post<EmailCard>(`/email-cards/${id}/later`);

export const regenerateCard = (id: string) =>
  api.post<EmailCard>(`/email-cards/${id}/regenerate`);

export const editReply = (id: string, draftReply: string) =>
  api.patch<EmailCard>(`/email-cards/${id}/reply`, { draftReply });
