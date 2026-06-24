import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload
} from "../common/current-user.decorator";
import {
  CreateSenderProfileDto,
  UpdateSenderProfileDto
} from "./dto/upsert-sender-profile.dto";
import { UpsertToneProfileDto } from "./dto/upsert-tone-profile.dto";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  // ---------- Tone profile ----------

  @Get("tone-profile")
  getToneProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getToneProfile(user.id);
  }

  @Patch("tone-profile")
  upsertToneProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertToneProfileDto
  ) {
    return this.service.upsertToneProfile(user.id, dto);
  }

  // ---------- Sender profiles ----------

  @Get("sender-profiles")
  listSenderProfiles(
    @CurrentUser() user: CurrentUserPayload,
    @Query("domain") domain?: string
  ) {
    return this.service.listSenderProfiles(user.id, domain);
  }

  @Get("sender-profiles/:email")
  getSenderProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Param("email") email: string
  ) {
    return this.service.getSenderProfile(user.id, email);
  }

  @Post("sender-profiles")
  @HttpCode(201)
  createSenderProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateSenderProfileDto
  ) {
    return this.service.createSenderProfile(user.id, dto);
  }

  @Patch("sender-profiles/:email")
  updateSenderProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Param("email") email: string,
    @Body() dto: UpdateSenderProfileDto
  ) {
    return this.service.updateSenderProfile(user.id, email, dto);
  }

  @Delete("sender-profiles/:email")
  @HttpCode(204)
  async deleteSenderProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Param("email") email: string
  ): Promise<void> {
    await this.service.deleteSenderProfile(user.id, email);
  }
}
