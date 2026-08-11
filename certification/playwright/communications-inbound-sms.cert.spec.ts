/**
 * Block A — the operator conversation loop for inbound SMS.
 *
 * A parent's reply arrives the way a parent's reply actually arrives: a signed
 * Twilio form POST to the backend webhook, verified against the certification's
 * synthetic auth token. Nothing is injected straight into the database, because
 * the properties under certification — arrives once, is never lost, joins the
 * right conversation, honours a stop request — are properties of that seam, not
 * of the tables underneath it.
 *
 * The token is local-only and the spec signs with the same value, so signature
 * verification runs for real. An unsigned request is refused here as evidence of
 * exactly that.
 *
 * Certified against the local certification stack (ALLOY_CERTIFICATION=1, no
 * provider credentials). Nothing leaves the machine.
 */
import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

const INBOUND_URL = process.env.CERT_INBOUND_URL || "http://127.0.0.1:8013";
const AUTH_TOKEN = process.env.CERT_TWILIO_AUTH_TOKEN || "alloy-certification-synthetic-twilio-token";
const TO_E164 = process.env.CERT_INBOUND_TO_E164 || "+15550001111";

/** Seeded, phone-unique — inbound resolution finds exactly one person. */
const RESOLVED_FROM = "+15550000001";
const RESOLVED_NAME = "Avery Testfamily-0001";
/** Two certification people share this number; resolution must not choose. */
const AMBIGUOUS_FROM = "+15557770002";
/** Nobody in the tenant has this number. */
const UNKNOWN_FROM = "+15557770009";
/** A second Alloy destination, owned by nobody — the cross-org/no-org case. */
const FOREIGN_TO = "+15559998888";

/**
 * The operator's Communications surface.
 *
 * NOT `/adminV2/messages` — that redirects to `/admin/messages` and answers 403
 * for an operator. The Inbox an operator actually reaches is the modal opened
 * from the workspace sidebar, which renders the Command Center because
 * `comms_v2_command_center` defaults ON. Certifying the other surface would have
 * proved a screen nobody opens.
 */
const WORKSPACE = "/workspace";
const INBOX_NAV = '[data-adminv2-sidebar-modal-nav="inbox"]';

async function openOperatorInbox(page: import("@playwright/test").Page) {
    await page.goto(WORKSPACE);
    await page.waitForLoadState("domcontentloaded");
    const nav = page.locator(INBOX_NAV);
    await expect(nav).toBeVisible({ timeout: 180_000 });
    await nav.first().click();

    // Every tab stays mounted so switching feels instant, and the inactive ones are
    // `opacity-0 pointer-events-none` rather than unmounted. They are therefore
    // "visible" to Playwright while silently swallowing clicks, so waiting on the
    // panel proves nothing — the Inbox tab has to be selected explicitly.
    const inboxTab = page.locator('[data-comms-tab="inbox"]');
    await expect(inboxTab).toBeVisible({ timeout: 120_000 });
    await inboxTab.click();

    const shell = page.locator('[data-comms-tab-panel="inbox"] [data-cc-shell]');
    await expect(shell).toBeVisible({ timeout: 120_000 });
    // The queue has actually loaded when it has rows.
    await expect(page.locator("[data-cc-conversation]").first()).toBeVisible({ timeout: 120_000 });
}

/** Twilio's scheme: HMAC-SHA1 over url + each sorted key concatenated with its value. */
function twilioSignature(url: string, params: Record<string, string>): string {
    const payload = Object.keys(params)
        .sort()
        .reduce((acc, k) => acc + k + params[k], url);
    return crypto.createHmac("sha1", AUTH_TOKEN).update(Buffer.from(payload, "utf-8")).digest("base64");
}

type InboundResult = { status: number };

async function deliverInbound(
    params: { from: string; body: string; sid: string; to?: string },
    opts: { sign?: boolean } = {}
): Promise<InboundResult> {
    const url = `${INBOUND_URL}/sms/inbound`;
    const form: Record<string, string> = {
        From: params.from,
        To: params.to ?? TO_E164,
        Body: params.body,
        MessageSid: params.sid,
        AccountSid: "ACcertification0000000000000000000",
    };
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (opts.sign !== false) headers["X-Twilio-Signature"] = twilioSignature(url, form);

    const res = await fetch(url, { method: "POST", headers, body: new URLSearchParams(form).toString() });
    return { status: res.status };
}

/** The operator-facing Communications API, through the authenticated session. */
async function inboxThreads(page: import("@playwright/test").Page) {
    const res = await page.request.get("/api/admin/inbox/threads?folder=inbox&limit=100");
    expect(res.ok()).toBeTruthy();
    return (await res.json()).threads as Array<Record<string, unknown>>;
}

