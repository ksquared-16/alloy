"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import ProgressionBand from "@/components/cardLab/ProgressionBand";
import { SectionHead } from "@/components/cardLab/CardLabKit";
import type { ProcessEvidence, RailParticipant } from "@/lib/cardLab/cardLabTypes";

/**
 * Expanded Process — what `View process →` opens.
 *
 * The SAME card at `density="expanded"`: the centered Focus Card with a depth scrim that
 * Household, Children and Financials already use. **Not a standalone Process page.**
 *
 * ── P1 GATES EVERY HISTORICAL FACT ──
 *
 * There is no durable authoritative process-stage-history projection today. So:
 *   · the summary rail may use CURRENT authoritative stage truth;
 *   · entered/exited dates render ONLY when `historyAuthoritative` is true;
 *   · skipped / reopened / repeated is never inferred — absence renders as absence.
 *
 * When history is unavailable the surface says so plainly rather than drawing an empty timeline
 * that reads like "nothing happened". Fabricating a date here would be worse than omitting the
 * section, because an operator cannot tell a guess from a record.
 */
export default function ProcessDetailCard({ evidence }: { evidence: ProcessEvidence }) {
    const participantsByStep: Record<string, RailParticipant[]> = {};
    for (const c of evidence.childStates) {
        if (!evidence.stages.some((st) => st.label === c.stageKey)) continue;
        (participantsByStep[c.stageKey] ??= []).push({
            name: c.name,
            shortName: c.name.split(" ")[0]!,
            imageUrl: c.imageUrl,
            scoped: c.scoped,
        });
    }

    return (
        <div className="alloy-os-process alloy-os-process--detail" data-process-detail="true">
            <UniversalCard
                title={evidence.processLabel}
                insight={`${evidence.subjectLabel} · ${evidence.currentStageLabel}`}
                supportingInsight={
                    evidence.startedAt ? `Started ${evidence.startedAt}` : null
                }
                iconName="GitBranch"
                tier="work"
                archetype="timeline"
                density="expanded"
                gridSpan="row"
                data-universal-card-key="business_process_detail"
            >
                {/* 1 · the full journey, with the participant projection intact */}
                <ProgressionBand
                    steps={evidence.stages.map((s) => ({
                        state: s.state,
                        value: s.label,
                        detail: s.primarySupport,
                        note: s.secondarySupport,
                    }))}
                    dataName="process-detail"
                    compact
                    participantsByStep={participantsByStep}
                />

                {/* 2 · stage history — only where the canonical projection backs it */}
                <SectionHead>Stage history</SectionHead>
                {evidence.historyAuthoritative && evidence.history.length ? (
                    <div className="alloy-os-processdetail__history">
                        {evidence.history.map((h) => (
                            <article key={h.label} className="alloy-os-processdetail__stage">
                                <p className="alloy-os-processdetail__stage-name">{h.label}</p>
                                <div className="alloy-os-processdetail__stage-facts">
                                    {h.enteredAt ? <Fact label="Entered" value={h.enteredAt} /> : null}
                                    {h.exitedAt ? <Fact label="Exited" value={h.exitedAt} /> : null}
                                    {h.outcome ? <Fact label="Outcome" value={h.outcome} /> : null}
                                    {h.transition ? <Fact label="Transition" value={h.transition} /> : null}
                                </div>
                                {h.work.length ? (
                                    <p className="alloy-os-processdetail__line">
                                        <span className="alloy-os-processdetail__lbl">Work</span>
                                        {h.work.join(" · ")}
                                    </p>
                                ) : null}
                                {h.requirements.length ? (
                                    <p className="alloy-os-processdetail__line">
                                        <span className="alloy-os-processdetail__lbl">Requirements</span>
                                        {h.requirements.map((r) => (
                                            <span
                                                key={r.label}
                                                className={clsx(
                                                    "alloy-os-processdetail__req",
                                                    !r.satisfied && "alloy-os-processdetail__req--missing",
                                                )}
                                            >
                                                {r.label}
                                            </span>
                                        ))}
                                    </p>
                                ) : null}
                                {h.participants.length ? (
                                    <p className="alloy-os-processdetail__line">
                                        <span className="alloy-os-processdetail__lbl">Participants</span>
                                        {h.participants.map((p) => (
                                            <span key={p.name} className="alloy-os-processdetail__pp">
                                                {p.name} · {p.state}
                                            </span>
                                        ))}
                                    </p>
                                ) : null}
                            </article>
                        ))}
                    </div>
                ) : (
                    <p className="alloy-os-processdetail__nohistory">
                        Stage history is not available for this record. Entry and exit times, outcomes
                        and skipped or reopened stages require the canonical process-stage-history
                        projection (<strong>P1</strong>), which does not exist yet — so nothing is shown
                        rather than inferred.
                    </p>
                )}

                {/* 3 · participants, at their own grain */}
                {evidence.participantsLabel && evidence.childStates.length ? (
                    <>
                        <SectionHead>{evidence.participantsLabel}</SectionHead>
                        <div className="alloy-os-processdetail__participants">
                            {evidence.childStates.map((c) => (
                                <div
                                    key={c.name}
                                    className="alloy-os-processdetail__participant"
                                    data-scoped={c.scoped ? "true" : undefined}
                                >
                                    <CardAvatar name={c.name} imageUrl={c.imageUrl ?? null} size={24} role="child" />
                                    <span className="alloy-os-processdetail__pname">{c.name}</span>
                                    <span className="alloy-os-process__participant-stage">{c.stage}</span>
                                    <span className="alloy-os-process__participant-since">
                                        {c.since ?? "—"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : null}

                {/* 4 · current work and what remains */}
                <SectionHead>Current work</SectionHead>
                <p className="alloy-os-process__work-line">
                    {evidence.workLine}
                    {evidence.dueLine ? (
                        <span className="alloy-os-process__due"> · {evidence.dueLine}</span>
                    ) : null}
                </p>
                {evidence.stillNeeded.length ? (
                    <p className="alloy-os-process__needed">
                        <span className="alloy-os-process__needed-label">Still needed</span>
                        {evidence.stillNeeded.join(" · ")}
                    </p>
                ) : null}
                <p className="alloy-os-processdetail__nohistory">
                    Activity and provenance reuse the canonical activity mode — this surface does not
                    introduce a second activity system.
                </p>
            </UniversalCard>
        </div>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <span className="alloy-os-processdetail__fact">
            <span className="alloy-os-processdetail__lbl">{label}</span>
            {value}
        </span>
    );
}
