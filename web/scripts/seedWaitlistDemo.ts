#!/usr/bin/env npx tsx
/**
 * Idempotent waitlist demo seed (`waitlist_demo_v1`) — eight priority-fact scenarios.
 *
 * Env:
 *   ORG_ID / DEV_QUEUE_ORG_ID   (required)
 *   WORK_UNIT_KEY=enrollment_pipeline (optional)
 *   DRY_RUN=1                   (optional — plan only, no writes)
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> npm run dev:seed:waitlist-demo
 *   ORG_ID=<uuid> DRY_RUN=1 npm run dev:seed:waitlist-demo
 *
 * Recommended flow:
 *   ORG_ID=<uuid> DRY_RUN=1 npm run dev:clean:waitlist-demo
 *   ORG_ID=<uuid> WAITLIST_DEMO_APPLY=1 npm run dev:clean:waitlist-demo
 *   ORG_ID=<uuid> npm run dev:seed:waitlist-demo
 *   ORG_ID=<uuid> npm run qa:waitlist:demo
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import { runPlacementCandidateBackfill } from "@/lib/orchestration/placement/backfill/placementCandidateBackfill";
import {
    PLACEMENT_PRIORITY_DEMO_LAYER_V2,
} from "@/lib/orchestration/placement/placementPriorityDemoPatch";
import { placementForecastMetadataFixture, PLACEMENT_FORECAST_FIXTURE_OPENING_SOON } from "@/lib/orchestration/placement/placementForecastFixtures";
import { upsertPlacementPinOverride } from "@/lib/orchestration/placement/placementOverrideMutations";
import { waitlistDemoMetadata } from "@/lib/orchestration/placement/waitlistDemoMarkers";
import {
    WAITLIST_DEMO_COHORT_KEYS,
    WAITLIST_DEMO_SCENARIO_ORDER,
    WAITLIST_DEMO_SCENARIO_SEED_KEYS,
    waitlistDemoFamilyLast,
    type WaitlistDemoScenarioId,
} from "@/lib/orchestration/placement/waitlistDemoScenarios";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const QA_ACTOR = process.env.QA_ACTOR_USER_ID?.trim() || "00000000-0000-4000-8000-000000000001";

type SeedCtx = {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    siteNorthId: string;
    siteSouthId: string;
    dryRun: boolean;
};

function isoDate(d: Date): string {
    return d.toISOString();
}

function seedEmail(orgId: string, seedKey: string): string {
    const orgTag = orgId.replace(/-/g, "").slice(0, 10);
    const slug = seedKey.replace(/[^a-z0-9_]+/gi, "_").slice(0, 24);
    return `${slug}+${orgTag}@waitlist-demo.alloy.invalid`;
}

async function ensureSite(
    ctx: SeedCtx,
    seedKey: string,
    label: string
): Promise<string> {
    const { supabase, orgId, dryRun } = ctx;
    const { data: existing } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", seedKey)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) return (existing as { id: string }).id;
    if (dryRun) return `dry-run-site-${seedKey}`;

    const { data: created, error } = await supabase
        .from("locations")
        .insert({
            org_id: orgId,
            label,
            location_type: "site",
            is_active: true,
            metadata: waitlistDemoMetadata(seedKey, { semantic_kind: "campus" }),
        })
        .select("id")
        .single();
    if (error) throw new Error(`ensureSite ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

/** Reuse org campuses from realistic childcare demo — never create "Waitlist Demo — …" sites. */
const SHARED_CAMPUS_SEED_KEYS = {
    north: "site_north_campus",
    south: "site_south_campus",
} as const;

const SHARED_CAMPUS_LABELS = {
    north: "North Campus",
    south: "South Campus",
} as const;

