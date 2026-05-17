import { Transform } from "class-transformer";
import {
  ArrayNotContains,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsString,
  Max,
  Min,
  MinLength
} from "class-validator";

const LOWERCASE_RISK = ["low", "medium", "high"] as const;
type LowercaseRisk = (typeof LOWERCASE_RISK)[number];

export class CreateEmailCardDto {
  @IsString()
  @MinLength(1)
  fromName!: string;

  @IsEmail()
  fromEmail!: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsDateString()
  receivedAt!: string;

  @IsString()
  @MinLength(1)
  summary!: string;

  @IsString()
  @MinLength(1)
  senderIntent!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayNotContains([null, undefined])
  contextUsed!: string[];

  @IsString()
  @MinLength(1)
  draftReply!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  confidenceScore!: number;

  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value
  )
  @IsEnum(LOWERCASE_RISK)
  riskLevel!: LowercaseRisk;

  @IsString()
  @MinLength(1)
  riskReason!: string;
}
