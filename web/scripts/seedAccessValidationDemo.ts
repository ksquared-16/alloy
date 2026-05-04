#!/usr/bin/env npx tsx
/**
 * Idempotent CRM access-validation seed (local/staging).
 *
 * Alloy model this seed demonstrates (no schema changes here):
 * - **Departments / work units** = functional areas — Enrollment; Billing / Operations.
 * - **Sites** (`locations` with `location_type = site`) = physical campuses — North Campus; South Campus.
 *
 * Primary lanes: Enrollment workspace records tied to North Campus vs South Campus (same department, different sites).
 * Optional lanes: Billing / Operations workspace at each campus (proves department ≠ geography).
 *
 * Presets when ACCESS_VALIDATION_APPLY_USER_SCOPES=true:
 * - Corporate — all departments, all sites.
 * - Regional — all departments; sites restricted to both seeded campuses.
 * - Director — **Enrollment department only** + **North Campus site only** (Enrollment @ North lane only).
 *
 * Does not delete existing rows; inserts only when markers are absent per keyed entity.
 *
 * Env (required):
 *   ACCESS_VALIDATION_ORG_ID=<uuid>
 *
 * Env (optional — user scopes; only when ACCESS_VALIDATION_APPLY_USER_SCOPES=true):
 *   ACCESS_VALIDATION_APPLY_USER_SCOPES=true
 *   ACCESS_VALIDATION_CORPORATE_USER_ID=<auth uuid>   → all/all profile (upsert)
 *   ACCESS_VALIDATION_REGIONAL_USER_ID=<auth uuid>    → both campuses; all departments
 *   ACCESS_VALIDATION_DIRECTOR_USER_ID=<auth uuid>    → Enrollment dept + North Campus only
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

/** Bump when seed keys/navigation change so metadata distinguishes newer demo rows from legacy runs. */
const PKG = "access_validation_demo_v2";

/** Functional departments (workspace pillars). */
const SEED_KEY_DEPT_ENROLLMENT = "access_val_dept_enrollment";
const SEED_KEY_DEPT_BILLING_OPS = "access_val_dept_billing_operations";

/** Physical campuses (`locations.location_type = site`). */
const SEED_KEY_SITE_NORTH_CAMPUS = "access_val_site_north_campus";
const SEED_KEY_SITE_SOUTH_CAMPUS = "access_val_site_south_campus";

/** Work units — one per functional department (not per campus). */
const SEED_KEY_WU_ENROLLMENT = "access_val_wu_enrollment";
const SEED_KEY_WU_BILLING_OPS = "access_val_wu_billing_operations";

