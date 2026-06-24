// MUST be first — sets REDIS_URL before MicrosoftModule's decorator runs.
// See graph-webhooks-env.ts for the full explanation.
import "./graph-webhooks-env";
import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import cookieParser from "cookie-parser";
import request = require("supertest");

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma.service";
import { GraphSyncProcessor } from "../src/microsoft/graph-sync.processor";
import { SubscriptionRenewerProcessor } from "../src/microsoft/subscription-renewer.processor";
import {
  GRAPH_SYNC_QUEUE,
  SUBSCRIPTION_RENEWAL_QUEUE
} from "../src/microsoft/graph-queues";

import { DEMO_USER_ID, resetDb } from "./setup";

/**
 * e2e coverage for the Microsoft Graph push-notification receiver.
 *
 * Three response modes:
 *   - validation handshake (?validationToken=...) — must echo as text/plain 200
 *   - mismatched clientState — must reject with 400 (spoof-prevention)
 *   - valid clientState — must enqueue a single graph-sync job per affected
 *     user and return 202 immediately
 *
 * BullMQ wiring caveat: when REDIS_URL is unset the MicrosoftModule skips
 * queue registration entirely and the controller falls back to "log and
 * drop". To exercise the enqueue path we set REDIS_URL during this spec's
 * beforeAll (so BullModule registers the queue token) then override:
 *   - the queue itself with a spy stub so no Redis traffic actually flies,
 *   - both processors with no-op stand-ins so BullMQ does not try to open
 *     a Worker connection during app.init().
 */

interface AddedJob {
  name: string;
  data: unknown;
  opts: Record<string, unknown>;
}

class MockQueue {
  added: AddedJob[] = [];
  async add(
    name: string,
    data: unknown,
    opts: Record<string, unknown> = {}
  ): Promise<{ id: string }> {
    this.added.push({ name, data, opts });
    return { id: `mock-job-${this.added.length}` };
  }
}

class NoopProcessor {
  // BullMQ WorkerHost extends a class that opens connections in its
  // constructor; replacing the processor token with a bare class skips
  // that side-effect entirely.
}

interface Handle {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  syncQueue: MockQueue;
  renewalQueue: MockQueue;
}

async function bootstrapWithMockedQueues(): Promise<Handle> {
  const syncQueue = new MockQueue();
  const renewalQueue = new MockQueue();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(getQueueToken(GRAPH_SYNC_QUEUE))
    .useValue(syncQueue)
    .overrideProvider(getQueueToken(SUBSCRIPTION_RENEWAL_QUEUE))
    .useValue(renewalQueue)
    .overrideProvider(GraphSyncProcessor)
    .useValue(new NoopProcessor())
    .overrideProvider(SubscriptionRenewerProcessor)
    .useValue(new NoopProcessor())
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: "*", credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  await app.init();

  return {
    app,
    http: request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    syncQueue,
    renewalQueue
  };
}

