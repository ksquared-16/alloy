/**
 * Run the ingress gate against real traffic — and change nothing.
 *
 * ---------------------------------------------------------------------------
 * WHAT "OBSERVE-ONLY" HAS TO MEAN TO BE WORTH ANYTHING
 * ---------------------------------------------------------------------------
 *
 * A shadow evaluation that can slow, fail, or alter ingestion is not a shadow. So the
 * guarantee here is structural rather than careful:
 *
 *   1. This runs at the very END of `ingestResendInboundEmail`, AFTER the message is
 *      persisted, after the receive event is emitted, and after the receipt is resolved.
 *      By the time it is called, ingestion has already produced every effect it is ever
 *      going to produce, and its return value is already decided. A failure here cannot
 *      reach anything, because there is nothing left to reach.
 *
 *   2. It returns `void` and swallows everything. No caller can branch on it.
 *
 *   3. Nothing reads `communication_ingress_eligibility_observations`. Not the ingestion
 *      path, not routing, not the composer, not any projection. A row is inert.
 *
 * Point 1 is why the placement is the tail and not the middle. Mid-flow, "observe-only"
 * would rest on a try/catch being correct forever; at the tail it rests on there being
 * no subsequent statement — which no future edit can quietly undo without being visible.
 *
 * ---------------------------------------------------------------------------
 * THE VOCABULARY BRIDGE, AND THE TWO KINDS THAT DO NOT EXIST
 * ---------------------------------------------------------------------------
 *
 * `IngressRelationshipKind` names seven relationships. Alloy's data model can express
 * five of them. `vendor` exists only as `contacts.vendor_id` — a table that is not
 * `persons`, so a vendor is not reachable from a sender's email through the person model
 * at all. `agency` has no representation anywhere: no table, no column, no vocabulary.
 *
 * The dangerous way to handle that is to return no relationship and let the corpus read
 * as "no agency mail arrived". It would be indistinguishable from "we cannot see agency
 * mail", and the two lead to opposite decisions about enforcement. So unsupported kinds
 * are DECLARED — `INGRESS_RELATIONSHIP_SOURCES` is the map, and any watched kind that
 * cannot be derived is recorded on the observation as a coverage gap. A false negative we
 * can name is a finding; one we cannot is a lie in a table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    evaluateEmailIngressEligibility,
    EMAIL_INGRESS_POLICY_VERSION,
    type EmailIngressDecision,
    type EmailIngressEnvelope,
    type EmailIngressPolicy,
    type IngressIdentity,
    type IngressIdentityRole,
    type IngressRelationshipKind,
    type SenderRelationship,
} from "@/lib/communications/ingress/emailIngressEligibility";

/**
 * Where each relationship kind comes from, or that it comes from nowhere.
 *
 * Exported because it is documentation the tests assert against: if a kind is ever given
 * a real source, this map and the loader must change together, and a test that reads this
 * map fails if only one of them does.
 */
export const INGRESS_RELATIONSHIP_SOURCES: Record<
    IngressRelationshipKind,
    { derivable: boolean; source: string }
> = {
    guardian: {
        derivable: true,
        source:
            "person_child_relationships(status=active) + person_child_relationship_roles(role_key in parent|guardian), where the child holds a live child_enrollment_agreements row",
    },
    former_guardian: {
        derivable: true,
        source:
            "the same parent/guardian edge, where the relationship is inactive OR the child holds no live enrollment agreement",
    },
    prospective_guardian: {
        derivable: true,
        source: "opportunity_persons on an opportunity whose status_key is not won|lost|closed",
    },
    staff: { derivable: true, source: "employments(employment_status=active)" },
    emergency_contact: {
        derivable: true,
        source: "person_child_relationship_roles(role_key=emergency_contact)",
    },
    vendor: {
        derivable: false,
        source:
            "NOT DERIVABLE from a sender address: vendors attach to contacts.vendor_id, and contacts is a different table from persons",
    },
    agency: {
        derivable: false,
        source: "NOT DERIVABLE: no table, column or vocabulary represents an agency relationship",
    },
};

