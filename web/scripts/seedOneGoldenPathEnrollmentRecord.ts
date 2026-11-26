#!/usr/bin/env npx tsx
/**
 * Phase 3 — seed ONE golden-path enrollment record for UI inspection.
 *
 * Creates a minimal, realistic household:
 * - 1 guardian person + 1 child person/member
 * - 1 opportunity on enrollment_pipeline work unit (resolved lead status from org config)
 * - 2 operational tasks, 1 communication thread, 1 document
 * - Uses existing org site location (does not create schools/sites)
 *
 * Idempotent via metadata.seed_key = golden_path_martinez_v1
 *
 * Env:
 *   DEMO_SEED_ORG_ID or DEMO_RESET_ORG_ID (required)
 *   SUPABASE_SERVICE_ROLE_KEY (required)
 *   DEMO_SEED_RUN_ID (optional — defaults to new uuid)
 *   DEMO_SEED_GOLDEN_PATH_ENABLED=true (required — script disabled by default)
 *
 * Usage (from `web/`):
 *   npm run demo:seed:golden-path
 *
 * Cleanup (package-scoped — do not use demo:delete:one-family):
 *   DEMO_RESET_ORG_ID=<org> DEMO_SEED_PACKAGE=golden_path_enrollment_v1 npm run demo:cleanup:dry
 *   DEMO_RESET_ORG_ID=<org> DEMO_SEED_PACKAGE=golden_path_enrollment_v1 DEMO_CLEANUP_CONFIRM=DELETE_DEMO_RUNTIME_DATA npm run demo:cleanup:execute
 *
 * @see docs/platform/governance/demo-runtime-cleanup-qa-checklist.md
 */

import { randomUUID } from "crypto";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveProgramCategoryId } from "@/lib/locations/resolveOcmProgramCategoryFields";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import {
    DEFAULT_LEAD_CASE_STATUS_KEY,
    NEW_LEAD_STATUS_KEY,
} from "@/lib/admin/actions/createLeadActionConstants";
import { demoSeedOneFamilyMetadata } from "./lib/stagingDemoMarkers";
import { GOLDEN_PATH_SEED_PACKAGE } from "./lib/demoRuntimeCleanupScope";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const SEED_KEY = "golden_path_martinez_v1";
const FAMILY_KEY = "martinez_golden_v1";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

function requireOrgId(): string {
    const v = process.env.DEMO_SEED_ORG_ID?.trim() || process.env.DEMO_RESET_ORG_ID?.trim();
    if (!v) throw new Error("Missing DEMO_SEED_ORG_ID or DEMO_RESET_ORG_ID");
    return v;
}

