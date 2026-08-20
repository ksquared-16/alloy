#!/usr/bin/env node
/**
 * Prove the Resend webhook endpoint accepts Resend and rejects everything else.
 *
 * Three requests, in one run:
 *
 *   1. UNSIGNED        expect 400 "Missing Svix signature headers"
 *   2. WRONGLY SIGNED  expect 400 "Invalid signature"   (a real signature, wrong secret)
 *   3. CORRECTLY SIGNED expect 200 {"ok":true,"ignored":true,...}
 *
 * The third is the only one that proves anything positive, and it is deliberately inert.
 * It signs an event `type` the route does not handle, so verification runs and then the
 * handler falls through to `{ ok: true, ignored: true }` — no message is created, no
 * receipt is claimed, no provider call is made, nothing is written. Signing a real
 * `email.received` would have been a stronger-looking test and would have manufactured an
 * ingress receipt for an email that does not exist, polluting the very table the live round
 * trip is being judged on.
 *
 * THE SECRET IS READ FROM YOUR ENVIRONMENT AND NEVER PRINTED. Nothing here logs it, and the
 * script refuses to run if it is passed as an argument, where it would land in shell history.
 *
 *   RESEND_WEBHOOK_SECRET='whsec_…' node resend-webhook-signed-probe.mjs https://staging.workwithalloy.com
 *
 * Svix signing, for the record: the signed content is `${id}.${timestamp}.${body}`, the key
 * is the base64 payload after the `whsec_` prefix, and the header value is
 * `v1,<base64 HMAC-SHA256>`. That is the same construction `svix`'s own `Webhook.verify`
 * checks, which is why `--self-test` can prove this script's signatures are genuine without
 * a network call or a real secret.
 */

import { createHmac, randomUUID } from "node:crypto";

function sign(secret, id, timestamp, body) {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return `v1,${signature}`;
}

async function post(url, body, headers) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
    });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 200) };
}

async function selfTest() {
    // Proves the signatures this script produces are the ones Svix accepts. Uses a throwaway
    // secret and no network: if this fails, a failure against staging would be this script's
    // fault rather than the endpoint's, and that ambiguity is worth removing up front.
    // Resolved from web/node_modules explicitly: ESM resolves relative to THIS file, and
    // svix is a dependency of the app rather than of the certification folder.
    const { createRequire } = await import("node:module");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const require = createRequire(join(here, "..", "..", "web", "package.json"));
    const { Webhook } = require("svix");
    const secret = "whsec_" + Buffer.from("self-test-key-not-a-real-secret").toString("base64");
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "email.queued", data: {} });
    new Webhook(secret).verify(body, {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": sign(secret, id, timestamp, body),
    });
    console.log("self-test: PASS — signatures produced here verify under svix's own Webhook.verify");
}

async function main() {
    const arg = process.argv[2];
    if (arg === "--self-test") return selfTest();
    if (arg && arg.startsWith("whsec_")) {
        console.error("refusing: pass the secret via the RESEND_WEBHOOK_SECRET env var, not an argument");
        process.exit(2);
    }
    const base = (arg ?? "https://staging.workwithalloy.com").replace(/\/$/, "");
    const url = `${base}/api/webhooks/resend`;
    const secret = (process.env.RESEND_WEBHOOK_SECRET ?? "").trim();
    if (!secret) {
        console.error("RESEND_WEBHOOK_SECRET is not set in this shell — set it to the value the Resend");
        console.error("endpoint shows (starts with whsec_) and re-run. It is never printed.");
        process.exit(2);
    }

    // An event type the route does not handle. Inert by construction.
    const body = JSON.stringify({
        type: "email.queued",
        created_at: new Date().toISOString(),
        data: { email_id: "00000000-0000-4000-8000-000000000000", probe: "alloy-webhook-signature-probe" },
    });
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));

    console.log(`endpoint: ${url}\n`);

    const unsigned = await post(url, body, {});
    console.log(`1. unsigned          -> ${unsigned.status}  ${unsigned.body}`);

    const wrongSecret = "whsec_" + Buffer.from("definitely-the-wrong-key").toString("base64");
    const wrong = await post(url, body, {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": sign(wrongSecret, id, timestamp, body),
    });
    console.log(`2. wrong signature   -> ${wrong.status}  ${wrong.body}`);

    const good = await post(url, body, {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": sign(secret, id, timestamp, body),
    });
    console.log(`3. correct signature -> ${good.status}  ${good.body}`);

    console.log("");
    const pass = unsigned.status === 400 && wrong.status === 400 && good.status === 200;
    if (pass) {
        console.log("RESULT: PASS — the endpoint accepts this secret and rejects unsigned and mis-signed calls.");
        console.log("        The secret in this shell matches the one the deployment is running with.");
    } else if (good.status === 503) {
        console.log("RESULT: FAIL — 503 means the DEPLOYMENT has no RESEND_WEBHOOK_SECRET at all.");
        console.log("        Set it on the platform that serves this URL, then REDEPLOY.");
    } else if (good.status === 400) {
        console.log("RESULT: FAIL — the deployment has a secret, but NOT this one. They must match the");
        console.log("        signing secret shown on the Resend endpoint, exactly, including whsec_.");
    } else {
        console.log(`RESULT: FAIL — unexpected status ${good.status}. Report the body above.`);
    }
    process.exit(pass ? 0 : 1);
}

await main();