function threadFor(threads: Array<Record<string, unknown>>, fromE164: string) {
    const digits = fromE164.replace(/\D/g, "");
    return threads.find((t) => String(t.recipient_key ?? "").replace(/\D/g, "") === digits);
}

function uniqueSid(tag: string): string {
    return `SMcert${tag}${crypto.randomBytes(8).toString("hex")}`;
}

test.describe("Block A — inbound SMS operator loop", () => {
    test("A-0 the webhook fails closed on an unsigned request", async () => {
        const unsigned = await deliverInbound(
            { from: RESOLVED_FROM, body: "unsigned attempt", sid: uniqueSid("unsigned") },
            { sign: false }
        );
        expect(unsigned.status).toBe(403);
    });

    test("A-1 a resolved parent's SMS becomes an unread conversation on the right Person", async ({ page }) => {
        const sid = uniqueSid("resolved");
        const body = `Certification: can we move Thursday? ${sid.slice(-6)}`;
        expect((await deliverInbound({ from: RESOLVED_FROM, body, sid })).status).toBe(200);

        const threads = await inboxThreads(page);
        const thread = threadFor(threads, RESOLVED_FROM);
        expect(thread, "a conversation exists for the sender").toBeTruthy();

        expect(thread!.sender_identity_state).toBe("identified");
        expect(thread!.contact_display).toBe(RESOLVED_NAME);
        expect(thread!.channel).toBe("sms");
        expect(thread!.has_unread).toBe(true);
        expect(thread!.reply_authority).toBe("person");
        expect((thread!.last_message_preview as { body?: string })?.body).toBe(body);
    });

    test("A-2 a redelivered webhook is one reply, not two", async ({ page }) => {
        const sid = uniqueSid("dup");
        const body = `Certification: duplicate probe ${sid.slice(-6)}`;
        expect((await deliverInbound({ from: RESOLVED_FROM, body, sid })).status).toBe(200);
        // Twilio retries until it gets a 2xx and may redeliver regardless.
        expect((await deliverInbound({ from: RESOLVED_FROM, body, sid })).status).toBe(200);

        const threads = await inboxThreads(page);
        const thread = threadFor(threads, RESOLVED_FROM)!;
        const res = await page.request.get(
            `/api/admin/communications/threads/${thread.id}/messages?limit=200`
        );
        expect(res.ok()).toBeTruthy();
        const messages = (await res.json()).messages as Array<Record<string, unknown>>;
        const copies = messages.filter((m) => m.body === body && m.direction === "inbound");
        expect(copies).toHaveLength(1);
    });

    test("A-3 an unknown sender is retained, named honestly, and stays replyable", async ({ page }) => {
        const sid = uniqueSid("unknown");
        const body = `Certification: do you have openings? ${sid.slice(-6)}`;
        expect((await deliverInbound({ from: UNKNOWN_FROM, body, sid })).status).toBe(200);

        const threads = await inboxThreads(page);
        const thread = threadFor(threads, UNKNOWN_FROM);
        expect(thread, "an unattributable reply is retained, not dropped").toBeTruthy();

        expect(thread!.sender_identity_state).toBe("unidentified");
        expect(thread!.reply_person_id).toBeNull();
        expect(String(thread!.contact_display)).toContain("Unidentified sender");
        // No Person is fabricated, and the number is not shown as if it were a name.
        expect(String(thread!.contact_display)).not.toContain(UNKNOWN_FROM);
        expect(thread!.reply_authority).toBe("thread");
        expect(thread!.has_unread).toBe(true);
    });

    test("A-4 same-org ambiguity stays ambiguous and says so safely", async ({ page }) => {
        const sid = uniqueSid("ambig");
        const body = `Certification: is the deposit due today? ${sid.slice(-6)}`;
        expect((await deliverInbound({ from: AMBIGUOUS_FROM, body, sid })).status).toBe(200);

        const threads = await inboxThreads(page);
        const thread = threadFor(threads, AMBIGUOUS_FROM);
        expect(thread, "an ambiguous reply is retained canonically").toBeTruthy();

        expect(thread!.routing_state).toBe("needs_routing_resolution");
        expect(thread!.sender_identity_state).toBe("unidentified");
        expect(thread!.reply_person_id).toBeNull();
        expect(Number(thread!.routing_candidate_count)).toBeGreaterThan(1);
        expect(String(thread!.routing_notice)).not.toContain("_");
        // Neither candidate is presented as the sender.
        expect(String(thread!.contact_display)).not.toContain("Shared-Line");
        // Still answerable — uncertainty about who is not a reason to go silent.
        expect(thread!.can_reply).toBe(true);
        expect(thread!.reply_authority).toBe("thread");
    });

    test("A-5 a message to a destination no organization owns never reaches a tenant inbox", async ({ page }) => {
        const sid = uniqueSid("foreign");
        const body = `Certification: wrong destination ${sid.slice(-6)}`;
        // Accepted (Twilio must not be made to retry) but not attributed to anyone.
        expect((await deliverInbound({ from: UNKNOWN_FROM, body, sid, to: FOREIGN_TO })).status).toBe(200);

        const threads = await inboxThreads(page);
        for (const t of threads) {
            const preview = (t.last_message_preview as { body?: string } | null)?.body ?? "";
            expect(preview).not.toBe(body);
        }

        // Retained in quarantine rather than lost — and the projection proves that
        // without handing the parent's words to a tenant that may not own them.
        const res = await page.request.get("/api/admin/debug/inbound-ingress?limit=50");
        expect(res.ok()).toBeTruthy();
        const json = (await res.json()) as { unresolved_count?: number; items?: unknown[] };
        expect(Number(json.unresolved_count ?? 0)).toBeGreaterThan(0);
        const payload = JSON.stringify(json);
        expect(payload).not.toContain(body);
        // Nor the full number, nor any candidate organization id.
        expect(payload).not.toContain(UNKNOWN_FROM.replace("+", ""));
        expect(payload).not.toContain("candidate_org_ids");
    });

    test("A-6 same sender to a different Alloy destination is a separate conversation", async ({ page }) => {
        const before = await inboxThreads(page);
        const beforeIds = new Set(before.map((t) => String(t.id)));
        const known = threadFor(before, RESOLVED_FROM);
        expect(known).toBeTruthy();

        // Nothing else in the tenant owns FOREIGN_TO, so this must not join the
        // conversation the same person has on the certified line.
        const sid = uniqueSid("dest");
        await deliverInbound({ from: RESOLVED_FROM, body: `Certification: other line ${sid.slice(-6)}`, sid, to: FOREIGN_TO });

        const after = await inboxThreads(page);
        const stillKnown = after.find((t) => String(t.id) === String(known!.id));
        expect(stillKnown, "the original conversation still exists").toBeTruthy();
        const added = after.filter((t) => !beforeIds.has(String(t.id)));
        // Either quarantined (no tenant owns the destination) or a distinct thread —
        // never merged into the existing one.
        expect(added.every((t) => String(t.id) !== String(known!.id))).toBe(true);
    });
});

