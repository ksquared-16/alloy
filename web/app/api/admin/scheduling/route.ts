import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { documentActorFromAdminParts } from "@/lib/documents/projectPersonProfilePhotos";
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
import { applyChildParticipationEdit } from "@/lib/childcareOperational/applyChildParticipationEdit";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { buildRosterReadModel, type RosterReadModel } from "@/lib/scheduling/roster/buildRosterReadModel";
import { detectStartsInWindow } from "@/lib/scheduling/problems/detectStartsThisWeek";
import { computeTodayActivity } from "@/lib/scheduling/activity/todayActivity";
import { computeAssignmentAttention } from "@/lib/scheduling/assignmentAttention";
import { buildAssignmentRosterReadModel } from "@/lib/scheduling/roster/buildAssignmentRosterReadModel";
import { loadOrgAssignmentTypes } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";
import { listOperationalCalculationDefinitions } from "@/lib/operationalCalculations";
import { readLocationSchedulingConfig } from "@/lib/locations/locationSchedulingConfig";
import {
    ORG_PROGRAM_CATEGORY_LABELS,
    type OrgProgramCategoryKey,
} from "@/lib/orchestration/placement/orgProgramCategory";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Operator-facing age-group label — never echo raw keys like `pre_k`. */
function resolveAgeGroupOperatorLabel(raw: string | null | undefined): string | null {
    const k = (raw ?? "").trim().toLowerCase();
    if (!k) return null;
    if (k in ORG_PROGRAM_CATEGORY_LABELS) {
        return ORG_PROGRAM_CATEGORY_LABELS[k as OrgProgramCategoryKey];
    }
    // Already human (e.g. "Infant") — allow; snake_case keys without a label are omitted.
    if (/^[a-z]+(?:_[a-z0-9]+)+$/.test(k)) return null;
    return raw!.trim();
}

function addDaysYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

