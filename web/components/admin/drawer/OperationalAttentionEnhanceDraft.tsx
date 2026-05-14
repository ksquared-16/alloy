"use client";

import { useCallback, useState } from "react";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";

type Props = {
    suggestion: AttentionSuggestionV1;
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
 * Operator-only draft polish: POST enrich route, show overlay text, copy-only. No send/apply/persistence.
 */
export default function OperationalAttentionEnhanceDraft({ suggestion }: Props) {
    const draftBody = suggestion.suggested_content?.body?.trim();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [enhancedBody, setEnhancedBody] = useState<string | null>(null);

    const onEnhance = useCallback(async () => {
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
            const json = (await res.json()) as {
                ok?: boolean;
                error?: string;
                message?: string;
                envelope?: { enrichment?: { suggested_draft_body_overlay?: string | null } | null };
            };
            if (!res.ok || json.ok === false) {
                setError((json.message || json.error || `Request failed (${res.status})`).trim());
                return;
            }
            const overlay = json.envelope?.enrichment?.suggested_draft_body_overlay?.trim();
            if (!overlay) {
                setError("No enriched draft returned — check org AI policy and enrichment configuration.");
                return;
            }
            setEnhancedBody(overlay);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Network error");
        } finally {
            setLoading(false);
        }
    }, [suggestion]);

    if (!draftBody) return null;

    return (
        <div className="mt-0.5 space-y-0.5" data-drawer-slot="enhance_draft_action">
            <button
                type="button"
                disabled={loading}
                onClick={() => void onEnhance()}
                className="text-[8px] font-semibold text-alloy-blue hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
                {loading ? "Enhancing…" : "Enhance draft"}
            </button>
            {error ? (
                <div className="text-[8px] leading-snug text-red-700/90" role="alert">
                    {error}
                </div>
            ) : null}
            {enhancedBody ? (
                <details className="mt-0.5 rounded border border-alloy-stone/16 bg-white/55 px-1 py-0.5">
                    <summary className="cursor-pointer select-none text-[8px] font-semibold text-alloy-blue hover:underline [&::-webkit-details-marker]:hidden">
                        Enhanced draft · preview
                    </summary>
                    <p className="mt-0.5 text-[8px] text-alloy-midnight/50">Copy only — not sent; deterministic draft stays above.</p>
                    <pre className="mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded border border-alloy-stone/12 bg-alloy-stone/[0.03] px-1 py-0.5 font-sans text-[9px] leading-snug text-alloy-midnight/85">
                        {enhancedBody}
                    </pre>
                    <button
                        type="button"
                        className="mt-0.5 text-[8px] font-semibold text-alloy-blue hover:underline"
                        onClick={(e) => {
                            e.preventDefault();
                            copyText(enhancedBody);
                        }}
                    >
                        Copy enhanced draft
                    </button>
                </details>
            ) : null}
        </div>
    );
}
