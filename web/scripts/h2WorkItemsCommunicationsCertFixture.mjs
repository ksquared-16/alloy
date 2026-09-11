#!/usr/bin/env node
/**
 * H2 — Communications → Work Items convergence certification fixture.
 *
 * ── Why the previous fixture could not be used ────────────────────────────────────────────────
 *
 * `web/scripts/createCommunicationsNeedsReplyQaFixture.ts` SELECTS an existing thread
 * (`order by last_message_at desc limit 10`) and writes `attention_state` onto it with a
 * service-role client. On the certification tenant the threads it would have chosen are
 * `kelly.kurzman@gmail.com`, a real mobile number, `noreply@nohotwater.net` and
 * `forwarding-noreply@google.com` — real external correspondence. It also bypasses the
 * Communications runtime entirely, so it proves nothing about the behaviour under certification: a
 * hand-written `attention_state` would make the Work Items projection appear without any of the
 * inbound semantics that are supposed to cause it.
 *
 * ── What this does instead ────────────────────────────────────────────────────────────────────
 *
 * It sends a synthetic INBOUND email through the real ingestion chain and lets the product decide
 * everything downstream. Nothing here writes `attention_state`, and nothing here writes a thread.
 *
 *   1. Reads the org's ACTIVE email binding through the product API. The receiving address is
 *      whatever Alloy itself owns — never hardcoded, never a customer address.
 *   2. Resolves the SENDER among the certification identities the platform already owns
 *      (`*.alloy.invalid`). `.invalid` is RFC 2606 reserved: it can never resolve and can never be
 *      delivered to. No address is invented, and a guard below refuses anything else.
 *   3. POSTs a fixture `email.received` event to `/api/admin/debug/certification/inbound-email`,
 *      the platform's OWN supported non-delivery path (env-gated on ALLOY_CERTIFICATION,
 *      admin-authenticated). That route hands the event and a fixture retrieval payload to the same
 *      `ingestResendInboundEmail` the Resend webhook calls, so ownership, correlation,
 *      exactly-once, persistence and Activity are all production code.
 *   4. The RUNTIME then writes `attention_state: "needs_response"` because that is what an inbound
 *      message from an identified sender means.
 *
 * ── No delivery, in either direction ──────────────────────────────────────────────────────────
 *
 * This is inbound-only. Nothing is sent. The certification environment additionally holds no
 * provider credentials, and the sender is on a reserved TLD that cannot exist. Authoritative
 * RESOLUTION is operator triage (`POST /conversations/[id]/triage`), which is also send-free —
 * replying does not clear attention state in this product, triage does.
 *
 * ── Idempotency and cleanup (requirements 9 and 12) ───────────────────────────────────────────
 *
 * `email_id` is deterministic per run-key. Re-running with the same key hits the ingress
 * exactly-once claim and returns `duplicate` without creating a second thread. To create a fresh
 * actionable thread, pass a new `--key`.
 *
 * `--cleanup` does NOT delete anything. It resolves the fixture's own threads through the same
 * authoritative triage endpoint an operator would use, which is the product's real disposal path
 * and leaves an honest audit trail. Threads are matched only by ids this fixture recorded, so it
 * can never touch correspondence it did not create.
 *
 * Lives under `web/` because Node resolves `node_modules` from the SCRIPT's location, and this
 * drives the product over HTTP with Playwright's request context carrying the slot's QA session —
 * it holds no service-role key and never touches a table directly.
 *
 * With the lane dev server up and ALLOY_CERTIFICATION=1 in its environment:
 *   cd web && node scripts/h2WorkItemsCommunicationsCertFixture.mjs --create [--key k]
 *   cd web && node scripts/h2WorkItemsCommunicationsCertFixture.mjs --status
 *   cd web && node scripts/h2WorkItemsCommunicationsCertFixture.mjs --cleanup
 */

import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.H2_BASE_URL || "http://127.0.0.1:3022";
const STORAGE =
    process.env.H2_STORAGE_STATE ||
    path.join(process.env.HOME || "", ".local/state/alloy-dev/gateway/auth/slot12/storage-state.json");
const STATE_FILE = path.join(HERE, ".h2-fixture-state.json");

/**
 * The only sender domains this fixture will ever accept.
 *
 * RFC 2606 reserves `.invalid` and `.example` precisely so they can never be registered or
 * delivered to. This guard is what makes requirement 10 true by construction: the fixture cannot
 * select or address an arbitrary real person even if someone edits the sender by hand.
 */
const SAFE_SENDER_SUFFIXES = [".alloy.invalid", ".invalid", ".example", "@example.com"];

function assertSafeSender(address) {
    const a = String(address || "").trim().toLowerCase();
    if (!a) throw new Error("no sender address resolved");
    if (!SAFE_SENDER_SUFFIXES.some((s) => a.endsWith(s))) {
        throw new Error(
            `REFUSING to use sender ${a}: not a reserved, undeliverable certification domain. ` +
                `This fixture never addresses a real person.`,
        );
    }
    return a;
}

