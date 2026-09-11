/**
 * The SAFE Communications certification scenario for Work Items H2.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES, AND WHY
 * ---------------------------------------------------------------------------
 *
 * `web/scripts/createCommunicationsNeedsReplyQaFixture.ts` manufactured Work Items
 * eligibility by picking the tenant's most recent conversation and service-role
 * writing `attention_state = 'needs_response'` onto it. Three things were wrong with
 * that, and only the third is about safety:
 *
 *   1. It proved nothing. The projection was fed a value the fixture had written, so
 *      a run stayed green even if the Communications runtime had stopped producing
 *      actionable state at all. The authority under certification was the fixture.
 *   2. It was not repeatable. "Most recent thread" is whatever the last spec touched.
 *   3. Hosted candidate threads hold real external correspondence. Flipping a real
 *      family's conversation into Needs Reply — and later restoring a remembered
 *      prior value — edits a customer's record to stage a test.
 *
 * This scenario inverts all three: it DELIVERS A MESSAGE and lets the Communications
 * runtime decide. `attention_state` is never written here. If step 7 of
 * `ingestResendInboundEmail` stops writing `needs_response`, this scenario fails —
 * which is the whole point of having it.
 *
 * ---------------------------------------------------------------------------
 * WHY NOTHING REACHES A PERSON
 * ---------------------------------------------------------------------------
 *
 * Four independent reasons, so that no single mistake is load-bearing:
 *
 *   · The identity is `qa+guardian7@example.invalid` — seeded by
 *     `supabase/seed/local_representative_seed.sql`, synthetic by construction, and on
 *     the RFC 2606 reserved `.invalid` TLD, which has no nameserver anywhere.
 *   · The receiving identity is `hello@northwind-cert.invalid`, declared by
 *     `certification/inbound-sms-binding.sql` as certification ENVIRONMENT.
 *   · The tenant's Resend binding holds `certification_synthetic_email`, a credential
 *     ref that resolves to no secret. See `resendConnection.ts` — under
 *     ALLOY_CERTIFICATION there is no code path to api.resend.com.
 *   · Inbound ingestion sends nothing. The only outbound in the chain is the operator
 *     reply, which is addressed to the `.invalid` sender above.
 *
 * ---------------------------------------------------------------------------
 * REPEATABILITY
 * ---------------------------------------------------------------------------
 *
 * Every arming delivers a NEW provider message id, so exactly-once never suppresses
 * it. Correlation binds them to ONE thread (the sender/receiving endpoint pair is
 * stable), so repeated runs re-arm the same conversation rather than littering the
 * queue — and step 7 re-writes `needs_response` on a genuine insert whether the
 * thread was created or correlated. `cleanupScenario` returns that conversation to
 * `resolved` THROUGH THE OPERATOR TRIAGE ROUTE, which is also how a real operator
 * ends it. There is no teardown path here that writes a column directly.
 */
import { expect, type Page } from "@playwright/test";
import crypto from "node:crypto";

/** Certification receiving identity. Environment, from `inbound-sms-binding.sql`. */
export const CERT_RECEIVING_ADDRESS = "hello@northwind-cert.invalid";

/**
 * The synthetic QA guardian this scenario speaks as.
 *
 * Seeded, email-unique in the tenant, and linked to household "Test Family 0007" via
 * `customer_persons` — so identity resolves to exactly one Person and the thread is an
 * IDENTIFIED family conversation, which is the shape Work Items projects. Guardian 1 is
 * deliberately avoided: `communications-inbound-email.cert.spec.ts` already drives it,
 * and two specs sharing one correlated thread is how fixtures start moving underneath
 * each other.
 */
export const CERT_QA_SENDER = "qa+guardian7@example.invalid";

/** Written into every body so certification data is identifiable in the tenant. */
export const SCENARIO_MARKER = "ALLOY-CERT-WI-H2";

const INJECT_URL = "/api/admin/debug/certification/inbound-email";
const CONVERSATIONS_URL = "/api/admin/communications/conversations";
const OPERATIONAL_TASKS_URL = "/api/admin/operational-tasks?scope=workspace&filter=open";

export const COMMUNICATIONS_WORK_ITEM_PREFIX = "communications:";

export type ArmedScenario = {
    threadId: string;
    /** The id Work Items projects. Composed here exactly as the product composes it. */
    workItemId: string;
    messageId: string;
    emailId: string;
    subject: string;
    /** Unique per arming — the only place this string exists is on this thread. */
    marker: string;
};

export type AuthoritativeConversation = {
    id: string;
    attention_state: string | null;
    unread?: number | null;
    unread_count?: number | null;
    channel?: string | null;
    recipient_key?: string | null;
    [key: string]: unknown;
};

