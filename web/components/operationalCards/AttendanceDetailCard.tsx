"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { SectionHead } from "@/components/cardLab/CardLabKit";
import type {
    AttendanceHistoryDayVM,
    AttendanceHistoryEventVM,
} from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";

/**
 * Attendance Details — the child's attendance record over TIME.
 *
 * The summary answers "what is happening with this child today". This answers "show me this child's
 * attendance record", and the two are different shapes: a day is a timeline, a record is a table.
 * Rendering a larger copy of today's timeline would have been the easy move and the wrong one — an
 * operator reconciling a month does not want thirty timelines, they want thirty rows they can scan
 * and one they can open.
 *
 * ── CORRECTIONS ARE VISIBLE, NEVER APPLIED ──
 *
 * Attendance is append-only: a correction supersedes an event, it does not edit it. A day carrying
 * one is marked, and inside the day BOTH events remain with the superseded one struck. Flattening
 * would produce a tidier history that no longer matches the record it claims to show — and the
 * whole reason an operator opens this is to check whether the record is right.
 *
 * Read-only. Every value comes from the canonical fold via `buildAttendanceCardVM`; this component
 * groups and formats, and there is no second attendance store anywhere in it.
 */

type Timeframe = "week" | "month" | "all";
type EventFilter = "all" | "present" | "absent" | "movement" | "correction";

const TIMEFRAME_DAYS: Record<Timeframe, number | null> = { week: 7, month: 31, all: null };
const TIMEFRAME_LABEL: Record<Timeframe, string> = { week: "Week", month: "Month", all: "All" };
const EVENT_LABEL: Record<EventFilter, string> = {
    all: "All",
    present: "Present",
    absent: "Absent",
    movement: "Movement",
    correction: "Corrections",
};

