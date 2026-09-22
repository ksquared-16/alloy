"use client";

/**
 * CALENDAR — when and where, for one site on one day.
 *
 * Roster answers WHO: who belongs here, who is expected, who is present. Calendar
 * answers WHEN and WHERE: when children are expected, when staff are expected,
 * where they are planned, and where the day goes short. The two are lenses over
 * the same certified truth and neither recomputes the other's arithmetic.
 *
 * ── THE SURFACE DOES NO STAFFING MATH ──
 *
 * Every number, every verdict and every sentence on this screen comes from the
 * certified temporal projection. React decides pixels: which lane, how wide a
 * block, what colour a chip. The moment a component started deciding whether a
 * room was short, there would be two staffing engines and the UI's would be the
 * one operators believed.
 *
 * ── AND IT AUTHORS NOTHING DIRECTLY ──
 *
 * Coverage is planned, changed and cancelled through the registered commands, so
 * this surface gets the same authorization, atomicity, audit and operator-facing
 * conflict message as any other caller. There is no Calendar-private write path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { staffingChipChrome, staffingVerdictLabel } from "@/components/adminV2/scheduling/staffingChrome";
import { addDaysYmdLocal } from "@/components/workspace/WeekPicker";
import {
    buildCalendarLanes,
    candidatesForGap,
    gapCommandContext,
    hourTicks,
    operatingWindow,
    percentSpan,
    type CalendarLane,
} from "@/lib/staffingProjection/calendarLayout";
import type {
    StaffingProjectionDay,
    StaffingProjectionSegment,
} from "@/lib/staffingProjection/staffingProjectionTypes";
import {
    callOutCommand,
    cancelCoverageCommand,
    planCoverageCommand,
} from "@/components/adminV2/calendar/coverageCommands";

type Props = {
    siteLocationId: string;
    siteName: string;
    day: string | null;
    onDayChange: (ymd: string) => void;
    serverToday: string | null;
    onServerToday?: (ymd: string) => void;
    /** Opens the canonical Focus Panel for a person. Calendar builds no drawer. */
    onOpenStaff?: (personId: string) => void;
};

/** Segment fill. The doctrine lives in staffingChrome; this is its block form. */
function segmentChrome(segment: StaffingProjectionSegment): string {
    if (segment.plannedState === "short") return "bg-alloy-gold/35 hover:bg-alloy-gold/50";
    if (segment.plannedState === "sufficient") return "bg-[#00A283]/20 hover:bg-[#00A283]/30";
    // unknown and idle are both neutral, and neither is green.
    return "bg-alloy-stone/20 hover:bg-alloy-stone/30";
}

function laneTitle(lane: CalendarLane): string {
    if (lane.roomLocationId === null) return "Site — no room";
    return lane.roomName ?? "Room";
}

