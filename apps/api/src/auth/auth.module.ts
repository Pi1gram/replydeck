import { Module } from "@nestjs/common";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { AuthController } from "./auth.controller";

@Module({
  imports: [MicrosoftModule],
  controllers: [AuthController]
})
export class AuthModule {}