/** Validation lanes (seed marker keys — encode dept flavor + campus). */
const SEED_LANE_ENROLLMENT_NORTH = "access_val_lane_enrollment_north_campus";
const SEED_LANE_ENROLLMENT_SOUTH = "access_val_lane_enrollment_south_campus";
const SEED_LANE_BILLING_OPS_NORTH = "access_val_lane_billing_ops_north_campus";
const SEED_LANE_BILLING_OPS_SOUTH = "access_val_lane_billing_ops_south_campus";

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
    opportunityName: string,
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
            name: opportunityName,
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
    jobTitle: string,
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
            title: jobTitle,
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

    const deptEnrollmentId = await ensureDepartment(supabase, orgId, SEED_KEY_DEPT_ENROLLMENT, "Access Validation — Enrollment");
    const deptBillingOpsId = await ensureDepartment(supabase, orgId, SEED_KEY_DEPT_BILLING_OPS, "Access Validation — Billing / Operations");

    const siteNorthCampusId = await ensureSiteLocation(supabase, orgId, SEED_KEY_SITE_NORTH_CAMPUS, "Access Validation — North Campus");
    const siteSouthCampusId = await ensureSiteLocation(supabase, orgId, SEED_KEY_SITE_SOUTH_CAMPUS, "Access Validation — South Campus");

    const wuEnrollmentId = await ensureWorkUnit(supabase, orgId, deptEnrollmentId, SEED_KEY_WU_ENROLLMENT, "Access Validation — Enrollment workspace");
    const wuBillingOpsId = await ensureWorkUnit(supabase, orgId, deptBillingOpsId, SEED_KEY_WU_BILLING_OPS, "Access Validation — Billing / Operations workspace");

    // Primary lanes: Enrollment functional area × physical campus.
    const personEnrN = await ensurePerson(supabase, orgId, `${SEED_LANE_ENROLLMENT_NORTH}:guardian`, "Enrollment", "North Guardian");
    const personEnrS = await ensurePerson(supabase, orgId, `${SEED_LANE_ENROLLMENT_SOUTH}:guardian`, "Enrollment", "South Guardian");

    const custEnrN = await ensureCustomer(supabase, orgId, `${SEED_LANE_ENROLLMENT_NORTH}:customer`, "Enrollment · North Campus Household");
    const custEnrS = await ensureCustomer(supabase, orgId, `${SEED_LANE_ENROLLMENT_SOUTH}:customer`, "Enrollment · South Campus Household");

    const oppEnrN = await ensureOpportunity(
        supabase,
        orgId,
        SEED_LANE_ENROLLMENT_NORTH,
        "Access validation — Enrollment · North Campus",
        custEnrN,
        personEnrN,
        wuEnrollmentId,
        siteNorthCampusId
    );
    const oppEnrS = await ensureOpportunity(
        supabase,
        orgId,
        SEED_LANE_ENROLLMENT_SOUTH,
        "Access validation — Enrollment · South Campus",
        custEnrS,
        personEnrS,
        wuEnrollmentId,
        siteSouthCampusId
    );

    const jobEnrN = await ensureJob(
        supabase,
        orgId,
        SEED_LANE_ENROLLMENT_NORTH,
        "Access validation job — Enrollment · North Campus",
        custEnrN,
        personEnrN,
        oppEnrN,
        wuEnrollmentId,
        siteNorthCampusId
    );
    const jobEnrS = await ensureJob(
        supabase,
        orgId,
        SEED_LANE_ENROLLMENT_SOUTH,
        "Access validation job — Enrollment · South Campus",
        custEnrS,
        personEnrS,
        oppEnrS,
        wuEnrollmentId,
        siteSouthCampusId
    );

    const schedEnrN = await ensureSchedule(supabase, orgId, `${SEED_LANE_ENROLLMENT_NORTH}:visit`, jobEnrN, siteNorthCampusId);
    const schedEnrS = await ensureSchedule(supabase, orgId, `${SEED_LANE_ENROLLMENT_SOUTH}:visit`, jobEnrS, siteSouthCampusId);

    // Optional lanes: Billing / Operations × each campus (department scope differs from Enrollment-only director).
    const personBoN = await ensurePerson(supabase, orgId, `${SEED_LANE_BILLING_OPS_NORTH}:guardian`, "Billing Ops", "North Guardian");
    const personBoS = await ensurePerson(supabase, orgId, `${SEED_LANE_BILLING_OPS_SOUTH}:guardian`, "Billing Ops", "South Guardian");

    const custBoN = await ensureCustomer(supabase, orgId, `${SEED_LANE_BILLING_OPS_NORTH}:customer`, "Billing / Ops · North Campus Household");
    const custBoS = await ensureCustomer(supabase, orgId, `${SEED_LANE_BILLING_OPS_SOUTH}:customer`, "Billing / Ops · South Campus Household");

    const oppBoN = await ensureOpportunity(
        supabase,
        orgId,
        SEED_LANE_BILLING_OPS_NORTH,
        "Access validation — Billing / Operations · North Campus",
        custBoN,
        personBoN,
        wuBillingOpsId,
        siteNorthCampusId
    );
    const oppBoS = await ensureOpportunity(
        supabase,
        orgId,
        SEED_LANE_BILLING_OPS_SOUTH,
        "Access validation — Billing / Operations · South Campus",
        custBoS,
        personBoS,
        wuBillingOpsId,
        siteSouthCampusId
    );

    const jobBoN = await ensureJob(
        supabase,
        orgId,
        SEED_LANE_BILLING_OPS_NORTH,
        "Access validation job — Billing / Ops · North Campus",
        custBoN,
        personBoN,
        oppBoN,
        wuBillingOpsId,
        siteNorthCampusId
    );
    const jobBoS = await ensureJob(
        supabase,
        orgId,
        SEED_LANE_BILLING_OPS_SOUTH,
        "Access validation job — Billing / Ops · South Campus",
        custBoS,
        personBoS,
        oppBoS,
        wuBillingOpsId,
        siteSouthCampusId
    );

    const schedBoN = await ensureSchedule(supabase, orgId, `${SEED_LANE_BILLING_OPS_NORTH}:visit`, jobBoN, siteNorthCampusId);
    const schedBoS = await ensureSchedule(supabase, orgId, `${SEED_LANE_BILLING_OPS_SOUTH}:visit`, jobBoS, siteSouthCampusId);

    console.log("\n--- Access validation seed (data) — demo package:", PKG, "---");
    console.log("Semantics: departments/work units = functional; sites = physical campuses.");
    console.log("org_id:", orgId);
    console.log("departments (functional):", { enrollment: deptEnrollmentId, billing_operations: deptBillingOpsId });
    console.log("sites / campuses (physical):", { north_campus: siteNorthCampusId, south_campus: siteSouthCampusId });
    console.log("work_units:", { enrollment: wuEnrollmentId, billing_operations: wuBillingOpsId });
    console.log("lanes — Enrollment:", {
        north_campus: { opportunity_id: oppEnrN, job_id: jobEnrN, schedule_id: schedEnrN },
        south_campus: { opportunity_id: oppEnrS, job_id: jobEnrS, schedule_id: schedEnrS },
    });
    console.log("lanes — Billing / Operations (optional):", {
        north_campus: { opportunity_id: oppBoN, job_id: jobBoN, schedule_id: schedBoN },
        south_campus: { opportunity_id: oppBoS, job_id: jobBoS, schedule_id: schedBoS },
    });

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
            await applyUserAccessProfile(supabase, orgId, regionalId, "all", "restricted", [], [siteNorthCampusId, siteSouthCampusId]);
            console.log(
                "Regional user: both seeded campuses (sites); all functional departments. role inserted?",
                rIns.inserted,
                regionalId
            );
        }
        if (directorId) {
            const dIns = await ensureUserRoleIfAbsent(supabase, orgId, directorId, "school_director");
            await applyUserAccessProfile(supabase, orgId, directorId, "restricted", "restricted", [deptEnrollmentId], [siteNorthCampusId]);
            console.log(
                "Director user: Enrollment department + North Campus site only (Enrollment · North lane). role inserted?",
                dIns.inserted,
                directorId
            );
        }
    } else {
        console.log("\n(Skipped user_roles / profiles — set ACCESS_VALIDATION_APPLY_USER_SCOPES=true and user id env vars to apply.)");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
