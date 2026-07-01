"use client";

import {
    BUSINESS_PROCESS_SECTION_ATTENTION_SUMMARY,
    BUSINESS_PROCESS_SECTION_ATTENTION_ORG_DEFAULTS_LINK,
} from "@/lib/lifecycle/businessProcessUiLabels";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";

type Props = {
    stageLabel: string;
    operatingPlan: StageOperatingPlanV1 | null | undefined;
};

/** Stage-level attention — rules live in Expected Work; org buckets in advanced settings. */
export default function LifecycleStageAttentionSection({ stageLabel, operatingPlan }: Props) {
    const rules = operatingPlan?.attention_rules ?? [];

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-attention-section">
            <p className="text-[11px] leading-relaxed text-alloy-midnight/60">
                {BUSINESS_PROCESS_SECTION_ATTENTION_SUMMARY}
            </p>

            {rules.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.03] px-3 py-2 text-[11px] text-alloy-midnight/70">
                    {rules.map((rule) => (
                        <li key={rule.rule_key}>
                            <span className="font-medium text-alloy-midnight/80">
                                {rule.kind.replace(/_/g, " ")}
                            </span>
                            {rule.threshold != null ? ` (${rule.threshold})` : ""}
                            {" — needs attention in "}
                            {stageLabel}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-[11px] text-alloy-midnight/50">
                    No attention rules yet. Add off-track criteria in Expected work above.
                </p>
            )}

            <div className="text-[11px]">
                <AdminV2NavLink
                    href="/settings/attention-sla-rules"
                    className="font-medium text-alloy-pine hover:underline"
                >
                    {BUSINESS_PROCESS_SECTION_ATTENTION_ORG_DEFAULTS_LINK}
                </AdminV2NavLink>
            </div>
        </div>
    );
}
