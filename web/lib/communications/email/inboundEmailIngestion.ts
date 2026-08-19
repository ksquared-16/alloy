/**
 * A received email, from verified provider event to canonical conversation.
 *
 * The whole chain, in the one order that is safe:
 *
 *   claim receipt  ->  ownership  ->  retrieval  ->  correlation  ->  persist
 *
 * RECEIPT FIRST, because Resend's webhook carries no body. There is nothing to
 * write into `communication_messages` yet, so without a receipt a redelivery
 * would be indistinguishable from a new message. The receipt is claimed on the
 * provider identity the ingress table enforces as unique, which makes every
 * retry converge on the same row.
 *
 * OWNERSHIP BEFORE RETRIEVAL, because fetching content for a message no tenant
 * owns spends a provider call to learn something the binding already told us.
 *
 * OWNERSHIP BEFORE CORRELATION, always. Threading headers are conversation
 * evidence, never tenant authority — every correlation lookup below is scoped to
 * the organization ownership already established, so a valid `<alloy.{uuid}@…>`
 * naming a real message in another tenant simply finds nothing.
 *
 * Dependencies are injected so the chain can be exercised end to end against
 * fixtures without a live provider or a live database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    combineInboundEmail,
    normalizeResendRetrievedEmail,
    ownershipCandidateAddresses,
    attachmentNotice,
    type NormalizedInboundEmail,
    type ResendReceivedEvent,
} from "@/lib/communications/email/inboundEmailNormalization";
import {
    resolveEmailThread,
    resolveInboundEmailOwnership,
    normalizeEmailAddress,
    type EmailProvenanceMethod,
    type InboundEmailBinding,
} from "@/lib/communications/email/inboundEmailRouting";
import { correlationCandidates } from "@/lib/communications/email/emailMessageId";
import {
    correlationUsableForLocation,
    decideThreadForLocation,
    resolveInboundThreadLocation,
    type ThreadLocationCandidate,
} from "@/lib/communications/threadLocationResolution";
import {
    UNKNOWN_SENDER_ENTITY_TYPE,
    surrogateEmailSenderAnchor,
} from "@/lib/communications/email/inboundEmailAnchor";
import type { ResendRetrievalResult } from "@/lib/communications/email/resendReceivingClient";
import { observeEmailIngressEligibility } from "@/lib/communications/ingress/observeEmailIngressEligibility";

export const EMAIL_PROVIDER = "resend";

export type InboundEmailIngestionDeps = {
    supabase: SupabaseClient;
    /** Fetches full content; the caller supplies the credential resolution. */
    retrieve: (emailId: string) => Promise<ResendRetrievalResult>;
    now?: () => string;
};

export type InboundEmailIngestionOutcome =
    | {
          status: "persisted";
          orgId: string;
          messageId: string;
          threadId: string;
          method: EmailProvenanceMethod;
          identified: boolean;
          ambiguous: boolean;
      }
    /** Already fully processed. The webhook is acknowledged; nothing repeats. */
    | { status: "duplicate"; messageId: string | null }
    /** Ownership could not be proven. Retained at provider authority. */
    | { status: "quarantined"; disposition: "no_attributable_org" | "cross_org_ambiguous" }
    /** Content not yet available. The receipt waits; the webhook should be retried. */
    | { status: "retrieval_pending"; reason: string; retryable: true }
    /** Nothing usable and nothing to wait for. */
    | { status: "ignored"; reason: string };

type IngressRow = {
    id: string;
    routing_disposition: string;
    resolved_at: string | null;
    resolved_message_id: string | null;
    resolved_org_id: string | null;
};

const UNIQUE_VIOLATION = "23505";

/**
 * Claim the provider event, or return the claim that already exists.
 *
 * The unique constraint on (provider, channel, provider_message_id) is the
 * arbiter — not a read-then-write, which would race two concurrent redeliveries
 * into two receipts.
 */
