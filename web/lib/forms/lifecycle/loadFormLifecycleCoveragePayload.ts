/**
 * Server-side lifecycle coverage payload for Form Detail API (Card 3).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dbGetFormDefinition } from "@/lib/admin/forms/formsAdminDb";
import { buildFormLifecycleCoveragePresentation } from "@/lib/forms/lifecycle/buildFormLifecycleCoveragePresentation";
import type {
    FormsLifecycleCoverageResult,
    FormsLifecycleRequirementContract,
} from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";
import { evaluateFormsLifecycleFieldCoverage } from "@/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage";
import {
    readFormLifecycleUsage,
    type FormsLifecycleUsageV1,
} from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import { resolveFormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract";
import { loadOrgFieldDefinitionsForLifecycle } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";

export type FormLifecycleCoverageSchemaSource = "published" | "draft" | "none";

export type FormLifecycleCoveragePayload = {
    configured: boolean;
    lifecycle_usage: FormsLifecycleUsageV1 | null;
    department_name: string | null;
    schema_source: FormLifecycleCoverageSchemaSource;
    contract: FormsLifecycleRequirementContract | null;
    coverage: FormsLifecycleCoverageResult | null;
    presentation: ReturnType<typeof buildFormLifecycleCoveragePresentation>;
};

async function loadSchemaForCoverage(
    supabase: SupabaseClient,
    orgId: string,
    formId: string
): Promise<{ schemaJson: unknown | null; schema_source: FormLifecycleCoverageSchemaSource }> {
    const { data: versions, error } = await supabase
        .from("form_definition_versions")
        .select("schema_json, status, version_number")
        .eq("org_id", orgId)
        .eq("form_definition_id", formId)
        .order("version_number", { ascending: false });

    if (error) throw new Error(error.message);

    const rows = (versions ?? []) as {
        schema_json: unknown;
        status: string;
        version_number: number;
    }[];

    const published = rows.find((v) => v.status === "published");
    if (published) {
        return { schemaJson: published.schema_json, schema_source: "published" };
    }

    const draft = rows.find((v) => v.status === "draft");
    if (draft) {
        return { schemaJson: draft.schema_json, schema_source: "draft" };
    }

    return { schemaJson: null, schema_source: "none" };
}

export async function loadFormLifecycleCoveragePayload(
    supabase: SupabaseClient,
    orgId: string,
    formId: string
): Promise<FormLifecycleCoveragePayload | null> {
    const { data: form, error: formErr } = await dbGetFormDefinition(supabase, orgId, formId);
    if (formErr) throw new Error(formErr.message);
    if (!form) return null;

    const metadata =
        (form as { metadata?: unknown }).metadata !== null &&
        typeof (form as { metadata?: unknown }).metadata === "object" &&
        !Array.isArray((form as { metadata?: unknown }).metadata)
            ? ((form as { metadata: Record<string, unknown> }).metadata)
            : {};

    const usage = readFormLifecycleUsage(metadata);
    const { schemaJson, schema_source } = await loadSchemaForCoverage(supabase, orgId, formId);

    if (!usage) {
        return {
            configured: false,
            lifecycle_usage: null,
            department_name: null,
            schema_source,
            contract: null,
            coverage: null,
            presentation: buildFormLifecycleCoveragePresentation({
                usage: null,
                contract: null,
                coverage: null,
                schema_source,
            }),
        };
    }

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, name, metadata")
        .eq("org_id", orgId)
        .eq("id", usage.department_id)
        .maybeSingle();

    if (deptErr) throw new Error(deptErr.message);
    if (!dept) {
        return {
            configured: true,
            lifecycle_usage: usage,
            department_name: null,
            schema_source,
            contract: null,
            coverage: null,
            presentation: buildFormLifecycleCoveragePresentation({
                usage,
                departmentName: null,
                contract: null,
                coverage: null,
                schema_source,
            }),
        };
    }

    const deptRow = dept as { name?: string; metadata?: Record<string, unknown> };
    const orgFieldDefinitions = await loadOrgFieldDefinitionsForLifecycle(supabase, orgId);

    const contract = resolveFormsLifecycleRequirementContract({
        orgId,
        departmentId: usage.department_id,
        processId: usage.process_id ?? null,
        stageKey: usage.stage_key,
        intent: String(usage.intake_intent),
        lifecycleLabel: deptRow.name ?? undefined,
        departmentMetadata: deptRow.metadata ?? null,
        orgFieldDefinitions,
    });

    const coverage =
        schemaJson != null ? evaluateFormsLifecycleFieldCoverage(schemaJson, contract) : null;

    const presentation = buildFormLifecycleCoveragePresentation({
        usage,
        departmentName: deptRow.name ?? null,
        contract,
        coverage,
        schema_source,
    });

    return {
        configured: true,
        lifecycle_usage: usage,
        department_name: deptRow.name ?? null,
        schema_source,
        contract,
        coverage,
        presentation,
    };
}
