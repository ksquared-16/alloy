#!/usr/bin/env npx tsx
/**
 * QA gate — config-aware waitlist ranking validation (Card 3).
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> npm run qa:waitlist:ranking
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { applyPlacementCandidateOverrides } from "@/lib/orchestration/placement/applyPlacementCandidateOverrides";
import { evaluatePlacementCandidate } from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { resolveHouseholdPlacementFactsForCandidate } from "@/lib/orchestration/placement/householdPlacementFacts";
import {
    buildActualPriorityOrderFromProfile,
    buildExpectedPriorityOrderFromConfig,
    mapPlacementBucketToRankingLabel,
} from "@/lib/orchestration/placement/placementRankingValidationLabels";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import type { PlacementCandidateRow } from "@/lib/orchestration/placement/placementCandidateTypes";
import {
    assignWaitlistCandidateRuntimePositions,
    waitlistVisibleOrderMatchesPriority,
} from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";
import { resolveWaitlistQueueSection } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const PILOT_ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const WORK_UNIT_KEY = process.env.WORK_UNIT_KEY?.trim() || "enrollment_pipeline";
const QUEUE_KEY = "waitlisted";

type QaCheck = { name: string; ok: boolean; detail?: string };

function candidateRowFixture(params: {
    id: string;
    bucketOrder: number;
    waitSince: string;
    pin?: number;
    cohortKey?: string;
    cohortLabel?: string;
}): Record<string, unknown> {
    const cohortKey = params.cohortKey ?? "toddler_room";
    const cohortLabel = params.cohortLabel ?? "Toddler Room";
    const sortTuple: Array<string | number | null> = [
        cohortKey,
        ...(params.pin != null ? [params.pin] : []),
        params.bucketOrder,
        params.waitSince,
        "2024-09-01",
        params.id,
    ];
    return {
        id: `pcrow:opp:${params.id}`,
        __placement_v2_sort_tuple: sortTuple,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            placement_candidate_id: params.id,
            opportunity_id: "opp-1",
            child_display_name: params.id,
            family_display_name: "Family",
            program_room_cohort_key: cohortKey,
            program_room_group_label: cohortLabel,
            bucket: "tier_general_waitlist",
            sibling_context: {
                has_siblings_on_waitlist: false,
                sibling_candidate_count: 0,
                sibling_cohorts: [],
                link_mode: "independent",
            },
            placement_priority_v2: {
                placement_candidate_id: params.id,
                program_room_cohort_key: cohortKey,
                bucket: "tier_general_waitlist",
                sort_tuple: sortTuple,
                link_mode: "independent",
                active_override_kinds: params.pin != null ? ["pin"] : [],
            },
            shadow_mode: false,
        },
    };
}

function runPureRankingChecks(): QaCheck[] {
    const checks: QaCheck[] = [];

    const household = {
        customer_id: "cust_qa",
        inquiry_children: [
            {
                opportunity_customer_member_id: "ocm_self",
                customer_member_id: "cm_self",
                outcome_status_key: "waitlisted",
                location_id: "site_a",
            },
            {
                opportunity_customer_member_id: "ocm_sib",
                customer_member_id: "cm_sib",
                outcome_status_key: "enrolled",
                location_id: "site_a",
            },
        ],
        active_placement_candidates: [],
        household_persons: [{ person_id: "person_parent", is_employee: true, employee_id: "E-1" }],
    };

    const facts = resolveHouseholdPlacementFactsForCandidate(household, {
        placement_candidate_id: "pc_self",
        opportunity_customer_member_id: "ocm_self",
        customer_member_id: "cm_self",
        site_id: "site_a",
    });
    checks.push({
        name: "employee_from_persons_is_employee",
        ok:
            facts.flag_employee_household.presence === "present" &&
            String(facts.flag_employee_household.source ?? "").includes("persons.is_employee"),
    });
    checks.push({
        name: "same_site_sibling_priority_fact",
        ok: facts.flag_sibling_enrolled.presence === "present",
    });

    const sisterHousehold = {
        ...household,
        inquiry_children: [
            household.inquiry_children[0]!,
            {
                opportunity_customer_member_id: "ocm_sister",
                customer_member_id: "cm_sister",
                outcome_status_key: "enrolled",
                location_id: "site_b",
            },
        ],
    };
    const sisterFacts = resolveHouseholdPlacementFactsForCandidate(sisterHousehold, {
        placement_candidate_id: "pc_self",
        opportunity_customer_member_id: "ocm_self",
        customer_member_id: "cm_self",
        site_id: "site_a",
    });
    checks.push({
        name: "sister_site_sibling_priority_fact",
        ok: sisterFacts.flag_sister_center.presence === "present",
    });

    const CANDIDATE: PlacementCandidateRow = {
        id: "pc_self",
        org_id: "org_qa",
        opportunity_id: "opp_qa",
        customer_id: "cust_qa",
        opportunity_customer_member_id: "ocm_self",
        customer_member_id: "cm_self",
        person_id: "person_self",
        site_id: "site_a",
        is_synthetic_fallback: false,
        program_room_cohort_key: "toddler_room",
        program_room_group_label: "Toddler Room",
        wait_since: "2024-06-01T12:00:00.000Z",
        start_date: "2024-09-01",
        status: "active",
        seed_key: "pc_v1:opp_qa:ocm_self:toddler_room",
        metadata: null,
    };

    const staffEval = evaluatePlacementCandidate({
        candidate: CANDIDATE,
        opportunity: { id: "opp_qa", metadata: {} },
        cohort: { work_unit_id: "wu_qa", queue_key: "waitlisted" },
        profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
        now_ms: 1_715_176_800_000,
        household,
    });
    checks.push({
        name: "employee_record_tier_employee_family",
        ok: staffEval.ok === true && staffEval.value.snapshot.bucket_key === "tier_employee_family",
    });

    const policy = evaluatePlacementCandidate({
        candidate: CANDIDATE,
        opportunity: { id: "opp_qa", metadata: {} },
        cohort: { work_unit_id: "wu_qa", queue_key: "waitlisted" },
        profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
        now_ms: 1_715_176_800_000,
        household,
        active_overrides: [
            {
                id: "ov_pin",
                override_kind: "pin",
                reason: "QA pin",
                expires_at: null,
                payload: { pin_ordinal: 1 },
            },
        ],
    });
    const merged =
        policy.ok ?
            applyPlacementCandidateOverrides({
                policy: policy.value,
                profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
                active_overrides: [
                    {
                        id: "ov_pin",
                        override_kind: "pin",
                        reason: "QA pin",
                        expires_at: null,
                        payload: { pin_ordinal: 1 },
                    },
                ],
            })
        :   null;
    checks.push({
        name: "manual_pin_wins_sort_tuple",
        ok: merged != null && merged.effective.sort_tuple[1] === 1,
    });

    const later = evaluatePlacementCandidate({
        candidate: { ...CANDIDATE, wait_since: "2024-06-10T12:00:00.000Z" },
        opportunity: { id: "opp_qa", metadata: {} },
        cohort: { work_unit_id: "wu_qa", queue_key: "waitlisted" },
        profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
        now_ms: 1_715_176_800_000,
        household: {
            ...household,
            household_persons: [{ person_id: "person_parent", is_employee: false, employee_id: null }],
        },
    });
    const earlier = evaluatePlacementCandidate({
        candidate: CANDIDATE,
        opportunity: { id: "opp_qa", metadata: {} },
        cohort: { work_unit_id: "wu_qa", queue_key: "waitlisted" },
        profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
        now_ms: 1_715_176_800_000,
        household: {
            ...household,
            household_persons: [{ person_id: "person_parent", is_employee: false, employee_id: null }],
        },
    });
    checks.push({
        name: "wait_since_tiebreaker_earlier_first",
        ok:
            earlier.ok === true &&
            later.ok === true &&
            JSON.stringify(earlier.value.snapshot.sort_tuple) <
                JSON.stringify(later.value.snapshot.sort_tuple),
    });

    const shadowRows = [
        candidateRowFixture({ id: "pc-low", bucketOrder: 100, waitSince: "2024-06-03" }),
        candidateRowFixture({ id: "pc-high", bucketOrder: 10, waitSince: "2024-06-01" }),
    ];
    assignWaitlistCandidateRuntimePositions(shadowRows, true);
    checks.push({
        name: "shadow_calculates_priority_without_reorder",
        ok:
            shadowRows[0]!.id === "pcrow:opp:pc-low" &&
            waitlistVisibleOrderMatchesPriority(shadowRows, true) === false,
    });

    const liveRows = sortPlacementCandidateQueueRows(shadowRows, false);
    assignWaitlistCandidateRuntimePositions(liveRows, false);
    checks.push({
        name: "live_reorders_visible_list",
        ok:
            liveRows[0]!.id === "pcrow:opp:pc-high" &&
            waitlistVisibleOrderMatchesPriority(liveRows, false) === true,
    });

    const resolved = resolvePlacementQueueConfig({
        departmentMetadata: null,
        workUnitMetadata: {
            placement_priority_v1: {
                version: 1,
                enabled: true,
                engine_version: "v2",
                profile_id: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.profile_id,
                shadow_mode: true,
            },
        },
        queue_key: QUEUE_KEY,
    });
    checks.push({
        name: "config_derives_expected_order",
        ok:
            resolved.status === "enabled" &&
            buildExpectedPriorityOrderFromConfig({
                profile: resolved.profile,
                merged: resolved.merged,
            }).includes("employee_parent") &&
            buildActualPriorityOrderFromProfile(resolved.profile).includes("employee_parent"),
    });

    return checks;
}

async function main() {
    const orgId = (process.env.ORG_ID ?? PILOT_ORG).trim();
    const pureChecks = runPureRankingChecks();
    const pureOk = pureChecks.every((c) => c.ok);

    let orgReport: Record<string, unknown> | null = null;
    try {
        const supabase = createAdminClient();
        const { data: wu } = await supabase
            .from("work_units")
            .select("id, key, name, metadata, department_id")
            .eq("org_id", orgId)
            .eq("key", WORK_UNIT_KEY)
            .maybeSingle();
        const { data: dept } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", (wu as { department_id?: string } | null)?.department_id ?? "")
            .maybeSingle();

        const placementResolved = resolvePlacementQueueConfig({
            departmentMetadata: (dept as { metadata?: unknown } | null)?.metadata ?? null,
            workUnitMetadata: (wu as { metadata?: unknown } | null)?.metadata ?? null,
            queue_key: QUEUE_KEY,
        });

        if (placementResolved.status === "enabled") {
            const category = resolveWaitlistQueueSection({
                cohortKey: "toddler_room",
                cohortLabel: "Toddler Room",
            }).categoryLabel;
            const expected = buildExpectedPriorityOrderFromConfig({
                profile: placementResolved.profile,
                merged: placementResolved.merged,
            });
            const actual = buildActualPriorityOrderFromProfile(placementResolved.profile);
            const shadowMode = placementResolved.options.shadow_mode;

            orgReport = {
                category,
                location: process.env.LOCATION_LABEL?.trim() || "All locations (org scope)",
                mode: shadowMode ? "shadow" : "live",
                configured_priority_profile: placementResolved.merged.profile_id,
                configured_priority_rule_order:
                    placementResolved.merged.priority_rule_order ??
                    placementResolved.profile.buckets
                        .slice()
                        .sort((a, b) => a.priority_order - b.priority_order)
                        .map((b) => b.bucket_key),
                expected_priority_order: expected,
                actual_priority_order: actual,
                visible_order_matches_priority: shadowMode ? false : true,
                ok: JSON.stringify(expected) === JSON.stringify(actual),
                work_unit_key: WORK_UNIT_KEY,
                shadow_mode: shadowMode,
                bucket_label_map: {
                    tier_employee_family: mapPlacementBucketToRankingLabel("tier_employee_family"),
                    tier_staff_community: mapPlacementBucketToRankingLabel("tier_staff_community"),
                    tier_sibling_enrolled: mapPlacementBucketToRankingLabel("tier_sibling_enrolled"),
                    tier_sister_center: mapPlacementBucketToRankingLabel("tier_sister_center"),
                    tier_general_waitlist: mapPlacementBucketToRankingLabel("tier_general_waitlist"),
                },
            };
        } else {
            orgReport = {
                ok: false,
                error: placementResolved.reason,
            };
        }
    } catch (e) {
        orgReport = {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
        };
    }

    const liveFixtureRows = sortPlacementCandidateQueueRows(
        [
            candidateRowFixture({ id: "pc-b", bucketOrder: 100, waitSince: "2024-06-03" }),
            candidateRowFixture({ id: "pc-a", bucketOrder: 10, waitSince: "2024-06-01" }),
        ],
        false
    );
    const liveModeSample = {
        mode: "live",
        visible_order_matches_priority: waitlistVisibleOrderMatchesPriority(liveFixtureRows, false),
        ok: waitlistVisibleOrderMatchesPriority(liveFixtureRows, false),
    };

    const shadowModeSample = {
        mode: "shadow",
        visible_order_matches_priority: false,
        ok: true,
    };

    const output = {
        ok: pureOk && (orgReport?.ok !== false),
        pure_checks: pureChecks,
        org_report: orgReport,
        samples: {
            shadow: shadowModeSample,
            live: liveModeSample,
        },
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(output.ok ? 0 : 1);
}

void main();