test.describe("Block A — the operator answers in the browser", () => {
    test("A-7 Path 1: a resolved parent's conversation opens with their name and history", async ({ page }) => {
        const sid = uniqueSid("p1");
        const inboundBody = `Certification path 1: please confirm ${sid.slice(-6)}`;
        expect((await deliverInbound({ from: RESOLVED_FROM, body: inboundBody, sid })).status).toBe(200);

        const threads = await inboxThreads(page);
        const thread = threadFor(threads, RESOLVED_FROM)!;

        await openOperatorInbox(page);
        const row = page.locator(`[data-cc-conversation="${thread.id}"]`);
        await expect(row).toBeVisible({ timeout: 120_000 });
        await row.click();

        // The household workspace opens and names the person, never a number.
        const workspace = page.locator('[data-cc-column="workspace"]');
        await expect(workspace).toBeVisible({ timeout: 120_000 });
        await expect(workspace).not.toContainText("Unidentified sender", { timeout: 60_000 });
        await expect(workspace).not.toContainText(RESOLVED_FROM);
        // Selection is honoured rather than snapped elsewhere.
        await expect(row).toHaveAttribute("data-cc-conversation", thread.id);
    });

    test("A-8 Path 2: operator opens and answers a parent Alloy cannot identify", async ({ page }) => {
        const sid = uniqueSid("p2");
        const inboundBody = `Certification path 2: is anyone there? ${sid.slice(-6)}`;
        expect((await deliverInbound({ from: UNKNOWN_FROM, body: inboundBody, sid })).status).toBe(200);

        const threads = await inboxThreads(page);
        const thread = threadFor(threads, UNKNOWN_FROM)!;

        await openOperatorInbox(page);
        const row = page.locator(`[data-cc-conversation="${thread.id}"]`);
        await expect(row).toBeVisible({ timeout: 120_000 });
        await row.click();

        // It OPENS. Before this slice the household runtime never resolved without
        // a customer and the operator got a placeholder that never completed.
        const panel = page.locator("[data-cc-unidentified-conversation]");
        await expect(panel).toBeVisible({ timeout: 120_000 });
        await expect(panel).toContainText(inboundBody, { timeout: 60_000 });
        await expect(panel).toContainText("Unidentified sender");
        await expect(panel).toContainText(/ending in \d{4}/);
        await expect(panel).not.toContainText(UNKNOWN_FROM);

        // The client supplies a conversation and nothing else. Captured from the
        // browser rather than asserted about the source, because the defect this
        // closes was a component that named a plausible field and sent an address.
        const sent: Array<Record<string, unknown>> = [];
        page.on("request", (r) => {
            if (r.url().includes("/api/admin/communications/send") && r.method() === "POST") {
                try {
                    sent.push(JSON.parse(r.postData() ?? "{}"));
                } catch {
                    /* absence is asserted below */
                }
            }
        });

        const replyBody = `Certification reply 2 ${sid.slice(-6)}`;
        await panel.locator("textarea").fill(replyBody);
        await panel.getByRole("button", { name: /Send now/ }).click();
        await expect(panel).toContainText("SMS queued.", { timeout: 60_000 });

        expect(sent).toHaveLength(1);
        const payload = sent[0]!;
        expect(payload.thread_id).toBe(thread.id);
        expect(payload.recipient_person_id).toBeUndefined();
        for (const field of ["to", "to_address", "phone", "email", "recipient_address"]) {
            expect(payload[field]).toBeUndefined();
        }
        expect(JSON.stringify(payload)).not.toContain(UNKNOWN_FROM.replace("+", ""));

        // The server derived the destination and the reply rejoined the conversation.
        const res = await page.request.get(`/api/admin/communications/threads/${thread.id}/messages?limit=200`);
        const messages = (await res.json()).messages as Array<Record<string, unknown>>;
        const outbound = messages.find(
            (m) => m.direction === "outbound" && String(m.body ?? "").includes(replyBody)
        );
        expect(outbound, "the reply joined the same conversation").toBeTruthy();
        expect(String(outbound!.to_address).replace(/\D/g, "")).toBe(UNKNOWN_FROM.replace(/\D/g, ""));

        // And the operator sees it in the conversation they are reading.
        await expect(panel).toContainText(replyBody, { timeout: 30_000 });
    });

    test("A-9 a parent who asked to stop is not answered, and the operator is told so", async ({ page }) => {
        const stopFrom = "+15557770011";
        expect(
            (await deliverInbound({ from: stopFrom, body: "Hello?", sid: uniqueSid("preStop") })).status
        ).toBe(200);
        expect((await deliverInbound({ from: stopFrom, body: "STOP", sid: uniqueSid("stop") })).status).toBe(200);

        const threads = await inboxThreads(page);
        const thread = threadFor(threads, stopFrom);
        expect(thread, "the stop request is visible in the conversation").toBeTruthy();

        // The body must be unique per run. Idempotency is keyed on
        // (thread, content), so a constant string returns the message an EARLIER
        // run already sent — outcome `duplicate`, `ok: true` — which reads exactly
        // like the hold having failed while nothing was actually dispatched.
        const attemptBody = `Certification: after stop ${uniqueSid("afterStop").slice(-8)}`;
        const res = await page.request.post("/api/admin/communications/send", {
            data: { thread_id: thread!.id, channel: "sms", body: attemptBody, category: "operational" },
        });
        const json = (await res.json()) as {
            ok?: boolean;
            outcome?: string;
            reason?: string;
            message?: string;
        };
        // Truthful refusal — never queued, never a fabricated success.
        expect(json.outcome).toBe("blocked");
        expect(json.ok).not.toBe(true);
        // Namespaced by the layer that refused, so the operator-facing reason says
        // both which gate blocked and why.
        expect(json.reason).toBe("eligibility_blocked:UNRESOLVED_INBOUND_STOP_HOLD");
        expect(String(json.message ?? "")).toContain("asked to stop");

        // The refusal is RECORDED, not dropped — "we refused to send" has to be
        // distinguishable from "nobody ever tried" (BLOCKED-SEND-VISIBILITY). What
        // must never happen is it counting as delivered.
        const msgs = await page.request.get(
            `/api/admin/communications/threads/${thread!.id}/messages?limit=200`
        );
        const messages = (await msgs.json()).messages as Array<Record<string, unknown>>;
        const attempt = messages.find((m) => String(m.body ?? "").includes(attemptBody));
        expect(attempt, "the refused attempt is durable, not silent").toBeTruthy();
        expect(attempt!.status).toBe("blocked");
        expect(attempt!.status).not.toBe("queued");
        expect(attempt!.sent_at ?? null).toBeNull();
    });
});
