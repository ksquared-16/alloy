#!/usr/bin/env npx tsx
/**
 * Idempotent CRM access-validation seed (local/staging).
 * **Maintenance:** Prefer the planned realistic staging reseed (`docs/sprints/archive/05_2026/staging_demo_reseed_sprint.md`) over extending this demo package for new product validation.
 *
 * Alloy model this seed demonstrates (no schema changes here):
 * - **Departments / work units** — reuses real org rows when present (`enrollment`; billing pillar resolves
 *   `billing_operations` → `billing` → `operations`). Creates normal-named pillars only if missing, then tags
 *   **seed-created** rows with `demo_seed_package` for cleanup. Demo opportunities attach to those depts’
 *   existing opportunity work units when possible, else a normal **Inquiries** work unit.
 * - **Sites** (`locations` with `location_type = site`) = physical campuses — North Campus; South Campus.
 *
 * Primary lanes: Enrollment workspace records tied to North Campus vs South Campus (same department, different sites).
 * Optional lanes: Billing / Operations workspace at each campus (proves department ≠ geography).
 *
 * Presets when ACCESS_VALIDATION_APPLY_USER_SCOPES=true:
 * - Corporate — `admin` role only; all departments, all sites (admin shell eligible).
 * - Regional — **`ops` + `regional_lead`** (shell needs `ops` or `admin`; scope unchanged: all departments, both seeded campuses).
 * - Director — **`ops` + `school_director`**; Enrollment dept + North Campus only.
 *
 * Optional cleanup (same org):
 * - Set ACCESS_VALIDATION_CLEAN_DEMO=true — deletes **v1 + v2** demo rows, drops legacy `access_val_dept_*`
 *   department trees, and **exits** (run again without the flag to re-seed).
 * - ACCESS_VALIDATION_CLEAN_OLD_DEMO=true — legacy alias; deletes **v1 only** (same as before).
 *
 * Inserts only when markers are absent per keyed entity (v2 package).
 *
 * Env (required):
 *   ACCESS_VALIDATION_ORG_ID=<uuid>
 *
 * Env (optional):
 *   ACCESS_VALIDATION_CLEAN_DEMO=true      → delete v1 + v2 demo rows (`demo_seed_package`), then **exit** (re-run without flag to seed)
 *   ACCESS_VALIDATION_CLEAN_OLD_DEMO=true  → delete v1 demo rows only (legacy), then continue
 *
 * Env (optional — user scopes; only when ACCESS_VALIDATION_APPLY_USER_SCOPES=true):
 *   ACCESS_VALIDATION_APPLY_USER_SCOPES=true
 *   ACCESS_VALIDATION_CORPORATE_USER_ID=<auth uuid>   → all/all profile (upsert)
 *   ACCESS_VALIDATION_REGIONAL_USER_ID=<auth uuid>    → both campuses; all departments; roles ops + regional_lead
 *   ACCESS_VALIDATION_DIRECTOR_USER_ID=<auth uuid>    → Enrollment dept + North Campus; roles ops + school_director
 *
 * Each `user_roles` row is one role; a user may have multiple rows per org (`ops` + persona role). Missing role rows are
 * inserted; existing rows are left unchanged.
 *
 * Run from `web/`:
 *   npx tsx --tsconfig tsconfig.json scripts/seedAccessValidationDemo.ts
 *
 * Manual verification (after composite PK on user_roles):
 * - Set ACCESS_VALIDATION_APPLY_USER_SCOPES=true and CORPORATE / REGIONAL / DIRECTOR auth user UUIDs.
 * - Run script; then confirm `user_roles` has multi-role rows (regional: ops + regional_lead; director: ops + school_director).
 * - Portal login: corporate admin; regional + director users must retain `ops` (or `admin`) for admin shell eligibility.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveScheduleStatusRowByKey } from "@/lib/admin/scheduleEffectiveStatusKey";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

/** Bump when seed keys/navigation change so metadata distinguishes newer demo rows from legacy runs. */
const PKG = "access_validation_demo_v2";

/** Legacy package — removed when CLEAN_OLD_DEMO or CLEAN_DEMO runs. */
const LEGACY_DEMO_PKG = "access_validation_demo_v1";

