"use client";

/**
 * Daily Roster — the combined child + staff expectation for one day at one site.
 *
 * Room is the primary operational grouping, never a flat list of everyone at the
 * site. A director should be able to answer in seconds: which rooms are okay,
 * which are short, and who is expected there.
 *
 * Colour doctrine: Bend Pine only for a healthy evaluated state. `unknown` is
 * visually NEUTRAL — the platform could not resolve staffing demand, and painting
 * that green would be a lie the operator cannot see through. Short uses the
 * existing attention treatment.
 *
 * ── EXPECTED AND ACTUAL, TOGETHER ──
 *
 * This surface used to answer only "who should be here?". It still records nothing — Attendance
 * remains the authoring surface — but it now SHOWS the actual operating state beside the expected
 * one, because "what is happening today?" is the question Operations opens on and expectation alone
 * cannot answer it.
 *
 * Every actual number is read from the canonical combined projection. Nothing here recomputes a
 * ratio, and `actualRequiredStaff` in particular is demand derived from the children ACTUALLY
 * present — never the expected count, and never scheduled staff standing in for present staff.
 */

import { warmOperationsDayResult } from "@/lib/scheduling/operationsWorkspaceWarmCache";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, UserRound, Users } from "lucide-react";

import {
    WS_EYEBROW,
    WS_OVERVIEW_CONTENT,
    WS_PANEL_SURFACE,
    WS_SURFACE_CONTENT_PAD,
} from "@/components/workspace/workspaceTokens";
import {
    staffingChipChrome,
    staffingVerdictLabel,
} from "@/components/adminV2/scheduling/staffingChrome";
import {
    attentionSentence,
    compareByAttentionThenName,
} from "@/components/adminV2/scheduling/rosterOrdering";
import type {
    CombinedRosterReadModel,
    RosterCell as CombinedRosterCell,
} from "@/lib/roster/buildCombinedRoster";

type StaffingSufficiency = "sufficient" | "short" | "unknown" | "idle";

/** Kept only for the props this surface still exposes to its host. */
type RosterChild = {
    subjectType: "child";
    customerMemberId: string;
    enrollmentAgreementId: string;
    personId: string | null;
    displayName: string;
    timeLabel: string | null;
    scheduleTypeKey: string;
};

type RosterStaff = {
    subjectType: "staff";
    assignmentId: string;
    personId: string;
    displayName: string;
    positionLabel: string | null;
    timeLabel: string | null;
    roomName: string | null;
};

/*
 * ── THE CELL AND MODEL COME FROM THE CANONICAL PROJECTION, NOT A LOCAL COPY ──
 *
 * These were re-declared here, narrowed, and the narrowing silently DROPPED every actual-operating
 * field `/api/admin/roster` was already sending: `actualChildrenPresent`, `actualStaffPresent`,
 * `actualRequiredStaff`, `actualStaffingSufficiency`, `unscheduledStaffPresent`, and the per-subject
 * `actual` state. The surface answered "who should be here?" not because the truth was missing but
 * because its own type could not see it.
 *
 * Importing the read model makes that class of drift impossible: a field added to the projection is
 * visible here immediately, and a field removed is a compile error rather than a quietly empty card.
 * `import type` is erased at build time, so this pulls in no server code.
 */
type RosterCell = CombinedRosterCell;
type RosterModel = CombinedRosterReadModel;