/** Opportunity statuses that end demand. Everything else, including null, is still live. */
const TERMINAL_OPPORTUNITY_STATUS = new Set(["won", "lost", "closed"]);
/** Enrollment agreement statuses that still represent a current child. */
const LIVE_ENROLLMENT_STATUS = new Set(["pending_start", "active", "ending"]);

/**
 * The observe-only default watch policy.
 *
 * Deliberately the two kinds that are BOTH derivable and unambiguously the school's own
 * families — which is also exactly what the administrator UI in the capability audit shows
 * pre-ticked. Watching a kind Alloy cannot derive would fill the corpus with false
 * negatives that look like true ones; watching staff or vendors by default would prejudge
 * a permission nobody has granted.
 *
 * This is a measurement default, not a product decision. Enforcement must read a real
 * per-organization setting, and that setting does not exist yet — see the report.
 */
export const OBSERVE_ONLY_DEFAULT_WATCHED_KINDS: IngressRelationshipKind[] = [
    "guardian",
    "prospective_guardian",
];

export type EmailIngressObservationDeps = {
    supabase: SupabaseClient;
    now?: () => string;
};

export type ObserveEmailIngressInput = {
    orgId: string;
    provider: string;
    providerMessageId: string;
    envelope: EmailIngressEnvelope;
    /**
     * The thread an Alloy-minted id resolved to IN THIS ORGANIZATION, or null.
     *
     * Passed in rather than re-derived: the ingestion path has already done exactly this
     * org-scoped lookup, and doing it twice would let the observation and the runtime
     * disagree about the one piece of evidence they share.
     */
    resolvedAlloyThreadId: string | null;
};

/* ---------------------------------------------------------------------------
 * LOADING
 * ------------------------------------------------------------------------- */

function normalizeRole(raw: unknown): IngressIdentityRole {
    const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    return value === "purpose" || value === "acquisition" ? value : "conversation";
}

/**
 * The organization's receiving identities, with what each address is FOR.
 *
 * Ingress route destinations inherit their binding's role rather than carrying one:
 * a routed destination is transport for the same identity, so a purpose address keeps
 * its purpose whether mail reaches Alloy directly or through an opaque destination.
 */
export async function loadIngressIdentities(
    deps: EmailIngressObservationDeps,
    orgId: string
): Promise<{ identities: IngressIdentity[]; bindingIdByAddress: Map<string, string> }> {
    const { data: bindings } = await deps.supabase
        .from("communication_provider_bindings")
        .select("id, inbound_address, intake_role, intake_purpose_key, status, channel")
        .eq("org_id", orgId)
        .eq("channel", "email")
        .eq("status", "active");

    const identities: IngressIdentity[] = [];
    const bindingIdByAddress = new Map<string, string>();
    const roleByBinding = new Map<string, { role: IngressIdentityRole; purpose: string | null }>();

    for (const row of bindings ?? []) {
        const r = row as {
            id: string;
            inbound_address: string | null;
            intake_role: string | null;
            intake_purpose_key: string | null;
        };
        const role = normalizeRole(r.intake_role);
        const purpose = role === "purpose" ? (r.intake_purpose_key ?? null) : null;
        roleByBinding.set(String(r.id), { role, purpose });
        const address = (r.inbound_address ?? "").trim().toLowerCase();
        if (!address) continue;
        identities.push({ address, role, intakePurposeKey: purpose });
        bindingIdByAddress.set(address, String(r.id));
    }

    const { data: routes } = await deps.supabase
        .from("communication_ingress_routes")
        .select("destination, communication_provider_binding_id")
        .eq("org_id", orgId);

    for (const row of routes ?? []) {
        const r = row as { destination: string; communication_provider_binding_id: string };
        const owner = roleByBinding.get(String(r.communication_provider_binding_id));
        if (!owner) continue;
        const address = (r.destination ?? "").trim().toLowerCase();
        if (!address || bindingIdByAddress.has(address)) continue;
        identities.push({ address, role: owner.role, intakePurposeKey: owner.purpose });
        bindingIdByAddress.set(address, String(r.communication_provider_binding_id));
    }

    return { identities, bindingIdByAddress };
}