function uid(tag: string): string {
    return `${tag}${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Deliver one inbound email through the REAL ingestion path.
 *
 * The harness stands in for the provider's webhook envelope and its retrieval
 * response and for nothing else — ownership, admission, correlation, identity,
 * persistence, the receive event and the attention write are all production code.
 */
export async function armNeedsReply(page: Page, options?: { subject?: string }): Promise<ArmedScenario> {
    const marker = uid(`${SCENARIO_MARKER}-`);
    const emailId = uid("wi-h2-email-");
    const subject = options?.subject ?? `Certification enrollment question ${marker}`;
    const text = `${marker} — synthetic certification message. Could we discuss September availability?`;
    const messageId = `<${emailId}@qa-sender.invalid>`;

    const res = await page.request.post(INJECT_URL, {
        data: {
            event: {
                email_id: emailId,
                created_at: new Date().toISOString(),
                from: CERT_QA_SENDER,
                to: [CERT_RECEIVING_ADDRESS],
                cc: [],
                bcc: [],
                received_for: [CERT_RECEIVING_ADDRESS],
                message_id: messageId,
                subject,
                attachments: [],
            },
            retrieval: {
                text,
                html: `<p>${text}</p>`,
                html_format: "data_uri",
                headers: { "message-id": messageId },
            },
        },
    });
    expect(res.ok(), `inbound injection failed: ${res.status()}`).toBeTruthy();

    const outcome = (await res.json()).outcome as Record<string, unknown>;
    // `persisted` and `identified` are assertions, not conveniences. A quarantine or an
    // unidentified sender would still produce a thread-shaped object for the caller to
    // certify against, and it would be the wrong conversation entirely.
    expect(outcome.status, `ingestion did not persist: ${JSON.stringify(outcome)}`).toBe("persisted");
    expect(outcome.identified, "the synthetic QA guardian must resolve to exactly one Person").toBe(true);
    expect(outcome.ambiguous, "the scenario thread must not be routing-ambiguous").toBe(false);

    const threadId = String(outcome.threadId);
    return {
        threadId,
        workItemId: `${COMMUNICATIONS_WORK_ITEM_PREFIX}${threadId}`,
        messageId: String(outcome.messageId),
        emailId,
        subject,
        marker,
    };
}

/** The Communications authority's own view of a conversation. */
export async function conversationFromAuthority(
    page: Page,
    threadId: string,
): Promise<AuthoritativeConversation | undefined> {
    const res = await page.request.get(CONVERSATIONS_URL);
    expect(res.ok(), `conversations query failed: ${res.status()}`).toBeTruthy();
    const conversations = (await res.json()).conversations as AuthoritativeConversation[];
    return conversations.find((c) => c.id === threadId);
}

export async function messagesOn(page: Page, threadId: string): Promise<Array<Record<string, unknown>>> {
    const res = await page.request.get(`/api/admin/communications/threads/${threadId}/messages?limit=200`);
    expect(res.ok()).toBeTruthy();
    return (await res.json()).messages as Array<Record<string, unknown>>;
}

/**
 * Every open operational_tasks row the workspace would show.
 *
 * This is the list Work Items loads from the DATABASE, before any projection is merged
 * into it — so "the scenario's id is absent here but present in the queue" is the proof
 * that the row is virtual and no operational task was fabricated.
 */
export async function operationalTaskIds(page: Page): Promise<string[]> {
    const res = await page.request.get(OPERATIONAL_TASKS_URL);
    expect(res.ok(), `operational tasks query failed: ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { tasks?: Array<{ id?: unknown }> };
    return (body.tasks ?? []).map((t) => String(t.id ?? ""));
}

/** Mark every inbound message on the thread read — the operator's own read-receipt route. */
export async function markThreadRead(page: Page, threadId: string): Promise<void> {
    const inbound = (await messagesOn(page, threadId))
        .filter((m) => String(m.direction ?? "") === "inbound")
        .map((m) => String(m.id));
    if (inbound.length === 0) return;
    const res = await page.request.post("/api/admin/communications/messages/mark-read", {
        data: { message_ids: inbound },
    });
    expect(res.ok(), `mark-read failed: ${res.status()}`).toBeTruthy();
}

/**
 * Resolve the conversation through the operator triage authority.
 *
 * This is the ONLY way this scenario ever changes `attention_state`, and it is the same
 * route the Resolved control in the Command Center posts to.
 */
export async function resolveThroughTriage(page: Page, threadId: string): Promise<void> {
    const res = await page.request.post(`/api/admin/communications/conversations/${threadId}/triage`, {
        data: { action: "resolved" },
    });
    expect(res.ok(), `triage resolve failed: ${res.status()}`).toBeTruthy();
    expect((await res.json()).attention_state).toBe("resolved");
}

/**
 * Deterministic cleanup: leave the scenario conversation resolved.
 *
 * Resolved is a legitimate operator end-state, not a restored snapshot — there is no
 * "prior value" to remember here because the scenario created the conversation it ends.
 */
export async function cleanupScenario(page: Page, threadId: string): Promise<void> {
    await resolveThroughTriage(page, threadId);
}
