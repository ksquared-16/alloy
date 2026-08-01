"use client";

/**
 * Process participation — compact, READ-ONLY process-definition card at the TOP of the Stages pane
 * (NOT a standalone nav section). Documents what this process tracks and how children move.
 *
 * Stage inheritance is LOCKED ON in V1: freshly created children have no participant stage yet, so
 * effectiveStage() (lib/process/engine/processParticipant.ts) coalesces to the household stage ONLY
 * when the contract declares inheritsContextStage. Turn it off and a just-created Lead's children get
 * a null effective stage and vanish from New Leads / the Lead lane. There is no operator use case for
 * that, so it is platform-managed, not a toggle. participation_v1 still persists on the process record
 * and the engine still reads it via resolveEnrollmentParticipationContract — this card just documents
 * the locked V1 contract; it is not an editor. Never exposes process_instances / joins / engine internals.
 */

import { useEffect, useMemo, useState } from "react";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { ParticipationConfigV1 } from "@/lib/process/participationConfig";

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <span className="inline-flex items-baseline gap-1.5 rounded-md border border-alloy-stone/15 bg-alloy-midnight/[0.02] px-2.5 py-1.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{label}</span>
            <span className="text-[12.5px] font-semibold text-alloy-midnight">{value}</span>
        </span>
    );
}

export default function BusinessProcessParticipationCard({
    departmentId,
    processId,
}: {
    departmentId: string | null;
    processId: string | null;
}) {
    const [config, setConfig] = useState<ParticipationConfigV1 | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!departmentId || !processId) return;
        let cancelled = false;
        setLoading(true);
        const qs = `department_id=${encodeURIComponent(departmentId)}&process_id=${encodeURIComponent(processId)}`;
        fetch(`/api/admin/lifecycle-builder/process-participation?${qs}`, workspaceDataFetchInit())
            .then(async (res) => {
                const json = (await res.json().catch(() => ({}))) as {
                    participation_v1?: ParticipationConfigV1;
                    error?: string;
                };
                if (cancelled) return;
                if (!res.ok) throw new Error(json.error ?? "Failed to load participation");
                setConfig(json.participation_v1 ?? null);
            })
            .catch((e) => !cancelled && setError((e as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [departmentId, processId]);

    const subjectLabel = useMemo(() => (config?.subject_type === "child" ? "Child" : (config?.subject_type ?? "Child")), [config]);
    const contextLabel = useMemo(
        () => (config?.context_type === "opportunity" ? "Household" : (config?.context_type ?? "Household")),
        [config],
    );

    if (loading && !config) {
        return (
            <section
                className="config-runtime-operational-card px-4 py-3 text-[13px] text-alloy-midnight/50"
                data-testid="participation-card-loading"
            >
                {error ? <span className="text-alloy-ember">{error}</span> : "Loading participation…"}
            </section>
        );
    }

    return (
        <section
            className="config-runtime-operational-card"
            data-testid="business-process-participation-card"
            data-component="BusinessProcessParticipationCard"
        >
            {/* Read-only reference, not an editing surface — the card's own copy says so three
                separate times. It used to occupy ~215px at the very top of the stage page, above
                the publication bar and the operating plan, to tell an operator there was nothing
                for them to do. Collapsed by default: the summary row carries every fact, and the
                detail is one click away for anyone who wants it. Presentation only — the
                participation config, its API and its draft/publication path are untouched. */}
            <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                    <span className="config-runtime-section-header shrink-0">Process participation</span>
                    <span
                        className="min-w-0 flex-1 truncate text-[0.75rem] text-alloy-midnight/50"
                        data-testid="participation-summary"
                    >
                        Tracks {subjectLabel.toLowerCase()} in {contextLabel.toLowerCase()} context · one
                        participant per child · inherits household stage
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded-md bg-alloy-pine/[0.08] px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-alloy-pine">
                        Platform managed
                    </span>
                    <span className="shrink-0 text-[0.625rem] text-alloy-midnight/40 transition-transform group-open:rotate-90">
                        ›
                    </span>
                </summary>

            <div className="flex flex-col gap-3 border-t border-alloy-stone/15 px-4 py-3">
                {/* read-only definition facts */}
                <div className="flex flex-wrap gap-2">
                    <Fact label="Tracks" value={subjectLabel} />
                    <Fact label="Context" value={contextLabel} />
                    <span data-testid="participation-creation" className="inline-flex items-baseline gap-1.5 rounded-md border border-alloy-stone/15 bg-alloy-midnight/[0.02] px-2.5 py-1.5">
                        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Creates</span>
                        <span className="text-[12.5px] font-semibold text-alloy-midnight">One participant per child</span>
                    </span>
                </div>

                {/* stage behavior — platform managed, not a toggle */}
                <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-alloy-stone/20 bg-alloy-midnight/[0.02] px-3 py-2.5"
                    data-testid="participation-stage-behavior"
                >
                    <span className="min-w-0">
                        <span className="text-[13.5px] font-semibold text-alloy-midnight">Inherits household stage until a child branches</span>
                        <span className="mt-0.5 block text-[12px] text-alloy-midnight/55">
                            A new child shows the family&rsquo;s stage until a decision starts their own track.
                        </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded-md bg-alloy-pine/[0.08] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-alloy-pine">
                        Platform managed
                    </span>
                </div>

                {/* runtime note — one line, explanatory only */}
                <p className="text-[12px] leading-relaxed text-alloy-midnight/55" data-testid="participation-runtime">
                    The platform keeps each child&rsquo;s enrollment journey in sync &mdash; nothing to configure.
                </p>

                {error ? <p className="text-[12.5px] text-alloy-ember">{error}</p> : null}
            </div>
            </details>
        </section>
    );
}
