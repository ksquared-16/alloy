"use client";

import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ProgressionBand from "@/components/cardLab/ProgressionBand";
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
 * ── WORK VIEW NEVER DECIDES THE STAGE ──
 *
 * `sourceWorkView` renders as a lens chip and nothing else. It is structurally impossible for it
 * to reach the stage: `buildOperationalContext` resolves `businessProcess.stageKey` from
 * `subjectVm.workspace.lifecycle_rail.current_stage_key ?? stage_context.stage_key` and contains
 * NO reference to a work unit or work view. The only seam a lens can touch is the stage *label*
 * fallback (`stage_label ?? statusLabel`) — never the key.
 *
 * ── CHILD DIVERGENCE IS CONTEXT, NOT THE STAGE ──
 *
 * `operational-grain-doctrine.md` §2.4: the Focus Panel always opens on an Opportunity, and a
 * child selection is a scope HINT that pre-focuses a card — "it does not change the Focus Panel's
 * grain. The panel is still case-grain." So a child's own participation projects as supporting
 * context beneath the band, emphasised when scoped, and a waitlisted child NEVER rewrites the
 * case's Tour stage.
 */
export default function ProcessCard({
    evidence,
    onViewProcess,
}: {
    evidence: ProcessEvidence;
    onViewProcess?: () => void;
}) {
    const current = evidence.stages.find((s) => s.state === "current");

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

                <div className="alloy-os-process__work">
                    <div className="alloy-os-process__work-main">
                        <p className="alloy-os-process__work-label">
                            Current · {evidence.currentStageLabel}
                            {evidence.sourceWorkView ? (
                                <span className="alloy-os-process__lens">
                                    from {evidence.sourceWorkView}
                                </span>
                            ) : null}
                        </p>
                        <p className="alloy-os-process__work-line">
                            {evidence.workLine}
                            {evidence.dueLine ? (
                                <span className="alloy-os-process__due"> · {evidence.dueLine}</span>
                            ) : null}
                        </p>
                        {evidence.childStates.length ? (
                            <p className="alloy-os-process__children">
                                <span className="alloy-os-process__children-count">
                                    {evidence.childStates.length} children
                                </span>
                                {evidence.childStates.map((c) => (
                                    <span
                                        key={c.name}
                                        className="alloy-os-process__child"
                                        data-scoped={c.scoped ? "true" : undefined}
                                    >
                                        {c.name.split(" ")[0]}
                                        <span className="alloy-os-process__child-stage">{c.stage}</span>
                                    </span>
                                ))}
                            </p>
                        ) : null}
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
                <span className={clsx("alloy-os-process__anchor")} data-current-stage={current?.label} />
            </UniversalCard>
        </div>
    );
}
