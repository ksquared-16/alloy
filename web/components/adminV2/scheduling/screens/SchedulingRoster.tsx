"use client";

/**
 * Scheduling Roster — the room × weekday occupancy + ratio planning board.
 *
 * An operational planning surface: full width, sticky room column + sticky header row,
 * per-room health, occupancy fill, ratio indicators, hover + selection. Clicking a room,
 * a day cell, an occupancy figure, or a ratio warning opens the room-detail inspector
 * focused on that context. Launch cards from Overview arrive with a filter (unplaced /
 * starts / near-capacity / ratio-risk) that focuses the board. Occupancy / ratio signals
 * are consumed from the read-model — this screen owns presentation, never the calculation.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type RosterTone = "pine" | "gold" | "ember";

export type RosterCell = {
    dayKey: string;
    dayLabel: string;
    occupancy: number | null;
    capacity: number | null;
    pct: number;
    ratioLabel: string;
    tone: RosterTone;
    state?: "breach" | "closed";
    isToday?: boolean;
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

const TONE_DOT: Record<RosterTone, string> = { pine: "bg-alloy-bend-pine", gold: "bg-alloy-gold-dark", ember: "bg-alloy-ember" };
const TONE_HEALTH: Record<RosterTone, string> = {
    pine: "bg-alloy-bend-pine/10 text-alloy-bend-pine",
    gold: "bg-alloy-gold-dark/15 text-alloy-gold-dark",
    ember: "bg-alloy-ember/10 text-alloy-ember",
};
const TONE_BAR: Record<RosterTone, string> = { pine: "bg-alloy-bend-pine", gold: "bg-alloy-gold-dark", ember: "bg-alloy-ember" };

export default function SchedulingRoster({
    data,
    loading,
    siteName,
    focusRoomId,
    filter,
    onClearFilter,
    onSelectCell,
    onSelectRoom,
    onWeekChange,
}: {
    data: RosterData | null;
    loading: boolean;
    siteName: string;
    focusRoomId?: string;
    filter?: RosterFilterContext | null;
    onClearFilter?: () => void;
    onSelectCell?: (roomId: string, dayKey: string) => void;
    onSelectRoom?: (roomId: string) => void;
    onWeekChange?: (dir: -1 | 1 | 0) => void;
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
        <div className="flex min-h-0 flex-1 flex-col gap-3" data-scheduling-roster="true">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-alloy-stone/25">
                    <button type="button" className="px-2.5 py-1.5 text-alloy-slate hover:bg-alloy-stone/[0.06]" onClick={() => onWeekChange?.(-1)} aria-label="Previous week">
                        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    <button type="button" className="border-x border-alloy-stone/25 px-3 py-1.5 text-[12px] font-semibold text-alloy-midnight hover:bg-alloy-stone/[0.06]" onClick={() => onWeekChange?.(0)}>
                        {weekLabel}
                    </button>
                    <button type="button" className="px-2.5 py-1.5 text-alloy-slate hover:bg-alloy-stone/[0.06]" onClick={() => onWeekChange?.(1)} aria-label="Next week">
                        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                </div>
                <p className="text-[11px] text-alloy-slate">
                    {rooms.length > 0 ? `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"} · ${siteName}` : siteName}
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
                        <RoomDetailPanel room={detailRoom} focusDayKey={detail?.dayKey ?? null} onClose={() => setDetail(null)} />
                    ) : null}
                </div>
            )}

            {loading && rooms.length === 0 ? <p className="px-1 text-[12px] text-alloy-slate">Loading roster…</p> : null}
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
                <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold ${TONE_HEALTH[room.health.tone]}`}>{room.health.label}</span>
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
                                <div className="flex items-baseline gap-1">
                                    <span className="text-[14px] font-semibold tabular-nums text-alloy-midnight">{cell.occupancy ?? "—"}</span>
                                    {cell.capacity != null ? <span className="text-[9.5px] text-alloy-slate">of {cell.capacity}</span> : null}
                                </div>
                                <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-alloy-stone/25">
                                    <span className={`block h-full rounded-full ${cell.state === "breach" ? "bg-alloy-ember" : TONE_BAR[cell.tone]}`} style={{ width: `${Math.min(cell.pct, 100)}%` }} />
                                </div>
                                <div className={`mt-1.5 flex items-center gap-1 text-[9px] ${cell.state === "breach" ? "font-semibold text-alloy-ember" : "text-alloy-slate"}`}>
                                    <span className={`h-2 w-2 rounded-full ${cell.state === "breach" ? "bg-alloy-ember" : TONE_DOT[cell.tone]}`} />
                                    {cell.ratioLabel}
                                </div>
                            </>
                        )}
                    </button>
                );
            })}
        </>
    );
}

// ── Room detail inspector — the room's week from the read-model ────────────────
function RoomDetailPanel({ room, focusDayKey, onClose }: { room: RosterRoom; focusDayKey: string | null; onClose: () => void }) {
    const open = room.cells.filter((c) => c.state !== "closed");
    const peak = open.reduce((m, c) => Math.max(m, c.occupancy ?? 0), 0);
    const anyBreach = open.some((c) => c.state === "breach");
    return (
        <aside
            className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-alloy-stone/18 bg-white shadow-[0_2px_10px_rgba(24,39,58,0.07)]"
            data-scheduling-room-detail={room.roomId}
        >
            <header className="flex items-start justify-between gap-2 border-b border-alloy-stone/12 px-3.5 py-3">
                <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-alloy-midnight">{room.roomName}</p>
                    <p className="text-[10.5px] text-alloy-slate">{room.meta}</p>
                </div>
                <button type="button" onClick={onClose} aria-label="Close room detail" className="rounded-md p-1 text-alloy-midnight/45 hover:bg-alloy-stone/[0.08] hover:text-alloy-midnight">
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
            </header>
            <div className="flex items-center gap-2 border-b border-alloy-stone/10 px-3.5 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${TONE_HEALTH[room.health.tone]}`}>{room.health.label}</span>
                <span className="text-[11px] text-alloy-slate">Peak {peak}{anyBreach ? " · over ratio" : ""}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">This week</p>
                <ul className="flex flex-col gap-1">
                    {room.cells.map((c) => {
                        const closed = c.state === "closed";
                        const isFocus = focusDayKey === c.dayKey;
                        return (
                            <li
                                key={c.dayKey}
                                className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${isFocus ? "bg-alloy-bend-pine/[0.07] ring-1 ring-inset ring-alloy-bend-pine/30" : ""}`}
                            >
                                <span className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full ${closed ? "bg-alloy-stone" : c.state === "breach" ? "bg-alloy-ember" : TONE_DOT[c.tone]}`} />
                                    <span className="text-[12px] font-medium text-alloy-midnight">{c.dayLabel}</span>
                                    {c.isToday ? <span className="text-[9px] font-semibold text-alloy-bend-pine">today</span> : null}
                                </span>
                                <span className="text-[11px] text-alloy-slate">
                                    {closed ? "closed" : `${c.occupancy ?? 0}${c.capacity != null ? `/${c.capacity}` : ""} · ${c.ratioLabel}`}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </aside>
    );
}
