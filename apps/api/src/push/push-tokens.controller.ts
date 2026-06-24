import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post
} from "@nestjs/common";
import { PushPlatform } from "@prisma/client";
import {
  CurrentUser,
  CurrentUserPayload
} from "../common/current-user.decorator";
import { RegisterPushTokenDto } from "./dto/register-push-token.dto";
import {
  PushTokensService,
  WirePushTokenFull,
  WirePushTokenPublic
} from "./push-tokens.service";

@Controller("me/push-tokens")
export class PushTokensController {
  constructor(private readonly service: PushTokensService) {}

  @Post()
  @HttpCode(201)
  register(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RegisterPushTokenDto
  ): Promise<WirePushTokenFull> {
    return this.service.upsertToken(
      user.id,
      dto.platform as PushPlatform,
      dto.token
    );
  }

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<WirePushTokenPublic[]> {
    return this.service.listForUser(user.id);
  }

  @Delete(":id")
  @HttpCode(204)
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string
  ): Promise<void> {
    await this.service.deleteToken(user.id, id);
  }
}