/**
 * Every relationship this sender address holds, expressed in the gate's vocabulary.
 *
 * `personIds` is the set of Persons holding the ADDRESS, not the relationship — the shared
 * household endpoint case turns on how many people write from one mailbox, and collapsing
 * that to the relationship's own person would hide it.
 */
export async function loadSenderRelationships(
    deps: EmailIngressObservationDeps,
    orgId: string,
    senderAddress: string
): Promise<SenderRelationship[]> {
    const address = (senderAddress ?? "").trim().toLowerCase();
    if (!address.includes("@")) return [];

    const { data: personRows } = await deps.supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", address)
        .limit(22);
    const personIds = (personRows ?? []).map((r) => String((r as { id: string }).id));
    if (personIds.length === 0) return [];

    const [relRes, empRes, oppRes] = await Promise.all([
        deps.supabase
            .from("person_child_relationships")
            .select("id, status, customer_member_id")
            .eq("org_id", orgId)
            .in("person_id", personIds),
        deps.supabase
            .from("employments")
            .select("employment_status")
            .eq("org_id", orgId)
            .in("person_id", personIds),
        deps.supabase
            .from("opportunity_persons")
            .select("opportunity_id")
            .eq("org_id", orgId)
            .in("person_id", personIds),
    ]);

    const relationships = (relRes.data ?? []) as Array<{
        id: string;
        status: string | null;
        customer_member_id: string | null;
    }>;

    const out: SenderRelationship[] = [];
    const push = (kind: IngressRelationshipKind, active: boolean) => {
        if (out.some((r) => r.kind === kind && r.status === (active ? "active" : "inactive"))) return;
        out.push({ kind, status: active ? "active" : "inactive", personIds });
    };

    if (relationships.length > 0) {
        // `.in(col, [])` is not an empty result in PostgREST, it is a syntax error. Every
        // list built here is therefore guarded at its source rather than at the call, so a
        // relationship row with no child cannot silently kill the whole observation.
        const childIds = relationships.map((r) => r.customer_member_id).filter((v): v is string => !!v);
        const [roleRes, enrollRes] = await Promise.all([
            deps.supabase
                .from("person_child_relationship_roles")
                .select("relationship_id, role_key, is_active")
                .eq("org_id", orgId)
                .in(
                    "relationship_id",
                    relationships.map((r) => r.id)
                ),
            childIds.length > 0
                ? deps.supabase
                      .from("child_enrollment_agreements")
                      .select("customer_member_id, status")
                      .eq("org_id", orgId)
                      .in("customer_member_id", childIds)
                : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        ]);

        const liveChildren = new Set(
            ((enrollRes.data ?? []) as Array<{ customer_member_id: string; status: string }>)
                .filter((e) => LIVE_ENROLLMENT_STATUS.has(String(e.status)))
                .map((e) => String(e.customer_member_id))
        );

        const rolesByRelationship = new Map<string, string[]>();
        for (const row of (roleRes.data ?? []) as Array<{
            relationship_id: string;
            role_key: string;
            is_active: boolean | null;
        }>) {
            if (row.is_active === false) continue;
            const key = String(row.relationship_id);
            rolesByRelationship.set(key, [
                ...(rolesByRelationship.get(key) ?? []),
                String(row.role_key ?? "").trim().toLowerCase(),
            ]);
        }

        for (const rel of relationships) {
            const roles = rolesByRelationship.get(String(rel.id)) ?? [];
            const relationshipActive = String(rel.status ?? "").toLowerCase() === "active";
            const childIsLive = rel.customer_member_id ? liveChildren.has(String(rel.customer_member_id)) : false;

            if (roles.includes("emergency_contact")) push("emergency_contact", relationshipActive);
            if (roles.includes("parent") || roles.includes("guardian")) {
                // A guardian of a child who is no longer enrolled is not a current
                // guardian, however active the relationship row still is. Reading only
                // the edge would keep admitting mail from families who left years ago —
                // the exact "email exists somewhere in Alloy" rule this gate refuses.
                if (relationshipActive && childIsLive) push("guardian", true);
                else push("former_guardian", false);
            }
        }
    }

    const employments = (empRes.data ?? []) as Array<{ employment_status: string | null }>;
    if (employments.length > 0) {
        push(
            "staff",
            employments.some((e) => String(e.employment_status ?? "").toLowerCase() === "active")
        );
    }

    const opportunityIds = [
        ...new Set(
            ((oppRes.data ?? []) as Array<{ opportunity_id: string }>)
                .map((o) => String(o.opportunity_id))
                .filter(Boolean)
        ),
    ];
    if (opportunityIds.length > 0) {
        const { data: opps } = await deps.supabase
            .from("opportunities")
            .select("id, status_key")
            .eq("org_id", orgId)
            .in("id", opportunityIds);
        const live = ((opps ?? []) as Array<{ status_key: string | null }>).some(
            (o) => !TERMINAL_OPPORTUNITY_STATUS.has(String(o.status_key ?? "").toLowerCase())
        );
        push("prospective_guardian", live);
    }

    return out;
}

