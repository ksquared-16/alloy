/**
 * Builds the canonical Scheduling projection (child index) — the by-child view
 * of `docs/platform/planning/scheduling-projection-contract.md`.
 *
 * Split, following `operationalEnrollmentReadModel.ts`:
 *   - a PURE stitch (`buildChildScheduling` / `buildSchedulingProjectionForChild`)
 *     that resolves lifecycle buckets from already-loaded rows — unit-testable,
 *     no DB, no `Date.now` (the clock is injected via `asOf` / `computedAt`); and
 *   - a THIN I/O loader (`loadSchedulingProjectionForChild`) that fetches the
 *     canonical rows and delegates to the pure stitch.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OPERATIONAL_AGREEMENT_STATUSES } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    getOperationalAgreementForMemberSite,
    getAgreementById,
} from "@/lib/childcareOperational/enrollmentAgreementService";
import { listChildPlacements } from "@/lib/childcareOperational/childPlacementService";
import { listScheduleAssignments } from "@/lib/childcareOperational/scheduleAssignmentService";
import {
    isScheduleAssignmentTerminalStatus,
    isAgreementTerminalStatus,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";
import type {
    ChildEnrollmentAgreementRow,
    ChildPlacementRow,
    ProgramCategoryLabelRow,
    ScheduleAssignmentRow,
    SchedulePatternRow,
} from "@/lib/childcareOperational/enrollmentOperationalTypes";
import { compareIsoDates } from "@/lib/childcareOperational/effectiveDating";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { PROPOSED_DRAFT_ASSIGNMENT_ID_PREFIX } from "@/lib/scheduling/projection/proposedDraftAssignmentId";
import type {
    Assignment,
    AssignmentRoom,
    AssignmentTypePresentation,
    ChildScheduling,
    ChildSchedulingStatus,
    ChildSchedulingSubject,
    ScheduleHistoryEntry,
    ScheduleView,
    SchedulingCalculationMeta,
    SchedulingProjection,
} from "@/lib/scheduling/projection/schedulingProjectionTypes";
import { readPatternDefaultHours } from "@/lib/scheduling/editorPatterns";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatWeekdays(weekdays: number[]): string {
    return weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_NAMES[d] ?? String(d))
        .join(", ");
}

const EMPTY_TYPE: AssignmentTypePresentation = {
    id: null,
    key: null,
    label: null,
    iconKey: null,
    visualTone: null,
    billingParticipation: null,
    attendanceParticipation: null,
    staffingParticipation: null,
};

function billingFromType(type: AssignmentTypePresentation): Assignment["billing"] {
    const participation = type.billingParticipation === "eligible" ? "eligible" : "none";
    if (participation === "none") {
        return { participation: "none", label: "No billing" };
    }
    const label =
        type.key === "primary_classroom" || type.label?.toLowerCase().includes("primary")
            ? "Tuition"
            : "Recurring billing eligible";
    return { participation: "eligible", label };
}

// ---------------------------------------------------------------------------
// Pure stitch
// ---------------------------------------------------------------------------

/** One assignment row paired with the resolved pattern + room + type (already loaded). */
export type AssignmentInput = {
    row: ScheduleAssignmentRow;
    weekdays: number[];
    patternResolved: boolean;
    patternLabel: string | null;
    arriveTime: string | null;
    departTime: string | null;
    room: AssignmentRoom;
    assignmentType: AssignmentTypePresentation;
};

export type PureChildSchedulingInput = {
    subject: ChildSchedulingSubject;
    agreementStatus: string | null; // null => no operational agreement
    enrollmentAgreementId?: string | null;
    assignments: AssignmentInput[];
    asOf: string; // YYYY-MM-DD
    /** A pre-enrollment proposed draft (already resolved from participation), or null. */
    proposed?: ScheduleView | null;
};

function mapAssignment(input: AssignmentInput): Assignment {
    const { row, weekdays, room, assignmentType, patternLabel, arriveTime, departTime } = input;
    const openEnded = !row.end_date;
    const subjectType = row.subject_type === "staff" ? "staff" : "child";
    const subjectId =
        subjectType === "staff"
            ? row.subject_person_id ?? ""
            : row.customer_member_id ?? "";
    return {
        id: row.id,
        subjectId,
        subjectType,
        childId: row.customer_member_id ?? subjectId,
        room,
        weekdays,
        arriveTime,
        departTime,
        effectiveFrom: row.start_date,
        effectiveTo: row.end_date ?? null,
        openEnded,
        kind: row.assignment_kind === "temporary" ? "temporary" : "base",
        status: row.status,
        isPrimary: row.is_primary === true,
        commitmentKind: row.commitment_kind === "proposed" ? "proposed" : "committed",
        assignmentType,
        patternId: row.schedule_pattern_id ?? null,
        patternLabel,
        billing: billingFromType(assignmentType),
        supersedes: row.supersedes_assignment_id ?? undefined,
    };
}

type Bucket = "current" | "upcoming" | "temporary" | "history";

function bucketFor(row: ScheduleAssignmentRow, asOf: string): Bucket {
    if (isScheduleAssignmentTerminalStatus(row.status)) return "history";
    if (row.end_date && compareIsoDates(row.end_date, asOf) < 0) return "history";
    if (row.assignment_kind === "temporary") return "temporary";
    if (compareIsoDates(row.start_date, asOf) > 0) return "upcoming";
    return "current";
}

function scheduleViewFrom(
    bucket: ScheduleView["bucket"],
    assignments: Assignment[],
    temporary: boolean
): ScheduleView {
    const effectiveFrom = assignments
        .map((a) => a.effectiveFrom)
        .sort((a, b) => compareIsoDates(a, b))[0]!;
    const anyOpenEnded = assignments.some((a) => a.openEnded);
    const effectiveTo = anyOpenEnded
        ? null
        : assignments
              .map((a) => a.effectiveTo)
              .filter((d): d is string => d != null)
              .sort((a, b) => compareIsoDates(b, a))[0] ?? null;
    return {
        bucket,
        effectiveFrom,
        effectiveTo,
        openEnded: anyOpenEnded,
        temporary,
        assignments,
        rate: "pending",
        projectedTuition: null,
    };
}

