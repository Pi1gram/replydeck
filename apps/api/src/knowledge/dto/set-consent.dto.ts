import { IsBoolean } from "class-validator";

export class SetConsentDto {
  /**
   * Whether the user consents to ReplyDeck learning their writing voice from
   * their SENT mail. Granting enables future learning passes; revoking stops
   * them. Because only abstracted profiles are stored, revoking does not
   * require purging raw content (there is none).
   */
  @IsBoolean()
  granted!: boolean;
}