async function claimReceipt(
    deps: InboundEmailIngestionDeps,
    event: ResendReceivedEvent
): Promise<{ row: IngressRow; created: boolean } | null> {
    const select = "id, routing_disposition, resolved_at, resolved_message_id, resolved_org_id";
    const { data, error } = await deps.supabase
        .from("communication_inbound_ingress")
        .insert({
            provider: EMAIL_PROVIDER,
            channel: "email",
            provider_message_id: event.emailId,
            from_address: event.fromAddress,
            to_address: ownershipCandidateAddresses(event)[0] ?? null,
            received_at: event.receivedAt,
            routing_disposition: "retrieval_pending",
            // Deliberately no body: there is none yet, and the quarantine
            // projection withholds bodies anyway.
        })
        .select(select)
        .maybeSingle();

    if (!error && data) return { row: data as IngressRow, created: true };

    if (error && error.code === UNIQUE_VIOLATION) {
        const { data: existing } = await deps.supabase
            .from("communication_inbound_ingress")
            .select(select)
            .eq("provider", EMAIL_PROVIDER)
            .eq("channel", "email")
            .eq("provider_message_id", event.emailId)
            .maybeSingle();
        if (existing) return { row: existing as IngressRow, created: false };
    }
    return null;
}

async function markReceipt(
    deps: InboundEmailIngestionDeps,
    receiptId: string,
    patch: Record<string, unknown>
): Promise<void> {
    await deps.supabase.from("communication_inbound_ingress").update(patch).eq("id", receiptId);
}

/**
 * Active email bindings that could own this message — by the address the parent
 * wrote to, OR by the destination the provider actually delivered to.
 *
 * Both lookups are needed and neither is redundant. Under DIRECT delivery the
 * provider reports the organization's own address and `inbound_address` matches.
 * Under SELECTIVE ROUTING the organization keeps its own MX and forwards one
 * mailbox onward, so the provider reports an opaque ingress destination and
 * `inbound_address` matches nothing — every such message would be quarantined as
 * unattributable.
 *
 * Ownership is still decided from the BINDING. A route only says which binding a
 * destination belongs to; it is never itself an owner.
 */
async function loadCandidateBindings(
    deps: InboundEmailIngestionDeps,
    addresses: string[]
): Promise<InboundEmailBinding[]> {
    const normalized = addresses.map(normalizeEmailAddress).filter((a): a is string => a !== null);
    if (normalized.length === 0) return [];

    const { data: direct } = await deps.supabase
        .from("communication_provider_bindings")
        .select("id, org_id, channel, provider, status, inbound_address, location_id")
        .eq("channel", "email")
        .in("inbound_address", normalized);

    const { data: routes } = await deps.supabase
        .from("communication_ingress_routes")
        .select("communication_provider_binding_id, destination")
        .in("destination", normalized);

    const byBindingId = new Map<string, InboundEmailBinding>();
    for (const row of direct ?? []) {
        const binding = row as InboundEmailBinding;
        byBindingId.set(String(binding.id), { ...binding, ingress_destinations: [] });
    }

    const routedIds = [
        ...new Set(
            (routes ?? []).map((r) =>
                String(
                    (r as { communication_provider_binding_id: string }).communication_provider_binding_id
                )
            )
        ),
    ];
    const missing = routedIds.filter((id) => !byBindingId.has(id));
    if (missing.length > 0) {
        const { data: routed } = await deps.supabase
            .from("communication_provider_bindings")
            .select("id, org_id, channel, provider, status, inbound_address, location_id")
            .eq("channel", "email")
            .in("id", missing);
        for (const row of routed ?? []) {
            const binding = row as InboundEmailBinding;
            byBindingId.set(String(binding.id), { ...binding, ingress_destinations: [] });
        }
    }

    for (const raw of routes ?? []) {
        const r = raw as { communication_provider_binding_id: string; destination: string };
        const binding = byBindingId.get(String(r.communication_provider_binding_id));
        if (!binding) continue;
        const destination = normalizeEmailAddress(r.destination);
        if (destination && !binding.ingress_destinations!.includes(destination)) {
            binding.ingress_destinations!.push(destination);
        }
    }

    return [...byBindingId.values()];
}

/**
 * Record that mail actually ARRIVED at this destination.
 *
 * This stamp is the entire basis on which receiving may be reported as working
 * (see `bindingReadiness.ts`). No configuration produces it and no administrator
 * can set it by hand — only a message getting through does.
 *
 * Deliberately NOT fatal. By this point the message is attributed and persisted;
 * failing the ingestion because a readiness timestamp could not be written would
 * lose a parent's message to bookkeeping. Readiness also derives from canonical
 * history, which already holds this message, so a failure here costs the fast
 * path and not the evidence.
 */