function historyEntry(a: Assignment): ScheduleHistoryEntry {
    const days = formatWeekdays(a.weekdays);
    const typeOrRoom = a.assignmentType.label ?? a.room.name ?? "Assignment";
    const primary = a.isPrimary ? "Primary · " : "";
    return {
        effectiveFrom: a.effectiveFrom,
        effectiveTo: a.effectiveTo,
        summary: days ? `${primary}${typeOrRoom} · ${days}` : `${primary}${typeOrRoom}`,
    };
}

function resolveStatus(
    agreementStatus: string | null,
    hasCurrent: boolean,
    hasUpcoming: boolean,
    hasProposed: boolean
): ChildSchedulingStatus {
    if (agreementStatus != null && isAgreementTerminalStatus(agreementStatus)) return "ended";
    if (hasCurrent) return "scheduled";
    if (hasUpcoming) return "upcoming-only";
    // A pre-enrollment proposed draft ranks above "needs a schedule".
    if (hasProposed) return "proposed";
    return "needs-placement";
}

/** Pure: resolve one child's scheduling projection from already-loaded rows. */
export function buildChildScheduling(input: PureChildSchedulingInput): ChildScheduling {
    const currentAssignments: Assignment[] = [];
    const proposedAssignments: Assignment[] = [];
    const upcomingByStart = new Map<string, Assignment[]>();
    const temporaryViews: ScheduleView[] = [];
    const historyEntries: ScheduleHistoryEntry[] = [];
    const partialReasons = new Set<string>();

    for (const item of input.assignments) {
        const assignment = mapAssignment(item);
        if (!item.patternResolved) partialReasons.add("schedule pattern unresolved");
        // Proposed (planning) rows never become committed current/upcoming truth.
        if (assignment.commitmentKind === "proposed") {
            if (!isScheduleAssignmentTerminalStatus(item.row.status)) {
                proposedAssignments.push(assignment);
                if (!assignment.room.id) partialReasons.add("room unresolved");
            } else {
                historyEntries.push(historyEntry(assignment));
            }
            continue;
        }
        const bucket = bucketFor(item.row, input.asOf);
        switch (bucket) {
            case "current":
                currentAssignments.push(assignment);
                if (!assignment.room.id) partialReasons.add("room unresolved");
                break;
            case "upcoming": {
                const key = assignment.effectiveFrom;
                const group = upcomingByStart.get(key) ?? [];
                group.push(assignment);
                upcomingByStart.set(key, group);
                break;
            }
            case "temporary":
                temporaryViews.push(scheduleViewFrom("temporary", [assignment], true));
                break;
            case "history":
                historyEntries.push(historyEntry(assignment));
                break;
        }
    }

    const current =
        currentAssignments.length > 0
            ? scheduleViewFrom(
                  "current",
                  [...currentAssignments].sort((a, b) => {
                      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
                      const at = a.arriveTime ?? "99:99";
                      const bt = b.arriveTime ?? "99:99";
                      return at.localeCompare(bt);
                  }),
                  false
              )
            : null;

    const upcoming: ScheduleView[] = [...upcomingByStart.entries()]
        .sort(([a], [b]) => compareIsoDates(a, b))
        .map(([, group]) => scheduleViewFrom("upcoming", group, false));

    historyEntries.sort((a, b) => compareIsoDates(b.effectiveFrom, a.effectiveFrom));

    // Ledger proposed rows win over participation-metadata draft when present.
    // Proposed still surfaces alongside committed current (planning vs truth).
    const proposedFromRows =
        proposedAssignments.length > 0
            ? scheduleViewFrom(
                  "current",
                  [...proposedAssignments].sort((a, b) => {
                      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
                      const at = a.arriveTime ?? "99:99";
                      const bt = b.arriveTime ?? "99:99";
                      return at.localeCompare(bt);
                  }),
                  false
              )
            : null;
    const proposed = proposedFromRows ?? (current == null ? input.proposed ?? null : null);

    const status = resolveStatus(
        input.agreementStatus,
        current != null,
        upcoming.length > 0,
        proposed != null
    );

    return {
        child: input.subject,
        status,
        enrollmentAgreementId: input.enrollmentAgreementId ?? null,
        current,
        proposed,
        upcoming,
        temporary: temporaryViews,
        history: historyEntries,
        availableCommands: [], // attached by the API composition layer (Action Runtime)
    };
}

export function buildSchedulingProjectionForChild(
    child: ChildScheduling,
    asOf: string,
    computedAt: string
): SchedulingProjection {
    const partialReasons = new Set<string>();
    // completeness is derived from the child's resolved views
    const views = [child.current, ...child.upcoming, ...child.temporary].filter(
        (v): v is ScheduleView => v != null
    );
    for (const v of views) {
        for (const a of v.assignments) {
            if (!a.room.id) partialReasons.add("room unresolved");
            if (a.weekdays.length === 0) partialReasons.add("schedule pattern unresolved");
        }
    }
    const meta: SchedulingCalculationMeta = {
        computedAt,
        freshness: "fresh",
        inputVersions: {},
        completeness: partialReasons.size > 0 ? "partial" : "complete",
        partialReasons: [...partialReasons],
    };
    return {
        subject: { type: "child", id: child.child.id, name: child.child.name },
        asOf,
        children: [child],
        calculationMeta: meta,
    };
}

// ---------------------------------------------------------------------------
// Thin I/O
// ---------------------------------------------------------------------------

