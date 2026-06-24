"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    PLATFORM_BUILDER_INPUT,
    PLATFORM_BUILDER_SELECT,
    PlatformBuilderButton,
    PlatformBuilderCallout,
    PlatformBuilderField,
    PlatformBuilderModal,
    PlatformBuilderSection,
} from "@/app/adminV2/settings/analytics/platformBuilderUi";
import { MetricFormFields } from "@/app/adminV2/settings/analytics/MetricFormFields";
import { BuilderIconPicker } from "@/app/adminV2/settings/analytics/BuilderIconPicker";
import { VisualizationStylePreview } from "@/app/adminV2/settings/analytics/VisualizationStylePreview";
import {
    ACCENT_OPTIONS,
    AVAILABLE_VIZ_TYPES,
    humanPlacementLabel,
    slugifyMetricKey,
    SURFACE_OPTIONS,
    TREND_BASED_VIZ_TYPES,
    VIZ_TYPE_HINTS,
    VIZ_TYPE_LABELS,
    ZONE_LABELS,
    ZONES_BY_SURFACE,
} from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import {
    EMPTY_METRIC_FORM,
    formToPayload,
    type MetricForm,
} from "@/app/adminV2/settings/analytics/metricFormModel";
import { deriveMetricCategoryFromSource, type MetricCategoryKey } from "@/lib/metrics/platform/metricCategory";
import { fetchMetricDefinitions } from "@/lib/metrics/platform/fetchMetricPlatform";
import { runMetricSnapshots } from "@/lib/metrics/platform/fetchMetricRender";
import { dispatchAnalyticsSnapshotsUpdated } from "@/app/adminV2/settings/analytics/platformBuilderEvents";
import {
    planPlacementWrites,
    resolveWriteTarget,
    type ExistingPlacement,
} from "@/lib/metrics/platform/metricWritePlan";
import type { MetricDefinitionRow, MetricVisualizationRow } from "@/lib/metrics/platform/types";
import type { MetricSourceAdapter } from "@/lib/metrics/platform/metricSourceRegistry";

type Props = {
    open: boolean;
    onClose: () => void;
    onComplete: () => void;
};

type VizForm = {
    label: string;
    visualization_type: string;
    accent: string;
    icon: string;
    subtitle: string;
};

const EMPTY_VIZ: VizForm = { label: "", visualization_type: "kpi_card", accent: "enrollment", icon: "", subtitle: "" };

const STEP_LABELS = ["Calculation", "Display style", "Where it appears", "Review & publish"];

function placeKey(surface: string, zone: string): string {
    return `${surface}::${zone}::default`;
}

async function writeRecord<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T | null> {
    const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { item: T };
    return data.item;
}

