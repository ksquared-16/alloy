import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { loadQueueMembershipStatusOptions } from "@/lib/lifecycle/loadQueueMembershipStatusOptions";
import type { QueueMembershipSubjectType } from "@/lib/lifecycle/queueMembershipV1";

const SUBJECT_TYPES = new Set<QueueMembershipSubjectType>(["case", "child", "candidate"]);

/** GET — status/disposition options for queue membership editor by subject grain. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("department_id")?.trim() || "";
    const stageKey = searchParams.get("stage_key")?.trim() || "";
    const subjectRaw = searchParams.get("subject_type")?.trim() || "case";

    if (!departmentId) {
        return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    }
    if (!stageKey) {
        return NextResponse.json({ error: "stage_key is required" }, { status: 400 });
    }
    if (!SUBJECT_TYPES.has(subjectRaw as QueueMembershipSubjectType)) {
        return NextResponse.json({ error: "Invalid subject_type" }, { status: 400 });
    }
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Department not in workspace scope" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (deptErr) return NextResponse.json({ error: deptErr.message }, { status: 500 });
    if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    try {
        const options = await loadQueueMembershipStatusOptions(
            supabase,
            ctx.orgId,
            subjectRaw as QueueMembershipSubjectType,
            stageKey,
        );
        return NextResponse.json({ options });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load status options" },
            { status: 500 },
        );
    }
}
