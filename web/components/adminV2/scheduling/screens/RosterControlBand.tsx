"use client";

/**
 * THE ROSTER CONTROL BAND — one toolbar, one place, every state.
 *
 * Range, lens and the date/week anchor used to be rendered in FOUR places: a right-aligned row for
 * the Assignments lens, a left-aligned toolbar inside the Staff lens, another inside the week board,
 * and a header row inside the day surface. Each child positioned them itself, so Day, Week, Rooms,
 * Staff and Assignments read as five products that happened to share a workspace — the controls
 * physically jumped between left, right and header as the operator switched.
 *
 * The parent owns them now. Children receive selected STATE and DATA; none of them decides where a
 * control lives, and none renders a date picker of its own.
 *
 * ── AN INVALID COMBINATION IS DISABLED, NOT HIDDEN ──
 *
 * `lensesForRange` used to return a SHORTER LIST on Day, so the Staff pill physically disappeared
 * and the two remaining pills re-flowed. That is the same defect as moving the band, one level down:
 * the operator's target moves because of something they did elsewhere. Every lens is always present
 * and always in the same order; an unavailable one is disabled and says why on hover.
 *
 * Nothing is silently coerced either. Selecting Day while on the Staff lens is not possible, because
 * the Staff pill is disabled rather than the selection being rewritten underneath them.
 */

import { CalendarDays } from "lucide-react";

import WeekPicker from "@/components/workspace/WeekPicker";
import type { RosterRange } from "@/app/adminV2/operations/operationsSections";
import type { RosterLens } from "@/components/adminV2/scheduling/screens/RosterSurface";

/** Every lens, always in this order. Availability varies; presence and position never do. */
export const ROSTER_LENSES: readonly RosterLens[] = ["rooms", "staff", "assignments"];

/**
 * THE VALID STATE MATRIX, stated once and in one place.
 *
 *   Day  × Rooms        the operating surface — rooms as they are staffed today
 *   Day  × Staff        UNAVAILABLE. The staff lens is a WEEK projection (it reads `days[]`), and a
 *                       single day's staff already appear on the Rooms cards. Rendering it on Day
 *                       would show a week of people under a day's heading.
 *   Day  × Assignments  valid — a commitment is not a property of the day
 *   Week × Rooms        the planning board
 *   Week × Staff        the staffing plan
 *   Week × Assignments  valid, and identical to Day × Assignments: the ledger does not read the
 *                       range at all. The range control stays ENABLED so the operator can leave the
 *                       lens without hunting for it.
 *
 * Returns null when the combination is available; otherwise the honest reason, shown as the
 * control's title so the answer is where the question is.
 */
export function lensUnavailableReason(range: RosterRange, lens: RosterLens): string | null {
    if (lens === "staff" && range === "day") {
        return "Staff planning is a week view — a single day's staff are on the room cards";
    }
    return null;
}

function RangeControl({
    range,
    onRangeChange,
}: {
    range: RosterRange;
    onRangeChange: (range: RosterRange) => void;
}) {
    return (
        <div
            className="inline-flex overflow-hidden rounded-lg border border-alloy-stone/25"
            data-roster-range={range}
        >
            {(["day", "week"] as const).map((key, i) => (
                <button
                    key={key}
                    type="button"
                    className={[
                        "px-3 py-1.5 text-[11.5px] font-semibold capitalize",
                        i > 0 ? "border-l border-alloy-stone/25" : "",
                        range === key
                            ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                            : "text-alloy-slate hover:bg-alloy-stone/[0.06]",
                    ].join(" ")}
                    onClick={() => onRangeChange(key)}
                    data-roster-range-option={key}
                    aria-pressed={range === key}
                >
                    {key}
                </button>
            ))}
        </div>
    );
}

