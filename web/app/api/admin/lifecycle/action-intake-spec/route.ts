import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { resolveActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";
import { loadOrgFieldDefinitionsForLifecycle } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import {
    LIFECYCLE_ACTIVATION_METADATA_KEY,
    parseLifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";

/** GET — resolve action intake spec for operator capture (create_lead V1). */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const url = new URL(request.url);
    const actionKey = url.searchParams.get("action_key")?.trim() ?? "";
    const departmentId = url.searchParams.get("department_id")?.trim() ?? "";
    const stageKey = url.searchParams.get("stage_key")?.trim() || "lead";
    const processId = url.searchParams.get("process_id")?.trim() || null;

    if (!actionKey) {
        return NextResponse.json({ error: "action_key is required" }, { status: 400 });
    }
    if (!departmentId) {
        return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (deptErr) return NextResponse.json({ error: deptErr.message }, { status: 400 });
    if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    const orgFields = await loadOrgFieldDefinitionsForLifecycle(supabase, ctx.orgId);
    const activation = parseLifecycleActivationV1(metadata[LIFECYCLE_ACTIVATION_METADATA_KEY]);
    const primaryRecordLabel = activation?.primary_record_label ?? "Lead";

    const spec = resolveActionIntakeSpec({
        action_key: actionKey,
        department_id: departmentId,
        process_id: processId,
        stage_key: stageKey,
        department_metadata: metadata,
        org_field_definitions: orgFields,
        primary_record_label: primaryRecordLabel,
    });

    if (!spec) {
        return NextResponse.json({ error: `Unsupported action_key: ${actionKey}` }, { status: 400 });
    }

    return NextResponse.json({ spec });
}