export default function MetricSetupFlow({ open, onClose, onComplete }: Props) {
    const [step, setStep] = useState(1);
    const [adapters, setAdapters] = useState<MetricSourceAdapter[]>([]);
    const [metricForm, setMetricForm] = useState<MetricForm>(EMPTY_METRIC_FORM);
    const [vizForm, setVizForm] = useState<VizForm>(EMPTY_VIZ);
    const [places, setPlaces] = useState<Set<string>>(new Set());
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [saving, setSaving] = useState(false);
    const [finishAction, setFinishAction] = useState<"draft" | "active" | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Create-once handles: established on first write, reused on every subsequent
    // save so Save draft → Publish never inserts duplicate rows.
    const metricIdRef = useRef<string | null>(null);
    const vizIdRef = useRef<string | null>(null);
    const placementsRef = useRef<ExistingPlacement[]>([]);

    const reset = useCallback(() => {
        setStep(1);
        setMetricForm({ ...EMPTY_METRIC_FORM, category: deriveMetricCategoryFromSource(EMPTY_METRIC_FORM.source_key) });
        setVizForm(EMPTY_VIZ);
        setPlaces(new Set());
        setShowAdvanced(false);
        setError(null);
        metricIdRef.current = null;
        vizIdRef.current = null;
        placementsRef.current = [];
    }, []);

    useEffect(() => {
        if (!open) return;
        reset();
        void fetchMetricDefinitions().then((data) => setAdapters((data.adapters ?? []) as MetricSourceAdapter[]));
    }, [open, reset]);

    const patchMetric = <K extends keyof MetricForm>(key: K, value: MetricForm[K]) => {
        setMetricForm((f) => {
            const next = { ...f, [key]: value };
            if (key === "source_key") next.category = deriveMetricCategoryFromSource(String(value)) as MetricCategoryKey;
            if (key === "label" && !showAdvanced) next.key = slugifyMetricKey(String(value));
            return next;
        });
        if (key === "label") setVizForm((v) => (v.label ? v : { ...v, label: String(value) }));
    };

    const togglePlace = (surface: string, zone: string) => {
        const key = placeKey(surface, zone);
        setPlaces((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const isTrendBased = TREND_BASED_VIZ_TYPES.has(vizForm.visualization_type);
    const canContinueStep1 = metricForm.label.trim().length > 0;
    const canContinueStep2 = vizForm.label.trim().length > 0;

    const finish = async (status: "draft" | "active") => {
        if (saving) return;
        setSaving(true);
        setFinishAction(status);
        setError(null);
        try {
            // 1. metric_definition — create once, then update the same record.
            const metricTarget = resolveWriteTarget(metricIdRef.current);
            const metric = await writeRecord<MetricDefinitionRow>(
                metricTarget.method === "POST" ? "/api/admin/analytics/metrics" : `/api/admin/analytics/metrics/${metricTarget.id}`,
                metricTarget.method,
                formToPayload(metricForm, status),
            );
            if (!metric) { setError("Could not save the calculation."); return; }
            metricIdRef.current = metric.id;

            // 2. metric_visualization — create once, then update.
            const vizTarget = resolveWriteTarget(vizIdRef.current);
            const vizLabel = vizForm.label.trim() || metricForm.label.trim();
            const viz = await writeRecord<MetricVisualizationRow>(
                vizTarget.method === "POST" ? "/api/admin/analytics/visualizations" : `/api/admin/analytics/visualizations/${vizTarget.id}`,
                vizTarget.method,
                {
                    metric_definition_id: metric.id,
                    key: slugifyMetricKey(vizLabel),
                    label: vizLabel,
                    visualization_type: vizForm.visualization_type,
                    style_config: { version: 1, accent: vizForm.accent, icon: vizForm.icon || undefined },
                    display_config: { version: 1, subtitle: vizForm.subtitle || undefined },
                    status,
                },
            );
            if (!viz) { setError("Could not save the display style."); return; }
            vizIdRef.current = viz.id;

            // 3. metric_placements — reconcile selected surfaces against what we already wrote.
            const selected = Array.from(places).map((k) => {
                const [surface, placement_zone, surface_key] = k.split("::");
                return { surface: surface!, placement_zone: placement_zone!, surface_key: surface_key! };
            });
            const plan = planPlacementWrites(placementsRef.current, selected, status === "active" ? "active" : "draft");
            for (const loc of plan.creates) {
                const created = await writeRecord<{ id: string; status: string }>("/api/admin/analytics/placements", "POST", {
                    visualization_id: viz.id,
                    surface: loc.surface,
                    surface_key: loc.surface_key,
                    placement_zone: loc.placement_zone,
                    context_config: { version: 1 },
                    visibility_config: { version: 1, visible: true },
                    sort_order: 0,
                    status: status === "active" ? "active" : "draft",
                });
                if (created) {
                    placementsRef.current.push({ id: created.id, surface: loc.surface, placement_zone: loc.placement_zone, surface_key: loc.surface_key, status: created.status });
                }
            }
            for (const upd of plan.updates) {
                await writeRecord(`/api/admin/analytics/placements/${upd.id}`, "PATCH", { status: upd.status });
                const row = placementsRef.current.find((p) => p.id === upd.id);
                if (row) row.status = upd.status;
            }
            for (const id of plan.removes) {
                await writeRecord(`/api/admin/analytics/placements/${id}`, "PATCH", { status: "archived" });
                const row = placementsRef.current.find((p) => p.id === id);
                if (row) row.status = "archived";
            }

            if (status === "active") {
                const result = await runMetricSnapshots({ metric_definition_ids: [metric.id] });
                dispatchAnalyticsSnapshotsUpdated(result);
            }

            onComplete();
            onClose();
        } finally {
            setSaving(false);
            setFinishAction(null);
        }
    };

    const stepHeader = (
        <ol className="mb-4 flex flex-wrap gap-2">
            {STEP_LABELS.map((label, idx) => {
                const n = idx + 1;
                const state = n === step ? "current" : n < step ? "done" : "upcoming";
                return (
                    <li
                        key={label}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            state === "current" ? "border-alloy-juniper/40 bg-alloy-juniper/10 text-alloy-juniper"
                            : state === "done" ? "border-alloy-juniper/20 bg-white text-alloy-midnight/55"
                            : "border-alloy-stone/25 bg-white text-alloy-midnight/40"
                        }`}
                    >
                        <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${state === "current" ? "bg-alloy-juniper text-white" : "bg-alloy-stone/20 text-alloy-midnight/55"}`}>{n}</span>
                        {label}
                    </li>
                );
            })}
        </ol>
    );

    const footer = (
        <>
            {error ? <span className="mr-auto text-[11px] font-medium text-alloy-ember">{error}</span> : null}
            {step > 1 ?
                <PlatformBuilderButton disabled={saving} onClick={() => setStep((s) => s - 1)}>Back</PlatformBuilderButton>
            :   <PlatformBuilderButton disabled={saving} onClick={onClose}>Cancel</PlatformBuilderButton>}
            {step < 4 ?
                <PlatformBuilderButton
                    variant="primary"
                    disabled={(step === 1 && !canContinueStep1) || (step === 2 && !canContinueStep2)}
                    onClick={() => setStep((s) => s + 1)}
                >
                    Continue
                </PlatformBuilderButton>
            :   <>
                    <PlatformBuilderButton loading={saving && finishAction === "draft"} disabled={saving} onClick={() => void finish("draft")}>Save draft</PlatformBuilderButton>
                    <PlatformBuilderButton variant="primary" loading={saving && finishAction === "active"} disabled={saving} onClick={() => void finish("active")}>Publish</PlatformBuilderButton>
                </>}
        </>
    );

    return (
        <PlatformBuilderModal
            open={open}
            title="New metric"
            subtitle="Create the calculation, choose how it looks, and place it — all in one flow."
            onClose={onClose}
            footer={footer}
        >
            {stepHeader}

            {step === 1 ?
                <div className="space-y-2">
                    <p className="text-xs text-alloy-midnight/55">Define what you are measuring. You can fine-tune everything later in the Calculations tab.</p>
                    <MetricFormFields form={metricForm} patchField={patchMetric} adapters={adapters} disabled={false} showAdvanced={showAdvanced} />
                    <button type="button" className="text-[11px] font-semibold text-alloy-juniper" onClick={() => setShowAdvanced((v) => !v)}>
                        {showAdvanced ? "Hide advanced" : "Advanced"}
                    </button>
                </div>
            :   null}

            {step === 2 ?
                <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
                    <div className="space-y-2">
                        <PlatformBuilderSection title="Card setup" compact hint={VIZ_TYPE_HINTS[vizForm.visualization_type]}>
                            <PlatformBuilderField label="Card title">
                                <input className={PLATFORM_BUILDER_INPUT} value={vizForm.label} onChange={(e) => setVizForm((f) => ({ ...f, label: e.target.value }))} />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Display style">
                                <select className={PLATFORM_BUILDER_SELECT} value={vizForm.visualization_type} onChange={(e) => setVizForm((f) => ({ ...f, visualization_type: e.target.value }))}>
                                    {AVAILABLE_VIZ_TYPES.map((t) => <option key={t} value={t}>{VIZ_TYPE_LABELS[t] ?? t}</option>)}
                                </select>
                            </PlatformBuilderField>
                            <div className="sm:col-span-2">
                                <PlatformBuilderField label="Subtitle">
                                    <input className={PLATFORM_BUILDER_INPUT} value={vizForm.subtitle} onChange={(e) => setVizForm((f) => ({ ...f, subtitle: e.target.value }))} />
                                </PlatformBuilderField>
                            </div>
                        </PlatformBuilderSection>
                        <PlatformBuilderSection title="Visual treatment" compact>
                            <div className="sm:col-span-2">
                                <PlatformBuilderField label="Accent color">
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                        {ACCENT_OPTIONS.map((accent) => (
                                            <button key={accent.key} type="button" title={accent.label} onClick={() => setVizForm((f) => ({ ...f, accent: accent.key }))} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${vizForm.accent === accent.key ? `border-alloy-juniper/40 ring-2 ${accent.ring}` : "border-alloy-stone/25"}`}>
                                                <span className={`h-3.5 w-3.5 rounded-full ${accent.swatch}`} />
                                                {accent.label}
                                            </button>
                                        ))}
                                    </div>
                                </PlatformBuilderField>
                            </div>
                            <div className="sm:col-span-2">
                                <PlatformBuilderField label="Icon" hint={isTrendBased ? "Trend direction is calculated automatically from metric history. The icon only represents the category." : "Represents the metric category or style."}>
                                    <BuilderIconPicker value={vizForm.icon} onChange={(icon) => setVizForm((f) => ({ ...f, icon }))} />
                                </PlatformBuilderField>
                            </div>
                        </PlatformBuilderSection>
                    </div>
                    <VisualizationStylePreview
                        form={{ label: vizForm.label, label_override: "", visualization_type: vizForm.visualization_type, accent: vizForm.accent, icon: vizForm.icon, subtitle: vizForm.subtitle, additional_metric_ids: [] }}
                        extraMetricLabels={[]}
                    />
                </div>
            :   null}

            {step === 3 ?
                <div className="space-y-3">
                    <p className="text-xs text-alloy-midnight/55">Choose every surface where operators should see this. One display style can appear in multiple places.</p>
                    {SURFACE_OPTIONS.map((surface) => (
                        <div key={surface.key} className="rounded-lg border border-alloy-stone/15 p-3">
                            <p className="text-sm font-semibold text-alloy-midnight">{surface.label}</p>
                            <p className="mb-2 text-[11px] text-alloy-midnight/50">{surface.description}</p>
                            <div className="flex flex-wrap gap-2">
                                {ZONES_BY_SURFACE[surface.key].map((zone) => {
                                    const key = placeKey(surface.key, zone);
                                    const active = places.has(key);
                                    return (
                                        <button key={zone} type="button" onClick={() => togglePlace(surface.key, zone)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${active ? "border-alloy-juniper/40 bg-alloy-juniper/10 text-alloy-juniper" : "border-alloy-stone/25 text-alloy-midnight/70 hover:border-alloy-stone/40"}`}>
                                            {active ? "✓ " : ""}{ZONE_LABELS[surface.key]?.[zone] ?? zone.replace(/_/g, " ")}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {places.size === 0 ?
                        <PlatformBuilderCallout>Pick at least one place, or publish now and add placements later from the “Where it appears” tab.</PlatformBuilderCallout>
                    :   null}
                </div>
            :   null}

            {step === 4 ?
                <div className="space-y-3">
                    <PlatformBuilderSection title="Review" compact>
                        <div className="sm:col-span-2 space-y-2 text-sm text-alloy-midnight/75">
                            <p><span className="font-semibold text-alloy-midnight">Calculation:</span> {metricForm.label || "—"}</p>
                            <p><span className="font-semibold text-alloy-midnight">Display style:</span> {vizForm.label || metricForm.label} · {VIZ_TYPE_LABELS[vizForm.visualization_type] ?? vizForm.visualization_type}</p>
                            <div>
                                <span className="font-semibold text-alloy-midnight">Appears in:</span>
                                {places.size ?
                                    <ul className="mt-1 list-inside list-disc text-xs text-alloy-midnight/60">
                                        {Array.from(places).map((k) => {
                                            const [surface, zone] = k.split("::");
                                            return <li key={k}>{humanPlacementLabel(surface!, zone!)}</li>;
                                        })}
                                    </ul>
                                :   <span className="text-xs text-alloy-midnight/50"> Nowhere yet — you can add places later.</span>}
                            </div>
                        </div>
                    </PlatformBuilderSection>
                    <PlatformBuilderCallout>
                        <strong>Save draft</strong> keeps everything hidden until you publish. <strong>Publish</strong> makes it visible on the selected surfaces and refreshes live values.
                    </PlatformBuilderCallout>
                </div>
            :   null}
        </PlatformBuilderModal>
    );
}
