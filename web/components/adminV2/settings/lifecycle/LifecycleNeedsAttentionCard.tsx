"use client";

import Link from "next/link";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_MEANINGS } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { lifecycleStageWorkspaceAppearance } from "@/lib/completion/lifecycleStageWorkspaceMapping";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";

const ATTENTION_TRIGGERS: Record<string, string> = {
    "New inquiry — first response overdue": "No staff response within the expected window after a new inquiry.",
    "Qualification — follow-up overdue": "Qualification work has stalled without a recent touch.",
    "Follow-up commitment overdue": "A promised follow-up date has passed.",
    "Tour — outcome needed": "A tour occurred but no outcome was recorded.",
    "Waiting on family": "The family has not completed a requested next step.",
    "Waiting on staff": "Internal work is blocking progress.",
};

export default function LifecycleNeedsAttentionCard({
    stageKey,
}: {
    stageKey: string;
}) {
    const operatorStage = asOperatorStageKey(stageKey);
    const appearance = operatorStage ? lifecycleStageWorkspaceAppearance(operatorStage) : null;
    const signals = appearance?.needsAttentionSignals ?? [];
    const stageMeaning = operatorStage ? LIFECYCLE_STAGE_MEANINGS[operatorStage] : null;

    return (
        <div className="space-y-2 text-xs" data-testid="lifecycle-needs-attention-card">
            <p className="leading-relaxed text-alloy-midnight/65">
                Attention signals tell operators when work is overdue, blocked, or needs follow-up.
            </p>
            {signals.length ? (
                <ul className="space-y-2" data-testid="lifecycle-attention-signals">
                    {signals.map((signal) => (
                        <li
                            key={signal}
                            className="rounded-md border border-alloy-forge/10 bg-white/70 px-2 py-1.5"
                        >
                            <p className="font-medium text-alloy-midnight">{signal}</p>
                            {ATTENTION_TRIGGERS[signal] ? (
                                <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                                    {ATTENTION_TRIGGERS[signal]}
                                </p>
                            ) : null}
                            <p className="mt-0.5 text-[10px] text-alloy-midnight/45">
                                Appears in Needs Attention on the enrollment pipeline.
                            </p>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-alloy-midnight/50">No attention signals are mapped to this stage.</p>
            )}
            {stageMeaning ? (
                <p className="text-[10px] text-alloy-midnight/45">
                    Rules are configured per department in Attention &amp; SLA settings.
                </p>
            ) : null}
            <Link
                href="/settings/attention-sla-rules"
                className="inline-block font-medium text-alloy-pine hover:underline"
            >
                Attention &amp; SLA settings
            </Link>
        </div>
    );
}
