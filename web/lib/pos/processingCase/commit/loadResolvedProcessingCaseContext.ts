/**
 * The RESOLVED PROCESSING CASE is the authority on which family a case belongs to.
 *
 * A public submission is truthful when created: the household is unresolved and
 * `form_submissions.customer_id` is null. That row is source evidence and must stay immutable — it
 * is never back-filled to make it look as though the household was known at intake time. Identity
 * resolution belongs to Processing, so downstream Processing actions consume the resolved CASE.
 *
 * This module is the one place that knows how resolution is stored. V1 reads the existing
 * `metadata.operational_result`, but consumers depend on this typed projection, never on raw
 * metadata paths — so promoting resolution to first-class columns later changes only this file.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ProcessingCaseResolutionStatus = "resolved" | "unresolved" | "failed";

export type ResolvedProcessingCaseContext = {
    case_id: string;
    organization_id: string;
    /** Resolved household. Null until identity resolution succeeds. */
    customer_id: string | null;
    /** Active children of the resolved household — the only valid anchor candidates. */
    customer_member_ids: string[];
    /** Only set when resolution named a specific child; never inferred from a single-child household. */
    primary_customer_member_id: string | null;
    person_ids: string[];
    operational_record_ids: Record<string, string>;
    resolution_status: ProcessingCaseResolutionStatus;
    /**
     * Fingerprint of THIS resolution. Changes when the case resolves to a different household or is
     * re-resolved, so a proposal reviewed against one family can never commit against another.
     */
    resolution_revision: string;
    resolved_at: string | null;
    /** Where the resolution was read from — V1 always the operational result. */
    source: "operational_result";
    /** False when the case is no longer in a completed/resolved state. */
    is_current: boolean;
};

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Stable across identical resolutions, different across changed ones. */
function fingerprint(parts: Array<string | null>): string {
    return parts.map((p) => p ?? "-").join("|");
}

/**
 * The children a relationship may be anchored to, for ONE household.
 *
 * ## Why this is its own function
 *
 * The commit runtime had two different readings of "which family is this". The EXECUTOR decided the
 * household through `resolveCommitHousehold`, which accepts the submission's own `customer_id` when
 * the case carries no operational resolution. The ANCHOR CANDIDATES were loaded only for the
 * household named in `metadata.operational_result.records.household`.
 *
 * For a Processing case opened from an enrollment packet those are not the same thing: the case has
 * no operational result yet, so the household came from the submission and the candidate list was
 * empty. Every anchor the operator named was then rejected as `anchor_not_found` — a child who was
 * plainly in the household, refused as if they belonged to someone else. MEASURED against a real
 * case: the executor resolved role `emergency_contact`, command `add_emergency_contact`, scope
 * `this_child` and destination `person_child_relationships`, and then refused its own anchor.
 *
 * One authority now: candidates are always the active children of whichever household the commit
 * actually resolved. This LOOSENS nothing — `resolveRelationshipAnchor` still validates every
 * candidate for org and household, so an anchor from another family is still refused, and the
 * household itself is still server-resolved and never client-asserted.
 */
export async function loadHouseholdAnchorCandidates(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string },
): Promise<string[]> {
    const { data: kids } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .eq("relationship", "child")
        .eq("is_active", true);
    return (kids ?? []).map((k: { id: string }) => k.id);
}

