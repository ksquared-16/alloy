"use client";

/**
 * Workspace Header — Surface Builder.
 *
 * Full-bleed editor with live preview (runtime WorkspaceHeader), inspector, and publish.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    WorkspaceHeader,
    type WorkspaceHeaderBuilderField,
} from "@/components/presentation/workspace/WorkspaceHeader";
import {
    PROCESS_CARD_ACCENT_LABELS,
} from "@/lib/presentation/runtime/processCardAccentStyles";
import {
    PROCESS_CARD_ACCENTS,
    PROCESS_CARD_ICON_LABELS,
    PROCESS_CARD_ICONS,
    type ProcessCardAccent,
    type ProcessCardIcon,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import {
    DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
    buildWorkspaceHeaderPresentation,
    type WorkspaceHeaderKpiSlot,
    type WorkspaceHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import {
    loadWorkspaceHeaderSurfaceConfig,
    publishWorkspaceHeaderSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/workspaceHeaderSurfaceService";
import {
    listCalculationsByConsumer,
    listOperationalCalculations,
} from "@/lib/analytics/calculations/registry";

const ACCENT_OPTIONS: { value: ProcessCardAccent | ""; label: string }[] = [
    { value: "", label: "Auto (from status)" },
    ...PROCESS_CARD_ACCENTS.map((a) => ({ value: a, label: PROCESS_CARD_ACCENT_LABELS[a] })),
];

const ICON_OPTIONS = PROCESS_CARD_ICONS.map((i) => ({ value: i, label: PROCESS_CARD_ICON_LABELS[i] }));

/** Org-level Operational Calculations eligible for Workspace Header KPIs. */
const KPI_CALC_OPTIONS = (() => {
    const byKey = new Map<string, { value: string; label: string }>();
    for (const c of listCalculationsByConsumer("workspace_header")) {
        byKey.set(c.key, { value: c.key, label: c.label });
    }
    for (const c of listOperationalCalculations()) {
        if (c.status !== "active" || c.exploratoryOnly) continue;
        if (!c.grains.includes("org")) continue;
        if (!byKey.has(c.key)) byKey.set(c.key, { value: c.key, label: c.label });
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
})();

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

export type WorkspaceHeaderSurfaceEditorProps = {
    onBack: () => void;
    fallbackTitle?: string | null;
};

export default function WorkspaceHeaderSurfaceEditor({
    onBack,
    fallbackTitle = "Workspace",
}: WorkspaceHeaderSurfaceEditorProps) {
    const [config, setConfig] = useState<WorkspaceHeaderSurfaceConfig>(
        DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
    );
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishedAt, setPublishedAt] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<WorkspaceHeaderBuilderField | null>(null);
    const inspectorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let active = true;
        loadWorkspaceHeaderSurfaceConfig()
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

    const markDirty = useCallback(() => {
        setDirty(true);
        setPublishedAt(false);
    }, []);

    function patchIdentity(patch: Partial<Pick<WorkspaceHeaderSurfaceConfig, "title" | "subtitle">>) {
        setConfig((prev) => ({
            ...prev,
            title: patch.title !== undefined ? (patch.title?.trim() || null) : prev.title,
            subtitle: patch.subtitle !== undefined ? (patch.subtitle?.trim() || null) : prev.subtitle,
        }));
        markDirty();
    }

    function patchKpi(slot: 1 | 2 | 3 | 4 | 5, patch: Partial<WorkspaceHeaderKpiSlot>) {
        setConfig((prev) => ({
            ...prev,
            kpis: prev.kpis.map((kpi) => {
                if (kpi.slot !== slot) return kpi;
                const next = { ...kpi, ...patch, slot };
                if (typeof patch.label === "string") next.label = patch.label.trim() || null;
                if (typeof patch.sourceKey === "string") next.sourceKey = patch.sourceKey.trim() || null;
                if (patch.accent === undefined && "accent" in patch) next.accent = null;
                return next;
            }),
        }));
        markDirty();
    }

    async function handlePublish() {
        setPublishing(true);
        setError(null);
        try {
            await publishWorkspaceHeaderSurfaceConfig(config);
            setDirty(false);
            setPublishedAt(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPublishing(false);
        }
    }

    const preview = useMemo(
        () =>
            buildWorkspaceHeaderPresentation(config, {
                fallbackTitle: fallbackTitle ?? "Workspace",
                resolved: null,
            }),
        [config, fallbackTitle],
    );

    const focusInspectorField = useCallback((field: WorkspaceHeaderBuilderField) => {
        setActiveField(field);
        requestAnimationFrame(() => {
            const el = inspectorRef.current?.querySelector(`[data-inspector-field="${field}"]`);
            if (el instanceof HTMLElement) {
                el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                const input = el.querySelector("input, select, textarea");
                if (input instanceof HTMLElement) input.focus();
            }
        });
    }, []);

    return (
        <div className="flex h-full min-h-0 flex-col" data-workspace-header-builder data-testid="workspace-header-builder">
            <header className="shrink-0 border-b border-alloy-stone/10 pb-4">
                <button
                    type="button"
                    onClick={onBack}
                    data-testid="workspace-header-back"
                    className="mb-2 text-[11px] font-medium text-alloy-midnight/50 transition-colors hover:text-alloy-bend-pine"
                >
                    ← Overview
                </button>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Workspace Header
                        </p>
                        <h2 className="text-lg font-semibold text-alloy-midnight" data-workspace-header-builder-title>
                            Title, subtitle, and org KPIs
                        </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {publishedAt ? (
                            <span className="text-xs font-medium text-alloy-bend-pine" data-workspace-header-published>
                                Published
                            </span>
                        ) : null}
                        {dirty && !publishing ? (
                            <span className="text-xs text-alloy-midnight/45">Unpublished changes</span>
                        ) : null}
                        {error ? <span className="text-xs text-alloy-ember">{error}</span> : null}
                        <button
                            type="button"
                            onClick={handlePublish}
                            disabled={publishing || !dirty || loading}
                            data-workspace-header-publish
                            data-testid="workspace-header-publish"
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
                        className="flex min-h-[12rem] flex-col items-center justify-start px-4 py-2"
                        data-workspace-header-canvas
                    >
                        <p className="mb-4 w-full max-w-3xl text-center text-xs text-alloy-midnight/45">
                            Live runtime header — click a region to edit it.
                        </p>
                        <div className="w-full max-w-3xl rounded-xl border border-alloy-stone/12 bg-white px-6 py-5 shadow-sm">
                            <WorkspaceHeader
                                model={preview}
                                builder={{
                                    activeField,
                                    onFieldClick: focusInspectorField,
                                }}
                            />
                        </div>
                    </div>

                    <div ref={inspectorRef} className="flex flex-col gap-3 pb-6" data-workspace-header-inspector>
                        <InspectorSection title="Identity" testId="identity">
                            <label className="flex flex-col gap-1" data-inspector-field="title">
                                <FieldLabel>Workspace title</FieldLabel>
                                <input
                                    type="text"
                                    value={config.title ?? ""}
                                    placeholder={fallbackTitle ?? "Workspace"}
                                    onChange={(e) => patchIdentity({ title: e.target.value })}
                                    data-workspace-header-title-input
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                />
                            </label>
                            <label className="flex flex-col gap-1" data-inspector-field="subtitle">
                                <FieldLabel>Workspace subtitle</FieldLabel>
                                <input
                                    type="text"
                                    value={config.subtitle ?? ""}
                                    placeholder="Operational Workspace"
                                    onChange={(e) => patchIdentity({ subtitle: e.target.value })}
                                    data-workspace-header-subtitle-input
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                />
                            </label>
                        </InspectorSection>

                        {config.kpis.map((kpi) => {
                            const isOptional = kpi.slot > 3;
                            return (
                                <InspectorSection
                                    key={kpi.slot}
                                    title={`KPI ${kpi.slot}${isOptional ? " (optional)" : ""}`}
                                    testId={`kpi-${kpi.slot}`}
                                >
                                    {isOptional ? (
                                        <label className="flex items-center gap-2" data-inspector-field={`kpi-${kpi.slot}`}>
                                            <input
                                                type="checkbox"
                                                checked={kpi.enabled}
                                                onChange={(e) => patchKpi(kpi.slot, { enabled: e.target.checked })}
                                                data-workspace-header-kpi-enabled={kpi.slot}
                                            />
                                            <FieldLabel>Show KPI {kpi.slot}</FieldLabel>
                                        </label>
                                    ) : null}
                                    {(kpi.enabled || !isOptional) ? (
                                        <>
                                            <label
                                                className="flex flex-col gap-1"
                                                data-inspector-field={`kpi-${kpi.slot}`}
                                            >
                                                <FieldLabel>Label</FieldLabel>
                                                <input
                                                    type="text"
                                                    value={kpi.label ?? ""}
                                                    placeholder="KPI label"
                                                    onChange={(e) => patchKpi(kpi.slot, { label: e.target.value })}
                                                    data-workspace-header-kpi-label={kpi.slot}
                                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                                />
                                            </label>
                                            <label className="flex flex-col gap-1">
                                                <FieldLabel>Calculation source</FieldLabel>
                                                <select
                                                    value={kpi.sourceKey ?? ""}
                                                    onChange={(e) =>
                                                        patchKpi(kpi.slot, { sourceKey: e.target.value || null })
                                                    }
                                                    data-workspace-header-kpi-source={kpi.slot}
                                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                                >
                                                    <option value="">Select calculation…</option>
                                                    {KPI_CALC_OPTIONS.map((o) => (
                                                        <option key={o.value} value={o.value}>
                                                            {o.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className="flex flex-col gap-1">
                                                    <FieldLabel>Icon</FieldLabel>
                                                    <select
                                                        value={kpi.icon}
                                                        onChange={(e) =>
                                                            patchKpi(kpi.slot, {
                                                                icon: e.target.value as ProcessCardIcon,
                                                            })
                                                        }
                                                        data-workspace-header-kpi-icon={kpi.slot}
                                                        className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                                    >
                                                        {ICON_OPTIONS.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <FieldLabel>Accent</FieldLabel>
                                                    <select
                                                        value={kpi.accent ?? ""}
                                                        onChange={(e) =>
                                                            patchKpi(kpi.slot, {
                                                                accent: (e.target.value || null) as ProcessCardAccent | null,
                                                            })
                                                        }
                                                        data-workspace-header-kpi-accent={kpi.slot}
                                                        className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                                    >
                                                        {ACCENT_OPTIONS.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>
                                        </>
                                    ) : null}
                                </InspectorSection>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
