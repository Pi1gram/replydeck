import { execSync } from "child_process";
import { Client } from "pg";
import * as path from "path";

/**
 * Jest globalSetup — runs ONCE before any tests.
 *
 * Responsibilities:
 *  1. Ensure the `replydeck_test` database exists on the running Postgres.
 *     - Locally: discovers the Docker container started via docker-compose
 *       and runs CREATE DATABASE through `docker exec`.
 *     - In CI (process.env.CI === "true"): connects directly with `pg` and
 *       creates the database — there is no docker-compose container on
 *       GitHub-hosted runners, the service Postgres is reached over the
 *       network.
 *  2. Apply Prisma migrations to the test DB.
 *  3. Export the test DATABASE_URL so individual specs can use it.
 */

const TEST_DB_NAME = "replydeck_test";
const TEST_DB_URL = `postgresql://replydeck:replydeck@localhost:5433/${TEST_DB_NAME}?schema=public`;
const ADMIN_DB_URL = `postgresql://replydeck:replydeck@localhost:5433/replydeck`;

function isCi(): boolean {
  return process.env.CI === "true" || process.env.CI === "1";
}

function findPostgresContainer(): string {
  // Don't pipe to `awk` — that breaks on Windows where awk isn't on PATH.
  // Parse the output in Node instead.
  const out = execSync("docker ps --format \"{{.Names}}\t{{.Image}}\"", {
    encoding: "utf8"
  }).trim();
  if (!out) {
    throw new Error(
      "No running containers. Run `docker compose up -d postgres`."
    );
  }
  for (const line of out.split(/\r?\n/)) {
    const [name, image] = line.split("\t");
    if (image && /postgres/i.test(image)) {
      return name;
    }
  }
  throw new Error(
    "No running postgres container found. Run `docker compose up -d postgres`."
  );
}

async function createTestDbViaDocker(): Promise<void> {
  const container = findPostgresContainer();
  try {
    execSync(
      `docker exec ${container} psql -U replydeck -d replydeck -c "CREATE DATABASE ${TEST_DB_NAME}"`,
      { stdio: "pipe" }
    );
  } catch (err) {
    const msg = (err as { stderr?: Buffer }).stderr?.toString() ?? "";
    if (!msg.includes("already exists")) {
      console.warn("[global-setup] CREATE DATABASE warning:", msg.trim());
    }
  }
}

async function createTestDbViaNetwork(): Promise<void> {
  const client = new Client({ connectionString: ADMIN_DB_URL });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already exists/i.test(msg)) {
      console.warn("[global-setup] CREATE DATABASE warning:", msg);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  if (isCi()) {
    await createTestDbViaNetwork();
  } else {
    await createTestDbViaDocker();
  }

  // Apply migrations to the test DB. Use the api workspace's prisma binary.
  // Quote the schema path so paths containing spaces (e.g. "New folder")
  // survive the shell on Windows + POSIX.
  const apiRoot = path.resolve(__dirname, "..");
  const schemaPath = path.join(apiRoot, "prisma", "schema.prisma");
  execSync(
    `npx prisma migrate deploy --schema "${schemaPath}"`,
    {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: "pipe"
    }
  );

  // Make the DB URL + dev user id available to every test process.
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.DATABASE_URL_TEST = TEST_DB_URL;
  process.env.DEV_USER_ID = "cmozb3wxt0000epl11g97atj3";
}
