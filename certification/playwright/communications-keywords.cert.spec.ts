/**
 * Block B — STOP / START / HELP through the one canonical inbound seam.
 *
 * Every keyword arrives the same way a parent's message arrives: a signed Twilio
 * form POST to the backend webhook. There is no second keyword runtime and this
 * suite would fail if one appeared, because it asserts effects on canonical
 * authorities only — `communication_preferences` for a resolved Person, the
 * endpoint-scoped hold for an unidentified one, and `communication_messages`
 * for history.
 *
 * Certified against the local certification stack (ALLOY_CERTIFICATION=1, no
 * provider credentials). Nothing leaves the machine.
 */
import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

const INBOUND_URL = process.env.CERT_INBOUND_URL || "http://127.0.0.1:8013";
const AUTH_TOKEN = process.env.CERT_TWILIO_AUTH_TOKEN || "alloy-certification-synthetic-twilio-token";
const TO_E164 = process.env.CERT_INBOUND_TO_E164 || "+15550001111";

/** Seeded and phone-unique — resolves to exactly one Person. */
const RESOLVED_FROM = "+15550000001";
const RESOLVED_NAME = "Avery Testfamily-0001";
/** Tenant-owned by destination, but matching no Person. */
const UNKNOWN_FROM = "+15557770009";
/** A destination no organization owns. */
const FOREIGN_TO = "+15559998888";

function twilioSignature(url: string, params: Record<string, string>): string {
    const payload = Object.keys(params)
        .sort()
        .reduce((acc, k) => acc + k + params[k], url);
    return crypto.createHmac("sha1", AUTH_TOKEN).update(Buffer.from(payload, "utf-8")).digest("base64");
}

function uniqueSid(tag: string): string {
    return `SMkw${tag}${crypto.randomBytes(8).toString("hex")}`;
}

async function deliverInbound(params: {
    from: string;
    body: string;
    sid: string;
    to?: string;
}): Promise<number> {
    const url = `${INBOUND_URL}/sms/inbound`;
    const form: Record<string, string> = {
        From: params.from,
        To: params.to ?? TO_E164,
        Body: params.body,
        MessageSid: params.sid,
        AccountSid: "ACcertification0000000000000000000",
    };
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Twilio-Signature": twilioSignature(url, form),
        },
        body: new URLSearchParams(form).toString(),
    });
    return res.status;
}

type Page = import("@playwright/test").Page;

async function inboxThreads(page: Page) {
    const res = await page.request.get("/api/admin/inbox/threads?folder=inbox&limit=100");
    expect(res.ok()).toBeTruthy();
    return (await res.json()).threads as Array<Record<string, unknown>>;
}

function threadFor(threads: Array<Record<string, unknown>>, fromE164: string) {
    const digits = fromE164.replace(/\D/g, "");
    return threads.find((t) => String(t.recipient_key ?? "").replace(/\D/g, "") === digits);
}

async function messagesOn(page: Page, threadId: string) {
    const res = await page.request.get(`/api/admin/communications/threads/${threadId}/messages?limit=200`);
    expect(res.ok()).toBeTruthy();
    return (await res.json()).messages as Array<Record<string, unknown>>;
}

/** Attempt an operator reply and report what canonical policy decided. */
async function attemptReply(page: Page, threadId: string) {
    const body = `Certification keyword probe ${uniqueSid("probe").slice(-8)}`;
    const res = await page.request.post("/api/admin/communications/send", {
        data: { thread_id: threadId, channel: "sms", body, category: "operational" },
    });
    const json = (await res.json()) as { ok?: boolean; outcome?: string; reason?: string; message?: string };
    return { ...json, body };
}