export async function loadResolvedProcessingCaseContext(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string },
): Promise<ResolvedProcessingCaseContext | null> {
    const { data: row, error } = await supabase
        .from("processing_cases")
        .select("id, org_id, status, metadata, updated_at")
        .eq("org_id", args.orgId)
        .eq("id", args.caseId)
        .maybeSingle();
    if (error || !row) return null;

    const caseRow = row as { id: string; org_id: string; status?: string | null; metadata?: Record<string, unknown> | null; updated_at?: string | null };
    const metadata = caseRow.metadata ?? {};
    const op = (metadata.operational_result ?? null) as Record<string, unknown> | null;
    const records = (op?.records ?? {}) as Record<string, unknown>;

    const customerId = str(records.household);
    const childId = str(records.child);
    const personId = str(records.person);

    // Anchor candidates for the household THIS projection resolved. The commit does not read them
    // from here — see `loadHouseholdAnchorCandidates` — because the household it commits against is
    // not always this one.
    const memberIds = customerId
        ? await loadHouseholdAnchorCandidates(supabase, { orgId: args.orgId, customerId })
        : [];

    const status: ProcessingCaseResolutionStatus = customerId
        ? "resolved"
        : op
          ? "failed"
          : "unresolved";

    const operationalRecordIds: Record<string, string> = {};
    for (const [k, v] of Object.entries(records)) {
        const id = str(v);
        if (id) operationalRecordIds[k] = id;
    }

    return {
        case_id: caseRow.id,
        organization_id: caseRow.org_id,
        customer_id: customerId,
        customer_member_ids: memberIds,
        primary_customer_member_id: childId,
        person_ids: personId ? [personId] : [],
        operational_record_ids: operationalRecordIds,
        resolution_status: status,
        resolution_revision: fingerprint([
            customerId,
            str(op?.attemptId),
            str(op?.recordId),
            caseRow.status ?? null,
        ]),
        resolved_at: caseRow.updated_at ?? null,
        source: "operational_result",
        is_current: caseRow.status === "completed" || caseRow.status === "archived" ? true : status === "resolved",
    };
}

export type HouseholdResolution =
    | { ok: true; customer_id: string; revision: string; context: ResolvedProcessingCaseContext }
    | { ok: false; status: 400 | 403 | 409; code: "case_has_no_resolved_household" | "resolution_conflict" | "resolution_stale" | "identity_unresolved"; reason: string };

/**
 * Decide which household a relationship commit attaches to.
 *
 * Precedence is explicit and never silent:
 *   1. the resolved case
 *   2. the submission's own customer_id, but ONLY when it was present at submission time AND agrees
 *   3. disagreement is a CONFLICT, not a choice
 *   4. neither present -> case_has_no_resolved_household
 * The household is never inferred from guardian email, child name, or any other submission field.
 */
export function resolveCommitHousehold(input: {
    context: ResolvedProcessingCaseContext | null;
    /** Present only when the submission genuinely carried a household at intake time. */
    submissionCustomerId: string | null;
    /** When supplied, the resolution the operator reviewed. A change means stale. */
    expectedRevision?: string | null;
}): HouseholdResolution {
    const { context, submissionCustomerId, expectedRevision } = input;

    if (!context) {
        return { ok: false, status: 400, code: "case_has_no_resolved_household", reason: "Processing case context could not be loaded." };
    }

    if (context.resolution_status === "failed") {
        return { ok: false, status: 400, code: "identity_unresolved", reason: "Case identity resolution did not complete — resolve identity before committing relationships." };
    }

    const resolved = context.customer_id;
    if (!resolved && !submissionCustomerId) {
        return {
            ok: false,
            status: 400,
            code: "case_has_no_resolved_household",
            reason: "This case has no resolved household. Approve identity resolution before committing relationships.",
        };
    }

    if (resolved && submissionCustomerId && resolved !== submissionCustomerId) {
        return {
            ok: false,
            status: 409,
            code: "resolution_conflict",
            reason: "The submission's household and the resolved case household disagree — resolve the conflict before committing.",
        };
    }

    const customer_id = resolved ?? submissionCustomerId!;

    if (expectedRevision && expectedRevision !== context.resolution_revision) {
        return {
            ok: false,
            status: 409,
            code: "resolution_stale",
            reason: "Case identity was re-resolved after this proposal was reviewed — re-approve before committing.",
        };
    }

    return { ok: true, customer_id, revision: context.resolution_revision, context };
}
