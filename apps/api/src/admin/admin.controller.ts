import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../common/public.decorator";
import { AdminTokenGuard } from "./admin-token.guard";
import { AdminService } from "./admin.service";
import { DASHBOARD_HTML } from "./admin-dashboard";
import { CreateAdminUserDto } from "./dto/create-admin-user.dto";

/**
 * Admin telemetry surface. @Public() bypasses the dev-user guard (admin calls
 * carry no x-user-id); AdminTokenGuard enforces the ADMIN_TOKEN secret instead.
 */
@Controller("admin")
@Public()
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get()
  dashboard(@Res() res: Response): void {
    res.type("html").send(DASHBOARD_HTML);
  }

  @Get("overview")
  overview() {
    return this.service.overview();
  }

  @Post("users")
  @HttpCode(201)
  createUser(@Body() dto: CreateAdminUserDto) {
    return this.service.createUser(dto);
  }
}
