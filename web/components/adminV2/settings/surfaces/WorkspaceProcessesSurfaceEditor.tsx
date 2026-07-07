"use client";

/**
 * Workspace Process Summary — Surface Builder editor (V2).
 *
 * Bound to a real lifecycle catalog Business Process. Preview is the runtime ProcessSummaryCard.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ProcessSummaryCard, type ProcessSummaryBuilderField } from "@/components/presentation/workspace/ProcessSummaryCard";
import type { ProcessTileModel } from "@/lib/presentation/runtime";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import {
    businessProcessForProcessKey,
    signalsForBusinessProcess,
    signalAnswerText,
    signalStateFromKpiStatus,
} from "@/lib/presentation/runtime/workspaceProcessSignal";
import {
    DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    PROCESS_CARD_ACCENTS,
    PROCESS_CARD_ICON_LABELS,
    PROCESS_CARD_ICONS,
    PROCESS_METRIC_PRESENTATIONS,
    type ProcessCardConfig,
    type ProcessCardIcon,
    type ProcessMetricPresentation,
    type TodaysWorkSort,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import { lifecycleCatalogFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { WorkViewLinkModel } from "@/lib/presentation/runtime";
import {
    PROCESS_CARD_ACCENT_LABELS,
} from "@/lib/presentation/runtime/processCardAccentStyles";
import {
    loadWorkspaceProcessSurfaceConfig,
    publishWorkspaceProcessSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/workspaceProcessSurfaceService";
import {
    surfaceObjectForCatalogEntry,
    withSummaryCatalogId,
    workspaceProcessConfigKey,
} from "@/lib/adminV2/settings/surfaces/workspaceProcessCatalog";

const SORT_OPTIONS: { value: TodaysWorkSort; label: string }[] = [
    { value: "attention", label: "Needs attention first" },
    { value: "count", label: "Highest count first" },
    { value: "configured", label: "Configured order" },
];

const ACCENT_OPTIONS: { value: ProcessCardConfig["accent"] | ""; label: string }[] = [
    { value: "", label: "None" },
    ...PROCESS_CARD_ACCENTS.map((a) => ({ value: a, label: PROCESS_CARD_ACCENT_LABELS[a] })),
];

const ICON_OPTIONS = PROCESS_CARD_ICONS.map((i) => ({ value: i, label: PROCESS_CARD_ICON_LABELS[i] }));

const METRIC_PRESENTATION_LABELS: Record<ProcessMetricPresentation, string> = {
    inline: "Inline (side by side)",
    stacked: "Stacked (primary above)",
};
const METRIC_PRESENTATION_OPTIONS = PROCESS_METRIC_PRESENTATIONS.map((p) => ({
    value: p,
    label: METRIC_PRESENTATION_LABELS[p],
}));

/** Icon dropdown options with a "fallback" (no configured icon) sentinel. */
const WORK_VIEW_ICON_OPTIONS: { value: string; label: string }[] = [
    { value: "", label: "Default (fallback)" },
    ...ICON_OPTIONS,
];

type ProcessWorkViewOption = { id: string; label: string };

const INSPECTOR_FIELD_ATTR: Record<ProcessSummaryBuilderField, string> = {
    title: "data-inspector-title",
    subtitle: "data-inspector-subtitle",
    identity: "data-inspector-accent",
    primaryMetricTitle: "data-inspector-primary-metric-title",
    supportingMetricTitle: "data-inspector-supporting-metric-title",
    cta: "data-inspector-cta",
};

function InspectorSection({
    title,
    children,
    testId,
}: {
    title: string;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <section className="rounded-lg border border-alloy-stone/12 bg-white p-3" data-inspector-section={testId}>
            <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-alloy-midnight/40">
                {title}
            </h3>
            <div className="flex flex-col gap-2.5">{children}</div>
        </section>
    );
}

function FieldLabel({ children }: { children: ReactNode }) {
    return <span className="text-[12px] font-medium text-alloy-midnight/75">{children}</span>;
}

