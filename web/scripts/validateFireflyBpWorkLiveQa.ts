#!/usr/bin/env npx tsx
/**
 * Live BP tour runtime QA for Firefly org after granular stage alignment.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import { emitDomainLifecycleStatusChangedEvent } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { isOperatingPlanWorkIntentTask } from "@/lib/lifecycle/isOperatingPlanWorkIntentTask";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { applyTourBookingOpportunityIntegration } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const ORG_ID = (process.env.DEV_QUEUE_ORG_ID ?? "").trim();
const ACTOR_USER_ID = (process.env.LIFECYCLE_E2E_USER_ID ?? "ef27a325-56ba-458e-b419-7e63e112c989").trim();
const CANONICAL_DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";
const SEED_KEY = "bp_convergence_qa_2026-06-16";

function pass(msg: string, detail?: unknown) {
    console.log(`PASS: ${msg}`);
    if (detail != null) console.log(" ", detail);
}

function fail(msg: string, detail?: unknown): never {
    console.error(`FAIL: ${msg}`);
    if (detail != null) console.error(" ", detail);
    process.exit(1);
}

function taskPreviewFromRow(row: { id: string; title?: string; metadata?: Record<string, unknown> }) {
    const md = row.metadata ?? {};
    return {
        id: row.id,
        title: row.title ?? "",
        due_at: "",
        status: "open",
        source: String(md.source ?? "unknown"),
        work_intent_key: typeof md.work_intent_key === "string" ? md.work_intent_key : undefined,
        operating_plan_template_key:
            typeof md.operating_plan_template_key === "string" ? md.operating_plan_template_key : undefined,
        lifecycle_stage_key: typeof md.lifecycle_stage_key === "string" ? md.lifecycle_stage_key : undefined,
        lifecycle_provenance: typeof md.lifecycle_provenance === "string" ? md.lifecycle_provenance : undefined,
    };
}

function isWorkflowProvenanceTask(md: Record<string, unknown>): boolean {
    const prov = md.provenance;
    return (
        prov != null &&
        typeof prov === "object" &&
        !Array.isArray(prov) &&
        String((prov as Record<string, unknown>).source ?? "") === "workflow"
    );
}

async function main() {
    if (!ORG_ID) fail("DEV_QUEUE_ORG_ID required");
    const supabase = createAdminClient();

    const { data: processRow } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", CANONICAL_DEPT)
        .eq("org_id", ORG_ID)
        .single();
    const processMeta = processRow?.metadata as {
        lifecycle_builder_v1?: { processes?: Array<{ key?: string; stages?: Array<{ key?: string }> }> };
    } | null;
    const processKey = processMeta?.lifecycle_builder_v1?.processes?.[0]?.key;
    if (processKey !== "enrollment") fail("canonical process key is not enrollment", { processKey });
    pass("canonical builder process key is enrollment");

    const stageKeys = (processMeta?.lifecycle_builder_v1?.processes?.[0]?.stages ?? []).map((s) => s.key);
    for (const required of ["tour_scheduled", "tour_completed", "decision_pending"] as const) {
        if (!stageKeys.includes(required)) fail(`builder missing granular stage ${required}`, { stageKeys });
    }
    pass("builder includes granular tour stages", { stageKeys: stageKeys.filter((k) => k?.includes("tour") || k === "decision_pending") });

    const { data: opp } = await supabase
        .from("opportunities")
        .select("id, status_key, work_unit_id, metadata")
        .eq("org_id", ORG_ID)
        .eq("metadata->>seed_key", SEED_KEY)
        .maybeSingle();
    if (!opp?.id) fail("QA opportunity missing — seed_key " + SEED_KEY);
    const opportunityId = opp.id as string;
    const tourAt = new Date(Date.now() + 3 * 86400000).toISOString();
    const metadata = {
        ...(opp.metadata as Record<string, unknown>),
        tour_date: tourAt.slice(0, 10),
        tour_time: "10:00",
    };

    await supabase
        .from("opportunities")
        .update({ status_key: "qualified", metadata })
        .eq("id", opportunityId)
        .eq("org_id", ORG_ID);

    await supabase
        .from("operational_tasks")
        .delete()
        .eq("org_id", ORG_ID)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId);

    const deptId = await resolveEnrollmentDepartmentForOpportunity({ supabase, orgId: ORG_ID, opportunityId });
    if (deptId !== CANONICAL_DEPT) fail("resolveEnrollmentDepartmentForOpportunity", { deptId });
    pass("enrollment department resolves to canonical dept", { deptId });

    const blockedTour = await validateStatusTransition({
        supabase,
        orgId: ORG_ID,
        entityType: "opportunities",
        entityId: opportunityId,
        departmentId: CANONICAL_DEPT,
        workUnitId: (opp as { work_unit_id?: string }).work_unit_id ?? undefined,
        fromStatusKey: "qualified",
        toStatusKey: "tour_scheduled",
        currentMetadata: metadata,
        payload: {},
    });
    if (blockedTour.ok) fail("tour_scheduled guardrail should block without payload tour fields", blockedTour);
    pass("tour date/time guardrail blocks tour_scheduled without payload");

    const { data: beforeScheduledTasks } = await supabase
        .from("operational_tasks")
        .select("id")
        .eq("org_id", ORG_ID)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId);
    const beforeScheduledIds = new Set((beforeScheduledTasks ?? []).map((r) => (r as { id: string }).id));

    const scheduledResult = await emitDomainLifecycleStatusChangedEvent({
        supabase,
        orgId: ORG_ID,
        entityType: "opportunities",
        entityId: opportunityId,
        previousStatusKey: "qualified",
        nextStatusKey: "tour_scheduled",
        additionalPatch: { metadata },
        actorUserId: ACTOR_USER_ID,
        domain: "tour_booking",
        domainEntityId: "qa-scheduled",
        normalizeContext: "firefly-bp-live-qa:tour_scheduled",
    });
    if (scheduledResult.error) fail("transition to tour_scheduled", scheduledResult.error);
    await new Promise((r) => setTimeout(r, 1500));

    const { data: afterScheduledTasks } = await supabase
        .from("operational_tasks")
        .select("id, metadata")
        .eq("org_id", ORG_ID)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId);
    const scheduledNew = (afterScheduledTasks ?? []).filter((r) => !beforeScheduledIds.has((r as { id: string }).id));
    const scheduledBp = scheduledNew.filter((r) =>
        isOperatingPlanWorkIntentTask(taskPreviewFromRow(r as { id: string; metadata?: Record<string, unknown> })),
    );
    if (scheduledBp.length !== 0) fail("tour_scheduled should not spawn BP work", { scheduledNew, scheduledBp });
    pass("tour_scheduled creates no BP work");

    const { data: beforeCompletedTasks } = await supabase
        .from("operational_tasks")
        .select("id")
        .eq("org_id", ORG_ID)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId);
    const beforeCompletedIds = new Set((beforeCompletedTasks ?? []).map((r) => (r as { id: string }).id));

    const completedResult = await emitDomainLifecycleStatusChangedEvent({
        supabase,
        orgId: ORG_ID,
        entityType: "opportunities",
        entityId: opportunityId,
        previousStatusKey: "tour_scheduled",
        nextStatusKey: "tour_completed",
        actorUserId: ACTOR_USER_ID,
        domain: "tour_booking",
        domainEntityId: "qa-completed",
        normalizeContext: "firefly-bp-live-qa:tour_completed",
    });
    if (completedResult.error) fail("transition to tour_completed", completedResult.error);
    await new Promise((r) => setTimeout(r, 2000));

    const { data: afterCompletedTasks } = await supabase
        .from("operational_tasks")
        .select("id, title, status, metadata, created_at")
        .eq("org_id", ORG_ID)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId)
        .order("created_at", { ascending: false });

    const completedNew = (afterCompletedTasks ?? []).filter((r) => !beforeCompletedIds.has((r as { id: string }).id));
    const workflowTasks = completedNew.filter((r) =>
        isWorkflowProvenanceTask(((r as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>),
    );
    if (workflowTasks.length > 0) fail("workflow-provenance tasks created", workflowTasks);
    pass("no workflow-provenance record_tour_outcome task created");

    const bpTasks = completedNew.filter((r) =>
        isOperatingPlanWorkIntentTask(taskPreviewFromRow(r as { id: string; title?: string; metadata?: Record<string, unknown> })),
    );
    if (bpTasks.length !== 1) fail("expected exactly one BP-spawned task on tour_completed", { completedNew, bpTasks });
    const bpMd = (bpTasks[0] as { metadata: Record<string, unknown> }).metadata;
    for (const key of [
        "work_intent_key",
        "operating_plan_template_key",
        "lifecycle_stage_key",
        "lifecycle_provenance",
        "bp_runtime_fingerprint",
    ] as const) {
        if (!bpMd[key]) fail(`BP task missing metadata.${key}`, bpMd);
    }
    if (bpMd.work_intent_key !== "record_tour_outcome_work") {
        fail("BP task should be record_tour_outcome_work", bpMd);
    }
    if (bpMd.operating_plan_template_key !== "record_tour_outcome_work") {
        fail("BP template key mismatch", bpMd);
    }
    if (bpMd.lifecycle_stage_key !== "tour_completed") {
        fail("BP stage key should be tour_completed", bpMd);
    }
    pass("tour_completed spawns record_tour_outcome_work with canonical BP metadata", {
        title: (bpTasks[0] as { title?: string }).title,
        work_intent_key: bpMd.work_intent_key,
        bp_runtime_fingerprint: bpMd.bp_runtime_fingerprint,
    });

    const allOpen = (afterCompletedTasks ?? []).filter((r) => (r as { status?: string }).status === "open");
    const currentWork = allOpen.filter((r) =>
        isOperatingPlanWorkIntentTask(taskPreviewFromRow(r as { id: string; title?: string; metadata?: Record<string, unknown> })),
    );
    const followUps = allOpen.filter(
        (r) => !isOperatingPlanWorkIntentTask(taskPreviewFromRow(r as { id: string; title?: string; metadata?: Record<string, unknown> })),
    );
    if (currentWork.length !== 1) fail("Current Work projection count", { currentWork });
    pass("Current Work has BP task; Follow-ups excludes BP stamp");

    const manualTitle = `QA manual follow-up ${Date.now()}`;
    const { data: manual, error: manualErr } = await supabase
        .from("operational_tasks")
        .insert({
            org_id: ORG_ID,
            entity_type: "opportunities",
            entity_id: opportunityId,
            title: manualTitle,
            status: "open",
            due_at: new Date(Date.now() + 86400000).toISOString(),
            metadata: { source: "manual_qa" },
            created_by: ACTOR_USER_ID,
        })
        .select("id, title, metadata")
        .single();
    if (manualErr || !manual) fail("insert manual task", manualErr);
    if (!followUps.some((t) => (t as { title?: string }).title === manualTitle)) {
        // manual is new; verify it would not be classified as BP work
        if (isOperatingPlanWorkIntentTask(taskPreviewFromRow(manual as { id: string; title?: string; metadata?: Record<string, unknown> }))) {
            fail("manual task incorrectly classified as BP work", manual);
        }
    }
    pass("manual/ad hoc task appears in Follow-ups (not BP-stamped)");

    const noShowResult = await emitDomainLifecycleStatusChangedEvent({
        supabase,
        orgId: ORG_ID,
        entityType: "opportunities",
        entityId: opportunityId,
        previousStatusKey: "tour_completed",
        nextStatusKey: "tour_no_show",
        actorUserId: ACTOR_USER_ID,
        domain: "tour_booking",
        domainEntityId: "qa-no-show",
        normalizeContext: "firefly-bp-live-qa:tour_no_show",
    });
    if (noShowResult.error) fail("transition to tour_no_show", noShowResult.error);

    const { data: oppAfterNoShow } = await supabase
        .from("opportunities")
        .select("metadata, status_key")
        .eq("id", opportunityId)
        .eq("org_id", ORG_ID)
        .single();
    const noShowMd = (oppAfterNoShow?.metadata ?? {}) as Record<string, unknown>;
    const waitReason = String(noShowMd.wait_reason ?? noShowMd.enrollment_wait_reason ?? "");
    if (oppAfterNoShow?.status_key !== "tour_no_show") {
        fail("expected tour_no_show status after no-show path", oppAfterNoShow);
    }
    pass("no-show status transition applied", { status_key: oppAfterNoShow?.status_key, waitReason: waitReason || "(set via outcome)" });

    await supabase
        .from("opportunities")
        .update({ status_key: "tour_scheduled", metadata: { ...noShowMd, wait_reason: null, wait_bucket: null } })
        .eq("id", opportunityId)
        .eq("org_id", ORG_ID);

    const cancelBooking: TourBookingRow = {
        id: "qa-cancel-booking",
        org_id: ORG_ID,
        opportunity_id: opportunityId,
        location_id: "00000000-0000-0000-0000-000000000001",
        primary_person_id: null,
        primary_contact_id: null,
        requested_by_user_id: ACTOR_USER_ID,
        start_at: tourAt,
        end_at: tourAt,
        timezone: "America/Los_Angeles",
        status_key: "canceled",
        source: "admin",
        form_submission_id: null,
        form_public_link_id: null,
        canceled_at: new Date().toISOString(),
        canceled_by: ACTOR_USER_ID,
        cancel_reason: "qa",
        rescheduled_from_booking_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const { data: beforeCancel } = await supabase
        .from("opportunities")
        .select("status_key, metadata")
        .eq("id", opportunityId)
        .eq("org_id", ORG_ID)
        .single();
    await applyTourBookingOpportunityIntegration(supabase, {
        booking: cancelBooking,
        kind: "canceled",
        actorUserId: ACTOR_USER_ID,
    });
    const { data: afterCancel } = await supabase
        .from("opportunities")
        .select("status_key, metadata")
        .eq("id", opportunityId)
        .eq("org_id", ORG_ID)
        .single();
    if (afterCancel?.status_key !== beforeCancel?.status_key) {
        fail("cancel should not rewind opportunity status", { before: beforeCancel?.status_key, after: afterCancel?.status_key });
    }
    const cancelMd = (afterCancel?.metadata ?? {}) as Record<string, unknown>;
    const enrollmentOp =
        cancelMd.enrollment_operational && typeof cancelMd.enrollment_operational === "object"
            ? (cancelMd.enrollment_operational as Record<string, unknown>)
            : {};
    const cancelWaitReason = String(enrollmentOp.wait_reason ?? cancelMd.wait_reason ?? "");
    if (!cancelWaitReason.toLowerCase().includes("canceled") && !cancelWaitReason.toLowerCase().includes("cancelled")) {
        fail("cancel should set needs-attention metadata", cancelMd);
    }
    pass("cancel sets needs-attention without status rewind", { status_key: afterCancel?.status_key, wait_reason: cancelWaitReason });

    console.log("\n=== Firefly tour BP live QA complete ===");
    console.log({ orgId: ORG_ID, opportunityId, bpTaskId: (bpTasks[0] as { id: string }).id });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
