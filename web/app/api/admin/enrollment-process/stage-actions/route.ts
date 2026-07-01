import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    LIFECYCLE_ACTIVATION_METADATA_KEY,
    parseLifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import { ensureOrgLifecycleActionDefinition } from "@/lib/lifecycle/ensureOrgLifecycleActionDefinition";
import { filterSaveableLifecycleBaseActions } from "@/lib/lifecycle/filterSaveableLifecycleBaseActions";
import { lifecycleActivationBaseActions } from "@/lib/lifecycle/lifecycleStageBaseActions";
import { loadEnrollmentStageActionsForOrg } from "@/lib/lifecycle/loadEnrollmentStageActionsForOrg";
import {
    lifecycleActivationBaseActionByKey,
    lifecyclePlacementById,
    normalizeLifecyclePlacementId,
    type LifecycleBaseActionKey,
} from "@/lib/lifecycle/lifecycleStageBaseActions";
import {
    buildLifecycleActionConditionConfig,
    type LifecycleActionScope,
} from "@/lib/lifecycle/lifecycleStageActionScope";

function isStageKey(s: string): s is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s);
}

/** GET ?stage= — opportunity actions associated with an enrollment operator stage. */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const stage = new URL(request.url).searchParams.get("stage")?.trim() || "";
    if (!isStageKey(stage)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });

    const supabase = createAdminClient();
    const actions = await loadEnrollmentStageActionsForOrg(supabase, ctx.orgId, stage);

    return NextResponse.json({ stage, actions });
}

/** POST — add lifecycle stage action (base action + label + placements). Admin only. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: {
        stage?: string;
        department_id?: string;
        base_action_key?: string;
        label?: string;
        placement_ids?: string[];
        activation_overflow_only?: boolean;
        action_scope?: LifecycleActionScope;
        operator_stages?: string[];
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const stage = typeof body.stage === "string" ? body.stage.trim() : "";
    if (!isStageKey(stage)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });

    const baseActionKey = typeof body.base_action_key === "string" ? body.base_action_key.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const placementIds = Array.isArray(body.placement_ids)
        ? body.placement_ids.map((p) => String(p ?? "").trim()).filter(Boolean)
        : [];
    const activationOverflowOnly = body.activation_overflow_only === true;
    const actionScope: LifecycleActionScope =
        body.action_scope === "lifecycle" ? "lifecycle" : "stage";
    const operatorStagesRaw = Array.isArray(body.operator_stages)
        ? body.operator_stages.map((s) => String(s ?? "").trim()).filter(Boolean)
        : [];
    const operatorStages =
        actionScope === "stage"
            ? operatorStagesRaw.length
                ? operatorStagesRaw
                : [stage]
            : [];
    if (actionScope === "stage" && !operatorStages.length) {
        return NextResponse.json({ error: "Select at least one stage for stage-specific actions" }, { status: 400 });
    }
    const conditionConfig = buildLifecycleActionConditionConfig(actionScope, operatorStages);

    if (!baseActionKey) return NextResponse.json({ error: "base_action_key is required" }, { status: 400 });
    if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });
    if (!activationOverflowOnly && !placementIds.length) {
        return NextResponse.json({ error: "At least one placement is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const departmentId = typeof body.department_id === "string" ? body.department_id.trim() : "";
    let primaryRecordLabel = "Lead";
    if (departmentId) {
        const { data: dept } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", departmentId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const metadata =
            dept?.metadata !== null && typeof dept?.metadata === "object" && !Array.isArray(dept.metadata)
                ? (dept.metadata as Record<string, unknown>)
                : {};
        const activation = parseLifecycleActivationV1(metadata[LIFECYCLE_ACTIVATION_METADATA_KEY]);
        primaryRecordLabel = activation?.primary_record_label ?? "Lead";
    }

    const base = lifecycleActivationBaseActionByKey(baseActionKey, primaryRecordLabel);
    if (!base) {
        return NextResponse.json({ error: "Unknown base action" }, { status: 400 });
    }

    const saveable = await filterSaveableLifecycleBaseActions(supabase, ctx.orgId, [base]);
    if (!saveable.length) {
        return NextResponse.json(
            { error: `Action is not available for this organization: ${base.definition_key}` },
            { status: 400 }
        );
    }

    const placements = activationOverflowOnly
        ? [{ id: "overflow", label: "Overflow Menu", surface: "record_header", slot: "overflow" }]
        : placementIds
              .map((id) => normalizeLifecyclePlacementId(id))
              .filter((id): id is string => Boolean(id))
              .map((id) => lifecyclePlacementById(id))
              .filter((p): p is NonNullable<typeof p> => !!p);
    if (!placements.length) {
        return NextResponse.json({ error: "Invalid placement_ids" }, { status: 400 });
    }

    try {
        const defId = await ensureOrgLifecycleActionDefinition(
            supabase,
            ctx.orgId,
            base.key as LifecycleBaseActionKey,
            label,
            primaryRecordLabel
        );

        const created: string[] = [];
        for (const placement of placements) {
            const { data: dup } = await supabase
                .from("action_placements")
                .select("id")
                .eq("org_id", ctx.orgId)
                .eq("action_definition_id", defId)
                .eq("surface", placement.surface)
                .eq("slot", placement.slot)
                .eq("entity_type", "opportunity")
                .maybeSingle();

            if (dup) continue;

            const { error: insErr } = await supabase.from("action_placements").insert({
                org_id: ctx.orgId,
                action_definition_id: defId,
                surface: placement.surface,
                slot: placement.slot,
                entity_type: "opportunity",
                condition_config: conditionConfig,
                is_active: true,
            });
            if (insErr) throw new Error(insErr.message);
            created.push(placement.id);
        }

        return NextResponse.json({
            ok: true,
            placements_created: created.length,
            action_definition_id: defId,
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save action" }, { status: 400 });
    }
}