function readState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch {
        return { threads: [] };
    }
}

function writeState(s) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

async function main() {
    const args = process.argv.slice(2);
    const mode = args.includes("--cleanup") ? "cleanup" : args.includes("--status") ? "status" : "create";
    const keyArg = args.indexOf("--key");
    const runKey = keyArg >= 0 ? args[keyArg + 1] : "h2-cert-001";

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: STORAGE, baseURL: BASE });
    const page = await ctx.newPage();
    const getJson = async (p) => {
        const r = await page.request.get(`${BASE}${p}`);
        let b = null;
        try {
            b = await r.json();
        } catch {
            /* non-JSON */
        }
        return { status: r.status(), body: b };
    };
    const postJson = async (p, data) => {
        const r = await page.request.post(`${BASE}${p}`, { data });
        let b = null;
        try {
            b = await r.json();
        } catch {
            /* non-JSON */
        }
        return { status: r.status(), body: b };
    };

    // ── The Alloy-owned receiving address, read from the product, never hardcoded.
    const bindings = await getJson("/api/admin/communications/bindings");
    const emailBinding = (bindings.body?.bindings ?? []).find(
        (b) => b.channel === "email" && b.status === "active" && b.inbound_address,
    );
    if (!emailBinding) throw new Error("no active email binding on this tenant — cannot receive inbound");
    const receivingAddress = emailBinding.inbound_address;

    // ── The synthetic sender: an identity the platform already owns, on a reserved TLD.
    /*
     * "invalid" is the discovery token, not the safety check. `sanitizeSearchToken` strips dots, so
     * searching "alloy.invalid" finds nothing; "invalid" matches the reserved TLD inside the stored
     * address. What actually makes the choice safe is the email-suffix filter below and
     * `assertSafeSender` — the search term is only how the candidates are found.
     */
    const search = await getJson(`/api/admin/communications/person-search?q=invalid`);
    const candidates = (search.body?.persons ?? search.body?.people ?? search.body?.results ?? []).filter((p) =>
        String(p.email || "").toLowerCase().endsWith(".alloy.invalid"),
    );
    if (candidates.length === 0) {
        throw new Error(
            "no existing *.alloy.invalid certification identity found. This fixture deliberately does not " +
                "invent an address — seed the certification identities first.",
        );
    }
    const sender = candidates[0];
    const senderAddress = assertSafeSender(sender.email);

    const state = readState();

    if (mode === "status" || mode === "cleanup") {
        const convs = await getJson("/api/admin/communications/conversations");
        const all = convs.body?.conversations ?? [];
        const mine = all.filter((c) => state.threads.includes(c.id));
        for (const c of mine) {
            console.log(`fixture thread ${c.id} attention=${c.attention_state} scope=${c.scope_status}`);
        }
        if (mode === "cleanup") {
            for (const c of mine) {
                // Authoritative operator disposal — the same endpoint the Communications UI calls.
                const res = await postJson(`/api/admin/communications/conversations/${c.id}/triage`, {
                    action: "resolved",
                });
                console.log(`  resolved ${c.id} -> ${res.status} ${JSON.stringify(res.body)}`);
            }
        }
        await browser.close();
        return;
    }

    // ── Hand a synthetic received-email to the REAL ingestion chain.
    const emailId = `h2-cert-${runKey}`;
    const event = {
        email_id: emailId,
        from: senderAddress,
        to: [receivingAddress],
        cc: [],
        received_for: [receivingAddress],
        message_id: `<${emailId}@enrollment-cert.alloy.invalid>`,
        subject: "H2 certification — please confirm the enrollment paperwork",
        created_at: new Date().toISOString(),
        attachments: [],
    };
    const retrieval = {
        text:
            "Certification fixture message. Synthetic sender on a reserved, undeliverable domain. " +
            "No real recipient exists and nothing is sent outbound.",
        html: null,
        html_format: null,
        headers: { "Authentication-Results": "dmarc=pass" },
    };

    const res = await postJson("/api/admin/debug/certification/inbound-email", { event, retrieval });
    console.log("ingestion:", res.status, JSON.stringify(res.body));

    const threadId = res.body?.outcome?.threadId ?? null;
    if (threadId && !state.threads.includes(threadId)) {
        state.threads.push(threadId);
        writeState(state);
    }

    console.log("\n--- H2 FIXTURE ---");
    console.log("receiving address (Alloy-owned):", receivingAddress);
    console.log("synthetic sender (reserved TLD):", senderAddress, `[person ${sender.person_id}]`);
    console.log("thread:", threadId);
    console.log("outcome status:", res.body?.outcome?.status, "identified:", res.body?.outcome?.identified);

    if (threadId) {
        const convs = await getJson("/api/admin/communications/conversations");
        const c = (convs.body?.conversations ?? []).find((x) => x.id === threadId);
        console.log(
            "authoritative state:",
            c ? `attention=${c.attention_state} scope=${c.scope_status} entity=${c.primary_entity_type}` : "not in queue",
        );
    }
    await browser.close();
}

main().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(1);
});
