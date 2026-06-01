import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";
import { logAdminAudit } from "@/lib/adminAuth";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ensureOrgOpportunityStatusRow } from "@/lib/lifecycle/ensureOrgOpportunityStatus";
import {
    ENROLLMENT_OPERATOR_STAGE_UNASSIGNED,
    isLifecycleOperatorStage,
    mergeEnrollmentOperatorStageMetadata,
    parseEnrollmentOperatorStageFromMetadata,
} from "@/lib/lifecycle/enrollmentOperatorStage";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";

function isStageKey(s: string): s is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s);
}

const STATUS_KEY_REGEX = /^[a-z0-9_]{2,32}$/;

/** GET — opportunity statuses grouped by enrollment operator stage. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    const rows = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "opportunities", { activeOnly: true });

    const payload = buildEnrollmentStatusStagesPayload(
        rows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        }))
    );

    return NextResponse.json(payload);
}

/** PATCH — replace statuses assigned to one stage, or reset stage metadata overrides. */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { stage?: string; status_keys?: string[]; reset_stage?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const resetStage = typeof body.reset_stage === "string" ? body.reset_stage.trim() : "";
    if (resetStage) {
        if (!isStageKey(resetStage)) {
            return NextResponse.json({ error: "Invalid reset_stage" }, { status: 400 });
        }
        return resetStageMetadata(ctx, resetStage);
    }

    const stage = typeof body.stage === "string" ? body.stage.trim() : "";
    if (!isStageKey(stage)) {
        return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    const statusKeys = Array.isArray(body.status_keys)
        ? [...new Set(body.status_keys.map((k) => String(k ?? "").trim().toLowerCase()).filter(Boolean))]
        : null;
    if (!statusKeys) {
        return NextResponse.json({ error: "status_keys array is required" }, { status: 400 });
    }

    for (const k of statusKeys) {
        if (!STATUS_KEY_REGEX.test(k)) {
            return NextResponse.json({ error: `Invalid status key: ${k}` }, { status: 400 });
        }
    }

    const supabase = createAdminClient();
    const effective = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "opportunities", {
        activeOnly: false,
    });
    const byKey = new Map(effective.map((r) => [r.status_key, r]));

    const { data: orgRows } = await supabase
        .from("status_definitions")
        .select("id, status_key, metadata")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", "opportunities");

    const orgByKey = new Map((orgRows ?? []).map((r) => [String(r.status_key), r]));

    const desired = new Set(statusKeys);
    const changedIds: string[] = [];

    for (const key of statusKeys) {
        const eff = byKey.get(key);
        if (!eff) {
            return NextResponse.json({ error: `Unknown status: ${key}` }, { status: 404 });
        }
        const org = await ensureOrgOpportunityStatusRow(supabase, ctx.orgId, key, eff);
        const merged = mergeEnrollmentOperatorStageMetadata(org.metadata, stage);
        const { error } = await supabase
            .from("status_definitions")
            .update({ metadata: normalizeStatusDefinitionMetadata(merged) })
            .eq("id", org.id)
            .eq("org_id", ctx.orgId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        changedIds.push(org.id);
    }

    for (const row of orgRows ?? []) {
        const key = String(row.status_key);
        const meta =
            row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        const assigned = parseEnrollmentOperatorStageFromMetadata(meta);
        if (assigned !== stage) continue;
        if (desired.has(key)) continue;

        const nextMeta = mergeEnrollmentOperatorStageMetadata(meta, ENROLLMENT_OPERATOR_STAGE_UNASSIGNED);
        const { error } = await supabase
            .from("status_definitions")
            .update({ metadata: normalizeStatusDefinitionMetadata(nextMeta) })
            .eq("id", row.id)
            .eq("org_id", ctx.orgId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        changedIds.push(String(row.id));
    }

    logAdminAudit({
        entity: "status_definitions",
        id: stage,
        changed_fields: ["enrollment_operator_stage", ...changedIds],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    const rows = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "opportunities", { activeOnly: true });
    return NextResponse.json(buildEnrollmentStatusStagesPayload(
        rows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        }))
    ));
}

async function resetStageMetadata(
    ctx: { orgId: string; userId: string; role: string },
    stage: LifecycleOperatorStage
) {
    const supabase = createAdminClient();
    const orgId = ctx.orgId;
    const { data: orgRows, error } = await supabase
        .from("status_definitions")
        .select("id, metadata")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const changedIds: string[] = [];
    for (const row of orgRows ?? []) {
        const meta =
            row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        if (parseEnrollmentOperatorStageFromMetadata(meta) !== stage) continue;
        const nextMeta = mergeEnrollmentOperatorStageMetadata(meta, null);
        const { error: upErr } = await supabase
            .from("status_definitions")
            .update({ metadata: normalizeStatusDefinitionMetadata(nextMeta) })
            .eq("id", row.id)
            .eq("org_id", orgId);
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
        changedIds.push(String(row.id));
    }

    logAdminAudit({
        entity: "status_definitions",
        id: stage,
        changed_fields: ["reset_enrollment_operator_stage", ...changedIds],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    return NextResponse.json(buildEnrollmentStatusStagesPayload(
        rows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        }))
    ));
}
