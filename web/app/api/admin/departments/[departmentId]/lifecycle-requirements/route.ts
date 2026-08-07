import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { resolveEntityLabelsForOrg } from "@/lib/admin/entityLabelsResolve";
import { entityLabelsMapFromEffective } from "@/lib/admin/entityLabelsServer";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    buildLifecycleRequirementsOverridePatch,
    buildLifecycleRequirementsResetStagePatch,
    buildLifecycleFieldRulesOverridePatch,
    parseLifecycleProgressionRequirementsOverride,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { mergeLifecycleFieldPaletteForBuilderStage } from "@/lib/lifecycle/lifecycleBuilderStagePalette";
import { loadOrgFieldDefinitionsForLifecycle } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import { LIFECYCLE_REQUIREMENT_ENTITIES } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    asOperatorStageKey,
    configuredStageKeysForMetadata,
    isConfiguredStageKey,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    buildBuilderStageFieldRulesPatch,
    buildBuilderStageFieldRulesResetPatch,
} from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { buildLifecycleRequirementsStageEntry } from "@/lib/lifecycle/lifecycleRequirementsStagePayload";
import { lifecycleRequirementEntityLabelsFromMap } from "@/lib/lifecycle/lifecycleRequirementEntityLabels";
import { validateFieldRuleIdsAgainstPalette, filterFieldRuleIdsToPalette } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { logLifecycleBuilderSaveTiming } from "@/lib/lifecycle/lifecycleBuilderSaveTiming";
import { lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";
import { parseRuleLevelsV1 } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import { parseRuleMetaV1 } from "@/lib/lifecycle/requirementTimingMeta";
import { replacePatchedStageFieldRules } from "@/lib/lifecycle/replacePatchedStageFieldRules";
import { mergeCategoryFDepartmentMetadata } from "@/lib/lifecycle/mergeCategoryFDepartmentMetadata";

function isOperatorStageKey(s: string): s is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s);
}

function deepMergeJsonObjects(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...a };
    for (const [k, bv] of Object.entries(b)) {
        const av = a[k];
        if (
            bv !== null &&
            typeof bv === "object" &&
            !Array.isArray(bv) &&
            av !== null &&
            typeof av === "object" &&
            !Array.isArray(av)
        ) {
            out[k] = deepMergeJsonObjects(av as Record<string, unknown>, bv as Record<string, unknown>);
        } else {
            out[k] = bv;
        }
    }
    return out;
}

async function loadDepartment(orgId: string, departmentId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("departments")
        .select("id, org_id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; metadata?: unknown } | null;
}

function stageKeysForRequirements(metadata: Record<string, unknown>): string[] {
    const configured = configuredStageKeysForMetadata(metadata);
    return configured.length ? configured : [...LIFECYCLE_STAGE_ORDER];
}

/** GET: platform defaults + effective + override for lifecycle requirements. */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = await loadDepartment(ctx.orgId, departmentId);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const metadata =
        row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};

    const override = parseLifecycleProgressionRequirementsOverride(metadata);
    const supabase = createAdminClient();
    const orgFieldDefs = await loadOrgFieldDefinitionsForLifecycle(supabase, ctx.orgId);
    const stageKeys = stageKeysForRequirements(metadata);
    const stages = Object.fromEntries(
        stageKeys.map((stageKey) => [
            stageKey,
            buildLifecycleRequirementsStageEntry(stageKey, metadata, orgFieldDefs, override),
        ])
    );

    const labelsPayload = await resolveEntityLabelsForOrg(supabase, ctx.orgId);
    const labelsMap = entityLabelsMapFromEffective(labelsPayload.effective);
    const activation = lifecycleActivationFromMetadata(metadata);
    const entity_display_labels = lifecycleRequirementEntityLabelsFromMap(
        labelsMap,
        activation?.primary_record_label
    );

    return NextResponse.json({
        department_id: departmentId,
        override,
        entities: LIFECYCLE_REQUIREMENT_ENTITIES,
        entity_display_labels,
        stage_keys: stageKeys,
        stages,
    });
}