function isoDateOnly(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function meta(runId: string): Record<string, unknown> {
    return demoSeedOneFamilyMetadata({ seedKey: SEED_KEY, runId, familyKey: FAMILY_KEY });
}

async function resolveEnrollmentWorkUnitId(supabase: SupabaseAdmin, orgId: string): Promise<string> {
    const { data: dept, error: dErr } = await supabase.from("departments").select("id").eq("org_id", orgId).eq("key", "enrollment").maybeSingle();
    if (dErr) throw new Error(`departments: ${dErr.message}`);
    const deptId = (dept as { id?: string } | null)?.id;
    if (!deptId) throw new Error('Missing department key "enrollment"');

    const { data: wu, error: wErr } = await supabase
        .from("work_units")
        .select("id")
        .eq("org_id", orgId)
        .eq("department_id", deptId)
        .eq("key", "enrollment_pipeline")
        .maybeSingle();
    if (wErr) throw new Error(`work_units: ${wErr.message}`);
    const wuId = (wu as { id?: string } | null)?.id;
    if (!wuId) throw new Error('Missing work unit enrollment/enrollment_pipeline');
    return wuId;
}

async function resolveOrgSiteLocationId(supabase: SupabaseAdmin, orgId: string): Promise<string> {
    const { data, error } = await supabase
        .from("locations")
        .select("id,label")
        .eq("org_id", orgId)
        .eq("location_type", "site")
        .eq("is_active", true)
        .order("label", { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`locations(site): ${error.message}`);
    const id = (data as { id?: string } | null)?.id;
    if (!id) throw new Error("No active site location found for org — bootstrap org structure first");
    return id;
}

async function resolveChildcareVerticalId(supabase: SupabaseAdmin): Promise<string> {
    const { data, error } = await supabase.from("verticals").select("id").eq("slug", "childcare").maybeSingle();
    if (error) throw new Error(`verticals: ${error.message}`);
    const id = (data as { id?: string } | null)?.id;
    if (!id) throw new Error('Missing vertical slug "childcare"');
    return id;
}

async function resolveSeedActorUserId(supabase: SupabaseAdmin, orgId: string): Promise<string> {
    const { data, error } = await supabase.from("user_roles").select("user_id").eq("org_id", orgId).limit(1).maybeSingle();
    if (error) throw new Error(`user_roles: ${error.message}`);
    const id = (data as { user_id?: string } | null)?.user_id;
    if (!id) throw new Error("No user_roles row for org — needed for operational_tasks.created_by");
    return id;
}

async function upsertBySeedKey(
    supabase: SupabaseAdmin,
    table: string,
    orgId: string,
    seedKey: string,
    row: Record<string, unknown>
): Promise<string> {
    const { data: existing, error: selErr } = await supabase
        .from(table)
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", seedKey)
        .maybeSingle();
    if (selErr) throw new Error(`${table} select: ${selErr.message}`);
    if ((existing as { id?: string } | null)?.id) return (existing as { id: string }).id;

    const { data: created, error: insErr } = await supabase.from(table).insert(row).select("id").single();
    if (insErr) throw new Error(`${table} insert: ${insErr.message}`);
    return (created as { id: string }).id;
}

async function resolveSeedLeadStatusKey(supabase: SupabaseAdmin, orgId: string): Promise<string> {
    const newInquiry = await assertAllowedStatusKey(supabase, orgId, "opportunities", NEW_LEAD_STATUS_KEY);
    if (newInquiry.ok) return NEW_LEAD_STATUS_KEY;
    const openStatus = await assertAllowedStatusKey(supabase, orgId, "opportunities", DEFAULT_LEAD_CASE_STATUS_KEY);
    if (openStatus.ok) return DEFAULT_LEAD_CASE_STATUS_KEY;
    throw new Error(
        `No valid lead status_key for golden-path seed (tried ${NEW_LEAD_STATUS_KEY}, ${DEFAULT_LEAD_CASE_STATUS_KEY})`
    );
}

async function main(): Promise<void> {
    if (process.env.DEMO_SEED_GOLDEN_PATH_ENABLED?.trim() !== "true") {
        console.error(
            "golden-path seed is disabled. Manual lead creation is preferred until status mapping is verified.\n" +
                "To run anyway: DEMO_SEED_GOLDEN_PATH_ENABLED=true npm run demo:seed:golden-path"
        );
        process.exit(1);
    }
    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run: VERCEL_ENV=production");
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }

    const orgId = requireOrgId();
    const runId = process.env.DEMO_SEED_RUN_ID?.trim() || randomUUID();
    const supabase = createAdminClient();
    const m = meta(runId);
    const workUnitId = await resolveEnrollmentWorkUnitId(supabase, orgId);
    const siteLocationId = await resolveOrgSiteLocationId(supabase, orgId);
    const verticalId = await resolveChildcareVerticalId(supabase);
    const actorUserId = await resolveSeedActorUserId(supabase, orgId);
    const leadStatusKey = await resolveSeedLeadStatusKey(supabase, orgId);

    const guardianSeedKey = `${SEED_KEY}:guardian`;
    const childSeedKey = `${SEED_KEY}:child`;

    const customerId = await upsertBySeedKey(supabase, "customers", orgId, SEED_KEY, {
        org_id: orgId,
        name: "Martinez Family",
        vertical_id: verticalId,
        metadata: { ...m, demo_seed_package: GOLDEN_PATH_SEED_PACKAGE },
    });

    const guardianPersonId = await upsertBySeedKey(supabase, "persons", orgId, guardianSeedKey, {
        org_id: orgId,
        first_name: "Elena",
        last_name: "Martinez",
        email: `elena.martinez+${orgId.slice(0, 8)}@demo.alloy.invalid`,
        phone: "+14155550123",
        metadata: { ...m, demo_seed_package: GOLDEN_PATH_SEED_PACKAGE, seed_key: guardianSeedKey },
    });

    const childPersonId = await upsertBySeedKey(supabase, "persons", orgId, childSeedKey, {
        org_id: orgId,
        first_name: "Sofia",
        last_name: "Martinez",
        date_of_birth: "2022-03-14",
        metadata: { ...m, demo_seed_package: GOLDEN_PATH_SEED_PACKAGE, seed_key: childSeedKey },
    });

    const { error: cpErr } = await supabase.from("customer_persons").upsert(
        {
            org_id: orgId,
            customer_id: customerId,
            person_id: guardianPersonId,
            role_type: "guardian",
            is_primary: true,
            metadata: m,
        } as never,
        { onConflict: "org_id,customer_id,person_id,role_type", ignoreDuplicates: true }
    );
    if (cpErr && !String(cpErr.message).toLowerCase().includes("duplicate")) {
        throw new Error(`customer_persons: ${cpErr.message}`);
    }

    const childMemberId = await upsertBySeedKey(supabase, "customer_members", orgId, childSeedKey, {
        org_id: orgId,
        customer_id: customerId,
        person_id: childPersonId,
        display_name: "Sofia Martinez",
        relationship: "child",
        dob: "2022-03-14",
        is_active: true,
        metadata: { ...m, demo_seed_package: GOLDEN_PATH_SEED_PACKAGE, seed_key: childSeedKey },
    });

    const { error: relErr } = await supabase.from("person_relationships").upsert(
        {
            org_id: orgId,
            from_person_id: guardianPersonId,
            to_person_id: childPersonId,
            relationship_type: "parent",
            is_primary: true,
            metadata: m,
        } as never,
        { onConflict: "org_id,from_person_id,to_person_id,relationship_type", ignoreDuplicates: true }
    );
    if (relErr && !String(relErr.message).toLowerCase().includes("duplicate")) {
        throw new Error(`person_relationships: ${relErr.message}`);
    }

    const desiredStart = isoDateOnly(new Date(Date.now() + 45 * 86400000));
    const oppInsert: Record<string, unknown> = {
        org_id: orgId,
        vertical_id: verticalId,
        name: "Enrollment — Martinez Family",
        status_key: leadStatusKey,
        work_unit_id: workUnitId,
        customer_id: customerId,
        primary_person_id: guardianPersonId,
        primary_contact_id: null,
        location_id: siteLocationId,
        metadata: {
            ...m,
            demo_seed_package: GOLDEN_PATH_SEED_PACKAGE,
            program_label: "Preschool — 3–4 years",
            age_group: "Ages 36–48 mo",
            // opportunity-level legacy metadata key — not the OCM column
            desired_start_date: desiredStart,
            inquiry_source: "website",
            notes: "Golden-path demo: single child, new inquiry, ready for enrollment workspace QA.",
        },
    };
    await normalizeOpportunityWritePayload(supabase, oppInsert, "seedOneGoldenPathEnrollmentRecord");

    let opportunityId: string;
    const { data: existingOpp } = await supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", SEED_KEY)
        .maybeSingle();
    if ((existingOpp as { id?: string } | null)?.id) {
        opportunityId = (existingOpp as { id: string }).id;
        const { error: upErr } = await supabase.from("opportunities").update(oppInsert as never).eq("id", opportunityId);
        if (upErr) throw new Error(`opportunities update: ${upErr.message}`);
    } else {
        const { data: createdOpp, error: oppErr } = await supabase.from("opportunities").insert(oppInsert as never).select("id").single();
        if (oppErr) throw new Error(`opportunities insert: ${oppErr.message}`);
        opportunityId = (createdOpp as { id: string }).id;
    }

    // Canonical program field: resolve the category FK by site + stable key (like the S2 migration backfill).
    const programCategoryId = await resolveProgramCategoryId(supabase, {
        orgId,
        locationId: siteLocationId,
        programKey: "preschool",
    });
    if (!programCategoryId) {
        console.warn("seedOneGoldenPathEnrollmentRecord: no 'preschool' program category for site — seeding OCM without program_category_id");
    }

    const { error: ocmErr } = await supabase.from("opportunity_customer_members").upsert(
        {
            org_id: orgId,
            opportunity_id: opportunityId,
            customer_member_id: childMemberId,
            ...(programCategoryId ? { program_category_id: programCategoryId } : {}),
            schedule_type: "full_time",
            outcome_status_key: "interested",
            notes: "Preschool full-time; golden-path seed child.",
            metadata: m,
        } as never,
        { onConflict: "org_id,opportunity_id,customer_member_id", ignoreDuplicates: true }
    );
    if (ocmErr && !String(ocmErr.message).toLowerCase().includes("duplicate")) {
        throw new Error(`opportunity_customer_members: ${ocmErr.message}`);
    }

    const due1 = new Date(Date.now() + 2 * 86400000).toISOString();
    const due2 = new Date(Date.now() + 5 * 86400000).toISOString();
    const taskSpecs = [
        { seed: `${SEED_KEY}:task:initial_call`, title: "Initial inquiry call", due: due1 },
        { seed: `${SEED_KEY}:task:send_packet`, title: "Send enrollment packet overview", due: due2 },
    ];
    const taskIds: string[] = [];
    for (const t of taskSpecs) {
        const existing = await supabase
            .from("operational_tasks")
            .select("id")
            .eq("org_id", orgId)
            .eq("metadata->>seed_key", t.seed)
            .maybeSingle();
        if ((existing.data as { id?: string } | null)?.id) {
            taskIds.push((existing.data as { id: string }).id);
            continue;
        }
        const { data: taskRow, error: tErr } = await supabase
            .from("operational_tasks")
            .insert({
                org_id: orgId,
                entity_type: "opportunities",
                entity_id: opportunityId,
                assigned_to_user_id: null,
                created_by: actorUserId,
                title: t.title,
                description: "Golden-path demo task",
                due_at: t.due,
                status: "open",
                source: "manual",
                metadata: { ...m, seed_key: t.seed },
            } as never)
            .select("id")
            .single();
        if (tErr) throw new Error(`operational_tasks: ${tErr.message}`);
        taskIds.push((taskRow as { id: string }).id);
    }

    const recipientKey = `elena.martinez+${orgId.slice(0, 8)}@demo.alloy.invalid`.toLowerCase();
    let threadId: string;
    const { data: existingThread } = await supabase
        .from("communication_threads")
        .select("id")
        .eq("org_id", orgId)
        .eq("primary_entity_type", "opportunities")
        .eq("primary_entity_id", opportunityId)
        .eq("channel", "email")
        .eq("recipient_key", recipientKey)
        .maybeSingle();
    if ((existingThread as { id?: string } | null)?.id) {
        threadId = (existingThread as { id: string }).id;
    } else {
        const { data: threadRow, error: thErr } = await supabase
            .from("communication_threads")
            .insert({
                org_id: orgId,
                primary_entity_type: "opportunities",
                primary_entity_id: opportunityId,
                channel: "email",
                recipient_key: recipientKey,
                metadata: m,
            } as never)
            .select("id")
            .single();
        if (thErr) throw new Error(`communication_threads: ${thErr.message}`);
        threadId = (threadRow as { id: string }).id;
    }

    const { count: msgCount } = await supabase
        .from("communication_messages")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("thread_id", threadId);
    if (!msgCount) {
        const { error: msgErr } = await supabase.from("communication_messages").insert({
            org_id: orgId,
            thread_id: threadId,
            channel: "email",
            direction: "outbound",
            status: "sent",
            subject: "Thanks for your interest in BrightPath enrollment",
            body: "Hi Elena — thanks for reaching out about preschool for Sofia. We would love to schedule a tour.",
            body_format: "plain",
            from_address: "enrollment@demo.alloy.invalid",
            to_address: recipientKey,
            metadata: { ...m, opportunity_id: opportunityId, customer_id: customerId },
            sent_at: new Date().toISOString(),
        } as never);
        if (msgErr) throw new Error(`communication_messages: ${msgErr.message}`);
    }

    let documentId: string;
    const { data: existingDoc } = await supabase
        .from("documents")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed_key", `${SEED_KEY}:document`)
        .maybeSingle();
    if ((existingDoc as { id?: string } | null)?.id) {
        documentId = (existingDoc as { id: string }).id;
    } else {
        const { data: docRow, error: docErr } = await supabase
            .from("documents")
            .insert({
                org_id: orgId,
                entity_type: "opportunity",
                entity_id: opportunityId,
                doc_type: "enrollment_packet",
                title: "Martinez — intake summary (demo)",
                status: "uploaded",
                metadata: { ...m, seed_key: `${SEED_KEY}:document` },
            } as never)
            .select("id")
            .single();
        if (docErr) throw new Error(`documents: ${docErr.message}`);
        documentId = (docRow as { id: string }).id;
    }

    const { data: dept } = await supabase.from("departments").select("id").eq("org_id", orgId).eq("key", "enrollment").maybeSingle();
    const departmentId = (dept as { id?: string } | null)?.id ?? null;

    const output = {
        org_id: orgId,
        demo_seed_package: GOLDEN_PATH_SEED_PACKAGE,
        demo_seed_run_id: runId,
        demo_seed_family_key: FAMILY_KEY,
        seed_key: SEED_KEY,
        ids: {
            customer_id: customerId,
            guardian_person_id: guardianPersonId,
            child_person_id: childPersonId,
            child_customer_member_id: childMemberId,
            opportunity_id: opportunityId,
            work_unit_id: workUnitId,
            department_id: departmentId,
            site_location_id: siteLocationId,
            operational_task_ids: taskIds,
            communication_thread_id: threadId,
            document_id: documentId,
        },
        ui_paths: {
            enrollment_workspace: departmentId
                ? `/adminV2/workspace/dept/${departmentId}/work-unit/${workUnitId}`
                : null,
            opportunity_drawer_hint: `Open opportunity ${opportunityId} from Enrollment → New inquiry lane`,
        },
        cleanup: {
            recommended_dry_run: `DEMO_RESET_ORG_ID=${orgId} DEMO_SEED_PACKAGE=golden_path_enrollment_v1 npm run demo:cleanup:dry`,
            recommended_execute: `DEMO_RESET_ORG_ID=${orgId} DEMO_SEED_PACKAGE=golden_path_enrollment_v1 DEMO_CLEANUP_CONFIRM=DELETE_DEMO_RUNTIME_DATA npm run demo:cleanup:execute`,
            deprecated_note: "Do not use demo:delete:one-family for golden-path cleanup — incomplete.",
        },
    };

    console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
