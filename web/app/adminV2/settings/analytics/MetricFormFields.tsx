"use client";

import {
    PLATFORM_BUILDER_INPUT,
    PLATFORM_BUILDER_SELECT,
    PLATFORM_BUILDER_TEXTAREA,
    PlatformBuilderField,
    PlatformBuilderSection,
} from "@/app/adminV2/settings/analytics/platformBuilderUi";
import type { MetricForm } from "@/app/adminV2/settings/analytics/metricFormModel";
import { METRIC_CATEGORY_OPTIONS, type MetricCategoryKey } from "@/lib/metrics/platform/metricCategory";
import type { MetricSourceAdapter } from "@/lib/metrics/platform/metricSourceRegistry";

export function MetricFormFields({
    form,
    patchField,
    adapters,
    disabled,
    showAdvanced,
}: {
    form: MetricForm;
    patchField: <K extends keyof MetricForm>(key: K, value: MetricForm[K]) => void;
    adapters: MetricSourceAdapter[];
    disabled: boolean;
    showAdvanced: boolean;
}) {
    return (
        <div className="space-y-2">
            <PlatformBuilderSection title="What are you measuring?" hint="Name and category operators will recognize." compact>
                {showAdvanced ?
                    <PlatformBuilderField label="Internal key">
                        <input className={PLATFORM_BUILDER_INPUT} value={form.key} disabled={disabled} onChange={(e) => patchField("key", e.target.value)} />
                    </PlatformBuilderField>
                :   null}
                <PlatformBuilderField label="Name">
                    <input className={PLATFORM_BUILDER_INPUT} value={form.label} disabled={disabled} onChange={(e) => patchField("label", e.target.value)} placeholder="Tour Conversion %" />
                </PlatformBuilderField>
                <PlatformBuilderField label="Category">
                    <select className={PLATFORM_BUILDER_SELECT} value={form.category} disabled={disabled} onChange={(e) => patchField("category", e.target.value as MetricCategoryKey)}>
                        {METRIC_CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>{opt.label}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
                <div className="sm:col-span-2">
                    <PlatformBuilderField label="Description">
                        <textarea className={PLATFORM_BUILDER_TEXTAREA} value={form.description} disabled={disabled} onChange={(e) => patchField("description", e.target.value)} rows={2} />
                    </PlatformBuilderField>
                </div>
            </PlatformBuilderSection>

            <PlatformBuilderSection title="Calculation" hint="Data source and rolling window." compact>
                <PlatformBuilderField label="Data source" hint="Data sources are system-provided. More sources can be added as Alloy expands.">
                    <select className={PLATFORM_BUILDER_SELECT} value={form.source_key} onChange={(e) => patchField("source_key", e.target.value)} disabled={disabled}>
                        {adapters.map((a) => (
                            <option key={a.key} value={a.key} disabled={a.status !== "available"}>{a.label}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
                <PlatformBuilderField label="Type">
                    <select className={PLATFORM_BUILDER_SELECT} value={form.aggregation} onChange={(e) => patchField("aggregation", e.target.value)} disabled={disabled}>
                        {["count", "rate", "avg", "sum", "median"].map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                </PlatformBuilderField>
                <PlatformBuilderField label="Window (days)">
                    <input type="number" className={PLATFORM_BUILDER_INPUT} value={form.period_days} onChange={(e) => patchField("period_days", parseInt(e.target.value, 10) || 30)} disabled={disabled} />
                </PlatformBuilderField>
                <PlatformBuilderField label="Unit">
                    <select className={PLATFORM_BUILDER_SELECT} value={form.unit} onChange={(e) => patchField("unit", e.target.value)} disabled={disabled}>
                        {["percent", "count", "rate", "duration", "currency"].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                </PlatformBuilderField>
            </PlatformBuilderSection>

            <PlatformBuilderSection title="Target & health" compact>
                <PlatformBuilderField label="Track as KPI">
                    <input type="checkbox" checked={form.is_kpi} onChange={(e) => patchField("is_kpi", e.target.checked)} disabled={disabled} className="mt-2 h-4 w-4 rounded border-alloy-stone/40" />
                </PlatformBuilderField>
                <PlatformBuilderField label="Direction">
                    <select className={PLATFORM_BUILDER_SELECT} value={form.direction} onChange={(e) => patchField("direction", e.target.value as MetricForm["direction"])} disabled={disabled}>
                        <option value="higher_is_better">Higher is better</option>
                        <option value="lower_is_better">Lower is better</option>
                    </select>
                </PlatformBuilderField>
                {form.aggregation === "rate" ?
                    <>
                        <PlatformBuilderField label="Target min"><input className={PLATFORM_BUILDER_INPUT} value={form.target_min_rate} onChange={(e) => patchField("target_min_rate", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                        <PlatformBuilderField label="Healthy min"><input className={PLATFORM_BUILDER_INPUT} value={form.healthy_min_rate} onChange={(e) => patchField("healthy_min_rate", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                        <PlatformBuilderField label="Warning min"><input className={PLATFORM_BUILDER_INPUT} value={form.warning_min_rate} onChange={(e) => patchField("warning_min_rate", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                    </>
                :   <>
                        <PlatformBuilderField label="Target max"><input className={PLATFORM_BUILDER_INPUT} value={form.target_max_count} onChange={(e) => patchField("target_max_count", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                        <PlatformBuilderField label="Healthy max"><input className={PLATFORM_BUILDER_INPUT} value={form.healthy_max_count} onChange={(e) => patchField("healthy_max_count", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                        <PlatformBuilderField label="Warning max"><input className={PLATFORM_BUILDER_INPUT} value={form.warning_max_count} onChange={(e) => patchField("warning_max_count", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                    </>
                }
            </PlatformBuilderSection>
        </div>
    );
}
