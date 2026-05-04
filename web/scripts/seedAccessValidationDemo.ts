#!/usr/bin/env npx tsx
/**
 * Idempotent CRM access-validation seed (local/staging).
 *
 * Creates two departments, two site locations, paired work units, minimal persons/customers,
 * opportunities, jobs, and schedules so restricted site/department users can prove list + 404 behavior.
 *
 * Does not delete or update arbitrary existing rows. Only inserts when seed markers are absent.
 * User role/profile changes are optional and gated (see env below).
 *
 * Env (required):
 *   ACCESS_VALIDATION_ORG_ID=<uuid>
 *
 * Env (optional — user scopes; only when ACCESS_VALIDATION_APPLY_USER_SCOPES=true):
 *   ACCESS_VALIDATION_APPLY_USER_SCOPES=true
 *   ACCESS_VALIDATION_CORPORATE_USER_ID=<auth uuid>   → all/all profile (upsert)
 *   ACCESS_VALIDATION_REGIONAL_USER_ID=<auth uuid>    → restricted sites = both seeded sites; all departments
 *   ACCESS_VALIDATION_DIRECTOR_USER_ID=<auth uuid>    → restricted 1 site + 1 department (north lane)
 *
 * When applying user scopes, membership rows are inserted only if the user has NO existing user_roles row
 * for the org (role is not overwritten).
 *
 * Run from `web/`:
 *   npx tsx --tsconfig tsconfig.json scripts/seedAccessValidationDemo.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveScheduleStatusRowByKey } from "@/lib/admin/scheduleEffectiveStatusKey";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const PKG = "access_validation_demo_v1";
const SEED_KEY_DEPT_N = "access_val_dept_north";
const SEED_KEY_DEPT_S = "access_val_dept_south";
const SEED_KEY_SITE_N = "access_val_site_north";
const SEED_KEY_SITE_S = "access_val_site_south";
const SEED_KEY_WU_N = "access_val_wu_north";
const SEED_KEY_WU_S = "access_val_wu_south";
const SEED_LANE_A = "access_val_lane_a";
const SEED_LANE_B = "access_val_lane_b";

function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) {
        console.error(`Missing required env: ${name}`);
        process.exit(1);
    }
    return v;
}

async function ensureDepartment(supabase: ReturnType<typeof createAdminClient>, orgId: string, key: string, name: string): Promise<string> {
    const { data: existing } = await supabase.from("departments").select("id").eq("org_id", orgId).eq("key", key).maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
        .from("departments")
        .insert({
            org_id: orgId,
            key,
            name,
            description: `Access validation seed (${PKG})`,
            sort_order: 0,
            is_active: true,
            metadata: { access_validation_seed_key: key, demo_seed_package: PKG },
        })
        .select("id")
        .single();
    if (error) throw new Error(`departments insert ${key}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureSiteLocation(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    seedKey: string,
    label: string
): Promise<string> {
    const { data: existing } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>access_validation_seed_key", seedKey)
        .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
        .from("locations")
        .insert({
            org_id: orgId,
            label,
            location_type: "site",
            is_active: true,
            metadata: { access_validation_seed_key: seedKey, demo_seed_package: PKG },
        })
        .select("id")
        .single();
    if (error) throw new Error(`locations insert ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureWorkUnit(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    departmentId: string,
    key: string,
    name: string
): Promise<string> {
    const { data: existing } = await supabase
        .from("work_units")
        .select("id")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("key", key)
        .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
        .from("work_units")
        .insert({
            org_id: orgId,
            department_id: departmentId,
            key,
            name,
            queue_definition: {},
            metadata: { access_validation_seed_key: key, demo_seed_package: PKG },
        })
        .select("id")
        .single();
    if (error) throw new Error(`work_units insert ${key}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensurePerson(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    seedKey: string,
    first: string,
    last: string
): Promise<string> {
    const { data: existing } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>access_validation_seed_key", seedKey)
        .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
        .from("persons")
        .insert({
            org_id: orgId,
            first_name: first,
            last_name: last,
            metadata: { access_validation_seed_key: seedKey, demo_seed_package: PKG },
        })
        .select("id")
        .single();
    if (error) throw new Error(`persons insert ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureCustomer(supabase: ReturnType<typeof createAdminClient>, orgId: string, seedKey: string, name: string): Promise<string> {
    const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>access_validation_seed_key", seedKey)
        .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
        .from("customers")
        .insert({
            org_id: orgId,
            name,
            metadata: { access_validation_seed_key: seedKey, demo_seed_package: PKG },
        })
        .select("id")
        .single();
    if (error) throw new Error(`customers insert ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureOpportunity(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    seedKey: string,
    customerId: string,
    personId: string,
    workUnitId: string,
    locationId: string
): Promise<string> {
    const { data: existing } = await supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>access_validation_seed_key", seedKey)
        .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
        .from("opportunities")
        .insert({
            org_id: orgId,
            customer_id: customerId,
            primary_person_id: personId,
            primary_contact_id: null,
            work_unit_id: workUnitId,
            location_id: locationId,
            name: `Access validation — ${seedKey}`,
            status_key: "new_inquiry",
            metadata: { access_validation_seed_key: seedKey, demo_seed_package: PKG },
        })
        .select("id")
        .single();
    if (error) throw new Error(`opportunities insert ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureJob(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    seedKey: string,
    customerId: string,
    personId: string,
    opportunityId: string,
    workUnitId: string,
    locationId: string
): Promise<string> {
    const { data: existing } = await supabase.from("jobs").select("id").eq("org_id", orgId).eq("metadata->>access_validation_seed_key", seedKey).maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
        .from("jobs")
        .insert({
            org_id: orgId,
            customer_id: customerId,
            primary_person_id: personId,
            opportunity_id: opportunityId,
            work_unit_id: workUnitId,
            location_id: locationId,
            title: `Access validation job — ${seedKey}`,
            metadata: { access_validation_seed_key: seedKey, demo_seed_package: PKG },
        })
        .select("id")
        .single();
    if (error) throw new Error(`jobs insert ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureSchedule(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    seedKey: string,
    jobId: string,
    locationId: string
): Promise<string> {
    const { data: existing } = await supabase
        .from("schedules")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>access_validation_seed_key", seedKey)
        .maybeSingle();
    if (existing?.id) return existing.id as string;

    const start = new Date();
    start.setUTCMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const defaultSched = await resolveScheduleStatusRowByKey(supabase, "scheduled");

    const { data: created, error } = await supabase
        .from("schedules")
        .insert({
            org_id: orgId,
            job_id: jobId,
            location_id: locationId,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            timezone: "UTC",
            duration_minutes: 60,
            status_key: defaultSched?.key ?? "scheduled",
            schedule_status_id: defaultSched?.id ?? null,
            metadata: { access_validation_seed_key: seedKey, demo_seed_package: PKG },
        })
        .select("id")
        .single();
    if (error) throw new Error(`schedules insert ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureUserRoleIfAbsent(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    userId: string,
    role: string
): Promise<{ inserted: boolean }> {
    const { data: row } = await supabase.from("user_roles").select("user_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
    if (row) return { inserted: false };

    const { error } = await supabase.from("user_roles").insert({ org_id: orgId, user_id: userId, role } as never);
    if (error) throw new Error(`user_roles insert ${userId}: ${error.message}`);
    return { inserted: true };
}

async function applyUserAccessProfile(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    userId: string,
    department_scope: "all" | "restricted",
    site_scope: "all" | "restricted",
    department_ids: string[],
    site_location_ids: string[]
): Promise<void> {
    const { error: upErr } = await supabase.from("user_access_profiles").upsert(
        {
            user_id: userId,
            org_id: orgId,
            department_scope,
            site_scope,
        },
        { onConflict: "user_id,org_id" }
    );
    if (upErr) throw new Error(`user_access_profiles upsert: ${upErr.message}`);

    await supabase.from("user_department_access").delete().eq("user_id", userId).eq("org_id", orgId);
    await supabase.from("user_site_access").delete().eq("user_id", userId).eq("org_id", orgId);

    if (department_scope === "restricted" && department_ids.length) {
        const { error } = await supabase
            .from("user_department_access")
            .insert(department_ids.map((department_id) => ({ user_id: userId, org_id: orgId, department_id })));
        if (error) throw new Error(`user_department_access: ${error.message}`);
    }
    if (site_scope === "restricted" && site_location_ids.length) {
        const { error } = await supabase
            .from("user_site_access")
            .insert(site_location_ids.map((location_id) => ({ user_id: userId, org_id: orgId, location_id })));
        if (error) throw new Error(`user_site_access: ${error.message}`);
    }
}

async function main() {
    const orgId = requireEnv("ACCESS_VALIDATION_ORG_ID");
    const supabase = createAdminClient();

    const deptNorthId = await ensureDepartment(supabase, orgId, SEED_KEY_DEPT_N, "Access Validation — North");
    const deptSouthId = await ensureDepartment(supabase, orgId, SEED_KEY_DEPT_S, "Access Validation — South");

    const siteNorthId = await ensureSiteLocation(supabase, orgId, SEED_KEY_SITE_N, "Access Validation Site North");
    const siteSouthId = await ensureSiteLocation(supabase, orgId, SEED_KEY_SITE_S, "Access Validation Site South");

    const wuNorthId = await ensureWorkUnit(supabase, orgId, deptNorthId, SEED_KEY_WU_N, "Access Validation WU North");
    const wuSouthId = await ensureWorkUnit(supabase, orgId, deptSouthId, SEED_KEY_WU_S, "Access Validation WU South");

    const personA = await ensurePerson(supabase, orgId, `${SEED_LANE_A}:guardian`, "Lane", "AlphaGuardian");
    const personB = await ensurePerson(supabase, orgId, `${SEED_LANE_B}:guardian`, "Lane", "BetaGuardian");

    const custA = await ensureCustomer(supabase, orgId, `${SEED_LANE_A}:customer`, "Alpha Household");
    const custB = await ensureCustomer(supabase, orgId, `${SEED_LANE_B}:customer`, "Beta Household");

    const oppA = await ensureOpportunity(supabase, orgId, SEED_LANE_A, custA, personA, wuNorthId, siteNorthId);
    const oppB = await ensureOpportunity(supabase, orgId, SEED_LANE_B, custB, personB, wuSouthId, siteSouthId);

    const jobA = await ensureJob(supabase, orgId, SEED_LANE_A, custA, personA, oppA, wuNorthId, siteNorthId);
    const jobB = await ensureJob(supabase, orgId, SEED_LANE_B, custB, personB, oppB, wuSouthId, siteSouthId);

    const schedA = await ensureSchedule(supabase, orgId, `${SEED_LANE_A}:visit`, jobA, siteNorthId);
    const schedB = await ensureSchedule(supabase, orgId, `${SEED_LANE_B}:visit`, jobB, siteSouthId);

    console.log("\n--- Access validation seed (data) ---");
    console.log("org_id:", orgId);
    console.log("departments:", { north: deptNorthId, south: deptSouthId });
    console.log("sites:", { north: siteNorthId, south: siteSouthId });
    console.log("work_units:", { north: wuNorthId, south: wuSouthId });
    console.log("opportunities:", { laneA: oppA, laneB: oppB });
    console.log("jobs:", { laneA: jobA, laneB: jobB });
    console.log("schedules:", { laneA: schedA, laneB: schedB });

    if (process.env.ACCESS_VALIDATION_APPLY_USER_SCOPES === "true") {
        const corporateId = process.env.ACCESS_VALIDATION_CORPORATE_USER_ID?.trim();
        const regionalId = process.env.ACCESS_VALIDATION_REGIONAL_USER_ID?.trim();
        const directorId = process.env.ACCESS_VALIDATION_DIRECTOR_USER_ID?.trim();

        if (corporateId) {
            await ensureUserRoleIfAbsent(supabase, orgId, corporateId, "admin");
            await applyUserAccessProfile(supabase, orgId, corporateId, "all", "all", [], []);
            console.log("\nCorporate user: all/all profile upserted for", corporateId);
        }
        if (regionalId) {
            const rIns = await ensureUserRoleIfAbsent(supabase, orgId, regionalId, "regional_lead");
            await applyUserAccessProfile(supabase, orgId, regionalId, "all", "restricted", [], [siteNorthId, siteSouthId]);
            console.log("Regional user: restricted both seeded sites; all departments. role inserted?", rIns.inserted, regionalId);
        }
        if (directorId) {
            const dIns = await ensureUserRoleIfAbsent(supabase, orgId, directorId, "school_director");
            await applyUserAccessProfile(supabase, orgId, directorId, "restricted", "restricted", [deptNorthId], [siteNorthId]);
            console.log("Director user: north dept + north site only. role inserted?", dIns.inserted, directorId);
        }
    } else {
        console.log("\n(Skipped user_roles / profiles — set ACCESS_VALIDATION_APPLY_USER_SCOPES=true and user id env vars to apply.)");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