async function resolveLocationLabel(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string | null | undefined
): Promise<string | null> {
    if (!locationId) return null;
    const { data } = await supabase
        .from("locations")
        .select("label")
        .eq("org_id", orgId)
        .eq("id", locationId)
        .maybeSingle();
    const label = (data as { label?: string | null } | null)?.label;
    return label != null ? String(label).trim() || null : null;
}

async function resolveProgramLabel(
    supabase: SupabaseClient,
    orgId: string,
    programCategoryId: string | null | undefined
): Promise<string | null> {
    if (!programCategoryId) return null;
    const { data } = await supabase
        .from("location_program_categories")
        .select("label, key")
        .eq("org_id", orgId)
        .eq("id", programCategoryId)
        .maybeSingle();
    if (!data) return null;
    const row = data as ProgramCategoryLabelRow;
    return row.label?.trim() || row.key?.trim() || null;
}

type ProposedDraftMeta = {
    schedule_type?: string | null;
    program_room_cohort_key?: string | null;
    program_category_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    weekdays?: number[] | null;
    scheduleTimes?: { default?: { arrive?: string; depart?: string } | null } | null;
};

/**
 * Build the PROPOSED schedule view from the child's enrollment participation draft
 * (`process_instances.metadata`) — the pre-enrollment schedule, with resolved labels.
 * Returns null when the participation has no schedule facts drafted yet.
 */
