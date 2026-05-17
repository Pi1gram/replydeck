import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  CurrentUser,
  CurrentUserPayload
} from "../common/current-user.decorator";
import { CryptoService } from "../common/crypto.service";
import { Public } from "../common/public.decorator";
import { MicrosoftConfig } from "../microsoft/microsoft.config";
import { MicrosoftService } from "../microsoft/microsoft.service";

const STATE_COOKIE = "replydeck_oauth_state";
const VERIFIER_COOKIE = "replydeck_oauth_verifier";
const COOKIE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

@Controller()
export class AuthController {
  constructor(
    private readonly microsoft: MicrosoftService,
    private readonly config: MicrosoftConfig,
    private readonly crypto: CryptoService
  ) {}

  @Get("auth/me")
  async me(@CurrentUser() user: CurrentUserPayload) {
    const account = await this.microsoft.getConnectedAccount(user.id);
    return {
      userId: user.id,
      outlook: account
        ? {
            connected: true,
            email: account.email,
            connectedAt: account.createdAt.toISOString(),
            scopes: account.scopes
          }
        : { connected: false }
    };
  }

  @Post("auth/microsoft/start")
  @HttpCode(200)
  async start(
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response
  ) {
    const { url, state, codeVerifier } =
      await this.microsoft.startOAuth(user.id);

    // userId is stored in the state cookie alongside the random state so the
    // callback (which is unauthenticated — no x-user-id header from the
    // browser redirect) can still resolve who is connecting.
    const stateCookie = `${state}.${user.id}`;
    setSecureCookie(res, STATE_COOKIE, stateCookie, this.config.cookieSecure);
    setSecureCookie(res, VERIFIER_COOKIE, codeVerifier, this.config.cookieSecure);

    return { url };
  }

  /**
   * Browser-friendly entry point — the mobile app opens this URL in the
   * device browser. Sets the same OAuth cookies as POST /auth/microsoft/start
   * and 302s straight to Microsoft so the user never sees a JSON page.
   */
  @Get("auth/microsoft/start-redirect")
  async startRedirect(
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response
  ): Promise<void> {
    const { url, state, codeVerifier } =
      await this.microsoft.startOAuth(user.id);
    const stateCookie = `${state}.${user.id}`;
    setSecureCookie(res, STATE_COOKIE, stateCookie, this.config.cookieSecure);
    setSecureCookie(res, VERIFIER_COOKIE, codeVerifier, this.config.cookieSecure);
    res.redirect(url);
  }

  @Public()
  @Get("auth/microsoft/callback")
  async callback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
    @Query("error_description") errorDescription?: string
  ) {
    if (error) {
      clearOAuthCookies(res, this.config.cookieSecure);
      throw new BadRequestException(
        `Microsoft returned an error: ${errorDescription ?? error}`
      );
    }
    if (!code || !state) {
      throw new BadRequestException("Missing code or state parameter");
    }

    const cookieState = (req.cookies?.[STATE_COOKIE] as string | undefined) ?? "";
    const verifier =
      (req.cookies?.[VERIFIER_COOKIE] as string | undefined) ?? "";

    if (!cookieState || !verifier) {
      throw new UnauthorizedException(
        "OAuth cookies missing. Restart the connect flow."
      );
    }

    const [storedState, userId] = cookieState.split(".");
    if (!storedState || !userId) {
      throw new UnauthorizedException("Malformed OAuth state cookie");
    }
    if (!this.crypto.safeEquals(storedState, state)) {
      clearOAuthCookies(res, this.config.cookieSecure);
      throw new UnauthorizedException("OAuth state mismatch");
    }

    try {
      await this.microsoft.handleOAuthCallback({
        userId,
        code,
        codeVerifier: verifier
      });
    } finally {
      clearOAuthCookies(res, this.config.cookieSecure);
    }

    res.redirect(this.config.appRedirectAfterAuth);
  }

  /**
   * Tiny landing page after a successful OAuth round-trip. Phase 3 has no
   * real frontend for this — the mobile app polls `/auth/me` instead.
   */
  @Public()
  @Get("auth/connected")
  connected(@Res() res: Response): void {
    res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>ReplyDeck — Outlook connected</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;background:#0c0d10;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:440px;background:#16181c;border:1px solid #2a2d33;border-radius:24px;padding:32px;text-align:center}
  h1{font-size:22px;margin:0 0 12px;font-weight:800}
  p{color:#a8aab0;font-size:15px;line-height:1.5;margin:0 0 8px}
  .check{width:56px;height:56px;border-radius:28px;background:#163420;border:1px solid #2a6f3a;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;color:#5dd47e;font-size:30px}
</style></head>
<body><div class="card">
<div class="check">✓</div>
<h1>Outlook connected</h1>
<p>Return to the ReplyDeck app and tap <b>Sync inbox now</b> to pull recent messages.</p>
<p style="margin-top:16px;font-size:12px;color:#6b6e76">You can close this tab.</p>
</div></body></html>`);
  }

  @Post("settings/disconnect-outlook")
  @HttpCode(200)
  async disconnect(@CurrentUser() user: CurrentUserPayload) {
    await this.microsoft.disconnect(user.id);
    return { ok: true };
  }
}

function setSecureCookie(
  res: Response,
  name: string,
  value: string,
  secure: boolean
): void {
  res.cookie(name, value, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/"
  });
}

function clearOAuthCookies(res: Response, secure: boolean): void {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE]) {
    res.clearCookie(name, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/"
    });
  }
}
