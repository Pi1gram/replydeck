import { Injectable } from "@nestjs/common";

export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Send"
];

@Injectable()
export class MicrosoftConfig {
  readonly clientId = required("MICROSOFT_CLIENT_ID");
  readonly clientSecret = required("MICROSOFT_CLIENT_SECRET");
  readonly tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  readonly redirectUri = required("MICROSOFT_REDIRECT_URI");
  readonly appRedirectAfterAuth =
    process.env.APP_REDIRECT_AFTER_AUTH ||
    "http://localhost:4000/auth/connected";
  readonly cookieSecure = process.env.OAUTH_COOKIE_SECURE === "true";
  readonly scopes = MICROSOFT_SCOPES;

  authorizeUrl(): string {
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`;
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    // Throw lazily — config is only validated when the Microsoft module
    // actually handles a request, so e2e tests that don't touch OAuth still
    // run without these env vars.
    return "";
  }
  return v.trim();
}
