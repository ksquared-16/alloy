import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { dbListFormDefinitions } from "@/lib/admin/forms/formsAdminDb";
import { parseLifecycleProgressionRequirementsOverride } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { asOperatorStageKey, lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    configuredStageInventoryFromMetadata,
    isStageInConfiguredInventory,
} from "@/lib/lifecycle/configuredStageInventory";
import { CURRENT_ENROLLMENT_TEMPLATE_STAGE_KEYS } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    configuredStageKeysForMetadata,
    isConfiguredStageKey,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { effectiveFieldRulesForDepartment, effectiveRequirementLabelsForDepartment } from "@/lib/lifecycle/enrollmentProcessDepartmentRequirements";
import { buildEnrollmentProcessFormCoverageRows } from "@/lib/lifecycle/enrollmentProcessFormCoverage";
import { buildLifecycleRequirementsStageEntry } from "@/lib/lifecycle/lifecycleRequirementsStagePayload";
import { loadOrgFieldDefinitionsForLifecycle } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import { loadLifecycleBuilderConfiguredActions } from "@/lib/lifecycle/loadLifecycleBuilderConfiguredActions";
import { loadStageWorkUnitSnapshotForDepartment } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { filterSaveableLifecycleBaseActions } from "@/lib/lifecycle/filterSaveableLifecycleBaseActions";
import { lifecycleActivationBaseActions } from "@/lib/lifecycle/lifecycleStageBaseActions";
import { resolveEntityLabelsForOrg } from "@/lib/admin/entityLabelsResolve";
import { entityLabelsMapFromEffective } from "@/lib/admin/entityLabelsServer";
import { lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";
import { lifecycleRequirementEntityLabelsFromMap } from "@/lib/lifecycle/lifecycleRequirementEntityLabels";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import { loadQueueMembershipStatusOptions } from "@/lib/lifecycle/loadQueueMembershipStatusOptions";
import { resolveQueueMembershipForStage } from "@/lib/businessProcesses/resolveQueueMembership";
import { loadBusinessProcessStatusCategoryCatalog } from "@/lib/lifecycle/loadStatusCategoryCatalog";
import { resolveStatusRollupForStage } from "@/lib/lifecycle/statusCategoryCatalog";
import { queueMembershipSubjectForStatusOptions } from "@/lib/lifecycle/stageStatusRollup";
import {
    coercePerspectivesV1ForLanes,
    resolvePerspectivesForStage,
} from "@/lib/lifecycle/perspectiveConfigV1";
import { derivePerspectiveLanesFromPipeline } from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
import { resolveStageOperatingPlanForStage } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    loadBusinessProcessEditorState,
    summarizeBusinessProcessEditorState,
} from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

function mapStatusRows(rows: Awaited<ReturnType<typeof fetchEffectiveStatusDefinitions>>) {
    return rows.map((r) => ({
        status_key: r.status_key,
        status_label: r.status_label,
        sort_order: Number(r.sort_order) ?? 100,
        metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    }));
}

async function stageKeysForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    metadata: Record<string, unknown> | null
): Promise<string[]> {
    const keys = configuredStageKeysForMetadata(metadata);
    return keys.length ? keys : [...LIFECYCLE_STAGE_ORDER];
}

