"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { LabAbsent, LabFooter, LabGroup, LabHandoff, LabRow } from "@/components/cardLab/CardLabPrimitives";
import type { AttendanceCardEvidence } from "@/lib/cardLab/attendanceCardEvidence";

/**
 * Attendance card — an understanding surface AND an operational entry point.
 *
 * Renders the four layers that already exist in the platform: expected, actual, corrections, and
 * the derived state between them. Owns none of them.
 *
 * The action row is rendered in its real geometry with the mutating actions DISABLED, because
 * `attendance.record` / `attendance.correct` are not registered capabilities for children
 * (GAP-2). Calling `POST /api/admin/childcare-attendance` from a card would be the duplicate
 * mutation path the doctrine forbids.
 */

const STATE_DOT: Record<string, string> = {
    present: "#16a34a",
    checked_out: "#64748b",
    absent: "#f59e0b",
    not_arrived: "#dc2626",
    no_record: "#cbd5e1",
    closed: "#cbd5e1",
};

export default function AttendanceCard({
    evidence,
    expanded = false,
}: {
    evidence: AttendanceCardEvidence;
    expanded?: boolean;
}) {
    if (evidence.resolution === "unresolved") {
        return (
            <UniversalCard title="Attendance" insight="" tier="work" archetype="status" iconName="clock" density="compact">
                <LabAbsent kind="unresolved">
                    The attendance projection has not answered. The card HOLDS — an empty day and an
                    unloaded day are different facts, and only one of them is an answer.
                </LabAbsent>
            </UniversalCard>
        );
    }

    const today = evidence.today;

    return (
        <UniversalCard
            title="Attendance"
            insight={evidence.answerLine}
            supportingInsight={evidence.supportingLine}
            tier="work"
            archetype="status"
            iconName="clock"
            statusChip={evidence.statusChip}
            statusTone={evidence.statusTone}
            density={expanded ? "expanded" : "compact"}
            data-universal-card-key="attendance"
            footerAction={
                <LabFooter>
                    {evidence.actions.map((a) => (
                        <LabHandoff
                            key={a.key}
                            label={a.label}
                            to={a.key}
                            disabled={!a.available}
                            reason={a.unavailableReason}
                        />
                    ))}
                </LabFooter>
            }
        >
            {today ? (
                <LabGroup title="Today">
                    <LabRow
                        name="Check-in"
                        detail={today.checkInLabel ?? "—"}
                        status={today.roomLabel ?? undefined}
                    />
                    <LabRow name="Check-out" detail={today.checkOutLabel ?? "—"} />
                    {today.expectedWindowLabel ? (
                        <LabRow name="Expected" detail={today.expectedWindowLabel} />
                    ) : today.expected ? (
                        <LabRow name="Expected" detail="today" status="no window configured" tone="muted" />
                    ) : null}
                    {today.absenceReasonLabel ? (
                        <LabRow
                            name="Absence reason"
                            detail={today.absenceReasonLabel}
                            status={today.absenceExcused == null ? undefined : today.absenceExcused ? "Excused" : "Unexcused"}
                        />
                    ) : null}
                    {today.corrected ? (
                        <LabRow name="Corrected" detail="An earlier fact on this day was superseded" tone="critical" />
                    ) : null}
                </LabGroup>
            ) : null}

            {evidence.week.length > 0 ? (
                <LabGroup title="This week">
                    {evidence.week.map((d) => (
                        <div
                            key={d.serviceDate}
                            data-attendance-day={d.serviceDate}
                            data-attendance-state={d.state}
                            style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "2px 0" }}
                        >
                            <span aria-hidden style={{ color: STATE_DOT[d.state] ?? "#cbd5e1", fontSize: 10 }}>●</span>
                            <span style={{ fontSize: 12, fontWeight: 600, width: 34 }}>{d.weekdayLabel}</span>
                            <span style={{ fontSize: 11.5, color: "#475569" }}>
                                {d.state === "absent"
                                    ? (d.absenceReasonLabel ?? "Absent")
                                    : d.state === "closed"
                                      ? "Closed"
                                      : d.state === "not_arrived"
                                        ? "Not arrived"
                                        : d.checkInLabel
                                          ? `${d.checkInLabel}–${d.checkOutLabel ?? "Present"}`
                                          : "No record"}
                            </span>
                            {d.corrected ? (
                                <span style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, marginLeft: "auto" }}>
                                    CORRECTED
                                </span>
                            ) : null}
                            {d.missingCheckout ? (
                                <span style={{ fontSize: 10, color: "#b45309", fontWeight: 700, marginLeft: "auto" }}>
                                    NO CHECKOUT
                                </span>
                            ) : null}
                        </div>
                    ))}
                </LabGroup>
            ) : null}

            {evidence.actions.some((a) => !a.available) ? (
                <LabAbsent kind="absent">
                    Check in / Check out / Mark absent / Correct are rendered in their real geometry but are
                    DISABLED: no registered capability exists for child attendance (GAP-2). Staff has{" "}
                    <code>staff_presence.record</code> and <code>staff_presence.correct</code>; children have
                    neither.
                </LabAbsent>
            ) : null}

            {expanded ? (
                <LabAbsent kind="held">
                    The ledger stays out of the card. Room transfers, full variance detail and the complete
                    event stream belong to the attendance history surface.
                </LabAbsent>
            ) : null}
        </UniversalCard>
    );
}