describe("Graph webhooks (e2e)", () => {
  let handle: Handle;

  beforeAll(async () => {
    handle = await bootstrapWithMockedQueues();
  });

  afterAll(async () => {
    await handle.app.close();
  });

  beforeEach(async () => {
    await resetDb(handle.prisma);
    await handle.prisma.graphSubscription.deleteMany({});
    handle.syncQueue.added.length = 0;
    handle.renewalQueue.added.length = 0;
  });

  // ---------- validation handshake ----------

  describe("validation handshake", () => {
    it("echoes ?validationToken as text/plain 200", async () => {
      const res = await handle.http
        .post("/webhooks/microsoft-graph?validationToken=hello-token-abc")
        .send({})
        .expect(200);

      expect(res.text).toBe("hello-token-abc");
      // Content-Type must be text/plain per Graph's handshake contract —
      // a JSON body would be ignored and Graph would refuse to create
      // the subscription.
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
    });

    it("does NOT require an x-user-id header (Public route)", async () => {
      // Graph cannot set our internal auth header, so this endpoint is
      // explicitly @Public(). The handshake must succeed with no auth.
      await handle.http
        .post("/webhooks/microsoft-graph?validationToken=anon-token")
        .send({})
        .expect(200);
    });
  });

  // ---------- clientState verification ----------

  describe("clientState verification", () => {
    it("returns 400 when the notification's clientState does not match the stored row", async () => {
      await handle.prisma.graphSubscription.create({
        data: {
          userId: DEMO_USER_ID,
          subscriptionId: "sub-mismatch-1",
          resource: "/me/mailFolders('Inbox')/messages",
          expirationDateTime: new Date(Date.now() + 60 * 60 * 1000),
          clientState: "expected-secret"
        }
      });

      await handle.http
        .post("/webhooks/microsoft-graph")
        .send({
          value: [
            {
              subscriptionId: "sub-mismatch-1",
              clientState: "WRONG-secret",
              changeType: "created",
              resource: "Users/x/messages/abc"
            }
          ]
        })
        .expect(400);

      // No sync job enqueued — spoofed payloads must be dropped.
      expect(handle.syncQueue.added).toHaveLength(0);

      // The mismatch must be audited so an operator can see attempted
      // spoofing / stale subscription rows in the activity feed.
      const audit = await handle.prisma.auditLog.findFirst({
        where: {
          userId: DEMO_USER_ID,
          action: "graph_subscription.client_state_mismatch"
        }
      });
      expect(audit).not.toBeNull();
    });

    it("ignores notifications whose subscriptionId is unknown locally (no 400, just no work)", async () => {
      // Graph occasionally sends notifications for subscriptions we've
      // already deleted. Those must NOT raise an error — just be dropped.
      const res = await handle.http
        .post("/webhooks/microsoft-graph")
        .send({
          value: [
            {
              subscriptionId: "sub-unknown-zzz",
              clientState: "whatever",
              changeType: "created"
            }
          ]
        });
      // The current controller returns 202 with no work; we accept either
      // 202 or 200 to keep the contract narrow.
      expect([200, 202]).toContain(res.status);
      expect(handle.syncQueue.added).toHaveLength(0);
    });
  });

  // ---------- valid notification → enqueue ----------

  describe("valid notification → enqueue", () => {
    it("returns 202 and enqueues one graph-sync job for the matching user", async () => {
      await handle.prisma.graphSubscription.create({
        data: {
          userId: DEMO_USER_ID,
          subscriptionId: "sub-ok-1",
          resource: "/me/mailFolders('Inbox')/messages",
          expirationDateTime: new Date(Date.now() + 60 * 60 * 1000),
          clientState: "the-right-secret"
        }
      });

      await handle.http
        .post("/webhooks/microsoft-graph")
        .send({
          value: [
            {
              subscriptionId: "sub-ok-1",
              clientState: "the-right-secret",
              changeType: "created",
              resource: "Users/x/messages/abc"
            }
          ]
        })
        .expect(202);

      expect(handle.syncQueue.added).toHaveLength(1);
      const enqueued = handle.syncQueue.added[0];
      expect(enqueued.name).toBe("graph-sync");
      expect(enqueued.data).toEqual({ userId: DEMO_USER_ID });
      // jobId is the dedup key the controller stamps on so a burst of N
      // notifications within the 5-second window collapses to one job.
      expect(typeof enqueued.opts.jobId).toBe("string");
      expect(enqueued.opts.jobId as string).toContain(DEMO_USER_ID);
    });

    it("dedupes user ids — a batch of 3 notifications for one user enqueues only 1 job", async () => {
      await handle.prisma.graphSubscription.create({
        data: {
          userId: DEMO_USER_ID,
          subscriptionId: "sub-batch-1",
          resource: "/me/mailFolders('Inbox')/messages",
          expirationDateTime: new Date(Date.now() + 60 * 60 * 1000),
          clientState: "batch-secret"
        }
      });

      await handle.http
        .post("/webhooks/microsoft-graph")
        .send({
          value: [
            {
              subscriptionId: "sub-batch-1",
              clientState: "batch-secret",
              changeType: "created"
            },
            {
              subscriptionId: "sub-batch-1",
              clientState: "batch-secret",
              changeType: "created"
            },
            {
              subscriptionId: "sub-batch-1",
              clientState: "batch-secret",
              changeType: "created"
            }
          ]
        })
        .expect(202);

      expect(handle.syncQueue.added).toHaveLength(1);
    });

    it("acks an empty notification body with 202 and enqueues nothing", async () => {
      await handle.http
        .post("/webhooks/microsoft-graph")
        .send({})
        .expect(202);
      expect(handle.syncQueue.added).toHaveLength(0);
    });
  });
});
