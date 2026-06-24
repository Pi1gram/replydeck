import { Module } from "@nestjs/common";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";

@Module({
  imports: [MicrosoftModule, UsersModule],
  controllers: [AuthController]
})
export class AuthModule {}