function timeLabel(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function dayLabel(ymd: string): string {
    const d = new Date(`${ymd}T00:00:00`);
    return Number.isNaN(d.getTime())
        ? ymd
        : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function durationLabel(minutes: number | null): string {
    if (minutes == null) return "—";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
}

function eventLine(e: AttendanceHistoryEventVM): string {
    if (e.kind === "check_in") return e.roomLabel ? `Checked in · ${e.roomLabel}` : "Checked in";
    if (e.kind === "check_out") return "Checked out";
    if (e.kind === "absence") return "Absent";
    return e.roomLabel ? `Moved · ${e.roomLabel}` : "Moved";
}

export default function AttendanceDetailCard({
    childLabel,
    history,
    /** Rooms the record actually touched — a filter offers only what the data contains. */
    onClose,
}: {
    childLabel: string;
    history: readonly AttendanceHistoryDayVM[];
    onClose?: () => void;
}) {
    const [timeframe, setTimeframe] = useState<Timeframe>("month");
    const [eventFilter, setEventFilter] = useState<EventFilter>("all");
    const [room, setRoom] = useState<string>("All");
    const [openDay, setOpenDay] = useState<string | null>(history[0]?.date ?? null);

    const rooms = useMemo(() => {
        const set = new Set<string>();
        for (const d of history) for (const e of d.events) if (e.roomLabel) set.add(e.roomLabel);
        return ["All", ...[...set].sort()];
    }, [history]);

    const days = useMemo(() => {
        const limit = TIMEFRAME_DAYS[timeframe];
        const cut = limit
            ? new Date(Date.now() - limit * 86400000).toISOString().slice(0, 10)
            : null;
        return history.filter((d) => {
            if (cut && d.date < cut) return false;
            if (room !== "All" && !d.events.some((e) => e.roomLabel === room)) return false;
            if (eventFilter === "present" && !d.present) return false;
            if (eventFilter === "absent" && !d.absent) return false;
            if (eventFilter === "movement" && !d.events.some((e) => e.kind === "movement")) return false;
            if (eventFilter === "correction" && !d.corrected) return false;
            return true;
        });
    }, [history, timeframe, room, eventFilter]);

    return (
        <div className="alloy-os-attendance alloy-os-attendance--detail" data-attendance-detail="true">
            <UniversalCard
                title="Attendance"
                insight={childLabel}
                supportingInsight={`${days.length} ${days.length === 1 ? "day" : "days"} in this view`}
                iconName="Clock"
                tier="work"
                archetype="timeline"
                modalClass="workstation"
                density="expanded"
                gridSpan="row"
                data-universal-card-key="attendance_detail"
                footerAction={null}
            >
                <div className="alloy-os-adetail__controls">
                    <div className="alloy-os-billingdetail__filters">
                        {(Object.keys(TIMEFRAME_LABEL) as Timeframe[]).map((t) => (
                            <button
                                key={t}
                                type="button"
                                data-adetail-timeframe={t}
                                className={clsx(
                                    "alloy-os-billingdetail__filter",
                                    timeframe === t && "alloy-os-billingdetail__filter--on",
                                )}
                                onClick={() => setTimeframe(t)}
                            >
                                {TIMEFRAME_LABEL[t]}
                            </button>
                        ))}
                    </div>
                    <div className="alloy-os-billingdetail__filters">
                        <span className="alloy-os-fdetail__filterlabel">Room</span>
                        {rooms.map((r) => (
                            <button
                                key={r}
                                type="button"
                                data-adetail-room={r}
                                className={clsx(
                                    "alloy-os-billingdetail__filter",
                                    room === r && "alloy-os-billingdetail__filter--on",
                                )}
                                onClick={() => setRoom(r)}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                    <div className="alloy-os-billingdetail__filters">
                        <span className="alloy-os-fdetail__filterlabel">Event</span>
                        {(Object.keys(EVENT_LABEL) as EventFilter[]).map((f) => (
                            <button
                                key={f}
                                type="button"
                                data-adetail-event={f}
                                className={clsx(
                                    "alloy-os-billingdetail__filter",
                                    eventFilter === f && "alloy-os-billingdetail__filter--on",
                                )}
                                onClick={() => setEventFilter(f)}
                            >
                                {EVENT_LABEL[f]}
                            </button>
                        ))}
                    </div>
                </div>

                <SectionHead ruled={false}>Attendance record</SectionHead>

                {days.length === 0 ? (
                    <p className="alloy-os-attendance__empty">
                        No attendance recorded in this view.
                    </p>
                ) : (
                    <div className="alloy-os-adetail__table">
                        <div className="alloy-os-adetail__row alloy-os-adetail__row--head">
                            <span>Date</span>
                            <span>Expected</span>
                            <span>In</span>
                            <span>Out</span>
                            <span>Attended</span>
                            <span>Rooms</span>
                            <span>State</span>
                        </div>
                        {days.map((d) => {
                            const open = openDay === d.date;
                            const roomPath = d.events
                                .filter((e) => e.roomLabel)
                                .map((e) => e.roomLabel!)
                                .filter((r, i, a) => a[i - 1] !== r);
                            return (
                                <div key={d.date} className="alloy-os-adetail__day">
                                    <button
                                        type="button"
                                        data-adetail-day={d.date}
                                        aria-expanded={open}
                                        className="alloy-os-adetail__row alloy-os-adetail__row--day"
                                        onClick={() => setOpenDay(open ? null : d.date)}
                                    >
                                        <span className="alloy-os-adetail__date">{dayLabel(d.date)}</span>
                                        <span>{d.expectedRoomLabel ?? "—"}</span>
                                        <span>{timeLabel(d.checkInAt)}</span>
                                        <span>{timeLabel(d.checkOutAt)}</span>
                                        <span>{durationLabel(d.attendedMinutes)}</span>
                                        <span className="alloy-os-adetail__rooms">
                                            {roomPath.length ? roomPath.join(" → ") : "—"}
                                        </span>
                                        <span className="alloy-os-adetail__state">
                                            {d.absent ? (
                                                <em data-state="absent">Absent</em>
                                            ) : d.missingCheckout ? (
                                                <em data-state="open">No checkout</em>
                                            ) : d.present ? (
                                                <em data-state="present">Present</em>
                                            ) : (
                                                "—"
                                            )}
                                            {/* The correction is a fact about the RECORD, so it is
                                                shown beside the state rather than folded into it. */}
                                            {d.corrected ? (
                                                <em data-state="corrected" title="This day carries a correction">
                                                    Corrected
                                                </em>
                                            ) : null}
                                        </span>
                                    </button>
                                    {open && d.events.length ? (
                                        <ol className="alloy-os-adetail__events">
                                            {d.events.map((e) => (
                                                <li
                                                    key={e.eventId}
                                                    className="alloy-os-adetail__event"
                                                    data-corrected={e.corrected ? "true" : undefined}
                                                >
                                                    <span className="alloy-os-adetail__event-at">
                                                        {timeLabel(e.at)}
                                                    </span>
                                                    <span className="alloy-os-adetail__event-what">
                                                        {eventLine(e)}
                                                        {e.fromRoomLabel ? (
                                                            <span className="alloy-os-adetail__event-from">
                                                                {" "}
                                                                from {e.fromRoomLabel}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                    {e.corrected ? (
                                                        <span className="alloy-os-adetail__event-flag">
                                                            superseded by a correction
                                                        </span>
                                                    ) : null}
                                                </li>
                                            ))}
                                        </ol>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}

                {onClose ? (
                    <div className="alloy-os-fdetail__utility">
                        <button type="button" className="alloy-os-ucard__action" onClick={onClose}>
                            Back to today →
                        </button>
                    </div>
                ) : null}
            </UniversalCard>
        </div>
    );
}
