import { IsString, MinLength } from "class-validator";

export class UpdateReplyDto {
  @IsString()
  @MinLength(1)
  draftReply!: string;
}
