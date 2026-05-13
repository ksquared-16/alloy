"use client";

import OperationalAttentionDrawerPanel from "@/components/admin/drawer/OperationalAttentionDrawerPanel";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OperationalAttentionAttachmentError } from "@/lib/admin/operationalAttentionEntityAttachment";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

type Props = {
    overviewData: Record<string, unknown>;
};

/**
 * Secondary operational detail for the overview tab: factors, timing, priority breakdown.
 * Primary suggestion UX lives in {@link OperationalAttentionHeaderStrip} (drawer chrome).
 */
export default function OperationalAttentionDrawerSection({ overviewData }: Props) {
    const payload = overviewData._operational_attention as OpportunityAttentionResult | null | undefined;
    const err = overviewData._operational_attention_error as OperationalAttentionAttachmentError | null | undefined;
    const suggestion = overviewData._attention_suggestion as AttentionSuggestionV1 | null | undefined;

    const showOperationalPanel = Boolean(err?.message) || payload != null;
    if (!showOperationalPanel) {
        return null;
    }

    const omitPrimaryAndNext = Boolean(suggestion && payload?.needs_attention && payload.primary_reason);

    return (
        <details
            className="group/oppOpDetail rounded-lg border border-alloy-stone/14 bg-alloy-stone/[0.02] px-2 py-1.5"
            data-drawer-section="operational_attention_bundle"
        >
            <summary className="cursor-pointer select-none list-none text-[11px] font-semibold text-alloy-midnight/55 hover:text-alloy-midnight/70 [&::-webkit-details-marker]:hidden">
                <span className="underline-offset-2 group-open/oppOpDetail:underline">Operational detail</span>
                <span className="ml-1.5 font-normal text-alloy-midnight/40">· factors and timing</span>
            </summary>
            <div className="mt-2 border-t border-alloy-stone/10 pt-2">
                <OperationalAttentionDrawerPanel
                    payload={payload}
                    error={err}
                    omitPrimaryAndNext={omitPrimaryAndNext}
                />
            </div>
        </details>
    );
}
