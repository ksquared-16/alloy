"use client";

import { useCallback, useEffect, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import type { AttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

/** Two transfers keep their identity; beyond that the middle collapses to a count. */
const MAX_MOVEMENTS = 2;

/**
 * THE ATTENDANCE CARD — one child's operating day.
 *
 * It answers, in order: what was expected, what happened, where are they now, and what can I do.
 * Every value arrives decided by `buildAttendanceCardVM`; nothing here derives attendance state,
 * and no control mutates anything directly — each one dispatches a REGISTERED command.
 *
 * ── THE SUBJECT IS THE SCOPED PARTICIPANT, OR NOBODY ──
 *
 * The panel is case-grain and a family can have several children, so this card renders against
 * `participantScope`. With several children and none scoped it shows no day and no controls: a card
 * that quietly picked the first child would answer confidently about the wrong one, and the operator
 * would have no way to see the substitution.
 *
 * ── BOUNDING IS PRESENTATION, NEVER TRUTH ──
 *
 * The provider hands over every movement. The middle ones collapse into a count so a busy day cannot
 * destroy the row, while arrival, the latest room and departure — the three facts an operator scans
 * for — always survive.
 */
export default function AttendanceCard({ model, context, receded = false }: Props) {
    const scope = context.participantScope ?? null;
    const memberId = scope?.customerMemberId ?? null;
    const [vm, setVm] = useState<AttendanceCardVM | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!memberId) {
            setVm(null);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(
                `/api/admin/attendance/card?customer_member_id=${encodeURIComponent(memberId)}`,
                { credentials: "include" },
            );
            const json = (await res.json()) as { ok?: boolean; vm?: AttendanceCardVM };
            // Keyed on the member the request was FOR: a slower response for the child the operator
            // just left must never paint over the child they are looking at now.
            setVm(json?.ok && json.vm?.participant?.customerMemberId === memberId ? json.vm : null);
        } catch {
            setVm(null);
        } finally {
            setLoading(false);
        }
    }, [memberId]);

    useEffect(() => {
        // Clear FIRST: the previous child's day must not linger while the next one resolves.
        setVm(null);
        void load();
    }, [load]);

    const name = scope?.displayName ?? null;

    return (
        <div className="alloy-os-attendance" data-attendance-card="true" data-attendance-subject={memberId ?? undefined}>
            <UniversalCard
                title={model.title}
                insight={insightFor(vm, name, Boolean(memberId), loading)}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                density="compact"
                gridSpan={model.span}
                receded={receded}
                data-universal-card-key="attendance"
                footerAction={null}
            >
                {!memberId ? (
                    /* No scoped participant. Stating it is the honest answer for a family with more
                       than one child — the alternative is answering about somebody at random. */
                    <p className="alloy-os-attendance__empty" data-attendance-empty="no-participant">
                        Select a child to see their day.
                    </p>
                ) : vm?.unavailableReason ? (
                    <p className="alloy-os-attendance__empty" data-attendance-empty="unavailable">
                        {vm.unavailableReason}
                    </p>
                ) : vm ? (
                    <>
                        <div className="alloy-os-attendance__day" data-attendance-day={vm.date}>
                            <Slot label="Expected" value={vm.expected.expected ? vm.expected.roomLabel ?? "Today" : "Not expected"} />
                            <Slot label="Arrived" value={timeOf(vm.checkInAt)} />
                            {visibleMovements(vm.movements).map((m) => (
                                <Slot
                                    key={m.eventId}
                                    label={timeOf(m.at) ?? "Moved"}
                                    value={m.toRoomLabel ?? "—"}
                                    data-attendance-movement={m.eventId}
                                />
                            ))}
                            {hiddenMovements(vm.movements) > 0 ? (
                                <Slot
                                    label="Moves"
                                    value={`+${hiddenMovements(vm.movements)} movements`}
                                    data-attendance-movement-overflow="true"
                                />
                            ) : null}
                            <Slot label="Now" value={stateLabel(vm)} />
                            <Slot label="Departed" value={timeOf(vm.checkOutAt)} />
                        </div>

                        {vm.recentDays.length > 0 ? (
                            <div className="alloy-os-attendance__history" data-attendance-history="true">
                                {vm.recentDays.map((d) => (
                                    <span key={d.date} className="alloy-os-attendance__history-day">
                                        {shortDay(d.date)} {timeOf(d.firstCheckInAt) ?? "—"}
                                        {d.lastCheckOutAt ? `–${timeOf(d.lastCheckOutAt)}` : d.present ? "–Present" : ""}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </>
                ) : (
                    <p className="alloy-os-attendance__empty" data-attendance-empty="loading">
                        {loading ? "Loading the day…" : "No attendance record."}
                    </p>
                )}
            </UniversalCard>
        </div>
    );
}

function Slot(props: { label: string; value: string | null } & Record<string, unknown>) {
    const { label, value, ...rest } = props;
    return (
        <span className="alloy-os-attendance__slot" {...rest}>
            <span className="alloy-os-attendance__slot-label">{label}</span>
            <span className="alloy-os-attendance__slot-value">{value ?? "—"}</span>
        </span>
    );
}

/** Arrival, the latest room and departure always survive; the middle collapses. */
function visibleMovements(movements: AttendanceCardVM["movements"]): AttendanceCardVM["movements"] {
    if (movements.length <= MAX_MOVEMENTS) return movements;
    // Keep the LAST ones: where the child ended up matters more than where they passed through.
    return movements.slice(-MAX_MOVEMENTS);
}

function hiddenMovements(movements: AttendanceCardVM["movements"]): number {
    return Math.max(0, movements.length - MAX_MOVEMENTS);
}

function stateLabel(vm: AttendanceCardVM): string {
    switch (vm.state) {
        case "present":
            return vm.currentRoomLabel ?? "Present";
        case "checked_out":
            return "Checked out";
        case "absent":
            return "Absent";
        case "not_arrived":
            return "Not arrived";
        default:
            return "—";
    }
}

function insightFor(
    vm: AttendanceCardVM | null,
    name: string | null,
    hasSubject: boolean,
    loading: boolean,
): string {
    if (!hasSubject) return "";
    if (loading && !vm) return "";
    if (!vm) return "";
    const who = name ? `${name.split(" ")[0]} · ` : "";
    return `${who}${stateLabel(vm)}`;
}

function timeOf(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function shortDay(date: string): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: "short" });
}
