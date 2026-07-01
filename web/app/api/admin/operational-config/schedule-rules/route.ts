import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createScheduleRule,
    createScheduleRuleVersion,
    retireScheduleRule,
    voidScheduledScheduleRule,
} from "@/lib/childcareOperational/config/configRuleAuthoringService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Versioned authoring for childcare schedule / eligibility rules (Operational
 * Configuration V1, Phase 3). Role-gated POST dispatching by `action`: create |
 * version (supersede) | retire | void. L1 operating policy over schedule_patterns
 * — not the schedule catalog itself. No expectations/attendance/charges writes.
 */
function parseStringArray(value: unknown): string[] | null {
    if (value == null) return null;
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
    return null;
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const action = String(body.action ?? "").trim();
    const supabase = createAdminClient();

    try {
        const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);

        if (action === "create") {
            const rule = await createScheduleRule(supabase, {
                orgId: ctx.orgId,
                scopeType: String(body.scope_type ?? ""),
                siteLocationId: body.site_location_id != null ? String(body.site_location_id) : null,
                programCategoryId: body.program_category_id != null ? String(body.program_category_id) : null,
                roomLocationId: body.room_location_id != null ? String(body.room_location_id) : null,
                ageGroupKey: body.age_group_key != null ? String(body.age_group_key) : null,
                eligibleScheduleTypeKeys: parseStringArray(body.eligible_schedule_type_keys),
                eligibleAgeGroupKeys: parseStringArray(body.eligible_age_group_keys),
                minDaysPerWeek: body.min_days_per_week != null ? Number(body.min_days_per_week) : null,
                maxDaysPerWeek: body.max_days_per_week != null ? Number(body.max_days_per_week) : null,
                effectiveStart: String(body.effective_start ?? ""),
                effectiveEnd: body.effective_end != null ? String(body.effective_end) : null,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ rule }, { status: 201 });
        }

        if (action === "version") {
            const result = await createScheduleRuleVersion(supabase, {
                orgId: ctx.orgId,
                priorId: String(body.prior_id ?? ""),
                effectiveStart: String(body.effective_start ?? ""),
                eligibleScheduleTypeKeys:
                    body.eligible_schedule_type_keys !== undefined
                        ? parseStringArray(body.eligible_schedule_type_keys)
                        : undefined,
                eligibleAgeGroupKeys:
                    body.eligible_age_group_keys !== undefined
                        ? parseStringArray(body.eligible_age_group_keys)
                        : undefined,
                minDaysPerWeek:
                    body.min_days_per_week !== undefined
                        ? body.min_days_per_week != null
                            ? Number(body.min_days_per_week)
                            : null
                        : undefined,
                maxDaysPerWeek:
                    body.max_days_per_week !== undefined
                        ? body.max_days_per_week != null
                            ? Number(body.max_days_per_week)
                            : null
                        : undefined,
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (action === "retire") {
            const rule = await retireScheduleRule(supabase, {
                orgId: ctx.orgId,
                id: String(body.id ?? ""),
                effectiveEnd: String(body.effective_end ?? ""),
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ rule }, { status: 200 });
        }

        if (action === "void") {
            const result = await voidScheduledScheduleRule(supabase, {
                orgId: ctx.orgId,
                id: String(body.id ?? ""),
                todayYmd,
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 200 });
        }

        return NextResponse.json(
            { error: `Unknown action: ${action || "(missing)"}`, code: "invalid_input" },
            { status: 400 },
        );
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
