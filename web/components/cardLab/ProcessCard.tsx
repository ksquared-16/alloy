"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ProgressionBand from "@/components/cardLab/ProgressionBand";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import { Action, ActionRow, FooterAction } from "@/components/cardLab/CardLabKit";
import type { ProcessEvidence } from "@/lib/cardLab/cardLabTypes";

/**
 * Business Process — Journey and What's Next, composed into ONE card.
 *
 *   the band     where this record has been and where it is now   (Business Process / Stage)
 *   the work     what to do about it right now                    (Operational Work + Readiness)
 *   the actions  the registered actions for that work
 *
 * ── DATA OWNERSHIP IS NOT MERGED ──
 *
 * Stage truth stays with the Business Process, work and actions stay with Current Work, and
 * missing information stays with Readiness. This card COMPOSES three existing owners; it derives
 * nothing and it owns nothing.
 *
 * ── NOTHING IS SAID TWICE ──
 *
 * Journey and What's Next both stated the current stage, and What's Next also stated the status.
 * Here the band's current column IS the stage, so the work band names it once as a micro-label and
 * never repeats it. Recent Activity is deliberately absent: activity has its own canonical mode,
 * and reproducing it here would make this a third Activity surface.
 *
 * ── NO PROCESS BRANCHING ──
 *
 * Stages, labels, work and actions all arrive as configuration. There is no Enrollment special
 * case in this component, which is what makes the Assignment and Billing specimens render through
 * the same code.
 *
 * ── NO LENS CHIP ──
 *
 * The originating Work View is NOT rendered. The surrounding workspace already tells the operator
 * which lens they are in, and repeating it consumed card space to restate navigation context. It
 * would earn its place only if the lens materially changed the work or the recommendation — which,
 * per the rule below, it cannot.
 *
 * ── WORK VIEW NEVER DECIDES THE STAGE ──
 *
 * `sourceWorkView` renders as a lens chip and nothing else. It is structurally impossible for it
 * to reach the stage: `buildOperationalContext` resolves `businessProcess.stageKey` from
 * `subjectVm.workspace.lifecycle_rail.current_stage_key ?? stage_context.stage_key` and contains
 * NO reference to a work unit or work view. The only seam a lens can touch is the stage *label*
 * fallback (`stage_label ?? statusLabel`) — never the key.
 *
 * ── FOUR LAYERS, IN THIS ORDER ──
 *
 *   1  case journey        the configured stage spine
 *   2  current case work   and the actions whose SUBJECT is the case
 *   3  participant state   FIRST-CLASS, at its own grain — not a chip
 *   4  child-scoped actions, sitting WITH the child they affect
 *
 * The case stage and a child's stage are both authoritative and may legitimately differ. A
 * waitlisted Avery never rewrites a case at Tour, and Riley never inherits Avery's state.
 *
 * `operational-grain-doctrine.md` §2.4: the Focus Panel always opens on an Opportunity, and a
 * child selection is a scope HINT — "it does not change the Focus Panel's grain. The panel is
 * still case-grain." So a scoped child is ORDERED FIRST and emphasised; it never becomes the
 * subject.
 *
 * When every child matches the case, the region collapses to one line: the divergence is the
 * signal, so alignment should cost nothing.
 */
export default function ProcessCard({
    evidence,
    onViewProcess,
}: {
    evidence: ProcessEvidence;
    onViewProcess?: () => void;
}) {
    const current = evidence.stages.find((s) => s.state === "current");
    // Collapse participant noise when every child matches the case — the divergence IS the signal.
    const aligned =
        evidence.childStates.length > 0 &&
        evidence.childStates.every((c) => c.stage === evidence.currentStageLabel);
    // A scoped child leads; the others remain visible so the operator keeps the whole picture.
    const ordered = [...evidence.childStates].sort((a, b) => Number(!!b.scoped) - Number(!!a.scoped));

    return (
        <div className="alloy-os-process" data-process-card="true">
            <UniversalCard
                title={evidence.processLabel}
                insight=""
                iconName="GitBranch"
                tier="work"
                archetype="action"
                density="compact"
                gridSpan="row"
                data-universal-card-key="business_process"
                footerAction={<FooterAction onClick={onViewProcess}>View process →</FooterAction>}
            >
                <ProgressionBand
                    steps={evidence.stages.map((s) => ({
                        state: s.state,
                        value: s.label,
                        detail: s.when,
                        note: s.outcome,
                    }))}
                    dataName="process"
                    compact
                />

                {/* 2 · CURRENT CASE WORK — and the actions whose SUBJECT is the case. */}
                <div className="alloy-os-process__work">
                    <div className="alloy-os-process__work-main">
                        <p className="alloy-os-process__work-label">Case · {evidence.currentStageLabel}</p>
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
                    </div>
                    <div className="alloy-os-process__work-actions">
                        <ActionRow>
                            {evidence.actions.map((a) => (
                                <Action key={a.label} primary={a.primary}>
                                    {a.label}
                                </Action>
                            ))}
                        </ActionRow>
                    </div>
                </div>

                {/* 3 · PARTICIPANT STATE — first-class, at its own grain. Rendered only when the
                    process HAS participant grain, so Assignment and Billing omit it entirely and
                    there is no Enrollment-specific section in this component. */}
                {evidence.participantsLabel && evidence.childStates.length ? (
                    aligned ? (
                        // Everyone matches the case: one line, no per-child noise.
                        <p className="alloy-os-process__aligned">
                            <span className="alloy-os-process__needed-label">
                                {evidence.participantsLabel}
                            </span>
                            {evidence.childStates.map((c) => c.name.split(" ")[0]).join(" · ")} — all at{" "}
                            {evidence.currentStageLabel}
                        </p>
                    ) : (
                        <section className="alloy-os-process__participants">
                            <p className="alloy-os-process__participants-head">
                                {evidence.participantsLabel}
                            </p>
                            {ordered.map((c) => (
                                <div
                                    key={c.name}
                                    className="alloy-os-process__participant"
                                    data-scoped={c.scoped ? "true" : undefined}
                                >
                                    <CardAvatar name={c.name} imageUrl={c.imageUrl ?? null} size={26} role="child" />
                                    <span className="alloy-os-process__participant-name">{c.name}</span>
                                    <span className="alloy-os-process__participant-stage">{c.stage}</span>
                                    {c.since ? (
                                        <span className="alloy-os-process__participant-since">{c.since}</span>
                                    ) : null}
                                    {/* Child-subject actions live WITH the child, so the operator can
                                        never mistake which entity an action will affect. */}
                                    <span className="alloy-os-process__participant-actions">
                                        {c.actions.map((a) => (
                                            <FooterAction key={a.label}>{a.label} →</FooterAction>
                                        ))}
                                    </span>
                                </div>
                            ))}
                        </section>
                    )
                ) : null}
                <span className={clsx("alloy-os-process__anchor")} data-current-stage={current?.label} />
            </UniversalCard>
        </div>
    );
}
