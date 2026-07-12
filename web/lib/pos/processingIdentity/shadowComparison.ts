import type { ApplyFormIntakeSafeResult } from "@/lib/forms/intake/applyFormIntakeSafe";
import type { IdentityCandidate } from "@/lib/identity";
import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { CanonicalResolutionRunResult } from "./canonicalResolutionEngine";

export type ShadowComparisonOutcome =
    | "equivalent"
    | "legacy_created_duplicate_risk"
    | "canonical_found_existing"
    | "canonical_conflicted"
    | "canonical_unresolved"
    | "legacy_and_canonical_disagree"
    | "canonical_error";

export type ShadowComparisonRecord = {
    outcome: ShadowComparisonOutcome;
    divergence_reason_codes: string[];
    legacy: {
        person_id: string | null;
        customer_id: string | null;
        customer_member_id: string | null;
        opportunity_id: string | null;
    };
    canonical: {
        parent_record_id: string | null;
        household_record_id: string | null;
        child_record_id: string | null;
        lead_record_id: string | null;
        parent_band: string | null;
        child_band: string | null;
        contradictions: string[];
    };
    resolver_version: string;
    duration_ms: number;
    errors: string[];
};

function topCandidate(candidates: IdentityCandidate[] | undefined, entityType: string): IdentityCandidate | null {
    if (!candidates?.length) return null;
    return candidates.find((c) => c.entityType === entityType) ?? candidates[0] ?? null;
}

export function buildShadowComparisonRecord(input: {
    legacy: ApplyFormIntakeSafeResult;
    resolution: CanonicalResolutionRunResult;
    durationMs: number;
    errors?: string[];
}): ShadowComparisonRecord {
    const parent = topCandidate(input.resolution.graph.parents, "person");
    const child = topCandidate(input.resolution.graph.children, "child");
    const household = topCandidate(input.resolution.graph.household, "household");
    const lead = topCandidate(input.resolution.graph.leads, "lead");

    const contradictions = [...(parent?.blockingConflicts ?? []), ...(child?.blockingConflicts ?? [])].map(
        (s) => s.reasonCode,
    );

    const canonical = {
        parent_record_id: parent?.recordId && parent.recordId !== "none" ? parent.recordId : null,
        household_record_id: household?.recordId ?? null,
        child_record_id: child?.recordId && child.recordId !== "none" ? child.recordId : null,
        lead_record_id: lead?.recordId && lead.recordId !== "ambiguous" ? lead.recordId : null,
        parent_band: parent?.confidenceBand ?? null,
        child_band: child?.confidenceBand ?? null,
        contradictions,
    };

    const legacyIds = {
        person_id: input.legacy.person_id,
        customer_id: input.legacy.customer_id,
        customer_member_id: input.legacy.customer_member_id,
        opportunity_id: input.legacy.opportunity_id,
    };

    const divergence: string[] = [];
    let outcome: ShadowComparisonOutcome = "equivalent";

    if (input.errors?.length) {
        outcome = "canonical_error";
        divergence.push("canonical_runtime_error");
    } else if (parent?.confidenceBand === "conflicted" || child?.confidenceBand === "conflicted") {
        outcome = "canonical_conflicted";
        divergence.push("canonical_conflict");
    } else if (!parent && !child && !household) {
        outcome = "canonical_unresolved";
        divergence.push("no_canonical_candidates");
    } else if (
        legacyIds.person_id &&
        canonical.parent_record_id &&
        legacyIds.person_id !== canonical.parent_record_id &&
        (parent?.confidenceBand === "confirmed" || parent?.confidenceBand === "strong")
    ) {
        outcome = "legacy_created_duplicate_risk";
        divergence.push("legacy_created_canonical_found_existing");
    } else if (
        canonical.parent_record_id &&
        legacyIds.person_id &&
        canonical.parent_record_id !== legacyIds.person_id
    ) {
        outcome = "legacy_and_canonical_disagree";
        divergence.push("person_id_mismatch");
    } else if (
        !legacyIds.person_id &&
        canonical.parent_record_id &&
        (parent?.confidenceBand === "confirmed" || parent?.confidenceBand === "strong")
    ) {
        outcome = "canonical_found_existing";
        divergence.push("canonical_found_legacy_missing");
    } else if (
        canonical.parent_record_id &&
        legacyIds.person_id &&
        canonical.parent_record_id === legacyIds.person_id
    ) {
        outcome = "equivalent";
    } else {
        outcome = "equivalent";
    }

    return {
        outcome,
        divergence_reason_codes: divergence,
        legacy: legacyIds,
        canonical,
        resolver_version: IDENTITY_RESOLVER_VERSION,
        duration_ms: input.durationMs,
        errors: input.errors ?? [],
    };
}