/** PATCH: save stage labels or reset a stage to platform defaults. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const saveStartedAt = Date.now();
    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const row = await loadDepartment(ctx.orgId, departmentId);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const prevMeta =
        row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};

    const resetStage = typeof body.reset_stage === "string" ? body.reset_stage.trim() : "";
    if (resetStage) {
        if (!isConfiguredStageKey(prevMeta, resetStage) && !isOperatorStageKey(resetStage)) {
            return NextResponse.json({ error: "Invalid reset_stage" }, { status: 400 });
        }
        const operator = asOperatorStageKey(resetStage);
        const builderReset = buildBuilderStageFieldRulesResetPatch({
            builderStageKey: resetStage,
            existingMetadata: prevMeta,
        });
        const operatorPatch = operator
            ? buildLifecycleRequirementsResetStagePatch({
                  stage: operator,
                  existingMetadata: prevMeta,
              })
            : null;
        if (!builderReset && !operatorPatch) {
            return NextResponse.json({ ok: true, message: "Stage already uses platform defaults." });
        }
        let metadata = prevMeta;
        if (operatorPatch) metadata = deepMergeJsonObjects(metadata, operatorPatch);
        if (builderReset) metadata = deepMergeJsonObjects(metadata, builderReset);
        metadata = mergeCategoryFDepartmentMetadata(prevMeta, metadata);
        const supabase = createAdminClient();
        const { data: updated, error } = await supabase
            .from("departments")
            .update({ metadata, updated_at: new Date().toISOString() })
            .eq("id", departmentId)
            .eq("org_id", ctx.orgId)
            .select("metadata")
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        logLifecycleBuilderSaveTiming("lifecycle-requirements-reset", saveStartedAt, { stage: resetStage });
        return NextResponse.json({ ok: true, metadata: updated?.metadata ?? metadata });
    }

    const stage = typeof body.stage === "string" ? body.stage.trim() : "";
    if (!stage || (!isConfiguredStageKey(prevMeta, stage) && !isOperatorStageKey(stage))) {
        return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    const fieldRulesRaw = body.field_rules;
    if (fieldRulesRaw && typeof fieldRulesRaw === "object" && !Array.isArray(fieldRulesRaw)) {
        const required_rule_ids = Array.isArray((fieldRulesRaw as { required_rule_ids?: unknown }).required_rule_ids)
            ? (fieldRulesRaw as { required_rule_ids: unknown[] }).required_rule_ids.filter(
                  (x): x is string => typeof x === "string"
              )
            : [];
        const recommended_rule_ids = Array.isArray(
            (fieldRulesRaw as { recommended_rule_ids?: unknown }).recommended_rule_ids
        )
            ? (fieldRulesRaw as { recommended_rule_ids: unknown[] }).recommended_rule_ids.filter(
                  (x): x is string => typeof x === "string"
              )
            : [];
        let metadataPatch: Record<string, unknown>;
        try {
            const mergedPalette = mergeLifecycleFieldPaletteForBuilderStage(
                stage,
                await loadOrgFieldDefinitionsForLifecycle(createAdminClient(), ctx.orgId)
            );
            const required = filterFieldRuleIdsToPalette(required_rule_ids, mergedPalette);
            const recommended = filterFieldRuleIdsToPalette(recommended_rule_ids, mergedPalette);
            const operator = asOperatorStageKey(stage);
            const explicit_rule_levels_v1 = parseRuleLevelsV1(
                (fieldRulesRaw as { rule_levels_v1?: unknown }).rule_levels_v1
            );
            const explicit_rule_meta_v1 = parseRuleMetaV1(
                (fieldRulesRaw as { rule_meta_v1?: unknown }).rule_meta_v1
            );
            if (operator) {
                metadataPatch = deepMergeJsonObjects(
                    buildLifecycleFieldRulesOverridePatch({
                        stage: operator,
                        required_rule_ids: required,
                        recommended_rule_ids: recommended,
                        existingMetadata: prevMeta,
                        mergedPalette,
                        explicit_rule_levels_v1,
                        explicit_rule_meta_v1,
                    }),
                    buildBuilderStageFieldRulesPatch({
                        builderStageKey: stage,
                        required_rule_ids: required,
                        recommended_rule_ids: recommended,
                        existingMetadata: prevMeta,
                        mergedPalette,
                        explicit_rule_levels_v1,
                        explicit_rule_meta_v1,
                    }),
                );
            } else {
                metadataPatch = buildBuilderStageFieldRulesPatch({
                    builderStageKey: stage,
                    required_rule_ids: required,
                    recommended_rule_ids: recommended,
                    existingMetadata: prevMeta,
                    mergedPalette,
                    explicit_rule_levels_v1,
                    explicit_rule_meta_v1,
                });
            }
        } catch (e) {
            return NextResponse.json(
                { error: e instanceof Error ? e.message : "Invalid field rules" },
                { status: 400 }
            );
        }
        const metadata = mergeCategoryFDepartmentMetadata(
            prevMeta,
            replacePatchedStageFieldRules(
                deepMergeJsonObjects(prevMeta, metadataPatch),
                metadataPatch,
            ),
        );
        const supabase = createAdminClient();
        const { data: updated, error } = await supabase
            .from("departments")
            .update({ metadata, updated_at: new Date().toISOString() })
            .eq("id", departmentId)
            .eq("org_id", ctx.orgId)
            .select("metadata")
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        logLifecycleBuilderSaveTiming("lifecycle-requirements-field-rules", saveStartedAt, { stage });
        return NextResponse.json({ ok: true, metadata: updated?.metadata ?? metadata });
    }

    const operator = asOperatorStageKey(stage);
    if (!operator) {
        return NextResponse.json(
            { error: "Label-based requirements apply only to platform stage keys." },
            { status: 400 }
        );
    }

    const required_labels = Array.isArray(body.required_labels)
        ? body.required_labels.filter((x): x is string => typeof x === "string")
        : null;
    const recommended_labels = Array.isArray(body.recommended_labels)
        ? body.recommended_labels.filter((x): x is string => typeof x === "string")
        : null;
    if (!required_labels || !recommended_labels) {
        return NextResponse.json({ error: "required_labels and recommended_labels are required" }, { status: 400 });
    }

    let metadataPatch: Record<string, unknown>;
    try {
        metadataPatch = buildLifecycleRequirementsOverridePatch({
            stage: operator,
            required_labels,
            recommended_labels,
            existingMetadata: prevMeta,
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Invalid labels" },
            { status: 400 }
        );
    }

    const metadata = mergeCategoryFDepartmentMetadata(
        prevMeta,
        deepMergeJsonObjects(prevMeta, metadataPatch),
    );
    const supabase = createAdminClient();
    const { data: updated, error } = await supabase
        .from("departments")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .select("metadata")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    logLifecycleBuilderSaveTiming("lifecycle-requirements-labels", saveStartedAt, { stage });
    return NextResponse.json({ ok: true, metadata: updated?.metadata ?? metadata });
}
