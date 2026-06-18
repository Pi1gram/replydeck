// Runs in every test process before jest globals are wired up.
// globalSetup sets these for the controller process; this guarantees every
// worker process gets them too (jest workers inherit env, so this is a belt-
// and-braces guarantee against environment drift between local + CI).
if (!process.env.DEV_USER_ID) {
  process.env.DEV_USER_ID = "cmozb3wxt0000epl11g97atj3";
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://replydeck:replydeck@localhost:5433/replydeck_test?schema=public";
}
if (!process.env.TOKEN_ENCRYPTION_KEY) {
  // Deterministic test key — never use this outside CI.
  process.env.TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}
// Microsoft env vars for OAuth-config validation in tests. We mock the Graph
// client itself, so these only need to be non-empty.
process.env.MICROSOFT_CLIENT_ID =
  process.env.MICROSOFT_CLIENT_ID || "test-client-id";
process.env.MICROSOFT_CLIENT_SECRET =
  process.env.MICROSOFT_CLIENT_SECRET || "test-client-secret";
process.env.MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "common";
process.env.MICROSOFT_REDIRECT_URI =
  process.env.MICROSOFT_REDIRECT_URI ||
  "http://localhost:4000/auth/microsoft/callback";
process.env.APP_REDIRECT_AFTER_AUTH =
  process.env.APP_REDIRECT_AFTER_AUTH ||
  "http://localhost:4000/auth/connected";

// Phase 4 — never hit the real Anthropic API from tests (see test/setup.ts).
process.env.AI_PROVIDER = "mock";
delete process.env.ANTHROPIC_API_KEY;
