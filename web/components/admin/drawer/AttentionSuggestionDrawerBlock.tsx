"use client";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

type Props = {
    suggestion: AttentionSuggestionV1;
    /** Resolver output for auxiliary activity (same payload as operational panel). */
    operational: OpportunityAttentionResult | null | undefined;
};

/**
 * Structured needs-attention suggestion for the opportunity drawer (derived-only; no actions).
 */
export default function AttentionSuggestionDrawerBlock({ suggestion, operational }: Props) {
    const stale = operational?.auxiliary?.activity_stale;
    const activitySignalKey = suggestion.source.activity_signal_key?.trim();

    return (
        <div className="border-t border-alloy-stone/15 pt-3 space-y-3" data-drawer-slot="attention_suggestion_block">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">Suggested next step</p>
                <p className="mt-1 text-[13px] font-medium leading-snug text-alloy-midnight/90">{suggestion.next_action.label}</p>
            </div>

            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">Why this is suggested</p>
                <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/78">{suggestion.reasoning.summary}</p>
            </div>

            {suggestion.reasoning.factors.length > 0 ? (
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">Reasoning factors</p>
                    <ul className="mt-1.5 list-none space-y-1.5 pl-0">
                        {suggestion.reasoning.factors.map((f) => (
                            <li key={f.code} className="text-xs leading-relaxed text-alloy-midnight/78">
                                <span className="font-medium text-alloy-midnight/88">{f.label}</span>
                                {f.sla_tier ? (
                                    <span className="text-alloy-midnight/50"> · {f.sla_tier}</span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {stale?.label ? (
                <div className="rounded-md border border-alloy-stone/18 bg-alloy-stone/[0.04] px-2.5 py-2 text-xs text-alloy-midnight/75">
                    <span className="font-medium text-alloy-midnight/82">Activity context · </span>
                    {stale.label}
                </div>
            ) : activitySignalKey ? (
                <div className="rounded-md border border-alloy-stone/18 bg-alloy-stone/[0.04] px-2.5 py-2 text-xs text-alloy-midnight/75">
                    <span className="font-medium text-alloy-midnight/82">Activity context · </span>
                    Signal: {activitySignalKey}
                </div>
            ) : null}

            {suggestion.suggested_content ? (
                <div className="rounded-md border border-alloy-stone/20 bg-white/70 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">Draft message</p>
                    <p className="mt-1 text-[11px] text-alloy-midnight/55">Not sent — copy and edit before using.</p>
                    <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded border border-alloy-stone/12 bg-alloy-stone/[0.03] px-2 py-1.5 font-sans text-[12px] leading-snug text-alloy-midnight/85 select-all">
                        {suggestion.suggested_content.body}
                    </pre>
                </div>
            ) : null}
        </div>
    );
}