function previewProcess(
    catalogEntry: LifecycleCatalogEntry,
    label: string,
    signalKey: string,
    card: ProcessCardConfig | undefined,
    signals: ReturnType<typeof signalsForBusinessProcess>,
    workViews: ProcessWorkViewOption[],
    workViewIconById: Record<string, ProcessCardIcon>,
): ProcessTileModel {
    const calc = signals.find((c) => c.key === signalKey);
    const signalLabel = calc?.label ?? "Signal";
    const state = signalStateFromKpiStatus(null);
    const supportingCalc = card?.supportingSignalKey
        ? signals.find((c) => c.key === card.supportingSignalKey)
        : undefined;
    const previewWorkViews: WorkViewLinkModel[] = workViews.map((wv) => ({
        id: wv.id,
        label: wv.label,
        isActive: false,
        count: null,
        href: "#",
        icon: workViewIconById[wv.id] ?? null,
        attentionCount: null,
        overdueCount: null,
    }));
    return {
        id: `preview-${catalogEntry.id}`,
        processKey: catalogEntry.process_key,
        label,
        description: "",
        entryHref: "#",
        activeRecordCount: null,
        needsAttentionCount: null,
        workViews: previewWorkViews,
        primarySignal: {
            key: signalKey,
            label: signalLabel,
            answer: signalAnswerText(signalLabel, state),
            state,
            value: null,
            supportingContext: null,
            trend: null,
            drillHref: null,
        },
        supportingSignal: supportingCalc
            ? {
                  key: supportingCalc.key,
                  label: supportingCalc.label,
                  answer: supportingCalc.label,
                  state: "neutral",
                  value: null,
                  supportingContext: null,
                  trend: null,
                  drillHref: null,
              }
            : null,
    };
}

export type WorkspaceProcessesSurfaceEditorProps = {
    catalogEntry: LifecycleCatalogEntry;
    configuredEntries: LifecycleCatalogEntry[];
    onBack: () => void;
    onSelectProcess: (surfaceId: string) => void;
    onPublished?: () => void;
};