export type DailyRosterProps = {
    siteLocationId: string;
    siteName: string;
    /**
     * The day being shown, owned by the host so it survives a Day→Week→Day trip.
     * Null means "not resolved yet" — the org's service date comes from the server,
     * never from the browser clock, so the first request omits the date entirely.
     */
    date: string | null;
    onDateChange: (date: string | null) => void;
    /** The org's today, once the server has told us. Enables the Today control. */
    serverToday: string | null;
    onServerToday: (ymd: string) => void;
    /** Roster's Day/Week control, rendered into this surface's toolbar by its host. */
    /**
     * Hand this room off to Attendance — expectation to actuality, same site, same
     * room. Attendance is a TODAY-ONLY surface (it has no date control at all), so
     * the affordance only appears when the roster is on the org's today. Opening
     * "today" from a roster showing next Tuesday would silently change the day the
     * operator believes they are looking at.
     */
    onOpenAttendance?: (roomLocationId: string) => void;
    /** Take this subject to the authoritative assignment surface. Roster never writes. */
    onManageAssignment?: (subject: RosterChild | RosterStaff) => void;
    /**
     * Report this day's health counts to the host, which renders them in the
     * workspace CONTROL BAND. Operational health belongs there, not in the body —
     * the body is the roster itself.
     */
    onHealth?: (counts: {
        roomsShort: number;
        roomsUnknown: number;
        expectedChildren: number;
        scheduledStaff: number;
        /** ACTUAL operating truth — the day band leads with these. */
        roomsActuallyShort: number;
        childrenPresent: number;
        staffPresent: number;
    } | null) => void;
    onOpenChild?: (subject: RosterChild) => void;
    onOpenStaff?: (subject: RosterStaff) => void;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatLongDate(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return `${DAYS[dt.getUTCDay()]}, ${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

function shiftYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

/*
 * ── THE DAY'S HEADLINE IS THE ACTUAL STATE ──
 *
 * Day Roster answers "what is happening now"; Week Roster answers "what is planned". The card's
 * dominant cues — accent, header chip, sentence — therefore read `actualStaffingSufficiency`, and
 * the PLANNED verdict stays visible below as the comparison half it has always been.
 *
 * This was a real defect, not a preference. A room could be planned-sufficient and actually short at
 * the same instant — precisely the state the actual verdict exists to expose — and the card led with
 * a green "Staffed" chip, a green accent and "1 of 1 staff scheduled" while its own comparison block
 * said Short two lines down. The strongest signal on the surface contradicted the one the operator
 * had to act on. No staffing math changed here; only which of the two canonical verdicts is loudest.
 */

/** Operator sentence for the room's ACTUAL operating state — meaning before numbers. */
function actualStateSentence(cell: RosterCell): string {
    if (cell.actualStaffingSufficiency === "idle") {
        /*
         * Two different silences, and they must not sound alike. "Nobody was expected" is a room
         * that is closed today; "nobody has arrived" is a room whose day has not started. Both are
         * neutral — never green — but only one of them is still waiting on somebody.
         */
        return cell.expectedChildCount > 0
            ? `No one here yet — ${cell.expectedChildCount} expected`
            : "No one expected in this room today";
    }
    if (cell.actualStaffingSufficiency === "unknown") {
        return "Staffing requirement not configured for this room";
    }
    if (cell.actualStaffingSufficiency === "short") {
        const gap = (cell.actualRequiredStaff ?? 0) - cell.actualStaffPresent;
        return `Short ${gap} staff right now`;
    }
    // The badge already says "Staffed"; repeating it here spent the sentence line
    // on nothing. Say the numbers the verdict was reached from — the PRESENT ones.
    return `${cell.actualStaffPresent} of ${cell.actualRequiredStaff ?? cell.actualStaffPresent} staff here now`;
}

/**
 * Verdict label for the ACTUAL half.
 *
 * The shared `staffingVerdictLabel` renders `idle` as "No one expected", which is true of a plan and
 * false of an observation: a room with two children expected and none arrived is not a room where no
 * one was expected. Same neutral tone, honest sentence.
 */
function actualVerdictLabel(cell: RosterCell): string {
    if (cell.actualStaffingSufficiency === "idle" && cell.expectedChildCount > 0) {
        return "No one here yet";
    }
    return staffingVerdictLabel(cell.actualStaffingSufficiency);
}

/**
 * The card's left accent, overriding the shared panel token's fixed juniper.
 * Same doctrine as the chip: pine only for an evaluated, met state.
 */
function accentForState(state: StaffingSufficiency): string {
    if (state === "short") return "!border-l-alloy-gold-dark";
    if (state === "sufficient") return "!border-l-[#00A283]";
    return "!border-l-alloy-stone";
}

function SubjectChip({
    label,
    meta,
    onClick,
    onManage,
    testAttr,
}: {
    label: string;
    meta: string | null;
    onClick?: () => void;
    /** Route to the authoritative assignment surface. Roster never rewrites a schedule. */
    onManage?: () => void;
    testAttr: Record<string, string>;
}) {
    const inner = (
        <>
            <span className="truncate text-[12.5px] font-medium text-alloy-midnight">{label}</span>
            {meta ? <span className="truncate text-[11px] text-alloy-midnight/50">{meta}</span> : null}
        </>
    );
    const body = !onClick ? (
        <div className="flex min-w-0 flex-col px-2 py-1.5">{inner}</div>
    ) : (
        <button
            type="button"
            onClick={onClick}
            className="flex min-w-0 flex-1 flex-col px-2 py-1.5 text-left hover:bg-alloy-stone/[0.06]"
        >
            {inner}
        </button>
    );
    return (
        <div
            className="group flex min-w-0 items-center gap-1 rounded border border-alloy-stone/20 hover:border-alloy-stone/40"
            {...testAttr}
        >
            {body}
            {onManage ? (
                <button
                    type="button"
                    onClick={onManage}
                    className="shrink-0 px-1.5 py-1 text-[10.5px] font-medium text-alloy-midnight/35 hover:text-[#00A283] group-hover:text-alloy-midnight/60"
                    title="Manage this assignment"
                    data-roster-manage-assignment="true"
                >
                    Manage →
                </button>
            ) : null}
        </div>
    );
}

export default function DailyRoster({
    siteLocationId,
    siteName,
    date,
    onDateChange,
    serverToday,
    onServerToday,
    onOpenAttendance,
    onManageAssignment,
    onHealth,
    onOpenChild,
    onOpenStaff,
}: DailyRosterProps) {
    const setDate = onDateChange;
    const setServerToday = onServerToday;
    const [model, setModel] = useState<RosterModel | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [openRoom, setOpenRoom] = useState<string | null>(null);
    /**
     * Stale-response guard. Switching site fires a request per site and they can
     * land out of order — the header renders the newly chosen site's name from the
     * workspace immediately, so a late response painted the PREVIOUS campus's rooms
     * under the new campus's name. Observed live: Riverside's name over Lakeside's
     * rooms. Only the newest request may write state.
     */
    const requestSeq = useRef(0);

    const load = useCallback(async () => {
        // The workspace mounts this before a site resolves; fetching on "" is a
        // guaranteed 400 and it fired twice on every open.
        if (!siteLocationId) return;
        const seq = ++requestSeq.current;
        setError(null);
        setModel(null);
        try {
            const dateParam = date ? `&date=${encodeURIComponent(date)}` : "";
            // Warm-first: the day survives the Operations modal unmount instead of reloading on
            // every open. Mutations drop it explicitly (`invalidateOperationsDay`) so a corrected
            // roster is never read from cache.
            const { data, error: loadError } = await warmOperationsDayResult(
                `/api/admin/roster?site_location_id=${encodeURIComponent(siteLocationId)}${dateParam}`
            );
            const json = (data ?? {}) as {
                roster?: RosterModel;
                todayYmd?: string;
                error?: string;
            };
            if (seq !== requestSeq.current) return;
            if (loadError) throw new Error(loadError);
            setModel(json.roster ?? null);
            if (json.todayYmd) setServerToday(json.todayYmd);
            // Adopt the org-local service date the server resolved.
            if (!date && json.roster?.date) setDate(json.roster.date);
        } catch (e) {
            if (seq !== requestSeq.current) return;
            setError(e instanceof Error ? e.message : "Could not load the roster");
        }
    }, [siteLocationId, date, setDate, setServerToday]);

    useEffect(() => {
        void load();
    }, [load]);

    const headline = useMemo(() => {
        if (!model) return null;
        const { totals } = model;
        const staffPart =
            totals.requiredStaff == null
                ? `${totals.scheduledStaff} staff scheduled`
                : `${totals.scheduledStaff} of ${totals.requiredStaff} staff scheduled`;
        return `${totals.expectedChildren} children expected · ${staffPart}`;
    }, [model]);

    /** A room with anyone expected or scheduled in it is operating today. */
    const isOperating = (c: RosterCell) => c.expectedChildCount > 0 || c.scheduledStaffCount > 0;

    /** Attendance can only ever show the org's service date — see `onOpenAttendance`. */
    const isToday = Boolean(date && serverToday && date === serverToday);

    /** Where the problems are — counts the read model computes and nothing rendered. */
    const attention = useMemo(() => {
        if (!model) return null;
        return attentionSentence({
            short: model.cells.filter((c) => c.staffingSufficiency === "short").length,
            unknownWhileOperating: model.cells.filter(
                (c) => c.staffingSufficiency === "unknown" && isOperating(c)
            ).length,
        });
    }, [model]);

    // The same counts the attention line uses, reported up for the control band.
    useEffect(() => {
        if (!onHealth) return;
        if (!model) {
            onHealth(null);
            return;
        }
        onHealth({
            roomsShort: model.cells.filter((c) => c.staffingSufficiency === "short").length,
            roomsUnknown: model.cells.filter(
                (c) => c.staffingSufficiency === "unknown" && isOperating(c)
            ).length,
            expectedChildren: model.totals.expectedChildren,
            scheduledStaff: model.totals.scheduledStaff,
            // Straight from the canonical totals — nothing is counted again here.
            roomsActuallyShort: model.totals.roomsActuallyShort,
            childrenPresent: model.totals.actualChildrenPresent,
            staffPresent: model.totals.actualStaffPresent,
        });
        // `isOperating` is a pure local helper; `model` is the only real input.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model, onHealth]);

    /**
     * Attention first, then name. Alphabetical put the only room with children in
     * it last, below the fold, behind two empty rooms.
     */
    const orderedCells = useMemo(() => {
        if (!model) return [];
        return [...model.cells].sort(
            compareByAttentionThenName((c) => ({
                // Attention order follows the SAME verdict the card leads with. Sorting a Day by
                // planned state would float a room that is fine right now above the one that is
                // actually short — the exact inversion the headline change exists to remove.
                verdict: c.actualStaffingSufficiency,
                operating: isOperating(c),
                name: c.roomName,
            }))
        );
    }, [model]);

    return (
        <div className={`${WS_SURFACE_CONTENT_PAD} min-h-0 flex-1 overflow-y-auto`} data-daily-roster="true">
            <div className={`${WS_OVERVIEW_CONTENT} space-y-4`}>
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className={WS_EYEBROW}>Roster</p>
                        <h2 className="text-[17px] font-semibold text-alloy-midnight">
                            {date ? formatLongDate(date) : "Today"}
                        </h2>
                        <p className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            {siteName}
                            {headline ? ` · ${headline}` : ""}
                        </p>
                    </div>
                    {/*
                      * The day anchor moved to `RosterControlBand`.
                      *
                      * It lived here, inside this header, which is why the date controls sat in a
                      * different place on Day than the week picker did on Week. A surface that owns
                      * its own anchor cannot share a toolbar with the surfaces beside it.
                      */}
                </header>

                {error ? (
                    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                        {error}
                    </p>
                ) : null}

                {model == null && !error ? (
                    <p className="text-[12px] text-alloy-midnight/50">Loading roster…</p>
                ) : null}

                {/* Where the problems are, before the rooms. Absent when there are
                    none — an invented "0 problems" badge stops being read. */}
                {attention ? (
                    <p
                        className="rounded-lg bg-alloy-gold/[0.10] px-3 py-2 text-[12px] font-medium text-alloy-midnight ring-1 ring-alloy-gold/30"
                        data-roster-attention="true"
                    >
                        {attention}
                    </p>
                ) : null}

                {model?.cells.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-alloy-stone/30 px-4 py-10 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/75">No rooms at this location</p>
                        <p className="mt-1 text-[12px] text-alloy-midnight/55">
                            Rooms are configured under Programs &amp; Locations.
                        </p>
                    </div>
                ) : null}

                <div className="grid gap-3 lg:grid-cols-2" data-roster-rooms="true">
                    {orderedCells.map((cell) => {
                        const isOpen = openRoom === cell.roomLocationId;
                        return (
                            <section
                                key={cell.roomLocationId}
                                /* The shared panel token carries a fixed juniper left
                                   accent, so every card read "fine" regardless of its
                                   verdict and the state lived only in a small badge.
                                   On a surface whose job is state legibility, the
                                   strongest colour cue has to be the state. */
                                className={`${WS_PANEL_SURFACE} p-3 ${accentForState(cell.actualStaffingSufficiency)}`}
                                data-roster-room={cell.roomLocationId}
                                /*
                                 * The room's DOMINANT state on a Day is its actual one. Published
                                 * under the same attribute the surface has always used, because the
                                 * question "what state is this room in" has one answer per range —
                                 * and the planned verdict remains separately readable below as
                                 * `data-roster-planned-state`, so nothing became unassertable.
                                 */
                                data-roster-state={cell.actualStaffingSufficiency}
                                data-roster-headline-basis="actual"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-[14px] font-semibold text-alloy-midnight">
                                            {cell.roomName}
                                        </h3>
                                        <p className="mt-0.5 text-[12px] text-alloy-midnight/60">
                                            {actualStateSentence(cell)}
                                        </p>
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${staffingChipChrome(cell.actualStaffingSufficiency)}`}
                                        data-roster-room-state={cell.actualStaffingSufficiency}
                                    >
                                        {actualVerdictLabel(cell)}
                                    </span>
                                </div>

                                {/*
                                  * EXPECTED beside HERE NOW — the comparison IS the card.
                                  *
                                  * Three rows, two columns, one heading pair. A spreadsheet of six
                                  * separate stats would carry the same numbers and make the operator
                                  * do the subtraction; the whole reason this surface exists is that
                                  * "12 expected" and "9 here" mean something together that neither
                                  * means alone.
                                  *
                                  * Required appears TWICE on purpose. Planned demand comes from the
                                  * children expected; actual demand comes from the children present.
                                  * They are different questions with different answers, and showing
                                  * one number would silently pick a side.
                                  */}
                                <div className="mt-3" data-roster-room-compare="true">
                                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3">
                                        <span />
                                        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-alloy-midnight/40">
                                            Expected
                                        </span>
                                        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-alloy-midnight/40">
                                            Here now
                                        </span>

                                        <span className="text-[11.5px] text-alloy-midnight/60">Children</span>
                                        <span
                                            className="text-right text-[15px] font-semibold tabular-nums text-alloy-midnight"
                                            data-roster-children-count={cell.expectedChildCount}
                                        >
                                            {cell.expectedChildCount}
                                        </span>
                                        <span
                                            className="text-right text-[15px] font-semibold tabular-nums text-alloy-midnight"
                                            data-roster-children-present={cell.actualChildrenPresent}
                                        >
                                            {cell.actualChildrenPresent}
                                        </span>

                                        <span className="text-[11.5px] text-alloy-midnight/60">Staff</span>
                                        <span
                                            className="text-right text-[15px] font-semibold tabular-nums text-alloy-midnight"
                                            data-roster-staff-count={cell.scheduledStaffCount}
                                        >
                                            {cell.scheduledStaffCount}
                                        </span>
                                        <span
                                            className="text-right text-[15px] font-semibold tabular-nums text-alloy-midnight"
                                            data-roster-staff-present={cell.actualStaffPresent}
                                        >
                                            {cell.actualStaffPresent}
                                        </span>

                                        <span className="text-[11.5px] text-alloy-midnight/60">Required</span>
                                        <span
                                            className="text-right text-[13px] font-medium tabular-nums text-alloy-midnight/70"
                                            data-roster-required={cell.requiredStaff ?? "unknown"}
                                        >
                                            {cell.requiredStaff ?? "—"}
                                        </span>
                                        <span
                                            className="text-right text-[13px] font-medium tabular-nums text-alloy-midnight/70"
                                            data-roster-required-actual={cell.actualRequiredStaff ?? "unknown"}
                                        >
                                            {cell.actualRequiredStaff ?? "—"}
                                        </span>
                                    </div>

                                    {/*
                                      * TWO VERDICTS, NEVER ONE.
                                      *
                                      * A room can be planned-sufficient and actually short at the
                                      * same instant — that is the entire reason the actual verdict
                                      * exists, and collapsing them into a single chip would hide the
                                      * only state an operator has to act on right now. Both come
                                      * from the canonical projection; neither is re-derived here.
                                      */}
                                    <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-alloy-stone/15 pt-2.5">
                                        <div>
                                            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-alloy-midnight/40">
                                                Planned staffing
                                            </p>
                                            <span
                                                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${staffingChipChrome(cell.staffingSufficiency)}`}
                                                data-roster-planned-state={cell.staffingSufficiency}
                                            >
                                                {staffingVerdictLabel(cell.staffingSufficiency)}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-alloy-midnight/40">
                                                Actual staffing
                                            </p>
                                            <span
                                                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${staffingChipChrome(cell.actualStaffingSufficiency)}`}
                                                data-roster-actual-state={cell.actualStaffingSufficiency}
                                            >
                                                {actualVerdictLabel(cell)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        className="text-[11.5px] font-medium text-[#00A283] hover:underline"
                                        onClick={() => setOpenRoom(isOpen ? null : cell.roomLocationId)}
                                        data-roster-room-toggle={cell.roomLocationId}
                                    >
                                        {isOpen ? "Hide who is expected" : "Who is expected"}
                                    </button>
                                    {/* Expectation → actuality. Only on today, because
                                        Attendance has no date control: it can only ever
                                        show the org's service date, and opening it from a
                                        future roster would change the day underneath the
                                        operator without saying so. */}
                                    {onOpenAttendance ? (
                                        isToday ? (
                                            <button
                                                type="button"
                                                className="text-[11.5px] font-medium text-[#00A283] hover:underline"
                                                onClick={() => onOpenAttendance(cell.roomLocationId)}
                                                data-roster-open-attendance={cell.roomLocationId}
                                            >
                                                Capture attendance →
                                            </button>
                                        ) : (
                                            <span
                                                className="text-[11.5px] text-alloy-midnight/40"
                                                title="Attendance records what is happening now, so it only shows today."
                                                data-roster-attendance-unavailable={cell.roomLocationId}
                                            >
                                                Attendance is today only
                                            </span>
                                        )
                                    ) : null}
                                </div>

                                {isOpen ? (
                                    <div className="mt-3 space-y-3 border-t border-alloy-stone/15 pt-3">
                                        <div>
                                            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-alloy-midnight/65">
                                                <Users className="h-3.5 w-3.5" aria-hidden />
                                                Children ({cell.children.length})
                                            </p>
                                            {cell.children.length === 0 ? (
                                                <p className="text-[12px] text-alloy-midnight/45">
                                                    No children expected
                                                </p>
                                            ) : (
                                                <div className="grid gap-1.5 sm:grid-cols-2">
                                                    {cell.children.map((c) => (
                                                        <SubjectChip
                                                            key={c.customerMemberId}
                                                            label={c.displayName}
                                                            meta={c.timeLabel}
                                                            onClick={
                                                                onOpenChild ? () => onOpenChild(c) : undefined
                                                            }
                                                            onManage={
                                                                onManageAssignment
                                                                    ? () => onManageAssignment(c)
                                                                    : undefined
                                                            }
                                                            testAttr={{
                                                                "data-roster-child": c.customerMemberId,
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-alloy-midnight/65">
                                                <UserRound className="h-3.5 w-3.5" aria-hidden />
                                                Staff ({cell.staff.length})
                                            </p>
                                            {cell.staff.length === 0 ? (
                                                <p className="text-[12px] text-alloy-midnight/45">
                                                    No staff scheduled
                                                </p>
                                            ) : (
                                                <div className="grid gap-1.5 sm:grid-cols-2">
                                                    {cell.staff.map((s) => (
                                                        <SubjectChip
                                                            key={s.assignmentId}
                                                            label={s.displayName}
                                                            meta={
                                                                [s.positionLabel, s.timeLabel]
                                                                    .filter(Boolean)
                                                                    .join(" · ") || null
                                                            }
                                                            onClick={
                                                                onOpenStaff ? () => onOpenStaff(s) : undefined
                                                            }
                                                            onManage={
                                                                onManageAssignment
                                                                    ? () => onManageAssignment(s)
                                                                    : undefined
                                                            }
                                                            testAttr={{ "data-roster-staff": s.personId }}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : null}
                            </section>
                        );
                    })}
                </div>

                {(model?.unroomedStaff.length ?? 0) > 0 ? (
                    <section className={`${WS_PANEL_SURFACE} p-3`} data-roster-unroomed="true">
                        <h3 className="text-[13px] font-semibold text-alloy-midnight">
                            Scheduled at this site, no room assigned
                        </h3>
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                            {(model?.unroomedStaff ?? []).map((s) => (
                                <SubjectChip
                                    key={s.assignmentId}
                                    label={s.displayName}
                                    meta={s.positionLabel}
                                    onClick={onOpenStaff ? () => onOpenStaff(s) : undefined}
                                    onManage={
                                        onManageAssignment ? () => onManageAssignment(s) : undefined
                                    }
                                    testAttr={{ "data-roster-staff": s.personId }}
                                />
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>
        </div>
    );
}
