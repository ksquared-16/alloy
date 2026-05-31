#!/usr/bin/env npx tsx
/**
 * QA gate — waitlist priority fact truth (Card 3).
 *
 * Run from `web/`:
 *   npm run qa:waitlist:priority-facts
 *
 * Env:
 *   ORG_ID — optional org for read-only DB probes
 *   RUN_REPAIR_DRY_RUN=1 — include placement candidate OCM repair dry-run counts
 *   MUTATE_REPAIR=1 — apply repair (dev/pilot only; requires ORG_ID)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import {
    resolveHouseholdPlacementFactsForCandidate,
    type HouseholdPlacementFactHouseholdSlice,
} from "@/lib/orchestration/placement/householdPlacementFacts";
import {
    buildPlacementCandidateFacts,
    evaluatePlacementCandidate,
} from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD } from "@/lib/orchestration/placement/childcarePlacementFactContractV1";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import { buildOpportunityPlacementFacts } from "@/lib/orchestration/placement/adapters/opportunityPlacementFacts";
import { evaluatePlacementPriority } from "@/lib/orchestration/placement/evaluatePlacementPriority";
import { applyPlacementCandidateOverrides } from "@/lib/orchestration/placement/applyPlacementCandidateOverrides";
import type { PlacementCandidateRow } from "@/lib/orchestration/placement/placementCandidateTypes";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { runPlacementCandidateOcmRepair } from "@/lib/orchestration/placement/repair/placementCandidateOcmRepair";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const household: HouseholdPlacementFactHouseholdSlice = {
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
        {
            opportunity_customer_member_id: "ocm_sister",
            customer_member_id: "cm_sister",
            outcome_status_key: "enrolled",
            location_id: "site_b",
        },
    ],
    active_placement_candidates: [],
    household_persons: [{ person_id: "person_parent", is_employee: true, employee_id: "E-42" }],
};

const candidateCtx = {
    placement_candidate_id: "pc_self",
    opportunity_customer_member_id: "ocm_self",
    customer_member_id: "cm_self",
    person_id: "person_self",
    site_id: "site_a",
};

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
    desired_start_date: "2024-09-01",
    status: "active",
    seed_key: "pc_v1:opp_qa:ocm_self:toddler_room",
    metadata: null,
};

type QaCheck = { name: string; ok: boolean; detail?: string };

function runPureChecks(): QaCheck[] {
    const checks: QaCheck[] = [];

    const facts = resolveHouseholdPlacementFactsForCandidate(household, candidateCtx);
    checks.push({
        name: "employee_from_persons_is_employee",
        ok:
            facts.flag_employee_household.presence === "present" &&
            String(facts.flag_employee_household.source ?? "").includes("persons.is_employee"),
    });
    checks.push({
        name: "same_site_sibling_from_ocm_location",
        ok:
            facts.flag_sibling_enrolled.presence === "present" &&
            String(facts.flag_sibling_enrolled.source ?? "").includes("opportunity_customer_members"),
    });
    checks.push({
        name: "sister_site_sibling_from_ocm_different_location",
        ok:
            facts.flag_sister_center.presence === "present" &&
            String(facts.flag_sister_center.source ?? "").includes("sibling_enrolled_sister_site"),
    });

    const noSite = resolveHouseholdPlacementFactsForCandidate(household, { ...candidateCtx, site_id: null });
    checks.push({
        name: "missing_child_site_no_sibling_priority",
        ok:
            noSite.flag_sibling_enrolled.presence === "absent" && noSite.flag_sister_center.presence === "absent",
    });

    const metaIgnored = evaluatePlacementCandidate({
        candidate: CANDIDATE,
        opportunity: { id: "opp_qa", metadata: { flag_employee_household: true } },
        cohort: { work_unit_id: "wu_qa", queue_key: "waitlisted" },
        profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
        now_ms: 1_715_176_800_000,
        household: {
            customer_id: "cust_qa",
            inquiry_children: [household.inquiry_children[0]!],
            active_placement_candidates: [],
            household_persons: [{ person_id: "p1", is_employee: false, employee_id: null }],
        },
    });
    checks.push({
        name: "v2_metadata_employee_ignored_with_record_context",
        ok: metaIgnored.ok === true && metaIgnored.value.snapshot.bucket_key === "tier_general_waitlist",
    });

    const staffTier = evaluatePlacementCandidate({
        candidate: CANDIDATE,
        opportunity: { id: "opp_qa", metadata: {} },
        cohort: { work_unit_id: "wu_qa", queue_key: "waitlisted" },
        profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
        now_ms: 1_715_176_800_000,
        household,
    });
    checks.push({
        name: "v2_employee_record_tier_employee_family",
        ok: staffTier.ok === true && staffTier.value.snapshot.bucket_key === "tier_employee_family",
    });

    const v1Facts = buildOpportunityPlacementFacts(
        { created_at: "2024-01-01", metadata: { flag_employee_household: true } },
        {}
    );
    const v1Eval = evaluatePlacementPriority({
        evaluator_version: "queueservice_placement_v1",
        now_ms: 1_715_176_800_000,
        entity: { entity_type: "opportunity", entity_id: "opp_qa" },
        cohort: { work_unit_id: "wu_qa", queue_key: "waitlisted" },
        facts: v1Facts,
        profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2,
    });
    checks.push({
        name: "v1_metadata_employee_still_applies",
        ok: v1Eval.ok && v1Eval.value.snapshot.bucket_key === "tier_employee_family",
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
                payload: { position: 1 },
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
                        payload: { position: 1 },
                    },
                ],
            })
        :   null;
    checks.push({
        name: "manual_override_wins_effective_layer",
        ok: Boolean(merged?.applied?.length),
    });

    const built = buildPlacementCandidateFacts({
        candidate: CANDIDATE,
        opportunity: { id: "opp_qa", metadata: { flag_employee_household: true } },
        household: { ...household, household_persons: [] },
    });
    checks.push({
        name: "build_facts_ignores_metadata_when_household_loaded",
        ok: built[CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD]?.presence === "absent",
    });

    return checks;
}

async function main() {
    const checks = runPureChecks();
    const failed = checks.filter((c) => !c.ok);

    const orgId = (process.env.ORG_ID ?? "").trim();
    let repairDryRun: unknown = { skipped: true, hint: "Set RUN_REPAIR_DRY_RUN=1 and ORG_ID" };
    let repairApply: unknown = { skipped: true };

    if (orgId && process.env.RUN_REPAIR_DRY_RUN === "1") {
        const supabase = createAdminClient();
        repairDryRun = await runPlacementCandidateOcmRepair(supabase, { orgId, dryRun: true, limit: 500 });
    }
    if (orgId && process.env.MUTATE_REPAIR === "1") {
        const supabase = createAdminClient();
        repairApply = await runPlacementCandidateOcmRepair(supabase, { orgId, dryRun: false, limit: 500 });
    }

    const payload = {
        ok: failed.length === 0,
        pure_checks: checks,
        repair_dry_run: repairDryRun,
        repair_apply: repairApply,
    };

    console.log(JSON.stringify(payload, null, 2));
    if (failed.length) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
