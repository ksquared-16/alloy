"use client";

/**
 * Attendance — the live operating state for one day at one site.
 *
 * The Daily Roster answers "who is expected". This answers "who is actually
 * here, and what should I do about it". Same composition, same room·date cell —
 * Attendance reads `actual*` where the roster reads the planned side.
 *
 * Room is the operating unit. There is deliberately no flat list of every person
 * at the site: a director opens this to find the room that needs them, not to
 * browse people.
 *
 * Colour is semantic, never decorative. Bend Pine = healthy/action, Ember =
 * attention (short), neutral stone = unknown. Unknown never renders healthy.
 *
 * Every mutation goes through a registered action. There are no inline writes.
 */

import {
    invalidateOperationsDay,
    warmOperationsDayResult,
} from "@/lib/scheduling/operationsWorkspaceWarmCache";
import { createLatestWinsGate } from "@/lib/runtime/latestWins";
import { buildAttendanceOverviewModel } from "@/lib/roster/attendanceOverviewModel";
import {
    CHILD_AWAY_REASONS,
    CLOSURE_REASONS,
    serviceDayReasonLabel,
    serviceDayChipLabel,
    serviceDayStateSentence,
    serviceDayTone,
    type ServiceDayTone,
} from "@/lib/childcareOperational/attendance/serviceDayCopy";
import type { ServiceDayState } from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, UserRound, Users } from "lucide-react";

import {
    WS_EYEBROW,
    WS_OVERVIEW_CONTENT,
    WS_PANEL_SURFACE,
    WS_SURFACE_CONTENT_PAD,
} from "@/components/workspace/workspaceTokens";

type Sufficiency = "sufficient" | "short" | "unknown" | "idle";
type ActualState = "present" | "checked_out" | "absent" | "no_record";

type SubjectActual = {
    state: ActualState;
    arrivedAt: string | null;
    departedAt: string | null;
    actualRoomLocationId: string | null;
    latestFactId: string | null;
};

/**
 * How the day reads once known intent is applied — off sick, on holiday, room
 * closed, or here-when-nobody-expected-her. Absent for a child nobody has said
 * anything about, which is most of them on most days.
 */
type ServiceDayReading = {
    state: ServiceDayState;
    reasonKey: string | null;
    raisesAttention: boolean;
};

type RosterChild = {
    subjectType: "child";
    customerMemberId: string;
    enrollmentAgreementId: string;
    personId: string | null;
    displayName: string;
    timeLabel: string | null;
    actual: SubjectActual;
    serviceDay?: ServiceDayReading | null;
};

type RosterStaff = {
    subjectType: "staff";
    assignmentId: string;
    personId: string;
    displayName: string;
    positionLabel: string | null;
    timeLabel: string | null;
    actual: SubjectActual;
};

type Cell = {
    roomLocationId: string;
    roomName: string;
    date: string;
    children: RosterChild[];
    staff: RosterStaff[];
    expectedChildCount: number;
    scheduledStaffCount: number;
    requiredStaff: number | null;
    staffingSufficiency: Sufficiency;
    actualChildrenPresent: number;
    actualStaffPresent: number;
    actualRequiredStaff: number | null;
    actualStaffingSufficiency: Sufficiency;
};

type RosterModel = {
    date: string;
    cells: Cell[];
    staffingSufficiency: Sufficiency;
    actualStaffingSufficiency: Sufficiency;
    totals: {
        expectedChildren: number;
        scheduledStaff: number;
        actualChildrenPresent: number;
        actualStaffPresent: number;
        roomsShort: number;
        roomsUnknown: number;
        roomsActuallyShort: number;
    };
};

