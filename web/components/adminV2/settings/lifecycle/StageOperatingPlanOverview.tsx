"use client";

/**
 * Stage Overview — the operating plan, readable without expanding anything.
 *
 * The editor's sections all collapse to a bare title today, so a collapsed page communicates
 * nothing and a director has to open six panels to learn what a stage does. This renders the
 * answers directly: what staff do here, what can happen, and the ways out.
 *
 * Everything shown comes from `summarizeStageOperatingPlan`, which reads the same draft the
 * editors write. The page therefore cannot describe configuration it does not have.
 */

import { ArrowRight, CircleDot, Sparkles } from "lucide-react";

import {
    summarizeStageOperatingPlan,
    type StageOverviewSummary,
} from "@/lib/lifecycle/stageOperatingPlanSummary";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

function Pill({ children, tone = "quiet" }: { children: React.ReactNode; tone?: "quiet" | "accent" | "closing" }) {
    const cls =
        tone === "accent"
            ? "border-alloy-pine/25 bg-alloy-pine/[0.06] text-alloy-pine"
            : tone === "closing"
              ? "border-alloy-forge/20 bg-alloy-midnight/[0.03] text-alloy-midnight/60"
              : "border-alloy-forge/15 bg-white text-alloy-midnight/60";
    return (
        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
            {children}
        </span>
    );
}

export default function StageOperatingPlanOverview({
    plan,
    stageLabel,
}: {
    plan: StageOperatingPlanV1 | null;
    stageLabel: string;
}) {
    if (!plan) {
        return (
            <p className="text-[12px] text-alloy-midnight/45" data-testid="stage-overview-empty">
                This stage has no operating plan yet. Add a work item below to describe what staff do here.
            </p>
        );
    }

    const summary: StageOverviewSummary = summarizeStageOperatingPlan(plan);

    return (
        <div className="space-y-4" data-testid="stage-overview">
            {plan.purpose?.trim() ? (
                <p className="text-[13px] leading-relaxed text-alloy-midnight/75" data-testid="stage-overview-purpose">
                    {plan.purpose.trim()}
                </p>
            ) : null}

            <p className="text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/40" data-testid="stage-overview-headline">
                {summary.headline}
            </p>

            {/* What staff do here — the centre of the model. */}
            {summary.workItems.length ? (
                <div className="space-y-2" data-testid="stage-overview-work">
                    {summary.workItems.map((w) => (
                        <div
                            key={w.templateKey}
                            className="rounded-lg border border-alloy-forge/12 bg-white px-3 py-2.5"
                            data-testid={`stage-overview-work-${w.templateKey}`}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[13px] font-semibold text-alloy-midnight">{w.label}</span>
                                {w.primary ? <Pill tone="accent">Primary</Pill> : null}
                                {w.required ? <Pill>Required</Pill> : <Pill>Optional</Pill>}
                                <Pill>{w.dueExpectation}</Pill>
                            </div>
                            {w.purpose ? (
                                <p className="mt-1 text-[12px] leading-relaxed text-alloy-midnight/60">{w.purpose}</p>
                            ) : null}
                            <p className="mt-1.5 text-[11px] text-alloy-midnight/45">
                                {w.actionCount} {w.actionCount === 1 ? "action" : "actions"} ·{" "}
                                {w.outcomes.length} {w.outcomes.length === 1 ? "outcome" : "outcomes"}
                                {w.attentionLabels.length
                                    ? ` · ${w.attentionLabels.length} attention ${w.attentionLabels.length === 1 ? "rule" : "rules"}`
                                    : ""}
                            </p>
                            {w.exitOutcome ? (
                                <p
                                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-alloy-pine"
                                    data-testid={`stage-overview-exit-${w.templateKey}`}
                                >
                                    <ArrowRight size={11} />
                                    {w.exitOutcome.label} moves the family on
                                    {w.exitOutcome.automatic ? " — automatically" : ""}
                                </p>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-[12px] text-alloy-midnight/45">No work items configured for {stageLabel}.</p>
            )}

            {/* Ways out, in product language rather than transition identities. */}
            {summary.exitPaths.length ? (
                <div className="space-y-1.5" data-testid="stage-overview-exits">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/40">Ways out</p>
                    {summary.exitPaths.map((p) => (
                        <div
                            key={p.transitionRef}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]"
                            data-testid={`stage-overview-exit-path-${p.transitionRef}`}
                        >
                            <span className="font-medium text-alloy-midnight/80">{p.label}</span>
                            {p.closesRecord ? <Pill tone="closing">Closes the record</Pill> : null}
                            <span className="text-[11px] text-alloy-midnight/45">
                                {p.usedByOutcomes.length
                                    ? `used by ${p.usedByOutcomes.join(", ")}`
                                    : "not used by any outcome yet"}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-[12px] text-alloy-midnight/45" data-testid="stage-overview-no-exits">
                    No ways out of this stage yet. Add an outgoing path so outcomes can move families onward.
                </p>
            )}

            {/* Stage-level attention only. Work-scoped attention belongs on its work item. */}
            {summary.stageAttentionLabels.length ? (
                <div className="space-y-1" data-testid="stage-overview-stage-attention">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/40">
                        Stage-level attention
                    </p>
                    <ul className="space-y-0.5">
                        {summary.stageAttentionLabels.map((label) => (
                            <li key={label} className="flex items-center gap-1.5 text-[12px] text-alloy-midnight/65">
                                <CircleDot size={10} className="shrink-0 text-alloy-midnight/30" />
                                {label}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

/**
 * The per-outcome effect lines, for use inside a work item.
 *
 * Kept beside the overview because both read the same summary — the point of this slice is that
 * there is exactly one description of what an outcome does, not one per surface.
 */
export function WorkItemOutcomeEffects({
    plan,
    templateKey,
}: {
    plan: StageOperatingPlanV1 | null;
    templateKey: string;
}) {
    if (!plan) return null;
    const work = summarizeStageOperatingPlan(plan).workItems.find((w) => w.templateKey === templateKey);
    if (!work || !work.outcomes.length) return null;

    return (
        <div className="space-y-1.5" data-testid={`work-item-outcome-effects-${templateKey}`}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/40">
                What can happen
            </p>
            {work.outcomes.map((o) => (
                <div key={o.outcomeKey} className="text-[12px]" data-testid={`work-item-outcome-${o.outcomeKey}`}>
                    <span className="font-medium text-alloy-midnight/80">{o.label}</span>
                    {o.automatic ? (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-alloy-pine">
                            <Sparkles size={9} />
                            automatic
                        </span>
                    ) : null}
                    <span className="ml-1.5 text-alloy-midnight/55">{o.sentence}</span>
                </div>
            ))}
        </div>
    );
}
