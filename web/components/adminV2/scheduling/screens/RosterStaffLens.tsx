"use client";

/**
 * Roster — Staff lens. "Where is Jane scheduled this week?"
 *
 * A PIVOT of the week roster, not a second read model and not a second fetch.
 * `buildRosterReadModel` already returns `scheduledStaff` for every room·day and
 * the API already serialises it; the Rooms lens indexes it by room and this one
 * indexes the same array by person. Nothing here queries anything.
 *
 * This is NOT staff record management, and it is not the future Records
 * workspace. It answers one operational question about one week — where a person
 * is expected, and when. A name opens the canonical record through the same
 * record-attention gesture every other roster surface uses.
 */

import { useMemo } from "react";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import type { RosterData } from "@/components/adminV2/scheduling/screens/SchedulingRoster";

export type RosterStaffLensSubject = {
    personId: string;
    displayName: string;
    positionLabel: string | null;
};

type DayPlacement = {
    dayKey: string;
    dayLabel: string;
    isToday: boolean;
    roomName: string | null;
    timeLabel: string | null;
};

type StaffRow = {
    personId: string;
    displayName: string;
    positionLabel: string | null;
    /** One entry per operating day, in board order. Null room = not scheduled that day. */
    days: (DayPlacement | null)[];
    dayCount: number;
    /** More than one room across the week — worth seeing at a glance. */
    rooms: string[];
};

function buildRows(data: RosterData | null): StaffRow[] {
    if (!data) return [];
    const byPerson = new Map<string, StaffRow>();

    for (const room of data.rooms) {
        for (const cell of room.cells) {
            for (const member of cell.scheduledStaff ?? []) {
                let row = byPerson.get(member.personId);
                if (!row) {
                    row = {
                        personId: member.personId,
                        displayName: member.displayName,
                        positionLabel: member.positionLabel ?? null,
                        days: data.days.map(() => null),
                        dayCount: 0,
                        rooms: [],
                    };
                    byPerson.set(member.personId, row);
                }
                const idx = data.days.findIndex((d) => d.key === cell.dayKey);
                if (idx < 0) continue;
                row.days[idx] = {
                    dayKey: cell.dayKey,
                    dayLabel: cell.dayLabel,
                    isToday: cell.isToday === true,
                    roomName: room.roomName,
                    timeLabel: member.timeLabel ?? null,
                };
                row.dayCount += 1;
                if (!row.rooms.includes(room.roomName)) row.rooms.push(room.roomName);
            }
        }
    }

    return [...byPerson.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export default function RosterStaffLens({
    data,
    loading,
    siteName,
    lensControl,
    rangeControl,
    onOpenStaff,
}: {
    data: RosterData | null;
    loading: boolean;
    siteName: string;
    lensControl?: React.ReactNode;
    rangeControl?: React.ReactNode;
    onOpenStaff?: (subject: RosterStaffLensSubject) => void;
}) {
    const rows = useMemo(() => buildRows(data), [data]);
    const days = data?.days ?? [];

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3" data-roster-staff-lens="true">
            <div className="flex flex-wrap items-center gap-2">
                {rangeControl}
                {lensControl}
                <p className="ml-auto text-[11px] text-alloy-slate">
                    {rows.length > 0
                        ? `${rows.length} ${rows.length === 1 ? "person" : "people"} scheduled · ${siteName}`
                        : siteName}
                </p>
            </div>

            {loading && rows.length === 0 ? (
                <p className="px-1 text-[12px] text-alloy-slate">Loading roster…</p>
            ) : null}

            {!loading && rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-alloy-stone/30 px-6 py-14 text-center">
                    <p className="text-[13px] font-semibold text-alloy-midnight">
                        Nobody is scheduled at {siteName} this week
                    </p>
                    <p className="mt-1 text-[12px] text-alloy-slate">
                        Staff appear here from committed staff assignments.
                    </p>
                </div>
            ) : null}

            {rows.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-alloy-stone/15 bg-white shadow-[0_2px_8px_rgba(24,39,58,0.06)]">
                    <div
                        className="grid min-w-max"
                        style={{
                            gridTemplateColumns: `minmax(180px, 240px) repeat(${Math.max(days.length, 1)}, minmax(112px, 1fr))`,
                        }}
                        role="grid"
                    >
                        <div className="sticky left-0 top-0 z-30 border-b border-r border-alloy-stone/12 bg-alloy-stone/[0.6] px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-alloy-slate">
                            Staff
                        </div>
                        {days.map((d) => (
                            <div
                                key={d.key}
                                className={`sticky top-0 z-20 border-b border-alloy-stone/12 px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] ${
                                    d.isToday
                                        ? "bg-alloy-bend-pine/[0.09] text-alloy-bend-pine"
                                        : "bg-alloy-stone/[0.6] text-alloy-slate"
                                }`}
                            >
                                {d.label}
                                {d.isToday ? <span className="ml-1 text-[8px] font-medium">· today</span> : null}
                            </div>
                        ))}

                        {rows.map((row) => (
                            <StaffLensRow key={row.personId} row={row} onOpenStaff={onOpenStaff} />
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function StaffLensRow({
    row,
    onOpenStaff,
}: {
    row: StaffRow;
    onOpenStaff?: (subject: RosterStaffLensSubject) => void;
}) {
    return (
        <>
            <button
                type="button"
                onClick={() =>
                    onOpenStaff?.({
                        personId: row.personId,
                        displayName: row.displayName,
                        positionLabel: row.positionLabel,
                    })
                }
                className="sticky left-0 z-10 flex items-center gap-2 border-b border-r border-alloy-stone/10 bg-white px-3 py-2.5 text-left hover:bg-alloy-stone/[0.05]"
                data-roster-staff-lens-person={row.personId}
            >
                <CardAvatar name={row.displayName} size={24} />
                <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-alloy-midnight">
                        {row.displayName}
                    </span>
                    <span className="block truncate text-[9.5px] text-alloy-slate">
                        {[row.positionLabel, row.rooms.length > 1 ? `${row.rooms.length} rooms` : null]
                            .filter(Boolean)
                            .join(" · ") || "Staff"}
                    </span>
                </span>
            </button>
            {row.days.map((day, i) => (
                <div
                    key={day?.dayKey ?? `empty-${i}`}
                    className={`border-b border-r border-alloy-stone/10 px-2.5 py-2 ${
                        day ? "" : "bg-[repeating-linear-gradient(45deg,#fff,#fff_6px,rgba(39,63,82,0.03)_6px,rgba(39,63,82,0.03)_12px)]"
                    }`}
                    data-roster-staff-lens-cell={day ? `${row.personId}:${day.dayKey}` : undefined}
                    data-roster-staff-lens-room={day?.roomName ?? undefined}
                >
                    {day ? (
                        <>
                            <div className="truncate text-[11.5px] font-medium text-alloy-midnight">
                                {day.roomName ?? "No room"}
                            </div>
                            {day.timeLabel ? (
                                <div className="text-[10px] tabular-nums text-alloy-slate">
                                    {day.timeLabel}
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div className="text-[10px] text-alloy-midnight/25">—</div>
                    )}
                </div>
            ))}
        </>
    );
}