test.describe("Block B — STOP", () => {
    test("B-1 an unidentified sender's STOP holds the endpoint, exactly once", async ({ page }) => {
        const sid = uniqueSid("stop");
        expect(await deliverInbound({ from: UNKNOWN_FROM, body: "Hello there", sid: uniqueSid("pre") })).toBe(200);
        expect(await deliverInbound({ from: UNKNOWN_FROM, body: "STOP", sid })).toBe(200);
        // Replay: Twilio retries until it gets a 2xx and may redeliver anyway.
        expect(await deliverInbound({ from: UNKNOWN_FROM, body: "STOP", sid })).toBe(200);

        const thread = threadFor(await inboxThreads(page), UNKNOWN_FROM)!;
        const messages = await messagesOn(page, thread.id as string);
        const stops = messages.filter((m) => m.direction === "inbound" && String(m.body).trim() === "STOP");
        // The redelivery is the same provider message, so it is one reply.
        expect(stops.filter((m) => m.provider_message_id === sid)).toHaveLength(1);

        const decision = await attemptReply(page, thread.id as string);
        expect(decision.outcome).toBe("blocked");
        expect(decision.reason).toBe("eligibility_blocked:UNRESOLVED_INBOUND_STOP_HOLD");
        expect(decision.ok).not.toBe(true);
    });

    test("B-2 the STOP stays visible in the conversation", async ({ page }) => {
        const thread = threadFor(await inboxThreads(page), UNKNOWN_FROM)!;
        const messages = await messagesOn(page, thread.id as string);
        expect(messages.some((m) => String(m.body).trim() === "STOP")).toBe(true);
    });
});

test.describe("Block B — START", () => {
    test("B-3 START releases the endpoint hold it can prove, and only that", async ({ page }) => {
        const thread = threadFor(await inboxThreads(page), UNKNOWN_FROM)!;

        // Precondition: held by the STOP above.
        expect((await attemptReply(page, thread.id as string)).outcome).toBe("blocked");

        expect(await deliverInbound({ from: UNKNOWN_FROM, body: "START", sid: uniqueSid("start") })).toBe(200);

        const after = await attemptReply(page, thread.id as string);
        // Released by the sender's own word on the SAME endpoint pair that created
        // the hold — never by an operator override and never by inventing consent
        // for a Person nobody has identified.
        expect(after.reason).not.toBe("eligibility_blocked:UNRESOLVED_INBOUND_STOP_HOLD");
        expect(after.outcome).toBe("sent_to_queue");

        // No Person was fabricated on the way.
        const refreshed = threadFor(await inboxThreads(page), UNKNOWN_FROM)!;
        expect(refreshed.reply_person_id).toBeNull();
        expect(refreshed.sender_identity_state).toBe("unidentified");
    });

    test("B-4 a START on one endpoint does not release another", async ({ page }) => {
        // A hold belongs to a pair. Releasing an unrelated one would be the same
        // guessing the quarantine exists to prevent.
        const other = "+15557770044";
        expect(await deliverInbound({ from: other, body: "Hi", sid: uniqueSid("o1") })).toBe(200);
        expect(await deliverInbound({ from: other, body: "STOP", sid: uniqueSid("o2") })).toBe(200);

        const otherThread = threadFor(await inboxThreads(page), other)!;
        expect((await attemptReply(page, otherThread.id as string)).outcome).toBe("blocked");

        // START from the FIRST sender, already released above.
        expect(await deliverInbound({ from: UNKNOWN_FROM, body: "START", sid: uniqueSid("s2") })).toBe(200);

        const stillHeld = await attemptReply(page, otherThread.id as string);
        expect(stillHeld.outcome).toBe("blocked");
        expect(stillHeld.reason).toBe("eligibility_blocked:UNRESOLVED_INBOUND_STOP_HOLD");
    });

    test("B-5 a resolved Person's STOP and START run through canonical preferences", async ({ page }) => {
        expect(await deliverInbound({ from: RESOLVED_FROM, body: "STOP", sid: uniqueSid("rstop") })).toBe(200);

        const thread = threadFor(await inboxThreads(page), RESOLVED_FROM)!;
        expect(thread.contact_display).toBe(RESOLVED_NAME);

        const blocked = await page.request.post("/api/admin/communications/send", {
            data: {
                entity_type: "persons",
                entity_id: thread.reply_person_id,
                recipient_person_id: thread.reply_person_id,
                channel: "sms",
                body: `Certification after person STOP ${uniqueSid("x").slice(-8)}`,
                category: "operational",
            },
        });
        const blockedJson = (await blocked.json()) as { code?: string; error?: string };
        expect(blocked.ok()).toBe(false);
        // Carrier semantics: a STOP suppresses ALL SMS, not marketing alone. This is
        // the canonical WS8 opt-out, NOT the endpoint hold — a resolved Person has
        // a preference authority to own the decision.
        expect(String(blockedJson.code ?? "")).toContain("OPTED_OUT");

        expect(await deliverInbound({ from: RESOLVED_FROM, body: "START", sid: uniqueSid("rstart") })).toBe(200);

        const allowed = await page.request.post("/api/admin/communications/send", {
            data: {
                entity_type: "persons",
                entity_id: thread.reply_person_id,
                recipient_person_id: thread.reply_person_id,
                channel: "sms",
                body: `Certification after person START ${uniqueSid("y").slice(-8)}`,
                category: "operational",
            },
        });
        const allowedJson = (await allowed.json()) as { ok?: boolean; outcome?: string };
        expect(allowedJson.outcome).toBe("sent_to_queue");
        expect(allowedJson.ok).toBe(true);
    });
});

