/**
 * Side-effect-only module loaded BEFORE graph-webhooks.e2e-spec.ts
 * imports anything from src/. The MicrosoftModule's `isQueuesEnabled()`
 * check runs at @Module() decorator evaluation time (i.e. at import
 * time), so REDIS_URL has to be set before the AppModule import chain
 * resolves — setting it inside beforeAll is too late.
 *
 * REDIS_URL points at a port no service listens on (16379) so that even
 * if a stray code-path tried to connect it would fail loud instead of
 * silently hitting a real Redis. All queues + processors are overridden
 * in the spec, so no connection should ever be attempted in practice.
 */
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:16379";
process.env.PUBLIC_WEBHOOK_BASE_URL =
  process.env.PUBLIC_WEBHOOK_BASE_URL || "http://localhost:4000";