async function loadProposedDraftForChild(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    siteLocationId: string,
    resolveRoom: (id: string | null) => Promise<string | null>,
    resolveProgram: (id: string | null) => Promise<string | null>
): Promise<ScheduleView | null> {
    const { data: pi } = await supabase
        .from("process_instances")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("process_key", "enrollment")
        .eq("subject_id", customerMemberId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    const meta = ((pi as { metadata?: ProposedDraftMeta } | null)?.metadata ?? {}) as ProposedDraftMeta;
    const scheduleType = meta.schedule_type?.trim() || null;
    const roomId = meta.program_room_cohort_key?.trim() || null;
    const startDate = meta.start_date?.trim() || null;
    // No schedule facts drafted → no proposed schedule.
    if (!scheduleType && !roomId && !startDate) return null;

    // Resolve the pattern for this schedule type at the site → default weekdays + label.
    let weekdays: number[] = Array.isArray(meta.weekdays) ? meta.weekdays : [];
    let scheduleTypeLabel: string | null = null;
    if (scheduleType) {
        const { data: pat } = await supabase
            .from("schedule_patterns")
            .select("weekdays, label, schedule_type_key")
            .eq("org_id", orgId)
            .eq("site_location_id", siteLocationId)
            .eq("schedule_type_key", scheduleType)
            .eq("is_active", true)
            .order("sort_order")
            .limit(1)
            .maybeSingle();
        const row = pat as { weekdays?: number[]; label?: string | null } | null;
        // The operator's saved weekdays win; the pattern is only the fallback template.
        if (weekdays.length === 0) weekdays = row?.weekdays ?? [];
        scheduleTypeLabel = row?.label?.trim() || null;
    }

    const arrive = meta.scheduleTimes?.default?.arrive ?? null;
    const depart = meta.scheduleTimes?.default?.depart ?? null;
    const effectiveFrom = startDate ?? "";
    const assignment: Assignment = {
        id: `${PROPOSED_DRAFT_ASSIGNMENT_ID_PREFIX}${customerMemberId}`,
        subjectId: customerMemberId,
        subjectType: "child",
        childId: customerMemberId,
        room: { id: roomId, name: await resolveRoom(roomId), program: await resolveProgram(meta.program_category_id ?? null) },
        weekdays,
        arriveTime: arrive,
        departTime: depart,
        effectiveFrom,
        effectiveTo: meta.end_date?.trim() || null,
        openEnded: !meta.end_date,
        kind: "base",
        status: "proposed",
        isPrimary: true,
        commitmentKind: "proposed",
        assignmentType: {
            ...EMPTY_TYPE,
            key: scheduleType,
            label: scheduleTypeLabel,
        },
        patternId: null,
        patternLabel: scheduleTypeLabel,
        billing: billingFromType({
            ...EMPTY_TYPE,
            key: scheduleType,
            label: scheduleTypeLabel,
            billingParticipation: "eligible",
        }),
    };
    return {
        bucket: "current",
        effectiveFrom,
        effectiveTo: assignment.effectiveTo,
        openEnded: assignment.openEnded,
        temporary: false,
        assignments: [assignment],
        scheduleType,
        scheduleTypeLabel,
        rate: "pending",
        projectedTuition: null,
    };
}

async function loadPatterns(
    supabase: SupabaseClient,
    orgId: string,
    patternIds: string[]
): Promise<Map<string, SchedulePatternRow>> {
    const map = new Map<string, SchedulePatternRow>();
    const distinct = [...new Set(patternIds.filter(Boolean))];
    if (distinct.length === 0) return map;
    const { data, error } = await supabase
        .from("schedule_patterns")
        .select("*")
        .eq("org_id", orgId)
        .in("id", distinct);
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    for (const row of (data ?? []) as SchedulePatternRow[]) map.set(row.id, row);
    return map;
}

type AssignmentTypeRow = {
    id: string;
    key: string;
    label: string;
    icon_key: string | null;
    visual_tone: AssignmentTypePresentation["visualTone"];
    billing_participation: AssignmentTypePresentation["billingParticipation"];
    attendance_participation: AssignmentTypePresentation["attendanceParticipation"];
    staffing_participation: AssignmentTypePresentation["staffingParticipation"];
};

async function loadAssignmentTypes(
    supabase: SupabaseClient,
    orgId: string,
    typeIds: string[]
): Promise<Map<string, AssignmentTypePresentation>> {
    const map = new Map<string, AssignmentTypePresentation>();
    const distinct = [...new Set(typeIds.filter(Boolean))];
    if (distinct.length === 0) return map;
    const { data, error } = await supabase
        .from("operational_assignment_types")
        .select(
            "id, key, label, icon_key, visual_tone, billing_participation, attendance_participation, staffing_participation"
        )
        .eq("org_id", orgId)
        .in("id", distinct);
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    for (const raw of (data ?? []) as AssignmentTypeRow[]) {
        map.set(raw.id, {
            id: raw.id,
            key: raw.key,
            label: raw.label,
            iconKey: raw.icon_key,
            visualTone: raw.visual_tone,
            billingParticipation: raw.billing_participation,
            attendanceParticipation: raw.attendance_participation,
            staffingParticipation: raw.staffing_participation,
        });
    }
    return map;
}

/** Choose the placement whose effective window covers the assignment start. */
function placementForAssignment(
    placements: ChildPlacementRow[],
    assignment: ScheduleAssignmentRow
): ChildPlacementRow | null {
    const covering = placements.find((p) => {
        const startsOnOrBefore = compareIsoDates(p.start_date, assignment.start_date) <= 0;
        const endsOnOrAfter =
            !p.end_date || compareIsoDates(p.end_date, assignment.start_date) >= 0;
        return startsOnOrBefore && endsOnOrAfter;
    });
    return covering ?? placements[0] ?? null;
}

export type LoadSchedulingProjectionParams = {
    customerMemberId: string;
    siteLocationId: string;
    todayYmd: string; // resolution date (org-local today)
    computedAt: string; // ISO instant
    subjectName: string;
    ageGroup?: string | null;
    /**
     * Pre-resolved site label. The site is opportunity-level, so a household caller
     * (first-paint) resolves it ONCE and passes it here — avoiding an identical
     * `locations` lookup per child. Absent → resolved locally (single-child callers).
     */
    siteName?: string | null;
};

/** Thin I/O: load canonical rows for one child + delegate to the pure stitch. */
/**
 * Single-child API — DELEGATES to the plural owner with a one-item set.
 *
 * There is one scheduling implementation, not two. This exists because callers that genuinely have
 * one child should not have to build a set, and because every existing caller keeps working; it adds
 * no behaviour of its own.
 *
 * A child with no schedulable truth yields a projection with no children, which is what this path
 * has always returned for that case.
 */
export async function loadSchedulingProjectionForChild(
    supabase: SupabaseClient,
    orgId: string,
    params: LoadSchedulingProjectionParams
): Promise<SchedulingProjection> {
    const byMember = await loadSchedulingProjectionsForChildren(supabase, orgId, {
        children: [
            {
                customerMemberId: params.customerMemberId,
                subjectName: params.subjectName,
                ageGroup: params.ageGroup ?? null,
            },
        ],
        siteLocationId: params.siteLocationId,
        todayYmd: params.todayYmd,
        computedAt: params.computedAt,
        siteName: params.siteName,
    });
    const projection = byMember.get(params.customerMemberId.trim());
    if (!projection) {
        // Unreachable for any non-empty member id: the plural owner sets an entry for every child it
        // was asked about. Kept as an explicit failure rather than a fabricated empty projection,
        // because an invented one would report "nothing scheduled" for a child nobody looked at.
        throw new OperationalEnrollmentServiceError(
            "db_error",
            "scheduling projection missing for the requested child"
        );
    }
    return projection;
}

export type LoadStaffSchedulingProjectionParams = {
    /** `persons.id` — a staff subject's identity of record. */
    personId: string;
    siteLocationId: string;
    todayYmd: string;
    computedAt: string;
    subjectName: string;
    /** Pre-resolved site label, as for the child loader. Absent → resolved locally. */
    siteName?: string | null;
};

/**
 * Thin I/O: load canonical rows for one STAFF subject + delegate to the SAME pure stitch.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──
 *
 * No enrollment agreement, no `child_placements`, and no participation draft. Those are not
 * omissions to be filled in later — they are child concepts:
 *
 *   · an agreement is the commercial instrument behind a child's commitment, and a staff member's
 *     commitment rests on EMPLOYMENT, which `assertStaffPersonEligibleForAssignment` already
 *     answers at write time;
 *   · a placement is a child's room occupancy record;
 *   · a proposed draft lives on an enrollment participation, and `resolveSubjectSite` returns
 *     `commitmentKind: "committed"` for every staff subject — a staff assignment is never proposed,
 *     so there is no draft state to project.
 *
 * Reading them anyway would return empty results that read as "this staff member has no agreement",
 * which is a claim about a relationship that does not exist rather than an absence of data.
 *
 * Everything that IS shared — bucketing, effective dating, room/program label resolution, pattern
 * and type stitching — runs through `buildChildScheduling` unchanged, because that logic was never
 * about children. If a staff schedule ever bucketed differently from a child's, the operating day
 * would be assembled from two disagreeing definitions of "current".
 */
export async function loadSchedulingProjectionForStaff(
    supabase: SupabaseClient,
    orgId: string,
    params: LoadStaffSchedulingProjectionParams
): Promise<SchedulingProjection> {
    const { personId, siteLocationId, todayYmd, computedAt } = params;

    const siteName =
        params.siteName !== undefined ? params.siteName : await resolveLocationLabel(supabase, orgId, siteLocationId);

    const roomLabelCache = new Map<string, string | null>();
    const programLabelCache = new Map<string, string | null>();
    async function roomLabel(id: string | null): Promise<string | null> {
        if (!id) return null;
        if (!roomLabelCache.has(id)) roomLabelCache.set(id, await resolveLocationLabel(supabase, orgId, id));
        return roomLabelCache.get(id) ?? null;
    }
    async function programLabel(id: string | null): Promise<string | null> {
        if (!id) return null;
        if (!programLabelCache.has(id)) programLabelCache.set(id, await resolveProgramLabel(supabase, orgId, id));
        return programLabelCache.get(id) ?? null;
    }

    // `subject_type` is carried EXPLICITLY alongside the person filter. A child with a linked person
    // would otherwise match this query, and the result would be a plausible wrong schedule.
    const assignmentRows = await listScheduleAssignments(supabase, orgId, {
        subjectPersonId: personId,
        subjectType: "staff",
    });

    // Same independence as the child loader above: both id sets come from `assignmentRows`. Not on
    // the drawer-VM critical path, so unmeasured here — corrected together because leaving one half
    // of an identical shape sequential is how the next reader learns the wrong lesson.
    const [patterns, assignmentTypes] = await Promise.all([
        loadPatterns(supabase, orgId, assignmentRows.map((a) => a.schedule_pattern_id)),
        loadAssignmentTypes(
            supabase,
            orgId,
            assignmentRows.map((a) => a.operational_assignment_type_id).filter((id): id is string => Boolean(id)),
        ),
    ]);

    const assignments: AssignmentInput[] = [];
    for (const row of assignmentRows) {
        const pattern = patterns.get(row.schedule_pattern_id) ?? null;
        const hours = readPatternDefaultHours(
            (pattern?.metadata ?? null) as Record<string, unknown> | null
        );
        // Assignment-owned room only. There is no placement fallback for staff, because a placement
        // is a child's occupancy record — a staff row states its own room or it has none.
        const roomId = row.room_location_id ?? null;
        const programId = row.program_category_id ?? null;
        const room: AssignmentRoom = {
            id: roomId,
            name: await roomLabel(roomId),
            program: await programLabel(programId),
        };
        const type =
            (row.operational_assignment_type_id
                ? assignmentTypes.get(row.operational_assignment_type_id)
                : null) ?? EMPTY_TYPE;
        assignments.push({
            row,
            weekdays: pattern?.weekdays ?? [],
            patternResolved: pattern != null,
            patternLabel: pattern?.label?.trim() || null,
            arriveTime: hours?.arrive ?? null,
            departTime: hours?.depart ?? null,
            room,
            assignmentType: type,
        });
    }

    const subject: ChildSchedulingSubject = {
        // The staff subject's identity of record is the PERSON. Carrying a member id here — even a
        // null one — would invite a consumer to address a staff write by the wrong column.
        id: personId,
        name: params.subjectName,
        // A staff member's program is the one their assignment names, if any. Never inferred from a
        // placement: they do not have one.
        program: await programLabel(assignmentRows.find((r) => r.program_category_id)?.program_category_id ?? null),
        ageGroup: null,
        siteId: siteLocationId,
        siteName,
    };

    const staffScheduling: ChildScheduling = {
        ...buildChildScheduling({
            subject,
            agreementStatus: null,
            enrollmentAgreementId: null,
            assignments,
            asOf: todayYmd,
        }),
        subjectType: "staff",
    };

    const projection = buildSchedulingProjectionForChild(staffScheduling, todayYmd, computedAt);
    return { ...projection, subject: { type: "staff", id: personId, name: params.subjectName } };
}

/** Re-export for callers that only have an agreement id. */
export async function agreementStatusById(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string
): Promise<string | null> {
    const agreement = await getAgreementById(supabase, orgId, agreementId);
    return agreement?.status ?? null;
}

// ---------------------------------------------------------------------------
// CANONICAL BULK SCHEDULING PROJECTION
//
// The drawer VM projects EVERY inquiry child on the case. Doing that one child at a time meant one
// three-hop chain each — agreement, then assignments and placements, then patterns and types — plus
// a proposed-draft branch with two more hops and its own label lookups. Per-child timing on the
// certification tenant: 17 children, a 239–316 ms leg, and 3,116–3,903 ms of CUMULATIVE database
// work. Concurrency hid the fan-out; it did not pay for it.
//
// Two memoization shapes were built and rejected on measurement first — a resolved-value cache
// recovered nothing (all seventeen children miss at the same instant) and an in-flight promise cache
// regressed the leg fourfold by making every child wait on whichever one claimed the shared ids.
// That is the evidence that this is not a caching problem: it is a fan-out problem, and the only
// thing that removes a fan-out is asking once for the whole set.
//
// THE QUERY COUNT IS NOW INDEPENDENT OF CHILD COUNT — eight bounded reads whether the case has one
// child or seventeen, plus explicitly declared chunking above MAX_IDS_PER_QUERY.
//
// Truth is preserved by construction rather than by re-derivation: the bulk owner changes only where
// rows come from, and every child is then stitched by the SAME pure function the single-child path
// has always used. `loadSchedulingProjectionForChild` now delegates here with a one-item set, so
// there is one implementation, not two.
// ---------------------------------------------------------------------------

/**
 * Chunk bound for `IN (...)` predicates. PostgREST puts the list in the URL, so an unbounded set
 * becomes a request that is silently truncated or rejected at the gateway rather than a slow query.
 * Chunks are merged in request order, so the merge is deterministic regardless of completion order.
 */
export const MAX_IDS_PER_QUERY = 100;

function chunkIds(ids: readonly string[]): string[][] {
    const distinct = [...new Set(ids.filter((id): id is string => Boolean(id && id.trim())))];
    if (distinct.length === 0) return [];
    const out: string[][] = [];
    for (let i = 0; i < distinct.length; i += MAX_IDS_PER_QUERY) out.push(distinct.slice(i, i + MAX_IDS_PER_QUERY));
    return out;
}

/** Run one bounded read per chunk and concatenate IN CHUNK ORDER — never in completion order. */
async function readChunked<T>(ids: readonly string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
    const chunks = chunkIds(ids);
    if (chunks.length === 0) return [];
    const results = await Promise.all(chunks.map((chunk) => read(chunk)));
    return results.flat();
}

export type ChildSchedulingRequest = {
    customerMemberId: string;
    subjectName: string;
    ageGroup?: string | null;
};

export type LoadSchedulingProjectionsForChildrenParams = {
    children: readonly ChildSchedulingRequest[];
    siteLocationId: string;
    todayYmd: string;
    computedAt: string;
    /** Pre-resolved site label — the site is case-level, so it is resolved once for the whole set. */
    siteName?: string | null;
};

/**
 * THE canonical scheduling projection owner. Returns a Map keyed by `customerMemberId`.
 *
 * A requested child with no schedulable truth is ABSENT from the map — the same thing the
 * single-child path expressed by returning a projection with no children. Callers that need a
 * placeholder decide that themselves rather than having one invented here.
 *
 * Duplicate requested ids collapse to one entry; the map cannot represent a duplicate, and the
 * projection for a given child does not depend on how many times it was asked for.
 */
export async function loadSchedulingProjectionsForChildren(
    supabase: SupabaseClient,
    orgId: string,
    params: LoadSchedulingProjectionsForChildrenParams
): Promise<Map<string, SchedulingProjection>> {
    const out = new Map<string, SchedulingProjection>();
    const siteLocationId = params.siteLocationId?.trim() ?? "";
    const requested = params.children.filter((c) => Boolean(c.customerMemberId?.trim()));
    if (requested.length === 0) return out;

    // The REQUESTED set is the access boundary. Every row below is matched back to a member id in
    // this set, so a shared agreement, pattern or assignment-type id cannot carry another child's
    // row into a requested child's projection.
    const byMemberId = new Map<string, ChildSchedulingRequest>();
    for (const c of requested) if (!byMemberId.has(c.customerMemberId.trim())) byMemberId.set(c.customerMemberId.trim(), c);
    const memberIds = [...byMemberId.keys()];

    // ── Hop 1: agreements and assignments. Independent — neither informs the other.
    const [agreementRows, assignmentRowsAll] = await Promise.all([
        readChunked(memberIds, async (chunk) => {
            const { data, error } = await supabase
                .from("child_enrollment_agreements")
                .select("*")
                .eq("org_id", orgId)
                .eq("site_location_id", siteLocationId)
                .in("customer_member_id", chunk)
                .in("status", OPERATIONAL_AGREEMENT_STATUSES);
            if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
            return (data ?? []) as ChildEnrollmentAgreementRow[];
        }),
        readChunked(memberIds, async (chunk) => {
            const { data, error } = await supabase
                .from("schedule_assignments")
                .select("*")
                .eq("org_id", orgId)
                .in("customer_member_id", chunk)
                .order("start_date", { ascending: false });
            if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
            return (data ?? []) as ScheduleAssignmentRow[];
        }),
    ]);

    const agreementByMember = new Map<string, ChildEnrollmentAgreementRow>();
    for (const row of agreementRows) {
        const member = String(row.customer_member_id ?? "").trim();
        if (!byMemberId.has(member)) continue; // not requested — cannot enter a result
        if (agreementByMember.has(member)) {
            // `getOperationalAgreementForMemberSite` used `.maybeSingle()`, which ERRORS on a second
            // row. Silently picking one here would make the bulk owner disagree with the single-child
            // owner on exactly the case an operator would need told about.
            throw new OperationalEnrollmentServiceError(
                "db_error",
                "multiple active enrollment agreements for one member at one site"
            );
        }
        agreementByMember.set(member, row);
    }

    const assignmentsByMember = new Map<string, ScheduleAssignmentRow[]>();
    for (const row of assignmentRowsAll) {
        const member = String(row.customer_member_id ?? "").trim();
        if (!byMemberId.has(member)) continue;
        (assignmentsByMember.get(member) ?? assignmentsByMember.set(member, []).get(member)!).push(row);
    }

    // ── Hop 2: everything the first hop's rows name. All independent of one another.
    const agreementIds = [...agreementByMember.values()].map((a) => a.id);
    const proposedMembers = memberIds.filter(
        (id) => !agreementByMember.has(id) && (assignmentsByMember.get(id)?.length ?? 0) === 0
    );
    const [placementRows, patternRows, typeRows, processRows] = await Promise.all([
        readChunked(agreementIds, async (chunk) => {
            const { data, error } = await supabase
                .from("child_placements")
                .select("*")
                .eq("org_id", orgId)
                .in("enrollment_agreement_id", chunk)
                .order("start_date", { ascending: false });
            if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
            return (data ?? []) as ChildPlacementRow[];
        }),
        readChunked(assignmentRowsAll.map((a) => a.schedule_pattern_id), async (chunk) => {
            const { data, error } = await supabase
                .from("schedule_patterns").select("*").eq("org_id", orgId).in("id", chunk);
            if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
            return (data ?? []) as SchedulePatternRow[];
        }),
        readChunked(
            assignmentRowsAll.map((a) => a.operational_assignment_type_id).filter((id): id is string => Boolean(id)),
            async (chunk) => {
                const { data, error } = await supabase
                    .from("operational_assignment_types")
                    .select("id, key, label, icon_key, visual_tone, billing_participation, attendance_participation, staffing_participation")
                    .eq("org_id", orgId).in("id", chunk);
                if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
                return (data ?? []) as AssignmentTypeRow[];
            }
        ),
        readChunked(proposedMembers, async (chunk) => {
            const { data, error } = await supabase
                .from("process_instances")
                .select("subject_id, metadata, created_at")
                .eq("org_id", orgId)
                .eq("process_key", "enrollment")
                .in("subject_id", chunk)
                .order("created_at", { ascending: false });
            if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
            return (data ?? []) as Array<{ subject_id: string; metadata: unknown; created_at: string }>;
        }),
    ]);

    const placementsByAgreement = new Map<string, ChildPlacementRow[]>();
    for (const row of placementRows) {
        const key = String(row.enrollment_agreement_id ?? "").trim();
        (placementsByAgreement.get(key) ?? placementsByAgreement.set(key, []).get(key)!).push(row);
    }
    const patternsById = new Map<string, SchedulePatternRow>();
    for (const row of patternRows) patternsById.set(row.id, row);
    const typesById = new Map<string, AssignmentTypePresentation>();
    for (const raw of typeRows) {
        typesById.set(raw.id, {
            id: raw.id, key: raw.key, label: raw.label, iconKey: raw.icon_key, visualTone: raw.visual_tone,
            billingParticipation: raw.billing_participation,
            attendanceParticipation: raw.attendance_participation,
            staffingParticipation: raw.staffing_participation,
        });
    }
    // The single-child read was `.order(created_at desc).limit(1)`: the LATEST instance per subject.
    // Rows arrive already ordered, so the first one seen for a subject is that latest instance.
    const processMetaByMember = new Map<string, ProposedDraftMeta>();
    for (const row of processRows) {
        const member = String(row.subject_id ?? "").trim();
        if (!byMemberId.has(member) || processMetaByMember.has(member)) continue;
        processMetaByMember.set(member, ((row.metadata ?? {}) as ProposedDraftMeta));
    }

    // ── Hop 3: the labels and proposed patterns those rows name. Still bounded, still one read each.
    const proposedTypes = [...processMetaByMember.values()]
        .map((m) => m.schedule_type?.trim() || "")
        .filter(Boolean);
    const roomIds: string[] = [];
    const programIds: string[] = [];
    for (const row of assignmentRowsAll) {
        if (row.room_location_id) roomIds.push(row.room_location_id);
        if (row.program_category_id) programIds.push(row.program_category_id);
    }
    for (const row of placementRows) {
        if (row.room_location_id) roomIds.push(row.room_location_id);
        if (row.program_category_id) programIds.push(row.program_category_id);
    }
    for (const meta of processMetaByMember.values()) {
        if (meta.program_room_cohort_key?.trim()) roomIds.push(meta.program_room_cohort_key.trim());
        if (meta.program_category_id) programIds.push(String(meta.program_category_id));
    }
    const [roomLabelRows, programLabelRows, proposedPatternRows] = await Promise.all([
        readChunked(roomIds, async (chunk) => {
            const { data } = await supabase.from("locations").select("id, label").eq("org_id", orgId).in("id", chunk);
            return (data ?? []) as Array<{ id: string; label: string | null }>;
        }),
        readChunked(programIds, async (chunk) => {
            const { data } = await supabase
                .from("location_program_categories").select("id, label, key").eq("org_id", orgId).in("id", chunk);
            return (data ?? []) as Array<{ id: string; label: string | null; key: string | null }>;
        }),
        proposedTypes.length === 0 ? Promise.resolve([] as SchedulePatternRow[]) :
            readChunked(proposedTypes, async (chunk) => {
                const { data } = await supabase
                    .from("schedule_patterns")
                    .select("weekdays, label, schedule_type_key, sort_order")
                    .eq("org_id", orgId).eq("site_location_id", siteLocationId)
                    .in("schedule_type_key", chunk).eq("is_active", true)
                    .order("sort_order");
                return (data ?? []) as SchedulePatternRow[];
            }),
    ]);
    const roomLabels = new Map<string, string | null>();
    for (const r of roomLabelRows) roomLabels.set(r.id, r.label != null ? String(r.label).trim() || null : null);
    const programLabels = new Map<string, string | null>();
    for (const r of programLabelRows) programLabels.set(r.id, r.label?.trim() || r.key?.trim() || null);
    // `.order(sort_order).limit(1)` per type — first seen wins, matching the single-child read.
    const proposedPatternByType = new Map<string, SchedulePatternRow>();
    for (const row of proposedPatternRows) {
        const key = String((row as { schedule_type_key?: string }).schedule_type_key ?? "").trim();
        if (!key || proposedPatternByType.has(key)) continue;
        proposedPatternByType.set(key, row);
    }

    const siteName =
        params.siteName !== undefined ? params.siteName : (roomLabels.get(siteLocationId) ?? null);

    // ── Stitch. No I/O below this line: every child is built from the rows above by the same pure
    //    path the single-child owner has always used.
    for (const memberId of memberIds) {
        const request = byMemberId.get(memberId)!;
        const agreement = agreementByMember.get(memberId) ?? null;
        const assignmentRows = assignmentsByMember.get(memberId) ?? [];
        const placements = agreement ? (placementsByAgreement.get(agreement.id) ?? []) : [];
        const projection = stitchChildSchedulingProjection({
            request,
            siteLocationId,
            siteName,
            todayYmd: params.todayYmd,
            computedAt: params.computedAt,
            agreement,
            assignmentRows,
            placements,
            patternsById,
            typesById,
            roomLabels,
            programLabels,
            proposedMeta: processMetaByMember.get(memberId) ?? null,
            proposedPatternByType,
        });
        out.set(memberId, projection);
    }
    // EVERY requested child has an entry. A child with no agreement, no assignment and no draft is
    // still a child with a projection that says so — the single-child path always produced one, and
    // omitting it here would turn "nothing scheduled" into "we did not look".
    return out;
}

/**
 * The PURE stitch — no I/O. Both the bulk owner and (through it) the single-child API build every
 * child with exactly this code, so the two cannot drift apart by construction. It is the original
 * single-child body with each `await` replaced by a lookup into rows already fetched.
 */
type StitchChildSchedulingParams = {
    request: ChildSchedulingRequest;
    siteLocationId: string;
    siteName: string | null;
    todayYmd: string;
    computedAt: string;
    agreement: ChildEnrollmentAgreementRow | null;
    assignmentRows: ScheduleAssignmentRow[];
    placements: ChildPlacementRow[];
    patternsById: Map<string, SchedulePatternRow>;
    typesById: Map<string, AssignmentTypePresentation>;
    roomLabels: Map<string, string | null>;
    programLabels: Map<string, string | null>;
    proposedMeta: ProposedDraftMeta | null;
    proposedPatternByType: Map<string, SchedulePatternRow>;
};

function stitchChildSchedulingProjection(p: StitchChildSchedulingParams): SchedulingProjection {
    const customerMemberId = p.request.customerMemberId.trim();
    const roomLabel = (id: string | null): string | null => (id ? (p.roomLabels.get(id) ?? null) : null);
    const programLabel = (id: string | null): string | null => (id ? (p.programLabels.get(id) ?? null) : null);

    // No ledger rows yet → the participation-metadata draft, exactly as before.
    if (!p.agreement && p.assignmentRows.length === 0) {
        const proposed = stitchProposedDraft(p, customerMemberId, roomLabel, programLabel);
        const subject: ChildSchedulingSubject = {
            id: customerMemberId,
            name: p.request.subjectName,
            program: proposed?.assignments[0]?.room.program ?? null,
            ageGroup: p.request.ageGroup ?? null,
            siteId: p.siteLocationId,
            siteName: p.siteName,
        };
        const child = buildChildScheduling({
            subject,
            agreementStatus: null,
            enrollmentAgreementId: null,
            assignments: [],
            asOf: p.todayYmd,
            proposed,
        });
        return buildSchedulingProjectionForChild(child, p.todayYmd, p.computedAt);
    }

    const assignments: AssignmentInput[] = [];
    for (const row of p.assignmentRows) {
        const pattern = p.patternsById.get(row.schedule_pattern_id) ?? null;
        const hours = readPatternDefaultHours((pattern?.metadata ?? null) as Record<string, unknown> | null);
        const placement = placementForAssignment(p.placements, row);
        const roomId = row.room_location_id ?? placement?.room_location_id ?? null;
        const programId = row.program_category_id ?? placement?.program_category_id ?? null;
        const room: AssignmentRoom = { id: roomId, name: roomLabel(roomId), program: programLabel(programId) };
        const type = (row.operational_assignment_type_id ? p.typesById.get(row.operational_assignment_type_id) : null) ?? EMPTY_TYPE;
        assignments.push({
            row,
            weekdays: pattern?.weekdays ?? [],
            patternResolved: pattern != null,
            patternLabel: pattern?.label?.trim() || null,
            arriveTime: hours?.arrive ?? null,
            departTime: hours?.depart ?? null,
            room,
            assignmentType: type,
        });
    }

    const operationalPlacement = p.placements.find((x) => !x.end_date) ?? p.placements[0] ?? null;
    const subject: ChildSchedulingSubject = {
        id: customerMemberId,
        name: p.request.subjectName,
        program: programLabel(operationalPlacement?.program_category_id ?? null),
        ageGroup: p.request.ageGroup ?? null,
        siteId: p.siteLocationId,
        siteName: p.siteName,
    };
    const child = buildChildScheduling({
        subject,
        agreementStatus: p.agreement?.status ?? null,
        enrollmentAgreementId: p.agreement?.id ?? null,
        assignments,
        asOf: p.todayYmd,
    });
    return buildSchedulingProjectionForChild(child, p.todayYmd, p.computedAt);
}

/** The proposed-draft branch, stitched from the pre-read process-instance metadata. */
function stitchProposedDraft(
    p: StitchChildSchedulingParams,
    customerMemberId: string,
    roomLabel: (id: string | null) => string | null,
    programLabel: (id: string | null) => string | null
): ScheduleView | null {
    const meta = p.proposedMeta ?? ({} as ProposedDraftMeta);
    const scheduleType = meta.schedule_type?.trim() || null;
    const roomId = meta.program_room_cohort_key?.trim() || null;
    const startDate = meta.start_date?.trim() || null;
    if (!scheduleType && !roomId && !startDate) return null;

    let weekdays: number[] = Array.isArray(meta.weekdays) ? meta.weekdays : [];
    let scheduleTypeLabel: string | null = null;
    if (scheduleType) {
        const row = p.proposedPatternByType.get(scheduleType) ?? null;
        // The operator's saved weekdays win; the pattern is only the fallback template.
        if (weekdays.length === 0) weekdays = (row?.weekdays as number[] | undefined) ?? [];
        scheduleTypeLabel = row?.label?.trim() || null;
    }

    const arrive = meta.scheduleTimes?.default?.arrive ?? null;
    const depart = meta.scheduleTimes?.default?.depart ?? null;
    const effectiveFrom = startDate ?? "";
    const assignment: Assignment = {
        id: `${PROPOSED_DRAFT_ASSIGNMENT_ID_PREFIX}${customerMemberId}`,
        subjectId: customerMemberId,
        subjectType: "child",
        childId: customerMemberId,
        room: { id: roomId, name: roomLabel(roomId), program: programLabel(meta.program_category_id ?? null) },
        weekdays,
        arriveTime: arrive,
        departTime: depart,
        effectiveFrom,
        effectiveTo: meta.end_date?.trim() || null,
        openEnded: !meta.end_date,
        kind: "base",
        status: "proposed",
        isPrimary: true,
        commitmentKind: "proposed",
        assignmentType: { ...EMPTY_TYPE, key: scheduleType, label: scheduleTypeLabel },
        patternId: null,
        patternLabel: scheduleTypeLabel,
        billing: billingFromType({
            ...EMPTY_TYPE,
            key: scheduleType,
            label: scheduleTypeLabel,
            billingParticipation: "eligible",
        }),
    };
    return {
        bucket: "current",
        effectiveFrom,
        effectiveTo: assignment.effectiveTo,
        openEnded: assignment.openEnded,
        temporary: false,
        assignments: [assignment],
        scheduleType,
        scheduleTypeLabel,
        rate: "pending",
        projectedTuition: null,
    };
}
