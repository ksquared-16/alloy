"use client";

/**
 * Participation section of the Process Builder — the operator authors the Participation Definition
 * the engine reads. Publishes participation_v1 onto the process (same lifecycle_builder_v1 store as
 * Work Views). Exposes ONLY operator concepts: Identity, Stage Behavior, Participant Creation,
 * Presentation, Operational States, Runtime. Never process_instances / joins / engine internals.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    PARTICIPATION_VIEW_KEYS,
    type ParticipationConfigV1,
    type ParticipationViewKey,
} from "@/lib/process/participationConfig";

type StageOption = { key: string; label: string };
const VIEW_LABELS: Record<ParticipationViewKey, string> = {
    family: "Family",
    child: "Child",
    candidate: "Candidate",
};

function Badge({ kind, children }: { kind: "edit" | "lock" | "managed"; children: React.ReactNode }) {
    const cls =
        kind === "edit"
            ? "text-alloy-pine bg-alloy-pine/[0.08]"
            : kind === "managed"
              ? "text-alloy-pine bg-white border border-alloy-pine/30"
              : "text-alloy-midnight/55 bg-alloy-midnight/[0.05]";
    return (
        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${cls}`}>
            {children}
        </span>
    );
}

function Card({
    eyebrow,
    title,
    subtitle,
    badge,
    children,
}: {
    eyebrow: string;
    title: string;
    subtitle?: string;
    badge?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <section className="config-runtime-operational-card">
            <div className="flex items-start gap-3 border-b border-alloy-stone/15 px-4 py-3">
                <div className="min-w-0 flex-1">
                    <p className="config-runtime-section-header">{eyebrow}</p>
                    <p className="text-[15px] font-semibold text-alloy-midnight">{title}</p>
                    {subtitle ? <p className="mt-0.5 text-[12.5px] text-alloy-midnight/55">{subtitle}</p> : null}
                </div>
                {badge}
            </div>
            {children ? <div className="px-4 py-3">{children}</div> : null}
        </section>
    );
}

export default function BusinessProcessParticipationWorkspace({
    departmentId,
    processId,
}: {
    departmentId: string | null;
    processId: string | null;
}) {
    const [config, setConfig] = useState<ParticipationConfigV1 | null>(null);
    const [stages, setStages] = useState<StageOption[]>([]);
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
                    stages?: StageOption[];
                    error?: string;
                };
                if (cancelled) return;
                if (!res.ok) throw new Error(json.error ?? "Failed to load participation");
                setConfig(json.participation_v1 ?? null);
                setStages(json.stages ?? []);
                setDirty(false);
            })
            .catch((e) => !cancelled && setError((e as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [departmentId, processId]);

    const patch = useCallback((p: Partial<ParticipationConfigV1>) => {
        setConfig((prev) => (prev ? { ...prev, ...p } : prev));
        setDirty(true);
        setSaved(false);
    }, []);

    const toggleView = useCallback(
        (view: ParticipationViewKey) => {
            setConfig((prev) => {
                if (!prev) return prev;
                const has = prev.available_views.includes(view);
                const next = has
                    ? prev.available_views.filter((v) => v !== view)
                    : [...prev.available_views, view];
                return { ...prev, available_views: next };
            });
            setDirty(true);
            setSaved(false);
        },
        [],
    );

    const setStateLabel = useCallback((stageKey: string, label: string) => {
        setConfig((prev) => {
            if (!prev) return prev;
            const labels = { ...(prev.operational_state_labels ?? {}) };
            if (label.trim()) labels[stageKey] = label;
            else delete labels[stageKey];
            return { ...prev, operational_state_labels: labels };
        });
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
            if (!res.ok) throw new Error(json.error ?? "Failed to publish");
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
            <div className="process-config-setup-card p-8 text-sm text-alloy-midnight/50" data-testid="business-process-participation-loading">
                {error ? <span className="text-alloy-ember">{error}</span> : "Loading participation…"}
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="business-process-participation-workspace" data-component="BusinessProcessParticipationWorkspace">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-alloy-midnight/60">Who participates in this process, and how they move through your stages.</p>
                <div className="flex items-center gap-2">
                    {saved ? <span className="text-[12px] font-medium text-alloy-pine">Published</span> : null}
                    {dirty && !saving ? <span className="text-[12px] text-alloy-midnight/45">Unpublished changes</span> : null}
                    <button
                        type="button"
                        onClick={() => void publish()}
                        disabled={saving || !dirty}
                        data-testid="participation-publish"
                        className="config-primary-btn rounded-md bg-alloy-pine px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
                    >
                        {saving ? "Publishing…" : "Publish participation"}
                    </button>
                </div>
            </div>
            {error ? <p className="text-[13px] text-alloy-ember">{error}</p> : null}

            {/* Identity — locked, documents the process */}
            <Card eyebrow="Identity" title="Who participates" subtitle="What this process tracks." badge={<Badge kind="lock">Locked in V1</Badge>}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Participant</p>
                        <p className="mt-1 text-[14px] font-semibold text-alloy-midnight" data-testid="participation-subject">{subjectLabel}</p>
                        <p className="mt-0.5 text-[12px] text-alloy-midnight/50">Each participant is a child.</p>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Context</p>
                        <p className="mt-1 text-[14px] font-semibold text-alloy-midnight" data-testid="participation-context">{contextLabel}</p>
                        <p className="mt-0.5 text-[12px] text-alloy-midnight/50">Tracked within a household.</p>
                    </div>
                </div>
            </Card>

            {/* Stage Behavior — editable */}
            <Card eyebrow="Stage behavior" title="How stages behave" subtitle="When a child moves on their own." badge={<Badge kind="edit">Editable</Badge>}>
                <label className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-medium text-alloy-midnight">Inherit the household stage until a participant branches</span>
                    <input
                        type="checkbox"
                        checked={config.inherits_context_stage}
                        onChange={(e) => patch({ inherits_context_stage: e.target.checked })}
                        data-testid="participation-inherit-stage"
                        className="h-5 w-5 rounded border-alloy-stone/40 text-alloy-pine"
                    />
                </label>
                <p className="mt-1.5 text-[12px] text-alloy-midnight/50">
                    A new child shows the family&rsquo;s stage until a decision starts their own track.
                </p>
            </Card>

            {/* Participant Creation — locked (no fake config) */}
            <Card eyebrow="Participant creation" title="How participants are created" badge={<Badge kind="lock">Locked in V1</Badge>}>
                <p className="text-[13.5px] font-medium text-alloy-midnight" data-testid="participation-creation">One participant is created for each child.</p>
                <p className="mt-1 text-[12px] text-alloy-midnight/50">A family with two children becomes two enrollment journeys.</p>
            </Card>

            {/* Presentation — editable available views */}
            <Card eyebrow="Presentation" title="Available Views" subtitle="What Work Views may use." badge={<Badge kind="edit">Editable</Badge>}>
                <div className="flex flex-wrap gap-2" data-testid="participation-available-views">
                    {PARTICIPATION_VIEW_KEYS.map((view) => {
                        const on = config.available_views.includes(view);
                        return (
                            <button
                                key={view}
                                type="button"
                                onClick={() => toggleView(view)}
                                data-testid={`participation-view-${view}`}
                                aria-pressed={on}
                                className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${
                                    on ? "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine" : "border-alloy-stone/35 bg-white text-alloy-midnight/55"
                                }`}
                            >
                                {on ? "✓ " : ""}
                                {VIEW_LABELS[view]}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-1.5 text-[12px] text-alloy-midnight/50">Each Work View picks one of these.</p>
            </Card>

            {/* Operational States — labels editable, logic managed */}
            <Card
                eyebrow="Operational states"
                title="Stage labels"
                subtitle="The words operators see."
                badge={
                    <span className="flex gap-1">
                        <Badge kind="edit">Labels editable</Badge>
                        <Badge kind="managed">Logic managed</Badge>
                    </span>
                }
            >
                {stages.length ? (
                    <div className="flex flex-col gap-2" data-testid="participation-state-labels">
                        {stages.map((s) => (
                            <label key={s.key} className="flex items-center gap-3">
                                <span className="w-40 shrink-0 text-[12px] text-alloy-midnight/55">{s.label}</span>
                                <input
                                    type="text"
                                    defaultValue={config.operational_state_labels?.[s.key] ?? ""}
                                    placeholder={s.label}
                                    onChange={(e) => setStateLabel(s.key, e.target.value)}
                                    className="config-runtime-input flex-1 rounded-md border border-alloy-stone/30 px-2 py-1 text-[13px]"
                                />
                            </label>
                        ))}
                    </div>
                ) : (
                    <p className="text-[12.5px] text-alloy-midnight/50">Add stages first to rename their labels.</p>
                )}
                <p className="mt-1.5 text-[12px] text-alloy-midnight/50">
                    Rename labels freely; how records move between stages is managed by the platform.
                </p>
            </Card>

            {/* Runtime — platform managed */}
            <Card eyebrow="Runtime" title="What the platform handles" badge={<Badge kind="managed">Platform managed</Badge>}>
                <p className="text-[13.5px] leading-relaxed text-alloy-midnight" data-testid="participation-runtime">
                    This process automatically creates one participant for each child and keeps those participants
                    synchronized throughout the Enrollment lifecycle &mdash; you don&rsquo;t configure any of this.
                </p>
            </Card>
        </div>
    );
}
