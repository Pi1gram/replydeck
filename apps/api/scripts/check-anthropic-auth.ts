import "reflect-metadata";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import Anthropic from "@anthropic-ai/sdk";

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY missing.");
    process.exit(1);
  }
  console.log(`Key format: prefix=${apiKey.slice(0, 10)}... length=${apiKey.length}`);

  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 });

  try {
    const models = await client.models.list({ limit: 5 });
    console.log("\n/v1/models OK. First few models:");
    for (const m of models.data) {
      console.log(`  ${m.id}  (${m.display_name})`);
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error(`\nAUTH FAIL on /v1/models — key is invalid or revoked.`);
      console.error(`  status: ${err.status}`);
      console.error(`  message: ${err.message}`);
    } else if (err instanceof Anthropic.APIError) {
      console.error(`\nAPI ERROR on /v1/models:`);
      console.error(`  status: ${err.status}`);
      console.error(`  type: ${err.type}`);
      console.error(`  message: ${err.message}`);
    } else {
      console.error(`Unknown error:`, err);
    }
    process.exit(1);
  }

  console.log("\nTrying a minimal messages.create with claude-haiku-4-5 (cheapest)…");
  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 32,
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }]
    });
    console.log("messages.create OK with haiku-4-5.");
    const text = resp.content.find((b) => b.type === "text");
    if (text && text.type === "text") {
      console.log(`  response: ${text.text}`);
    }
    console.log(`  usage: in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`\nmessages.create FAILED on haiku-4-5:`);
      console.error(`  status: ${err.status}`);
      console.error(`  type: ${err.type}`);
      console.error(`  message: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  }

  console.log("\nTrying messages.create with claude-sonnet-4-6…");
  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 32,
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }]
    });
    console.log("messages.create OK with sonnet-4-6.");
    const text = resp.content.find((b) => b.type === "text");
    if (text && text.type === "text") {
      console.log(`  response: ${text.text}`);
    }
    console.log(`  usage: in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`\nmessages.create FAILED on sonnet-4-6:`);
      console.error(`  status: ${err.status}`);
      console.error(`  type: ${err.type}`);
      console.error(`  message: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Auth check crashed:", err);
  process.exit(1);
});
