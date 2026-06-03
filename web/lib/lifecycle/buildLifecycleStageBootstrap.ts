import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { dbListFormDefinitions } from "@/lib/admin/forms/formsAdminDb";
import { parseLifecycleProgressionRequirementsOverride } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
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

    const statusRows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", {
        activeOnly: true,
    });
    const stageKeys = await stageKeysForDepartment(supabase, orgId, metadata);
    const statuses = buildEnrollmentStatusStagesPayload(mapStatusRows(statusRows), stageKeys);

    const pipeline = await loadStageWorkUnitSnapshotForDepartment(
        supabase,
        orgId,
        departmentId,
        builderStageKey
    );

    let field_requirements: LifecycleStageBootstrapPayload["field_requirements"] = null;
    if (isValidBootstrapBuilderStage(metadata, builderStageKey)) {
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

    return {
        department_id: departmentId,
        builder_stage_key: builderStageKey,
        operator_stage: operatorStage,
        statuses,
        pipeline,
        field_requirements,
        entity_display_labels,
        actions,
        forms,
        linkable_forms,
        base_actions,
    };
}

export function isValidBootstrapBuilderStage(
    metadata: Record<string, unknown> | null,
    builderStageKey: string
): boolean {
    if ((LIFECYCLE_STAGE_ORDER as readonly string[]).includes(builderStageKey)) return true;
    return isConfiguredStageKey(metadata, builderStageKey);
}
