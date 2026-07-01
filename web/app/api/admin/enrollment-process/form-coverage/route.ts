import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { dbListFormDefinitions } from "@/lib/admin/forms/formsAdminDb";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { effectiveFieldRulesForDepartment, effectiveRequirementLabelsForDepartment } from "@/lib/lifecycle/enrollmentProcessDepartmentRequirements";
import { buildEnrollmentProcessFormCoverageRows } from "@/lib/lifecycle/enrollmentProcessFormCoverage";

function isStageKey(s: string): s is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s);
}

/** GET ?department_id=&stage= — forms and requirement coverage for one enrollment stage. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("department_id")?.trim() || "";
    const stage = searchParams.get("stage")?.trim() || "";
    if (!departmentId) return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    if (!isStageKey(stage)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (deptErr) return NextResponse.json({ error: deptErr.message }, { status: 500 });
    if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    const { required_labels, recommended_labels } = effectiveRequirementLabelsForDepartment(stage, metadata);
    const { rules: field_rules } = effectiveFieldRulesForDepartment(stage, metadata);

    const { data: formRows, error: formErr } = await dbListFormDefinitions(supabase, ctx.orgId);
    if (formErr) return NextResponse.json({ error: formErr.message }, { status: 500 });

    const { data: pubVersions, error: pubErr } = await supabase
        .from("form_definition_versions")
        .select("form_definition_id, version_number, schema_json")
        .eq("org_id", ctx.orgId)
        .eq("status", "published")
        .order("version_number", { ascending: false });
    if (pubErr) return NextResponse.json({ error: pubErr.message }, { status: 500 });

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
        .eq("org_id", ctx.orgId)
        .eq("is_active", true);
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

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

    const forms = (formRows ?? [])
        .filter((r) => (r as { is_active?: boolean }).is_active !== false)
        .map((r) => {
            const row = r as {
                id: string;
                key: string;
                name: string;
                metadata: unknown;
            };
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

    const coverage = buildEnrollmentProcessFormCoverageRows({
        stage,
        required_labels,
        recommended_labels,
        field_rules,
        forms,
    });

    return NextResponse.json({
        stage,
        required_labels,
        recommended_labels,
        field_rules,
        forms: coverage,
    });
}