/** Watched kinds the data model cannot answer. A named false-negative, not a silent one. */
export function unsupportedWatchedKinds(watched: readonly IngressRelationshipKind[]): IngressRelationshipKind[] {
    return watched.filter((kind) => !INGRESS_RELATIONSHIP_SOURCES[kind].derivable);
}

/* ---------------------------------------------------------------------------
 * OBSERVING
 * ------------------------------------------------------------------------- */

/**
 * Whether an observation watched mail arrive, or judged mail long since filed.
 *
 * `historical_replay` rows are produced from an envelope RECONSTRUCTED out of canonical
 * columns, and a reconstruction cannot carry evidence that was never captured — above all
 * the transport's authentication result, absent for every message received before this
 * work landed. Lane B outcomes in a replay are therefore a statement about missing
 * evidence, not about the policy, and the two populations must never be aggregated.
 */
export type IngressEvaluationMode = "live_observed" | "historical_replay";

export type EmailIngressObservationRow = {
    org_id: string;
    provider: string;
    channel: "email";
    provider_message_id: string;
    decision: EmailIngressDecision["disposition"];
    lane: EmailIngressDecision["lane"];
    reason_code: EmailIngressDecision["reasonCode"];
    confidence_basis: "deterministic";
    matched_relationship_type: string | null;
    matched_identity_id: string | null;
    matched_thread_id: string | null;
    intake_purpose_key: string | null;
    sender_assertion: EmailIngressDecision["senderAssertion"]["kind"];
    unsupported_watch_kinds: string[];
    evaluation_mode: IngressEvaluationMode;
    evaluated_at: string;
    policy_version: string;
};

/**
 * The decision, reduced to what may be written down.
 *
 * Pure and exported so a test can assert the shape directly. That matters more than
 * convenience: the privacy claim about this table is "it holds no message content", and
 * the only way to prove that claim rather than assert it is to check every value this
 * function can emit. `evidence` is deliberately dropped — it is a readable sentence built
 * for a human, and sentences are exactly how addresses and subjects leak into a table
 * that promised not to hold them.
 */
export function projectObservationRow(params: {
    input: ObserveEmailIngressInput;
    decision: EmailIngressDecision;
    bindingId: string | null;
    unsupportedKinds: IngressRelationshipKind[];
    evaluationMode: IngressEvaluationMode;
    evaluatedAt: string;
}): EmailIngressObservationRow {
    const { decision } = params;
    const assertion = decision.senderAssertion;
    return {
        org_id: params.input.orgId,
        provider: params.input.provider,
        channel: "email",
        provider_message_id: params.input.providerMessageId,
        decision: decision.disposition,
        lane: decision.lane,
        reason_code: decision.reasonCode,
        confidence_basis: "deterministic",
        matched_relationship_type: assertion.kind === "unknown" ? null : assertion.relationship.kind,
        matched_identity_id: params.bindingId,
        matched_thread_id: decision.matchedThreadId,
        intake_purpose_key: decision.intakePurposeKey,
        sender_assertion: assertion.kind,
        unsupported_watch_kinds: params.unsupportedKinds,
        evaluation_mode: params.evaluationMode,
        evaluated_at: params.evaluatedAt,
        policy_version: decision.policyVersion,
    };
}