/** Minimal QueueDefinitionV1 so `/api/admin/work-units/:id/queues` succeeds for seeded opportunity work units. */
const ACCESS_VALIDATION_OPPORTUNITY_QUEUE_DEF = JSON.parse(
    JSON.stringify(
        validateQueueDefinition({
            version: 1,
            entity_type: "opportunity",
            queues: [
                {
                    key: "all",
                    label: "All opportunities",
                    description: "Demo opportunities in this work unit.",
                    filters: [],
                    sort: [{ field: "updated_at", direction: "desc" }],
                    limit: 120,
                    priority: "standard",
                    display: "list",
                },
            ],
        })
    )
) as Record<string, unknown>;

/** Canonical department keys — reuse existing org configuration (see `resolveOrCreateDepartmentForSeed`). */
const DEPT_KEY_ENROLLMENT = "enrollment";
const DEPT_KEYS_BILLING_PILLAR = ["billing_operations", "billing", "operations"] as const;

/** Physical campuses (`locations.location_type = site`). */
const SEED_KEY_SITE_NORTH_CAMPUS = "access_val_site_north_campus";
const SEED_KEY_SITE_SOUTH_CAMPUS = "access_val_site_south_campus";

/** Seed-only work units (created only when no suitable opportunity work unit exists in the department). */
const SEED_KEY_WU_ENROLLMENT = "access_val_wu_enrollment";
const SEED_KEY_WU_BILLING_OPS = "access_val_wu_billing_operations";

/** Legacy fake department keys — removed during CLEAN_DEMO after package deletes. */
const LEGACY_DEPT_KEYS = ["access_val_dept_enrollment", "access_val_dept_billing_operations"] as const;

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

/**
 * Deletes rows tagged with a given `metadata.demo_seed_package`. FK-safe order; scoped to org_id.
 */
async function deleteRowsForAccessValidationDemoPackage(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    demoPackage: string
): Promise<void> {
    console.log("\n--- Removing access-validation demo rows where metadata.demo_seed_package =", demoPackage, "---");
    console.log("org_id:", orgId);

    const tablesOrdered = [
        "schedules",
        "jobs",
        "opportunities",
        "customers",
        "persons",
        "work_units",
        "departments",
        "locations",
    ] as const;

    for (const table of tablesOrdered) {
        const { data, error } = await supabase
            .from(table)
            .delete()
            .eq("org_id", orgId)
            .eq("metadata->>demo_seed_package", demoPackage)
            .select("id");

        if (error) {
            throw new Error(`[cleanup ${table}] ${error.message}`);
        }
        const n = (data ?? []).length;
        if (n > 0) {
            console.log(`  deleted ${n} row(s) from ${table}`);
        }
    }

    console.log("--- Finished package:", demoPackage, "---\n");
}

/** Removes v1 and v2 access-validation demo markers from the org (preferred teardown after UI validation). */
async function deleteAllAccessValidationDemoPackages(supabase: ReturnType<typeof createAdminClient>, orgId: string): Promise<void> {
    console.log("\n=== ACCESS_VALIDATION_CLEAN_DEMO: removing v1 + v2 demo packages ===");
    await deleteRowsForAccessValidationDemoPackage(supabase, orgId, LEGACY_DEMO_PKG);
    await deleteRowsForAccessValidationDemoPackage(supabase, orgId, PKG);
    await deleteLegacyAccessValidationDepartmentTrees(supabase, orgId);
    console.log("=== Access-validation demo cleanup complete ===\n");
}

/**
 * Old seeds used dedicated department keys `access_val_dept_*`. Remove any remaining tree so /workspace
 * never keeps fake “Access Validation — …” pillars after cleanup.
 */
async function deleteLegacyAccessValidationDepartmentTrees(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string
): Promise<void> {
    const { data: depts, error } = await supabase
        .from("departments")
        .select("id, key")
        .eq("org_id", orgId)
        .in("key", [...LEGACY_DEPT_KEYS]);
    if (error) throw new Error(`[legacy access-val dept lookup] ${error.message}`);
    const ids = (depts ?? []).map((d) => (d as { id: string }).id).filter(Boolean);
    if (!ids.length) return;
    console.log("--- Removing legacy access-validation department keys:", LEGACY_DEPT_KEYS.join(", "), `(${ids.length} dept(s)) ---`);
    const { error: wuErr } = await supabase.from("work_units").delete().eq("org_id", orgId).in("department_id", ids);
    if (wuErr) throw new Error(`[legacy access-val work_units] ${wuErr.message}`);
    const { error: dErr } = await supabase.from("departments").delete().eq("org_id", orgId).in("id", ids);
    if (dErr) throw new Error(`[legacy access-val departments] ${dErr.message}`);
}

