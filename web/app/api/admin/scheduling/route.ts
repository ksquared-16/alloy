import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    operationalEnrollmentErrorResponse,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";
import { detectUnplacedChildren } from "@/lib/scheduling/problems/detectUnplaced";
import { generatePlacementOptions } from "@/lib/scheduling/options/generatePlacementOptions";
import { loadSchedulingProjectionForChild } from "@/lib/scheduling/projection/buildSchedulingProjection";
import { getOperationalAgreementForMemberSite } from "@/lib/childcareOperational/enrollmentAgreementService";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import { validateScheduleCreatePayload } from "@/lib/scheduling/commands/scheduleCreateInputs";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDaysYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

function param(request: NextRequest, key: string): string {
    return (new URL(request.url).searchParams.get(key) ?? "").trim();
}

/**
 * Scheduling workspace read API (Milestone 1). Views:
 *   ?view=overview   &site_location_id=      → the unplaced-child (Place) queue
 *   ?view=options    &site_location_id=&child_agreement_id=&pattern_id=[&program_category_id=][&start_date=]
 *                                            → deterministic placement options
 *   ?view=projection &customer_member_id=&site_location_id=
 *                                            → the child's canonical scheduling projection
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const view = param(request, "view") || "overview";
    const supabase = createAdminClient();

    try {
        if (view === "sites") {
            const { data, error } = await supabase
                .from("locations")
                .select("id, label")
                .eq("org_id", ctx.orgId)
                .eq("location_type", "site")
                .order("label");
            if (error) {
                return NextResponse.json({ error: error.message, code: "db_error" }, { status: 500 });
            }
            const sites = ((data ?? []) as { id: string; label: string | null }[]).map((s) => ({
                id: s.id,
                name: s.label?.trim() || "Site",
            }));
            return NextResponse.json({ view, sites });
        }

        if (view === "overview") {
            const siteLocationId = param(request, "site_location_id");
            if (!siteLocationId) {
                return NextResponse.json({ error: "site_location_id is required", code: "invalid_input" }, { status: 400 });
            }
            const unplaced = await detectUnplacedChildren(supabase, ctx.orgId, siteLocationId);
            const { data: patternData } = await supabase
                .from("schedule_patterns")
                .select("id, label, weekdays")
                .eq("org_id", ctx.orgId)
                .eq("site_location_id", siteLocationId)
                .eq("is_active", true)
                .order("sort_order");
            const patterns = ((patternData ?? []) as { id: string; label: string | null; weekdays: number[] }[]).map(
                (p) => ({ id: p.id, label: p.label?.trim() || "Schedule", weekdays: p.weekdays ?? [] })
            );
            return NextResponse.json({ view, siteLocationId, unplaced, patterns });
        }

        if (view === "options") {
            const siteLocationId = param(request, "site_location_id");
            const childAgreementId = param(request, "child_agreement_id");
            const patternId = param(request, "pattern_id");
            const programCategoryId = param(request, "program_category_id") || null;
            if (!siteLocationId || !childAgreementId || !patternId) {
                return NextResponse.json(
                    { error: "site_location_id, child_agreement_id, and pattern_id are required", code: "invalid_input" },
                    { status: 400 }
                );
            }
            let dateStart = param(request, "start_date");
            if (!dateStart) dateStart = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            if (!ISO_DATE_RE.test(dateStart)) {
                return NextResponse.json({ error: "start_date must be YYYY-MM-DD", code: "invalid_input" }, { status: 400 });
            }
            const dateEnd = addDaysYmd(dateStart, 6);
            const options = await generatePlacementOptions(supabase, {
                orgId: ctx.orgId,
                siteLocationId,
                childAgreementId,
                programCategoryId,
                patternId,
                dateStart,
                dateEnd,
            });
            return NextResponse.json({ view, options, range: { dateStart, dateEnd } });
        }

        if (view === "projection") {
            const customerMemberId = param(request, "customer_member_id");
            const siteLocationId = param(request, "site_location_id");
            const subjectName = param(request, "subject_name") || "Child";
            if (!customerMemberId || !siteLocationId) {
                return NextResponse.json(
                    { error: "customer_member_id and site_location_id are required", code: "invalid_input" },
                    { status: 400 }
                );
            }
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const projection = await loadSchedulingProjectionForChild(supabase, ctx.orgId, {
                customerMemberId,
                siteLocationId,
                todayYmd,
                computedAt: `${todayYmd}T00:00:00.000Z`,
                subjectName,
            });
            return NextResponse.json({ view, projection });
        }

        return NextResponse.json({ error: `unknown view "${view}"`, code: "invalid_input" }, { status: 400 });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}

/**
 * Commit a Create-schedule decision — through the registered `schedule.create`
 * command (no mutation bypass). Body carries the chosen option's ids + labels.
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const customerMemberId = String(body.customer_member_id ?? "").trim();
    const siteLocationId = String(body.site_location_id ?? "").trim();
    if (!customerMemberId) {
        return NextResponse.json({ error: "customer_member_id is required", code: "invalid_input" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Resolve the operational enrollment agreement for this child + site. Scheduling
    // operates over the enrolled foundation; a pre-enrolled child has no agreement yet,
    // so we return an honest state (enrollment/Registration creates the schedulable
    // record) rather than fabricating one.
    if (!body.enrollment_agreement_id && siteLocationId) {
        const agreement = await getOperationalAgreementForMemberSite(
            supabase,
            ctx.orgId,
            customerMemberId,
            siteLocationId
        );
        if (!agreement) {
            return NextResponse.json(
                {
                    error: "This child isn't enrolled yet — enrollment (Registration) creates the schedulable record. Complete enrollment, then schedule.",
                    code: "not_enrolled",
                },
                { status: 409 }
            );
        }
        body.enrollment_agreement_id = agreement.id;
    }

    const validated = validateScheduleCreatePayload(body);
    if (!validated.ok) {
        return NextResponse.json({ error: validated.blockers[0]?.message ?? "invalid payload", blockers: validated.blockers }, { status: 400 });
    }

    const action = getRegisteredAction("schedule.create");
    if (!action) {
        return NextResponse.json({ error: "schedule.create is not registered", code: "server_error" }, { status: 500 });
    }

    const result = await action.execute({
        supabase,
        ctx: { orgId: ctx.orgId, userId: ctx.userId, accessScope: null },
        invocation: {
            actionKey: "schedule.create",
            entityType: "child",
            entityId: customerMemberId,
            payload: validated.value,
        },
        payload: validated.value,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error, correlationId: result.correlationId }, { status: result.status });
    }
    return NextResponse.json({ ok: true, result: result.result });
}