async function resolveSharedCampusSiteId(ctx: SeedCtx, campus: keyof typeof SHARED_CAMPUS_SEED_KEYS): Promise<string> {
    const { supabase, orgId, dryRun } = ctx;
    const seedKey = SHARED_CAMPUS_SEED_KEYS[campus];
    const label = SHARED_CAMPUS_LABELS[campus];

    const { data: bySeed } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", seedKey)
        .maybeSingle();
    if ((bySeed as { id?: string } | null)?.id) return (bySeed as { id: string }).id;

    const { data: byLabel } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", orgId)
        .eq("location_type", "site")
        .eq("label", label)
        .maybeSingle();
    if ((byLabel as { id?: string } | null)?.id) return (byLabel as { id: string }).id;

    if (dryRun) return `dry-run-site-${seedKey}`;
    return ensureSite(ctx, seedKey, label);
}

async function ensureCustomer(ctx: SeedCtx, seedKey: string, familyLast: string): Promise<string> {
    const { supabase, orgId, dryRun } = ctx;
    const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", seedKey)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) return (existing as { id: string }).id;
    if (dryRun) return `dry-run-customer-${seedKey}`;

    const { data: created, error } = await supabase
        .from("customers")
        .insert({
            org_id: orgId,
            name: `${familyLast} Family`,
            metadata: waitlistDemoMetadata(seedKey),
        })
        .select("id")
        .single();
    if (error) throw new Error(`ensureCustomer: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensurePerson(
    ctx: SeedCtx,
    seedKey: string,
    first: string,
    last: string,
    role: string,
    extra?: Record<string, unknown>
): Promise<string> {
    const { supabase, orgId, dryRun } = ctx;
    const personSeed = `${seedKey}:person:${role}:${first}:${last}`;
    const { data: existing } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", personSeed)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
        if (extra && !dryRun) {
            await supabase.from("persons").update(extra).eq("id", (existing as { id: string }).id).eq("org_id", orgId);
        }
        return (existing as { id: string }).id;
    }
    if (dryRun) return `dry-run-person-${personSeed}`;

    const { data: created, error } = await supabase
        .from("persons")
        .insert({
            org_id: orgId,
            first_name: first,
            last_name: last,
            email: role === "guardian" ? seedEmail(orgId, seedKey) : null,
            phone: role === "guardian" ? "+14155550100" : null,
            metadata: waitlistDemoMetadata(personSeed),
            ...extra,
        })
        .select("id")
        .single();
    if (error) throw new Error(`ensurePerson: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureCustomerPerson(ctx: SeedCtx, customerId: string, personId: string): Promise<void> {
    if (ctx.dryRun) return;
    const { error } = await ctx.supabase.from("customer_persons").insert({
        org_id: ctx.orgId,
        customer_id: customerId,
        person_id: personId,
        role_type: "guardian",
        is_primary: true,
    } as never);
    if (error && !String(error.message).toLowerCase().includes("duplicate")) {
        throw new Error(`customer_persons: ${error.message}`);
    }
}

async function ensureChildMember(
    ctx: SeedCtx,
    customerId: string,
    scenarioSeed: string,
    child: { first: string; last: string; idx: number }
): Promise<string> {
    const { supabase, orgId, dryRun } = ctx;
    const memberSeed = `${scenarioSeed}:child:${child.idx}`;
    const { data: existing } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("metadata->>seed_key", memberSeed)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) return (existing as { id: string }).id;

    const personId = await ensurePerson(ctx, scenarioSeed, child.first, child.last, `child:${child.idx}`);
    if (dryRun) return `dry-run-member-${memberSeed}`;

    const { data: created, error } = await supabase
        .from("customer_members")
        .insert({
            org_id: orgId,
            customer_id: customerId,
            display_name: `${child.first} ${child.last}`.trim(),
            relationship: "child",
            first_name: child.first,
            last_name: child.last,
            person_id: personId,
            metadata: waitlistDemoMetadata(memberSeed),
        } as never)
        .select("id")
        .single();
    if (error) throw new Error(`customer_members: ${error.message}`);
    return (created as { id: string }).id;
}

async function upsertOpportunity(
    ctx: SeedCtx,
    scenario: WaitlistDemoScenarioId,
    customerId: string,
    guardianId: string,
    siteId: string | null
): Promise<string> {
    const { supabase, orgId, workUnitId, dryRun } = ctx;
    const seedKey = WAITLIST_DEMO_SCENARIO_SEED_KEYS[scenario];
    const familyLast = waitlistDemoFamilyLast(scenario);

    const { data: existing } = await supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", seedKey)
        .maybeSingle();

    const meta = waitlistDemoMetadata(seedKey, {
        waitlist_demo_scenario: scenario,
        notes: `Waitlist demo — ${scenario}`,
        desired_start_date: "2025-09-01",
        enrollment_operational: { wait_since: isoDate(new Date("2024-06-15T12:00:00.000Z")) },
    });

    const row: Record<string, unknown> = {
        org_id: orgId,
        name: `${familyLast} Family`,
        status_key: "waitlisted",
        work_unit_id: workUnitId,
        customer_id: customerId,
        primary_person_id: guardianId,
        location_id: siteId,
        metadata: meta,
        updated_at: isoDate(new Date()),
    };

    if (existing?.id) {
        if (dryRun) return existing.id as string;
        await normalizeOpportunityWritePayload(supabase, row, "seedWaitlistDemo:update");
        const { error } = await supabase.from("opportunities").update(row as never).eq("id", existing.id).eq("org_id", orgId);
        if (error) throw new Error(error.message);
        return existing.id as string;
    }

    if (dryRun) return `dry-run-opp-${seedKey}`;
    row.created_at = isoDate(new Date());
    await normalizeOpportunityWritePayload(supabase, row, "seedWaitlistDemo:insert");
    const { data: created, error } = await supabase.from("opportunities").insert(row as never).select("id").single();
    if (error) throw new Error(error.message);
    return (created as { id: string }).id;
}

async function upsertOcm(
    ctx: SeedCtx,
    opportunityId: string,
    customerMemberId: string,
    fields: {
        outcome_status_key?: string;
        location_id?: string | null;
        program_room_cohort_key?: string | null;
        ocmSeed: string;
    }
): Promise<string> {
    const { supabase, orgId, dryRun } = ctx;
    const { data: existing } = await supabase
        .from("opportunity_customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId)
        .eq("customer_member_id", customerMemberId)
        .maybeSingle();

    const payload = {
        org_id: orgId,
        opportunity_id: opportunityId,
        customer_member_id: customerMemberId,
        outcome_status_key: fields.outcome_status_key ?? "waitlisted",
        location_id: fields.location_id ?? null,
        program_room_cohort_key: fields.program_room_cohort_key ?? null,
        desired_start_date: "2025-09-01",
        metadata: waitlistDemoMetadata(fields.ocmSeed),
    };

    if (existing?.id) {
        if (dryRun) return existing.id as string;
        const { error } = await supabase
            .from("opportunity_customer_members")
            .update(payload as never)
            .eq("id", existing.id)
            .eq("org_id", orgId);
        if (error) throw new Error(error.message);
        return existing.id as string;
    }

    if (dryRun) return `dry-run-ocm-${fields.ocmSeed}`;
    const { data: created, error } = await supabase
        .from("opportunity_customer_members")
        .insert(payload as never)
        .select("id")
        .single();
    if (error) throw new Error(error.message);
    return (created as { id: string }).id;
}

async function seedScenario(ctx: SeedCtx, scenario: WaitlistDemoScenarioId): Promise<{ scenario: WaitlistDemoScenarioId; opportunity_id: string }> {
    const seedKey = WAITLIST_DEMO_SCENARIO_SEED_KEYS[scenario];
    const familyLast = waitlistDemoFamilyLast(scenario);
    const customerId = await ensureCustomer(ctx, seedKey, familyLast);

    const guardianExtra =
        scenario === "employee_parent"
            ? { is_employee: true, employee_id: "EMP-DEMO-001", employee_source: "manual" }
            : undefined;
    const guardianId = await ensurePerson(ctx, seedKey, "Parent", familyLast, "guardian", guardianExtra);
    await ensureCustomerPerson(ctx, customerId, guardianId);

    let siteId: string | null = ctx.siteNorthId;
    if (scenario === "sister_site_sibling") siteId = ctx.siteNorthId;
    if (scenario === "missing_site_cohort") siteId = null;

    const oppId = await upsertOpportunity(ctx, scenario, customerId, guardianId, siteId);

    switch (scenario) {
        case "employee_parent":
        case "general_waitlist":
        case "manual_adjustment":
        case "forecast_hint": {
            const cmId = await ensureChildMember(ctx, customerId, seedKey, { first: "Alex", last: familyLast, idx: 0 });
            await upsertOcm(ctx, oppId, cmId, {
                ocmSeed: `${seedKey}:ocm:0`,
                location_id: ctx.siteNorthId,
                program_room_cohort_key: WAITLIST_DEMO_COHORT_KEYS.toddler,
            });
            break;
        }
        case "same_site_sibling": {
            const enrolledId = await ensureChildMember(ctx, customerId, seedKey, { first: "Jordan", last: familyLast, idx: 0 });
            await upsertOcm(ctx, oppId, enrolledId, {
                ocmSeed: `${seedKey}:ocm:enrolled`,
                outcome_status_key: "enrolled",
                location_id: ctx.siteNorthId,
                program_room_cohort_key: WAITLIST_DEMO_COHORT_KEYS.preschool,
            });
            const waitId = await ensureChildMember(ctx, customerId, seedKey, { first: "Taylor", last: familyLast, idx: 1 });
            await upsertOcm(ctx, oppId, waitId, {
                ocmSeed: `${seedKey}:ocm:waitlisted`,
                outcome_status_key: "waitlisted",
                location_id: ctx.siteNorthId,
                program_room_cohort_key: WAITLIST_DEMO_COHORT_KEYS.infant,
            });
            break;
        }
        case "sister_site_sibling": {
            const enrolledId = await ensureChildMember(ctx, customerId, seedKey, { first: "Morgan", last: familyLast, idx: 0 });
            await upsertOcm(ctx, oppId, enrolledId, {
                ocmSeed: `${seedKey}:ocm:enrolled_south`,
                outcome_status_key: "enrolled",
                location_id: ctx.siteSouthId,
                program_room_cohort_key: WAITLIST_DEMO_COHORT_KEYS.toddler,
            });
            const waitId = await ensureChildMember(ctx, customerId, seedKey, { first: "Casey", last: familyLast, idx: 1 });
            await upsertOcm(ctx, oppId, waitId, {
                ocmSeed: `${seedKey}:ocm:waitlisted_north`,
                outcome_status_key: "waitlisted",
                location_id: ctx.siteNorthId,
                program_room_cohort_key: WAITLIST_DEMO_COHORT_KEYS.infant,
            });
            break;
        }
        case "multi_child_cohorts": {
            const c1 = await ensureChildMember(ctx, customerId, seedKey, { first: "Riley", last: familyLast, idx: 0 });
            await upsertOcm(ctx, oppId, c1, {
                ocmSeed: `${seedKey}:ocm:0`,
                location_id: ctx.siteNorthId,
                program_room_cohort_key: WAITLIST_DEMO_COHORT_KEYS.infant,
            });
            const c2 = await ensureChildMember(ctx, customerId, seedKey, { first: "Quinn", last: familyLast, idx: 1 });
            await upsertOcm(ctx, oppId, c2, {
                ocmSeed: `${seedKey}:ocm:1`,
                location_id: ctx.siteNorthId,
                program_room_cohort_key: WAITLIST_DEMO_COHORT_KEYS.preschool,
            });
            break;
        }
        case "missing_site_cohort": {
            const cmId = await ensureChildMember(ctx, customerId, seedKey, { first: "Sam", last: familyLast, idx: 0 });
            await upsertOcm(ctx, oppId, cmId, {
                ocmSeed: `${seedKey}:ocm:0`,
                location_id: null,
                program_room_cohort_key: null,
            });
            break;
        }
    }

    return { scenario, opportunity_id: oppId };
}

async function patchWorkUnitV2(ctx: SeedCtx): Promise<void> {
    const { supabase, orgId, dryRun } = ctx;
    const { data: wu } = await supabase
        .from("work_units")
        .select("id, metadata")
        .eq("id", ctx.workUnitId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!wu?.id) return;

    const base =
        wu.metadata != null && typeof wu.metadata === "object" && !Array.isArray(wu.metadata)
            ? { ...(wu.metadata as Record<string, unknown>) }
            : {};
    const nextMeta = { ...base, placement_priority_v1: PLACEMENT_PRIORITY_DEMO_LAYER_V2 };
    if (dryRun) return;
    await supabase.from("work_units").update({ metadata: nextMeta }).eq("id", ctx.workUnitId).eq("org_id", orgId);
}

async function applyPostBackfillExtras(ctx: SeedCtx, rows: Array<{ scenario: WaitlistDemoScenarioId; opportunity_id: string }>): Promise<void> {
    if (ctx.dryRun) return;
    const { supabase, orgId } = ctx;

    for (const row of rows) {
        const { data: candidates } = await supabase
            .from("placement_candidates")
            .select("id, metadata, program_room_cohort_key")
            .eq("org_id", orgId)
            .eq("opportunity_id", row.opportunity_id)
            .eq("status", "active");

        const list = (candidates ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null; program_room_cohort_key: string }>;
        if (!list.length) continue;

        if (row.scenario === "forecast_hint") {
            const c = list[0]!;
            const md = { ...(c.metadata ?? {}), ...placementForecastMetadataFixture(PLACEMENT_FORECAST_FIXTURE_OPENING_SOON) };
            await supabase.from("placement_candidates").update({ metadata: md }).eq("id", c.id).eq("org_id", orgId);
        }

        if (row.scenario === "manual_adjustment") {
            const c = list[0]!;
            await upsertPlacementPinOverride(supabase, {
                orgId,
                userId: QA_ACTOR,
                role: "admin",
                placementCandidateId: c.id,
                reason: "Waitlist demo — manual pin",
                pin_ordinal: 1,
            });
        }
    }
}

async function main() {
    const orgId = process.env.DEV_QUEUE_ORG_ID?.trim() || process.env.ORG_ID?.trim() || "";
    if (!orgId) {
        console.error("Set DEV_QUEUE_ORG_ID or ORG_ID");
        process.exit(1);
    }
    const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
    const workUnitKey = process.env.WORK_UNIT_KEY?.trim() || "enrollment_pipeline";
    const supabase = createAdminClient();

    const { data: wu, error: wuErr } = await supabase
        .from("work_units")
        .select("id, metadata, key")
        .eq("org_id", orgId)
        .eq("key", workUnitKey)
        .maybeSingle();
    if (wuErr) throw new Error(wuErr.message);
    if (!wu?.id) {
        console.error(`Work unit key=${workUnitKey} not found. Run dev:seed:ensure-enrollment-pipeline first.`);
        process.exit(1);
    }

    const ctx: SeedCtx = {
        supabase,
        orgId,
        workUnitId: wu.id as string,
        siteNorthId: "",
        siteSouthId: "",
        dryRun,
    };

    ctx.siteNorthId = await resolveSharedCampusSiteId(ctx, "north");
    ctx.siteSouthId = await resolveSharedCampusSiteId(ctx, "south");

    await patchWorkUnitV2(ctx);

    const summary: Array<{ scenario: WaitlistDemoScenarioId; opportunity_id: string }> = [];
    for (const scenario of WAITLIST_DEMO_SCENARIO_ORDER) {
        summary.push(await seedScenario(ctx, scenario));
    }

    let backfillCounts = null;
    if (!dryRun) {
        const oppIds = summary.map((s) => s.opportunity_id).filter((id) => !id.startsWith("dry-run"));
        const { counts } = await runPlacementCandidateBackfill(supabase, {
            orgId,
            opportunityIds: oppIds,
            waitSinceFallbackCreatedAt: true,
        });
        backfillCounts = counts;
        await applyPostBackfillExtras(ctx, summary);
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                dry_run: dryRun,
                org_id: orgId,
                demo_batch_key: "waitlist_demo_v1",
                work_unit_key: workUnitKey,
                sites: { north: ctx.siteNorthId, south: ctx.siteSouthId },
                scenarios: summary,
                backfill: backfillCounts,
                shadow_mode: PLACEMENT_PRIORITY_DEMO_LAYER_V2.shadow_mode,
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
