import { SetMetadata } from "@nestjs/common";

export const PUBLIC_ROUTE_KEY = "publicRoute";

/**
 * Mark a controller method as not requiring the dev-user guard.
 *
 * Phase 3 uses this for the OAuth callback (browser redirect, no
 * `x-user-id` header) and the success landing page.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_ROUTE_KEY, true);
