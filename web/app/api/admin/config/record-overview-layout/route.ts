import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { applyRecordOverviewLayoutPut } from "@/lib/agent/v1/applyRecordOverviewLayoutUpdate";
import {
    RECORD_OVERVIEW_LAYOUT_V1_SURFACE,
    normalizeRecordOverviewEntityTypeParam,
} from "@/lib/rrs/overview/recordOverviewLayoutScope";

type PutBody = {
    entity_type?: unknown;
    surface?: unknown;
    config?: unknown;
    expected_config_version?: unknown;
};

/**
 * PUT — org-scoped `record_overview_layouts.config` (admin). Mutations: admin role only.
 */
export async function PUT(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: PutBody;
    try {
        body = (await request.json()) as PutBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const entityNorm = normalizeRecordOverviewEntityTypeParam(
        typeof body.entity_type === "string" ? body.entity_type : null
    );
    const surface =
        typeof body.surface === "string" ? body.surface.trim().toLowerCase() : "";

    if (!entityNorm || surface !== RECORD_OVERVIEW_LAYOUT_V1_SURFACE) {
        return NextResponse.json(
            { error: "entity_type must be job (or jobs) and surface must be overview" },
            { status: 400 }
        );
    }

    if (
        typeof body.expected_config_version !== "number" ||
        !Number.isInteger(body.expected_config_version)
    ) {
        return NextResponse.json({ error: "expected_config_version must be an integer" }, { status: 400 });
    }

    if (body.config === undefined) {
        return NextResponse.json({ error: "config is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await applyRecordOverviewLayoutPut(supabase, ctx.orgId, entityNorm, surface, {
        config: body.config,
        expected_config_version: body.expected_config_version,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ layout: result.row });
}
