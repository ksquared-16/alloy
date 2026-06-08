"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import OperationalAttentionAnchoredDraftPopover from "@/components/admin/drawer/OperationalAttentionAnchoredDraftPopover";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { userFacingEnrichAttentionError } from "@/lib/admin/enrichAttentionDraftMessages";
import { MUTATION_BOUNDARY_ENHANCED_DRAFT } from "@/lib/adminV2/bos/bosMutationBoundaryCopy";

type Props = {
    suggestion: AttentionSuggestionV1;
};

function newCorrelationId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `corr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Operator-only draft polish: POST enrich route, copy-only. No send/apply/persistence.
 * Live provider runs only on explicit Enhance / Regenerate — not on mount or expand/collapse.
 */
export default function OperationalAttentionEnhanceDraft({ suggestion }: Props) {
    const draftBody = suggestion.suggested_content?.body?.trim();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [enhancedBody, setEnhancedBody] = useState<string | null>(null);
    const [enhancedPopoverOpen, setEnhancedPopoverOpen] = useState(false);
    const enhancedTriggerRef = useRef<HTMLButtonElement>(null);

    const runEnhance = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/ai/enrich-attention-suggestion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    correlation_id: newCorrelationId(),
                    deterministic_suggestion: suggestion,
                }),
            });
            const json = (await res.json()) as Record<string, unknown> & {
                ok?: boolean;
                envelope?: { enrichment?: { suggested_draft_body_overlay?: string | null } | null };
            };
            if (!res.ok || json.ok === false) {
                setError(userFacingEnrichAttentionError(res, json));
                return;
            }
            const overlay = json.envelope?.enrichment?.suggested_draft_body_overlay?.trim();
            if (!overlay) {
                setError(
                    "No enhanced wording came back — your organization may have drafting turned off, or the service returned an empty result. The original draft is unchanged.",
                );
                return;
            }
            setEnhancedBody(overlay);
        } catch {
            setError(userFacingEnrichAttentionError(new Response(null, { status: 0 }), null));
        } finally {
            setLoading(false);
        }
    }, [suggestion]);

    const onRegenerate = useCallback(() => {
        setEnhancedPopoverOpen(false);
        void runEnhance();
    }, [runEnhance]);

    if (!draftBody) return null;

    const showSuccessLine = Boolean(enhancedBody);
    const showRegenerate = Boolean(enhancedBody) && !loading;

    return (
        <div className="relative mt-1 w-full min-w-0 space-y-1" data-drawer-slot="enhance_draft_action">
            {loading ? (
                <div
                    className="flex items-center gap-1.5 text-[9px] font-medium text-alloy-midnight/72"
                    data-drawer-slot="enhance_draft_loading"
                    aria-live="polite"
                >
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-alloy-blue" aria-hidden />
                    <span>{enhancedBody ? "Refreshing enhanced draft…" : "Preparing enhanced draft…"}</span>
                </div>
            ) : enhancedBody ? (
                <button
                    type="button"
                    disabled
                    className="rounded border border-alloy-stone/20 bg-alloy-stone/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-alloy-midnight/55"
                    data-drawer-slot="enhance_draft_primary_done"
                >
                    Enhanced (preview)
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => void runEnhance()}
                    className="rounded border border-alloy-blue/25 bg-alloy-blue/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-alloy-blue hover:bg-alloy-blue/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Enhance draft (preview)
                </button>
            )}

            {showSuccessLine ? (
                <div className={`relative w-full min-w-0 ${loading ? "pointer-events-none opacity-55" : ""}`}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="text-[9px] font-medium text-emerald-800/90" data-drawer-slot="enhance_draft_success">
                            {MUTATION_BOUNDARY_ENHANCED_DRAFT}
                        </p>
                        <button
                            ref={enhancedTriggerRef}
                            type="button"
                            className="text-[8px] font-semibold text-alloy-blue hover:underline"
                            data-drawer-slot="enhance_draft_view_toggle"
                            aria-expanded={enhancedPopoverOpen}
                            onClick={() => setEnhancedPopoverOpen((v) => !v)}
                        >
                            {enhancedPopoverOpen ? "Hide" : "View"}
                        </button>
                    </div>
                    <OperationalAttentionAnchoredDraftPopover
                        open={enhancedPopoverOpen}
                        onClose={() => setEnhancedPopoverOpen(false)}
                        anchorRef={enhancedTriggerRef}
                        title="Enhanced draft (preview only)"
                        subtitle="Copy only — does not send."
                        body={enhancedBody ?? ""}
                        copyLabel="Copy"
                        data-drawer-slot="enhance_draft_popover"
                    />
                </div>
            ) : null}

            {error ? (
                <div className="rounded border border-amber-200/80 bg-amber-50/60 px-1.5 py-1 text-[9px] leading-snug text-alloy-midnight/80" role="alert">
                    {error}
                </div>
            ) : null}

            {showRegenerate ? (
                <button
                    type="button"
                    onClick={() => void onRegenerate()}
                    className="text-[8px] font-medium text-alloy-midnight/45 underline decoration-dotted underline-offset-2 hover:text-alloy-midnight/65"
                    data-drawer-slot="enhance_draft_regenerate"
                >
                    Regenerate
                </button>
            ) : null}
        </div>
    );
}