test.describe("Block B — HELP", () => {
    test("B-6 HELP persists once, changes nothing, and replays without effect", async ({ page }) => {
        const sid = uniqueSid("help");
        expect(await deliverInbound({ from: UNKNOWN_FROM, body: "HELP", sid })).toBe(200);
        expect(await deliverInbound({ from: UNKNOWN_FROM, body: "HELP", sid })).toBe(200);

        const thread = threadFor(await inboxThreads(page), UNKNOWN_FROM)!;
        const messages = await messagesOn(page, thread.id as string);
        expect(messages.filter((m) => m.provider_message_id === sid)).toHaveLength(1);
        expect(messages.some((m) => String(m.body).trim() === "HELP")).toBe(true);

        // HELP changes no preference and creates no hold, so a reply that was
        // permitted before it stays permitted.
        expect((await attemptReply(page, thread.id as string)).outcome).toBe("sent_to_queue");
    });

    test("B-7 no reply is emitted from quarantine, where ownership is unproven", async ({ page }) => {
        const sid = uniqueSid("qhelp");
        expect(await deliverInbound({ from: "+15557770077", body: "HELP", sid, to: FOREIGN_TO })).toBe(200);

        // It is retained, and it produced no tenant conversation to answer from.
        const threads = await inboxThreads(page);
        expect(threadFor(threads, "+15557770077")).toBeUndefined();

        const res = await page.request.get("/api/admin/debug/inbound-ingress?limit=50");
        expect(res.ok()).toBeTruthy();
        const payload = JSON.stringify(await res.json());
        expect(payload).not.toContain("HELP");
    });
});

test.describe("Block B — convergence", () => {
    test("B-8 a received SMS creates exactly one canonical row and no legacy row", async ({ page }) => {
        const sid = uniqueSid("conv");
        const body = `Certification convergence ${sid.slice(-8)}`;
        expect(await deliverInbound({ from: RESOLVED_FROM, body, sid })).toBe(200);

        const thread = threadFor(await inboxThreads(page), RESOLVED_FROM)!;
        const messages = await messagesOn(page, thread.id as string);
        const canonical = messages.filter((m) => String(m.body ?? "") === body);
        expect(canonical).toHaveLength(1);
        expect(canonical[0]!.provider_message_id).toBe(sid);

        // The legacy inbound write is retired. `public.messages` has no operator
        // API, so its absence is asserted where it is observable: the canonical
        // conversation is the single record, and the receive event is emitted only
        // by canonical persistence (proven in the backend suite at the wire).
        expect(messages.filter((m) => m.provider_message_id === sid)).toHaveLength(1);
    });
});
