"use client";

import { useCallback, useState } from "react";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import {
    isAiEnrichmentStagingTestUiEnabled,
    summarizeEnrichAttentionTestResponse,
    type SafeEnrichAttentionTestSummary,
} from "@/lib/dev/aiEnrichmentStagingTestUi";

const LOG_PREFIX = "[alloy-staging-ai-enrichment-test]";

/**
 * TEMPORARY — remove after staging validation (see {@link isAiEnrichmentStagingTestUiEnabled}).
 */
export default function AiEnrichmentStagingTestButton({ suggestion }: { suggestion: AttentionSuggestionV1 }) {
    const [busy, setBusy] = useState(false);
    const [last, setLast] = useState<SafeEnrichAttentionTestSummary | null>(null);

    const run = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        setLast(null);
        try {
            const correlation_id = globalThis.crypto?.randomUUID?.() ?? `corr-${Date.now()}`;
            const res = await fetch("/api/admin/ai/enrich-attention-suggestion", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    correlation_id,
                    deterministic_suggestion: suggestion,
                }),
            });
            let json: unknown = null;
            try {
                json = await res.json();
            } catch {
                json = null;
            }
            const summary = summarizeEnrichAttentionTestResponse(res.status, json);
            setLast(summary);
            console.info(LOG_PREFIX, JSON.stringify(summary));
        } catch {
            const fallback: SafeEnrichAttentionTestSummary = {
                status: 0,
                provider_key: null,
                outcome: null,
                has_enrichment: false,
                schema_ok: false,
                error_code: "FETCH_FAILED",
            };
            setLast(fallback);
            console.info(LOG_PREFIX, JSON.stringify(fallback));
        } finally {
            setBusy(false);
        }
    }, [busy, suggestion]);

    if (!isAiEnrichmentStagingTestUiEnabled()) {
        return null;
    }

    return (
        <div
            className="mt-1 space-y-0.5 border-t border-dashed border-alloy-stone/28 pt-1"
            data-staging-only="ai-enrichment-test"
        >
            <button
                type="button"
                disabled={busy}
                onClick={() => void run()}
                className="rounded border border-amber-200/80 bg-amber-50/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-950/80 hover:bg-amber-50 disabled:opacity-50"
                title="Temporary staging/local tool — remove after validation (docs/product/ai-system.md)."
            >
                {busy ? "Testing…" : "Test AI enrichment"}
            </button>
            {last ? (
                <output
                    aria-live="polite"
                    className="block max-w-full overflow-x-auto font-mono text-[9px] leading-tight text-alloy-midnight/55"
                >
                    {JSON.stringify(last)}
                </output>
            ) : null}
        </div>
    );
}
