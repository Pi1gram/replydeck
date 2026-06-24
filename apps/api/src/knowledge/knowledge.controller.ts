import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload
} from "../common/current-user.decorator";
import { SetConsentDto } from "./dto/set-consent.dto";
import { KnowledgeService } from "./knowledge.service";

@Controller("knowledge")
export class KnowledgeController {
  constructor(private readonly service: KnowledgeService) {}

  /**
   * Grant or revoke consent for learning the user's voice from their sent mail.
   * This is the onboarding clause toggle.
   */
  @Post("consent")
  @HttpCode(200)
  async setConsent(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SetConsentDto
  ) {
    return this.service.setConsent(user.id, dto.granted);
  }

  /** Current consent state + last-learned provenance. */
  @Get("status")
  status(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getStatus(user.id);
  }

  /**
   * Run a learning pass over the user's recent sent mail. Consent-gated
   * (returns 403 without consent). Idempotent — re-running refreshes the
   * derived profiles.
   */
  @Post("learn-from-sent")
  @HttpCode(200)
  async learn(
    @CurrentUser() user: CurrentUserPayload,
    @Query("top") topRaw?: string
  ) {
    const top = topRaw
      ? Math.max(1, Math.min(200, Number(topRaw) || 100))
      : 100;
    return this.service.learnFromSentMail(user.id, top);
  }
}
