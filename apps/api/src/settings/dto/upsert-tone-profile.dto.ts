import { Transform } from "class-transformer";
import {
  ArrayNotContains,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString
} from "class-validator";

export const LOWERCASE_TONE = ["formal", "business", "friends"] as const;
export type LowercaseTone = (typeof LOWERCASE_TONE)[number];

export class UpsertToneProfileDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value
  )
  @IsEnum(LOWERCASE_TONE)
  defaultTone?: LowercaseTone;

  @IsOptional()
  @IsString()
  averageReplyLength?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayNotContains([null, undefined])
  preferredGreetings?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayNotContains([null, undefined])
  preferredSignOffs?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayNotContains([null, undefined])
  avoidPhrases?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayNotContains([null, undefined])
  styleNotes?: string[];

  @IsOptional()
  @IsBoolean()
  autoSendEnabled?: boolean;
}
