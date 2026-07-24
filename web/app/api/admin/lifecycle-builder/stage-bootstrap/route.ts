import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import {
    buildLifecycleStageBootstrap,
    isValidBootstrapBuilderStage,
} from "@/lib/lifecycle/buildLifecycleStageBootstrap";
import {
    configuredStageInventoryFromMetadata,
    stageConfigurationError,
} from "@/lib/lifecycle/configuredStageInventory";

/** GET — single payload for lifecycle builder stage configuration (prefetch). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("department_id")?.trim() || "";
    const stageKey = searchParams.get("stage_key")?.trim() || "";
    const primaryRecordLabel = searchParams.get("primary_record_label")?.trim() || "Lead";

    if (!departmentId) {
        return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    }
    if (!stageKey) {
        return NextResponse.json({ error: "stage_key is required" }, { status: 400 });
    }
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Department not in workspace scope" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (deptErr) return NextResponse.json({ error: deptErr.message }, { status: 500 });
    if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    if (!isValidBootstrapBuilderStage(metadata, stageKey)) {
        const inventory = configuredStageInventoryFromMetadata(metadata);
        return NextResponse.json(
            {
                error: stageConfigurationError(inventory, stageKey).message,
                code: "stage_not_configured",
                configured_stages: inventory.stageKeys,
            },
            { status: 400 },
        );
    }

    try {
        const bootstrap = await buildLifecycleStageBootstrap({
            supabase,
            orgId: ctx.orgId,
            departmentId,
            builderStageKey: stageKey,
            primaryRecordLabel,
        });
        return NextResponse.json(bootstrap, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load stage bootstrap" },
            { status: 500 }
        );
    }
}
