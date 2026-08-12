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

import { useCallback, useEffect, useMemo, useState } from "react";
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

type RosterChild = {
    subjectType: "child";
    customerMemberId: string;
    enrollmentAgreementId: string;
    personId: string | null;
    displayName: string;
    timeLabel: string | null;
    actual: SubjectActual;
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
    onOpenChild?: (child: RosterChild) => void;
    onOpenStaff?: (staff: RosterStaff) => void;
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
    const [openRoomId, setOpenRoomId] = useState<string | null>(null);
    const [busySubject, setBusySubject] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
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
            if (!res.ok) throw new Error(json.error ?? "Could not load attendance");
            setModel(json.roster ?? null);
            // Adopt the org-local service date the server resolved.
            if (!date && json.roster?.date) setDate(json.roster.date);
        } catch (e) {
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

    function childAttendance(child: RosterChild, room: Cell, kind: "check_in" | "check_out" | "absence") {
        return runAction(
            `child:${child.customerMemberId}`,
            {
                enrollment_agreement_id: child.enrollmentAgreementId,
                customer_member_id: child.customerMemberId,
                event_kind: kind,
                room_location_id: kind === "check_out" ? null : room.roomLocationId,
                service_date: room.date,
                actor_type: "staff",
                source_type: "operator_action",
            },
            "/api/admin/childcare-attendance"
        );
    }

    // ── Room live view ────────────────────────────────────────────────────────
    if (openRoom) {
        return (
            <div className={`${WS_SURFACE_CONTENT_PAD} min-h-0 flex-1 overflow-y-auto`} data-attendance-room={openRoom.roomLocationId}>
                <div className={`${WS_OVERVIEW_CONTENT} space-y-4`}>
                    <button
                        type="button"
                        className="inline-flex min-h-[40px] items-center gap-1 text-[12.5px] font-medium text-alloy-midnight/65 hover:text-alloy-midnight"
                        onClick={() => setOpenRoomId(null)}
                        data-attendance-back="true"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden /> All rooms
                    </button>

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
                                            <button
                                                type="button"
                                                className="block truncate text-left text-[13.5px] font-medium text-alloy-midnight hover:underline"
                                                onClick={() => onOpenStaff?.(s)}
                                                data-attendance-open-staff={s.personId}
                                            >
                                                {s.displayName}
                                            </button>
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
                                return (
                                    <li
                                        key={c.customerMemberId}
                                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                                        data-attendance-child={c.customerMemberId}
                                    >
                                        <div className="min-w-0">
                                            <button
                                                type="button"
                                                className="block truncate text-left text-[13.5px] font-medium text-alloy-midnight hover:underline"
                                                onClick={() => onOpenChild?.(c)}
                                                data-attendance-open-child={c.customerMemberId}
                                            >
                                                {c.displayName}
                                            </button>
                                            <p className="truncate text-[11.5px] text-alloy-midnight/55">
                                                {c.timeLabel ? `Expected ${c.timeLabel}` : "Expected today"}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${stateChip(c.actual.state)}`}
                                                data-attendance-child-state={c.actual.state}
                                            >
                                                {stateSentence(c.actual)}
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
                                                    <button
                                                        type="button"
                                                        className={ACTION_SECONDARY}
                                                        disabled={busy}
                                                        onClick={() => childAttendance(c, openRoom, "absence")}
                                                    >
                                                        Mark absent
                                                    </button>
                                                </>
                                            ) : c.actual.state === "present" ? (
                                                <button
                                                    type="button"
                                                    className={ACTION_SECONDARY}
                                                    disabled={busy}
                                                    onClick={() => childAttendance(c, openRoom, "check_out")}
                                                    data-attendance-child-checkout={c.customerMemberId}
                                                >
                                                    Check out
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
    const exceptions = (model?.cells ?? []).flatMap((c) => [
        ...c.children.filter((s) => s.actual.state === "no_record").map((s) => ({
            key: `c:${s.customerMemberId}`,
            label: `${s.displayName} has not arrived`,
            room: c.roomName,
        })),
        ...c.staff.filter((s) => s.actual.state === "no_record").map((s) => ({
            key: `s:${s.personId}`,
            label: `${s.displayName} has not arrived`,
            room: c.roomName,
        })),
    ]);

    return (
        <div className={`${WS_SURFACE_CONTENT_PAD} min-h-0 flex-1 overflow-y-auto`} data-attendance-overview="true">
            <div className={`${WS_OVERVIEW_CONTENT} space-y-4`}>
                <header>
                    <p className={WS_EYEBROW}>Attendance</p>
                    <h2 className="text-[18px] font-semibold text-alloy-midnight">{date ? formatLongDate(date) : "Today"}</h2>
                    <p className="mt-0.5 text-[12px] text-alloy-midnight/60">{siteName}</p>
                </header>

                {error ? (
                    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
                ) : null}

                {model ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-attendance-metrics="true">
                        {[
                            { label: "Children present", value: `${model.totals.actualChildrenPresent}/${model.totals.expectedChildren}` },
                            { label: "Staff present", value: `${model.totals.actualStaffPresent}/${model.totals.scheduledStaff}` },
                            { label: "Rooms short", value: String(model.totals.roomsActuallyShort) },
                            { label: "Not arrived", value: String(exceptions.length) },
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
                                    <dt className="text-[10px] uppercase tracking-[0.08em] text-alloy-midnight/40">Children</dt>
                                    <dd className="text-[15px] font-semibold text-alloy-midnight">
                                        {cell.actualChildrenPresent} / {cell.expectedChildCount} present
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
