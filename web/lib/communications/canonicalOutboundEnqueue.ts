/**
 * Canonical communication_threads + communication_messages inserts + workflow_events.message_queued.
 * Used by workflow dual-write mirror and drawer composer (Card 12).
 *
 * PHASE 0: this module is the eligibility CHOKE POINT.
 *
 * `insertCommunicationMessageRow` is the only TypeScript function that inserts
 * an outbound communication_messages row, and this is its only caller. The
 * consent gate previously lived one level up in executeCommunicationsSend,
 * where four independent bypasses defeated it and three send paths never
 * reached it at all (tour comms, packet launch, the workflow mirror).
 * Evaluating here covers all of them with no re-pointing.
 *
 * This is not the whole story: rows can still enter the table by paths
 * TypeScript never sees (raw SQL, seed scripts). Python dispatch revalidation
 * is the second layer that catches those.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import { resolveOutboundEmailSubject } from "@/lib/communications/emailSubject";
import { normalizeRecipientKeyEmail, normalizeRecipientKeySms } from "@/lib/communications/recipientKey";
import {
    ELIGIBILITY_POLICY_VERSION,
    evaluateEligibility,
} from "@/lib/communications/eligibility/evaluateEligibility";
import { loadEligibilityContext } from "@/lib/communications/eligibility/loadEligibilityContext";
import { renderOutboundMessage } from "@/lib/communications/render/renderOutboundMessage";
import { enforceOutboundPublicLinkOrigin } from "@/lib/communications/outboundPublicLinkOrigin";
import { resolveOutboundSender } from "@/lib/communications/identity/resolveOutboundSender";
import {
    decideThreadForLocation,
    resolveOutboundThreadLocation,
    type ThreadLocationCandidate,
} from "@/lib/communications/threadLocationResolution";
import type { RenderContext, RenderSnapshot } from "@/lib/communications/render/renderOutboundMessage";
import {
    ELIGIBILITY_SNAPSHOT_VERSION,
    recordCategoryFallback,
    type EligibilitySnapshot,
    type MessageAudience,
    type MessageCategory,
    type QuietHoursWindow,
} from "@/lib/communications/eligibility/types";

/**
 * Resolve — and when necessary create — the conversation this outbound message
 * belongs to, at the right location.
 *
 * Candidates are fetched WITHOUT a location filter and the choice is made by
 * `decideThreadForLocation`, so outbound, inbound email and inbound SMS all apply
 * one rule. The previous implementation filtered `location_id IS NULL`, which is
 * why every conversation was organization-wide.
 *
 * Note the deliberate absence of `.maybeSingle()` on the lookup: several threads
 * can now legitimately share (org, entity, channel, recipient) while differing by
 * location, and `maybeSingle()` throws on more than one row. That would have
 * turned a correctly-located second conversation into a runtime error.
 */
async function upsertCommunicationThread(params: {
    supabase: SupabaseClient;
    orgId: string;
    primaryEntityType: string;
    primaryEntityId: string;
    channel: string;
    recipientKey: string;
    locationId: string | null;
}): Promise<string | null> {
    const { supabase, orgId, primaryEntityType, primaryEntityId, channel, recipientKey, locationId } = params;

    const selectCandidates = () =>
        supabase
            .from("communication_threads")
            .select("id, location_id")
            .eq("org_id", orgId)
            .eq("primary_entity_type", primaryEntityType)
            .eq("primary_entity_id", primaryEntityId)
            .eq("channel", channel)
            .eq("recipient_key", recipientKey);

    const { data: rows } = await selectCandidates();
    const decision = decideThreadForLocation({
        candidates: (rows ?? []) as ThreadLocationCandidate[],
        locationId,
    });

    if (decision.kind === "use") return decision.threadId;

    if (decision.kind === "adopt") {
        // The conversation existed before its location was known. Stamp it rather
        // than starting a second one — the family's history stays in one place.
        const { error } = await supabase
            .from("communication_threads")
            .update({ location_id: decision.locationId, updated_at: new Date().toISOString() })
            .eq("id", decision.threadId)
            .is("location_id", null);
        if (error) {
            // Another writer adopted it first. Re-read and take whatever the rule
            // says now rather than assuming this attempt's outcome.
            const { data: after } = await selectCandidates();
            const retry = decideThreadForLocation({
                candidates: (after ?? []) as ThreadLocationCandidate[],
                locationId,
            });
            if (retry.kind !== "create") return retry.threadId;
        } else {
            return decision.threadId;
        }
    }

    const insertRow: Record<string, unknown> = {
        org_id: orgId,
        primary_entity_type: primaryEntityType,
        primary_entity_id: primaryEntityId,
        channel,
        recipient_key: recipientKey,
        location_id: locationId,
        updated_at: new Date().toISOString(),
    };
    const ins = await supabase.from("communication_threads").insert(insertRow).select("id").maybeSingle();

    let id = ins.data?.id as string | undefined;
    const errCode = ins.error ? (ins.error as { code?: string }).code : undefined;
    if (ins.error && errCode !== "23505") {
        console.warn("[communications] upsertCommunicationThread insert", ins.error.message);
    }

    if (!id) {
        // 23505 means a concurrent writer created the same conversation. Re-read
        // and resolve again through the same rule.
        const { data: after } = await selectCandidates();
        const retry = decideThreadForLocation({
            candidates: (after ?? []) as ThreadLocationCandidate[],
            locationId,
        });
        if (retry.kind !== "create") id = retry.threadId;
    }
    return id ?? null;
}

