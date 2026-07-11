"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { buildDesignPlaceholderPreviewPayload } from "@/lib/forms/preview/formPreviewOrchestration";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

export type FormSchemaRuntimePreviewProps = {
    schema: FormSchemaV1;
    /** When set, fetches context-backed preview payload from admin API. */
    previewLaunchContext?: {
        customer_id?: string | null;
        person_id?: string | null;
        customer_member_id?: string | null;
        opportunity_id?: string | null;
        form_context_mode?: string;
    } | null;
    formDefinitionId?: string;
};

/** Operator form runtime preview — design placeholder or context-backed canonical prefill. */
export function FormSchemaRuntimePreview({
    schema,
    previewLaunchContext,
    formDefinitionId,
}: FormSchemaRuntimePreviewProps) {
    const design = useMemo(() => buildDesignPlaceholderPreviewPayload(schema), [schema]);
    const [payload, setPayload] = useState<FormPayload>(design.payload);
    const [mode, setMode] = useState<"design_placeholder" | "context_backed">("design_placeholder");
    const [diagnostics, setDiagnostics] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const customerId = previewLaunchContext?.customer_id?.trim();
        if (!customerId || !formDefinitionId) {
            setPayload(design.payload);
            setMode("design_placeholder");
            setDiagnostics(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        void fetch("/api/admin/forms/preview-payload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                form_definition_id: formDefinitionId,
                schema_json: schema,
                launch_fks: previewLaunchContext,
                link_metadata: {
                    form_context_mode: previewLaunchContext?.form_context_mode ?? "existing_record",
                    customer_id: customerId,
                },
            }),
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(await res.text());
                return res.json() as Promise<{
                    payload: FormPayload;
                    diagnostics?: { invalid_context_groups?: string[]; collection_states?: Record<string, { kind: string; label?: string }> };
                }>;
            })
            .then((data) => {
                if (cancelled) return;
                setPayload(data.payload);
                setMode("context_backed");
                const invalid = data.diagnostics?.invalid_context_groups ?? [];
                const states = data.diagnostics?.collection_states ?? {};
                const stateLabels = Object.entries(states)
                    .filter(([, s]) => s.kind !== "resolved")
                    .map(([id, s]) => `${id}: ${s.label ?? s.kind}`)
                    .join("; ");
                setDiagnostics(
                    invalid.length || stateLabels
                        ? [invalid.length ? `Invalid context: ${invalid.join(", ")}` : null, stateLabels || null]
                              .filter(Boolean)
                              .join(" · ")
                        : null,
                );
            })
            .catch(() => {
                if (cancelled) return;
                setPayload(design.payload);
                setMode("design_placeholder");
                setDiagnostics("Context-backed preview unavailable — showing design placeholder.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [schema, previewLaunchContext, formDefinitionId, design]);

    return (
        <div className="space-y-2 rounded-lg border border-alloy-midnight/10 bg-alloy-stone/5 p-3" data-testid="form-schema-runtime-preview">
            <div className="flex flex-wrap items-center gap-2">
                <p className={opMetadata}>Respondent runtime preview</p>
                <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", opMutedMeta)}>
                    {mode === "design_placeholder" ? "Design placeholder" : "Context-backed"}
                </span>
                {loading ? <span className={opMutedMeta}>Loading…</span> : null}
            </div>
            {diagnostics ? <p className={clsx("text-xs text-amber-800", opMutedMeta)}>{diagnostics}</p> : null}
            {mode === "design_placeholder" ? (
                <p className={clsx("text-xs", opMutedMeta)}>
                    Placeholder structure only — not resolved from canonical household records.
                </p>
            ) : null}
            <FormEngineRenderer schema={schema} payload={payload} onChange={setPayload} mode="readonly" variant="default" />
        </div>
    );
}
