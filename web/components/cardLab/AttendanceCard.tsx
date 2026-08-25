"use client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ProgressionBand from "@/components/cardLab/ProgressionBand";
import { Action, ActionRow, CardBody, EmptyLine, FooterAction } from "@/components/cardLab/CardLabKit";
import { projectAttendanceDay } from "@/lib/cardLab/attendanceDayProjection";
import type { AttendanceEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Attendance — "How is this child's day going, and is it recorded correctly?"
 *
 * A pure projection of the existing `ChildAttendanceReadModel`: `currentPresenceState`,
 * `checkInOutTimeline`, `roomMovementTimeline`, `absences`, `corrections` and
 * `expectedVsActualVariances`. No second attendance model is introduced.
 *
 * Classroom movement is real truth, not an illustration — `room_transfer` is a first-class
 * `AttendanceEventKind` carrying `from_room_location_id` / `to_room_location_id`.
 *
 * Nothing on this card is a directly editable field. Corrections are `entry_type:
 * correction | reversal` events, so the operator's paths are actions, and they use the What's
 * Next outline button row rather than an idiom of their own.
 */
export default function AttendanceCard({
    evidence,
    onViewHistory,
}: {
    evidence: AttendanceEvidence;
    onViewHistory?: () => void;
}) {
    const { expected, actual } = evidence;
    const span = Math.max(1, expected.toMin - expected.fromMin);
    const pct = (min: number) => ((min - expected.fromMin) / span) * 100;
    const clamp = (n: number) => Math.min(100, Math.max(0, n));

    const isEmpty = evidence.events.length === 0;
    // Bounded projection — the card's width budget is fixed no matter how busy the day was.
    const day = projectAttendanceDay(evidence.events);

    return (
        <div className="alloy-os-attendance" data-attendance-card="true">
            <UniversalCard
                title="Attendance — Today"
                insight={isEmpty ? "No attendance recorded today" : evidence.answerLine}
                supportingInsight={isEmpty ? null : evidence.supportingLine}
                iconName="Clock"
                tier="work"
                archetype="timeline"
                statusChip={evidence.statusChip}
                statusTone={evidence.statusTone}
                density="compact"
                gridSpan="row"
                data-universal-card-key="attendance"
                footerAction={<FooterAction onClick={onViewHistory}>View history →</FooterAction>}
            >
                {isEmpty ? (
                    <CardBody>
                        <EmptyLine>Expected {expected.fromLabel} – {expected.toLabel}. Nothing recorded yet.</EmptyLine>
                        <ActionRow>
                            <Action primary>Check in</Action>
                            <Action>Mark absent</Action>
                        </ActionRow>
                    </CardBody>
                ) : (
                    <CardBody className="alloy-os-attendance__body">
                        <div className="alloy-os-attendance__track" aria-hidden="true">
                            <span className="alloy-os-attendance__expected" />
                            <span
                                className="alloy-os-attendance__actual"
                                style={{
                                    left: `${clamp(pct(actual.fromMin))}%`,
                                    width: `${clamp(pct(actual.toMin) - pct(actual.fromMin))}%`,
                                }}
                            />
                            <span
                                className="alloy-os-attendance__tick"
                                data-tick="past"
                                style={{ left: `${clamp(pct(actual.fromMin))}%` }}
                            />
                            <span
                                className="alloy-os-attendance__tick"
                                data-tick="now"
                                style={{ left: `${clamp(pct(actual.toMin))}%` }}
                            />
                        </div>
                        <div className="alloy-os-attendance__scale">
                            <span>{expected.fromLabel}</span>
                            <span>{expected.toLabel}</span>
                        </div>

                        <ProgressionBand
                            steps={day.steps}
                            dataName="attendance"
                            onCollapsedClick={onViewHistory}
                        />

                        <ActionRow>
                            <Action>Correct check-in</Action>
                            <Action>Record movement</Action>
                            <Action primary>Check out</Action>
                        </ActionRow>

                        <div className="alloy-os-currentwork__recent-activity">
                            <p className="alloy-os-cardlab__section-head">Last 5 days</p>
                            <div className="alloy-os-attendance__recent">
                                {evidence.recentDays.map((d) => (
                                    <div key={d.day} className="alloy-os-attendance__day" data-day-state={d.state}>
                                        <span className="alloy-os-attendance__day-mark" aria-hidden="true" />
                                        <span className="alloy-os-attendance__day-label">{d.day}</span>
                                        <span className="alloy-os-attendance__day-hours">{d.hours}</span>
                                    </div>
                                ))}
                            </div>
                            {day.hiddenCount ? (
                                <p className="alloy-os-currentwork__recent-activity-when">
                                    {day.hiddenCount} earlier {day.hiddenCount === 1 ? "movement is" : "movements are"} in View day — the record keeps every one.
                                </p>
                            ) : null}
                            {evidence.correctionNote ? (
                                <p className="alloy-os-currentwork__recent-activity-when">
                                    {evidence.correctionNote}
                                </p>
                            ) : null}
                        </div>
                    </CardBody>
                )}
            </UniversalCard>
        </div>
    );
}
