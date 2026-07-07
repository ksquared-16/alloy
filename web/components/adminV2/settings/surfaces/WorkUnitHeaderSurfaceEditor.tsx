"use client";

/**
 * Work Unit Header — Surface Builder.
 *
 * Full-bleed editor mirroring Workspace Header: live preview, inspector, publish.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorkUnitHeader } from "@/components/presentation/workUnit/WorkUnitHeader";
import type { WorkspaceHeaderBuilderField } from "@/components/presentation/workspace/WorkspaceHeader";
import { PROCESS_CARD_ACCENT_LABELS } from "@/lib/presentation/runtime/processCardAccentStyles";
import {
    PROCESS_CARD_ACCENTS,
    PROCESS_CARD_ICON_LABELS,
    PROCESS_CARD_ICONS,
    type ProcessCardAccent,
    type ProcessCardIcon,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import {
    DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
    buildWorkUnitHeaderPresentation,
    type WorkUnitHeaderKpiSlot,
    type WorkUnitHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";
import {
    loadWorkUnitHeaderSurfaceConfig,
    publishWorkUnitHeaderSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/workUnitHeaderSurfaceService";
import {
    listCalculationsByConsumer,
    listOperationalCalculations,
} from "@/lib/analytics/calculations/registry";

const ACCENT_OPTIONS: { value: ProcessCardAccent | ""; label: string }[] = [
    { value: "", label: "Auto (from status)" },
    ...PROCESS_CARD_ACCENTS.map((a) => ({ value: a, label: PROCESS_CARD_ACCENT_LABELS[a] })),
];

const ICON_OPTIONS = PROCESS_CARD_ICONS.map((i) => ({ value: i, label: PROCESS_CARD_ICON_LABELS[i] }));

/** Work-unit-scoped Operational Calculations eligible for Work Unit Header KPIs. */
const KPI_CALC_OPTIONS = (() => {
    const byKey = new Map<string, { value: string; label: string }>();
    for (const c of listCalculationsByConsumer("work_unit_header")) {
        byKey.set(c.key, { value: c.key, label: c.label });
    }
    for (const c of listOperationalCalculations()) {
        if (c.status !== "active" || c.exploratoryOnly) continue;
        if (!c.grains.includes("work_unit") && !c.grains.includes("org")) continue;
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

export type WorkUnitHeaderSurfaceEditorProps = {
    onBack: () => void;
    fallbackTitle?: string | null;
    fallbackSubtitle?: string | null;
};

export default function WorkUnitHeaderSurfaceEditor({
    onBack,
    fallbackTitle = "Enrollment",
    fallbackSubtitle = "Active Pipeline",
}: WorkUnitHeaderSurfaceEditorProps) {
    const [config, setConfig] = useState<WorkUnitHeaderSurfaceConfig>(DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG);
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishedAt, setPublishedAt] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeField, setActiveField] = useState<WorkspaceHeaderBuilderField | null>(null);
    const inspectorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let active = true;
        loadWorkUnitHeaderSurfaceConfig()
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

    function patchIdentity(
        patch: Partial<Pick<WorkUnitHeaderSurfaceConfig, "title" | "subtitle" | "icon" | "accent">>,
    ) {
        setConfig((prev) => ({
            ...prev,
            title: patch.title !== undefined ? (patch.title?.trim() || null) : prev.title,
            subtitle: patch.subtitle !== undefined ? (patch.subtitle?.trim() || null) : prev.subtitle,
            icon: patch.icon !== undefined ? patch.icon : prev.icon,
            accent: patch.accent !== undefined ? patch.accent : prev.accent,
        }));
        markDirty();
    }

    function patchKpi(slot: 1 | 2 | 3 | 4 | 5, patch: Partial<WorkUnitHeaderKpiSlot>) {
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
            await publishWorkUnitHeaderSurfaceConfig(config);
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
            buildWorkUnitHeaderPresentation(config, {
                fallbackTitle: fallbackTitle ?? "Work Unit",
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
        <div className="flex h-full min-h-0 flex-col" data-work-unit-header-builder data-testid="work-unit-header-builder">
            <header className="shrink-0 border-b border-alloy-stone/10 pb-4">
                <button
                    type="button"
                    onClick={onBack}
                    data-testid="work-unit-header-back"
                    className="mb-2 text-[11px] font-medium text-alloy-midnight/50 transition-colors hover:text-alloy-bend-pine"
                >
                    ← Surfaces
                </button>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Work Unit Header
                        </p>
                        <h2 className="text-lg font-semibold text-alloy-midnight" data-work-unit-header-builder-title>
                            Title, subtitle, and work unit KPIs
                        </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {publishedAt ? (
                            <span className="text-xs font-medium text-alloy-bend-pine" data-work-unit-header-published>
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
                            data-work-unit-header-publish
                            data-testid="work-unit-header-publish"
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
                        data-work-unit-header-canvas
                    >
                        <p className="mb-4 w-full max-w-3xl text-center text-xs text-alloy-midnight/45">
                            Live runtime header — click a region to edit it.
                            {!config.subtitle && fallbackSubtitle ? (
                                <span className="block text-[11px] text-alloy-midnight/35">
                                    Subtitle preview uses “{fallbackSubtitle}” when unset.
                                </span>
                            ) : null}
                        </p>
                        <div className="w-full max-w-3xl rounded-xl border border-alloy-stone/12 bg-white px-6 py-5 shadow-sm">
                            <WorkUnitHeader
                                model={{
                                    ...preview,
                                    subtitle: preview.subtitle ?? (config.subtitle ? null : fallbackSubtitle ?? null),
                                }}
                                builder={{
                                    activeField,
                                    onFieldClick: focusInspectorField,
                                }}
                            />
                        </div>
                    </div>

                    <div ref={inspectorRef} className="flex flex-col gap-3 pb-6" data-work-unit-header-inspector>
                        <InspectorSection title="Identity" testId="identity">
                            <label className="flex flex-col gap-1" data-inspector-field="title">
                                <FieldLabel>Header title</FieldLabel>
                                <input
                                    type="text"
                                    value={config.title ?? ""}
                                    placeholder={fallbackTitle ?? "Work Unit"}
                                    onChange={(e) => patchIdentity({ title: e.target.value })}
                                    data-work-unit-header-title-input
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                />
                            </label>
                            <label className="flex flex-col gap-1" data-inspector-field="subtitle">
                                <FieldLabel>Header subtitle</FieldLabel>
                                <input
                                    type="text"
                                    value={config.subtitle ?? ""}
                                    placeholder={fallbackSubtitle ?? "Active work view"}
                                    onChange={(e) => patchIdentity({ subtitle: e.target.value })}
                                    data-work-unit-header-subtitle-input
                                    className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex flex-col gap-1">
                                    <FieldLabel>Identity icon</FieldLabel>
                                    <select
                                        value={config.icon ?? ""}
                                        onChange={(e) =>
                                            patchIdentity({
                                                icon: e.target.value
                                                    ? (e.target.value as ProcessCardIcon)
                                                    : null,
                                            })
                                        }
                                        data-work-unit-header-identity-icon
                                        className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                    >
                                        <option value="">None</option>
                                        {ICON_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1">
                                    <FieldLabel>Identity accent</FieldLabel>
                                    <select
                                        value={config.accent ?? ""}
                                        onChange={(e) =>
                                            patchIdentity({
                                                accent: (e.target.value || null) as ProcessCardAccent | null,
                                            })
                                        }
                                        data-work-unit-header-identity-accent
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
                                                data-work-unit-header-kpi-enabled={kpi.slot}
                                            />
                                            <FieldLabel>Show KPI {kpi.slot}</FieldLabel>
                                        </label>
                                    ) : null}
                                    {kpi.enabled || !isOptional ? (
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
                                                    data-work-unit-header-kpi-label={kpi.slot}
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
                                                    data-work-unit-header-kpi-source={kpi.slot}
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
                                                        data-work-unit-header-kpi-icon-select={kpi.slot}
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
                                                        data-work-unit-header-kpi-accent={kpi.slot}
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
