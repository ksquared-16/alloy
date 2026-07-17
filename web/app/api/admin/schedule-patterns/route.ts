import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createSchedulePattern,
    listSchedulePatterns,
} from "@/lib/childcareOperational/schedulePatternService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    parseWeekdays,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    const { searchParams } = new URL(request.url);
    const siteLocationId = (searchParams.get("site_location_id") ?? "").trim();
    const isActiveParam = (searchParams.get("is_active") ?? "").trim().toLowerCase();

    let isActive: boolean | undefined;
    if (isActiveParam === "true") isActive = true;
    if (isActiveParam === "false") isActive = false;

    const supabase = createAdminClient();
    try {
        const patterns = await listSchedulePatterns(supabase, ctx.orgId, {
            siteLocationId: siteLocationId || undefined,
            isActive,
        });
        return NextResponse.json({ patterns });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const siteLocationId = String(body.site_location_id ?? "").trim();
    const key = String(body.key ?? "").trim();
    const label = String(body.label ?? "").trim();
    const scheduleTypeKey = String(body.schedule_type_key ?? "").trim();
    const weekdays = parseWeekdays(body.weekdays);

    if (!siteLocationId || !key || !label || !scheduleTypeKey || !weekdays) {
        return NextResponse.json(
            {
                error: "site_location_id, key, label, schedule_type_key, and weekdays are required",
                code: "invalid_input",
            },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    try {
        const pattern = await createSchedulePattern(supabase, {
            orgId: ctx.orgId,
            siteLocationId,
            key,
            label,
            scheduleTypeKey,
            weekdays,
            sortOrder: body.sort_order != null ? Number(body.sort_order) : undefined,
            isActive: typeof body.is_active === "boolean" ? body.is_active : undefined,
            metadata: parseJsonObject(body.metadata),
        });
        return NextResponse.json({ pattern }, { status: 201 });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
