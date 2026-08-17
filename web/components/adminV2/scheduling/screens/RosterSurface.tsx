"use client";

/**
 * Roster — one surface, two ranges.
 *
 * There used to be two tabs: "Roster" (a room × weekday board) and "Daily Roster"
 * (rooms for one day). They read the same subject matter through two projections
 * and told different stories about it, and the operator had to know which tab
 * answered which question. Day and Week are a RANGE of one surface, not two
 * products.
 *
 * The two ranges still come from two read models — `buildCombinedRoster` for a
 * day, `buildRosterReadModel` for a week — and that is fine: they are the same
 * facts indexed differently, and both resolve their verdict through the same
 * `staffingSufficiency` contract. What must not differ is what the operator is
 * told, so the chips, the ordering and the attention line are shared code.
 *
 * This is the EXPECTATION layer. Nothing here reads or writes attendance.
 */

import { useCallback, useState } from "react";

import { mondayOfWeekContaining, addDaysYmdLocal } from "@/components/workspace/WeekPicker";
import DailyRoster from "@/components/adminV2/scheduling/screens/DailyRoster";
import RosterControlBand from "@/components/adminV2/scheduling/screens/RosterControlBand";
import RosterStaffLens, {
    type RosterStaffLensSubject,
} from "@/components/adminV2/scheduling/screens/RosterStaffLens";
import AssignmentRosterPanel, {
    type AssignmentRosterBulkHandlers,
    type AssignmentRosterSubject,
} from "@/components/adminV2/scheduling/screens/AssignmentRosterPanel";
import SchedulingRoster, {
    type RosterData,
    type RosterFilterContext,
} from "@/components/adminV2/scheduling/screens/SchedulingRoster";
import type { RosterRange } from "@/app/adminV2/operations/operationsSections";

/**
 * Rooms is the operating view. Staff answers "where is Jane this week" — a pivot
 * of the same week data, offered only at the week range because a single day's
 * staff list is already on the Rooms cards.
 *
 * ASSIGNMENTS is the third, and it is a different grain rather than a third pivot: Rooms and Staff
 * read the operating DAY (who is expected where, given the commitments), while Assignments reads the
 * COMMITMENTS themselves — every subject the site holds, whether or not today expects them. That is
 * why it ignores range and site-day state and renders the ledger panel directly.
 *
 * It is a lens and NOT a fifth Work section, deliberately. A section would make "Assignments" a
 * destination again, which is the workspace noun the Operations convergence removes; a lens keeps it
 * as a way of looking at the Roster's own subject matter.
 */
export type RosterLens = "rooms" | "staff" | "assignments";

export type RosterSurfaceProps = {
    range: RosterRange;
    onRangeChange: (range: RosterRange) => void;
    lens: RosterLens;
    onLensChange: (lens: RosterLens) => void;

    siteLocationId: string;
    siteName: string;

    // ── Week range ───────────────────────────────────────────────────────────
    weekData: RosterData | null;
    assignmentSubjects: AssignmentRosterSubject[];
    loadingWeek: boolean;
    focusRoomId?: string;
    filter?: RosterFilterContext | null;
    onClearFilter?: () => void;
    onSelectCell?: (roomId: string, dayKey: string) => void;
    onSelectRoom?: (roomId: string) => void;
    onWeekChange?: (dir: -1 | 1 | 0) => void;
    onSelectWeek?: (weekStart: string) => void;
    weekChangePending?: boolean;
    lastWeekLoadMs?: number | null;

    // ── Day range ────────────────────────────────────────────────────────────
    onOpenChild?: Parameters<typeof DailyRoster>[0]["onOpenChild"];
    onOpenStaff?: Parameters<typeof DailyRoster>[0]["onOpenStaff"];
    /** Hand a room off to Attendance — expectation into actuality, context intact. */
    onOpenAttendance?: Parameters<typeof DailyRoster>[0]["onOpenAttendance"];
    /** Route a subject to the authoritative assignment surface. */
    onManageAssignment?: Parameters<typeof DailyRoster>[0]["onManageAssignment"];
    /** Record attention from the Staff lens — same gesture as everywhere else. */
    onOpenStaffSubject?: (subject: RosterStaffLensSubject) => void;
    /**
     * The ledger's bulk commands, for the Assignments lens. Built by
     * `buildAssignmentRosterBulkHandlers` — the same wiring the Assignments workspace uses, so the
     * two hosts cannot drift into two answers about what "archive these" does.
     */
    assignmentBulk?: AssignmentRosterBulkHandlers;
    /** Day-range health counts, for the workspace control band. */
    onDayHealth?: Parameters<typeof DailyRoster>[0]["onHealth"];
};

/*
 * Range and lens controls, and the valid-combination matrix, live in `RosterControlBand`.
 *
 * They were declared here and rendered in four different places by four different children. Moving
 * them out is the point of the slice: one owner, one position, one statement of which combinations
 * are real — and `lensesForRange` in particular is gone rather than relocated, because returning a
 * shorter list on Day is what made the Staff pill physically disappear and the row re-flow.
 */

