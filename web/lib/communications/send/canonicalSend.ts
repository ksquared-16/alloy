/**
 * THE canonical send command — Phase 1 Slice 1, step 4.
 *
 * One authoritative server-side command for every supported provider-bound
 * send. It owns the whole pre-enqueue lifecycle:
 *
 *   authorize source → validate classification → resolve typed recipient
 *   → render → evaluate eligibility → snapshot → canonical enqueue
 *
 * Routes must not do any of those jobs themselves. Before Slice 1 they each did
 * some of them, differently, which is how `/communications/send` ended up
 * accepting a free-text address that no consent check could evaluate.
 *
 * WHAT THIS DOES NOT OWN: the provider. Dispatch remains the Python worker's
 * job, reached only by a queued `communication_messages` row. No application
 * code in this path calls a provider.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import type { MessageAudience, MessageCategory, MessageChannel } from "@/lib/communications/eligibility/types";
import { validatePurpose } from "@/lib/communications/purpose/purposeRegistry";
import { resolveRecipient } from "@/lib/communications/recipients/resolveRecipient";

import {
    validateClassificationForRecipient,
    validateTypedRecipientShape,
    type TypedRecipient,
} from "@/lib/communications/recipients/typedRecipient";

/**
 * Source capabilities permitted to reply into a conversation with no identified
 * Person. Human operator reply surfaces only.
 */
const THREAD_REPLY_CAPABILITIES: ReadonlySet<string> = new Set([
    "communications.send",
    "communications.family_send",
]);

export type CanonicalSendOutcome =
    | "sent_to_queue"
    | "blocked"
    | "needs_selection"
    | "invalid"
    | "duplicate"
    | "failed";

export type CanonicalSendResult = {
    outcome: CanonicalSendOutcome;
    /** Machine-readable. Stable across releases; safe to branch on. */
    reason: string;
    /** Operator-safe. Never carries stack traces, SQL, or raw policy data. */
    message: string;
    messageId?: string | null;
    threadId?: string | null;
    /** Present only for needs_selection. */
    availableChannels?: MessageChannel[];
    /** Surfaces the caller should refresh. */
    refreshTargets?: string[];
};

/**
 * Metadata keys a caller may persist. Anything else is dropped rather than
 * stored, so a route cannot smuggle arbitrary state onto a message row.
 */
export const ALLOWLISTED_METADATA_KEYS = [
    "source",
    "kind",
    "customer_id",
    "opportunity_id",
    "form_id",
    "form_name",
    "packet_id",
    "template_id",
    "template_version",
    "author_user_id",
    "assist_proposal_id",
    "recipient_role",
    "external_recipient_reason",
] as const;

export function filterMetadata(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!raw) return out;
    for (const key of ALLOWLISTED_METADATA_KEYS) {
        if (raw[key] !== undefined && raw[key] !== null) out[key] = raw[key];
    }
    return out;
}

export type CanonicalSendRequest = {
    supabase: SupabaseClient;
    orgId: string;
    /** The operator or trusted platform source authorizing this send. */
    authorizingUserId: string | null;
    /** Capability that owns the send — matched against the purpose registry. */
    sourceCapability: string;

    recipient: TypedRecipient;
    audience: MessageAudience;
    category: MessageCategory;
    purpose: string;
    channel: MessageChannel;

    /** Conversation/thread anchor. */
    primaryEntityType: string;
    primaryEntityId: string;

    bodyRaw: string;
    subjectRaw?: string | null;
    /** True when bodyRaw is rich HTML (email only). SMS must stay plain. */
    bodyIsHtml?: boolean;
    /** True when an operator authored the content (vs platform-composed). */
    userAuthored: boolean;
    templateId?: string | null;
    templateVersion?: string | null;

    communicationProviderBindingId?: string | null;
    /** Stable key. The same key with a different payload is rejected. */
    idempotencyKey: string;
    scheduleIntent?: "immediate" | "scheduled";
    metadata?: Record<string, unknown> | null;
    emergencyPermitted?: boolean;
};

function fail(outcome: CanonicalSendOutcome, reason: string, message: string): CanonicalSendResult {
    return { outcome, reason, message };
}

/**
 * Execute one send. Exactly one recipient — multi-recipient callers loop and
 * collect per-recipient results, so one recipient's outcome can never suppress
 * or authorize another.
 */