async function stampInboundObservation(
    deps: InboundEmailIngestionDeps,
    orgId: string,
    destinations: string[],
    observedAt: string
): Promise<void> {
    const normalized = destinations.map(normalizeEmailAddress).filter((a): a is string => a !== null);
    if (normalized.length === 0) return;
    try {
        await deps.supabase
            .from("communication_ingress_routes")
            .update({
                last_inbound_at: observedAt,
                verification_state: "inbound_observed",
                updated_at: observedAt,
            })
            .eq("org_id", orgId)
            .in("destination", normalized);
    } catch {
        /* see above — never fatal */
    }
}

/**
 * Threads for Alloy-minted message ids, ORG-SCOPED.
 *
 * This is where the tenant boundary is actually enforced for correlation: a
 * message id belonging to another organization is filtered out by the query, so
 * it contributes no candidate and the caller never learns it existed.
 */
async function threadsForAlloyMessageIds(
    deps: InboundEmailIngestionDeps,
    orgId: string,
    messageIds: string[]
): Promise<string[]> {
    if (messageIds.length === 0) return [];
    const { data } = await deps.supabase
        .from("communication_messages")
        .select("id, thread_id")
        .eq("org_id", orgId)
        .in("id", messageIds);
    const byId = new Map<string, string>();
    for (const row of data ?? []) {
        const r = row as { id: string; thread_id: string };
        if (r.thread_id) byId.set(String(r.id), String(r.thread_id));
    }
    // Preserve the evidence order the caller established.
    return messageIds.map((id) => byId.get(id)).filter((t): t is string => !!t);
}

/** Existing conversations on this exact sender + receiving-address pair. */
async function endpointCandidateThreads(
    deps: InboundEmailIngestionDeps,
    orgId: string,
    senderAddress: string,
    receivingAddress: string
): Promise<string[]> {
    const { data } = await deps.supabase
        .from("communication_messages")
        .select("thread_id")
        .eq("org_id", orgId)
        .eq("channel", "email")
        .or(
            `and(direction.eq.inbound,from_address.eq.${senderAddress},to_address.eq.${receivingAddress}),` +
                `and(direction.eq.outbound,to_address.eq.${senderAddress},from_address.eq.${receivingAddress})`
        );
    return [...new Set((data ?? []).map((r) => String((r as { thread_id: string }).thread_id)).filter(Boolean))];
}

/** The Person who owns this address in this organization, when exactly one does. */
async function resolvePersonByEmail(
    deps: InboundEmailIngestionDeps,
    orgId: string,
    address: string
): Promise<{ personId: string | null; ambiguous: boolean }> {
    const { data } = await deps.supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", address)
        .limit(22);
    const ids = (data ?? []).map((r) => String((r as { id: string }).id));
    if (ids.length === 1) return { personId: ids[0]!, ambiguous: false };
    // Zero is unknown; more than one is a shared household address. Neither may
    // produce a Person — that is the SMS rule and it does not change for email.
    return { personId: null, ambiguous: ids.length > 1 };
}

/**
 * Resolve the inbound conversation, at the location the RECEIVING address belongs
 * to.
 *
 * `locationId` comes from the binding that owns the address the family wrote to —
 * never from the sender, never from the household. See
 * `resolveInboundThreadLocation` for why that distinction is load-bearing.
 *
 * The `.maybeSingle()` that used to sit on this lookup is gone: a parent can now
 * legitimately hold one conversation per location on the same address, and
 * `maybeSingle()` throws on more than one row — it would have turned a correctly
 * separated Lakeside conversation into an ingestion failure.
 */
async function findOrCreateThread(
    deps: InboundEmailIngestionDeps,
    params: {
        orgId: string;
        locationId: string | null;
        recipientKey: string;
        entityType: string;
        entityId: string;
        metadata: Record<string, unknown>;
        lastMessageAt: string;
        attentionState: string;
    }
): Promise<string | null> {
    const selectCandidates = () =>
        deps.supabase
            .from("communication_threads")
            .select("id, location_id")
            .eq("org_id", params.orgId)
            .eq("primary_entity_type", params.entityType)
            .eq("primary_entity_id", params.entityId)
            .eq("channel", "email")
            .eq("recipient_key", params.recipientKey);

    const { data: rows } = await selectCandidates();
    // adopt:false — inbound never re-points an existing organization-level
    // conversation into a location. See `decideThreadForLocation`.
    const decision = decideThreadForLocation({
        candidates: (rows ?? []) as ThreadLocationCandidate[],
        locationId: params.locationId,
        adopt: false,
    });

    if (decision.kind === "use") return decision.threadId;

    const { data: created } = await deps.supabase
        .from("communication_threads")
        .insert({
            org_id: params.orgId,
            location_id: params.locationId,
            channel: "email",
            recipient_key: params.recipientKey,
            primary_entity_type: params.entityType,
            primary_entity_id: params.entityId,
            metadata: params.metadata,
            last_message_at: params.lastMessageAt,
            attention_state: params.attentionState,
        })
        .select("id")
        .maybeSingle();
    if (created) return String((created as { id: string }).id);

    // Concurrent ingestion of the same message created it first.
    const { data: after } = await selectCandidates();
    const retry = decideThreadForLocation({
        candidates: (after ?? []) as ThreadLocationCandidate[],
        locationId: params.locationId,
        adopt: false,
    });
    return retry.kind === "create" ? null : retry.threadId;
}

