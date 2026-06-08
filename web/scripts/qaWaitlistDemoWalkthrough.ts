#!/usr/bin/env npx tsx
/**
 * Waitlist demo readiness QA — verifies seeded `waitlist_demo_v1` data + prints browser walkthrough.
 *
 * Env:
 *   ORG_ID / DEV_QUEUE_ORG_ID
 *   WORK_UNIT_KEY=enrollment_pipeline
 *   DEPARTMENT_ID, WORK_UNIT_ID — optional overrides for pilot URL
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> npm run qa:waitlist:demo
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { bulkLoadPlacementCandidatesByOpportunity } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import { loadPlacementEvaluationHouseholdContext } from "@/lib/orchestration/placement/loadPlacementEvaluationHouseholdContext";
import { resolveHouseholdPlacementFactsForCandidate } from "@/lib/orchestration/placement/householdPlacementFacts";
import { CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD } from "@/lib/orchestration/placement/childcarePlacementFactContractV1";
import { WAITLIST_DEMO_BATCH_KEY } from "@/lib/orchestration/placement/waitlistDemoMarkers";
import {
    WAITLIST_DEMO_SCENARIO_SEED_KEYS,
    type WaitlistDemoScenarioId,
} from "@/lib/orchestration/placement/waitlistDemoScenarios";
import {
    DEMO_CHILDCARE_ENROLLMENT_DEPT_ID,
    DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type Check = { id: string; ok: boolean; detail: string };

const checks: Check[] = [];

function check(id: string, ok: boolean, detail: string) {
    checks.push({ id, ok, detail });
}

async function main() {
    const orgId = process.env.DEV_QUEUE_ORG_ID?.trim() || process.env.ORG_ID?.trim() || "";
    if (!orgId) {
        console.error("ORG_ID or DEV_QUEUE_ORG_ID required");
        process.exit(1);
    }

    const workUnitKey = process.env.WORK_UNIT_KEY?.trim() || "enrollment_pipeline";
    const supabase = createAdminClient();

    const { data: wu } = await supabase
        .from("work_units")
        .select("id, metadata, department_id, key")
        .eq("org_id", orgId)
        .eq("key", workUnitKey)
        .maybeSingle();

    if (!wu?.id) {
        check("work_unit", false, `Missing work unit key=${workUnitKey}`);
        printResult(orgId, null, null);
        process.exit(1);
    }

    const layer = (wu.metadata as Record<string, unknown> | null)?.placement_priority_v1 as
        | { shadow_mode?: boolean; engine_version?: string }
        | undefined;
    check("shadow_mode_true", layer?.shadow_mode !== false, `shadow_mode=${String(layer?.shadow_mode)} (expect true)`);
    check("engine_v2", layer?.engine_version === "v2", `engine_version=${String(layer?.engine_version)}`);

    const { data: opps } = await supabase
        .from("opportunities")
        .select("id, metadata, status_key")
        .eq("org_id", orgId)
        .eq("metadata->>demo_batch_key", WAITLIST_DEMO_BATCH_KEY);

    const demoOpps = (opps ?? []) as Array<{ id: string; metadata: Record<string, unknown>; status_key: string }>;
    check("demo_opportunities", demoOpps.length >= 8, `found ${demoOpps.length} demo opportunities (expect 8)`);

    const oppBySeed = new Map<string, string>();
    for (const o of demoOpps) {
        const sk = String(o.metadata?.seed_key ?? "");
        if (sk) oppBySeed.set(sk, o.id);
    }

    for (const [scenario, seedKey] of Object.entries(WAITLIST_DEMO_SCENARIO_SEED_KEYS) as Array<
        [WaitlistDemoScenarioId, string]
    >) {
        check(`scenario_${scenario}`, oppBySeed.has(seedKey), seedKey);
    }

    const oppIds = demoOpps.map((o) => o.id);
    const { data: candidates } =
        oppIds.length > 0
            ? await supabase
                  .from("placement_candidates")
                  .select("id, opportunity_id, site_id, program_room_cohort_key, metadata, status")
                  .eq("org_id", orgId)
                  .in("opportunity_id", oppIds)
                  .eq("status", "active")
            : { data: [] };

    check("placement_candidates", (candidates ?? []).length >= 7, `active candidates=${(candidates ?? []).length}`);

    const employeeOppId = oppBySeed.get(WAITLIST_DEMO_SCENARIO_SEED_KEYS.employee_parent);
    if (employeeOppId) {
        const candidatesByOpp = await bulkLoadPlacementCandidatesByOpportunity({
            supabase,
            orgId,
            opportunityIds: [employeeOppId],
        });
        const householdMap = await loadPlacementEvaluationHouseholdContext({
            supabase,
            orgId,
            candidatesByOpportunityId: candidatesByOpp,
        });
        const bundle = candidatesByOpp.get(employeeOppId)?.[0];
        const customerId = (bundle?.candidate.customer_id ?? "").trim();
        const household = customerId ? householdMap.get(customerId) : null;
        const cand = bundle?.candidate;
        if (household && cand) {
            const facts = resolveHouseholdPlacementFactsForCandidate(household, {
                placement_candidate_id: cand.id,
                opportunity_customer_member_id: cand.opportunity_customer_member_id,
                customer_member_id: cand.customer_member_id,
                person_id: cand.person_id,
                site_id: cand.site_id,
            });
            const emp = facts[CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD];
            check(
                "employee_priority_fact",
                emp?.presence === "present" && emp?.value === true,
                String(emp?.source ?? "missing")
            );
        } else {
            check("employee_priority_fact", false, "household context or candidate missing");
        }
    }

    const manualOppId = oppBySeed.get(WAITLIST_DEMO_SCENARIO_SEED_KEYS.manual_adjustment);
    if (manualOppId && candidates) {
        const manualCand = (candidates as Array<{ id: string; opportunity_id: string }>).find(
            (c) => c.opportunity_id === manualOppId
        );
        if (manualCand) {
            const { data: ov } = await supabase
                .from("placement_overrides")
                .select("id, override_kind, is_active")
                .eq("org_id", orgId)
                .eq("placement_candidate_id", manualCand.id)
                .eq("is_active", true);
            check("manual_override", (ov ?? []).length >= 1, `active overrides=${(ov ?? []).length}`);
        }
    }

    const deptId = process.env.DEPARTMENT_ID?.trim() || DEMO_CHILDCARE_ENROLLMENT_DEPT_ID;
    const wuId = process.env.WORK_UNIT_ID?.trim() || (wu.id as string) || DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID;
    printResult(orgId, deptId, wuId);
    process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

function printResult(orgId: string, deptId: string | null, workUnitId: string | null) {
    console.log(
        JSON.stringify(
            {
                ok: checks.every((c) => c.ok),
                org_id: orgId,
                demo_batch_key: WAITLIST_DEMO_BATCH_KEY,
                checks,
                walkthrough: buildWalkthrough(deptId, workUnitId),
            },
            null,
            2
        )
    );
}

function buildWalkthrough(deptId: string | null, workUnitId: string | null) {
    const base =
        deptId && workUnitId
            ? `/adminV2/workspace/dept/${deptId}/work-unit/${workUnitId}?queue=waitlisted`
            : "/adminV2/workspace (enrollment pipeline → Waitlisted)";

    return {
        route: base,
        steps: [
            {
                scenario: "employee_parent",
                action: "Open Waitlisted queue → find Chen family → open opportunity → Parent drawer → Profile + Employee status",
                expect: "Employee checked; V2 reason line mentions employee/staff tier when household context loads",
            },
            {
                scenario: "same_site_sibling",
                action: "Open Patel opportunity → Inquiry children — enrolled Jordan + waitlisted Taylor, same North site",
                expect: "Sibling enrolled same-site priority fact in candidate preview (shadow sort hint)",
            },
            {
                scenario: "sister_site_sibling",
                action: "Open Nguyen opportunity — enrolled sibling at South, waitlisted child at North",
                expect: "Sister-site / sister-center tier in priority reason",
            },
            {
                scenario: "multi_child_cohorts",
                action: "Open Williams opportunity — two children, infant + preschool cohorts",
                expect: "Two candidate rows under distinct cohort section headers",
            },
            {
                scenario: "manual_adjustment",
                action: "Open Foster opportunity → waitlist row → pin/adjustment indicator",
                expect: "Active manual pin; activity shows override event",
            },
            {
                scenario: "forecast_hint",
                action: "Open Santos candidate metadata / forecast chip if surfaced",
                expect: "Forecast hint present; informational only (no default sort impact)",
            },
            {
                scenario: "missing_site_cohort",
                action: "Open Reed opportunity → inquiry child missing site/cohort",
                expect: "Diagnostic hint; sibling site facts absent",
            },
            {
                scenario: "settings",
                action: "Settings → Locations & hierarchy — North/South demo campuses",
                expect: "Site tree visible; aligns with child site dropdown options",
            },
        ],
        shadow_mode: "Must remain true — live ranking not enabled in demo seed",
    };
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
