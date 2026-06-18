import { Transform } from "class-transformer";
import {
  ArrayNotContains,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString
} from "class-validator";
import { LOWERCASE_TONE, LowercaseTone } from "./upsert-tone-profile.dto";

export class CreateSenderProfileDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value
  )
  @IsEmail()
  senderEmail!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value
  )
  @IsString()
  senderDomain?: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsString()
  formality?: string;

  @IsOptional()
  @IsString()
  usualReplyLength?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value
  )
  @IsEnum(LOWERCASE_TONE)
  preferredTone?: LowercaseTone;

  @IsOptional()
  @IsBoolean()
  pinAlwaysReview?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSendAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSendDenied?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayNotContains([null, undefined])
  notes?: string[];
}

export class UpdateSenderProfileDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value
  )
  @IsString()
  senderDomain?: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsString()
  formality?: string;

  @IsOptional()
  @IsString()
  usualReplyLength?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value
  )
  @IsEnum(LOWERCASE_TONE)
  preferredTone?: LowercaseTone;

  @IsOptional()
  @IsBoolean()
  pinAlwaysReview?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSendAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSendDenied?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayNotContains([null, undefined])
  notes?: string[];
}
