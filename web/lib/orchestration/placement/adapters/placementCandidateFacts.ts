/**
 * placement_candidate → evaluator {@link FactBag} (Phase 2 — Card 2).
 */

import { buildOpportunityPlacementFacts } from "@/lib/orchestration/placement/adapters/opportunityPlacementFacts";
import {
    CHILDCARE_PLACEMENT_FACT_START_DATE,
    CHILDCARE_PLACEMENT_FACT_PROGRAM_ROOM_GROUP,
    CHILDCARE_PLACEMENT_FACT_WAIT_SINCE,
} from "@/lib/orchestration/placement/childcarePlacementFactContractV1";
import {
    CHILDCARE_PLACEMENT_V2_FACT_HAS_ACTIVE_OVERRIDE,
    CHILDCARE_PLACEMENT_V2_FACT_IS_SYNTHETIC_FALLBACK,
    CHILDCARE_PLACEMENT_V2_FACT_LINK_MODE,
    CHILDCARE_PLACEMENT_V2_FACT_PROGRAM_ROOM_COHORT_KEY,
    CHILDCARE_PLACEMENT_V2_FACT_PROGRAM_ROOM_GROUP_LABEL,
} from "@/lib/orchestration/placement/childcarePlacementFactContractV2";
import type {
    PlacementCandidateActiveOverrideSummary,
    PlacementCandidateRow,
    PlacementLinkMode,
} from "@/lib/orchestration/placement/placementCandidateTypes";
import type { FactBag, FactValue, PlacementEvaluateInput, PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";
import { evaluatePlacementPriority } from "@/lib/orchestration/placement/evaluatePlacementPriority";
import { applyPlacementCandidateOverrides } from "@/lib/orchestration/placement/applyPlacementCandidateOverrides";
import { filterActivePlacementOverrides } from "@/lib/orchestration/placement/filterActivePlacementOverrides";
import { resolveProgramRoomCohort } from "@/lib/orchestration/placement/resolveProgramRoomCohort";
import {
    mergePlacementForecastIntoFactBag,
    resolvePlacementCandidateForecast,
} from "@/lib/orchestration/placement/placementForecastFactsProvider";
import {
    resolveHouseholdPlacementFactsForCandidate,
    shouldUseRecordSourcedHouseholdPlacementFacts,
    type HouseholdPlacementFactCandidateContext,
    type HouseholdPlacementFactHouseholdSlice,
} from "@/lib/orchestration/placement/householdPlacementFacts";

export type BuildPlacementCandidateFactsInput = {
    candidate: Pick<
        PlacementCandidateRow,
        | "id"
        | "opportunity_id"
        | "opportunity_customer_member_id"
        | "customer_member_id"
        | "person_id"
        | "site_id"
        | "is_synthetic_fallback"
        | "program_room_cohort_key"
        | "program_room_group_label"
        | "wait_since"
        | "start_date"
        | "metadata"
    >;
    opportunity: {
        id: string;
        created_at?: string | null;
        metadata?: Record<string, unknown> | null;
    };
    link_mode?: PlacementLinkMode | null;
    active_overrides?: PlacementCandidateActiveOverrideSummary[];
    wait_since_fallback_created_at?: boolean;
    household?: HouseholdPlacementFactHouseholdSlice | null;
};

function factPresent(value: string | number | boolean, source: string): FactValue {
    return { presence: "present", value, source };
}

function factIsoOrAbsent(raw: string | null | undefined, source: string): FactValue {
    if (raw == null || typeof raw !== "string") return { presence: "absent", source };
    const t = raw.trim();
    if (!t || !Number.isFinite(Date.parse(t))) return { presence: "absent", source };
    return { presence: "present", value: t, source };
}

function factDateOrAbsent(raw: string | null | undefined, source: string): FactValue {
    if (raw == null || typeof raw !== "string") return { presence: "absent", source };
    const t = raw.trim();
    if (!t) return { presence: "absent", source };
    return { presence: "present", value: t, source };
}

export function buildPlacementCandidateFacts(input: BuildPlacementCandidateFactsInput): FactBag {
    const linkMode: PlacementLinkMode = input.link_mode ?? "independent";
    const overrides = input.active_overrides ?? [];

    const base = buildOpportunityPlacementFacts(
        { created_at: input.opportunity.created_at ?? null, metadata: input.opportunity.metadata ?? null },
        { wait_since_fallback_created_at: input.wait_since_fallback_created_at === true }
    );

    const cohort = resolveProgramRoomCohort({
        program_room_cohort_key: input.candidate.program_room_cohort_key,
        program_room_group_label: input.candidate.program_room_group_label,
        metadata: input.candidate.metadata ?? input.opportunity.metadata ?? null,
    });

    const waitSince = input.candidate.wait_since?.trim()
        ? factIsoOrAbsent(input.candidate.wait_since, "placement_candidates.wait_since")
        : base[CHILDCARE_PLACEMENT_FACT_WAIT_SINCE];

    const desiredStart = input.candidate.start_date?.trim()
        ? factDateOrAbsent(input.candidate.start_date, "placement_candidates.start_date")
        : base[CHILDCARE_PLACEMENT_FACT_START_DATE];

    const forecast = resolvePlacementCandidateForecast({
        candidateMetadata: input.candidate.metadata ?? null,
        opportunityMetadata: input.opportunity.metadata ?? null,
    });

    let householdFacts: ReturnType<typeof resolveHouseholdPlacementFactsForCandidate> | null = null;
    if (input.household && shouldUseRecordSourcedHouseholdPlacementFacts()) {
        const candidateCtx: HouseholdPlacementFactCandidateContext = {
            placement_candidate_id: input.candidate.id,
            opportunity_customer_member_id: input.candidate.opportunity_customer_member_id,
            customer_member_id: input.candidate.customer_member_id,
            person_id: input.candidate.person_id,
            site_id: input.candidate.site_id,
        };
        householdFacts = resolveHouseholdPlacementFactsForCandidate(input.household, candidateCtx);
    }

    const coreFacts = {
        ...(householdFacts ? { ...base, ...householdFacts } : base),
        [CHILDCARE_PLACEMENT_FACT_WAIT_SINCE]: waitSince,
        [CHILDCARE_PLACEMENT_FACT_START_DATE]: desiredStart,
        [CHILDCARE_PLACEMENT_V2_FACT_PROGRAM_ROOM_COHORT_KEY]: factPresent(
            cohort.program_room_cohort_key,
            "placement_candidates.program_room_cohort_key"
        ),
        [CHILDCARE_PLACEMENT_V2_FACT_PROGRAM_ROOM_GROUP_LABEL]: factPresent(
            cohort.program_room_group_label,
            "placement_candidates.program_room_group_label"
        ),
        [CHILDCARE_PLACEMENT_FACT_PROGRAM_ROOM_GROUP]: factPresent(
            cohort.program_room_group_label,
            "placement_candidates.program_room_group_label"
        ),
        [CHILDCARE_PLACEMENT_V2_FACT_IS_SYNTHETIC_FALLBACK]: factPresent(
            input.candidate.is_synthetic_fallback,
            "placement_candidates.is_synthetic_fallback"
        ),
        [CHILDCARE_PLACEMENT_V2_FACT_LINK_MODE]: factPresent(linkMode, "placement_link_groups.link_mode"),
        [CHILDCARE_PLACEMENT_V2_FACT_HAS_ACTIVE_OVERRIDE]: factPresent(
            overrides.length > 0,
            "placement_overrides.active"
        ),
    };

    return mergePlacementForecastIntoFactBag(coreFacts, forecast);
}

export type EvaluatePlacementCandidateParams = {
    candidate: PlacementCandidateRow;
    opportunity: BuildPlacementCandidateFactsInput["opportunity"];
    cohort: PlacementEvaluateInput["cohort"];
    profile: PlacementProfile;
    now_ms: number;
    link_mode?: PlacementLinkMode | null;
    active_overrides?: PlacementCandidateActiveOverrideSummary[];
    evaluator_version?: string;
    locale?: string;
    wait_since_fallback_created_at?: boolean;
    household?: HouseholdPlacementFactHouseholdSlice | null;
};

/** Pure helper — evaluate one placement candidate (Card 2; QueueService wiring is Card 3). */
export function evaluatePlacementCandidate(params: EvaluatePlacementCandidateParams) {
    const activeOverrides = filterActivePlacementOverrides(params.active_overrides ?? [], params.now_ms);

    const facts = buildPlacementCandidateFacts({
        candidate: params.candidate,
        opportunity: params.opportunity,
        link_mode: params.link_mode,
        active_overrides: activeOverrides,
        wait_since_fallback_created_at: params.wait_since_fallback_created_at,
        household: params.household,
    });

    const policyResult = evaluatePlacementPriority({
        evaluator_version: params.evaluator_version ?? "placement_candidate_v2",
        now_ms: params.now_ms,
        entity: { entity_type: "placement_candidate", entity_id: params.candidate.id },
        cohort: params.cohort,
        facts,
        profile: params.profile,
        locale: params.locale,
    });

    if (!policyResult.ok) return policyResult;

    const merged = applyPlacementCandidateOverrides({
        policy: policyResult.value,
        profile: params.profile,
        active_overrides: activeOverrides,
    });

    return {
        ok: true as const,
        value: {
            ...policyResult.value,
            snapshot: merged.effective,
            policy_snapshot: merged.policy_snapshot,
            override_applied: merged.applied,
        },
    };
}
