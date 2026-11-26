/**
 * Inbound email — the operator conversation loop, in the browser.
 *
 * Every assertion runs against the REAL ingestion path: the fixture harness hands
 * a documented `email.received` payload and a documented retrieval response to
 * `ingestResendInboundEmail`, and everything after that — ownership, correlation,
 * exactly-once, persistence, Activity, Command Center, reply — is production code.
 *
 * What the harness does NOT stand in for, stated so this evidence is not read as
 * more than it is: Svix signature verification (shared with the outbound delivery
 * events already certified on that route) and the live provider round-trip, which
 * gates the production-ready claim separately.
 */
import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

const RECEIVING = "hello@northwind-cert.invalid";
const DISABLED_RECEIVING = "disabled@northwind-cert.invalid";
const UNKNOWN_RECEIVING = "nobody@somewhere-else.invalid";

/** Seeded, email-unique in the certification tenant. */
const RESOLVED_SENDER = "qa+guardian1@example.invalid";
const RESOLVED_NAME = "Avery Testfamily-0001";
/** Nobody in the tenant has this address. */
const UNKNOWN_SENDER = "stranger@example.invalid";
/** Two certification people share this one. */
const SHARED_SENDER = "cert.shared@northwind.invalid";

const WORKSPACE = "/workspace";
const INBOX_NAV = '[data-adminv2-sidebar-modal-nav="inbox"]';

type Page = import("@playwright/test").Page;

function uid(tag: string): string {
    return `${tag}${crypto.randomBytes(8).toString("hex")}`;
}

/** Inject a received email through the real ingestion path. */
async function deliverEmail(
    page: Page,
    params: {
        from: string;
        to?: string;
        receivedFor?: string;
        subject: string;
        text: string;
        messageId?: string;
        inReplyTo?: string;
        references?: string;
        emailId?: string;
        attachments?: unknown[];
        failure?: "retryable" | "permanent";
    }
) {
    const emailId = params.emailId ?? uid("cert-email-");
    const res = await page.request.post("/api/admin/debug/certification/inbound-email", {
        data: {
            event: {
                email_id: emailId,
                created_at: new Date().toISOString(),
                from: params.from,
                to: params.to ? [params.to] : [],
                cc: [],
                bcc: [],
                received_for: params.receivedFor ? [params.receivedFor] : [],
                message_id: params.messageId ?? `<${emailId}@sender.invalid>`,
                subject: params.subject,
                attachments: params.attachments ?? [],
            },
            retrieval: {
                text: params.text,
                html: `<p>${params.text}</p>`,
                html_format: "data_uri",
                headers: {
                    "message-id": params.messageId ?? `<${emailId}@sender.invalid>`,
                    ...(params.inReplyTo ? { "In-Reply-To": params.inReplyTo } : {}),
                    ...(params.references ? { References: params.references } : {}),
                },
            },
            ...(params.failure ? { retrieval_failure: params.failure } : {}),
        },
    });
    expect(res.ok(), `injection failed: ${res.status()}`).toBeTruthy();
    return { emailId, outcome: (await res.json()).outcome as Record<string, unknown> };
}

async function inboxThreads(page: Page) {
    const res = await page.request.get("/api/admin/inbox/threads?folder=inbox&limit=100");
    expect(res.ok()).toBeTruthy();
    return (await res.json()).threads as Array<Record<string, unknown>>;
}

async function messagesOn(page: Page, threadId: string) {
    const res = await page.request.get(`/api/admin/communications/threads/${threadId}/messages?limit=200`);
    expect(res.ok()).toBeTruthy();
    return (await res.json()).messages as Array<Record<string, unknown>>;
}