/**
 * Ingest one verified `email.received` event.
 *
 * Every exit is deliberate: the caller turns `retrieval_pending` into a webhook
 * refusal (so Resend retries into the waiting receipt) and everything else into
 * an acknowledgement (so it stops).
 */
export async function ingestResendInboundEmail(
    event: ResendReceivedEvent,
    deps: InboundEmailIngestionDeps
): Promise<InboundEmailIngestionOutcome> {
    const now = deps.now ?? (() => new Date().toISOString());

    // 1 — receipt. Proof of arrival that survives a failed retrieval.
    const claim = await claimReceipt(deps, event);
    if (!claim) return { status: "ignored", reason: "receipt_claim_failed" };
    if (claim.row.resolved_at && claim.row.resolved_message_id) {
        return { status: "duplicate", messageId: claim.row.resolved_message_id };
    }

    // 2 — ownership, before any provider call and before any correlation.
    const bindings = await loadCandidateBindings(deps, ownershipCandidateAddresses(event));
    const ownership = resolveInboundEmailOwnership({
        toAddresses: ownershipCandidateAddresses(event),
        bindings,
    });

    if (ownership.kind !== "owned") {
        await markReceipt(deps, claim.row.id, {
            routing_disposition: ownership.kind,
            candidate_org_ids: ownership.kind === "cross_org_ambiguous" ? ownership.candidateOrgIds : [],
            resolution_note: "ownership_not_provable",
        });
        return { status: "quarantined", disposition: ownership.kind };
    }

    const orgId = ownership.binding.org_id;
    const receivingAddress = ownership.receivingAddress;

    // 3 — retrieval. The webhook never carried the body or the headers.
    const retrieval = await deps.retrieve(event.emailId);
    if (!retrieval.ok) {
        if (retrieval.retryable) {
            await markReceipt(deps, claim.row.id, {
                resolved_org_id: orgId,
                resolution_note: `retrieval_retryable:${retrieval.reason}`,
            });
            return { status: "retrieval_pending", reason: retrieval.reason, retryable: true };
        }
        // Permanent: retrying cannot help, so the receipt stops waiting and
        // becomes a durable record of an email that arrived and could not be read.
        await markReceipt(deps, claim.row.id, {
            routing_disposition: "no_attributable_org",
            resolved_org_id: orgId,
            resolution_note: `retrieval_permanent_failure:${retrieval.reason}`,
        });
        return { status: "ignored", reason: `retrieval_failed:${retrieval.reason}` };
    }

    const email: NormalizedInboundEmail = combineInboundEmail(
        event,
        normalizeResendRetrievedEmail(retrieval.payload)
    );

    // 4 — correlation, entirely inside the owning organization.
    const alloyIds = correlationCandidates({ inReplyTo: email.inReplyTo, references: email.references });
    const inReplyToIds = email.inReplyTo
        ? correlationCandidates({ inReplyTo: email.inReplyTo, references: null })
        : [];
    const referenceIds = alloyIds.filter((id) => !inReplyToIds.includes(id));

    const senderAddress = normalizeEmailAddress(email.fromAddress) ?? email.fromAddress.toLowerCase();
    const [inReplyToThreadIds, referencesThreadIds, endpointThreadIds] = await Promise.all([
        threadsForAlloyMessageIds(deps, orgId, inReplyToIds),
        threadsForAlloyMessageIds(deps, orgId, referenceIds),
        endpointCandidateThreads(deps, orgId, senderAddress, receivingAddress),
    ]);

    const resolution = resolveEmailThread({
        inReplyToThreadIds,
        referencesThreadIds,
        endpointCandidateThreadIds: endpointThreadIds,
    });

    // Lane A evidence for the observe-only gate, taken from the lookup that just ran.
    //
    // Only the header-derived candidates count. `endpointCandidateThreadIds` is
    // sender/recipient provenance — the weakest evidence in the correlation model, and
    // explicitly NOT proof that this is a reply to something Alloy sent. Passing it would
    // inflate Lane A with messages that merely share an endpoint with an old conversation.
    const alloyThreadEvidenceId = inReplyToThreadIds[0] ?? referencesThreadIds[0] ?? null;

    // 5 — identity. Unchanged from SMS: exactly one match, or nobody.
    const person = await resolvePersonByEmail(deps, orgId, senderAddress);

    const inboundLocationId = resolveInboundThreadLocation({
        receivingBindingLocationId: ownership.binding.location_id ?? null,
    });

    let threadId = resolution.threadId;

    // Correlation answers "which conversation is this a reply to", never "which
    // location". Left unchecked it overrides the location rule entirely: a message
    // to the organization's general address was filed into a Riverside
    // conversation because threading matched the same sender first. A correlated
    // thread is usable only when it belongs to the same location as this message.
    if (threadId) {
        const { data: correlated } = await deps.supabase
            .from("communication_threads")
            .select("location_id")
            .eq("id", threadId)
            .maybeSingle();
        const usable = correlationUsableForLocation({
            correlatedThreadLocationId: (correlated as { location_id?: string | null } | null)?.location_id ?? null,
            messageLocationId: inboundLocationId,
        });
        if (!usable) threadId = null;
    }

    if (!threadId) {
        const identified = person.personId !== null;
        threadId = await findOrCreateThread(deps, {
            orgId,
            // The receiving address is the location authority for inbound.
            locationId: inboundLocationId,
            recipientKey: senderAddress,
            entityType: identified ? "persons" : UNKNOWN_SENDER_ENTITY_TYPE,
            entityId: identified
                ? person.personId!
                : surrogateEmailSenderAnchor({ orgId, senderAddress }),
            metadata: {
                inbound_resolution: identified
                    ? "single_person_match"
                    : person.ambiguous
                      ? "ambiguous_sender"
                      : "unknown_sender",
                anchor: identified ? "person" : "surrogate_email_sender",
                correlation_method: resolution.method,
            },
            lastMessageAt: email.receivedAt,
            attentionState: person.ambiguous || resolution.ambiguous ? "needs_routing_resolution" : "needs_response",
        });
    }
    if (!threadId) return { status: "ignored", reason: "thread_unavailable" };

    // 6 — canonical persistence. The unique index on
    // (org_id, provider, channel, provider_message_id) WHERE direction='inbound'
    // is what makes this exactly-once, so a duplicate lands here and is recognised
    // rather than being prevented by a prior read.
    const notice = attachmentNotice(email.attachments);
    const { data: inserted, error: insertError } = await deps.supabase
        .from("communication_messages")
        .insert({
            org_id: orgId,
            thread_id: threadId,
            channel: "email",
            direction: "inbound",
            status: "received",
            provider: EMAIL_PROVIDER,
            provider_message_id: event.emailId,
            from_address: senderAddress,
            to_address: receivingAddress,
            subject: email.subject,
            body: email.text,
            body_format: "plain",
            email_message_id: email.messageId,
            email_in_reply_to: email.inReplyTo,
            email_references: email.references,
            audience: "external",
            category: "operational",
            communication_provider_binding_id: ownership.binding.id,
            metadata: {
                correlation_method: resolution.method,
                routing_ambiguous: resolution.ambiguous || person.ambiguous,
                inbound_resolution: person.personId
                    ? "single_person_match"
                    : person.ambiguous
                      ? "ambiguous_sender"
                      : "unknown_sender",
                // Presence only. Retrieval and storage are WS11.
                attachment_count: email.attachments.length,
                attachment_notice: notice,
                attachments: email.attachments.map((a) => ({
                    id: a.id,
                    filename: a.filename,
                    content_type: a.contentType,
                    content_disposition: a.contentDisposition,
                    size: a.size,
                })),
                html_present: email.html !== null,
                html_format: email.htmlFormat,
            },
        })
        .select("id")
        .maybeSingle();

    if (insertError) {
        if (insertError.code === UNIQUE_VIOLATION) {
            const { data: existing } = await deps.supabase
                .from("communication_messages")
                .select("id")
                .eq("org_id", orgId)
                .eq("provider", EMAIL_PROVIDER)
                .eq("channel", "email")
                .eq("direction", "inbound")
                .eq("provider_message_id", event.emailId)
                .maybeSingle();
            const existingId = existing ? String((existing as { id: string }).id) : null;
            if (existingId) {
                await markReceipt(deps, claim.row.id, {
                    resolved_at: now(),
                    resolved_org_id: orgId,
                    resolved_message_id: existingId,
                    resolution_note: "duplicate_converged",
                });
            }
            return { status: "duplicate", messageId: existingId };
        }
        return { status: "retrieval_pending", reason: `persist_failed:${insertError.code ?? "unknown"}`, retryable: true };
    }

    const messageId = inserted ? String((inserted as { id: string }).id) : null;
    if (!messageId) return { status: "ignored", reason: "persist_returned_no_id" };

    // 7 — one receive event, emitted only on a genuine insert. A duplicate
    // returned above and never reaches this line, so the Activity is exactly-once
    // structurally rather than by a guard.
    await deps.supabase.from("workflow_events").insert({
        org_id: orgId,
        event_type: "message_received",
        entity_type: person.personId ? "persons" : UNKNOWN_SENDER_ENTITY_TYPE,
        entity_id: person.personId ?? surrogateEmailSenderAnchor({ orgId, senderAddress }),
        occurred_at: email.receivedAt,
        payload: {
            communication_message_id: messageId,
            thread_id: threadId,
            channel: "email",
            direction: "inbound",
            body_preview: email.text.slice(0, 160),
            correlation_method: resolution.method,
        },
    });

    await deps.supabase
        .from("communication_threads")
        .update({
            last_message_at: email.receivedAt,
            attention_state:
                resolution.ambiguous || person.ambiguous ? "needs_routing_resolution" : "needs_response",
        })
        .eq("id", threadId);

    await markReceipt(deps, claim.row.id, {
        resolved_at: now(),
        resolved_org_id: orgId,
        resolved_message_id: messageId,
        resolution_note: `correlated:${resolution.method}`,
    });

    // Mail got through. That — and only that — is what lets the configuration
    // surface say receiving works. Stamped after persistence so the claim can
    // never outrun the message it is claiming about.
    await stampInboundObservation(deps, orgId, ownershipCandidateAddresses(event), email.receivedAt);

    // 8 — OBSERVE-ONLY. What the deterministic ingress eligibility gate WOULD have
    // decided about this message, recorded as evidence and acting on nothing.
    //
    // LAST, deliberately. Everything above has already happened: the message is
    // persisted, the receive event is emitted, the receipt is resolved, and the return
    // value below is already determined by state this call cannot touch. Observe-only is
    // therefore a property of WHERE this sits, not of the try/catch inside it — there is
    // no subsequent statement for a failure to reach, and no future edit can quietly
    // change that without moving this line.
    //
    // The envelope handed over is metadata only. `email.text` and `email.html` are in
    // scope right here and are deliberately not passed: the gate must remain a function
    // of what a provider discloses WITHOUT body access, or the observations would measure
    // a policy that could never be enforced pre-retrieval.
    await observeEmailIngressEligibility(
        {
            orgId,
            provider: EMAIL_PROVIDER,
            providerMessageId: event.emailId,
            envelope: {
                recipients: ownershipCandidateAddresses(event),
                sender: senderAddress,
                messageId: email.messageId,
                inReplyTo: email.inReplyTo,
                references: email.references,
                subject: email.subject,
                hasAttachments: email.attachments.length > 0,
                // Derived from the headers the receiving transport stamped, and `unknown`
                // whenever it stamped none — which the gate treats exactly as a failure
                // wherever authentication is load-bearing. Reporting `pass` by default to
                // make Lane B look better would be inventing an assurance.
                authentication: email.authentication,
            },
            authenticationEvidence: email.authenticationEvidence,
            resolvedAlloyThreadId: alloyThreadEvidenceId,
        },
        deps
    );

    return {
        status: "persisted",
        orgId,
        messageId,
        threadId,
        method: resolution.method,
        identified: person.personId !== null,
        ambiguous: resolution.ambiguous || person.ambiguous,
    };
}