/**
 * The org's watch policy for this evaluation.
 *
 * Reads `org_settings.metadata.email_ingress.watched_relationship_kinds` when present, so
 * an organization can be measured under its own intended policy without a code change,
 * and falls back to the observe-only default. Unknown kinds in the setting are dropped
 * rather than trusted — a typo must not silently become a watch rule.
 */
export async function resolveWatchedRelationshipKinds(
    deps: EmailIngressObservationDeps,
    orgId: string
): Promise<IngressRelationshipKind[]> {
    const { data } = await deps.supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", orgId)
        .maybeSingle();
    const metadata = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const section = (metadata as Record<string, unknown>)["email_ingress"];
    const raw =
        section && typeof section === "object"
            ? (section as Record<string, unknown>)["watched_relationship_kinds"]
            : undefined;
    if (!Array.isArray(raw)) return OBSERVE_ONLY_DEFAULT_WATCHED_KINDS;
    const known = Object.keys(INGRESS_RELATIONSHIP_SOURCES) as IngressRelationshipKind[];
    const picked = raw
        .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
        .filter((v): v is IngressRelationshipKind => (known as string[]).includes(v));
    return picked;
}

/**
 * Evaluate and record. Never throws, never returns anything a caller could act on.
 *
 * The `void` return type is part of the contract, not a convenience: an observe-only
 * hook that returned a decision would eventually be read by something, and the first
 * reader is the end of observe-only.
 */
export async function observeEmailIngressEligibility(
    input: ObserveEmailIngressInput,
    deps: EmailIngressObservationDeps
): Promise<void> {
    try {
        const now = deps.now ?? (() => new Date().toISOString());
        const [{ identities, bindingIdByAddress }, watchedRelationshipKinds] = await Promise.all([
            loadIngressIdentities(deps, input.orgId),
            resolveWatchedRelationshipKinds(deps, input.orgId),
        ]);
        const senderRelationships = await loadSenderRelationships(deps, input.orgId, input.envelope.sender);

        const policy: EmailIngressPolicy = {
            orgId: input.orgId,
            identities,
            watchedRelationshipKinds,
        };
        const decision = evaluateEmailIngressEligibility({
            envelope: input.envelope,
            policy,
            senderRelationships,
            resolvedAlloyThreadId: input.resolvedAlloyThreadId,
        });

        const bindingId = decision.identity ? (bindingIdByAddress.get(decision.identity.address) ?? null) : null;

        await deps.supabase.from("communication_ingress_eligibility_observations").insert(
            projectObservationRow({
                input,
                decision,
                bindingId,
                unsupportedKinds: unsupportedWatchedKinds(watchedRelationshipKinds),
                // The live hook is the only caller that may claim this, and it says so
                // rather than relying on the column default — a default is a guess about
                // who wrote the row, and this table's whole value is knowing that.
                evaluationMode: "live_observed",
                evaluatedAt: now(),
            })
        );
    } catch {
        // Deliberately silent and deliberately total. Ingestion has already completed by
        // the time this runs; there is no state to unwind and nothing a caller could do.
        // A duplicate insert (same message, same policy) lands here too, which is correct:
        // re-observing a deterministic decision is a no-op, not an error.
    }
}

/**
 * Evaluate without writing. The measurement path, and the one tests use to build a matrix
 * over a corpus without touching a database.
 */
export function evaluateForObservation(params: {
    input: ObserveEmailIngressInput;
    identities: IngressIdentity[];
    senderRelationships: SenderRelationship[];
    watchedRelationshipKinds: IngressRelationshipKind[];
}): EmailIngressDecision {
    return evaluateEmailIngressEligibility({
        envelope: params.input.envelope,
        policy: {
            orgId: params.input.orgId,
            identities: params.identities,
            watchedRelationshipKinds: params.watchedRelationshipKinds,
        },
        senderRelationships: params.senderRelationships,
        resolvedAlloyThreadId: params.input.resolvedAlloyThreadId,
    });
}

export { EMAIL_INGRESS_POLICY_VERSION };
