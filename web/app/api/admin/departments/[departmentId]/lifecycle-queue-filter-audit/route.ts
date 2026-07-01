import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";
import {
    buildLifecycleQueueFilterEvaluationCompare,
    formatQueueFilterEvaluationCompareReport,
} from "@/lib/lifecycle/lifecycleQueueFilterEvaluationCompare";

/**
 * GET ?stage_key=enrolling — side-by-side queue filter evaluation proof (no repair).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
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

    const stageKey = new URL(request.url).searchParams.get("stage_key")?.trim() || "";
    if (!stageKey) {
        return NextResponse.json({ error: "stage_key query param is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const activation = lifecycleActivationFromMetadata(row.metadata);
    if (!activation) {
        return NextResponse.json({ error: "No activation bundle on department." }, { status: 400 });
    }

    try {
        const compare = await buildLifecycleQueueFilterEvaluationCompare({
            supabase,
            orgId: ctx.orgId,
            departmentId,
            stageKey,
            stageLabel: activation.stage_key === stageKey ? activation.stage_label : null,
            activation,
        });
        const report = formatQueueFilterEvaluationCompareReport(compare);
        return NextResponse.json({ compare, report });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Audit failed" },
            { status: 500 }
        );
    }
}