function metaChannel(ch: string): "sms" | "email" | "in_app" {
    const x = ch.toLowerCase();
    if (x === "email") return "email";
    if (x === "in_app") return "in_app";
    return "sms";
}

/**
 * The only two states this module may write.
 *
 * The dispatch poller selects `status in.(queued,deferred)`
 * (backend/app/services/communication_message_sender.py). `blocked` is terminal
 * and unreachable by it, which is what lets a refused send be recorded as a row
 * without becoming sendable. `deferred` is written only by dispatch, which owns
 * the clock; enqueue never defers.
 */
type OutboundInsertStatus = "queued" | "blocked";

/**
 * Audit shape written to `communication_messages.eligibility_decision`.
 *
 * Deliberately identical to the dispatcher's `DispatchDecision.to_audit()`
 * (backend/app/services/dispatch_eligibility.py) so an operator surface reads ONE
 * shape regardless of which boundary refused the send, plus `stage` to say which
 * boundary that was. Rows written by the dispatcher carry no `stage`; absent
 * means dispatch.
 */
function buildEnqueueBlockAudit(params: {
    code: string;
    operatorMessage: string;
    evaluatedAt: string;
}): Record<string, unknown> {
    return {
        outcome: "blocked",
        reason: params.code,
        operator_message: params.operatorMessage,
        defer_until: null,
        contract_version: ELIGIBILITY_POLICY_VERSION,
        evaluated_at: params.evaluatedAt,
        stage: "enqueue",
    };
}

async function insertCommunicationMessageRow(params: {
    supabase: SupabaseClient;
    org_id: string;
    thread_id: string;
    channel: "sms" | "email" | "in_app";
    direction: "outbound";
    body: string;
    subject?: string | null;
    workflow_run_id: string | null;
    metadata: Record<string, unknown>;
    to_address: string | null;
    communication_provider_binding_id?: string | null;
    communication_identity_id?: string | null;
    communication_provider_account_id?: string | null;
    from_address?: string | null;
    audience?: string;
    category?: string;
    purpose?: string | null;
    eligibility_snapshot?: unknown;
    rendered_snapshot?: unknown;
    /**
     * Lifecycle state at insert. `queued` is the only value the dispatch poller
     * picks up — it reads `status in.(queued,deferred)` — so `blocked` records a
     * refused send without ever making it sendable.
     */
    status?: OutboundInsertStatus;
    /** Terminal explanation for a non-queued row. Mirrors the dispatcher's `policy:<CODE>`. */
    error?: string | null;
    eligibility_decision?: unknown;
}): Promise<{ messageId?: string | null; error?: { message?: string; code?: string } }> {
    const insertPayload: Record<string, unknown> = {
        org_id: params.org_id,
        thread_id: params.thread_id,
        channel: params.channel,
        direction: params.direction,
        status: params.status ?? "queued",
        body: params.body,
        workflow_run_id: params.workflow_run_id,
        metadata: params.metadata,
        to_address: params.to_address,
    };
    if (params.error != null) insertPayload.error = params.error;
    if (params.eligibility_decision != null) insertPayload.eligibility_decision = params.eligibility_decision;
    if (params.audience) insertPayload.audience = params.audience;
    if (params.category) insertPayload.category = params.category;
    if (params.purpose != null) insertPayload.purpose = params.purpose;
    if (params.eligibility_snapshot != null) insertPayload.eligibility_snapshot = params.eligibility_snapshot;
    if (params.rendered_snapshot != null) insertPayload.rendered_snapshot = params.rendered_snapshot;
    if (params.channel === "email") {
        insertPayload.subject = params.subject ?? null;
    }
    if (params.communication_provider_binding_id) {
        insertPayload.communication_provider_binding_id = params.communication_provider_binding_id;
    }
    if (params.communication_identity_id) {
        insertPayload.communication_identity_id = params.communication_identity_id;
    }
    if (params.communication_provider_account_id) {
        insertPayload.communication_provider_account_id = params.communication_provider_account_id;
    }
    if (params.from_address) {
        insertPayload.from_address = params.from_address;
    }
    const { data, error } = await params.supabase.from("communication_messages").insert(insertPayload).select("id").maybeSingle();
    return {
        messageId: data?.id as string | undefined,
        error: error ? { message: error.message, code: error.code } : undefined,
    };
}

