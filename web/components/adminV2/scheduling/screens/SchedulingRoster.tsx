"use client";

/**
 * Assignments Roster — assignment index (Primary / Secondary / room / type / status)
 * plus the room × weekday occupancy board (scheduling property of assignments).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import WeekPicker from "@/components/workspace/WeekPicker";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import AssignmentRosterPanel, {
    type AssignmentRosterBulkHandlers,
    type AssignmentRosterSubject,
} from "@/components/adminV2/scheduling/screens/AssignmentRosterPanel";

export type RosterViewMode = "assignments" | "rooms";

export type RosterTone = "pine" | "gold" | "ember";

export type RosterCell = {
    dayKey: string;
    dayLabel: string;
    /** Committed occupancy — attendance/staffing truth. */
    occupancy: number | null;
    /** Planned (Proposed) occupancy — a distinct, non-authoritative signal shown alongside committed. */
    planned?: number | null;
    /** Committed + planned projected demand (never attendance truth). */
    projected?: number | null;
    capacity: number | null;
    requiredStaff?: number | null;
    pct: number;
    ratioLabel: string;
    tone: RosterTone;
    state?: "breach" | "closed";
    isToday?: boolean;
    /** True when capacity or staff was authoritatively evaluated. */
    evaluated?: boolean;
};

export type RosterRoom = {
    roomId: string;
    roomName: string;
    meta: string;
    health: { tone: RosterTone; label: string };
    cells: RosterCell[];
};

export type RosterData = {
    rooms: RosterRoom[];
    days: { key: string; label: string; isToday?: boolean }[];
    weekLabel: string;
    /** Monday of the displayed operating week (YYYY-MM-DD) — the roster cache key. */
    weekStart?: string;
    weekEnd?: string;
};

export type RosterFilterKind = "unplaced" | "starts" | "near_capacity" | "ratio_risk";
export type RosterFilterContext = {
    kind: RosterFilterKind;
    label: string;
    count: number;
    /** Room filters highlight these rooms and dim the rest. */
    highlightRoomIds?: string[];
    /** Child-centric filters (unplaced / starts) show these above the board. */
    children?: { name: string; sub?: string }[];
};

/** Compact committed / proposed / projected / capacity display. */
function formatOccupancyCompact(cell: RosterCell): string {
    const committed = cell.occupancy ?? 0;
    const proposed = cell.planned ?? 0;
    const projected = cell.projected ?? committed + proposed;
    const parts = [`${committed} committed`];
    if (proposed) parts.push(`+${proposed} proposed`);
    if (cell.capacity != null) parts.push(`${projected} / ${cell.capacity} projected`);
    else parts.push(`${projected} projected`);
    return parts.join(" · ");
}

const TONE_DOT: Record<RosterTone, string> = { pine: "bg-alloy-bend-pine", gold: "bg-alloy-gold-dark", ember: "bg-alloy-ember" };
const TONE_HEALTH: Record<RosterTone, string> = {
    pine: "bg-alloy-bend-pine/10 text-alloy-bend-pine",
    gold: "bg-alloy-gold-dark/15 text-alloy-gold-dark",
    ember: "bg-alloy-ember/10 text-alloy-ember",
};
const TONE_BAR: Record<RosterTone, string> = { pine: "bg-alloy-bend-pine", gold: "bg-alloy-gold-dark", ember: "bg-alloy-ember" };