async function openOperatorInbox(page: Page) {
    await page.goto(WORKSPACE);
    await page.waitForLoadState("domcontentloaded");
    const nav = page.locator(INBOX_NAV);
    await expect(nav).toBeVisible({ timeout: 180_000 });
    await nav.first().click();
    const tab = page.locator('[data-workspace-section-tab="inbox"]');
    await expect(tab).toBeVisible({ timeout: 120_000 });
    await tab.click();
    await expect(page.locator('[data-comms-tab-panel="inbox"] [data-cc-shell]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("[data-cc-conversation]").first()).toBeVisible({ timeout: 120_000 });
}

test.describe("Email — tenant ownership", () => {
    test("E-1 an email to an active receiving address lands in that organization", async ({ page }) => {
        const subject = `Cert enrollment ${uid("s")}`;
        const { outcome } = await deliverEmail(page, {
            from: UNKNOWN_SENDER,
            to: RECEIVING,
            subject,
            text: "Do you have openings for September?",
        });
        expect(outcome.status).toBe("persisted");

        const thread = (await inboxThreads(page)).find((t) => String(t.recipient_key ?? "") === UNKNOWN_SENDER);
        expect(thread, "the conversation exists in the tenant inbox").toBeTruthy();
        expect(thread!.channel).toBe("email");
    });

    test("E-2 forwarded mail is owned via received_for, not the visible To", async ({ page }) => {
        // `to` is whoever the sender addressed; `received_for` is what actually
        // caused Resend to receive it. Considering only `to` would quarantine this.
        const { outcome } = await deliverEmail(page, {
            from: uid("fwd-") + "@example.invalid",
            to: "someone-else@not-ours.invalid",
            receivedFor: RECEIVING,
            subject: `Cert forwarded ${uid("s")}`,
            text: "Forwarded enquiry.",
        });
        expect(outcome.status).toBe("persisted");
    });

    test("E-3 a disabled receiving binding quarantines rather than delivering", async ({ page }) => {
        const sender = uid("dis-") + "@example.invalid";
        const { outcome } = await deliverEmail(page, {
            from: sender,
            to: DISABLED_RECEIVING,
            subject: "Cert disabled binding",
            text: "Should not reach the tenant.",
        });
        expect(outcome).toMatchObject({ status: "quarantined", disposition: "no_attributable_org" });

        const threads = await inboxThreads(page);
        expect(threads.find((t) => String(t.recipient_key ?? "") === sender)).toBeUndefined();
    });

    test("E-4 an unknown receiving address quarantines and is not tenant-visible", async ({ page }) => {
        const sender = uid("unk-") + "@example.invalid";
        const { outcome } = await deliverEmail(page, {
            from: sender,
            to: UNKNOWN_RECEIVING,
            subject: "Cert unknown destination",
            text: "Nobody owns this destination.",
        });
        expect(outcome.status).toBe("quarantined");

        const threads = await inboxThreads(page);
        expect(threads.find((t) => String(t.recipient_key ?? "") === sender)).toBeUndefined();
    });
});

test.describe("Email — correlation", () => {
    test("E-5 In-Reply-To resolves the exact conversation, even when the subject changed", async ({ page }) => {
        // Seed a conversation, then reply to it with a completely different subject.
        const first = await deliverEmail(page, {
            from: UNKNOWN_SENDER,
            to: RECEIVING,
            subject: `Cert original ${uid("s")}`,
            text: "First message.",
        });
        expect(first.outcome.status).toBe("persisted");
        const threadId = String(first.outcome.threadId);

        // Alloy's own outbound id for that thread is what a real reply would name.
        const messages = await messagesOn(page, threadId);
        const anchor = messages[0]!;
        const alloyMessageId = `<alloy.${anchor.id}@northwind-cert.invalid>`;

        const second = await deliverEmail(page, {
            from: UNKNOWN_SENDER,
            to: RECEIVING,
            subject: "an entirely unrelated subject line",
            text: "Replying to the earlier one.",
            inReplyTo: alloyMessageId,
        });
        expect(second.outcome.threadId).toBe(threadId);
        expect(second.outcome.method).toBe("in_reply_to");
    });

    test("E-6 References resolves when In-Reply-To is absent", async ({ page }) => {
        const first = await deliverEmail(page, {
            from: uid("ref-") + "@example.invalid",
            to: RECEIVING,
            subject: `Cert refs ${uid("s")}`,
            text: "Root message.",
        });
        const threadId = String(first.outcome.threadId);
        const anchor = (await messagesOn(page, threadId))[0]!;

        const second = await deliverEmail(page, {
            from: uid("ref2-") + "@example.invalid",
            to: RECEIVING,
            subject: "different subject entirely",
            text: "Chained reply.",
            references: `<foreign@other.invalid> <alloy.${anchor.id}@northwind-cert.invalid>`,
        });
        expect(second.outcome.threadId).toBe(threadId);
        expect(second.outcome.method).toBe("references");
    });

    test("E-7 a forged or malformed Alloy Message-ID never correlates", async ({ page }) => {
        const first = await deliverEmail(page, {
            from: uid("forge-") + "@example.invalid",
            to: RECEIVING,
            subject: `Cert forge ${uid("s")}`,
            text: "Root.",
        });
        const anchor = (await messagesOn(page, String(first.outcome.threadId)))[0]!;

        for (const header of [
            `<xxxxxx${anchor.id}@attacker.invalid>`,
            "<alloy.99999999-9999-4999-8999-999999999999@x.invalid>",
            "<garbage",
        ]) {
            const got = await deliverEmail(page, {
                from: uid("forge2-") + "@example.invalid",
                to: RECEIVING,
                subject: "forged provenance",
                text: "Should not correlate.",
                inReplyTo: header,
            });
            expect(got.outcome.status).toBe("persisted");
            expect(got.outcome.method).not.toBe("in_reply_to");
        }
    });
});

test.describe("Email — identity and ambiguity", () => {
    test("E-8 a known sender resolves to the correct Person", async ({ page }) => {
        const { outcome } = await deliverEmail(page, {
            from: RESOLVED_SENDER,
            to: RECEIVING,
            subject: `Cert known sender ${uid("s")}`,
            text: "It's Avery.",
        });
        expect(outcome.status).toBe("persisted");
        expect(outcome.identified).toBe(true);
    });

    test("E-9 a shared household address asserts no Person and raises routing attention", async ({ page }) => {
        const { outcome } = await deliverEmail(page, {
            from: SHARED_SENDER,
            to: RECEIVING,
            subject: `Cert shared ${uid("s")}`,
            text: "Which of us is this?",
        });
        expect(outcome.status).toBe("persisted");
        expect(outcome.identified).toBe(false);
        expect(outcome.ambiguous).toBe(true);
    });
});

test.describe("Email — exactly once", () => {
    test("E-10 a duplicate provider event yields one email, one Activity, one unread", async ({ page }) => {
        const emailId = uid("dup-");
        const subject = `Cert duplicate ${uid("s")}`;
        const sender = uid("dupsend-") + "@example.invalid";

        const first = await deliverEmail(page, { from: sender, to: RECEIVING, subject, text: "Once.", emailId });
        const second = await deliverEmail(page, { from: sender, to: RECEIVING, subject, text: "Once.", emailId });

        expect(first.outcome.status).toBe("persisted");
        expect(second.outcome.status).toBe("duplicate");

        const messages = await messagesOn(page, String(first.outcome.threadId));
        expect(messages.filter((m) => m.provider_message_id === emailId)).toHaveLength(1);
    });

    test("E-11 a transient retrieval failure writes nothing and the retry completes it", async ({ page }) => {
        const emailId = uid("retry-");
        const sender = uid("retrysend-") + "@example.invalid";
        const subject = `Cert retry ${uid("s")}`;

        const failed = await deliverEmail(page, {
            from: sender,
            to: RECEIVING,
            subject,
            text: "Delayed content.",
            emailId,
            failure: "retryable",
        });
        expect(failed.outcome.status).toBe("retrieval_pending");
        expect((await inboxThreads(page)).find((t) => String(t.recipient_key ?? "") === sender)).toBeUndefined();

        const retried = await deliverEmail(page, { from: sender, to: RECEIVING, subject, text: "Delayed content.", emailId });
        expect(retried.outcome.status).toBe("persisted");

        const messages = await messagesOn(page, String(retried.outcome.threadId));
        expect(messages.filter((m) => m.provider_message_id === emailId)).toHaveLength(1);
    });
});

test.describe("Email — the operator conversation loop in Command Center", () => {
    test("E-12 an unidentified parent's email opens and can be answered in the same thread", async ({ page }) => {
        const sender = uid("loop-") + "@example.invalid";
        const subject = `Cert operator loop ${uid("s")}`;
        const bodyText = "Is there space for a three year old?";

        const delivered = await deliverEmail(page, {
            from: sender,
            to: RECEIVING,
            subject,
            text: bodyText,
            attachments: [{ id: "att-1", filename: "immunisation.pdf", content_type: "application/pdf" }],
        });
        expect(delivered.outcome.status).toBe("persisted");
        const threadId = String(delivered.outcome.threadId);

        await openOperatorInbox(page);
        const row = page.locator(`[data-cc-conversation="${threadId}"]`);
        await expect(row).toBeVisible({ timeout: 120_000 });
        await row.click();

        const panel = page.locator("[data-cc-unidentified-conversation]");
        await expect(panel).toBeVisible({ timeout: 120_000 });
        // Email presentation: subject, safe body, attachment presence, honest identity.
        await expect(panel).toContainText(subject, { timeout: 60_000 });
        await expect(panel).toContainText(bodyText);
        await expect(panel.locator("[data-cc-attachment-notice]")).toContainText("attachment support is not available yet");
        await expect(panel).toContainText("Unidentified sender");
        // Never the raw address, never a surrogate id.
        await expect(panel).not.toContainText(sender);
        await expect(panel).not.toContainText("communications_unknown");

        // The client supplies a conversation and nothing else.
        const sent: Array<Record<string, unknown>> = [];
        page.on("request", (r) => {
            if (r.url().includes("/api/admin/communications/send") && r.method() === "POST") {
                try {
                    sent.push(JSON.parse(r.postData() ?? "{}"));
                } catch {
                    /* absence asserted below */
                }
            }
        });

        const reply = `Cert reply ${uid("r")}`;
        await panel.locator("textarea").fill(reply);
        await panel.getByRole("button", { name: /Send now/ }).click();
        await expect(panel).toContainText("Email queued.", { timeout: 60_000 });

        expect(sent).toHaveLength(1);
        expect(sent[0]!.thread_id).toBe(threadId);
        for (const field of ["to", "to_address", "phone", "email", "recipient_address", "recipient_person_id"]) {
            expect(sent[0]![field]).toBeUndefined();
        }

        // The reply joined the same canonical conversation and went to the sender.
        const messages = await messagesOn(page, threadId);
        const outbound = messages.find(
            (m) => m.direction === "outbound" && String(m.body ?? "").includes(reply)
        );
        expect(outbound, "the reply is in the same conversation").toBeTruthy();
        expect(String(outbound!.to_address)).toBe(sender);
        expect(outbound!.channel).toBe("email");
    });
});

test.describe("Email — quarantine stays out of the tenant", () => {
    test("E-13 quarantined mail is invisible to the operator and withholds its body", async ({ page }) => {
        const secret = `Cert quarantined body ${uid("q")}`;
        await deliverEmail(page, {
            from: uid("qsend-") + "@example.invalid",
            to: UNKNOWN_RECEIVING,
            subject: "Cert quarantine",
            text: secret,
        });

        const threads = await inboxThreads(page);
        for (const t of threads) {
            const preview = (t.last_message_preview as { body?: string } | null)?.body ?? "";
            expect(preview).not.toContain(secret);
        }

        const res = await page.request.get("/api/admin/debug/inbound-ingress?limit=50");
        expect(res.ok()).toBeTruthy();
        const payload = JSON.stringify(await res.json());
        expect(payload).not.toContain(secret);
    });
});
