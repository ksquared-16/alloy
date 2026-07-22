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
import { composeCommercialExport } from "@/lib/commercial/execution/export";
import { evaluate } from "@/lib/commercial/execution/evaluate/evaluate";
import { resolveCommercialScope } from "@/lib/commercial/execution/billing/resolveCommercialScope";
import type { CommercialContext } from "@/lib/commercial/execution/executionTypes";
import { mapCommercialResolutionToBillingProjection } from "@/lib/scheduling/billing/billingScheduleProjection";
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

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM 24h

function normTime(v: unknown): string | null {
    const s = typeof v === "string" ? v.trim() : "";
    return TIME_RE.test(s) ? s : null;
}

/** A daily time range, kept only when both ends are valid and ordered. */
function normRange(v: unknown): { arrive: string; depart: string } | null {
    if (!v || typeof v !== "object") return null;
    const arrive = normTime((v as Record<string, unknown>).arrive);
    const depart = normTime((v as Record<string, unknown>).depart);
    if (!arrive || !depart || depart <= arrive) return null;
    return { arrive, depart };
}

/**
 * Read a pattern's configured default daily hours from schedule_patterns.metadata
 * (the sanctioned time store). Accepts `default_hours: {arrive,depart}` or flat
 * `defaultArrive/defaultDepart`. Returns null when unconfigured — never synthesized.
 */
function readPatternDefaultHours(metadata: Record<string, unknown> | null): { arrive: string; depart: string } | null {
    if (!metadata) return null;
    const nested = normRange(metadata.default_hours ?? metadata.defaultHours);
    if (nested) return nested;
    return normRange({ arrive: metadata.defaultArrive, depart: metadata.defaultDepart });
}

/**
 * Normalize the builder's times payload into the shape stored WITH the schedule
 * definition (assignment / OCM metadata): a schedule-wide default range plus optional
 * per-weekday overrides. Invalid/empty ranges are dropped. Returns null when nothing valid.
 */
