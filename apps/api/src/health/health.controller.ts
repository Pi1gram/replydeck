import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/public.decorator";

@Controller()
export class HealthController {
  @Public()
  @Get("health")
  check() {
    return { status: "ok", uptime: process.uptime() };
  }
}