/** "8:00 AM" from "08:00", in the operator's own reading of the clock. */
function clockLabel(hhmm: string): string {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h < 12 ? "AM" : "PM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function longDate(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}

export default function OperationsCalendarSurface({
    siteLocationId,
    siteName,
    day,
    onDayChange,
    serverToday,
    onServerToday,
    onOpenStaff,
}: Props) {
    const [projection, setProjection] = useState<StaffingProjectionDay | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<StaffingProjectionSegment | null>(null);
    const [busy, setBusy] = useState(false);
    const [commandMessage, setCommandMessage] = useState<string | null>(null);
    const requestRef = useRef(0);

    const load = useCallback(async () => {
        if (!siteLocationId) return;
        const seq = (requestRef.current += 1);
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ site_location_id: siteLocationId });
            if (day) params.set("date", day);
            // An unclosed check-in runs to now, not to the end of the day.
            if (day && serverToday && day === serverToday) {
                const now = new Date();
                params.set(
                    "as_of",
                    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
                );
            }
            const res = await fetch(`/api/admin/scheduling/staffing-projection?${params.toString()}`);
            const json = await res.json().catch(() => ({}));
            if (seq !== requestRef.current) return;
            if (!res.ok) {
                setError(typeof json?.error === "string" ? json.error : "The staffing picture could not be loaded.");
                setProjection(null);
                return;
            }
            const first = (json?.projection?.days ?? [])[0] ?? null;
            setProjection(first);
            if (json?.todayYmd && onServerToday) onServerToday(json.todayYmd);
            if (!day && json?.todayYmd) onDayChange(json.todayYmd);
        } catch {
            if (seq === requestRef.current) {
                setError("The staffing picture could not be loaded.");
                setProjection(null);
            }
        } finally {
            if (seq === requestRef.current) setLoading(false);
        }
    }, [siteLocationId, day, serverToday, onServerToday, onDayChange]);

    useEffect(() => {
        void load();
    }, [load]);

    const lanes = useMemo(
        () => (projection ? buildCalendarLanes(projection.segments) : []),
        [projection]
    );
    const window = useMemo(
        () => (projection ? operatingWindow(projection.segments) : null),
        [projection]
    );

    // Selection is by identity of the interval, so it survives a refresh after a
    // command — the operator stays where they were looking.
    useEffect(() => {
        if (!selected || !projection) return;
        const again = projection.segments.find(
            (s) =>
                s.start === selected.start &&
                s.end === selected.end &&
                s.roomLocationId === selected.roomLocationId
        );
        setSelected(again ?? null);
    }, [projection]); // eslint-disable-line react-hooks/exhaustive-deps

    const runCommand = useCallback(
        async (fn: () => Promise<{ ok: boolean; message: string | null }>) => {
            setBusy(true);
            setCommandMessage(null);
            try {
                const result = await fn();
                setCommandMessage(result.ok ? "Done." : result.message);
                if (result.ok) await load();
            } finally {
                setBusy(false);
            }
        },
        [load]
    );

    const state = loading ? "loading" : error ? "error" : projection ? "ready" : "pending";

    return (
        <div
            className="space-y-3"
            data-operations-calendar-state={state}
            data-calendar-date={day ?? ""}
            data-calendar-site={siteLocationId}
        >
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-40"
                    disabled={!day}
                    onClick={() => day && onDayChange(addDaysYmdLocal(day, -1))}
                    data-calendar-prev-day="true"
                    aria-label="Previous day"
                >
                    ‹
                </button>
                <span className="text-sm font-semibold text-alloy-midnight" data-calendar-day-label="true">
                    {day ? longDate(day) : "—"}
                </span>
                <button
                    type="button"
                    className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-40"
                    disabled={!day}
                    onClick={() => day && onDayChange(addDaysYmdLocal(day, 1))}
                    data-calendar-next-day="true"
                    aria-label="Next day"
                >
                    ›
                </button>
                {serverToday && day !== serverToday ? (
                    <button
                        type="button"
                        className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                        onClick={() => onDayChange(serverToday)}
                        data-calendar-today="true"
                    >
                        Today
                    </button>
                ) : null}
                <span className="ml-auto text-[12px] text-alloy-midnight/55">{siteName}</span>
            </div>

            {error ? (
                <div className="rounded-xl border border-alloy-stone/20 bg-white/70 px-4 py-6 text-sm text-alloy-midnight/70">
                    {error}
                </div>
            ) : null}

            {!error && projection && !projection.actualsObserved ? (
                <p className="text-[12px] text-alloy-midnight/55" data-calendar-actuals="not-observed">
                    Nothing has been observed for this day yet — the actual columns are unknown, not zero.
                </p>
            ) : null}

            {!error && lanes.length === 0 && !loading ? (
                <div
                    className="rounded-xl border border-alloy-stone/20 bg-white/70 px-4 py-6 text-sm text-alloy-midnight/70"
                    data-calendar-empty="true"
                >
                    Nothing is scheduled at {siteName} on this day. No children are expected and no staff hours
                    are recorded, so there is no operating picture to show.
                </div>
            ) : null}

            {window && lanes.length > 0 ? (
                <div className="space-y-2">
                    {/* The scale, laid out exactly like a lane so a tick sits over the
                        minute it names rather than near it. */}
                    <div className="flex items-stretch gap-2">
                        <div className="w-[168px] shrink-0" />
                        <div className="relative h-4 flex-1">
                            {hourTicks(window).map((t) => {
                                const { leftPct } = percentSpan(window, { start: t, end: t });
                                return (
                                    <span
                                        key={t}
                                        className="absolute -translate-x-1/2 text-[11px] text-alloy-midnight/45"
                                        style={{ left: `${leftPct}%` }}
                                    >
                                        {clockLabel(t)}
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {lanes.map((lane) => (
                        <div
                            key={lane.roomLocationId ?? "__site__"}
                            className="rounded-xl border border-alloy-stone/15 bg-white/70 p-3"
                            data-calendar-lane={lane.roomLocationId ?? "__site__"}
                            data-calendar-lane-state={lane.state}
                        >
                            <div className="flex flex-wrap items-baseline gap-2">
                                <span className="text-sm font-semibold text-alloy-midnight">{laneTitle(lane)}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] ${staffingChipChrome(lane.state)}`}>
                                    {staffingVerdictLabel(lane.state)}
                                </span>
                                <span className="text-[12px] text-alloy-midnight/60">
                                    {lane.expectedChildrenPeak} expected
                                    {lane.actualChildrenPeak != null ? ` · ${lane.actualChildrenPeak} present` : ""}
                                    {" · needs "}
                                    {lane.requiredStaffPeak == null ? "unknown" : lane.requiredStaffPeak}
                                    {` · ${lane.plannedStaffPeak} planned`}
                                    {lane.actualStaffPeak != null ? ` · ${lane.actualStaffPeak} here` : ""}
                                </span>
                            </div>

                            <div className="mt-2 flex items-stretch gap-2">
                                <div className="w-[168px] shrink-0 text-[11px] text-alloy-midnight/50">
                                    {lane.gapSegments.length > 0
                                        ? `${lane.gapSegments.length} short ${lane.gapSegments.length === 1 ? "stretch" : "stretches"}`
                                        : lane.hasUnknown
                                          ? "Some intervals unknown"
                                          : "Covered all day"}
                                </div>
                                <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-alloy-stone/5">
                                    {lane.segments.map((segment) => {
                                        const { leftPct, widthPct } = percentSpan(window, segment);
                                        const isSelected =
                                            selected?.start === segment.start &&
                                            selected?.end === segment.end &&
                                            selected?.roomLocationId === segment.roomLocationId;
                                        return (
                                            <button
                                                key={`${segment.start}-${segment.end}`}
                                                type="button"
                                                onClick={() => setSelected(isSelected ? null : segment)}
                                                className={`absolute top-0 h-full border-r border-white/70 transition ${segmentChrome(segment)} ${isSelected ? "ring-2 ring-alloy-blue ring-inset" : ""}`}
                                                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                                data-calendar-segment={`${segment.start}-${segment.end}`}
                                                data-calendar-segment-state={segment.plannedState}
                                                data-calendar-gap={segment.plannedState === "short" ? "true" : "false"}
                                                aria-label={`${clockLabel(segment.start)} to ${clockLabel(segment.end)}, ${staffingVerdictLabel(segment.plannedState)}`}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {selected ? (
                <SegmentDetail
                    segment={selected}
                    allSegments={projection?.segments ?? []}
                    busy={busy}
                    message={commandMessage}
                    onOpenStaff={onOpenStaff}
                    onPlan={(personId, employmentId) => {
                        const ctx = gapCommandContext(selected) ?? {
                            siteLocationId: selected.siteLocationId,
                            roomLocationId: selected.roomLocationId,
                            date: selected.date,
                            startTime: selected.start,
                            endTime: selected.end,
                            shortfall: 0,
                        };
                        void runCommand(() =>
                            planCoverageCommand({
                                personId,
                                employmentId,
                                serviceDate: ctx.date,
                                startTime: ctx.startTime,
                                endTime: ctx.endTime,
                                siteLocationId: ctx.siteLocationId,
                                roomLocationId: ctx.roomLocationId,
                                reasonKey: "operations_calendar_gap",
                            })
                        );
                    }}
                    onCancelCoverage={(personId, coverageId) =>
                        void runCommand(() =>
                            cancelCoverageCommand({ personId, coverageId, reasonKey: "operations_calendar" })
                        )
                    }
                    onCallOut={(personId, employmentId) =>
                        void runCommand(() =>
                            callOutCommand({
                                personId,
                                employmentId,
                                date: selected.date,
                                reason: "called_out",
                            })
                        )
                    }
                />
            ) : null}
        </div>
    );
}

/**
 * One interval, explained.
 *
 * The lines come from the projection's explanation contract rather than being
 * assembled here, so this panel and any other consumer say the same thing about
 * the same segment.
 */
function SegmentDetail({
    segment,
    allSegments,
    busy,
    message,
    onOpenStaff,
    onPlan,
    onCancelCoverage,
    onCallOut,
}: {
    segment: StaffingProjectionSegment;
    allSegments: readonly StaffingProjectionSegment[];
    busy: boolean;
    message: string | null;
    onOpenStaff?: (personId: string) => void;
    onPlan: (personId: string, employmentId: string) => void;
    onCancelCoverage: (personId: string, coverageId: string) => void;
    onCallOut: (personId: string, employmentId: string) => void;
}) {
    const candidates = useMemo(() => candidatesForGap(segment, allSegments), [segment, allSegments]);
    const plannedNotPresent = new Set(
        segment.actualStaff == null
            ? []
            : segment.plannedStaff
                  .filter((p) => !segment.actualStaff!.some((a) => a.employmentId === p.employmentId))
                  .map((p) => p.employmentId)
    );

    return (
        <div
            className="rounded-xl border border-alloy-stone/20 bg-white/80 p-4"
            data-calendar-detail="true"
            data-calendar-detail-segment={`${segment.start}-${segment.end}`}
        >
            <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-alloy-midnight">
                    {clockLabel(segment.start)} – {clockLabel(segment.end)}
                </span>
                <span className="text-[12px] text-alloy-midnight/60">
                    {segment.roomLocationId === null ? "Site — no room" : (segment.roomName ?? "Room")}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${staffingChipChrome(segment.plannedState)}`}>
                    {staffingVerdictLabel(segment.plannedState)}
                </span>
            </div>

            <ul className="mt-2 space-y-0.5 text-[12px] text-alloy-midnight/70" data-calendar-explanation="true">
                {segment.explanation.lines.map((line) => (
                    <li key={line}>{line}</li>
                ))}
            </ul>

            {segment.plannedStaff.length > 0 ? (
                <div className="mt-3 space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-alloy-midnight/45">Planned here</p>
                    {segment.plannedStaff.map((p) => (
                        <div key={p.employmentId} className="flex flex-wrap items-center gap-2 text-[12px]">
                            <button
                                type="button"
                                className="font-medium text-alloy-blue hover:underline"
                                onClick={() => onOpenStaff?.(p.personId)}
                                data-calendar-staff={p.personId}
                            >
                                {p.displayName}
                            </button>
                            <span className="text-alloy-midnight/50">
                                {p.source === "coverage" ? "Coverage" : "Assignment"}
                            </span>
                            {plannedNotPresent.has(p.employmentId) ? (
                                <span className="text-alloy-midnight/45" data-calendar-not-present="true">
                                    not observed here
                                </span>
                            ) : null}
                            <button
                                type="button"
                                className="rounded border border-alloy-stone/25 px-2 py-0.5 text-[11px] text-alloy-midnight/65 hover:bg-alloy-stone/10 disabled:opacity-40"
                                disabled={busy}
                                onClick={() => onCallOut(p.personId, p.employmentId)}
                                data-calendar-call-out={p.personId}
                                title="Record that this person cannot work today. Their Coverage is not cancelled for them."
                            >
                                Called out
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            {segment.plannedState === "short" ? (
                <div className="mt-3" data-calendar-fill-gap="true">
                    <p className="text-[11px] uppercase tracking-wide text-alloy-midnight/45">
                        Who could cover this stretch
                    </p>
                    {candidates.length === 0 ? (
                        <p className="mt-1 text-[12px] text-alloy-midnight/55">
                            Nobody is recorded as available and unplanned in this interval.
                        </p>
                    ) : (
                        <div className="mt-1 flex flex-wrap gap-2">
                            {candidates.map((c) => (
                                <button
                                    key={c.employmentId}
                                    type="button"
                                    className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] text-alloy-midnight/75 hover:bg-alloy-stone/10 disabled:opacity-40"
                                    disabled={busy}
                                    onClick={() => onPlan(c.personId, c.employmentId)}
                                    data-calendar-candidate={c.personId}
                                >
                                    Plan {c.displayName} here
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            {message ? (
                <p className="mt-3 text-[12px] text-alloy-midnight/75" data-calendar-command-message="true">
                    {message}
                </p>
            ) : null}
        </div>
    );
}
