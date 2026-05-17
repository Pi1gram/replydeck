import { execSync } from "child_process";
import * as path from "path";

/**
 * Jest globalSetup — runs ONCE before any tests.
 *
 * Responsibilities:
 *  1. Ensure the `replydeck_test` database exists on the running Postgres
 *     container (created in /docker-compose.yml). The dev `replydeck` DB is
 *     left untouched.
 *  2. Apply Prisma migrations to the test DB.
 *  3. Export the test DATABASE_URL so individual specs can use it.
 *
 * The container name is auto-detected to keep this resilient to docker-compose
 * project-name variations.
 */

const TEST_DB_NAME = "replydeck_test";
const TEST_DB_URL = `postgresql://replydeck:replydeck@localhost:5433/${TEST_DB_NAME}?schema=public`;

function findPostgresContainer(): string {
  const out = execSync(
    "docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /postgres/ {print $1; exit}'",
    { encoding: "utf8" }
  ).trim();
  if (!out) {
    throw new Error(
      "No running postgres container found. Run `docker compose up -d postgres`."
    );
  }
  return out;
}

export default async function globalSetup(): Promise<void> {
  const container = findPostgresContainer();

  // Create the test DB if it doesn't exist. Ignore "already exists" failure.
  try {
    execSync(
      `docker exec ${container} psql -U replydeck -d replydeck -c "CREATE DATABASE ${TEST_DB_NAME}"`,
      { stdio: "pipe" }
    );
  } catch (err) {
    // Likely "database already exists" — fine. Re-throw on connection issues.
    const msg = (err as { stderr?: Buffer }).stderr?.toString() ?? "";
    if (!msg.includes("already exists")) {
      // Print the error but don't fail — the migrate step will surface real
      // connection issues with a clearer message.
      // eslint-disable-next-line no-console
      console.warn("[global-setup] CREATE DATABASE warning:", msg.trim());
    }
  }

  // Apply migrations to the test DB. Use the api workspace's prisma binary.
  const apiRoot = path.resolve(__dirname, "..");
  const schemaPath = path.join(apiRoot, "prisma", "schema.prisma");
  execSync(
    `npx prisma migrate deploy --schema ${schemaPath}`,
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
