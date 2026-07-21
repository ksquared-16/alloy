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
import type {
    Assignment,
    AssignmentRoom,
    ChildScheduling,
    ChildSchedulingStatus,
    ChildSchedulingSubject,
    ScheduleHistoryEntry,
    ScheduleView,
    SchedulingCalculationMeta,
    SchedulingProjection,
} from "@/lib/scheduling/projection/schedulingProjectionTypes";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatWeekdays(weekdays: number[]): string {
    return weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_NAMES[d] ?? String(d))
        .join(", ");
}

// ---------------------------------------------------------------------------
// Pure stitch
// ---------------------------------------------------------------------------

/** One assignment row paired with the resolved pattern + room (already loaded). */
export type AssignmentInput = {
    row: ScheduleAssignmentRow;
    weekdays: number[];
    patternResolved: boolean;
    room: AssignmentRoom;
};

export type PureChildSchedulingInput = {
    subject: ChildSchedulingSubject;
    agreementStatus: string | null; // null => no operational agreement
    assignments: AssignmentInput[];
    asOf: string; // YYYY-MM-DD
};

function mapAssignment(input: AssignmentInput): Assignment {
    const { row, weekdays, room } = input;
    const openEnded = !row.end_date;
    return {
        id: row.id,
        childId: row.customer_member_id,
        room,
        weekdays,
        arriveTime: null,
        departTime: null,
        effectiveFrom: row.start_date,
        effectiveTo: row.end_date ?? null,
        openEnded,
        kind: row.assignment_kind === "temporary" ? "temporary" : "base",
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
    const roomName = a.room.name ?? "Schedule";
    return {
        effectiveFrom: a.effectiveFrom,
        effectiveTo: a.effectiveTo,
        summary: days ? `${roomName} · ${days}` : roomName,
    };
}

function resolveStatus(
    agreementStatus: string | null,
    hasCurrent: boolean,
    hasUpcoming: boolean
): ChildSchedulingStatus {
    if (agreementStatus == null) return "needs-placement";
    if (isAgreementTerminalStatus(agreementStatus)) return "ended";
    if (hasCurrent) return "scheduled";
    if (hasUpcoming) return "upcoming-only";
    return "needs-placement";
}

/** Pure: resolve one child's scheduling projection from already-loaded rows. */
export function buildChildScheduling(input: PureChildSchedulingInput): ChildScheduling {
    const currentAssignments: Assignment[] = [];
    const upcomingByStart = new Map<string, Assignment[]>();
    const temporaryViews: ScheduleView[] = [];
    const historyEntries: ScheduleHistoryEntry[] = [];
    const partialReasons = new Set<string>();

    for (const item of input.assignments) {
        const assignment = mapAssignment(item);
        if (!item.patternResolved) partialReasons.add("schedule pattern unresolved");
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
            ? scheduleViewFrom("current", currentAssignments, false)
            : null;

    const upcoming: ScheduleView[] = [...upcomingByStart.entries()]
        .sort(([a], [b]) => compareIsoDates(a, b))
        .map(([, group]) => scheduleViewFrom("upcoming", group, false));

    historyEntries.sort((a, b) => compareIsoDates(b.effectiveFrom, a.effectiveFrom));

    const status = resolveStatus(
        input.agreementStatus,
        current != null,
        upcoming.length > 0
    );

    return {
        child: input.subject,
        status,
        current,
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
};

/** Thin I/O: load canonical rows for one child + delegate to the pure stitch. */
export async function loadSchedulingProjectionForChild(
    supabase: SupabaseClient,
    orgId: string,
    params: LoadSchedulingProjectionParams
): Promise<SchedulingProjection> {
    const { customerMemberId, siteLocationId, todayYmd, computedAt } = params;

    let agreement: ChildEnrollmentAgreementRow | null =
        await getOperationalAgreementForMemberSite(
            supabase,
            orgId,
            customerMemberId,
            siteLocationId
        );

    const siteName = await resolveLocationLabel(supabase, orgId, siteLocationId);

    // No operational agreement → unscheduled child; nothing to bucket.
    if (!agreement) {
        const subject: ChildSchedulingSubject = {
            id: customerMemberId,
            name: params.subjectName,
            program: null,
            ageGroup: params.ageGroup ?? null,
            siteId: siteLocationId,
            siteName,
        };
        const child = buildChildScheduling({
            subject,
            agreementStatus: null,
            assignments: [],
            asOf: todayYmd,
        });
        return buildSchedulingProjectionForChild(child, todayYmd, computedAt);
    }

    const [assignmentRows, placements] = await Promise.all([
        listScheduleAssignments(supabase, orgId, { enrollmentAgreementId: agreement.id }),
        listChildPlacements(supabase, orgId, { enrollmentAgreementId: agreement.id }),
    ]);

    const patterns = await loadPatterns(
        supabase,
        orgId,
        assignmentRows.map((a) => a.schedule_pattern_id)
    );

    // Resolve distinct room + program labels once.
    const roomLabelCache = new Map<string, string | null>();
    const programLabelCache = new Map<string, string | null>();
    async function roomLabel(id: string | null): Promise<string | null> {
        if (!id) return null;
        if (!roomLabelCache.has(id))
            roomLabelCache.set(id, await resolveLocationLabel(supabase, orgId, id));
        return roomLabelCache.get(id) ?? null;
    }
    async function programLabel(id: string | null): Promise<string | null> {
        if (!id) return null;
        if (!programLabelCache.has(id))
            programLabelCache.set(id, await resolveProgramLabel(supabase, orgId, id));
        return programLabelCache.get(id) ?? null;
    }

    const assignments: AssignmentInput[] = [];
    for (const row of assignmentRows) {
        const pattern = patterns.get(row.schedule_pattern_id) ?? null;
        const placement = placementForAssignment(placements, row);
        const room: AssignmentRoom = {
            id: placement?.room_location_id ?? null,
            name: await roomLabel(placement?.room_location_id ?? null),
            program: await programLabel(placement?.program_category_id ?? null),
        };
        assignments.push({
            row,
            weekdays: pattern?.weekdays ?? [],
            patternResolved: pattern != null,
            room,
        });
    }

    // Subject program comes from the operational placement (current room).
    const operationalPlacement =
        placements.find((p) => !p.end_date) ?? placements[0] ?? null;
    const subject: ChildSchedulingSubject = {
        id: customerMemberId,
        name: params.subjectName,
        program: await programLabel(operationalPlacement?.program_category_id ?? null),
        ageGroup: params.ageGroup ?? null,
        siteId: siteLocationId,
        siteName,
    };

    const child = buildChildScheduling({
        subject,
        agreementStatus: agreement.status,
        assignments,
        asOf: todayYmd,
    });

    return buildSchedulingProjectionForChild(child, todayYmd, computedAt);
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