export default function SchedulingRoster({
    data,
    assignmentSubjects,
    rosterView,
    onRosterViewChange,
    loading,
    loadingAssignments,
    siteName,
    focusRoomId,
    filter,
    onClearFilter,
    onSelectCell,
    onSelectRoom,
    onWeekChange,
    onSelectWeek,
    rosterBulk,
    initialBulkMode = null,
    weekChangePending = false,
    lastWeekLoadMs = null,
}: {
    data: RosterData | null;
    assignmentSubjects: AssignmentRosterSubject[];
    rosterView: RosterViewMode;
    onRosterViewChange: (mode: RosterViewMode) => void;
    loading: boolean;
    loadingAssignments: boolean;
    siteName: string;
    focusRoomId?: string;
    filter?: RosterFilterContext | null;
    onClearFilter?: () => void;
    onSelectCell?: (roomId: string, dayKey: string) => void;
    onSelectRoom?: (roomId: string) => void;
    onWeekChange?: (dir: -1 | 1 | 0) => void;
    onSelectWeek?: (weekStart: string) => void;
    rosterBulk?: AssignmentRosterBulkHandlers;
    initialBulkMode?: "assignment" | "room" | null;
    /** True the instant a week nav click fires, until the new week's data is ready (optimistic feedback). */
    weekChangePending?: boolean;
    /** Dev-only click→ready timing for the most recent week change, for perf inspection. */
    lastWeekLoadMs?: number | null;
}) {
    const [selectedCell, setSelectedCell] = useState<{ roomId: string; dayKey: string } | null>(null);
    const [detail, setDetail] = useState<{ roomId: string; dayKey: string | null } | null>(null);
    const boardRef = useRef<HTMLDivElement | null>(null);

    const rooms = data?.rooms ?? [];
    const days = data?.days ?? [];
    const weekLabel = data?.weekLabel ?? "This week";
    const highlight = useMemo(
        () => (filter?.highlightRoomIds ? new Set(filter.highlightRoomIds) : null),
        [filter]
    );
    const totalPlanned = useMemo(
        () => rooms.reduce((sum, r) => sum + r.cells.reduce((s, c) => s + (c.planned ?? 0), 0), 0),
        [rooms]
    );

    // Open the detail inspector for the room a launch card / overview focused.
    useEffect(() => {
        if (focusRoomId) setDetail({ roomId: focusRoomId, dayKey: null });
    }, [focusRoomId]);

    // Scroll the focused room into view.
    useEffect(() => {
        if (!focusRoomId || !boardRef.current) return;
        boardRef.current
            .querySelector(`[data-scheduling-roster-room="${focusRoomId}"]`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [focusRoomId, data]);

    const isEmpty = !loading && rooms.length === 0;
    const detailRoom = detail ? rooms.find((r) => r.roomId === detail.roomId) ?? null : null;

    const openCell = (roomId: string, dayKey: string, closed: boolean) => {
        if (closed) return;
        setSelectedCell({ roomId, dayKey });
        setDetail({ roomId, dayKey });
        onSelectCell?.(roomId, dayKey);
    };
    const openRoom = (roomId: string) => {
        setDetail({ roomId, dayKey: null });
        onSelectRoom?.(roomId);
    };

    const gridTemplate = useMemo(
        () => `minmax(150px, 210px) repeat(${Math.max(days.length, 1)}, minmax(104px, 1fr))`,
        [days.length]
    );

    return (
        <div
            className="flex min-h-0 flex-1 flex-col gap-3"
            data-scheduling-roster="true"
            data-roster-week-change-pending={weekChangePending ? "true" : "false"}
            data-roster-last-load-ms={lastWeekLoadMs ?? undefined}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-alloy-stone/25">
                    <button
                        type="button"
                        className={`px-3 py-1.5 text-[11.5px] font-semibold ${rosterView === "assignments" ? "bg-alloy-bend-pine/10 text-alloy-bend-pine" : "text-alloy-slate hover:bg-alloy-stone/[0.06]"}`}
                        onClick={() => onRosterViewChange("assignments")}
                        data-assignment-roster-view="assignments"
                    >
                        Assignments
                    </button>
                    <button
                        type="button"
                        className={`border-l border-alloy-stone/25 px-3 py-1.5 text-[11.5px] font-semibold ${rosterView === "rooms" ? "bg-alloy-bend-pine/10 text-alloy-bend-pine" : "text-alloy-slate hover:bg-alloy-stone/[0.06]"}`}
                        onClick={() => onRosterViewChange("rooms")}
                        data-assignment-roster-view="rooms"
                    >
                        Room board
                    </button>
                </div>
            </div>

            {rosterView === "assignments" ?
                <AssignmentRosterPanel
                    subjects={assignmentSubjects}
                    loading={loadingAssignments}
                    siteName={siteName}
                    bulk={rosterBulk}
                    initialBulkMode={initialBulkMode}
                />
            :   <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <WeekPicker
                    weekStart={data?.weekStart}
                    weekLabel={weekLabel}
                    pending={weekChangePending}
                    onPrev={() => onWeekChange?.(-1)}
                    onNext={() => onWeekChange?.(1)}
                    onSelectWeek={(ws) => {
                        if (onSelectWeek) onSelectWeek(ws);
                        else onWeekChange?.(0);
                    }}
                />
                <p className="text-[11px] text-alloy-slate">
                    {rooms.length > 0 ? `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"} · ${siteName}` : siteName}
                    {totalPlanned > 0 ? (
                        <span className="text-[#00458C]" data-scheduling-roster-total-planned={totalPlanned}>
                            {" "}
                            · {totalPlanned} proposed (not attendance)
                        </span>
                    ) : null}
                    {lastWeekLoadMs != null ? (
                        <span className="ml-2 text-alloy-midnight/35" data-roster-week-load-ms={lastWeekLoadMs}>
                            {lastWeekLoadMs}ms
                        </span>
                    ) : null}
                </p>
            </div>

            {/* Filter banner */}
            {filter ? (
                <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.05] px-3 py-2"
                    data-scheduling-roster-filter={filter.kind}
                >
                    <p className="text-[12px] font-semibold text-alloy-midnight">
                        {filter.label} <span className="font-normal text-alloy-slate">· {filter.count}</span>
                    </p>
                    <button type="button" className="inline-flex items-center gap-1 text-[11px] font-semibold text-alloy-bend-pine hover:underline" onClick={onClearFilter} data-scheduling-roster-filter-clear="true">
                        <X className="h-3 w-3" aria-hidden /> Clear
                    </button>
                </div>
            ) : null}

            {/* Child strip for unplaced / starts filters */}
            {filter?.children && filter.children.length > 0 ? (
                <div className="rounded-lg border border-alloy-stone/18 bg-white p-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">{filter.label}</p>
                    <div className="flex flex-wrap gap-2">
                        {filter.children.map((c, i) => (
                            <span key={`${c.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-alloy-stone/25 bg-white px-2.5 py-1 text-[11.5px]">
                                <span className="font-semibold text-alloy-midnight">{c.name}</span>
                                {c.sub ? <span className="text-alloy-slate">· {c.sub}</span> : null}
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* Board + detail inspector */}
            {isEmpty ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-alloy-stone/20 bg-white px-6 py-16 text-center">
                    <p className="text-[13px] font-semibold text-alloy-midnight">No rooms configured for {siteName}</p>
                    <p className="mt-1 max-w-md text-[12px] text-alloy-slate">
                        Rooms and capacities come from this site's configuration. Once rooms exist, the weekly occupancy and ratio board renders here.
                    </p>
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 gap-3">
                    <div ref={boardRef} className="min-h-0 flex-1 overflow-auto rounded-xl border border-alloy-stone/15 bg-white shadow-[0_2px_8px_rgba(24,39,58,0.06)]" data-scheduling-roster-board="true">
                        <div className="grid min-w-max" style={{ gridTemplateColumns: gridTemplate }} role="grid">
                            <div className="sticky left-0 top-0 z-30 border-b border-r border-alloy-stone/12 bg-alloy-stone/[0.6] px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-alloy-slate">
                                Room
                            </div>
                            {days.map((d) => (
                                <div
                                    key={d.key}
                                    className={`sticky top-0 z-20 border-b border-alloy-stone/12 px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] ${
                                        d.isToday ? "bg-alloy-bend-pine/[0.09] text-alloy-bend-pine" : "bg-alloy-stone/[0.6] text-alloy-slate"
                                    }`}
                                >
                                    {d.label}
                                    {d.isToday ? <span className="ml-1 text-[8px] font-medium">· today</span> : null}
                                </div>
                            ))}

                            {rooms.map((room) => (
                                <RoomRow
                                    key={room.roomId}
                                    room={room}
                                    selectedCell={selectedCell}
                                    active={detail?.roomId === room.roomId}
                                    dimmed={highlight ? !highlight.has(room.roomId) : false}
                                    onOpenRoom={() => openRoom(room.roomId)}
                                    onOpenCell={openCell}
                                />
                            ))}
                        </div>
                    </div>

                    {detailRoom ? (
                        <RoomDetailPanel
                            room={detailRoom}
                            focusDayKey={detail?.dayKey ?? null}
                            weekLabel={weekLabel}
                            assignmentSubjects={assignmentSubjects}
                            onClose={() => setDetail(null)}
                        />
                    ) : null}
                </div>
            )}

            {loading && rooms.length === 0 ? <p className="px-1 text-[12px] text-alloy-slate">Loading roster…</p> : null}
            </>}
        </div>
    );
}

function RoomRow({
    room,
    selectedCell,
    active,
    dimmed,
    onOpenRoom,
    onOpenCell,
}: {
    room: RosterRoom;
    selectedCell: { roomId: string; dayKey: string } | null;
    active: boolean;
    dimmed: boolean;
    onOpenRoom: () => void;
    onOpenCell: (roomId: string, dayKey: string, closed: boolean) => void;
}) {
    return (
        <>
            <button
                type="button"
                onClick={onOpenRoom}
                className={`sticky left-0 z-10 flex flex-col items-start gap-1 border-b border-r border-alloy-stone/10 px-3 py-2.5 text-left transition-opacity hover:bg-alloy-stone/[0.05] ${
                    active ? "bg-alloy-bend-pine/[0.07] ring-1 ring-inset ring-alloy-bend-pine/40" : "bg-white"
                } ${dimmed ? "opacity-40" : ""}`}
                data-scheduling-roster-room={room.roomId}
            >
                <span className="text-[12px] font-semibold text-alloy-midnight">{room.roomName}</span>
                <span className="text-[9.5px] text-alloy-slate">{room.meta}</span>
                {room.health.label ? (
                    <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold ${TONE_HEALTH[room.health.tone]}`}>{room.health.label}</span>
                ) : null}
            </button>
            {room.cells.map((cell) => {
                const closed = cell.state === "closed";
                const isSel = selectedCell?.roomId === room.roomId && selectedCell?.dayKey === cell.dayKey;
                return (
                    <button
                        key={cell.dayKey}
                        type="button"
                        disabled={closed}
                        onClick={() => onOpenCell(room.roomId, cell.dayKey, closed)}
                        className={[
                            "group relative border-b border-r border-alloy-stone/10 px-2.5 py-2 text-left transition-colors",
                            closed ? "cursor-default bg-[repeating-linear-gradient(45deg,#fff,#fff_6px,rgba(39,63,82,0.03)_6px,rgba(39,63,82,0.03)_12px)]" : "hover:bg-alloy-stone/[0.05]",
                            cell.state === "breach" ? "bg-alloy-ember/[0.06]" : "",
                            isSel ? "outline outline-2 -outline-offset-2 outline-alloy-bend-pine/60 bg-alloy-bend-pine/[0.05]" : "",
                            dimmed ? "opacity-40" : "",
                        ].join(" ")}
                        data-scheduling-roster-cell={`${room.roomId}:${cell.dayKey}`}
                        data-cell-state={cell.state ?? "ok"}
                    >
                        {closed ? (
                            <>
                                <div className="text-[13px] font-semibold text-alloy-midnight/25">—</div>
                                <div className="text-[9px] text-alloy-slate">closed</div>
                            </>
                        ) : (
                            <>
                                <div className="space-y-0.5" data-scheduling-cell-metrics="true">
                                    <div className="text-[12px] font-semibold tabular-nums text-alloy-midnight">
                                        {cell.occupancy ?? 0}{" "}
                                        <span className="text-[10px] font-medium text-alloy-slate">committed</span>
                                    </div>
                                    {(cell.planned ?? 0) > 0 ? (
                                        <div
                                            className="text-[11px] font-semibold tabular-nums text-[#00458C]"
                                            data-scheduling-cell-planned={cell.planned}
                                            data-scheduling-cell-proposed={cell.planned}
                                        >
                                            +{cell.planned}{" "}
                                            <span className="text-[10px] font-medium">Proposed</span>
                                        </div>
                                    ) : null}
                                    <div className="text-[10px] tabular-nums text-alloy-slate">
                                        {cell.capacity != null
                                            ? `${cell.projected ?? (cell.occupancy ?? 0) + (cell.planned ?? 0)} / ${cell.capacity} projected`
                                            : `${cell.projected ?? (cell.occupancy ?? 0) + (cell.planned ?? 0)} projected`}
                                    </div>
                                    {cell.requiredStaff != null ? (
                                        <div
                                            className={`text-[9.5px] ${cell.state === "breach" ? "font-semibold text-alloy-ember" : "text-alloy-slate"}`}
                                            data-scheduling-cell-staff={cell.requiredStaff}
                                        >
                                            {cell.requiredStaff} staff
                                        </div>
                                    ) : null}
                                </div>
                                <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-alloy-stone/25">
                                    <span
                                        className={`block h-full rounded-full ${cell.state === "breach" ? "bg-alloy-ember" : TONE_BAR[cell.tone]}`}
                                        style={{ width: `${Math.min(cell.pct, 100)}%` }}
                                    />
                                </div>
                            </>
                        )}
                    </button>
                );
            })}
        </>
    );
}

// ── Room detail — click scope determines weekly vs daily (no toggle) ───────────
function RoomDetailPanel({
    room,
    focusDayKey,
    weekLabel,
    assignmentSubjects,
    onClose,
}: {
    room: RosterRoom;
    focusDayKey: string | null;
    weekLabel: string;
    assignmentSubjects: AssignmentRosterSubject[];
    onClose: () => void;
}) {
    /** Day cell click → daily; room name click → weekly. */
    const scope: "daily" | "weekly" = focusDayKey ? "daily" : "weekly";

    const open = room.cells.filter((c) => c.state !== "closed");
    const totalCommitted = open.reduce((m, c) => m + (c.occupancy ?? 0), 0);
    const totalProposed = open.reduce((m, c) => m + (c.planned ?? 0), 0);
    const anyBreach = open.some((c) => c.state === "breach");
    const focusCell = focusDayKey ? room.cells.find((c) => c.dayKey === focusDayKey) : null;
    const capacitySample = open.find((c) => c.capacity != null)?.capacity ?? null;
    const staffSample = open.find((c) => c.requiredStaff != null)?.requiredStaff ?? null;

    const roomAssignments = useMemo(() => {
        const lines: Array<{
            childName: string;
            imageUrl?: string | null;
            assignment: AssignmentRosterSubject["assignments"][number];
        }> = [];
        for (const s of assignmentSubjects) {
            for (const a of s.assignments) {
                if ((a.roomName ?? "").trim() !== room.roomName.trim()) continue;
                lines.push({ childName: s.subjectName, imageUrl: s.imageUrl, assignment: a });
            }
        }
        return lines;
    }, [assignmentSubjects, room.roomName]);

    const committedLines = roomAssignments.filter((l) => l.assignment.commitmentKind !== "proposed");
    const proposedLines = roomAssignments.filter((l) => l.assignment.commitmentKind === "proposed");

    const dayTitle = focusCell
        ? `${focusCell.dayLabel}${focusCell.isToday ? " · today" : ""}`
        : null;

    return (
        <aside
            className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-xl border border-alloy-stone/18 bg-white shadow-[0_2px_10px_rgba(24,39,58,0.07)]"
            data-scheduling-room-detail={room.roomId}
            data-scheduling-room-detail-scope={scope}
            data-scheduling-room-detail-day={focusDayKey ?? undefined}
        >
            <header className="flex items-start justify-between gap-2 border-b border-alloy-stone/12 px-3.5 py-3">
                <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-alloy-midnight">{room.roomName}</p>
                    <p className="text-[10.5px] text-alloy-slate">{room.meta || "Operational space"}</p>
                    {scope === "daily" && dayTitle ? (
                        <p className="mt-1 text-[12px] font-semibold text-[#00458C]" data-room-day-header="true">
                            {dayTitle}
                        </p>
                    ) : (
                        <p className="mt-1 text-[12px] font-semibold text-alloy-midnight" data-room-week-header="true">
                            {weekLabel}
                        </p>
                    )}
                </div>
                <button type="button" onClick={onClose} aria-label="Close room detail" className="rounded-md p-1 text-alloy-midnight/45 hover:bg-alloy-stone/[0.08] hover:text-alloy-midnight">
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
            </header>

            <div className="border-b border-alloy-stone/10 px-3.5 py-2.5 text-[11px] text-alloy-slate" data-room-capacity-summary="true">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${TONE_HEALTH[room.health.tone]}`}>
                        {room.health.label || (anyBreach ? "Attention" : "—")}
                    </span>
                    {anyBreach ? <span className="font-semibold text-alloy-ember">Attention</span> : null}
                </div>
                {scope === "weekly" ? (
                    <p className="mt-1.5 tabular-nums">
                        {totalCommitted} committed
                        {totalProposed > 0 ? (
                            <span className="text-[#00458C]"> · +{totalProposed} Proposed</span>
                        ) : null}
                        {" · "}
                        {totalCommitted + totalProposed} projected
                        {capacitySample != null ? ` · cap ${capacitySample}` : ""}
                        {staffSample != null ? ` · ${staffSample} staff` : ""}
                    </p>
                ) : focusCell ? (
                    <p className="mt-1.5 tabular-nums">
                        {formatOccupancyCompact(focusCell)}
                        {focusCell.requiredStaff != null ? ` · ${focusCell.requiredStaff} staff` : ""}
                    </p>
                ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2">
                {scope === "weekly" ? (
                    <>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">Weekday summary</p>
                        <ul className="mb-3 flex flex-col gap-1">
                            {room.cells.map((c) => {
                                const closed = c.state === "closed";
                                return (
                                    <li key={c.dayKey} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
                                        <span className="flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${closed ? "bg-alloy-stone" : c.state === "breach" ? "bg-alloy-ember" : TONE_DOT[c.tone]}`} />
                                            <span className="text-[12px] font-medium text-alloy-midnight">{c.dayLabel}</span>
                                        </span>
                                        <span className="text-[10.5px] text-alloy-slate">
                                            {closed ? "closed" : formatOccupancyCompact(c)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                        <RoomAssignmentList title="Weekly roster" lines={roomAssignments} empty="No assignments touch this room this week." />
                    </>
                ) : (
                    <>
                        <RoomAssignmentList title="Committed roster" lines={committedLines} empty="No committed assignments." />
                        <RoomAssignmentList title="Proposed roster" lines={proposedLines} empty="No proposed assignments." />
                    </>
                )}
            </div>
        </aside>
    );
}

function RoomAssignmentList({
    title,
    lines,
    empty,
}: {
    title: string;
    lines: Array<{ childName: string; imageUrl?: string | null; assignment: AssignmentRosterSubject["assignments"][number] }>;
    empty: string;
}) {
    return (
        <div className="mb-3" data-room-assignment-list={title}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">{title}</p>
            {lines.length === 0 ? (
                <p className="text-[11px] text-alloy-slate">{empty}</p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {lines.map(({ childName, imageUrl, assignment: a }) => (
                        <li
                            key={a.assignmentId}
                            className="rounded-md border border-alloy-stone/10 px-2 py-1.5"
                            data-room-assignment-line={a.assignmentId}
                        >
                            <div className="flex items-center gap-2">
                                <CardAvatar name={childName} imageUrl={imageUrl} size={22} />
                                <div className="min-w-0">
                                    <p className="truncate text-[12px] font-semibold text-alloy-midnight">{childName}</p>
                                    <p className="truncate text-[10.5px] text-alloy-slate">
                                        {[a.assignmentTypeLabel, a.weekdaysLabel, a.timeLabel].filter(Boolean).join(" · ")}
                                    </p>
                                    <p className="text-[10px] text-alloy-slate">
                                        {a.isPrimary ? (
                                            "Primary"
                                        ) : a.lifecycleLabel === "Proposed" || a.commitmentKind === "proposed" ? (
                                            <span className="text-[#00458C]">Proposed</span>
                                        ) : a.lifecycleLabel && a.lifecycleLabel !== "Active" ? (
                                            a.lifecycleLabel
                                        ) : null}
                                    </p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