function queueDefEntityType(queueDefinition: unknown): string | null {
    if (!queueDefinition || typeof queueDefinition !== "object") return null;
    const et = (queueDefinition as { entity_type?: unknown }).entity_type;
    return typeof et === "string" ? et.trim().toLowerCase() : null;
}

async function resolveOrCreateDepartmentForSeed(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    resolveKeys: string[],
    create: { key: string; name: string; description: string | null }
): Promise<{ id: string; key: string; reused: boolean }> {
    for (const raw of resolveKeys) {
        const k = raw.trim().toLowerCase();
        if (!k) continue;
        const { data: row } = await supabase.from("departments").select("id, key").eq("org_id", orgId).eq("key", k).maybeSingle();
        if (row?.id) {
            return { id: row.id as string, key: (row as { key: string }).key, reused: true };
        }
    }
    const ck = create.key.trim().toLowerCase();
    const { data: created, error } = await supabase
        .from("departments")
        .insert({
            org_id: orgId,
            key: ck,
            name: create.name,
            description: create.description,
            sort_order: 99,
            is_active: true,
            metadata: { access_validation_seed_key: ck, demo_seed_package: PKG },
        })
        .select("id, key")
        .single();
    if (error) throw new Error(`departments insert (seed create) ${ck}: ${error.message}`);
    return { id: (created as { id: string }).id, key: (created as { key: string }).key, reused: false };
}

/**
 * Prefer an existing opportunity-configured work unit in the department; otherwise insert a normal-looking
 * “Inquiries” lane tagged for demo cleanup.
 */
