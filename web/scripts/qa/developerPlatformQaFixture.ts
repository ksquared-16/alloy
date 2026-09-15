#!/usr/bin/env tsx
/**
 * Command-line access to the QA fixture, for troubleshooting only.
 *
 * The walkthrough prepares the fixture itself; an operator should never need
 * this. It exists so that when preparation fails, the QA page can print one
 * exact repair command instead of prose, and so the same authority is reachable
 * without a browser. The logic lives in `lib/dev/developerPlatformQa.ts` — this
 * file is an entry point, not a second implementation.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.certification.local") });

const { ensureFixture, fixtureStatus, removeFixture } = await import("@/lib/dev/developerPlatformQa");

const op = process.argv[2] ?? "status";
if (op === "ensure") {
    console.log(JSON.stringify(await ensureFixture(), null, 2));
} else if (op === "status") {
    console.log(JSON.stringify(await fixtureStatus(), null, 2));
} else if (op === "reset") {
    await removeFixture();
    console.log(JSON.stringify({ ok: true, op: "reset" }, null, 2));
} else {
    console.error("usage: qa:developer-platform -- ensure|status|reset");
    process.exit(2);
}