export default function RosterSurface({
    range,
    onRangeChange,
    lens,
    onLensChange,
    siteLocationId,
    siteName,
    weekData,
    assignmentSubjects,
    loadingWeek,
    focusRoomId,
    filter,
    onClearFilter,
    onSelectCell,
    onSelectRoom,
    onWeekChange,
    onSelectWeek,
    weekChangePending,
    lastWeekLoadMs,
    onOpenChild,
    onOpenStaff,
    onOpenAttendance,
    onManageAssignment,
    onOpenStaffSubject,
    assignmentBulk,
    onDayHealth,
}: RosterSurfaceProps) {
    /**
     * The day lives HERE, not inside the day view, so a Day → Week → Day trip comes
     * back to the day the operator was looking at. Owned by the day view, the state
     * unmounted on every range switch and the surface silently reset to today —
     * "stable context" is the whole reason Roster is one surface instead of two tabs.
     */
    const [day, setDay] = useState<string | null>(null);
    const [serverToday, setServerToday] = useState<string | null>(null);

    /**
     * Switching range keeps the operator at the same moment in time, in both
     * directions: Day → Week shows the week containing that day, and Week → Day
     * lands inside the displayed week — on today when the week contains it, else on
     * its Monday. Jumping silently back to today on either switch is the context
     * loss this surface exists to avoid.
     */
    const changeRange = useCallback(
        (next: RosterRange) => {
            if (next === range) return;
            if (next === "week" && day) {
                onSelectWeek?.(mondayOfWeekContaining(day));
            }
            if (next === "day") {
                const weekStart = weekData?.weekStart ?? null;
                if (weekStart) {
                    const weekEnd = addDaysYmdLocal(weekStart, 6);
                    const withinWeek =
                        serverToday && serverToday >= weekStart && serverToday <= weekEnd;
                    setDay(withinWeek ? serverToday : weekStart);
                }
            }
            onRangeChange(next);
        },
        [range, day, serverToday, weekData, onRangeChange, onSelectWeek],
    );

    /*
     * ── ONE BAND, ABOVE EVERYTHING ──
     *
     * Rendered once, in the same container, in every range × lens state. Children below receive
     * selected state and data only; not one of them decides where a control sits, and none renders
     * a date or week picker of its own. That is the whole of UX-3: the operator's target stops
     * moving because of something they did somewhere else.
     */
    const band = (
        <RosterControlBand
            range={range}
            onRangeChange={changeRange}
            lens={lens}
            onLensChange={onLensChange}
            /*
             * The day the surface is ACTUALLY showing.
             *
             * `day` is null until the operator moves it; the day surface falls back to the org's
             * today internally. While the anchor lived inside that surface the distinction never
             * surfaced, but a shared band reading raw `day` renders an EMPTY date on first open —
             * a control that does not say where you are. The band shows the effective day, and
             * `setDay` still records only a deliberate change.
             */
            day={day ?? serverToday}
            onDayChange={setDay}
            serverToday={serverToday}
            weekStart={weekData?.weekStart ?? null}
            weekLabel={weekData?.weekLabel ?? null}
            weekChangePending={weekChangePending}
            onWeekChange={onWeekChange}
            onSelectWeek={onSelectWeek}
        />
    );

    /*
     * ── THE COMMITMENT LENS ──
     *
     * Checked FIRST, and ahead of every range branch, because it is the one lens that does not read
     * the operating day: an assignment exists whether or not today expects it, so a Day/Week split
     * would be asking a question the ledger has no answer to.
     *
     * `assignmentSubjects` is the array this surface ALREADY receives for the Rooms lens — the same
     * `?view=assignment_roster` projection the Assignments workspace read. No second fetch, no
     * second shape, and nothing here re-derives a commitment.
     */
    const body =
        lens === "assignments" ? (
            <div
                className="flex min-h-0 flex-1 flex-col"
                data-roster-assignments-lens="true"
                // The site these commitments belong to. Published because "the lens shows the
                // ledger" is only checkable against the SAME site — and an empty lens is the correct
                // answer for a site with no assignments, which a row count alone cannot tell apart
                // from a broken one.
                data-roster-assignments-site={siteLocationId}
            >
                <AssignmentRosterPanel
                    subjects={assignmentSubjects}
                    loading={loadingWeek}
                    siteName={siteName}
                    bulk={assignmentBulk}
                />
            </div>
        ) : range === "week" && lens === "staff" ? (
            <RosterStaffLens
                data={weekData}
                loading={loadingWeek}
                siteName={siteName}
                onOpenStaff={onOpenStaffSubject}
            />
        ) : range === "week" ? (
            <SchedulingRoster
                data={weekData}
                assignmentSubjects={assignmentSubjects}
                loading={loadingWeek}
                siteName={siteName}
                focusRoomId={focusRoomId}
                filter={filter}
                onClearFilter={onClearFilter}
                onSelectCell={onSelectCell}
                onSelectRoom={onSelectRoom}
                onWeekChange={onWeekChange}
                onSelectWeek={onSelectWeek}
                weekChangePending={weekChangePending}
                lastWeekLoadMs={lastWeekLoadMs}
            />
        ) : (
            <DailyRoster
                siteLocationId={siteLocationId}
                siteName={siteName}
                date={day}
                onDateChange={setDay}
                serverToday={serverToday}
                onServerToday={setServerToday}
                onOpenAttendance={onOpenAttendance}
                onManageAssignment={onManageAssignment}
                onHealth={onDayHealth}
                onOpenChild={onOpenChild}
                onOpenStaff={onOpenStaff}
            />
        );

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3" data-roster-surface="true">
            {band}
            {body}
        </div>
    );
}
