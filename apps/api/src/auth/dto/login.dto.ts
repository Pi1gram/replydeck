import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
