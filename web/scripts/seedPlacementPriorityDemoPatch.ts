#!/usr/bin/env npx tsx
/**
 * Idempotent Priority Placement demo patch (Cards 8–9):
 * - Sets `work_units.metadata.placement_priority_v1` on the enrollment pipeline work unit (shadow, `waitlisted` only).
 * - Ensures six waitlisted demo opportunities with distinct placement facts (staff, community, sibling, sister center, general, unknown sibling).
 *
 * Env:
 *   DEV_QUEUE_ORG_ID=uuid   (preferred, aligns with ensureEnrollmentPipelineWorkUnitV1)
 *   ORG_ID=uuid             (fallback, aligns with seedEnrollmentPipelineDemoData)
 *   WORK_UNIT_KEY=enrollment_pipeline   (optional default)
 *
 * Run from repo `web/`:
 *   npx tsx --tsconfig tsconfig.json scripts/seedPlacementPriorityDemoPatch.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import {
    mergePlacementDemoIntoOpportunityMetadata,
    mergePlacementDemoLayerIntoWorkUnitMetadata,
    PLACEMENT_DEMO_SCENARIO_SEED_KEYS,
    type PlacementDemoScenarioId,
} from "@/lib/orchestration/placement/placementPriorityDemoPatch";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const SCENARIOS: PlacementDemoScenarioId[] = [
    "staff",
    "community",
    "sibling",
    "sister_center",
    "general",
    "sibling_unknown",
];

const FAMILY_LAST_BY_SCENARIO: Record<PlacementDemoScenarioId, string> = {
    staff: "Rivera",
    community: "Brooks",
    sibling: "Okonkwo",
    sister_center: "Nolan",
    general: "Kim",
    sibling_unknown: "Abbott",
};

function isoDate(d: Date): string {
    return d.toISOString();
}

function seedEmail(orgId: string, seedKey: string): string {
    const orgTag = orgId.replace(/-/g, "").slice(0, 10);
    const slug = (seedKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "seed").slice(0, 26);
    return `${slug}+${orgTag}@demo.alloy.invalid`;
}

function seedPhone(orgId: string, seedKey: string): string {
    const combined = `${seedKey}|${orgId}|placement`;
    const n = Math.abs(combined.split("").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0));
    const s = String(1000000 + (n % 9000000));
    return `+1415${s}`;
}

async function ensureCustomer(supabase: ReturnType<typeof createAdminClient>, orgId: string, seedKey: string, familyLast: string): Promise<string> {
    const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", seedKey)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) return (existing as { id: string }).id;

    const { data: created, error } = await supabase
        .from("customers")
        .insert({
            org_id: orgId,
            name: `${familyLast} Family`,
            metadata: { seed_key: seedKey, demo_seed_package: "placement_priority_demo_v1" },
        })
        .select("id")
        .single();
    if (error) throw new Error(`customers insert failed (${seedKey}): ${error.message}`);
    return (created as { id: string }).id;
}

async function ensurePerson(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    seedKey: string,
    first: string,
    last: string,
    role: string
): Promise<string> {
    const k = `${seedKey}:${role}:${first}:${last}`;
    const { data: existing } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", k)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) return (existing as { id: string }).id;

    const { data: created, error } = await supabase
        .from("persons")
        .insert({
            org_id: orgId,
            first_name: first,
            last_name: last,
            email: role === "guardian" ? seedEmail(orgId, seedKey) : null,
            phone: role === "guardian" ? seedPhone(orgId, seedKey) : null,
            metadata: { seed_key: k, demo_seed_package: "placement_priority_demo_v1" },
        })
        .select("id")
        .single();
    if (error) throw new Error(`persons insert failed (${seedKey}): ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureCustomerPerson(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    customerId: string,
    personId: string
): Promise<void> {
    const { error } = await supabase.from("customer_persons").insert({
        org_id: orgId,
        customer_id: customerId,
        person_id: personId,
        role_type: "guardian",
        is_primary: true,
    } as never);
    if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
        console.warn("[placement-demo] customer_persons insert:", error.message);
    }
}

async function ensureCustomerMemberChild(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    customerId: string,
    seedKey: string,
    child: { first: string; last: string },
    idx: number
): Promise<string> {
    const memberSeedKey = `${seedKey}:child:${idx}`;
    const { data: existing } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("metadata->>seed_key", memberSeedKey)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) return (existing as { id: string }).id;

    const childPersonId = await ensurePerson(supabase, orgId, seedKey, child.first, child.last, `child:${idx}`);
    const display = `${child.first} ${child.last}`.trim();
    const { data: created, error } = await supabase
        .from("customer_members")
        .insert({
            org_id: orgId,
            customer_id: customerId,
            display_name: display,
            relationship: "child",
            first_name: child.first,
            last_name: child.last,
            person_id: childPersonId,
            metadata: { seed_key: memberSeedKey, demo_seed_package: "placement_priority_demo_v1" },
        } as never)
        .select("id")
        .single();
    if (error) throw new Error(`customer_members insert failed (${seedKey}): ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureOppChildJoin(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    opportunityId: string,
    customerMemberId: string
): Promise<void> {
    const { error } = await supabase
        .from("opportunity_customer_members")
        .insert({ org_id: orgId, opportunity_id: opportunityId, customer_member_id: customerMemberId } as never);
    if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
        throw new Error(`opportunity_customer_members insert failed: ${error.message}`);
    }
}

async function insertPlacementDemoOpportunity(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    workUnitId: string,
    scenario: PlacementDemoScenarioId,
    seedKey: string,
    familyLast: string,
    guardianPersonId: string,
    customerId: string
): Promise<string> {
    const now = new Date();
    const meta = mergePlacementDemoIntoOpportunityMetadata(
        {
            notes: `Placement priority demo — ${scenario}`,
            next_step: "Demo row for Admin V2 placement preview.",
        },
        scenario
    );

    const insertRow: Record<string, unknown> = {
        org_id: orgId,
        name: `Placement demo — ${familyLast}`,
        status_key: "waitlisted",
        work_unit_id: workUnitId,
        customer_id: customerId,
        primary_person_id: guardianPersonId,
        primary_contact_id: null,
        metadata: meta,
        created_at: isoDate(now),
        updated_at: isoDate(now),
    };
    await normalizeOpportunityWritePayload(supabase, insertRow, "seedPlacementPriorityDemoPatch:insert");
    const { data: created, error } = await supabase.from("opportunities").insert(insertRow as never).select("id").single();
    if (error) throw new Error(`opportunities insert failed (${seedKey}): ${error.message}`);
    return (created as { id: string }).id;
}

async function main() {
    const orgId = process.env.DEV_QUEUE_ORG_ID?.trim() || process.env.ORG_ID?.trim() || "";
    if (!orgId) {
        console.error("Set DEV_QUEUE_ORG_ID or ORG_ID to the target org UUID.");
        process.exit(1);
    }

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
        console.error(`Work unit not found for key=${workUnitKey} org=${orgId}. Run dev:seed:ensure-enrollment-pipeline first.`);
        process.exit(1);
    }

    const { metadata: nextWuMeta, changed: wuMetaChanged } = mergePlacementDemoLayerIntoWorkUnitMetadata(
        (wu as { metadata?: unknown }).metadata
    );
    if (wuMetaChanged) {
        const { error } = await supabase.from("work_units").update({ metadata: nextWuMeta }).eq("id", wu.id).eq("org_id", orgId);
        if (error) throw new Error(error.message);
        console.log("[placement-demo] patched work_units.metadata.placement_priority_v1", {
            work_unit_id: wu.id,
            key: workUnitKey,
        });
    } else {
        console.log("[placement-demo] work_units.metadata.placement_priority_v1 unchanged (already demo-shaped)", {
            work_unit_id: wu.id,
        });
    }

    const workUnitId = wu.id as string;
    const summary: Array<{ scenario: PlacementDemoScenarioId; opportunity_id: string; action: "created" | "updated" }> = [];

    for (const scenario of SCENARIOS) {
        const seedKey = PLACEMENT_DEMO_SCENARIO_SEED_KEYS[scenario];
        const familyLast = FAMILY_LAST_BY_SCENARIO[scenario];

        const { data: existing, error: exErr } = await supabase
            .from("opportunities")
            .select("id, metadata")
            .eq("org_id", orgId)
            .eq("metadata->>seed_key", seedKey)
            .maybeSingle();
        if (exErr) throw new Error(exErr.message);

        const mergedMeta = mergePlacementDemoIntoOpportunityMetadata(
            (existing as { metadata?: Record<string, unknown> } | null)?.metadata,
            scenario
        );

        if (existing?.id) {
            const updateRow: Record<string, unknown> = {
                status_key: "waitlisted",
                work_unit_id: workUnitId,
                name: `Placement demo — ${familyLast}`,
                metadata: mergedMeta,
            };
            await normalizeOpportunityWritePayload(supabase, updateRow, "seedPlacementPriorityDemoPatch:update");
            const { error } = await supabase.from("opportunities").update(updateRow as never).eq("id", existing.id).eq("org_id", orgId);
            if (error) throw new Error(error.message);
            summary.push({ scenario, opportunity_id: existing.id as string, action: "updated" });
            console.log("[placement-demo] updated opportunity", { scenario, seed_key: seedKey, opportunity_id: existing.id });
        } else {
            const customerId = await ensureCustomer(supabase, orgId, seedKey, familyLast);
            const guardianId = await ensurePerson(supabase, orgId, seedKey, "Parent", familyLast, "guardian");
            await ensureCustomerPerson(supabase, orgId, customerId, guardianId);
            const oppId = await insertPlacementDemoOpportunity(
                supabase,
                orgId,
                workUnitId,
                scenario,
                seedKey,
                familyLast,
                guardianId,
                customerId
            );
            const cmId = await ensureCustomerMemberChild(supabase, orgId, customerId, seedKey, { first: "Jamie", last: familyLast }, 0);
            await ensureOppChildJoin(supabase, orgId, oppId, cmId);
            summary.push({ scenario, opportunity_id: oppId, action: "created" });
            console.log("[placement-demo] created opportunity", { scenario, seed_key: seedKey, opportunity_id: oppId });
        }
    }

    console.log("[placement-demo] complete", {
        orgId,
        work_unit_key: workUnitKey,
        work_unit_metadata_changed: wuMetaChanged,
        rows: summary,
    });
    console.log(
        "[placement-demo] Manual check: Admin V2 → department → Enrollment pipeline work unit → Waitlisted tab — expect placement strips + lane hint (shadow)."
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
