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
 * This is expectation, not attendance. Nothing here records who actually arrived.
 */

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

type StaffingSufficiency = "sufficient" | "short" | "unknown" | "idle";

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

type RosterCell = {
    roomLocationId: string;
    roomName: string;
    date: string;
    children: RosterChild[];
    staff: RosterStaff[];
    expectedChildCount: number;
    scheduledStaffCount: number;
    requiredStaff: number | null;
    staffingSufficiency: StaffingSufficiency;
    staffingReason: "evaluated" | "no_ratio_configuration";
};

type RosterModel = {
    siteLocationId: string;
    date: string;
    cells: RosterCell[];
    staffingSufficiency: StaffingSufficiency;
    totals: {
        expectedChildren: number;
        scheduledStaff: number;
        requiredStaff: number | null;
        roomsShort: number;
        roomsUnknown: number;
    };
    unroomedStaff: RosterStaff[];
};

export type DailyRosterProps = {
    siteLocationId: string;
    siteName: string;
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

/** Operator sentence for the room's staffing state — meaning before numbers. */
function staffingSentence(cell: RosterCell): string {
    if (cell.staffingSufficiency === "idle") {
        return "No one expected in this room today";
    }
    if (cell.staffingSufficiency === "unknown") {
        return "Staffing requirement not configured for this room";
    }
    if (cell.staffingSufficiency === "short") {
        const gap = (cell.requiredStaff ?? 0) - cell.scheduledStaffCount;
        return `Short ${gap} staff`;
    }
    // The badge already says "Staffed"; repeating it here spent the sentence line
    // on nothing. Say the numbers the verdict was reached from.
    return `${cell.scheduledStaffCount} of ${cell.requiredStaff ?? cell.scheduledStaffCount} staff scheduled`;
}

function SubjectChip({
    label,
    meta,
    onClick,
    testAttr,
}: {
    label: string;
    meta: string | null;
    onClick?: () => void;
    testAttr: Record<string, string>;
}) {
    const inner = (
        <>
            <span className="truncate text-[12.5px] font-medium text-alloy-midnight">{label}</span>
            {meta ? <span className="truncate text-[11px] text-alloy-midnight/50">{meta}</span> : null}
        </>
    );
    if (!onClick) {
        return (
            <div className="flex min-w-0 flex-col rounded border border-alloy-stone/20 px-2 py-1.5" {...testAttr}>
                {inner}
            </div>
        );
    }
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex min-w-0 flex-col rounded border border-alloy-stone/20 px-2 py-1.5 text-left hover:border-alloy-stone/40 hover:bg-alloy-stone/[0.06]"
            {...testAttr}
        >
            {inner}
        </button>
    );
}