function LensControl({
    lens,
    range,
    onLensChange,
}: {
    lens: RosterLens;
    range: RosterRange;
    onLensChange: (lens: RosterLens) => void;
}) {
    return (
        <div
            className="inline-flex overflow-hidden rounded-lg border border-alloy-stone/25"
            data-roster-lens={lens}
        >
            {ROSTER_LENSES.map((key, i) => {
                const reason = lensUnavailableReason(range, key);
                return (
                    <button
                        key={key}
                        type="button"
                        disabled={Boolean(reason)}
                        title={reason ?? undefined}
                        className={[
                            "px-3 py-1.5 text-[11.5px] font-semibold capitalize",
                            i > 0 ? "border-l border-alloy-stone/25" : "",
                            reason
                                ? "cursor-not-allowed text-alloy-slate/40"
                                : lens === key
                                  ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                  : "text-alloy-slate hover:bg-alloy-stone/[0.06]",
                        ].join(" ")}
                        onClick={() => onLensChange(key)}
                        data-roster-lens-option={key}
                        data-roster-lens-unavailable={reason ? "true" : undefined}
                        aria-pressed={lens === key}
                        aria-disabled={Boolean(reason)}
                    >
                        {key}
                    </button>
                );
            })}
        </div>
    );
}

function shiftYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

export default function RosterControlBand({
    range,
    onRangeChange,
    lens,
    onLensChange,
    day,
    onDayChange,
    serverToday,
    weekStart,
    weekLabel,
    weekChangePending,
    onWeekChange,
    onSelectWeek,
    trailing,
}: {
    range: RosterRange;
    onRangeChange: (range: RosterRange) => void;
    lens: RosterLens;
    onLensChange: (lens: RosterLens) => void;
    day: string | null;
    onDayChange: (date: string | null) => void;
    /** The ORG's today, never the browser's. */
    serverToday: string | null;
    weekStart?: string | null;
    weekLabel?: string | null;
    weekChangePending?: boolean;
    onWeekChange?: (dir: -1 | 1 | 0) => void;
    onSelectWeek?: (weekStart: string) => void;
    /** Right-aligned supporting text (room/person counts). Content, never controls. */
    trailing?: React.ReactNode;
}) {
    /*
     * The ANCHOR control follows the range, and only the anchor does.
     *
     * Assignments reads neither a day nor a week, so it shows no anchor — but the slot itself keeps
     * its place in the row, which is why range and lens do not shift when the operator switches into
     * or out of the ledger.
     */
    const anchor =
        lens === "assignments" ? null : range === "week" ? (
            <WeekPicker
                weekStart={weekStart ?? undefined}
                weekLabel={weekLabel ?? undefined}
                pending={weekChangePending}
                onPrev={() => onWeekChange?.(-1)}
                onNext={() => onWeekChange?.(1)}
                onSelectWeek={(ws) => {
                    if (onSelectWeek) onSelectWeek(ws);
                    else onWeekChange?.(0);
                }}
            />
        ) : (
            <div className="flex items-center gap-1.5" data-roster-day-anchor="true">
                <button
                    type="button"
                    className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-40"
                    disabled={!day}
                    onClick={() => day && onDayChange(shiftYmd(day, -1))}
                    data-roster-prev-day="true"
                    aria-label="Previous day"
                >
                    ‹
                </button>
                <span className="inline-flex items-center gap-1.5 rounded border border-alloy-stone/25 px-2 py-1">
                    <CalendarDays className="h-3.5 w-3.5 text-alloy-midnight/45" aria-hidden />
                    <input
                        type="date"
                        value={day ?? ""}
                        onChange={(e) => onDayChange(e.target.value || null)}
                        className="bg-transparent text-[12px] text-alloy-midnight outline-none"
                        aria-label="Roster date"
                        data-roster-date="true"
                    />
                </span>
                <button
                    type="button"
                    className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-40"
                    disabled={!day}
                    onClick={() => day && onDayChange(shiftYmd(day, 1))}
                    data-roster-next-day="true"
                    aria-label="Next day"
                >
                    ›
                </button>
                {/* Getting back to today took a date-picker round trip. The org's today, never the
                    browser's. */}
                {serverToday && day !== serverToday ? (
                    <button
                        type="button"
                        className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                        onClick={() => onDayChange(serverToday)}
                        data-roster-today="true"
                    >
                        Today
                    </button>
                ) : null}
            </div>
        );

    return (
        <div
            className="flex flex-wrap items-center gap-2"
            data-roster-control-band="true"
            data-roster-band-range={range}
            data-roster-band-lens={lens}
        >
            <RangeControl range={range} onRangeChange={onRangeChange} />
            <LensControl lens={lens} range={range} onLensChange={onLensChange} />
            {anchor}
            {trailing ? <div className="ml-auto">{trailing}</div> : null}
        </div>
    );
}
