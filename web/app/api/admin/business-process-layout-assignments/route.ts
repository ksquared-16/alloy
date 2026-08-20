/**
 * Business Process Layout Assignments — admin API.
 *
 * GET  /api/admin/business-process-layout-assignments?process=enrollment
 * PUT  /api/admin/business-process-layout-assignments
 * POST /api/admin/business-process-layout-assignments/seed-enrollment
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    clearBusinessProcessLayoutAssignment,
    listBusinessProcessLayoutAssignments,
    upsertBusinessProcessLayoutAssignment,
} from "@/lib/layout/businessProcessLayoutAssignmentsRepo";
import { getLayoutById } from "@/lib/layout/entityLayoutsRepo";
import { validateBusinessProcessLayoutAssignmentInput } from "@/lib/layout/validateBusinessProcessLayoutAssignment";
import { isLayoutAssignmentSurfaceKey } from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import { seedEnrollmentBusinessProcessLayoutAssignments } from "@/lib/layout/seedEnrollmentBusinessProcessLayoutAssignments";

export async function GET(req: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const processKey = req.nextUrl.searchParams.get("process")?.trim() || undefined;
    const supabase = createAdminClient();
    const assignments = await listBusinessProcessLayoutAssignments(supabase, ctx.orgId, processKey);
    return NextResponse.json({ assignments });
}

export async function PUT(req: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const businessProcessKey = typeof body.business_process_key === "string" ? body.business_process_key.trim() : "";
    const surfaceKey = typeof body.surface_key === "string" ? body.surface_key.trim() : "";
    const stageKey = typeof body.stage_key === "string" ? body.stage_key : body.stage_key === null ? null : undefined;
    const statusKey = typeof body.status_key === "string" ? body.status_key : body.status_key === null ? null : undefined;
    const layoutKey = typeof body.layout_key === "string" ? body.layout_key.trim() : "";
    const entityLayoutId =
        typeof body.entity_layout_id === "string" ? body.entity_layout_id.trim()
        : body.entity_layout_id === null ? null
        : undefined;
    const useDefault = body.use_default === true;

    if (!businessProcessKey || !surfaceKey) {
        return NextResponse.json({ error: "business_process_key and surface_key are required" }, { status: 400 });
    }
    if (!isLayoutAssignmentSurfaceKey(surfaceKey)) {
        return NextResponse.json({ error: "Invalid surface_key" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (useDefault) {
        const existing = await listBusinessProcessLayoutAssignments(supabase, ctx.orgId, businessProcessKey);
        const match = existing.find(
            (a) =>
                a.surfaceKey === surfaceKey
                && (a.stageKey ?? null) === (typeof stageKey === "string" ? stageKey.trim() : stageKey ?? null)
                && (a.statusKey ?? null) === (typeof statusKey === "string" ? statusKey.trim() : statusKey ?? null),
        );
        if (match) await clearBusinessProcessLayoutAssignment(supabase, match.id);
        return NextResponse.json({ cleared: true });
    }

    if (!layoutKey && !entityLayoutId) {
        return NextResponse.json({ error: "layout_key or entity_layout_id required" }, { status: 400 });
    }

    const layoutRecord = entityLayoutId ? await getLayoutById(supabase, entityLayoutId) : null;
    const validation = validateBusinessProcessLayoutAssignmentInput({
        businessProcessKey,
        stageKey,
        statusKey,
        surfaceKey,
        layoutRecord,
    });
    if (!validation.ok) {
        return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 });
    }

    const assignment = await upsertBusinessProcessLayoutAssignment(supabase, {
        orgId: ctx.orgId,
        businessProcessKey,
        stageKey,
        statusKey,
        surfaceKey,
        layoutKey: layoutKey || layoutRecord!.layoutKey,
        entityLayoutId: layoutRecord?.id ?? null,
        createdBy: ctx.userId,
    });

    return NextResponse.json(assignment);
}

export async function POST(req: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "seed_enrollment") {
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const count = await seedEnrollmentBusinessProcessLayoutAssignments(supabase, ctx.orgId, ctx.userId);
    return NextResponse.json({ seeded: count });
}