/** Monday (operating week start) of the week containing `ymd`. */
function mondayYmd(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
    return addDaysYmd(ymd, -((wd + 6) % 7));
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtMonthDay(ymd: string): string {
    const [, m, d] = ymd.split("-").map(Number);
    if (!m || !d) return ymd;
    return `${MONTH_SHORT[m - 1]} ${d}`;
}

type RosterTone = "pine" | "gold" | "ember";

/**
 * Map the raw roster read-model to the surface's presentation shape. Tone / health /
 * label decisions are presentation-only and live here, never in the read-model.
 */
function presentRoster(model: RosterReadModel) {
    const days = model.days.map((d) => ({
        key: String(d.weekday),
        label: DAY_SHORT[d.weekday],
        isToday: d.date === model.todayYmd,
    }));

    const rooms = model.rooms.map((room) => {
        let anyBreach = false;
        let anyTight = false;
        let breachDay: number | null = null;

        const cells = room.cells.map((cell) => {
            const breach = cell.capacityExceeded || cell.ratioBreach;
            const pct = cell.capacity != null && cell.capacity > 0 ? Math.round((cell.occupancy / cell.capacity) * 100) : 0;
            const tight = !breach && pct >= 85;
            if (breach) {
                anyBreach = true;
                if (breachDay == null) breachDay = cell.weekday;
            }
            if (tight) anyTight = true;
            const tone: RosterTone = breach ? "ember" : tight ? "gold" : "pine";
            const committed = cell.occupancy ?? 0;
            const planned = cell.plannedOccupancy ?? 0;
            const projected = committed + planned;
            const ratioLabel =
                cell.requiredStaff != null
                    ? `${cell.requiredStaff} staff required`
                    : cell.capacity != null
                        ? `${projected} / ${cell.capacity} projected`
                        : "Capacity unavailable";
            return {
                dayKey: String(cell.weekday),
                dayLabel: DAY_SHORT[cell.weekday],
                occupancy: cell.occupancy,
                planned: cell.plannedOccupancy,
                projected,
                capacity: cell.capacity,
                requiredStaff: cell.requiredStaff,
                pct,
                ratioLabel,
                tone,
                state: breach ? ("breach" as const) : undefined,
                isToday: cell.date === model.todayYmd,
                evaluated: cell.capacity != null || cell.requiredStaff != null,
            };
        });

        const anyEvaluated = cells.some((c) => c.evaluated);
        const healthTone: RosterTone = anyBreach ? "ember" : anyTight ? "gold" : "pine";

        const metaParts: string[] = [];
        const groupHint = resolveAgeGroupOperatorLabel(room.ageGroupCompat) ?? room.ageBandLabel;
        if (groupHint) metaParts.push(groupHint);
        if (room.capacity != null) metaParts.push(`holds ${room.capacity}`);

        return {
            roomId: room.roomId,
            roomName: room.roomName,
            meta: metaParts.join(" · "),
            health: {
                tone: healthTone,
                // Never show Healthy unless capacity/staff was evaluated.
                // When unevaluated, omit a false "Capacity unavailable" pill — leave quiet.
                label: anyBreach
                    ? `Over${breachDay != null ? ` ${DAY_SHORT[breachDay]}` : ""}`
                    : !anyEvaluated
                      ? ""
                      : anyTight
                        ? "Tight"
                        : "Healthy",
            },
            cells,
        };
    });

    const isCurrentWeek = model.weekStart === mondayYmd(model.todayYmd);
    const weekLabel = isCurrentWeek ? "This week" : `${fmtMonthDay(model.weekStart)}–${fmtMonthDay(model.weekEnd)}`;

    return { weekStart: model.weekStart, weekEnd: model.weekEnd, weekLabel, days, rooms };
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

/** Normalize the builder's daily-hours payload for the schedule draft (default + per-day). */
function normalizeDraftTimes(raw: unknown): { default: { arrive: string; depart: string } | null; perDay: Record<string, { arrive: string; depart: string }> } | null {
    if (!raw || typeof raw !== "object") return null;
    const src = raw as Record<string, unknown>;
    const def = normRange(src.default);
    const perDay: Record<string, { arrive: string; depart: string }> = {};
    const perDaySrc = src.perDay && typeof src.perDay === "object" ? (src.perDay as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(perDaySrc)) {
        if (!/^[0-6]$/.test(k)) continue;
        const r = normRange(v);
        if (r) perDay[k] = r;
    }
    if (!def && Object.keys(perDay).length === 0) return null;
    return { default: def, perDay };
}



/**
 * Resolve the child's program category id: an operational placement first, else the
 * pre-enrolled desired program from the child's enrollment participation
 * (`process_instances.metadata.program_category_id`) — the canonical owner, not OCM.
 * Shared by the billing preview and the placement-options recommendation (so the
 * recommended room can weigh program/age eligibility, not headroom alone).
 */
async function resolveChildProgramCategoryId(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    customerMemberId: string
): Promise<string> {
    if (!customerMemberId) return "";
    const { data: pl } = await supabase
        .from("child_placements")
        .select("program_category_id")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
        .in("status", ["planned", "active", "ending"])
        .maybeSingle();
    const placed = (pl as { program_category_id?: string | null } | null)?.program_category_id ?? "";
    if (placed) return placed;
    // Pre-enrolled: read the desired program from the child's enrollment participation.
    const { data: pi } = await supabase
        .from("process_instances")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_id", customerMemberId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    const meta = (pi as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const desired = (meta as { program_category_id?: string | null }).program_category_id;
    return typeof desired === "string" ? desired : "";
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
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const startsThisWeek = await detectStartsInWindow(
                supabase,
                ctx.orgId,
                siteLocationId,
                mondayYmd(todayYmd),
                addDaysYmd(mondayYmd(todayYmd), 6)
            );
            const activity = await computeTodayActivity(supabase, ctx.orgId, siteLocationId, todayYmd);
            const assignmentAttention = await computeAssignmentAttention(
                supabase,
                ctx.orgId,
                siteLocationId,
                todayYmd,
                unplaced.length
            );
            return NextResponse.json({
                view,
                siteLocationId,
                unplaced,
                startsThisWeek,
                activity,
                assignmentAttention,
            });
        }

        if (view === "roster") {
            const siteLocationId = param(request, "site_location_id");
            if (!siteLocationId) {
                return NextResponse.json({ error: "site_location_id is required", code: "invalid_input" }, { status: 400 });
            }
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const weekOf = param(request, "week_of") && ISO_DATE_RE.test(param(request, "week_of"))
                ? param(request, "week_of")
                : todayYmd;
            const model = await buildRosterReadModel(supabase, {
                orgId: ctx.orgId,
                siteLocationId,
                weekOf,
                todayYmd,
            });
            return NextResponse.json({ view, roster: presentRoster(model) });
        }

        if (view === "assignment_roster") {
            const siteLocationId = param(request, "site_location_id");
            if (!siteLocationId) {
                return NextResponse.json({ error: "site_location_id is required", code: "invalid_input" }, { status: 400 });
            }
            const access = await getAdminAccessContextCached();
            const documentActor = documentActorFromAdminParts({
                ok: true,
                userId: ctx.userId,
                orgId: ctx.orgId,
                role: ctx.role,
                roleKeys: access.ok ? access.roleKeys : [],
                permissionKeys: access.ok ? access.permissionKeys : [],
            });
            const model = await buildAssignmentRosterReadModel(
                supabase,
                ctx.orgId,
                siteLocationId,
                documentActor,
            );
            return NextResponse.json({
                view,
                siteLocationId,
                subjects: model.subjects,
                totalAssignments: model.totalAssignments,
                staffReady: model.staffReady,
            });
        }

        if (view === "assignment_types") {
            const assignmentTypes = await loadOrgAssignmentTypes(supabase, ctx.orgId);
            return NextResponse.json({ view, assignmentTypes });
        }

        if (view === "studio_config") {
            // Option data the Studio pattern editor needs: the site's operating days,
            // schedule (day) types, and programs. Read-only config resolution — the same
            // config the Locations Schedule tab administers, surfaced for in-place editing.
            const siteLocationId = param(request, "site_location_id");
            if (!siteLocationId) {
                return NextResponse.json({ error: "site_location_id is required", code: "invalid_input" }, { status: 400 });
            }
            const { data: siteRow } = await supabase
                .from("locations")
                .select("metadata")
                .eq("org_id", ctx.orgId)
                .eq("id", siteLocationId)
                .maybeSingle();
            const cfg = readLocationSchedulingConfig((siteRow as { metadata?: Record<string, unknown> } | null)?.metadata ?? null);
            const scheduleTypes = cfg.scheduleTypes
                .filter((t) => t.isActive)
                .map((t) => ({ key: t.key, label: t.label, behavior: t.behavior }));
            const { data: programRows } = await supabase
                .from("location_program_categories")
                .select("key, label, is_active, sort_order")
                .eq("org_id", ctx.orgId)
                .eq("location_id", siteLocationId)
                .order("sort_order");
            const programs = ((programRows ?? []) as { key: string; label: string | null; is_active: boolean }[])
                .filter((p) => p.is_active)
                .map((p) => ({ key: p.key, label: p.label?.trim() || p.key }));
            const { loadSiteOperationalRooms } = await import(
                "@/lib/operationalAssignments/loadSiteOperationalRooms"
            );
            const operationalRooms = await loadSiteOperationalRooms(supabase, ctx.orgId, siteLocationId).catch(
                () => []
            );
            return NextResponse.json({
                view,
                config: {
                    operatingDays: cfg.operatingDays,
                    scheduleTypes,
                    programs,
                    operationalRooms,
                },
            });
        }

        if (view === "calculations") {
            // Read-only: the Scheduling Workspace CONSUMES the Operational Calculations
            // registry — it never owns or mutates it. Studio surfaces this catalogue so
            // operators can see which governed calculations power the workspace.
            const calculations = listOperationalCalculationDefinitions().map((d) => ({
                key: d.key,
                family: d.family,
                purpose: d.purpose,
                resultKind: d.resultKind,
                status: d.status,
                logicOwner: d.logicOwner,
                consumers: d.consumers,
                expectationBindable: d.expectationBindable,
            }));
            return NextResponse.json({ view, calculations });
        }

        if (view === "options") {
            const siteLocationId = param(request, "site_location_id");
            const childAgreementId = param(request, "child_agreement_id");
            const patternId = param(request, "pattern_id");
            if (!siteLocationId || !childAgreementId || !patternId) {
                return NextResponse.json(
                    { error: "site_location_id, child_agreement_id, and pattern_id are required", code: "invalid_input" },
                    { status: 400 }
                );
            }
            // Resolve the child's program category so the recommendation can weigh
            // program/age eligibility — not just operational headroom.
            const programCategoryId =
                (param(request, "program_category_id") ||
                    (await resolveChildProgramCategoryId(supabase, ctx.orgId, childAgreementId))) ||
                null;
            let dateStart = param(request, "start_date");
            if (!dateStart) dateStart = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            if (!ISO_DATE_RE.test(dateStart)) {
                return NextResponse.json({ error: "start_date must be YYYY-MM-DD", code: "invalid_input" }, { status: 400 });
            }
            const dateEnd = addDaysYmd(dateStart, 6);
            const { options, fitContext } = await generatePlacementOptions(supabase, {
                orgId: ctx.orgId,
                siteLocationId,
                childAgreementId,
                programCategoryId,
                patternId,
                dateStart,
                dateEnd,
            });
            // Echo the resolved program category back so clients that pass none can
            // adopt the server-resolved value for subsequent client-side room filtering
            // (e.g. re-filtering after a Category change without a full refetch).
            return NextResponse.json({
                view,
                options,
                fitContext,
                range: { dateStart, dateEnd },
                programCategoryId,
            });
        }

        if (view === "projection") {
            const customerMemberId = param(request, "customer_member_id");
            const subjectName = param(request, "subject_name") || "Child";
            // Site comes from the operational subject: an explicit site_location_id, else
            // resolved from the lead/opportunity (opportunities.location_id).
            let siteLocationId = param(request, "site_location_id");
            if (!siteLocationId) {
                const opportunityId = param(request, "opportunity_id");
                if (opportunityId) {
                    const { data: opp } = await supabase
                        .from("opportunities")
                        .select("location_id")
                        .eq("org_id", ctx.orgId)
                        .eq("id", opportunityId)
                        .maybeSingle();
                    siteLocationId = (opp as { location_id?: string | null } | null)?.location_id ?? "";
                }
            }
            if (!customerMemberId || !siteLocationId) {
                return NextResponse.json(
                    { error: "customer_member_id and a resolvable site are required", code: "invalid_input" },
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
                programCategoryId = await resolveChildProgramCategoryId(supabase, ctx.orgId, customerMemberId);
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
            // Pre-enrolled child → record the PROPOSED schedule as DRAFT participation on the
            // child's enrollment process instance — the canonical runtime owner of child
            // participation (process_instances.metadata). NOT an operational placement; it
            // materializes when the child enrolls (Enrollment is the boundary). Never OCM:
            // Scheduling consumes the participation model through the existing platform service,
            // it does not create or manage participation (see the OCM removal plan).
            const scheduleType = await resolveScheduleTypeForPattern(
                supabase,
                ctx.orgId,
                String(body.schedule_pattern_id ?? "").trim()
            );
            const weekdays = Array.isArray(body.weekdays)
                ? (body.weekdays as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
                : null;
            const edit = await applyChildParticipationEdit(supabase, {
                orgId: ctx.orgId,
                customerMemberId,
                opportunityId: String(body.opportunity_id ?? "").trim() || null,
                patch: {
                    schedule_type: scheduleType,
                    program_room_cohort_key: String(body.room_location_id ?? "").trim() || null,
                    start_date: String(body.start_date ?? "").trim() || null,
                    end_date: String(body.end_date ?? "").trim() || null,
                    location_id: siteLocationId || null,
                    weekdays: weekdays && weekdays.length ? weekdays : null,
                    scheduleTimes: normalizeDraftTimes(body.times),
                },
                actorUserId: ctx.userId,
            });
            if (!edit.ok) {
                // The child has no enrollment participation object yet — a PLATFORM gap
                // (some lead-creation paths don't create the process instance), not something
                // Scheduling should paper over by minting a legacy record.
                const message =
                    edit.error === "no_enrollment_process_instance"
                        ? "This child isn't in the enrollment process yet, so a proposed schedule can't be saved."
                        : edit.error ?? "Could not save the proposed schedule.";
                return NextResponse.json(
                    { error: message, code: edit.error === "no_enrollment_process_instance" ? "no_participation" : "propose_failed" },
                    { status: edit.error === "no_enrollment_process_instance" ? 409 : 400 }
                );
            }
            return NextResponse.json({
                ok: true,
                proposed: true,
                routed: edit.routed,
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

/** Resolve a pattern's `schedule_type_key` (the schedule type the proposed schedule sets). */
async function resolveScheduleTypeForPattern(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    schedulePatternId: string
): Promise<string | null> {
    if (!schedulePatternId) return null;
    const { data } = await supabase
        .from("schedule_patterns")
        .select("schedule_type_key")
        .eq("org_id", orgId)
        .eq("id", schedulePatternId)
        .maybeSingle();
    return (data as { schedule_type_key?: string | null } | null)?.schedule_type_key ?? null;
}