export default function WorkspaceProcessesSurfaceEditor({
    catalogEntry,
    configuredEntries,
    onBack,
    onSelectProcess,
    onPublished,
}: WorkspaceProcessesSurfaceEditorProps) {
    const [config, setConfig] = useState<WorkspaceProcessSurfaceConfig>(
        DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    );
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishedAt, setPublishedAt] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<ProcessSummaryBuilderField | null>(null);
    const [workViewOptions, setWorkViewOptions] = useState<ProcessWorkViewOption[]>([]);
    const inspectorRef = useRef<HTMLDivElement>(null);

    const configKey = workspaceProcessConfigKey(catalogEntry);
    const businessProcess = businessProcessForProcessKey(catalogEntry.process_key);
    const signals = businessProcess ? signalsForBusinessProcess(businessProcess) : [];

    useEffect(() => {
        let active = true;
        loadWorkspaceProcessSurfaceConfig()
            .then((c) => {
                if (active) {
                    setConfig(c);
                    setDirty(false);
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    // Load the process's configured Work Views so the operator can assign a per-view icon.
    // Reuses the existing lifecycle-builder process-work-views GET route (no new API).
    useEffect(() => {
        let active = true;
        setWorkViewOptions([]);
        const params = new URLSearchParams({
            department_id: catalogEntry.department_id,
            process_id: catalogEntry.process_id,
        });
        fetch(`/api/admin/lifecycle-builder/process-work-views?${params.toString()}`, lifecycleCatalogFetchInit())
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error("work views load failed"))))
            .then((json: { work_views_v1?: { id?: unknown; label?: unknown }[] }) => {
                if (!active) return;
                const opts: ProcessWorkViewOption[] = (json.work_views_v1 ?? [])
                    .map((v) => ({
                        id: typeof v.id === "string" ? v.id.trim() : "",
                        label: typeof v.label === "string" ? v.label.trim() : "",
                    }))
                    .filter((v) => v.id && v.label);
                setWorkViewOptions(opts);
            })
            .catch(() => {
                if (active) setWorkViewOptions([]);
            });
        return () => {
            active = false;
        };
    }, [catalogEntry.department_id, catalogEntry.process_id]);

    const markDirty = useCallback(() => {
        setDirty(true);
        setPublishedAt(false);
    }, []);

    function patchWorkViewIcon(workViewId: string, icon: ProcessCardIcon | "") {
        setConfig((prev) => {
            const map = { ...prev.workViewIconById };
            if (icon) map[workViewId] = icon;
            else delete map[workViewId];
            return { ...prev, workViewIconById: map };
        });
        markDirty();
    }

    function patchConfigKey(patch: Partial<ProcessCardConfig>) {
        if (!configKey) return;
        setConfig((prev) => {
            const next: ProcessCardConfig = { ...prev.cardByProcess[configKey], ...patch };
            for (const k of Object.keys(next) as (keyof ProcessCardConfig)[]) {
                const val = next[k];
                if (val === "" || val === undefined) delete next[k];
            }
            const cardByProcess = { ...prev.cardByProcess };
            if (Object.keys(next).length) cardByProcess[configKey] = next;
            else delete cardByProcess[configKey];
            return { ...prev, cardByProcess };
        });
        markDirty();
    }

    function setPrimarySignal(key: string) {
        if (!configKey) return;
        setConfig((prev) => ({
            ...prev,
            primarySignalByProcess: { ...prev.primarySignalByProcess, [configKey]: key },
        }));
        markDirty();
    }

    function patchTodaysWork(patch: Partial<WorkspaceProcessSurfaceConfig["todaysWork"]>) {
        setConfig((prev) => ({ ...prev, todaysWork: { ...prev.todaysWork, ...patch } }));
        markDirty();
    }

    async function handlePublish() {
        setPublishing(true);
        setError(null);
        try {
            const payload = withSummaryCatalogId(config, catalogEntry.id);
            await publishWorkspaceProcessSurfaceConfig(payload);
            setConfig(payload);
            setDirty(false);
            setPublishedAt(true);
            onPublished?.();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPublishing(false);
        }
    }

    const previewCard = configKey ? config.cardByProcess[configKey] : undefined;
    const previewSignalKey =
        (configKey ? config.primarySignalByProcess[configKey] : undefined) ?? signals[0]?.key ?? "";

    const preview = useMemo(
        () =>
            previewSignalKey
                ? previewProcess(
                      catalogEntry,
                      previewCard?.title || catalogEntry.lifecycle_name,
                      previewSignalKey,
                      previewCard,
                      signals,
                      workViewOptions,
                      config.workViewIconById,
                  )
                : null,
        [catalogEntry, previewCard, previewSignalKey, signals, workViewOptions, config.workViewIconById],
    );

    const focusInspectorField = useCallback((field: ProcessSummaryBuilderField) => {
        setActiveField(field);
        requestAnimationFrame(() => {
            const attr = INSPECTOR_FIELD_ATTR[field];
            const el = inspectorRef.current?.querySelector(`[${attr}]`);
            if (el instanceof HTMLElement) {
                el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                const input = el.querySelector("input, select, textarea");
                if (input instanceof HTMLElement) input.focus();
            }
        });
    }, []);

    const tw = config.todaysWork;

    return (
        <div className="flex h-full min-h-0 flex-col" data-workspace-processes-builder>
            <header className="shrink-0 border-b border-alloy-stone/10 pb-4">
                <button
                    type="button"
                    onClick={onBack}
                    data-testid="workspace-process-summary-back"
                    className="mb-2 text-[11px] font-medium text-alloy-midnight/50 transition-colors hover:text-alloy-bend-pine"
                >
                    ← Surfaces
                </button>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Workspace Process Summary
                        </p>
                        <h2 className="text-lg font-semibold text-alloy-midnight" data-workspace-process-summary-title>
                            {catalogEntry.lifecycle_name}
                        </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {publishedAt ? (
                            <span className="text-xs font-medium text-alloy-bend-pine">Published</span>
                        ) : null}
                        {dirty && !publishing ? (
                            <span className="text-xs text-alloy-midnight/45">Unpublished changes</span>
                        ) : null}
                        {error ? <span className="text-xs text-alloy-ember">{error}</span> : null}
                        <button
                            type="button"
                            onClick={handlePublish}
                            disabled={publishing || !dirty || loading}
                            data-workspace-processes-publish
                            className="rounded-md bg-alloy-bend-pine px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                        >
                            {publishing ? "Publishing…" : "Publish"}
                        </button>
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="mt-6 h-40 animate-pulse rounded-xl border border-alloy-stone/12 bg-alloy-stone/5" />
            ) : (
                <div className="mt-5 grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-auto lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div
                        className="flex min-h-[20rem] flex-col items-center justify-start px-4 py-2"
                        data-workspace-processes-canvas
                    >
                        <p className="mb-4 w-full max-w-[32rem] text-center text-xs text-alloy-midnight/45">
                            Click any part of the card to edit it — this is the live runtime component.
                        </p>
                        <div className="w-full max-w-[28rem]">
                            {preview ? (
                                <ProcessSummaryCard
                                    process={preview}
                                    config={config}
                                    builder={{
                                        activeField,
                                        onFieldClick: focusInspectorField,
                                    }}
                                />
                            ) : (
                                <p className="text-center text-sm text-alloy-midnight/45">
                                    No tile-consumable signals for this process yet.
                                </p>
                            )}
                        </div>
                    </div>

                    <div ref={inspectorRef} className="flex flex-col gap-3 pb-6" data-workspace-processes-inspector>
                        <InspectorSection title="Identity" testId="identity">
                            <label className="flex flex-col gap-1" data-inspector-title>
                                <FieldLabel>Title</FieldLabel>
                                <input
                                    type="text"
                                    value={previewCard?.title ?? ""}
                                    placeholder={catalogEntry.lifecycle_name}
                                    onChange={(e) => patchConfigKey({ title: e.target.value })}
                                    data-card-title
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                />
                            </label>
                            <label className="flex flex-col gap-1" data-inspector-subtitle>
                                <FieldLabel>Subtitle</FieldLabel>
                                <input
                                    type="text"
                                    value={previewCard?.subtitle ?? ""}
                                    placeholder="Optional one-liner"
                                    onChange={(e) => patchConfigKey({ subtitle: e.target.value })}
                                    data-card-subtitle
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex flex-col gap-1" data-inspector-accent>
                                    <FieldLabel>Accent</FieldLabel>
                                    <select
                                        value={previewCard?.accent ?? ""}
                                        onChange={(e) =>
                                            patchConfigKey({
                                                accent: (e.target.value || undefined) as ProcessCardConfig["accent"],
                                            })
                                        }
                                        data-card-accent
                                        className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                    >
                                        {ACCENT_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value ?? ""}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1" data-inspector-icon>
                                    <FieldLabel>Icon</FieldLabel>
                                    <select
                                        value={previewCard?.icon ?? "grid"}
                                        onChange={(e) =>
                                            patchConfigKey({
                                                icon: e.target.value as ProcessCardConfig["icon"],
                                            })
                                        }
                                        data-card-icon
                                        className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                    >
                                        {ICON_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </InspectorSection>

                        <InspectorSection title="Metrics" testId="metrics">
                            <label className="flex flex-col gap-1">
                                <FieldLabel>Primary metric</FieldLabel>
                                <select
                                    value={previewSignalKey}
                                    onChange={(e) => setPrimarySignal(e.target.value)}
                                    disabled={!signals.length}
                                    data-primary-signal={configKey ?? undefined}
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm disabled:opacity-50"
                                >
                                    {signals.map((s) => (
                                        <option key={s.key} value={s.key}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1" data-inspector-primary-metric-title>
                                <FieldLabel>Primary metric title</FieldLabel>
                                <input
                                    type="text"
                                    value={previewCard?.primarySignalLabel ?? ""}
                                    placeholder={
                                        signals.find((s) => s.key === previewSignalKey)?.label ?? "Primary signal"
                                    }
                                    onChange={(e) => patchConfigKey({ primarySignalLabel: e.target.value })}
                                    data-card-primary-metric-title
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <FieldLabel>Supporting metric</FieldLabel>
                                <select
                                    value={previewCard?.supportingSignalKey ?? ""}
                                    onChange={(e) => patchConfigKey({ supportingSignalKey: e.target.value })}
                                    disabled={!signals.length}
                                    data-card-supporting-signal
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm disabled:opacity-50"
                                >
                                    <option value="">None</option>
                                    {signals.map((s) => (
                                        <option key={s.key} value={s.key}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1" data-inspector-supporting-metric-title>
                                <FieldLabel>Supporting metric title</FieldLabel>
                                <input
                                    type="text"
                                    value={previewCard?.supportingSignalLabel ?? ""}
                                    placeholder="Supporting signal"
                                    onChange={(e) => patchConfigKey({ supportingSignalLabel: e.target.value })}
                                    data-card-supporting-metric-title
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                />
                            </label>
                            <label className="flex flex-col gap-1" data-inspector-metric-presentation>
                                <FieldLabel>Metric layout</FieldLabel>
                                <select
                                    value={previewCard?.metricPresentation ?? "inline"}
                                    onChange={(e) =>
                                        patchConfigKey({
                                            metricPresentation: e.target.value as ProcessMetricPresentation,
                                        })
                                    }
                                    data-card-metric-presentation
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                >
                                    {METRIC_PRESENTATION_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </InspectorSection>

                        {workViewOptions.length ? (
                            <InspectorSection title="Work View icons" testId="work-view-icons">
                                <p className="text-[11px] leading-relaxed text-alloy-midnight/45">
                                    Each Work View owns its row icon. Default falls back to the neutral glyph.
                                </p>
                                {workViewOptions.map((wv) => (
                                    <label key={wv.id} className="flex flex-col gap-1" data-work-view-icon-row={wv.id}>
                                        <FieldLabel>{wv.label}</FieldLabel>
                                        <select
                                            value={config.workViewIconById[wv.id] ?? ""}
                                            onChange={(e) =>
                                                patchWorkViewIcon(wv.id, e.target.value as ProcessCardIcon | "")
                                            }
                                            data-work-view-icon-select={wv.id}
                                            className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                        >
                                            {WORK_VIEW_ICON_OPTIONS.map((o) => (
                                                <option key={o.value || "fallback"} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                ))}
                            </InspectorSection>
                        ) : null}

                        <InspectorSection title="Behavior" testId="behavior">
                            {configuredEntries.length > 1 ? (
                                <label className="flex flex-col gap-1" data-inspector-process>
                                    <FieldLabel>Process</FieldLabel>
                                    <select
                                        value={catalogEntry.id}
                                        onChange={(e) => {
                                            const next = configuredEntries.find((c) => c.id === e.target.value);
                                            if (next) onSelectProcess(surfaceObjectForCatalogEntry(next).id);
                                        }}
                                        data-workspace-process-selector
                                        className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm font-medium"
                                    >
                                        {configuredEntries.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.lifecycle_name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ) : null}
                            <label className="flex flex-col gap-1" data-inspector-cta>
                                <FieldLabel>CTA label</FieldLabel>
                                <input
                                    type="text"
                                    value={previewCard?.ctaLabel ?? ""}
                                    placeholder="Open process"
                                    onChange={(e) => patchConfigKey({ ctaLabel: e.target.value })}
                                    data-card-cta-label
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                />
                            </label>
                            <p className="text-[11px] leading-relaxed text-alloy-midnight/45">
                                Open process navigates to the process work unit — only the label is configurable.
                            </p>
                        </InspectorSection>

                        <InspectorSection title="Visibility" testId="visibility">
                            <label className="flex items-center justify-between gap-2">
                                <FieldLabel>Show Today&apos;s Work</FieldLabel>
                                <input
                                    type="checkbox"
                                    checked={tw.visible}
                                    onChange={(e) => patchTodaysWork({ visible: e.target.checked })}
                                    data-config-visible
                                    className="h-4 w-4 rounded border-alloy-stone/30 text-alloy-bend-pine"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <FieldLabel>Max rows (0 = all)</FieldLabel>
                                <input
                                    type="number"
                                    min={0}
                                    max={12}
                                    value={tw.maxRows}
                                    onChange={(e) =>
                                        patchTodaysWork({ maxRows: Math.max(0, Number(e.target.value) || 0) })
                                    }
                                    data-config-max-rows
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1 text-sm"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <FieldLabel>Order</FieldLabel>
                                <select
                                    value={tw.sort}
                                    onChange={(e) => patchTodaysWork({ sort: e.target.value as TodaysWorkSort })}
                                    data-config-sort
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1 text-sm"
                                >
                                    {SORT_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex items-center justify-between gap-2">
                                <FieldLabel>Show counts</FieldLabel>
                                <input
                                    type="checkbox"
                                    checked={tw.showCounts}
                                    onChange={(e) => patchTodaysWork({ showCounts: e.target.checked })}
                                    data-config-show-counts
                                    className="h-4 w-4 rounded border-alloy-stone/30 text-alloy-bend-pine"
                                />
                            </label>
                        </InspectorSection>
                    </div>
                </div>
            )}
        </div>
    );
}
