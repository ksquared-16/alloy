"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { userFacingEnrichAttentionError } from "@/lib/admin/enrichAttentionDraftMessages";

type Props = {
    suggestion: AttentionSuggestionV1;
    /** When true, parent may collapse the deterministic draft under “Original draft”. */
    onEnhancedSurfaceChange?: (supersedesOriginalDraft: boolean) => void;
};

function copyText(body: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(body);
    }
}

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
export default function OperationalAttentionEnhanceDraft({ suggestion, onEnhancedSurfaceChange }: Props) {
    const draftBody = suggestion.suggested_content?.body?.trim();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [enhancedBody, setEnhancedBody] = useState<string | null>(null);

    useEffect(() => {
        onEnhancedSurfaceChange?.(Boolean(enhancedBody));
    }, [enhancedBody, onEnhancedSurfaceChange]);

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
        onEnhancedSurfaceChange?.(false);
        void runEnhance();
    }, [onEnhancedSurfaceChange, runEnhance]);

    if (!draftBody) return null;

    const showSuccessLine = Boolean(enhancedBody) && !loading;
    const showRegenerate = Boolean(enhancedBody) && !loading;

    return (
        <div className="mt-1 space-y-1" data-drawer-slot="enhance_draft_action">
            {loading ? (
                <div
                    className="flex items-center gap-1.5 text-[9px] font-medium text-alloy-midnight/72"
                    data-drawer-slot="enhance_draft_loading"
                    aria-live="polite"
                >
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-alloy-blue" aria-hidden />
                    <span>{enhancedBody ? "Refreshing draft with Alloy…" : "Enhancing draft with Alloy…"}</span>
                </div>
            ) : enhancedBody ? (
                <button
                    type="button"
                    disabled
                    className="rounded border border-alloy-stone/20 bg-alloy-stone/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-alloy-midnight/55"
                    data-drawer-slot="enhance_draft_primary_done"
                >
                    Enhanced
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => void runEnhance()}
                    className="rounded border border-alloy-blue/25 bg-alloy-blue/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-alloy-blue hover:bg-alloy-blue/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Enhance draft
                </button>
            )}

            {showSuccessLine ? (
                <p className="text-[9px] font-medium text-emerald-800/90" data-drawer-slot="enhance_draft_success">
                    Enhanced draft ready
                </p>
            ) : null}

            {error ? (
                <div className="rounded border border-amber-200/80 bg-amber-50/60 px-1.5 py-1 text-[9px] leading-snug text-alloy-midnight/80" role="alert">
                    {error}
                </div>
            ) : null}

            {enhancedBody ? (
                <div
                    className={`mt-0.5 rounded-md border border-alloy-stone/20 bg-white/80 px-1.5 py-1 shadow-sm ${loading ? "pointer-events-none opacity-55" : ""}`}
                    data-drawer-slot="enhance_draft_enhanced_panel"
                >
                    <div className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Enhanced draft</div>
                    <p className="mt-0.5 text-[8px] text-alloy-midnight/55">Review before using</p>
                    <p className="mt-0.5 text-[8px] italic text-alloy-midnight/48">Not sent — copy and edit as needed.</p>
                    <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded border border-alloy-stone/12 bg-alloy-stone/[0.04] px-1.5 py-1 font-sans text-[10px] leading-relaxed text-alloy-midnight/88">
                        {enhancedBody}
                    </pre>
                    <button
                        type="button"
                        className="mt-1 text-[9px] font-semibold text-alloy-blue hover:underline"
                        onClick={(e) => {
                            e.preventDefault();
                            copyText(enhancedBody);
                        }}
                    >
                        Copy
                    </button>
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