export type CanonicalEnqueueResult = {
    communicationMessageId: string | null;
    threadId: string | null;
    skippedReason?: string;
    /** Operator-safe explanation when a render or policy check refused the send. */
    blockedMessage?: string;
    /**
     * The durable `blocked` row recording a refused send.
     *
     * Kept OFF `communicationMessageId` on purpose: callers read that field as
     * "this message is going out" (`!res.communicationMessageId` is their failure
     * test), and a blocked message is not going out. Persisting the decision must
     * not change what any caller believes was sent.
     */
    blockedCommunicationMessageId?: string | null;
};

/**
 * Upsert thread, then record the send's outcome durably either way:
 * permitted → queued communication_message + `message_queued`;
 * refused   → blocked communication_message + `message_blocked`.
 */
export async function enqueueCanonicalOutboundMessage(params: {
    supabase: SupabaseClient;
    orgId: string;
    primaryEntityType: string;
    primaryEntityId: string;
    channelRaw: string;
    toRaw: string;
    bodyRaw: string;
    /** Only used when channel resolves to email; empty/omitted yields entity-based defaults. */
    emailSubjectRaw?: string | null;
    workflowRunId?: string | null;
    metadata: Record<string, unknown>;
    contextLocationId?: string | null;
    /** Composer / explicit binding routing for outbound dequeue (SMS/email). Must belong to org_id + channel. */
    communicationProviderBindingId?: string | null;
    /** Canonical identity platform references (Phase 2). */
    communicationIdentityId?: string | null;
    communicationProviderAccountId?: string | null;
    fromAddress?: string | null;
    /**
     * When false, skips the workflow_events emit for every lifecycle outcome
     * this function produces — `message_queued` and `message_blocked` alike
     * (testing only — default true).
     */
    emitMessageQueued?: boolean;

    // ---- Phase 0 classification + eligibility -------------------------------
    /** external | internal. Defaults to external — the stricter reading. */
    audience?: MessageAudience;
    /**
     * Platform-owned compliance class. SHOULD be supplied explicitly by every
     * caller; omission takes the bounded, counted fallback (see
     * recordCategoryFallback) which is retired by migration.
     */
    category?: MessageCategory;
    /** Domain/tenant key. Compliance-inert — may never widen consent. */
    purpose?: string | null;
    /** Resolved recipient. Absent blocks an external send (fail closed). */
    recipientPersonId?: string | null;
    /** Whether the acting operator holds the emergency-send permission. */
    emergencyPermitted?: boolean;
    /** Recorded in the snapshot for audit. */
    authorizedByUserId?: string | null;
    /** Channel usability as already resolved upstream (address + identity). */
    channelUsable?: boolean;
    /** Quiet-hours window, when one applies. */
    quietHours?: QuietHoursWindow | null;
    /**
     * The destination came from an inbound message on a tenant-owned thread, so
     * recipient resolution is satisfied without a Person. Set only by the
     * thread-bound reply path — never accepted from a client.
     */
    verifiedThreadEndpoint?: boolean;
    /** Names the caller in fallback telemetry. */
    callSite?: string;

    // ---- Phase 0 canonical rendering ---------------------------------------
    /** Owner-scoped token values. Absent = free-text send with no tokens to resolve. */
    renderContext?: RenderContext["values"];
    /** Template lineage, retained in the immutable snapshot. */
    template?: { id: string; version: number } | null;
    /** True when bodyRaw is rich content (email only). */
    bodyIsHtml?: boolean;
    /** Fingerprint from the operator's preview; a mismatch blocks as stale. */
    expectedRenderFingerprint?: string | null;
}): Promise<CanonicalEnqueueResult> {
    const ch = params.channelRaw.toLowerCase();
    const mc = metaChannel(ch);
    const orgIdTrim = params.orgId.trim();
    if (!orgIdTrim) return { communicationMessageId: null, threadId: null, skippedReason: "no_org_id" };

    const recipient =
        mc === "sms"
            ? normalizeRecipientKeySms(params.toRaw)
            : normalizeRecipientKeyEmail(params.toRaw);
    const recipientKey = mc === "in_app" && !recipient.trim() ? "_in_app" : recipient || "_empty";

    // One value, used by BOTH the conversation and the sender resolution. If these
    // could disagree, a message could be filed at Riverside and sent from the
    // organization default.
    const threadLocationId = resolveOutboundThreadLocation({ contextLocationId: params.contextLocationId });

    const threadId = await upsertCommunicationThread({
        supabase: params.supabase,
        orgId: orgIdTrim,
        primaryEntityType: params.primaryEntityType,
        primaryEntityId: params.primaryEntityId,
        channel: mc,
        recipientKey,
        // The originating operational context IS the outbound location rule.
        // `contextLocationId` was already supplied by real callers (tour comms
        // passes the subject's location) and was only ever written to metadata —
        // advisory data the runtime could not act on. It is now thread truth.
        locationId: threadLocationId,
    });

    if (!threadId) return { communicationMessageId: null, threadId: null, skippedReason: "thread_failed" };

    const meta: Record<string, unknown> = { ...params.metadata };
    if (params.contextLocationId != null) {
        meta.context_location_id = params.contextLocationId;
    }

    const wrRaw = params.workflowRunId != null ? String(params.workflowRunId).trim() : "";
    const workflowRunUuid = /^[0-9a-f-]{36}$/i.test(wrRaw) ? wrRaw : null;

    const bindRaw = params.communicationProviderBindingId != null ? String(params.communicationProviderBindingId).trim() : "";
    let bindingUuid = /^[0-9a-f-]{36}$/i.test(bindRaw) ? bindRaw : null;
    const identRaw = params.communicationIdentityId != null ? String(params.communicationIdentityId).trim() : "";
    let identityUuid = /^[0-9a-f-]{36}$/i.test(identRaw) ? identRaw : null;
    const acctRaw = params.communicationProviderAccountId != null ? String(params.communicationProviderAccountId).trim() : "";
    let accountUuid = /^[0-9a-f-]{36}$/i.test(acctRaw) ? acctRaw : null;

    // ---- SENDER IDENTITY RESOLUTION ----------------------------------------
    //
    // The canonical resolver decides WHICH identity this conversation sends as;
    // the Python dispatcher still EXECUTES via the binding it names. That seam is
    // why location awareness needed no change to a certified send path.
    //
    // It runs only when the caller did not name a binding explicitly — a composer
    // choice is an operator decision and outranks automatic resolution. For every
    // other send (the overwhelming majority) the operator never picks a provider,
    // which is the product requirement.
    //
    // The resolver is channel-neutral: `channel` is an input, not a branch, so
    // Email and SMS resolve through one implementation and may land on different
    // identities for the same location.
    if (!bindingUuid && (mc === "email" || mc === "sms")) {
        try {
            const resolution = await resolveOutboundSender({
                supabase: params.supabase,
                orgId: orgIdTrim,
                channel: mc,
                // The conversation's location IS the resolution key: location
                // identity first, organization default second, unavailable last.
                locationId: threadLocationId,
                operatorUserId: null,
                primaryEntityType: params.primaryEntityType,
                primaryEntityId: params.primaryEntityId,
                // Compatibility fallback stays ON deliberately. Identities are a
                // synchronous projection of bindings now, so a healthy binding
                // always has one and this path should never fire — but projection
                // failure is non-fatal by design, and a configuration hiccup must
                // not stop a parent being answered. Reliance is recorded in
                // metadata rather than being invisible.
                allowLegacyCompatibilityFallback: true,
            });

            if (resolution.ok) {
                bindingUuid = resolution.legacyBindingId ?? null;
                identityUuid = resolution.communicationIdentity.id;
                accountUuid = resolution.providerAccount.id;
                meta.sender_resolution = {
                    selection_reason: resolution.selectionReason,
                    fallback_level: resolution.fallbackLevel,
                    location_id: threadLocationId,
                    warnings: resolution.warnings,
                };
            } else {
                // Resolution failed. The send is NOT refused here: the dispatcher
                // has its own binding lookup and refusing would regress channels
                // that work today. The reason is recorded so a systematically
                // unresolvable organization is visible rather than silently
                // falling back forever.
                meta.sender_resolution = {
                    selection_reason: "unresolved",
                    failure_code: resolution.failureCode,
                    location_id: threadLocationId,
                    warnings: resolution.warnings,
                };
            }
        } catch (err) {
            meta.sender_resolution = {
                selection_reason: "unresolved",
                failure_code: "resolver_error",
                location_id: threadLocationId,
                error: err instanceof Error ? err.message : "unknown",
            };
        }
    }

    const emailSubjectResolved =
        mc === "email" ? resolveOutboundEmailSubject(params.primaryEntityType, params.emailSubjectRaw ?? null) : null;

    // ---- CANONICAL RENDER ---------------------------------------------------
    // Runs at the same choke point as the eligibility gate, so no TypeScript
    // path can enqueue unrendered or partially-rendered content. Client-supplied
    // "already rendered" text is re-validated here rather than trusted.
    //
    // Callers that pass no renderContext are treated as free-text: the body is
    // still validated (no surviving `{{`, channel-appropriate output), it simply
    // has no token context to resolve against.
    const renderResult = renderOutboundMessage({
        subject: emailSubjectResolved,
        body: params.bodyRaw,
        bodyIsHtml: params.bodyIsHtml === true,
        context: {
            values: params.renderContext ?? {},
            channel: mc,
            template: params.template ?? null,
        },
        expectedFingerprint: params.expectedRenderFingerprint ?? null,
    });

    if (!renderResult.ok) {
        // ---- RENDER REFUSAL — DURABLE, and deliberately NOT a message row -----
        //
        // The gap this closes (carried as D-13): an eligibility refusal and a
        // provider failure are both durable and explainable, while a RENDER
        // refusal produced only a console line. Support could see that a family
        // was never written to, and had nothing to say why.
        //
        // It is emitted as a `workflow_events` row rather than a
        // `communication_messages` row, and that distinction is the point. A
        // render-blocked message HAS NO VALIDATED BODY — the render is precisely
        // what failed. Persisting it in the message shape would put unresolved
        // tokens in a table whose rows are, by definition, things that were or
        // will be sent, and the dispatch poller selects from that table. Nothing
        // unrenderable may ever sit somewhere a poller could reach it.
        //
        // `workflow_events` is the existing canonical audit substrate — the same
        // one this module already uses for `message_queued` and `message_blocked`
        // — so this is one narrow outcome on an existing authority, not a second
        // failure ledger and not a schema expansion.
        //
        // The payload carries the CODE and the operator sentence, never the
        // unrendered body and never the template internals: an operator learns
        // that rendering failed and why, without being shown raw `{{tokens}}`.
        try {
            await emitEvent({
                org_id: orgIdTrim,
                event_type: "message_render_blocked",
                entity_type: params.primaryEntityType,
                entity_id: params.primaryEntityId,
                action_type: null,
                occurred_at: new Date().toISOString(),
                payload: {
                    thread_id: threadId,
                    channel: mc,
                    direction: "outbound" as const,
                    workflow_run_id: workflowRunUuid,
                    outcome: "blocked",
                    stage: "render",
                    reason: renderResult.block.code,
                    operator_message: renderResult.block.message,
                    template_id: params.template?.id ?? null,
                    // Deliberately absent: the body, the subject, the render
                    // context, and anything else that could carry an unresolved
                    // token or a family's words into an audit row.
                },
            });
        } catch (e) {
            // Audit failure must not become a second failure mode for the caller;
            // the send is refused either way.
            console.warn(
                "[communications] message_render_blocked emit failed",
                e instanceof Error ? e.message : e,
            );
        }

        return {
            communicationMessageId: null,
            threadId,
            skippedReason: `render_blocked:${renderResult.block.code}`,
            blockedMessage: renderResult.block.message,
        };
    }

    const rendered = renderResult.output;

    // ---- PUBLIC LINK ORIGIN --------------------------------------------------
    // The last point at which application code owns this body. Dispatch is a
    // separate worker reading queued rows, so whatever origin is frozen into the
    // text here is the origin a family sees.
    //
    // It must be re-checked HERE rather than trusted from the author, because the
    // authoring runtime and the delivering runtime are not the same machine. A
    // managed agent slot runs at `http://localhost:301X` against the same database
    // hosted staging reads, so a draft prepared in a slot reaches staging's composer
    // already carrying a localhost booking link — and an operator on staging sends it
    // without the hosted origin ever being consulted. That is exactly how a tour
    // invitation went out pointing at somebody's laptop.
    //
    // `renderResult.snapshot` is enforced alongside the body because the email that
    // actually leaves the building is built from `rendered_snapshot.html` / `.text`.
    // Repairing only `body` would fix the record and still deliver the broken link.
    const linkOrigin = enforceOutboundPublicLinkOrigin({
        body: rendered.text,
        subject: rendered.subject,
        renderedSnapshot: renderResult.snapshot,
    });

    if (!linkOrigin.ok) {
        // Refused the same way a render refusal is refused, and for the same reason:
        // there is no deliverable body. It is a `workflow_events` row and NOT a
        // `communication_messages` row, because the dispatch poller selects from that
        // table and nothing undeliverable may ever sit somewhere a poller could reach.
        try {
            await emitEvent({
                org_id: orgIdTrim,
                event_type: "message_link_origin_blocked",
                entity_type: params.primaryEntityType,
                entity_id: params.primaryEntityId,
                action_type: null,
                occurred_at: new Date().toISOString(),
                payload: {
                    thread_id: threadId,
                    channel: mc,
                    direction: "outbound" as const,
                    workflow_run_id: workflowRunUuid,
                    outcome: "blocked",
                    stage: "link_origin",
                    reason: linkOrigin.code,
                    operator_message: linkOrigin.message,
                    // The diagnostic names the configured origin and the offending
                    // links. Deliberately absent: the body and the recipient.
                    detail: linkOrigin.detail,
                },
            });
        } catch (e) {
            console.warn(
                "[communications] message_link_origin_blocked emit failed",
                e instanceof Error ? e.message : e,
            );
        }

        return {
            communicationMessageId: null,
            threadId,
            skippedReason: `link_origin_blocked:${linkOrigin.code}`,
            blockedMessage: linkOrigin.message,
        };
    }

    if (linkOrigin.rehostedCount > 0) {
        // Not silent: a link authored elsewhere was re-anchored onto this runtime.
        // Worth seeing, because it means something upstream is still minting links
        // with a foreign origin.
        console.warn("[communications] re-anchored loopback links onto the hosted origin", {
            org_id: orgIdTrim,
            thread_id: threadId,
            channel: mc,
            rehosted: linkOrigin.rehostedCount,
            origin: linkOrigin.origin,
        });
    }

    const deliverableBody = linkOrigin.body;
    const deliverableSubject = linkOrigin.subject ?? null;
    const deliverableRenderedSnapshot = linkOrigin.renderedSnapshot;

    // ---- ELIGIBILITY GATE ---------------------------------------------------
    // Evaluated immediately before the insert, so no TypeScript path can create
    // an outbound row without a decision. Blocking here creates no QUEUED row —
    // there is nothing for the worker to pick up — but it does create a durable
    // `blocked` row, so the refusal is a fact an operator can see rather than a
    // silence (see the block branch below).
    const audience: MessageAudience = params.audience ?? "external";
    const category: MessageCategory =
        params.category ?? recordCategoryFallback(params.callSite ?? "canonicalOutboundEnqueue:unspecified");
    const toAddress = params.toRaw?.trim() || null;

    const context = await loadEligibilityContext({
        supabase: params.supabase,
        orgId: orgIdTrim,
        personId: params.recipientPersonId ?? null,
        category,
        channel: mc,
        toAddress,
        // The provider destination is half of the unresolved-STOP hold identity.
        // Without it the hold can never match and the STOP stays unenforced.
        fromAddress: params.fromAddress ?? null,
    });

    const decision = context.lookupFailed
        ? {
              allowed: false,
              code: "SUPPRESSED" as const,
              reason: "Eligibility inputs could not be loaded; refusing to send.",
          }
        : evaluateEligibility({
              audience,
              category,
              channel: mc,
              unresolvedInboundStopHold: context.unresolvedInboundStopHold,
              verifiedThreadEndpoint: params.verifiedThreadEndpoint === true,
              purpose: params.purpose ?? null,
              recipientPersonId: params.recipientPersonId ?? null,
              preferenceState: context.preferenceState,
              suppressed: context.suppressed,
              channelUsable: params.channelUsable ?? true,
              quietHours: params.quietHours ?? null,
              emergencyPermitted: params.emergencyPermitted,
          });

    const snapshot: EligibilitySnapshot = {
        snapshotVersion: ELIGIBILITY_SNAPSHOT_VERSION,
        policyVersion: ELIGIBILITY_POLICY_VERSION,
        decision,
        audience,
        category,
        purpose: params.purpose ?? null,
        recipient: { personId: params.recipientPersonId ?? null, channel: mc },
        authorizedBy: {
            userId: params.authorizedByUserId ?? null,
            permission: params.emergencyPermitted ? "communications.send.emergency" : "communications.send",
        },
        identity: {
            identityId: identityUuid,
            providerAccountId: accountUuid,
            bindingId: bindingUuid,
        },
        consentInputs: context.consultedPreferenceCategory
            ? [{ category: context.consultedPreferenceCategory, state: context.preferenceState }]
            : [],
        quietHours: params.quietHours ?? null,
        evaluatedAt: new Date().toISOString(),
    };

    if (!decision.allowed) {
        // A refused send is a DECISION, not an absence.
        //
        // This branch used to warn to the server log and return, persisting
        // nothing — no message row, no workflow event. The Interactive Tour
        // certification proved the cost: a live provider bounce suppressed the
        // SMS channel, the booking committed, the email queued, and the SMS
        // simply never existed anywhere an operator could look. "We refused to
        // send" was indistinguishable from "nobody ever tried".
        //
        // The dispatcher already records its own refusals this way — status
        // 'blocked' + eligibility_decision + a message_blocked workflow_event
        // (communication_message_sender.py). Enqueue was the one boundary that
        // dropped the decision on the floor. It now writes the same three
        // things, so the operator sees one vocabulary no matter which boundary
        // refused.
        //
        // Durability must not resurrect the send: the row is written 'blocked',
        // which the poller's status filter cannot reach.
        const blockAudit = buildEnqueueBlockAudit({
            code: String(decision.code),
            operatorMessage: decision.reason,
            evaluatedAt: snapshot.evaluatedAt,
        });

        const blockedInsert = await insertCommunicationMessageRow({
            supabase: params.supabase,
            org_id: orgIdTrim,
            thread_id: threadId,
            channel: mc,
            direction: "outbound",
            status: "blocked",
            // The rendered body is retained: an operator judging a refusal needs
            // to see what would have gone out, not just that something didn't.
            body: deliverableBody,
            subject: deliverableSubject,
            workflow_run_id: workflowRunUuid,
            metadata: meta,
            to_address: toAddress,
            communication_provider_binding_id: bindingUuid,
            communication_identity_id: identityUuid,
            communication_provider_account_id: accountUuid,
            from_address: params.fromAddress?.trim() || null,
            audience,
            category,
            purpose: params.purpose ?? null,
            eligibility_snapshot: snapshot,
            rendered_snapshot: deliverableRenderedSnapshot,
            eligibility_decision: blockAudit,
            error: `policy:${decision.code}`,
        });

        const blockedId = blockedInsert.messageId ?? null;
        if (blockedInsert.error?.message) {
            // Losing the trace is worse than the block itself is surprising, so
            // it is logged loudly rather than folded into the normal warn.
            console.error("[communications] blocked-send row insert failed", {
                org_id: orgIdTrim,
                channel: mc,
                code: decision.code,
                error: blockedInsert.error.message,
            });
        }

        console.warn("[communications] send blocked by eligibility gate", {
            org_id: orgIdTrim,
            channel: mc,
            audience,
            category,
            code: decision.code,
            communication_message_id: blockedId,
        });

        if (blockedId && params.emitMessageQueued !== false) {
            // entity_type/entity_id are the CALLER's canonical entity, not the
            // org — that is what makes the event render in the operator's
            // activity feed for the thing the send was about
            // (loadOpportunityActivityEvents filters entity_type="opportunities"
            // on the opportunity id). Emitting against the org id, as the
            // dispatcher does, produces a durable but unreachable event.
            try {
                await emitEvent({
                    org_id: orgIdTrim,
                    event_type: "message_blocked",
                    entity_type: params.primaryEntityType,
                    entity_id: params.primaryEntityId,
                    action_type: null,
                    occurred_at: snapshot.evaluatedAt,
                    payload: {
                        communication_message_id: blockedId,
                        thread_id: threadId,
                        channel: mc,
                        direction: "outbound" as const,
                        workflow_run_id: workflowRunUuid,
                        ...blockAudit,
                    },
                });
            } catch (e) {
                console.warn("[communications] message_blocked emit failed", e instanceof Error ? e.message : e);
            }
        }

        return {
            communicationMessageId: null,
            threadId,
            skippedReason: `eligibility_blocked:${decision.code}`,
            blockedMessage: decision.reason,
            blockedCommunicationMessageId: blockedId,
        };
    }

    const { messageId: mid, error } = await insertCommunicationMessageRow({
        supabase: params.supabase,
        org_id: orgIdTrim,
        thread_id: threadId,
        channel: mc,
        direction: "outbound",
        body: deliverableBody,
        subject: deliverableSubject,
        workflow_run_id: workflowRunUuid,
        metadata: meta,
        to_address: toAddress,
        communication_provider_binding_id: bindingUuid,
        communication_identity_id: identityUuid,
        communication_provider_account_id: accountUuid,
        from_address: params.fromAddress?.trim() || null,
        audience,
        category,
        purpose: params.purpose ?? null,
        eligibility_snapshot: snapshot,
        rendered_snapshot: deliverableRenderedSnapshot,
    });

    if (error?.message) {
        console.warn("[communications] communication_messages insert failed", error.message);
        return { communicationMessageId: null, threadId, skippedReason: "insert_failed" };
    }

    if (mid && (params.emitMessageQueued !== false)) {
        const occurredAt = new Date().toISOString();
        const nestedPayload = {
            communication_message_id: mid,
            thread_id: threadId,
            channel: mc,
            direction: "outbound" as const,
            workflow_run_id: workflowRunUuid,
        };
        let eventId: string | null = null;
        try {
            eventId = await emitEvent({
                org_id: orgIdTrim,
                event_type: "message_queued",
                entity_type: params.primaryEntityType,
                entity_id: params.primaryEntityId,
                action_type: null,
                occurred_at: occurredAt,
                payload: nestedPayload,
            });
        } catch (e) {
            console.warn("[communications] message_queued emit failed", e instanceof Error ? e.message : e);
        }
        if (eventId) {
            const eventPayload: Record<string, unknown> = {
                event_type: "message_queued",
                occurred_at: occurredAt,
                org_id: orgIdTrim,
                entity_type: params.primaryEntityType,
                entity_id: params.primaryEntityId,
                ...nestedPayload,
            };
            try {
                const { executeWorkflowRun } = await import("@/lib/workflowRun");
                let wq = params.supabase
                    .from("workflows")
                    .select("id")
                    .eq("enabled", true)
                    .eq("event_type", "message_queued")
                    .eq("entity_type", params.primaryEntityType);
                wq = wq.or(`org_id.eq.${orgIdTrim},org_id.is.null`);
                const { data: wfs } = await wq;
                for (const wf of wfs ?? []) {
                    try {
                        await executeWorkflowRun(params.supabase, (wf as { id: string }).id, eventPayload, {
                            event_id: eventId,
                            org_id: orgIdTrim,
                        });
                    } catch (err) {
                        console.warn(
                            "[communications] message_queued executeWorkflowRun",
                            (wf as { id: string }).id,
                            err instanceof Error ? err.message : err
                        );
                    }
                }
            } catch (e) {
                console.warn("[communications] message_queued workflow dispatch", e instanceof Error ? e.message : e);
            }
        }
    }

    return { communicationMessageId: mid ?? null, threadId };
}