export default function DailyRoster({
    siteLocationId,
    siteName,
    onOpenChild,
    onOpenStaff,
}: DailyRosterProps) {
    /**
     * Null until the server tells us. The operational day is the ORGANIZATION's
     * local service date, not the browser's: `new Date().toISOString()` rolls over
     * at UTC midnight, so a US evening put this surface on tomorrow while Attendance
     * — which already adopts the server's answer — stayed on today. The roster route
     * resolves the service date and returns it as `todayYmd`, so the first request
     * deliberately omits `date`.
     */
    const [date, setDate] = useState<string | null>(null);
    /** The org's today, for the Today control. Never the browser's. */
    const [serverToday, setServerToday] = useState<string | null>(null);
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
            const res = await fetch(
                `/api/admin/roster?site_location_id=${encodeURIComponent(siteLocationId)}${dateParam}`
            );
            const json = (await res.json()) as {
                roster?: RosterModel;
                todayYmd?: string;
                error?: string;
            };
            if (seq !== requestSeq.current) return;
            if (!res.ok) throw new Error(json.error ?? "Could not load the roster");
            setModel(json.roster ?? null);
            if (json.todayYmd) setServerToday(json.todayYmd);
            // Adopt the org-local service date the server resolved.
            if (!date && json.roster?.date) setDate(json.roster.date);
        } catch (e) {
            if (seq !== requestSeq.current) return;
            setError(e instanceof Error ? e.message : "Could not load the roster");
        }
    }, [siteLocationId, date]);

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

    return (
        <div className={`${WS_SURFACE_CONTENT_PAD} min-h-0 flex-1 overflow-y-auto`} data-daily-roster="true">
            <div className={`${WS_OVERVIEW_CONTENT} space-y-4`}>
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className={WS_EYEBROW}>Daily Roster</p>
                        <h2 className="text-[17px] font-semibold text-alloy-midnight">
                            {date ? formatLongDate(date) : "Today"}
                        </h2>
                        <p className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            {siteName}
                            {headline ? ` · ${headline}` : ""}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-40"
                            disabled={!date}
                            onClick={() => date && setDate(shiftYmd(date, -1))}
                            data-roster-prev-day="true"
                            aria-label="Previous day"
                        >
                            ‹
                        </button>
                        <span className="inline-flex items-center gap-1.5 rounded border border-alloy-stone/25 px-2 py-1">
                            <CalendarDays className="h-3.5 w-3.5 text-alloy-midnight/45" aria-hidden />
                            <input
                                type="date"
                                value={date ?? ""}
                                onChange={(e) => setDate(e.target.value || null)}
                                className="bg-transparent text-[12px] text-alloy-midnight outline-none"
                                aria-label="Roster date"
                                data-roster-date="true"
                            />
                        </span>
                        <button
                            type="button"
                            className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-40"
                            disabled={!date}
                            onClick={() => date && setDate(shiftYmd(date, 1))}
                            data-roster-next-day="true"
                            aria-label="Next day"
                        >
                            ›
                        </button>
                        {/* Getting back to today took a date-picker round trip. The
                            org's today, never the browser's. */}
                        {serverToday && date !== serverToday ? (
                            <button
                                type="button"
                                className="rounded border border-alloy-stone/25 px-2 py-1 text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                onClick={() => setDate(serverToday)}
                                data-roster-today="true"
                            >
                                Today
                            </button>
                        ) : null}
                    </div>
                </header>

                {error ? (
                    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                        {error}
                    </p>
                ) : null}

                {model == null && !error ? (
                    <p className="text-[12px] text-alloy-midnight/50">Loading roster…</p>
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
                    {(model?.cells ?? []).map((cell) => {
                        const isOpen = openRoom === cell.roomLocationId;
                        return (
                            <section
                                key={cell.roomLocationId}
                                className={`${WS_PANEL_SURFACE} p-3`}
                                data-roster-room={cell.roomLocationId}
                                data-roster-state={cell.staffingSufficiency}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-[14px] font-semibold text-alloy-midnight">
                                            {cell.roomName}
                                        </h3>
                                        <p className="mt-0.5 text-[12px] text-alloy-midnight/60">
                                            {staffingSentence(cell)}
                                        </p>
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${staffingChipChrome(cell.staffingSufficiency)}`}
                                        data-roster-room-state={cell.staffingSufficiency}
                                    >
                                        {staffingVerdictLabel(cell.staffingSufficiency)}
                                    </span>
                                </div>

                                <dl className="mt-3 grid grid-cols-3 gap-2">
                                    <div>
                                        <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-alloy-midnight/40">
                                            Children
                                        </dt>
                                        <dd
                                            className="text-[16px] font-semibold text-alloy-midnight"
                                            data-roster-children-count={cell.expectedChildCount}
                                        >
                                            {cell.expectedChildCount}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-alloy-midnight/40">
                                            Staff
                                        </dt>
                                        <dd
                                            className="text-[16px] font-semibold text-alloy-midnight"
                                            data-roster-staff-count={cell.scheduledStaffCount}
                                        >
                                            {cell.scheduledStaffCount}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-alloy-midnight/40">
                                            Required
                                        </dt>
                                        <dd
                                            className="text-[16px] font-semibold text-alloy-midnight"
                                            data-roster-required={cell.requiredStaff ?? "unknown"}
                                        >
                                            {cell.requiredStaff ?? "—"}
                                        </dd>
                                    </div>
                                </dl>

                                <button
                                    type="button"
                                    className="mt-3 text-[11.5px] font-medium text-[#00A283] hover:underline"
                                    onClick={() => setOpenRoom(isOpen ? null : cell.roomLocationId)}
                                    data-roster-room-toggle={cell.roomLocationId}
                                >
                                    {isOpen ? "Hide who is expected" : "Who is expected"}
                                </button>

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