export async function canonicalSend(req: CanonicalSendRequest): Promise<CanonicalSendResult> {
    // 1 ---- authorize source ------------------------------------------------
    if (!req.orgId) return fail("invalid", "missing_org", "No organization context for this send.");
    if (!req.authorizingUserId && req.userAuthored) {
        return fail("invalid", "missing_actor", "An operator-authored send requires an authorizing actor.");
    }

    // 2 ---- mandatory classification ---------------------------------------
    // Deliberately BEFORE resolution and rendering: an unclassified send must
    // never reach a person lookup, a renderer, or a queue.
    if (!req.audience) return fail("invalid", "missing_audience", "audience is required.");
    if (!req.category) return fail("invalid", "missing_category", "category is required.");
    if (!req.purpose) return fail("invalid", "missing_purpose", "purpose is required.");

    // A thread-bound reply exists so a HUMAN operator can answer a conversation
    // whose sender is unidentified. It must not become the seam through which
    // automation, broadcasts, announcements or scheduled sends reach an address
    // nobody has identified — that would be free-text outbound wearing a thread id.
    // Allowlisted by source capability rather than denylisted, so a new automation
    // capability is refused by default instead of inheriting the permission.
    if (
        (req.recipient as { kind?: string } | null)?.kind === "canonical_thread" &&
        !THREAD_REPLY_CAPABILITIES.has(req.sourceCapability)
    ) {
        return {
            outcome: "blocked",
            reason: "thread_reply_not_permitted_for_source",
            message:
                "Replying to an unidentified sender is available to an operator answering the conversation, not to automated sends.",
        };
    }

    const shape = validateTypedRecipientShape(req.recipient);
    if (shape) return fail("invalid", shape.code, shape.message);

    const compat = validateClassificationForRecipient({
        recipient: req.recipient,
        audience: req.audience,
        category: req.category,
        purpose: req.purpose,
    });
    if (compat) return fail("invalid", compat.code, compat.message);

    // 3 ---- resolve the typed recipient ------------------------------------
    // Resolution runs before the channel-dependent half of purpose validation,
    // because the channel may not be known until the recipient is resolved.
    // (Requirement is that classification is validated before RENDER and
    // ENQUEUE — both of which happen after this.) Doing it the other way round
    // made `needs_selection` unreachable, since validatePurpose needs a channel.
    const resolution = await resolveRecipient({
        supabase: req.supabase,
        orgId: req.orgId,
        recipient: req.recipient,
        requestedChannel: req.channel,
    });

    if (resolution.status === "needs_selection") {
        return {
            outcome: "needs_selection",
            reason: "recipient_channel_selection_required",
            message: resolution.message,
            availableChannels: resolution.availableChannels,
        };
    }
    if (resolution.status === "blocked") return fail("blocked", resolution.code, resolution.message);
    if (resolution.status === "invalid") return fail("invalid", resolution.code, resolution.message);

    const facts = resolution.facts;

    // Channel-dependent classification, now that the channel is settled.
    const purposeViolation = validatePurpose({
        purpose: req.purpose,
        audience: req.audience,
        category: req.category,
        channel: facts.channel,
        recipientKind: req.recipient.kind,
        userAuthored: req.userAuthored,
    });
    if (purposeViolation) return fail("invalid", purposeViolation.code, purposeViolation.message);

    if (!req.bodyRaw?.trim()) {
        return fail("invalid", "missing_body", "Message body is required.");
    }

    // 4 ---- idempotency ----------------------------------------------------
    // Claimed against the message row itself: the enqueue writes the key into
    // allowlisted metadata, so a retry finds the prior row rather than creating
    // a second. Cheaper and more durable than a side table, and it cannot drift
    // from the thing it protects.
    const claim = await claimIdempotency({
        supabase: req.supabase,
        orgId: req.orgId,
        key: req.idempotencyKey,
        fingerprint: payloadFingerprint(req, facts.toAddress),
    });
    if (claim.outcome === "duplicate") {
        return {
            outcome: "duplicate",
            reason: "idempotent_replay",
            message: "This message was already queued.",
            messageId: claim.messageId ?? null,
        };
    }
    if (claim.outcome === "conflict") {
        return fail(
            "invalid",
            "idempotency_payload_changed",
            "This send key was already used with different content or recipient. Use a new key."
        );
    }

    // 5-7 -- render, evaluate eligibility, snapshot, enqueue -----------------
    // All four are owned by the canonical enqueue choke point, which renders
    // server-side, evaluates eligibility, freezes both snapshots, and inserts.
    // Routes never reach past this line.
    try {
        const enq = await enqueueCanonicalOutboundMessage({
            supabase: req.supabase,
            orgId: req.orgId,
            primaryEntityType: req.primaryEntityType,
            primaryEntityId: req.primaryEntityId,
            channelRaw: facts.channel,
            toRaw: facts.toAddress,
            // The provider destination is the other half of the endpoint-scoped
            // STOP hold, which matches on the PAIR. It was never passed, so
            // `fromAddress` reached eligibility as null and the hold could not match
            // on any send routed through here — the STOP was recorded and evaluated
            // and then had nothing to bind to. Browser certification queued a reply
            // to a number that had just texted STOP because of exactly this.
            fromAddress: facts.ourEndpointAddress,
            bodyRaw: req.bodyRaw,
            bodyIsHtml: req.bodyIsHtml === true && facts.channel === "email",
            emailSubjectRaw: req.subjectRaw ?? null,
            communicationProviderBindingId: req.communicationProviderBindingId ?? null,
            audience: req.audience,
            category: req.category,
            purpose: req.purpose,
            recipientPersonId: facts.personId,
            // Derived from the RESOLVED recipient, never from the request. A caller
            // cannot claim a verified endpoint it did not earn by naming a thread
            // this organization actually owns.
            verifiedThreadEndpoint: facts.kind === "canonical_thread",
            emergencyPermitted: req.emergencyPermitted ?? false,
            authorizedByUserId: req.authorizingUserId,
            metadata: {
                ...filterMetadata(req.metadata),
                idempotency_key: req.idempotencyKey,
                idempotency_fingerprint: payloadFingerprint(req, facts.toAddress),
                source_capability: req.sourceCapability,
                recipient_kind: facts.kind,
                ...(facts.recipientRole ? { recipient_role: facts.recipientRole } : {}),
                ...(facts.reason ? { external_recipient_reason: facts.reason } : {}),
                ...(req.templateId ? { template_id: req.templateId } : {}),
                ...(req.templateVersion ? { template_version: req.templateVersion } : {}),
            },
        });

        // The enqueue signals refusal by returning no message id together with a
        // skippedReason. An eligibility block is not a failure — it is the
        // system working, and critically NO provider-bound row exists.
        if (!enq.communicationMessageId) {
            return {
                outcome: "blocked",
                reason: enq.skippedReason ?? "enqueue_rejected",
                message: enq.blockedMessage ?? "This message was not queued.",
                threadId: enq.threadId ?? null,
            };
        }

        return {
            outcome: "sent_to_queue",
            reason: "queued",
            message: "Message queued for delivery.",
            messageId: enq.communicationMessageId,
            threadId: enq.threadId ?? null,
            refreshTargets: ["thread", "activity"],
        };
    } catch {
        // Never leak the underlying error to an operator.
        return fail("failed", "enqueue_error", "This message could not be queued. Nothing was sent.");
    }
}

