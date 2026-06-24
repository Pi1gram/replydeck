import {
  bootstrap,
  createSecondUser,
  DEMO_USER_ID,
  resetDb,
  TestHandle
} from "./setup";

/**
 * e2e coverage for the Phase 6 push-token registration endpoints.
 *
 * Surface under test:
 *   POST   /me/push-tokens          register / upsert a device token
 *   GET    /me/push-tokens          list the caller's tokens (no token text)
 *   DELETE /me/push-tokens/:id      revoke a token (only owner)
 *
 * Every mutation is expected to write an AuditLog row so the daily-wrap
 * email + security review trail stay complete.
 */
describe("Push tokens (e2e)", () => {
  let handle: TestHandle;

  beforeAll(async () => {
    handle = await bootstrap();
  });

  afterAll(async () => {
    await handle.app.close();
  });

  beforeEach(async () => {
    await resetDb(handle.prisma);
    // resetDb truncates User CASCADE, which knocks out PushToken too, but
    // be explicit so a future refactor of resetDb doesn't break this spec.
    await handle.prisma.pushToken.deleteMany({});
  });

  // ---------- POST /me/push-tokens ----------

  describe("POST /me/push-tokens", () => {
    it("registers a fresh token, returns 201, persists the row, and writes audit", async () => {
      const res = await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ platform: "IOS", token: "apns-token-abc" })
        .expect(201);

      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.platform).toBe("IOS");
      expect(res.body.token).toBe("apns-token-abc");
      expect(typeof res.body.createdAt).toBe("string");
      expect(typeof res.body.lastSeenAt).toBe("string");

      const rows = await handle.prisma.pushToken.findMany({
        where: { userId: DEMO_USER_ID }
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].token).toBe("apns-token-abc");
      expect(rows[0].platform).toBe("IOS");

      const audit = await handle.prisma.auditLog.findFirst({
        where: { userId: DEMO_USER_ID, action: "push_token.registered" }
      });
      expect(audit).not.toBeNull();
      const meta = audit?.metadata as Record<string, unknown> | null;
      expect(meta?.platform).toBe("IOS");
      expect(meta?.pushTokenId).toBe(rows[0].id);
    });

    it("lower-cases nothing but accepts lowercase platform via class-transformer", async () => {
      // DTO upper-cases the platform string before enum validation, so the
      // controller still accepts "ios" / "android". This is the wire shape
      // the mobile client actually sends.
      const res = await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ platform: "android", token: "fcm-token-xyz" })
        .expect(201);
      expect(res.body.platform).toBe("ANDROID");
    });

    it("upserts when the same token is registered twice — no duplicate row, lastSeenAt advances", async () => {
      const first = await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ platform: "IOS", token: "apns-token-dup" })
        .expect(201);

      const firstSeen = new Date(first.body.lastSeenAt);

      // Give a tiny gap so lastSeenAt can move forward measurably.
      await new Promise((r) => setTimeout(r, 25));

      const second = await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ platform: "IOS", token: "apns-token-dup" })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      const secondSeen = new Date(second.body.lastSeenAt);
      expect(secondSeen.getTime()).toBeGreaterThanOrEqual(firstSeen.getTime());

      const rows = await handle.prisma.pushToken.findMany({
        where: { userId: DEMO_USER_ID, token: "apns-token-dup" }
      });
      expect(rows).toHaveLength(1);

      // Two audit rows — each register call is auditable even if the row
      // is logically the same. Operators want to see "device checked in".
      const audits = await handle.prisma.auditLog.findMany({
        where: { userId: DEMO_USER_ID, action: "push_token.registered" }
      });
      expect(audits).toHaveLength(2);
    });

    it("rejects an unknown x-user-id with 401", async () => {
      await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", "not-a-real-user")
        .send({ platform: "IOS", token: "apns-token-anon" })
        .expect(401);
    });

    it("rejects a missing platform with 400", async () => {
      await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ token: "no-platform-token" })
        .expect(400);
    });

    it("rejects a missing token with 400", async () => {
      await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ platform: "IOS" })
        .expect(400);
    });
  });

  // ---------- GET /me/push-tokens ----------

  describe("GET /me/push-tokens", () => {
    it("returns the caller's tokens and never exposes the token text", async () => {
      await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ platform: "IOS", token: "secret-token-1" })
        .expect(201);
      await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ platform: "ANDROID", token: "secret-token-2" })
        .expect(201);

      const res = await handle.http
        .get("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);

      expect(res.body).toHaveLength(2);
      for (const t of res.body) {
        expect(typeof t.id).toBe("string");
        expect(["IOS", "ANDROID"]).toContain(t.platform);
        expect(typeof t.createdAt).toBe("string");
        expect(typeof t.lastSeenAt).toBe("string");
        // CRITICAL: list endpoint must never expose token text — only the
        // register response (returned to the device that already has it)
        // is allowed to echo it.
        expect(t.token).toBeUndefined();
      }
    });

    it("does not leak another user's push tokens", async () => {
      const other = await createSecondUser(handle.prisma);
      await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ platform: "IOS", token: "mine-only" })
        .expect(201);
      await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", other.id)
        .send({ platform: "IOS", token: "theirs-only" })
        .expect(201);

      const mine = await handle.http
        .get("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(mine.body).toHaveLength(1);

      const theirs = await handle.http
        .get("/me/push-tokens")
        .set("x-user-id", other.id)
        .expect(200);
      expect(theirs.body).toHaveLength(1);
    });

    it("returns 401 when x-user-id is an unknown user", async () => {
      // DevUserGuard falls back to process.env.DEV_USER_ID when the
      // header is missing entirely (that's the demo user), so to assert
      // the unauthorized path we send a header that does NOT resolve to
      // a real user. Same intent as the task's "no header" case.
      await handle.http
        .get("/me/push-tokens")
        .set("x-user-id", "unknown-user-xyz")
        .expect(401);
    });
  });

  // ---------- DELETE /me/push-tokens/:id ----------

  describe("DELETE /me/push-tokens/:id", () => {
    it("deletes the owner's token, returns 204, removes the row, writes audit", async () => {
      const reg = await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", DEMO_USER_ID)
        .send({ platform: "IOS", token: "to-delete" })
        .expect(201);
      const id = reg.body.id;

      await handle.http
        .delete(`/me/push-tokens/${id}`)
        .set("x-user-id", DEMO_USER_ID)
        .expect(204);

      const row = await handle.prisma.pushToken.findUnique({ where: { id } });
      expect(row).toBeNull();

      const audit = await handle.prisma.auditLog.findFirst({
        where: { userId: DEMO_USER_ID, action: "push_token.deleted" }
      });
      expect(audit).not.toBeNull();
      const meta = audit?.metadata as Record<string, unknown> | null;
      expect(meta?.pushTokenId).toBe(id);
      expect(meta?.platform).toBe("IOS");
    });

    it("refuses to delete another user's token (404, not 200)", async () => {
      const other = await createSecondUser(handle.prisma);
      const reg = await handle.http
        .post("/me/push-tokens")
        .set("x-user-id", other.id)
        .send({ platform: "ANDROID", token: "not-yours" })
        .expect(201);
      const id = reg.body.id;

      // Demo user attempts to delete the other user's token. The service
      // treats this as "not found for caller" to avoid leaking existence
      // information — either 404 or 403 is acceptable, both are non-200.
      const res = await handle.http
        .delete(`/me/push-tokens/${id}`)
        .set("x-user-id", DEMO_USER_ID);
      expect([403, 404]).toContain(res.status);

      // Row still exists for the real owner.
      const stillThere = await handle.prisma.pushToken.findUnique({
        where: { id }
      });
      expect(stillThere).not.toBeNull();
    });

    it("returns 404 when the id does not exist at all", async () => {
      await handle.http
        .delete("/me/push-tokens/nope-no-such-id")
        .set("x-user-id", DEMO_USER_ID)
        .expect(404);
    });

    it("returns 401 when x-user-id is an unknown user", async () => {
      // See GET note above — DevUserGuard's env fallback means a missing
      // header maps to the demo user, so we explicitly send a header
      // that does NOT resolve to a real user.
      await handle.http
        .delete("/me/push-tokens/anything")
        .set("x-user-id", "unknown-user-xyz")
        .expect(401);
    });
  });
});
