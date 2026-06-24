import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { timingSafeEqual } from "crypto";

/**
 * Gate for the admin telemetry surface. Requires an `x-admin-token` header or
 * `?token=` query param equal to the ADMIN_TOKEN env secret. Fails closed: if
 * ADMIN_TOKEN is unset, the admin surface is unavailable rather than open.
 *
 * Used alongside @Public() so the global dev-user guard is bypassed (admin
 * requests carry no x-user-id) but access is still authenticated by token.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected || expected.trim().length === 0) {
      throw new ServiceUnavailableException(
        "Admin dashboard is not configured (ADMIN_TOKEN unset)."
      );
    }

    const req = context.switchToHttp().getRequest();
    const headerToken = req.headers["x-admin-token"];
    const queryToken = req.query?.token;
    const raw = headerToken ?? queryToken;
    const provided = Array.isArray(raw) ? raw[0] : raw;

    if (typeof provided !== "string" || !safeEqual(provided, expected)) {
      throw new UnauthorizedException("Invalid admin token.");
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