export async function buildLifecycleStageBootstrap(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    builderStageKey: string;
    primaryRecordLabel?: string;
    /** Recorded as the draft's creator when this load materializes it for the first time. */
    actorUserId?: string | null;
}): Promise<LifecycleStageBootstrapPayload> {
    const { supabase, orgId, departmentId, builderStageKey } = params;
    const primaryRecordLabel = params.primaryRecordLabel?.trim() || "Lead";
    const operatorStage = asOperatorStageKey(builderStageKey);

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr) throw new Error(deptErr.message);
    if (!dept) throw new Error("Department not found");

    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    /**
     * THE READ PRECEDENCE (Law 4, editor slice 2).
     *
     * Everything publication-owned is read from the DRAFT, not from `departments.metadata`. Slice 1
     * made the save write a draft; reading the projection back here is what made an operator's
     * saved change appear to vanish on reload.
     *
     * `metadata` is still the source for the top-level SIBLING keys — field rules, progression
     * requirements, activation. Those are category F: not publication-owned, and they must keep
     * working exactly as before.
     */
    const editorState = await loadBusinessProcessEditorState(supabase, {
        orgId,
        departmentId,
        actorUserId: params.actorUserId ?? null,
    });
    const builderMetadata: Record<string, unknown> = editorState
        ? { ...metadata, [LIFECYCLE_BUILDER_METADATA_KEY]: editorState.draft_payload }
        : metadata;

    const statusRows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", {
        activeOnly: true,
    });
    const stageKeys = await stageKeysForDepartment(supabase, orgId, builderMetadata);
    const statuses = buildEnrollmentStatusStagesPayload(mapStatusRows(statusRows), stageKeys);

    const pipeline = await loadStageWorkUnitSnapshotForDepartment(
        supabase,
        orgId,
        departmentId,
        builderStageKey
    );

    let field_requirements: LifecycleStageBootstrapPayload["field_requirements"] = null;
    if (isValidBootstrapBuilderStage(builderMetadata, builderStageKey)) {
        const override = parseLifecycleProgressionRequirementsOverride(metadata);
        const orgFieldDefs = await loadOrgFieldDefinitionsForLifecycle(supabase, orgId);
        const entry = buildLifecycleRequirementsStageEntry(builderStageKey, metadata, orgFieldDefs, override);
        field_requirements = {
            platform: entry.platform
                ? {
                      field_rules: entry.platform.field_rules,
                      required_labels: entry.platform.required_labels,
                      recommended_labels: entry.platform.recommended_labels,
                  }
                : undefined,
            effective: {
                required_labels: entry.effective.required_labels,
                recommended_labels: entry.effective.recommended_labels,
                source: entry.effective.source,
                field_rules: entry.effective.field_rules,
                field_rules_source: entry.effective.field_rules_source,
            },
            has_department_override: entry.has_department_override,
            field_palette: entry.field_palette,
        };
    }

    const actions = await loadLifecycleBuilderConfiguredActions(supabase, orgId);

    let forms: LifecycleStageBootstrapPayload["forms"] = [];
    let linkable_forms: LifecycleStageBootstrapPayload["linkable_forms"] = [];
    if (operatorStage) {
        const { required_labels, recommended_labels } = effectiveRequirementLabelsForDepartment(
            operatorStage,
            metadata
        );
        const { rules: field_rules } = effectiveFieldRulesForDepartment(operatorStage, metadata);

        const { data: formRows, error: formErr } = await dbListFormDefinitions(supabase, orgId);
        if (formErr) throw new Error(formErr.message);

        const { data: pubVersions, error: pubErr } = await supabase
            .from("form_definition_versions")
            .select("form_definition_id, version_number, schema_json")
            .eq("org_id", orgId)
            .eq("status", "published")
            .order("version_number", { ascending: false });
        if (pubErr) throw new Error(pubErr.message);

        const schemaByFormId = new Map<string, unknown>();
        for (const v of pubVersions ?? []) {
            const fid = String((v as { form_definition_id: string }).form_definition_id);
            if (!schemaByFormId.has(fid)) {
                schemaByFormId.set(fid, (v as { schema_json: unknown }).schema_json);
            }
        }

        const { data: links, error: linkErr } = await supabase
            .from("form_public_links")
            .select("form_definition_id, metadata")
            .eq("org_id", orgId)
            .eq("is_active", true);
        if (linkErr) throw new Error(linkErr.message);

        const linksByForm = new Map<string, Record<string, unknown>[]>();
        for (const l of links ?? []) {
            const fid = String((l as { form_definition_id: string }).form_definition_id);
            const meta =
                (l as { metadata?: unknown }).metadata !== null &&
                typeof (l as { metadata?: unknown }).metadata === "object" &&
                !Array.isArray((l as { metadata?: unknown }).metadata)
                    ? ((l as { metadata: Record<string, unknown> }).metadata)
                    : {};
            const list = linksByForm.get(fid) ?? [];
            list.push(meta);
            linksByForm.set(fid, list);
        }

        const formsInput = (formRows ?? [])
            .filter((r) => (r as { is_active?: boolean }).is_active !== false)
            .map((r) => {
                const row = r as { id: string; key: string; name: string; metadata: unknown };
                const md =
                    row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                        ? (row.metadata as Record<string, unknown>)
                        : null;
                return {
                    id: row.id,
                    key: row.key,
                    name: row.name,
                    metadata: md,
                    published_schema: schemaByFormId.get(row.id) ?? null,
                    link_metadata_samples: linksByForm.get(row.id) ?? [],
                };
            });

        forms = buildEnrollmentProcessFormCoverageRows({
            stage: operatorStage,
            required_labels,
            recommended_labels,
            field_rules,
            forms: formsInput,
        });

        linkable_forms = (formRows ?? [])
            .filter((r) => (r as { is_active?: boolean }).is_active !== false)
            .map((r) => ({
                id: String((r as { id: string }).id),
                name: String((r as { name: string }).name),
            }));
    }

    const baseActionCandidates = [...lifecycleActivationBaseActions(primaryRecordLabel)];
    const base_actions = await filterSaveableLifecycleBaseActions(supabase, orgId, baseActionCandidates);

    const labelsPayload = await resolveEntityLabelsForOrg(supabase, orgId);
    const labelsMap = entityLabelsMapFromEffective(labelsPayload.effective);
    const activation = lifecycleActivationFromMetadata(metadata);
    const entity_display_labels = lifecycleRequirementEntityLabelsFromMap(
        labelsMap,
        activation?.primary_record_label ?? primaryRecordLabel
    );

    const builder = lifecycleBuilderFromDepartmentMetadata(builderMetadata);
    const process = builder?.processes.find((p) => p.is_active) ?? null;
    const stageRecord = process?.stages.find((s) => s.key === builderStageKey && s.is_active) ?? null;
    /**
     * No code-default fallback once a process exists (decision D1). The legacy fallbacks that used
     * to sit here made an unconfigured stage LOOK configured in the editor, and a save then wrote
     * that appearance back as authored configuration. A stage with no membership must read as
     * having no membership — that is the truth the operator needs in order to fix it.
     */
    const queue_membership = resolveQueueMembershipForStage(stageRecord ?? {}, builderStageKey);
    const subjectForOptions = queueMembershipSubjectForStatusOptions({
        stageKey: builderStageKey,
        trackKey: stageRecord?.track_key ?? null,
        queueMembership: queue_membership,
    });
    const status_category_catalog = await loadBusinessProcessStatusCategoryCatalog(supabase, orgId);
    const legacyRollupKeys = [
        ...(queue_membership?.included_status_keys ?? []),
        ...(queue_membership?.included_disposition_keys ?? []),
    ];
    const status_rollup_v1 = resolveStatusRollupForStage({
        savedRollup: stageRecord?.status_rollup_v1 ?? null,
        stageKey: builderStageKey,
        trackKey: stageRecord?.track_key ?? null,
        catalog: status_category_catalog,
        legacySelectedKeys: legacyRollupKeys,
    });
    const queue_membership_status_options = await loadQueueMembershipStatusOptions(
        supabase,
        orgId,
        subjectForOptions,
        builderStageKey,
    );
    const stage_operating_plan = resolveStageOperatingPlanForStage(stageRecord ?? {}, builderStageKey);
    const savedPerspectives = resolvePerspectivesForStage(stageRecord ?? {});
    const perspectiveLaneKeys = derivePerspectiveLanesFromPipeline(pipeline).map((lane) => lane.queueKey);
    const perspectives_v1 =
        savedPerspectives && perspectiveLaneKeys.length
            ? coercePerspectivesV1ForLanes(savedPerspectives, perspectiveLaneKeys)
            : savedPerspectives;

    return {
        department_id: departmentId,
        builder_stage_key: builderStageKey,
        stage_track_key: stageRecord?.track_key ?? null,
        operator_stage: operatorStage,
        statuses,
        pipeline,
        field_requirements,
        entity_display_labels,
        actions,
        forms,
        linkable_forms,
        base_actions,
        queue_membership,
        queue_membership_status_options,
        status_category_catalog,
        status_rollup_v1,
        stage_operating_plan,
        perspectives_v1: perspectives_v1?.length ? perspectives_v1 : null,
        configuration_state: editorState ? summarizeBusinessProcessEditorState(editorState) : null,
    };
}

