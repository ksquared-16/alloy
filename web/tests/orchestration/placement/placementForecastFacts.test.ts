import { describe, expect, it } from "vitest";
import {
    PLACEMENT_FORECAST_FACT_EXPECTED_OPENINGS_COUNT,
    PLACEMENT_FORECAST_FACT_PROJECTED_CAPACITY_PRESSURE,
} from "@/lib/orchestration/placement/placementForecastFactContract";
import {
    buildDefaultPlacementForecastFacts,
    buildPlacementForecastPreview,
    buildPlacementForecastUiHints,
    mergePlacementForecastIntoFactBag,
    resolvePlacementCandidateForecast,
} from "@/lib/orchestration/placement/placementForecastFactsProvider";
import {
    PLACEMENT_FORECAST_FIXTURE_FALL_OPENING,
    PLACEMENT_FORECAST_FIXTURE_HIGH_DEMAND,
    PLACEMENT_FORECAST_FIXTURE_OPENING_SOON,
    placementForecastMetadataFixture,
} from "@/lib/orchestration/placement/placementForecastFixtures";
import {
    buildPlacementCandidateFacts,
    evaluatePlacementCandidate,
} from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import type { PlacementCandidateRow } from "@/lib/orchestration/placement/placementCandidateTypes";
import { expandOpportunityRowsToPlacementCandidateRows } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { parsePlacementWaitlistCandidateRowVm } from "@/lib/ui-v2/queuePlacementWaitlistCandidatePresentation";

const CANDIDATE: PlacementCandidateRow = {
    id: "cand_forecast",
    org_id: "org_1",
    opportunity_id: "opp_1",
    customer_id: "cust_1",
    opportunity_customer_member_id: "ocm_1",
    customer_member_id: "cm_1",
    person_id: "person_1",
    site_id: null,
    is_synthetic_fallback: false,
    program_room_cohort_key: "pre_k_4_5_years",
    program_room_group_label: "Pre-K — 4–5 years",
    wait_since: "2024-06-01T12:00:00.000Z",
    desired_start_date: "2024-09-01",
    status: "active",
    seed_key: "pc_v1:opp_1:ocm_1:pre_k",
    metadata: null,
};

describe("placementForecastFactsProvider", () => {
    it("returns null when no forecast metadata", () => {
        expect(resolvePlacementCandidateForecast({ candidateMetadata: null })).toBeNull();
    });

    it("prefers candidate metadata over opportunity metadata", () => {
        const forecast = resolvePlacementCandidateForecast({
            candidateMetadata: placementForecastMetadataFixture(PLACEMENT_FORECAST_FIXTURE_OPENING_SOON),
            opportunityMetadata: placementForecastMetadataFixture(PLACEMENT_FORECAST_FIXTURE_HIGH_DEMAND),
        });
        expect(forecast?.expected_openings_count).toBe(1);
    });

    it("defaults forecast fact keys to unknown", () => {
        const facts = buildDefaultPlacementForecastFacts();
        expect(facts[PLACEMENT_FORECAST_FACT_EXPECTED_OPENINGS_COUNT]).toMatchObject({ presence: "unknown" });
    });

    it("merges present forecast facts when metadata supplied", () => {
        const forecast = resolvePlacementCandidateForecast({
            candidateMetadata: placementForecastMetadataFixture(PLACEMENT_FORECAST_FIXTURE_HIGH_DEMAND),
        });
        const merged = mergePlacementForecastIntoFactBag({}, forecast);
        expect(merged[PLACEMENT_FORECAST_FACT_PROJECTED_CAPACITY_PRESSURE]).toMatchObject({
            presence: "present",
            value: "high",
        });
    });

    it("builds UI hints from forecast metadata", () => {
        expect(buildPlacementForecastUiHints(PLACEMENT_FORECAST_FIXTURE_OPENING_SOON)).toEqual([
            "Expected opening soon",
        ]);
        expect(buildPlacementForecastUiHints(PLACEMENT_FORECAST_FIXTURE_HIGH_DEMAND)).toEqual([
            "High demand cohort",
        ]);
        expect(buildPlacementForecastUiHints(PLACEMENT_FORECAST_FIXTURE_FALL_OPENING)).toEqual([
            "Likely fall opening",
        ]);
        expect(buildPlacementForecastUiHints(null)).toEqual([]);
    });

    it("buildPlacementForecastPreview exposes hints and present fact keys", () => {
        const preview = buildPlacementForecastPreview(PLACEMENT_FORECAST_FIXTURE_OPENING_SOON);
        expect(preview.forecast_hints).toEqual(["Expected opening soon"]);
        expect(preview.forecast_facts_present).toContain(PLACEMENT_FORECAST_FACT_EXPECTED_OPENINGS_COUNT);
    });
});

describe("placement forecast evaluator integration", () => {
    it("does not change sort tuple when forecast facts are present", () => {
        const baseline = evaluatePlacementCandidate({
            candidate: CANDIDATE,
            opportunity: { id: "opp_1", metadata: {} },
            cohort: { work_unit_id: "wu_1", queue_key: "waitlisted" },
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            now_ms: 1_715_176_800_000,
        });
        const withForecast = evaluatePlacementCandidate({
            candidate: {
                ...CANDIDATE,
                metadata: placementForecastMetadataFixture(PLACEMENT_FORECAST_FIXTURE_HIGH_DEMAND),
            },
            opportunity: { id: "opp_1", metadata: {} },
            cohort: { work_unit_id: "wu_1", queue_key: "waitlisted" },
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
            now_ms: 1_715_176_800_000,
        });
        expect(baseline.ok).toBe(true);
        expect(withForecast.ok).toBe(true);
        if (!baseline.ok || !withForecast.ok) return;
        expect(withForecast.value.snapshot.sort_tuple).toEqual(baseline.value.snapshot.sort_tuple);
        expect(withForecast.value.snapshot.bucket_key).toBe(baseline.value.snapshot.bucket_key);
    });

    it("attaches forecast facts to candidate fact bag without eval error", () => {
        const facts = buildPlacementCandidateFacts({
            candidate: {
                ...CANDIDATE,
                metadata: placementForecastMetadataFixture(PLACEMENT_FORECAST_FIXTURE_OPENING_SOON),
            },
            opportunity: { id: "opp_1", metadata: {} },
        });
        expect(facts[PLACEMENT_FORECAST_FACT_EXPECTED_OPENINGS_COUNT]).toMatchObject({
            presence: "present",
            value: 1,
        });
    });
});

describe("placement forecast candidate-row projection", () => {
    it("passes forecast hints through waitlist row projection", () => {
        const { rows } = expandOpportunityRowsToPlacementCandidateRows([
            {
                id: "opp-1",
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    evaluated: true,
                    shadow_mode: true,
                    candidates: [
                        {
                            placement_candidate_id: "pc-1",
                            child_display_name: "Mia Hayes",
                            program_room_cohort_key: "pre_k_4_5_years",
                            program_room_group_label: "Pre-K — 4–5 years",
                            bucket: "tier_general_waitlist",
                            sort_tuple: ["pre_k_4_5_years", 1],
                            link_mode: "independent",
                            active_override_kinds: [],
                            forecast_hints: ["Expected opening soon"],
                        },
                    ],
                    family_rollup: { bucket: "tier_general_waitlist", sort_tuple: [], candidate_count: 1 },
                },
            },
        ]);
        const vm = parsePlacementWaitlistCandidateRowVm(rows[0]?._placement_waitlist_row);
        expect(vm?.forecastHints).toEqual(["Expected opening soon"]);
    });
});