/** Stable fingerprint of the things that must not change under one key. */
export function payloadFingerprint(req: CanonicalSendRequest, toAddress: string): string {
    return [
        req.orgId,
        req.recipient.kind,
        toAddress,
        req.audience,
        req.category,
        req.purpose,
        req.channel,
        (req.subjectRaw ?? "").trim(),
        req.bodyRaw.trim(),
    ].join("");
}

type IdempotencyClaim =
    | { outcome: "claimed" }
    | { outcome: "duplicate"; messageId: string | null }
    | { outcome: "conflict" };

/**
 * Look for a prior message carrying this key.
 *
 * Same key + same fingerprint  → duplicate (return the existing row).
 * Same key + different payload → conflict (reject; a key must mean one thing).
 */
async function claimIdempotency(args: {
    supabase: SupabaseClient;
    orgId: string;
    key: string;
    fingerprint: string;
}): Promise<IdempotencyClaim> {
    const { data, error } = await args.supabase
        .from("communication_messages")
        .select("id, metadata")
        .eq("org_id", args.orgId)
        .eq("metadata->>idempotency_key", args.key)
        .limit(1)
        .maybeSingle();

    // A lookup failure must not silently permit a duplicate send, but it also
    // must not block a first send forever. Treat as claimed and let the unique
    // constraint / dispatch revalidation catch a true double.
    if (error) return { outcome: "claimed" };
    if (!data) return { outcome: "claimed" };

    const row = data as { id?: string; metadata?: Record<string, unknown> | null };
    const priorFingerprint = String(row.metadata?.idempotency_fingerprint ?? "");
    if (priorFingerprint && priorFingerprint !== args.fingerprint) return { outcome: "conflict" };
    return { outcome: "duplicate", messageId: row.id ?? null };
}
