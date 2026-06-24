import { Transform } from "class-transformer";
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";

export const PUSH_PLATFORM = ["IOS", "ANDROID"] as const;
export type PushPlatformValue = (typeof PUSH_PLATFORM)[number];

export class RegisterPushTokenDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.toUpperCase() : value
  )
  @IsEnum(PUSH_PLATFORM)
  platform!: PushPlatformValue;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  token!: string;
}