export type AttendanceWorkspaceProps = {
    siteLocationId: string;
    siteName: string;
    /**
     * Room to open on arrival — set when Roster hands off "this room, today".
     * Attendance is a today-only surface, so the handoff carries the room and the
     * site; the date is the org's service date either way.
     */
    initialRoomId?: string | null;
    /**
     * Return to the expectation layer, carrying the room. The reciprocal of
     * Roster's `Open Attendance`, so the operator is never left to rebuild their
     * own context by re-picking a site and a room.
     */
    onBackToRoster?: (roomLocationId: string | null) => void;
    /**
     * Record gestures. Each resolves FALSE when no active Work Unit hosts the
     * record — a real platform answer, not an error. Attendance stops offering
     * the gesture rather than inventing somewhere to send the operator.
     */
    onOpenChild?: (child: RosterChild) => Promise<boolean> | boolean | void;
    onOpenStaff?: (staff: RosterStaff) => Promise<boolean> | boolean | void;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatLongDate(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return `${DAYS[dt.getUTCDay()]}, ${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

function formatTime(iso: string | null): string | null {
    if (!iso) return null;
    const m = /T(\d{2}):(\d{2})/.exec(iso);
    if (!m) return null;
    const hh = Number(m[1]);
    const ap = hh < 12 ? "AM" : "PM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${m[2]} ${ap}`;
}

/** One operator-readable sentence per subject — meaning before fields. */
function stateSentence(actual: SubjectActual): string {
    switch (actual.state) {
        case "present":
            return `Present · ${formatTime(actual.arrivedAt) ?? "time unknown"}`;
        case "checked_out":
            return `Left · ${formatTime(actual.departedAt) ?? "time unknown"}`;
        case "absent":
            return "Absent";
        default:
            return "Not arrived";
    }
}

/**
 * Chrome for an interpreted state. Colour is semantic: a child on holiday is
 * settled, not an alarm; a plan we could not resolve is never healthy; and a
 * child who is here when nobody expected her is worth an operator's eye without
 * being an error.
 */
function toneChrome(tone: ServiceDayTone): string {
    switch (tone) {
        case "present":
            return "bg-[#00A283]/10 text-[#00715C] ring-1 ring-[#00A283]/25";
        case "attention":
            return "bg-alloy-gold/15 text-alloy-midnight ring-1 ring-alloy-gold/40";
        case "settled":
            return "bg-alloy-stone/12 text-alloy-midnight/70 ring-1 ring-alloy-stone/25";
        case "unknown":
            return "bg-alloy-ember/12 text-alloy-midnight ring-1 ring-alloy-ember/35";
        default:
            return "bg-alloy-stone/15 text-alloy-midnight/60 ring-1 ring-alloy-stone/25";
    }
}

/**
 * What a child's row says.
 *
 * The interpreted reading wins when there is one, because it already folded the
 * observed fact in — `attended_despite_plan` is a PRESENT child, and the raw
 * state would say only "Present" and lose the half the operator needs.
 */
function childSentence(child: RosterChild): string {
    const arrivedLabel = formatTime(child.actual.arrivedAt);
    const departedLabel = formatTime(child.actual.departedAt);
    if (child.serviceDay) {
        return serviceDayStateSentence({
            state: child.serviceDay.state,
            reasonKey: child.serviceDay.reasonKey,
            arrivedLabel,
            departedLabel,
        });
    }
    return stateSentence(child.actual);
}

function childChrome(child: RosterChild): string {
    return child.serviceDay ? toneChrome(serviceDayTone(child.serviceDay.state)) : stateChip(child.actual.state);
}

function stateChip(state: ActualState): string {
    if (state === "present") return "bg-[#00A283]/10 text-[#00715C] ring-1 ring-[#00A283]/25";
    if (state === "checked_out") return "bg-alloy-stone/15 text-alloy-midnight/60 ring-1 ring-alloy-stone/25";
    if (state === "absent") return "bg-alloy-gold/15 text-alloy-midnight ring-1 ring-alloy-gold/40";
    return "bg-alloy-stone/10 text-alloy-midnight/50 ring-1 ring-alloy-stone/20";
}

function sufficiencyChrome(state: Sufficiency): string {
    if (state === "sufficient") return "bg-[#00A283]/10 text-[#00715C] ring-1 ring-[#00A283]/25";
    if (state === "short") return "bg-alloy-ember/15 text-alloy-midnight ring-1 ring-alloy-ember/45";
    // idle and unknown are both neutral — neither is a success state.
    return "bg-alloy-stone/15 text-alloy-midnight/55 ring-1 ring-alloy-stone/25";
}

/**
 * Operator label for a room's ACTUAL state.
 *
 * `idle` from the read model means "no demand and no supply right now". On the
 * actual axis that is true both for a room nobody is rostered to AND for a room
 * whose people simply have not arrived yet — and calling the second one
 * "No one expected" is a lie the director would act on. The expected counts
 * disambiguate: presentation only, no change to the underlying verdict.
 */
function sufficiencyLabel(state: Sufficiency, cell?: Pick<Cell, "expectedChildCount" | "scheduledStaffCount">): string {
    if (state === "sufficient") return "Sufficient";
    if (state === "short") return "Short";
    if (state === "idle") {
        const someoneExpected =
            (cell?.expectedChildCount ?? 0) > 0 || (cell?.scheduledStaffCount ?? 0) > 0;
        return someoneExpected ? "No one here yet" : "No one expected";
    }
    return "Unknown";
}

/** Touch-sized action — attendance is used standing up, on a tablet. */
const ACTION =
    "min-h-[40px] rounded-md px-3 py-2 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const ACTION_PRIMARY = `${ACTION} bg-[#00A283] text-white hover:bg-[#009276]`;
const ACTION_SECONDARY = `${ACTION} border border-alloy-stone/25 bg-white text-alloy-midnight/75 hover:border-alloy-stone/45`;

export default function AttendanceWorkspace({
    siteLocationId,
    siteName,
    initialRoomId,
    onBackToRoster,
    onOpenChild,
    onOpenStaff,
}: AttendanceWorkspaceProps) {
    /**
     * The operational day is the ORGANIZATION's local service date, not the
     * browser's UTC date. `new Date().toISOString()` rolls over at UTC midnight
     * and would show tomorrow's roster to a US center all evening.
     *
     * Null until the server tells us: the roster route resolves the service date
     * through the canonical `resolveOperationalEnrollmentTodayYmd` (org timezone)
     * and returns it, so the first request deliberately omits `date`.
     */
    const [date, setDate] = useState<string | null>(null);
    const [model, setModel] = useState<RosterModel | null>(null);
    /** A handoff from Roster names the room; otherwise the operator picks one. */
    const [openRoomId, setOpenRoomId] = useState<string | null>(initialRoomId ?? null);
    const [busySubject, setBusySubject] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    /**
     * Subjects whose record gesture resolved to "nowhere". Their name stops being
     * a control — an affordance that does nothing is worse than no affordance.
     */
    const [unreachable, setUnreachable] = useState<Set<string>>(new Set());

    const attemptFocus = useCallback(
        async (key: string, run: (() => Promise<boolean> | boolean | void) | undefined) => {
            if (!run) return;
            const resolved = await run();
            if (resolved === false) {
                setUnreachable((prev) => new Set(prev).add(key));
            }
        },
        []
    );

    /**
     * Stale-response guard. Switching site fires a request per site and they can
     * land out of order, so a late response paints the PREVIOUS campus's rooms
     * while the header already shows the new campus's name. Only the newest
     * request may write state.
     */
    /* Latest intent wins — one gate for THIS load. See lib/runtime/latestWins.ts. */
    const requestGate = useRef(createLatestWinsGate());

    const load = useCallback(async () => {
        // The workspace mounts this before a site resolves; fetching on "" is a
        // guaranteed 400.
        if (!siteLocationId) return;
        const seq = requestGate.current.issue();
        setError(null);
        try {
            const dateParam = date ? `&date=${encodeURIComponent(date)}` : "";
            // Same warm read as the day roster — they share this endpoint, so they must share the
            // cache AND its invalidation, or a check-in here would leave the roster asserting the
            // old presence.
            const { data, error: loadError } = await warmOperationsDayResult(
                `/api/admin/roster?site_location_id=${encodeURIComponent(siteLocationId)}${dateParam}`
            );
            const json = (data ?? {}) as {
                roster?: RosterModel;
                todayYmd?: string;
                error?: string;
            };
            if (!requestGate.current.isCurrent(seq)) return;
            if (loadError) throw new Error(loadError);
            setModel(json.roster ?? null);
            // Adopt the org-local service date the server resolved.
            if (!date && json.roster?.date) setDate(json.roster.date);
        } catch (e) {
            if (!requestGate.current.isCurrent(seq)) return;
            setError(e instanceof Error ? e.message : "Could not load attendance");
        }
    }, [siteLocationId, date]);

    useEffect(() => {
        void load();
    }, [load]);

    const openRoom = useMemo(
        () => model?.cells.find((c) => c.roomLocationId === openRoomId) ?? null,
        [model, openRoomId]
    );

    /**
     * Author through the registered command, then converge on the authoritative
     * projection. No parallel client truth store — the roster read model stays
     * the only interpreter of correction/reversal.
     */
    async function runAction(subjectKey: string, body: Record<string, unknown>, endpoint: string) {
        setBusySubject(subjectKey);
        setError(null);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = (await res.json()) as { ok?: boolean; error?: { message?: string } | string };
            if (!res.ok || json.ok === false) {
                const msg = typeof json.error === "string" ? json.error : json.error?.message;
                throw new Error(msg ?? "Action failed");
            }
            // The command has authored; the cached projection is now provably out of date.
            invalidateOperationsDay();
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Action failed");
        } finally {
            setBusySubject(null);
        }
    }

    function staffPresence(staff: RosterStaff, room: Cell, kind: "check_in" | "check_out" | "absence") {
        return runAction(
            `staff:${staff.personId}`,
            {
                action_key: "staff_presence.record",
                entity_type: "person",
                entity_id: staff.personId,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: {
                    person_id: staff.personId,
                    site_location_id: siteLocationId,
                    room_location_id: kind === "check_out" ? null : room.roomLocationId,
                    event_kind: kind,
                    service_date: room.date,
                },
            },
            "/api/admin/actions/execute"
        );
    }

    function staffCorrect(staff: RosterStaff, room: Cell) {
        if (!staff.actual.latestFactId) return;
        return runAction(
            `staff:${staff.personId}`,
            {
                action_key: "staff_presence.correct",
                entity_type: "person",
                entity_id: staff.personId,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: {
                    person_id: staff.personId,
                    site_location_id: siteLocationId,
                    room_location_id: room.roomLocationId,
                    event_kind: "check_in",
                    entry_type: "reversal",
                    corrects_event_id: staff.actual.latestFactId,
                    service_date: room.date,
                },
            },
            "/api/admin/actions/execute"
        );
    }

    /*
     * CHILD ATTENDANCE GOES THROUGH THE REGISTERED COMMAND, LIKE STAFF PRESENCE.
     *
     * This used to POST straight to /api/admin/childcare-attendance, which meant
     * the two surfaces in this product had two different mutation architectures:
     * Focus Panel went through the action bus and got eligibility, confirmation
     * and correlated audit; this screen skipped all three and told the server what
     * actor_type to record. Same table, different rules — and the weaker path was
     * the one an operator uses all day.
     *
     * The action keys already existed and were already registered. Nothing new was
     * needed here except to stop going around them.
     */
    function childAttendance(child: RosterChild, room: Cell, kind: "check_in" | "check_out" | "absence") {
        const actionKey =
            kind === "check_in" ? "attendance.check_in"
            : kind === "check_out" ? "attendance.check_out"
            : "attendance.mark_absent";

        return runAction(
            `child:${child.customerMemberId}`,
            {
                action_key: actionKey,
                entity_type: "child",
                entity_id: child.customerMemberId,
                mode: "execute",
                confirmation: { confirmed: true },
                context: { surface: "workspace" },
                payload: {
                    customer_member_id: child.customerMemberId,
                    room_location_id: kind === "check_out" ? null : room.roomLocationId,
                    service_date: room.date,
                },
            },
            "/api/admin/actions/execute"
        );
    }

    /*
     * "WE'RE SHUT ON THE 25TH" IS ONE STATEMENT ABOUT THE SITE.
     *
     * Not one absence per child: a hundred rows that all say the same thing, none
     * of which is the fact, and all of which would need changing together when the
     * closure moves. The projection applies the single closure to whoever was
     * scheduled.
     *
     * This posts to the service-day-exception route rather than the action bus
     * because a closure's subject is a SITE, and the action runtime's entity
     * vocabulary has no location in it. The route applies the identical
     * authorization primitive, so the two paths cannot disagree about who may
     * write — which is the property that actually matters here.
     */
    function closeSiteDay(reasonKey: string) {
        return runAction(
            `site:${siteLocationId}`,
            {
                action: "close_grain",
                grain_kind: "site",
                grain_id: siteLocationId,
                reason_key: reasonKey,
                from_date: date,
            },
            "/api/admin/childcare-attendance/service-day-exception"
        );
    }

    /*
     * "SHE'S OFF SICK" AUTHORS A PLAN, NOT A WITNESS STATEMENT.
     *
     * The old Mark absent appended an observed absence fact — a statement that we
     * saw something we did not see, and for a future day, about a day that has
     * not happened. This states what is EXPECTED instead, which leaves the
     * schedule true and leaves the physical record free to disagree: a child who
     * arrives during her own holiday shows as here AND unexpected.
     *
     * Picking the reason IS the whole decision, so it is a select rather than a
     * dialog — the same judgement Move makes two functions down.
     */
    function planChildAbsence(child: RosterChild, room: Cell, reasonKey: string) {
        return runAction(
            `child:${child.customerMemberId}`,
            {
                action_key: "attendance.plan_absence",
                entity_type: "child",
                entity_id: child.customerMemberId,
                mode: "execute",
                confirmation: { confirmed: true },
                context: { surface: "workspace" },
                payload: {
                    customer_member_id: child.customerMemberId,
                    child_label: child.displayName,
                    reason_key: reasonKey,
                    from_date: room.date,
                    service_date: room.date,
                },
            },
            "/api/admin/actions/execute"
        );
    }

    /*
     * MOVE — the ordinary afternoon operation, and until now impossible here.
     *
     * `attendance.move` has been registered since Thread 0 and reachable from
     * nowhere an operator actually works. It records ONE room_transfer fact; the
     * domain resolves the source room from the fold, so this deliberately sends
     * only the destination. Moving a child never touches their committed
     * placement — they still belong to their classroom, they are just not in it.
     */
    function childMove(child: RosterChild, toRoomLocationId: string) {
        return runAction(
            `child:${child.customerMemberId}`,
            {
                action_key: "attendance.move",
                entity_type: "child",
                entity_id: child.customerMemberId,
                mode: "execute",
                confirmation: { confirmed: true },
                context: { surface: "workspace" },
                payload: {
                    customer_member_id: child.customerMemberId,
                    to_room_location_id: toRoomLocationId,
                },
            },
            "/api/admin/actions/execute",
        );
    }

    /*
     * CORRECT — reverses the last fact recorded for this child.
     *
     * Staff presence has had this control all along; children have not, so a
     * mis-tap on a child could only be fixed somewhere else. It authors a
     * REVERSAL against the effective fact the roster already resolved, so the
     * history keeps saying what happened and that it was undone. Nothing is
     * edited and nothing is deleted.
     */
    function childCorrect(child: RosterChild, room: Cell) {
        if (!child.actual.latestFactId) return;
        return runAction(
            `child:${child.customerMemberId}`,
            {
                action_key: "attendance.correct",
                entity_type: "child",
                entity_id: child.customerMemberId,
                mode: "execute",
                confirmation: { confirmed: true },
                context: { surface: "workspace" },
                payload: {
                    customer_member_id: child.customerMemberId,
                    corrects_event_id: child.actual.latestFactId,
                    entry_type: "reversal",
                    event_kind: child.actual.state === "checked_out" ? "check_out" : "check_in",
                    room_location_id: child.actual.actualRoomLocationId ?? room.roomLocationId,
                    service_date: room.date,
                },
            },
            "/api/admin/actions/execute",
        );
    }

    // ── Room live view ────────────────────────────────────────────────────────
    if (openRoom) {
        return (
            <div className={`${WS_SURFACE_CONTENT_PAD} min-h-0 flex-1 overflow-y-auto`} data-attendance-room={openRoom.roomLocationId}>
                <div className={`${WS_OVERVIEW_CONTENT} space-y-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                            type="button"
                            className="inline-flex min-h-[40px] items-center gap-1 text-[12.5px] font-medium text-alloy-midnight/65 hover:text-alloy-midnight"
                            onClick={() => setOpenRoomId(null)}
                            data-attendance-back="true"
                        >
                            <ChevronLeft className="h-4 w-4" aria-hidden /> All rooms
                        </button>
                        {/* Back to EXPECTATION, carrying this room. An operator who
                            arrived here from Roster lands on the room detail, not the
                            overview — putting the return only on the overview would
                            make the reciprocal move unreachable from where the
                            handoff actually lands. */}
                        {onBackToRoster ? (
                            <button
                                type="button"
                                className="rounded border border-alloy-stone/25 px-2.5 py-1 text-[11.5px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                onClick={() => onBackToRoster(openRoom.roomLocationId)}
                                data-attendance-back-to-roster="true"
                            >
                                ← Roster
                            </button>
                        ) : null}
                    </div>

                    <header className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className={WS_EYEBROW}>Attendance</p>
                            <h2 className="text-[18px] font-semibold text-alloy-midnight">{openRoom.roomName}</h2>
                            <p className="mt-0.5 text-[12px] text-alloy-midnight/60">
                                {openRoom.actualChildrenPresent} of {openRoom.expectedChildCount} children present ·{" "}
                                {openRoom.actualStaffPresent} of {openRoom.scheduledStaffCount} staff present
                            </p>
                        </div>
                        <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${sufficiencyChrome(openRoom.actualStaffingSufficiency)}`}
                            data-attendance-actual-state={openRoom.actualStaffingSufficiency}
                        >
                            Actual staffing · {sufficiencyLabel(openRoom.actualStaffingSufficiency, openRoom)}
                            {openRoom.actualRequiredStaff != null
                                ? ` (${openRoom.actualStaffPresent}/${openRoom.actualRequiredStaff})`
                                : ""}
                        </span>
                    </header>

                    {error ? (
                        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
                    ) : null}

                    <section className={`${WS_PANEL_SURFACE} p-3`} data-attendance-staff-list="true">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/50">
                            <UserRound className="h-3.5 w-3.5" aria-hidden /> Staff ({openRoom.staff.length})
                        </p>
                        <ul className="divide-y divide-alloy-stone/12">
                            {openRoom.staff.map((s) => {
                                const busy = busySubject === `staff:${s.personId}`;
                                return (
                                    <li
                                        key={s.assignmentId}
                                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                                        data-attendance-staff={s.personId}
                                    >
                                        <div className="min-w-0">
                                            {unreachable.has(`staff:${s.personId}`) ? (
                                                <span
                                                    className="block truncate text-[13.5px] font-medium text-alloy-midnight"
                                                    data-attendance-staff-unreachable={s.personId}
                                                >
                                                    {s.displayName}
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="block truncate text-left text-[13.5px] font-medium text-alloy-midnight hover:underline"
                                                    onClick={() =>
                                                        void attemptFocus(`staff:${s.personId}`, () => onOpenStaff?.(s))
                                                    }
                                                    data-attendance-open-staff={s.personId}
                                                >
                                                    {s.displayName}
                                                </button>
                                            )}
                                            <p className="truncate text-[11.5px] text-alloy-midnight/55">
                                                {[s.positionLabel, s.timeLabel ? `Scheduled ${s.timeLabel}` : null]
                                                    .filter(Boolean)
                                                    .join(" · ") || "Scheduled"}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${stateChip(s.actual.state)}`}
                                                data-attendance-staff-state={s.actual.state}
                                            >
                                                {stateSentence(s.actual)}
                                            </span>
                                            {s.actual.state === "no_record" ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className={ACTION_PRIMARY}
                                                        disabled={busy}
                                                        onClick={() => staffPresence(s, openRoom, "check_in")}
                                                        data-attendance-staff-checkin={s.personId}
                                                    >
                                                        {busy ? "…" : "Check in"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={ACTION_SECONDARY}
                                                        disabled={busy}
                                                        onClick={() => staffPresence(s, openRoom, "absence")}
                                                    >
                                                        Mark absent
                                                    </button>
                                                </>
                                            ) : s.actual.state === "present" ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className={ACTION_SECONDARY}
                                                        disabled={busy}
                                                        onClick={() => staffPresence(s, openRoom, "check_out")}
                                                        data-attendance-staff-checkout={s.personId}
                                                    >
                                                        Check out
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={ACTION_SECONDARY}
                                                        disabled={busy || !s.actual.latestFactId}
                                                        onClick={() => staffCorrect(s, openRoom)}
                                                        data-attendance-staff-correct={s.personId}
                                                    >
                                                        Undo check-in
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={ACTION_SECONDARY}
                                                    disabled={busy || !s.actual.latestFactId}
                                                    onClick={() => staffCorrect(s, openRoom)}
                                                >
                                                    Correct
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                            {openRoom.staff.length === 0 ? (
                                <li className="py-2 text-[12px] text-alloy-midnight/45">No staff scheduled</li>
                            ) : null}
                        </ul>
                    </section>

                    <section className={`${WS_PANEL_SURFACE} p-3`} data-attendance-children-list="true">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/50">
                            <Users className="h-3.5 w-3.5" aria-hidden /> Children ({openRoom.children.length})
                        </p>
                        <ul className="divide-y divide-alloy-stone/12">
                            {openRoom.children.map((c) => {
                                const busy = busySubject === `child:${c.customerMemberId}`;
                                // Where the child IS right now, from the authoritative fold.
                                const whereNow = c.actual.actualRoomLocationId ?? openRoom.roomLocationId;
                                // Only say "currently in X" when X is not the room being viewed —
                                // otherwise every row repeats where you already are.
                                const awayIn =
                                    c.actual.state === "present" && whereNow !== openRoom.roomLocationId
                                        ? ((model?.cells ?? []).find((cell) => cell.roomLocationId === whereNow)
                                              ?.roomName ?? "another room")
                                        : null;
                                return (
                                    <li
                                        key={c.customerMemberId}
                                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                                        data-attendance-child={c.customerMemberId}
                                    >
                                        <div className="min-w-0">
                                            {unreachable.has(`child:${c.customerMemberId}`) ? (
                                                <span
                                                    className="block truncate text-[13.5px] font-medium text-alloy-midnight"
                                                    data-attendance-child-unreachable={c.customerMemberId}
                                                >
                                                    {c.displayName}
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="block truncate text-left text-[13.5px] font-medium text-alloy-midnight hover:underline"
                                                    onClick={() =>
                                                        void attemptFocus(`child:${c.customerMemberId}`, () =>
                                                            onOpenChild?.(c)
                                                        )
                                                    }
                                                    data-attendance-open-child={c.customerMemberId}
                                                >
                                                    {c.displayName}
                                                </button>
                                            )}
                                            <p className="truncate text-[11.5px] text-alloy-midnight/55">
                                                {/* Where she BELONGS and where she IS are different
                                                    truths. When they diverge, say so plainly rather
                                                    than moving her row and implying a re-placement. */}
                                                {awayIn
                                                    ? `Currently in ${awayIn} · placed here`
                                                    : c.timeLabel
                                                      ? `Expected ${c.timeLabel}`
                                                      : "Expected today"}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${childChrome(c)}`}
                                                data-attendance-child-state={c.actual.state}
                                                data-attendance-child-day={c.serviceDay?.state ?? ""}
                                                title={childSentence(c)}
                                            >
                                                {c.serviceDay
                                                    ? serviceDayChipLabel(c.serviceDay.state, c.serviceDay.reasonKey)
                                                    : stateSentence(c.actual)}
                                            </span>
                                            {c.actual.state === "no_record" ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className={ACTION_PRIMARY}
                                                        disabled={busy}
                                                        onClick={() => childAttendance(c, openRoom, "check_in")}
                                                        data-attendance-child-checkin={c.customerMemberId}
                                                    >
                                                        {busy ? "…" : "Check in"}
                                                    </button>
                                                    {/* Already explained — offering "Mark absent"
                                                        again would invite a second, competing plan
                                                        for the same child on the same day. Check in
                                                        stays, because she may still walk in. */}
                                                    {c.serviceDay && !c.serviceDay.raisesAttention ? null : (
                                                        <select
                                                            className={`${ACTION} border border-alloy-stone/25 bg-white pr-1 font-medium text-alloy-midnight/75`}
                                                            disabled={busy}
                                                            value=""
                                                            onChange={(e) => {
                                                                const reason = e.target.value;
                                                                e.target.value = "";
                                                                if (reason) void planChildAbsence(c, openRoom, reason);
                                                            }}
                                                            aria-label={`Mark ${c.displayName} absent`}
                                                            data-attendance-child-absent={c.customerMemberId}
                                                        >
                                                            <option value="">Mark absent…</option>
                                                            {CHILD_AWAY_REASONS.map((r) => (
                                                                <option key={r.key} value={r.key}>
                                                                    {r.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </>
                                            ) : c.actual.state === "present" ? (
                                                <>
                                                    {/* Move is a select, not a dialog: picking the
                                                        destination IS the whole decision, and a
                                                        confirmation step on a reversible fact would
                                                        cost more than the mistake it prevents. */}
                                                    <select
                                                        className={`${ACTION} border border-alloy-stone/25 bg-white pr-1 font-medium text-alloy-midnight/75`}
                                                        disabled={busy}
                                                        value=""
                                                        onChange={(e) => {
                                                            const to = e.target.value;
                                                            e.target.value = "";
                                                            if (to) void childMove(c, to);
                                                        }}
                                                        aria-label={`Move ${c.displayName} to another room`}
                                                        data-attendance-child-move={c.customerMemberId}
                                                    >
                                                        <option value="">Move to…</option>
                                                        {(model?.cells ?? [])
                                                            .filter((cell) => cell.roomLocationId !== whereNow)
                                                            .map((cell) => (
                                                                <option key={cell.roomLocationId} value={cell.roomLocationId}>
                                                                    {cell.roomName}
                                                                </option>
                                                            ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        className={ACTION_SECONDARY}
                                                        disabled={busy}
                                                        onClick={() => childAttendance(c, openRoom, "check_out")}
                                                        data-attendance-child-checkout={c.customerMemberId}
                                                    >
                                                        Check out
                                                    </button>
                                                </>
                                            ) : null}
                                            {/* Correct is available wherever a fact exists to correct —
                                                including after checkout, which is when a wrong-child
                                                tap is usually noticed. */}
                                            {c.actual.latestFactId ? (
                                                <button
                                                    type="button"
                                                    className={`${ACTION} font-medium text-alloy-midnight/55 hover:bg-alloy-stone/10 hover:text-alloy-midnight`}
                                                    disabled={busy}
                                                    onClick={() => childCorrect(c, openRoom)}
                                                    data-attendance-child-correct={c.customerMemberId}
                                                    title="Undo the last attendance record for this child"
                                                >
                                                    Correct
                                                </button>
                                            ) : null}
                                        </div>
                                    </li>
                                );
                            })}
                            {openRoom.children.length === 0 ? (
                                <li className="py-2 text-[12px] text-alloy-midnight/45">No children expected</li>
                            ) : null}
                        </ul>
                    </section>
                </div>
            </div>
        );
    }

    // ── Overview + rooms ──────────────────────────────────────────────────────

    /*
     * Two honest answers to "how many children are in this room" — roster
     * presence (did my class come in) and physical occupancy (how many am I
     * looking at). The overview needs both, so the derivation is a pure module
     * that can be tested without mounting a workspace.
     */
    const overview = buildAttendanceOverviewModel(model?.cells ?? []);
    const { hereNowByRoom, awayFromPlacement } = overview;

    /*
     * The site reads as closed only when every scheduled child does. One room
     * being shut is a room-level fact and belongs on that room, not on a banner
     * that tells a director to go home.
     */
    const allChildren = (model?.cells ?? []).flatMap((c) => c.children);
    const closure =
        allChildren.length > 0 && allChildren.every((c) => c.serviceDay?.state === "closed")
            ? { reasonLabel: serviceDayReasonLabel(allChildren[0]?.serviceDay?.reasonKey ?? null) }
            : null;

    const exceptions = [
        ...(model?.cells ?? []).flatMap((c) => [
            // A child whose parent rang at seven has not "failed to arrive". Listing
            // her here is how the exception list becomes noise and stops being read.
            ...c.children
                .filter((s) => s.actual.state === "no_record" && (s.serviceDay?.raisesAttention ?? true))
                .map((s) => ({
                    key: `c:${s.customerMemberId}`,
                    label: `${s.displayName} has not arrived`,
                    room: c.roomName,
                })),
            // Here, and nobody expected her. Not a fault — but the one thing a
            // director would most want said out loud when she walks in.
            ...c.children
                .filter((s) => s.serviceDay?.state === "attended_despite_plan")
                .map((s) => ({
                    key: `u:${s.customerMemberId}`,
                    label: `${s.displayName} is here and was not expected`,
                    room: c.roomName,
                })),
            ...c.children
                .filter((s) => s.serviceDay?.state === "unknown")
                .map((s) => ({
                    key: `x:${s.customerMemberId}`,
                    label: `${s.displayName} — this child's plan could not be read`,
                    room: c.roomName,
                })),
            ...c.staff.filter((s) => s.actual.state === "no_record").map((s) => ({
                key: `s:${s.personId}`,
                label: `${s.displayName} has not arrived`,
                room: c.roomName,
            })),
        ]),
        // Not a problem to fix — a fact to know. A director who cannot see that
        // four of her toddlers are on the playground is missing the thing she
        // would most want to be told when she walks in.
        ...awayFromPlacement.map((a) => ({
            key: a.key,
            label: `${a.displayName} is in ${a.nowIn}`,
            room: a.placedIn,
        })),
    ];

    return (
        <div className={`${WS_SURFACE_CONTENT_PAD} min-h-0 flex-1 overflow-y-auto`} data-attendance-overview="true">
            <div className={`${WS_OVERVIEW_CONTENT} space-y-4`}>
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className={WS_EYEBROW}>Attendance</p>
                        <h2 className="text-[18px] font-semibold text-alloy-midnight">{date ? formatLongDate(date) : "Today"}</h2>
                        <p className="mt-0.5 text-[12px] text-alloy-midnight/60">{siteName}</p>
                    </div>
                    {/* Back to what was EXPECTED, carrying the room. */}
                    <div className="flex items-center gap-2">
                        {/* Only offered while the day is open — a closure on a closed
                            day would author a second statement saying the same thing. */}
                        {closure ? null : (
                            <select
                                className="min-h-[32px] rounded border border-alloy-stone/25 bg-white px-2 text-[11.5px] font-medium text-alloy-midnight/75"
                                value=""
                                disabled={busySubject === `site:${siteLocationId}`}
                                onChange={(e) => {
                                    const reason = e.target.value;
                                    e.target.value = "";
                                    if (reason) void closeSiteDay(reason);
                                }}
                                aria-label="Close the site for this day"
                                data-attendance-close-site="true"
                            >
                                <option value="">Close today…</option>
                                {CLOSURE_REASONS.map((r) => (
                                    <option key={r.key} value={r.key}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        )}
                        {onBackToRoster ? (
                            <button
                                type="button"
                                className="rounded border border-alloy-stone/25 px-2.5 py-1 text-[11.5px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                onClick={() => onBackToRoster(openRoomId)}
                                data-attendance-back-to-roster="true"
                            >
                                ← Roster
                            </button>
                        ) : null}
                    </div>
                </header>

                {error ? (
                    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
                ) : null}

                {/*
                    A closed day is not a day of absences. Saying it once, at the
                    top, is the difference between "we are shut" and a screen full
                    of children who appear to have failed to turn up.
                */}
                {closure ? (
                    <p
                        className="rounded border border-alloy-stone/30 bg-alloy-stone/10 px-3 py-2 text-[12.5px] font-medium text-alloy-midnight/80"
                        data-attendance-closed="true"
                    >
                        Closed today{closure.reasonLabel ? ` · ${closure.reasonLabel}` : ""} — no children are expected.
                    </p>
                ) : null}

                {model ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-attendance-metrics="true">
                        {/*
                            The four questions an operator asks about children, in
                            the order the day answers them. Staffing is not dropped —
                            it moved to the room cards, where being short is
                            actionable; a site-wide "rooms short" number tells a
                            director something is wrong without telling her where.
                        */}
                        {[
                            { label: "Expected", value: String(overview.counts.expected) },
                            { label: "Here now", value: String(overview.counts.present) },
                            { label: "Not arrived", value: String(overview.counts.notArrived) },
                            /*
                             * "Away" earns the fourth tile only when there IS
                             * someone away. On an ordinary day the operator wants
                             * Checked out; on a holiday week a zero would be the
                             * least informative number on the screen.
                             */
                            overview.counts.knownAway > 0
                                ? { label: "Away", value: String(overview.counts.knownAway) }
                                : { label: "Checked out", value: String(overview.counts.checkedOut) },
                        ].map((m) => (
                            <div key={m.label} className={`${WS_PANEL_SURFACE} px-3 py-2.5`}>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                                    {m.label}
                                </p>
                                <p className="mt-0.5 text-[20px] font-semibold text-alloy-midnight">{m.value}</p>
                            </div>
                        ))}
                    </div>
                ) : null}

                <div className="grid gap-3 lg:grid-cols-2" data-attendance-rooms="true">
                    {(model?.cells ?? []).map((cell) => (
                        <button
                            key={cell.roomLocationId}
                            type="button"
                            onClick={() => setOpenRoomId(cell.roomLocationId)}
                            className={`${WS_PANEL_SURFACE} min-h-[44px] p-3 text-left hover:ring-1 hover:ring-alloy-stone/30`}
                            data-attendance-room-card={cell.roomLocationId}
                            data-attendance-room-state={cell.actualStaffingSufficiency}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <h3 className="truncate text-[14px] font-semibold text-alloy-midnight">{cell.roomName}</h3>
                                <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sufficiencyChrome(cell.actualStaffingSufficiency)}`}
                                >
                                    {sufficiencyLabel(cell.actualStaffingSufficiency, cell)}
                                </span>
                            </div>
                            <dl className="mt-2.5 grid grid-cols-2 gap-2">
                                <div>
                                    <dt className="text-[10px] uppercase tracking-[0.08em] text-alloy-midnight/40">In this room</dt>
                                    <dd className="text-[15px] font-semibold text-alloy-midnight">
                                        {hereNowByRoom.get(cell.roomLocationId) ?? 0}
                                    </dd>
                                    {/* The roster figure stays visible, because
                                        "how many of my class came in" is a real and
                                        different question from "how many are here". */}
                                    <dd className="text-[10.5px] text-alloy-midnight/45">
                                        {cell.actualChildrenPresent}/{cell.expectedChildCount} of this class in
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-[10px] uppercase tracking-[0.08em] text-alloy-midnight/40">Staff</dt>
                                    <dd className="text-[15px] font-semibold text-alloy-midnight">
                                        {cell.actualStaffPresent} / {cell.scheduledStaffCount} present
                                    </dd>
                                </div>
                            </dl>
                        </button>
                    ))}
                </div>

                {exceptions.length > 0 ? (
                    <section className={`${WS_PANEL_SURFACE} p-3`} data-attendance-exceptions="true">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/50">
                            Needs attention ({exceptions.length})
                        </p>
                        <ul className="space-y-1">
                            {exceptions.slice(0, 12).map((x) => (
                                <li key={x.key} className="text-[12px] text-alloy-midnight/70">
                                    {x.label} · <span className="text-alloy-midnight/45">{x.room}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}
            </div>
        </div>
    );
}
