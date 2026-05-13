"use client";

import AttentionSuggestionDrawerBlock from "@/components/admin/drawer/AttentionSuggestionDrawerBlock";
import OperationalAttentionDrawerPanel from "@/components/admin/drawer/OperationalAttentionDrawerPanel";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OperationalAttentionAttachmentError } from "@/lib/admin/operationalAttentionEntityAttachment";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

type Props = {
    overviewData: Record<string, unknown>;
};

/**
 * Overview-tab operational attention + derived suggestion (Cards 4–5). Header chrome stays in
 * {@link OperationalAttentionHeaderStrip}; this block is the structured body.
 */
export default function OperationalAttentionDrawerSection({ overviewData }: Props) {
    const payload = overviewData._operational_attention as OpportunityAttentionResult | null | undefined;
    const err = overviewData._operational_attention_error as OperationalAttentionAttachmentError | null | undefined;
    const suggestion = overviewData._attention_suggestion as AttentionSuggestionV1 | null | undefined;

    const hasSuggestion = suggestion != null;
    const showOperationalPanel = Boolean(err?.message) || payload != null;

    if (!showOperationalPanel && !hasSuggestion) {
        return null;
    }

    return (
        <div className="space-y-0" data-drawer-section="operational_attention_bundle">
            {showOperationalPanel ? (
                <div className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
                        Operational attention
                    </h3>
                    <OperationalAttentionDrawerPanel payload={payload} error={err} />
                </div>
            ) : null}
            {hasSuggestion && suggestion ? (
                <AttentionSuggestionDrawerBlock suggestion={suggestion} operational={payload ?? null} />
            ) : null}
        </div>
    );
}
