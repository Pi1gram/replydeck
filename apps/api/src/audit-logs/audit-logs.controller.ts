import { Controller, Get, Query } from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload
} from "../common/current-user.decorator";
import { AuditLogsService } from "./audit-logs.service";

@Controller("audit-logs")
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query("limit") limit?: string
  ) {
    const parsed = limit ? Number.parseInt(limit, 10) : undefined;
    return this.service.list(
      user.id,
      Number.isFinite(parsed) ? parsed : undefined
    );
  }
}
