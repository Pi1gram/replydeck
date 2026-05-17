import {
  Body,
  Controller,
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
import { EmailCardsService } from "./email-cards.service";
import { CreateEmailCardDto } from "./dto/create-email-card.dto";
import { UpdateReplyDto } from "./dto/update-reply.dto";

@Controller("email-cards")
export class EmailCardsController {
  constructor(private readonly service: EmailCardsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query("status") status?: string
  ) {
    return this.service.list(user.id, status);
  }

  @Get(":id")
  findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string
  ) {
    return this.service.findOne(user.id, id);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateEmailCardDto
  ) {
    return this.service.create(user.id, dto);
  }

  @Post(":id/approve")
  @HttpCode(200)
  approve(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string
  ) {
    return this.service.approve(user.id, id);
  }

  @Post(":id/reject")
  @HttpCode(200)
  reject(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string
  ) {
    return this.service.reject(user.id, id);
  }

  @Post(":id/later")
  @HttpCode(200)
  later(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string
  ) {
    return this.service.later(user.id, id);
  }

  @Post(":id/regenerate")
  @HttpCode(200)
  regenerate(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string
  ) {
    return this.service.regenerate(user.id, id);
  }

  @Patch(":id/reply")
  updateReply(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: UpdateReplyDto
  ) {
    return this.service.updateReply(user.id, id, dto);
  }
}