async function ensureOpportunityWorkUnitInDepartment(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    departmentId: string,
    opts: {
        preferWorkUnitKeys: string[];
        createKey: string;
        createName: string;
        accessValidationSeedKeyForCreate: string;
    }
): Promise<string> {
    const { data: rows, error } = await supabase
        .from("work_units")
        .select("id, key, queue_definition, metadata")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .order("sort_order", { ascending: true });
    if (error) throw new Error(`work_units list: ${error.message}`);
    const list = (rows ?? []) as Array<{
        id: string;
        key?: string | null;
        queue_definition: unknown;
        metadata?: Record<string, unknown> | null;
    }>;

    for (const r of list) {
        if (queueDefEntityType(r.queue_definition) === "opportunity") return r.id;
    }
    for (const pk of opts.preferWorkUnitKeys) {
        const want = pk.trim().toLowerCase();
        const hit = list.find((r) => (r.key ?? "").trim().toLowerCase() === want);
        if (hit && queueDefEntityType(hit.queue_definition) === "opportunity") return hit.id;
    }

    const ck = opts.createKey.trim().toLowerCase();
    const existingCreateKey = list.find((r) => (r.key ?? "").trim().toLowerCase() === ck);
    if (existingCreateKey?.id) {
        if (queueDefEntityType(existingCreateKey.queue_definition) === "opportunity") return existingCreateKey.id;
        const rowMeta = existingCreateKey.metadata as { demo_seed_package?: string } | undefined;
        if (rowMeta?.demo_seed_package === PKG) {
            const { error: fixErr } = await supabase
                .from("work_units")
                .update({
                    queue_definition: ACCESS_VALIDATION_OPPORTUNITY_QUEUE_DEF,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existingCreateKey.id)
                .eq("org_id", orgId);
            if (fixErr) throw new Error(`work_units patch queue_definition ${ck}: ${fixErr.message}`);
            return existingCreateKey.id;
        }
    }

    const { data: created, error: insErr } = await supabase
        .from("work_units")
        .insert({
            org_id: orgId,
            department_id: departmentId,
            key: ck,
            name: opts.createName,
            queue_definition: ACCESS_VALIDATION_OPPORTUNITY_QUEUE_DEF,
            metadata: { access_validation_seed_key: opts.accessValidationSeedKeyForCreate, demo_seed_package: PKG },
        })
        .select("id")
        .single();
    if (insErr) throw new Error(`work_units insert ${ck}: ${insErr.message}`);
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

/** Existing installs may have `{}` queue_definition — upgrade seed-tagged work units in place. */
async function syncAccessValidationWorkUnitQueueDefinitions(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    workUnitIds: string[]
): Promise<void> {
    for (const id of workUnitIds) {
        const { data, error } = await supabase.from("work_units").select("metadata").eq("id", id).eq("org_id", orgId).maybeSingle();
        if (error || !data) continue;
        const pkg = (data as { metadata?: { demo_seed_package?: string } }).metadata?.demo_seed_package;
        if (pkg !== PKG) continue;

        const { error: upErr } = await supabase
            .from("work_units")
            .update({
                queue_definition: ACCESS_VALIDATION_OPPORTUNITY_QUEUE_DEF,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("org_id", orgId);
        if (upErr) {
            console.warn(`[sync queue_definition] work_unit ${id}: ${upErr.message}`);
        }
    }
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
    const { data: row } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .eq("role", role)
        .maybeSingle();
    if (row) return { inserted: false };

    const { error } = await supabase.from("user_roles").insert({ org_id: orgId, user_id: userId, role } as never);
    if (error) throw new Error(`user_roles insert ${userId} role=${role}: ${error.message}`);
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

    const cleanDemo = process.env.ACCESS_VALIDATION_CLEAN_DEMO?.trim().toLowerCase() === "true";
    const cleanOldOnly = process.env.ACCESS_VALIDATION_CLEAN_OLD_DEMO?.trim().toLowerCase() === "true";

    if (cleanDemo) {
        await deleteAllAccessValidationDemoPackages(supabase, orgId);
        console.log("\nACCESS_VALIDATION_CLEAN_DEMO finished. Re-run without this flag to seed again.");
        return;
    }
    if (cleanOldOnly) {
        await deleteRowsForAccessValidationDemoPackage(supabase, orgId, LEGACY_DEMO_PKG);
        await deleteLegacyAccessValidationDepartmentTrees(supabase, orgId);
    }

    const deptEnrollment = await resolveOrCreateDepartmentForSeed(supabase, orgId, [DEPT_KEY_ENROLLMENT], {
        key: DEPT_KEY_ENROLLMENT,
        name: "Enrollment",
        description: null,
    });
    const deptBilling = await resolveOrCreateDepartmentForSeed(supabase, orgId, [...DEPT_KEYS_BILLING_PILLAR], {
        key: "billing_operations",
        name: "Billing / Operations",
        description: null,
    });
    const deptEnrollmentId = deptEnrollment.id;
    const deptBillingOpsId = deptBilling.id;

    const siteNorthCampusId = await ensureSiteLocation(supabase, orgId, SEED_KEY_SITE_NORTH_CAMPUS, "North Campus");
    const siteSouthCampusId = await ensureSiteLocation(supabase, orgId, SEED_KEY_SITE_SOUTH_CAMPUS, "South Campus");

    const wuEnrollmentId = await ensureOpportunityWorkUnitInDepartment(supabase, orgId, deptEnrollmentId, {
        preferWorkUnitKeys: ["enrollment_pipeline", "pipeline_overview", "crm_pipeline", "all"],
        createKey: "inquiries",
        createName: "Inquiries",
        accessValidationSeedKeyForCreate: SEED_KEY_WU_ENROLLMENT,
    });
    const wuBillingOpsId = await ensureOpportunityWorkUnitInDepartment(supabase, orgId, deptBillingOpsId, {
        preferWorkUnitKeys: ["enrollment_pipeline", "new_leads", "pipeline_overview", "crm_pipeline"],
        createKey: "inquiries",
        createName: "Inquiries",
        accessValidationSeedKeyForCreate: SEED_KEY_WU_BILLING_OPS,
    });

    await syncAccessValidationWorkUnitQueueDefinitions(supabase, orgId, [wuEnrollmentId, wuBillingOpsId]);

    // Primary lanes: Enrollment functional area × physical campus.
    const personEnrN = await ensurePerson(supabase, orgId, `${SEED_LANE_ENROLLMENT_NORTH}:guardian`, "Enrollment", "North Guardian");
    const personEnrS = await ensurePerson(supabase, orgId, `${SEED_LANE_ENROLLMENT_SOUTH}:guardian`, "Enrollment", "South Guardian");

    const custEnrN = await ensureCustomer(supabase, orgId, `${SEED_LANE_ENROLLMENT_NORTH}:customer`, "Enrollment · North Campus Household");
    const custEnrS = await ensureCustomer(supabase, orgId, `${SEED_LANE_ENROLLMENT_SOUTH}:customer`, "Enrollment · South Campus Household");

    const oppEnrN = await ensureOpportunity(
        supabase,
        orgId,
        SEED_LANE_ENROLLMENT_NORTH,
        "Enrollment · North Campus",
        custEnrN,
        personEnrN,
        wuEnrollmentId,
        siteNorthCampusId
    );
    const oppEnrS = await ensureOpportunity(
        supabase,
        orgId,
        SEED_LANE_ENROLLMENT_SOUTH,
        "Enrollment · South Campus",
        custEnrS,
        personEnrS,
        wuEnrollmentId,
        siteSouthCampusId
    );

    const jobEnrN = await ensureJob(
        supabase,
        orgId,
        SEED_LANE_ENROLLMENT_NORTH,
        "Enrollment follow-up — North Campus",
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
        "Enrollment follow-up — South Campus",
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
        "Billing / Operations · North Campus",
        custBoN,
        personBoN,
        wuBillingOpsId,
        siteNorthCampusId
    );
    const oppBoS = await ensureOpportunity(
        supabase,
        orgId,
        SEED_LANE_BILLING_OPS_SOUTH,
        "Billing / Operations · South Campus",
        custBoS,
        personBoS,
        wuBillingOpsId,
        siteSouthCampusId
    );

    const jobBoN = await ensureJob(
        supabase,
        orgId,
        SEED_LANE_BILLING_OPS_NORTH,
        "Billing / Operations follow-up — North Campus",
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
        "Billing / Operations follow-up — South Campus",
        custBoS,
        personBoS,
        oppBoS,
        wuBillingOpsId,
        siteSouthCampusId
    );

    const schedBoN = await ensureSchedule(supabase, orgId, `${SEED_LANE_BILLING_OPS_NORTH}:visit`, jobBoN, siteNorthCampusId);
    const schedBoS = await ensureSchedule(supabase, orgId, `${SEED_LANE_BILLING_OPS_SOUTH}:visit`, jobBoS, siteSouthCampusId);

    console.log("\n--- Access validation seed (data) — demo package:", PKG, "---");
    console.log("Semantics: reuse real department keys (enrollment; billing/operations pillar); sites = physical campuses.");
    console.log("org_id:", orgId);
    console.log("departments:", {
        enrollment: { id: deptEnrollmentId, key: deptEnrollment.key, reused: deptEnrollment.reused },
        billing_pillar: { id: deptBillingOpsId, key: deptBilling.key, reused: deptBilling.reused },
    });
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
            console.log("\nCorporate user: role admin (admin shell); profile all/all for", corporateId);
        }
        if (regionalId) {
            const rOps = await ensureUserRoleIfAbsent(supabase, orgId, regionalId, "ops");
            const rLead = await ensureUserRoleIfAbsent(supabase, orgId, regionalId, "regional_lead");
            await applyUserAccessProfile(supabase, orgId, regionalId, "all", "restricted", [], [siteNorthCampusId, siteSouthCampusId]);
            console.log(
                "Regional user: roles ops + regional_lead (admin shell + persona); scope = all departments, both seeded campuses. inserted:",
                { ops: rOps.inserted, regional_lead: rLead.inserted },
                regionalId
            );
        }
        if (directorId) {
            const dOps = await ensureUserRoleIfAbsent(supabase, orgId, directorId, "ops");
            const dDir = await ensureUserRoleIfAbsent(supabase, orgId, directorId, "school_director");
            await applyUserAccessProfile(supabase, orgId, directorId, "restricted", "restricted", [deptEnrollmentId], [siteNorthCampusId]);
            console.log(
                "Director user: roles ops + school_director; scope = Enrollment dept + North Campus only. inserted:",
                { ops: dOps.inserted, school_director: dDir.inserted },
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