/**
 * A stage is valid for bootstrap ONLY when it is part of the department's configured Business
 * Process. Built-in lists (LIFECYCLE_STAGE_ORDER, ENROLLMENT_TEMPLATE_STAGE_KEYS) no longer
 * grant runtime validity — that is exactly the defect that let a removed `qualification` stage
 * be served (see docs/sprints/active/qualification-provenance-investigation.md).
 *
 * The single sanctioned built-in use remains: when a department has NO configured process yet
 * (first-time setup), the enrollment template stage set is allowed so the builder can bootstrap
 * an initial configuration. Once any process is configured, only its stages are valid.
 */
export function isValidBootstrapBuilderStage(
    metadata: Record<string, unknown> | null,
    builderStageKey: string
): boolean {
    const inventory = configuredStageInventoryFromMetadata(metadata);
    if (inventory.hasConfiguredProcess) {
        // Configured process is authoritative — no built-in fallback.
        return isStageInConfiguredInventory(inventory, builderStageKey);
    }
    // No process configured yet: allow ONLY the current enrollment template stages, purely to
    // seed first-time configuration. This set excludes `qualification` (Part 9). The stale
    // operator-stage list (LIFECYCLE_STAGE_ORDER) is presentation-only and never grants validity.
    return CURRENT_ENROLLMENT_TEMPLATE_STAGE_KEYS.has(builderStageKey);
}
