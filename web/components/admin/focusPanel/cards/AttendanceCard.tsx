"use client";

import { useCallback, useEffect, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ApprovedAttendanceCard from "@/components/operationalCards/AttendanceCard";
import { adaptAttendanceVmToAttendanceCard } from "@/lib/adminV2/runtime/focusPanel/attendance/adaptAttendanceVmToAttendanceCard";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    const [running, setRunning] = useState<string | null>(null);
    const [commandError, setCommandError] = useState<string | null>(null);

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

    /**
     * RUN A REGISTERED COMMAND, then re-read the day.
     *
     * Nothing here writes attendance. Each control dispatches the REGISTERED action of the same name
     * (`attendance.check_in` and its four siblings), which is a thin adapter over the invariant-owning
     * service — so the append-only rule, the agreement gate, the service-date derivation and the room
     * requirement are all enforced where they already live, not restated on a card face.
     *
     * The room is deliberately NOT sent for check-in: the adapter reads it from the PLACEMENT,
     * because the placement is the authority on which room a child belongs in and the card is only
     * showing what it was told. A transfer is the exception, and the one command that genuinely needs
     * an operator decision.
     *
     * The day is re-read rather than patched locally: the fold owns what the events mean, and a card
     * that guessed the new state would be a second answer to a question the provider already answers.
     */
    const run = useCallback(
        async (actionKey: string, payload: Record<string, unknown> = {}) => {
            if (!memberId || running) return;
            setRunning(actionKey);
            setCommandError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: actionKey,
                        entity_type: "child",
                        entity_id: memberId,
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload: { customer_member_id: memberId, ...payload },
                    }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: string };
                // A refusal is the domain speaking — surfaced, never swallowed into a silent no-op.
                if (!json?.ok) setCommandError(json?.error || "The command was refused.");
            } catch {
                setCommandError("The command could not be sent.");
            } finally {
                setRunning(null);
                await load();
            }
        },
        [load, memberId, running],
    );

    useEffect(() => {
        // Clear FIRST: the previous child's day must not linger while the next one resolves.
        setVm(null);
        void load();
    }, [load]);

    const name = scope?.displayName ?? null;

    /*
     * ── THE DAY IS THE APPROVED CARD, RENDERED BY THE APPROVED COMPONENT ──
     *
     * Everything above this line is the card's DATA and COMMAND work — resolving the participant,
     * loading the day, issuing check-in / move / check-out. None of it is presentation.
     *
     * What changes is that the card no longer draws itself. It renders
     * `components/operationalCards/AttendanceCard`, the same component the design lab renders. The
     * approximation drew a four-slot grid (EXPECTED / ARRIVED / NOW / DEPARTED); the approved card
     * is a horizontal day timeline at full row width. That is not a denser version of the same
     * card — it is a different one.
     *
     * INELIGIBILITY RENDERS AT THE SAME DENSITY, in the same card. `unavailableReason` means the
     * child has no attendable enrolment — which is not an unrecorded day, and the card says so in
     * its own words rather than dropping to a different layout. Falling back to the legacy grid for
     * this state was how the approved timeline and a four-slot grid ended up on the same surface,
     * one per record.
     */
    if (vm) {
        return (
            <div
                className="alloy-os-attendance"
                data-attendance-card="true"
                data-attendance-subject={memberId ?? undefined}
            >
                <ApprovedAttendanceCard
                    evidence={adaptAttendanceVmToAttendanceCard(vm)}
                    /*
                     * NO COMMANDS WHEN THERE IS NOTHING TO COMMAND. A child with no attendable
                     * enrolment cannot be checked in, and offering the control would be an
                     * affordance the domain will refuse — the card states the reason instead.
                     */
                    commands={
                        vm.unavailableReason ?
                            undefined
                        :   {
                                checkIn: () => void run("attendance.check_in"),
                                markAbsent: () => void run("attendance.mark_absent"),
                                checkOut: () => void run("attendance.check_out"),
                                running,
                            }
                    }
                />
            </div>
        );
    }

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
                ) : (
                    /*
                     * A participant is scoped but the day has not resolved yet.
                     *
                     * Everything BELOW this point used to be a second Attendance card — the
                     * four-slot grid, its own command row, its own ineligible message. It is gone
                     * because the approved component now renders every state a resolved `vm` can
                     * be in, including ineligible. TypeScript found the remains: with the early
                     * return above, `vm` was `never` here, which is the compiler saying this
                     * branch can no longer be reached.
                     */
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
