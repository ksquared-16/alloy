"use client";

/**
 * Process participation — compact process-definition card at the TOP of the Stages pane (NOT a
 * standalone nav section). Documents what this process tracks and exposes the ONE editable behavior
 * (inherit household stage until a participant branches). Publishes participation_v1 onto the process
 * (same lifecycle_builder_v1 store the engine reads via resolveEnrollmentParticipationContract).
 * Never exposes process_instances / joins / engine internals. Stage labels live in Stages, not here;
 * Available Views stays out until Work Views consumes it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [dirty, setDirty] = useState(false);
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
                setDirty(false);
            })
            .catch((e) => !cancelled && setError((e as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [departmentId, processId]);

    // Only the inherit-stage toggle mutates; the full config object is POSTed back so no stored field
    // (subject_type, context_type, available_views, operational_state_labels, …) is ever dropped.
    const setInherit = useCallback((checked: boolean) => {
        setConfig((prev) => (prev ? { ...prev, inherits_context_stage: checked } : prev));
        setDirty(true);
        setSaved(false);
    }, []);

    const publish = useCallback(async () => {
        if (!config || !departmentId || !processId) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/lifecycle-builder/process-participation", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ department_id: departmentId, process_id: processId, participation_v1: config }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Failed to save participation");
            setDirty(false);
            setSaved(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    }, [config, departmentId, processId]);

    const subjectLabel = useMemo(() => (config?.subject_type === "child" ? "Child" : (config?.subject_type ?? "—")), [config]);
    const contextLabel = useMemo(
        () => (config?.context_type === "opportunity" ? "Household" : (config?.context_type ?? "—")),
        [config],
    );

    if (loading || !config) {
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
            <div className="flex items-start gap-3 border-b border-alloy-stone/15 px-4 py-3">
                <div className="min-w-0 flex-1">
                    <p className="config-runtime-section-header">Process participation</p>
                    <p className="text-[12.5px] text-alloy-midnight/55">What this process tracks and how children move. You&rsquo;ll rarely change this.</p>
                </div>
                <div className="flex items-center gap-2">
                    {saved && !dirty ? <span className="text-[12px] font-medium text-alloy-pine">Saved</span> : null}
                    {dirty && !saving ? <span className="text-[12px] text-alloy-midnight/45">Unsaved</span> : null}
                    {dirty ? (
                        <button
                            type="button"
                            onClick={() => void publish()}
                            disabled={saving}
                            data-testid="participation-publish"
                            className="config-primary-btn rounded-md bg-alloy-pine px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-col gap-3 px-4 py-3">
                {/* read-only definition facts */}
                <div className="flex flex-wrap gap-2">
                    <Fact label="Tracks" value={subjectLabel} />
                    <Fact label="Context" value={contextLabel} />
                    <span data-testid="participation-creation" className="inline-flex items-baseline gap-1.5 rounded-md border border-alloy-stone/15 bg-alloy-midnight/[0.02] px-2.5 py-1.5">
                        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Creates</span>
                        <span className="text-[12.5px] font-semibold text-alloy-midnight">One participant per child</span>
                    </span>
                </div>

                {/* the one editable control */}
                <label className="flex items-center justify-between gap-3 rounded-lg border border-alloy-pine/20 bg-alloy-pine/[0.05] px-3 py-2.5">
                    <span className="min-w-0">
                        <span className="text-[13.5px] font-semibold text-alloy-midnight">Inherit household stage until a participant branches</span>
                        <span className="mt-0.5 block text-[12px] text-alloy-midnight/55">
                            A new child shows the family&rsquo;s stage until a decision starts their own track.
                        </span>
                    </span>
                    <input
                        type="checkbox"
                        checked={config.inherits_context_stage}
                        onChange={(e) => setInherit(e.target.checked)}
                        data-testid="participation-inherit-stage"
                        className="h-5 w-5 shrink-0 rounded border-alloy-stone/40 text-alloy-pine"
                    />
                </label>

                {/* runtime note — one line, explanatory only */}
                <p className="text-[12px] leading-relaxed text-alloy-midnight/55" data-testid="participation-runtime">
                    The platform keeps each child&rsquo;s enrollment journey in sync &mdash; nothing to configure.
                </p>

                {error ? <p className="text-[12.5px] text-alloy-ember">{error}</p> : null}
            </div>
        </section>
    );
}