function normalizeScheduleTimes(raw: unknown): {
    default: { arrive: string; depart: string } | null;
    perDay: Record<string, { arrive: string; depart: string }>;
} | null {
    if (!raw || typeof raw !== "object") return null;
    const src = raw as Record<string, unknown>;
    const def = normRange(src.default);
    const perDay: Record<string, { arrive: string; depart: string }> = {};
    const perDaySrc = src.perDay && typeof src.perDay === "object" ? (src.perDay as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(perDaySrc)) {
        if (!/^[0-6]$/.test(k)) continue;
        const range = normRange(v);
        if (range) perDay[k] = range;
    }
    if (!def && Object.keys(perDay).length === 0) return null;
    return { default: def, perDay };
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
            // Resolve the subject's site from the operational context so the operator
            // is not asked to choose one when it is already established. The lead/
            // opportunity carries its site as `location_id`; we only trust it when it
            // resolves to an actual site (guards against a non-site location).
            const opportunityId = param(request, "opportunity_id");
            let resolvedSiteId: string | null = null;
            if (opportunityId) {
                const { data: opp } = await supabase
                    .from("opportunities")
                    .select("location_id")
                    .eq("org_id", ctx.orgId)
                    .eq("id", opportunityId)
                    .maybeSingle();
                const oppSiteId = (opp as { location_id?: string | null } | null)?.location_id ?? null;
                if (oppSiteId && sites.some((s) => s.id === oppSiteId)) resolvedSiteId = oppSiteId;
            }
            return NextResponse.json({ view, sites, resolvedSiteId });
        }

        if (view === "overview") {
            const siteLocationId = param(request, "site_location_id");
            if (!siteLocationId) {
                return NextResponse.json({ error: "site_location_id is required", code: "invalid_input" }, { status: 400 });
            }
            const unplaced = await detectUnplacedChildren(supabase, ctx.orgId, siteLocationId);
            const { data: patternData } = await supabase
                .from("schedule_patterns")
                .select("id, label, weekdays, schedule_type_key, metadata")
                .eq("org_id", ctx.orgId)
                .eq("site_location_id", siteLocationId)
                .eq("is_active", true)
                .order("sort_order");
            const patterns = (
                (patternData ?? []) as {
                    id: string;
                    label: string | null;
                    weekdays: number[];
                    schedule_type_key: string | null;
                    metadata: Record<string, unknown> | null;
                }[]
            ).map((p) => ({
                id: p.id,
                label: p.label?.trim() || "Schedule",
                weekdays: p.weekdays ?? [],
                scheduleTypeKey: p.schedule_type_key ?? "",
                // Config-driven default daily hours (schedule_patterns.metadata is the
                // sanctioned time store — no synthesized source). Absent → operator sets them.
                defaultHours: readPatternDefaultHours(p.metadata),
            }));
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

        if (view === "billing") {
            // Financial preview for a (proposed) schedule — Billing owns the amounts;
            // Scheduling only displays. Read-shaping over the write-free commercial
            // pipeline. Graceful "unconfigured" when a rate can't be resolved.
            const siteLocationId = param(request, "site_location_id");
            const scheduleType = param(request, "schedule_type");
            const customerMemberId = param(request, "customer_member_id");
            const startDate = param(request, "start_date");
            const asOf = startDate && ISO_DATE_RE.test(startDate)
                ? startDate
                : await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);

            // Resolve the child's program category (operational placement first, else
            // the pre-enrolled desired program on the opportunity member), then its key.
            let programCategoryId = param(request, "program_category_id");
            if (!programCategoryId && customerMemberId) {
                const { data: pl } = await supabase
                    .from("child_placements")
                    .select("program_category_id")
                    .eq("org_id", ctx.orgId)
                    .eq("customer_member_id", customerMemberId)
                    .in("status", ["planned", "active", "ending"])
                    .maybeSingle();
                programCategoryId = (pl as { program_category_id?: string | null } | null)?.program_category_id ?? "";
                if (!programCategoryId) {
                    // customerMemberId may be a real member id (enrolled) or an
                    // opportunity_customer_member id (pre-enrolled) — try both.
                    const byMember = await supabase
                        .from("opportunity_customer_members")
                        .select("program_category_id")
                        .eq("org_id", ctx.orgId)
                        .eq("customer_member_id", customerMemberId)
                        .maybeSingle();
                    programCategoryId =
                        (byMember.data as { program_category_id?: string | null } | null)?.program_category_id ?? "";
                    if (!programCategoryId) {
                        const byId = await supabase
                            .from("opportunity_customer_members")
                            .select("program_category_id")
                            .eq("org_id", ctx.orgId)
                            .eq("id", customerMemberId)
                            .maybeSingle();
                        programCategoryId =
                            (byId.data as { program_category_id?: string | null } | null)?.program_category_id ?? "";
                    }
                }
            }
            let programKey = "";
            if (programCategoryId) {
                const { data } = await supabase
                    .from("location_program_categories")
                    .select("key")
                    .eq("org_id", ctx.orgId)
                    .eq("id", programCategoryId)
                    .maybeSingle();
                programKey = (data as { key?: string } | null)?.key?.trim() ?? "";
            }

            const unconfigured = () =>
                NextResponse.json({
                    view,
                    projection: {
                        status: "unconfigured",
                        recommendedRate: null,
                        discounts: [],
                        funding: [],
                        totals: null,
                        warnings: ["Billing not yet configured for this schedule."],
                    },
                });

            if (!programKey || !scheduleType) return unconfigured();

            const { export: exp } = await composeCommercialExport({ supabase, orgId: ctx.orgId, asOf });
            const scope = resolveCommercialScope(exp, { programKey, scheduleBasis: scheduleType });
            if (!scope.resolved) return unconfigured();

            const context: CommercialContext = {
                subject: { type: "child", id: null },
                scope: { programKey, offeringId: scope.offeringId, variantId: scope.variantId, locationId: siteLocationId || null },
                commitment: { cadenceKey: scope.cadenceKey, payerIntent: scope.payerType },
                asOf,
                mode: "actual",
            };
            const resolution = evaluate(context, exp);
            const projection = mapCommercialResolutionToBillingProjection(resolution, {
                computedAt: `${asOf}T00:00:00.000Z`,
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
            // Pre-enrolled child → persist a PROPOSED schedule (planning / forecasting /
            // Billing preview), NOT an operational placement. It materializes into
            // operational truth when the child enrolls (Enrollment is the boundary).
            const proposed = await proposeSchedule(supabase, ctx.orgId, {
                customerMemberId,
                ocmId: String(body.opportunity_customer_member_id ?? "").trim() || null,
                personId: String(body.person_id ?? "").trim() || null,
                schedulePatternId: String(body.schedule_pattern_id ?? "").trim(),
                roomLocationId: String(body.room_location_id ?? "").trim() || null,
                startDate: String(body.start_date ?? "").trim() || null,
                times: normalizeScheduleTimes(body.times),
            });
            if (!proposed.ok) {
                return NextResponse.json({ error: proposed.error, code: "propose_failed" }, { status: proposed.status });
            }
            return NextResponse.json({
                ok: true,
                proposed: true,
                result: proposed.result,
                message: "Proposed schedule saved — becomes operational at enrollment.",
            });
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

/**
 * Persist a PROPOSED schedule for a pre-enrolled child by setting the desired
 * schedule intent on the opportunity_customer_member (schedule_type · room ·
 * start_date). Materialization (`applyChildEnrollmentMaterialization`) consumes
 * these on enrollment — the proposal is planning-only until then. Room location
 * id is stored on `program_room_cohort_key` (the handoff treats it as the room).
 */
async function proposeSchedule(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    input: {
        customerMemberId: string;
        ocmId: string | null;
        personId: string | null;
        schedulePatternId: string;
        roomLocationId: string | null;
        startDate: string | null;
        times: { default: { arrive: string; depart: string } | null; perDay: Record<string, { arrive: string; depart: string }> } | null;
    }
): Promise<
    | { ok: true; result: { opportunity_customer_member_id: string; schedule_type: string | null } }
    | { ok: false; error: string; status: number }
> {
    // Pre-enrolled inquiry children have no customer_member_id yet, so the card's
    // identifier is the opportunity_customer_member id. Resolve by either.
    let ocmId: string | undefined;
    {
        // The card carries the writable enrollment record id directly.
        if (input.ocmId) {
            const byOcm = await supabase
                .from("opportunity_customer_members")
                .select("id")
                .eq("org_id", orgId)
                .eq("id", input.ocmId)
                .maybeSingle();
            ocmId = (byOcm.data as { id?: string } | null)?.id;
        }
        if (!ocmId) {
            const byId = await supabase
                .from("opportunity_customer_members")
                .select("id")
                .eq("org_id", orgId)
                .eq("id", input.customerMemberId)
                .maybeSingle();
            ocmId = (byId.data as { id?: string } | null)?.id;
        }
        if (!ocmId) {
            const byMember = await supabase
                .from("opportunity_customer_members")
                .select("id")
                .eq("org_id", orgId)
                .eq("customer_member_id", input.customerMemberId)
                .maybeSingle();
            ocmId = (byMember.data as { id?: string } | null)?.id;
        }
        if (!ocmId && input.personId) {
            const byPerson = await supabase
                .from("opportunity_customer_members")
                .select("id")
                .eq("org_id", orgId)
                .eq("person_id", input.personId)
                .maybeSingle();
            ocmId = (byPerson.data as { id?: string } | null)?.id;
        }
    }
    if (!ocmId) {
        return {
            ok: false,
            error: "Couldn't link this child to an enrollment record to save the proposed schedule.",
            status: 404,
        };
    }

    let scheduleType: string | null = null;
    if (input.schedulePatternId) {
        const { data: pat } = await supabase
            .from("schedule_patterns")
            .select("schedule_type_key")
            .eq("org_id", orgId)
            .eq("id", input.schedulePatternId)
            .maybeSingle();
        scheduleType = (pat as { schedule_type_key?: string | null } | null)?.schedule_type_key ?? null;
    }

    const updates: Record<string, unknown> = {};
    if (scheduleType) updates.schedule_type = scheduleType;
    if (input.roomLocationId) updates.program_room_cohort_key = input.roomLocationId;
    if (input.startDate) updates.start_date = input.startDate;
    // Daily time ranges live WITH the schedule definition. On the proposed schedule
    // that store is the OCM's metadata jsonb; merge (never clobber other keys).
    if (input.times) {
        const { data: existing } = await supabase
            .from("opportunity_customer_members")
            .select("metadata")
            .eq("id", ocmId)
            .eq("org_id", orgId)
            .maybeSingle();
        const prevMeta = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
        updates.metadata = { ...prevMeta, scheduleTimes: input.times };
    }
    if (Object.keys(updates).length === 0) {
        return { ok: false, error: "Nothing to propose (choose a pattern, room, or start date).", status: 400 };
    }

    const { error } = await supabase
        .from("opportunity_customer_members")
        .update(updates)
        .eq("id", ocmId)
        .eq("org_id", orgId);
    if (error) {
        return { ok: false, error: error.message, status: 400 };
    }
    return { ok: true, result: { opportunity_customer_member_id: ocmId, schedule_type: scheduleType } };
}
