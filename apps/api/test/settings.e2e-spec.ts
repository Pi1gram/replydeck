import {
  bootstrap,
  createSecondUser,
  DEMO_USER_ID,
  resetDb,
  TestHandle
} from "./setup";

describe("Settings (e2e)", () => {
  let handle: TestHandle;

  beforeAll(async () => {
    handle = await bootstrap();
  });

  afterAll(async () => {
    await handle.app.close();
  });

  beforeEach(async () => {
    await resetDb(handle.prisma);
  });

  // ---------- GET /settings/tone-profile ----------

  describe("GET /settings/tone-profile", () => {
    it("returns 404 when the user has no tone profile yet", async () => {
      await handle.http
        .get("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .expect(404);
    });

    it("returns the tone profile after one has been created", async () => {
      await handle.http
        .patch("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .send({ defaultTone: "friends" })
        .expect(200);

      const res = await handle.http
        .get("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);

      expect(res.body.defaultTone).toBe("friends");
      expect(Array.isArray(res.body.preferredGreetings)).toBe(true);
      expect(typeof res.body.id).toBe("string");
      expect(typeof res.body.createdAt).toBe("string");
    });
  });

  // ---------- PATCH /settings/tone-profile ----------

  describe("PATCH /settings/tone-profile", () => {
    it("creates a new tone profile and returns it with a lowercase tone", async () => {
      const res = await handle.http
        .patch("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .send({
          defaultTone: "formal",
          averageReplyLength: "short",
          preferredGreetings: ["Dear"],
          preferredSignOffs: ["Best regards"],
          avoidPhrases: ["Cheers"],
          styleNotes: ["Keep it concise."]
        })
        .expect(200);

      expect(res.body.defaultTone).toBe("formal");
      expect(res.body.averageReplyLength).toBe("short");
      expect(res.body.preferredGreetings).toEqual(["Dear"]);
      expect(res.body.preferredSignOffs).toEqual(["Best regards"]);
      expect(res.body.avoidPhrases).toEqual(["Cheers"]);
      expect(res.body.styleNotes).toEqual(["Keep it concise."]);

      const audit = await handle.prisma.auditLog.findFirst({
        where: {
          userId: DEMO_USER_ID,
          action: "settings.tone_profile.updated"
        }
      });
      expect(audit).not.toBeNull();
    });

    it("preserves untouched fields when partial-updating", async () => {
      // Create with all fields
      await handle.http
        .patch("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .send({
          defaultTone: "business",
          averageReplyLength: "medium",
          preferredGreetings: ["Hi"],
          styleNotes: ["Be friendly."]
        })
        .expect(200);

      // Patch only one field
      const res = await handle.http
        .patch("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .send({ defaultTone: "friends" })
        .expect(200);

      expect(res.body.defaultTone).toBe("friends");
      expect(res.body.averageReplyLength).toBe("medium");
      expect(res.body.preferredGreetings).toEqual(["Hi"]);
      expect(res.body.styleNotes).toEqual(["Be friendly."]);
    });

    it("rejects an invalid defaultTone with 400", async () => {
      await handle.http
        .patch("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .send({ defaultTone: "shouty" })
        .expect(400);
    });

    it("writes one AuditLog row per mutation", async () => {
      await handle.http
        .patch("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .send({ defaultTone: "formal" })
        .expect(200);
      await handle.http
        .patch("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .send({ averageReplyLength: "long" })
        .expect(200);

      const audits = await handle.prisma.auditLog.findMany({
        where: {
          userId: DEMO_USER_ID,
          action: "settings.tone_profile.updated"
        }
      });
      expect(audits).toHaveLength(2);
    });
  });

  // ---------- POST /settings/sender-profiles ----------

  describe("POST /settings/sender-profiles", () => {
    it("creates a sender profile, lowercases the email, derives the domain, and writes an AuditLog", async () => {
      const res = await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({
          senderEmail: "Boss@Example.COM",
          relationship: "manager",
          preferredTone: "formal",
          pinAlwaysReview: true,
          notes: ["Likes bullet points."]
        })
        .expect(201);

      expect(res.body.senderEmail).toBe("boss@example.com");
      expect(res.body.senderDomain).toBe("example.com");
      expect(res.body.relationship).toBe("manager");
      expect(res.body.preferredTone).toBe("formal");
      expect(res.body.pinAlwaysReview).toBe(true);
      expect(res.body.notes).toEqual(["Likes bullet points."]);

      const audit = await handle.prisma.auditLog.findFirst({
        where: {
          userId: DEMO_USER_ID,
          action: "settings.sender_profile.created"
        }
      });
      expect(audit).not.toBeNull();
      const meta = audit?.metadata as Record<string, unknown> | null;
      expect(meta?.senderEmail).toBe("boss@example.com");
    });

    it("returns 409 when a profile for the same email already exists", async () => {
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "dup@example.com" })
        .expect(201);

      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "dup@example.com" })
        .expect(409);
    });

    it("rejects an invalid email with 400", async () => {
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "not-an-email" })
        .expect(400);
    });
  });

  // ---------- GET /settings/sender-profiles ----------

  describe("GET /settings/sender-profiles", () => {
    it("filters by ?domain= query parameter", async () => {
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "a@example.com" })
        .expect(201);
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "b@example.com" })
        .expect(201);
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "c@other.com" })
        .expect(201);

      const allRes = await handle.http
        .get("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(allRes.body).toHaveLength(3);

      const filtered = await handle.http
        .get("/settings/sender-profiles?domain=example.com")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(filtered.body).toHaveLength(2);
      filtered.body.forEach((p: { senderDomain: string }) => {
        expect(p.senderDomain).toBe("example.com");
      });
    });

    it("returns profiles ordered by updatedAt desc", async () => {
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "first@example.com" })
        .expect(201);
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "second@example.com" })
        .expect(201);

      const res = await handle.http
        .get("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);

      expect(res.body[0].senderEmail).toBe("second@example.com");
      expect(res.body[1].senderEmail).toBe("first@example.com");
    });
  });

  // ---------- GET /settings/sender-profiles/:email ----------

  describe("GET /settings/sender-profiles/:email", () => {
    it("returns one profile by URL-decoded email", async () => {
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "alice@example.com" })
        .expect(201);

      const res = await handle.http
        .get(`/settings/sender-profiles/${encodeURIComponent("alice@example.com")}`)
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(res.body.senderEmail).toBe("alice@example.com");
    });

    it("returns 404 when no profile exists for that email", async () => {
      await handle.http
        .get(`/settings/sender-profiles/${encodeURIComponent("nobody@example.com")}`)
        .set("x-user-id", DEMO_USER_ID)
        .expect(404);
    });
  });

  // ---------- PATCH /settings/sender-profiles/:email ----------

  describe("PATCH /settings/sender-profiles/:email", () => {
    it("updates pinAlwaysReview to true and writes an AuditLog", async () => {
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "edit-me@example.com" })
        .expect(201);

      const res = await handle.http
        .patch(
          `/settings/sender-profiles/${encodeURIComponent("edit-me@example.com")}`
        )
        .set("x-user-id", DEMO_USER_ID)
        .send({ pinAlwaysReview: true })
        .expect(200);

      expect(res.body.pinAlwaysReview).toBe(true);

      const audit = await handle.prisma.auditLog.findFirst({
        where: {
          userId: DEMO_USER_ID,
          action: "settings.sender_profile.updated"
        }
      });
      expect(audit).not.toBeNull();
      const meta = audit?.metadata as Record<string, unknown> | null;
      expect(meta?.senderEmail).toBe("edit-me@example.com");
    });

    it("returns 404 when the profile does not exist", async () => {
      await handle.http
        .patch(
          `/settings/sender-profiles/${encodeURIComponent("ghost@example.com")}`
        )
        .set("x-user-id", DEMO_USER_ID)
        .send({ pinAlwaysReview: true })
        .expect(404);
    });
  });

  // ---------- DELETE /settings/sender-profiles/:email ----------

  describe("DELETE /settings/sender-profiles/:email", () => {
    it("deletes the profile, returns 204, writes audit, and subsequent GET is 404", async () => {
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "to-delete@example.com" })
        .expect(201);

      await handle.http
        .delete(
          `/settings/sender-profiles/${encodeURIComponent("to-delete@example.com")}`
        )
        .set("x-user-id", DEMO_USER_ID)
        .expect(204);

      await handle.http
        .get(
          `/settings/sender-profiles/${encodeURIComponent("to-delete@example.com")}`
        )
        .set("x-user-id", DEMO_USER_ID)
        .expect(404);

      const audit = await handle.prisma.auditLog.findFirst({
        where: {
          userId: DEMO_USER_ID,
          action: "settings.sender_profile.deleted"
        }
      });
      expect(audit).not.toBeNull();
    });

    it("returns 404 when the profile does not exist", async () => {
      await handle.http
        .delete(
          `/settings/sender-profiles/${encodeURIComponent("missing@example.com")}`
        )
        .set("x-user-id", DEMO_USER_ID)
        .expect(404);
    });
  });

  // ---------- Cross-user isolation ----------

  describe("cross-user isolation", () => {
    it("does not leak user A's tone profile to user B", async () => {
      const other = await createSecondUser(handle.prisma);

      await handle.http
        .patch("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .send({ defaultTone: "formal" })
        .expect(200);

      // User B sees no tone profile of their own
      await handle.http
        .get("/settings/tone-profile")
        .set("x-user-id", other.id)
        .expect(404);

      // User B writing their own does not affect user A
      await handle.http
        .patch("/settings/tone-profile")
        .set("x-user-id", other.id)
        .send({ defaultTone: "friends" })
        .expect(200);

      const a = await handle.http
        .get("/settings/tone-profile")
        .set("x-user-id", DEMO_USER_ID)
        .expect(200);
      expect(a.body.defaultTone).toBe("formal");
    });

    it("does not leak user A's sender profiles to user B", async () => {
      const other = await createSecondUser(handle.prisma);

      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", DEMO_USER_ID)
        .send({ senderEmail: "private@example.com" })
        .expect(201);

      const otherList = await handle.http
        .get("/settings/sender-profiles")
        .set("x-user-id", other.id)
        .expect(200);
      expect(otherList.body).toHaveLength(0);

      await handle.http
        .get(
          `/settings/sender-profiles/${encodeURIComponent("private@example.com")}`
        )
        .set("x-user-id", other.id)
        .expect(404);

      // Each user has their own row keyed by (userId, senderEmail) — same
      // email under different users should not conflict.
      await handle.http
        .post("/settings/sender-profiles")
        .set("x-user-id", other.id)
        .send({ senderEmail: "private@example.com" })
        .expect(201);
    });
  });
});
