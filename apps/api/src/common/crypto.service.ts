import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

/**
 * Symmetric encryption for tokens at rest.
 *
 * Format on disk (base64): iv(12) || authTag(16) || ciphertext
 * Key source: TOKEN_ENCRYPTION_KEY env var, 64 hex chars (32 bytes).
 *
 * Generate a key with:  openssl rand -hex 32
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private key!: Buffer;

  onModuleInit(): void {
    const raw = process.env.TOKEN_ENCRYPTION_KEY;
    if (!raw || raw.trim().length === 0) {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32"
      );
    }
    const buf = Buffer.from(raw.trim(), "hex");
    if (buf.length !== KEY_LENGTH) {
      throw new Error(
        `TOKEN_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars). Got ${buf.length} bytes.`
      );
    }
    this.key = buf;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, "base64");
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error("Ciphertext too short");
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  }

  /** Constant-time string comparison for OAuth state values. */
  safeEquals(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }
}
