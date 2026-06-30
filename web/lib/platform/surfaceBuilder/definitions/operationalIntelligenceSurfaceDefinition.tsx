/**
 * Operational Intelligence — Surface Definition (consumer #2 of the platform builder).
 *
 * Operational Intelligence is NOT a special builder; it is a definition handed to the
 * one platform `SurfaceBuilder`. Content comes from the Operational Calculations
 * registry; card types map to the metric renderers; placement ("Promote to") and the
 * persistence store are the only surface-specific I/O. No builder code lives here.
 */

import {
    listOperationalCalculations,
    findOperationalCalculation,
} from "@/lib/analytics/calculations/registry";
import type { OperationalCalculation } from "@/lib/analytics/calculations/types";
import type {
    SurfaceDefinition,
    SurfacePersistenceAdapter,
    ContentDefinition,
    ContentSourceProvider,
    CardDefinition,
    RendererDefinition,
    InspectorSchema,
    SurfaceRuntimeRenderer,
    SurfaceDoc,
} from "@/lib/platform/surfaceBuilder/surfaceDefinition";

const BUSINESS_PROCESS_LABEL: Record<OperationalCalculation["businessProcess"], string> = {
    enrollment: "Enrollment",
    communications: "Communications",
    forms: "Forms",
    operational_health: "Operations",
    capacity: "Capacity",
    financial: "Financial",
};

/** Content = the Operational Calculations registry. The operator never sees "metric definition". */
export function operationalIntelligenceContentSource(): ContentSourceProvider {
    const items: ContentDefinition[] = listOperationalCalculations().map((calc) => ({
        id: calc.key,
        label: calc.label,
        question: calc.questionAnswered,
        group: BUSINESS_PROCESS_LABEL[calc.businessProcess] ?? "Other",
        availability: calc.status === "active" ? "live" : "available",
    }));
    const byId = new Map(items.map((i) => [i.id, i]));
    return {
        list: () => items,
        resolveLabel: (id) => byId.get(id)?.label ?? id,
    };
}

export const OPERATIONAL_INTELLIGENCE_CARD_TYPES: readonly CardDefinition[] = [
    { key: "kpi", label: "Metric / KPI", icon: "▦", rendererKey: "kpi_card", group: "Measure", description: "A single number with tone" },
    { key: "trend", label: "Trend", icon: "📈", rendererKey: "trend_card", group: "Measure", description: "Change over time" },
    { key: "gauge", label: "Gauge", icon: "◑", rendererKey: "gauge", group: "Measure", description: "Progress toward a target" },
    { key: "comparison", label: "Comparison", icon: "⇄", rendererKey: "comparison", group: "Measure", description: "This period vs prior" },
    { key: "breakdown", label: "Breakdown", icon: "▥", rendererKey: "bar_chart", group: "Understand", description: "Split by segment" },
    { key: "table", label: "Table", icon: "≣", rendererKey: "table", group: "Understand", description: "Rows of detail" },
    { key: "health", label: "Health", icon: "✚", rendererKey: "scorecard", group: "Understand", description: "Composite status read" },
    { key: "affected_work", label: "Affected work", icon: "❗", rendererKey: "affected_work", group: "Operational", description: "The records behind a number" },
    { key: "recommendation", label: "Recommendation", icon: "✦", rendererKey: "recommendation", group: "Narrate", description: "Suggested action + impact" },
    { key: "forecast", label: "Forecast", icon: "⤴", rendererKey: "forecast", group: "Narrate", description: "Current → projected" },
];

export const OPERATIONAL_INTELLIGENCE_RENDERERS: readonly RendererDefinition[] = [
    { key: "kpi_card", label: "KPI value" },
    { key: "trend_card", label: "Trend" },
    { key: "gauge", label: "Health gauge" },
    { key: "comparison", label: "Comparison" },
    { key: "bar_chart", label: "Bars" },
    { key: "table", label: "Table" },
    { key: "scorecard", label: "Scorecard" },
    { key: "chip", label: "Chip" },
];

/** Surfaces an OI card can be promoted to (placement, named for operators). */
export const OPERATIONAL_INTELLIGENCE_PROMOTE_TARGETS = [
    { value: "operational_intelligence", label: "Operational Intelligence" },
    { value: "workspace_header", label: "Workspace header" },
    { value: "work_unit_header", label: "Work unit header" },
    { value: "executive_performance", label: "Executive Performance" },
    { value: "enrollment_intelligence", label: "Enrollment Intelligence" },
    { value: "report", label: "Reports" },
] as const;

export const OPERATIONAL_INTELLIGENCE_INSPECTOR: InspectorSchema = {
    tabs: [
        {
            key: "card",
            label: "Card",
            fields: [
                { key: "title", label: "Title", kind: "text" },
                { key: "description", label: "Description", kind: "textarea" },
                {
                    key: "size",
                    label: "Size",
                    kind: "select",
                    options: [
                        { value: "compact", label: "Compact" },
                        { value: "standard", label: "Standard" },
                        { value: "wide", label: "Wide" },
                        { value: "tall", label: "Tall" },
                    ],
                },
                { key: "visibility", label: "Visible on the surface", kind: "toggle" },
            ],
        },
        {
            key: "content",
            label: "Content",
            fields: [
                { key: "contentId", label: "Metric / calculation", kind: "content" },
                { key: "question", label: "Question it answers", kind: "textarea" },
            ],
        },
        {
            key: "renderer",
            label: "Renderer",
            fields: [
                { key: "rendererKey", label: "Renderer", kind: "renderer" },
                {
                    key: "accent",
                    label: "Accent color",
                    kind: "select",
                    options: [
                        { value: "auto", label: "Auto (from status)" },
                        { value: "juniper", label: "Green" },
                        { value: "amber", label: "Amber" },
                        { value: "ember", label: "Red" },
                        { value: "blue", label: "Blue" },
                        { value: "pine", label: "Pine" },
                        { value: "neutral", label: "Neutral" },
                    ],
                },
            ],
        },
        {
            key: "behavior",
            label: "Behavior",
            fields: [
                { key: "thresholds", label: "Tone thresholds", kind: "thresholds" },
                {
                    key: "comparison",
                    label: "Comparison",
                    kind: "select",
                    options: [
                        { value: "off", label: "Off" },
                        { value: "prior", label: "Prior period" },
                        { value: "target", label: "Target" },
                    ],
                },
                { key: "drill", label: "Drill to", kind: "select", options: [{ value: "default", label: "Default queue" }] },
                {
                    key: "refresh",
                    label: "Refresh",
                    kind: "select",
                    options: [
                        { value: "live", label: "Live" },
                        { value: "hourly", label: "Hourly" },
                        { value: "daily", label: "Daily" },
                    ],
                },
            ],
        },
        {
            key: "placement",
            label: "Placement",
            fields: [
                { key: "promotedTo", label: "Where this appears", kind: "promote", options: OPERATIONAL_INTELLIGENCE_PROMOTE_TARGETS },
            ],
        },
    ],
};

const CARD_TYPE_DEFAULT_RENDERER: Record<string, string> = {
    kpi: "kpi_card",
    trend: "trend_card",
    gauge: "gauge",
    comparison: "comparison",
    breakdown: "bar_chart",
    table: "table",
    health: "scorecard",
    affected_work: "affected_work",
    recommendation: "recommendation",
    forecast: "forecast",
};

type SampleTone = "healthy" | "warning" | "critical" | "neutral";

const TONE: Record<SampleTone, { rail: string; chip: string; label: string; stroke: string }> = {
    healthy: { rail: "bg-alloy-juniper", chip: "bg-alloy-juniper/10 text-alloy-juniper", label: "Healthy", stroke: "#1d7a5f" },
    warning: { rail: "bg-amber-500", chip: "bg-amber-500/10 text-amber-600", label: "Watch", stroke: "#d08700" },
    critical: { rail: "bg-alloy-ember", chip: "bg-alloy-ember/10 text-alloy-ember", label: "At risk", stroke: "#c2410c" },
    neutral: { rail: "bg-alloy-stone/40", chip: "bg-alloy-stone/15 text-alloy-midnight/55", label: "Live", stroke: "#94a3b8" },
};

/** Explicit accent override (Surfaces controls color, not Operational Calculations). */
const ACCENT_COLOR: Record<string, { rail: string; chip: string; stroke: string }> = {
    juniper: { rail: "bg-alloy-juniper", chip: "bg-alloy-juniper/10 text-alloy-juniper", stroke: "#1d7a5f" },
    amber: { rail: "bg-amber-500", chip: "bg-amber-500/10 text-amber-600", stroke: "#d08700" },
    ember: { rail: "bg-alloy-ember", chip: "bg-alloy-ember/10 text-alloy-ember", stroke: "#c2410c" },
    blue: { rail: "bg-alloy-blue", chip: "bg-alloy-blue/10 text-alloy-blue", stroke: "#2563a8" },
    pine: { rail: "bg-alloy-pine", chip: "bg-alloy-pine/10 text-alloy-pine", stroke: "#00a283" },
    neutral: { rail: "bg-alloy-stone/40", chip: "bg-alloy-stone/15 text-alloy-midnight/55", stroke: "#94a3b8" },
};

type Sample = { value: string; unit?: string; tone: SampleTone; delta?: string; dir?: "up" | "down" };

/** Illustrative sample values so the canvas reads like the runtime (no live resolution at author time). */
const SAMPLE: Record<string, Sample> = {
    "enrollment.lead_count": { value: "142", unit: "leads", tone: "healthy", delta: "12%", dir: "up" },
    "enrollment.tour_conversion_rate": { value: "58", unit: "%", tone: "warning", delta: "7 pts", dir: "down" },
    "enrollment.tour_completed_count": { value: "38", unit: "tours", tone: "healthy", delta: "5", dir: "up" },
    "enrollment.time_to_schedule_tour": { value: "2.4", unit: "days", tone: "healthy", delta: "0.3d", dir: "down" },
    "ops.needs_attention_count": { value: "23", unit: "items", tone: "critical", delta: "9", dir: "up" },
    "ops.work_overdue_count": { value: "11", unit: "items", tone: "warning", delta: "3", dir: "up" },
    "ops.readiness_gap_count": { value: "6", unit: "gaps", tone: "warning" },
    "ops.workflow_failure_rate": { value: "4", unit: "%", tone: "healthy" },
    "comms.delivery_rate": { value: "97", unit: "%", tone: "healthy", delta: "1 pt", dir: "up" },
    "comms.reply_rate": { value: "42", unit: "%", tone: "healthy" },
    "comms.failed_delivery_count": { value: "8", unit: "msgs", tone: "warning" },
    "forms.completion_rate": { value: "81", unit: "%", tone: "healthy", delta: "4 pts", dir: "up" },
    "forms.packet_completion_time": { value: "3.1", unit: "days", tone: "warning" },
};
const FALLBACK_SAMPLE: Sample = { value: "84", unit: "%", tone: "healthy" };

function ValueEl({ s }: { s: Sample }) {
    return (
        <div className="flex items-baseline gap-1">
            <span className="text-[30px] font-bold leading-none tracking-tight text-alloy-midnight">{s.value}</span>
            {s.unit ? <span className="text-[13px] font-semibold text-alloy-midnight/45">{s.unit}</span> : null}
        </div>
    );
}

function DeltaEl({ s, showCompare }: { s: Sample; showCompare: boolean }) {
    if (s.delta) {
        return (
            <span className={`text-[12px] font-semibold ${s.dir === "down" ? "text-alloy-ember" : "text-alloy-juniper"}`}>
                {s.dir === "down" ? "▼" : "▲"} {s.delta}{showCompare ? " vs prior" : ""}
            </span>
        );
    }
    return showCompare ? <span className="text-[11px] font-medium text-alloy-midnight/40">vs prior period</span> : null;
}

/** Renderer-specific, tone-colored body — the canvas reacts the instant the renderer changes. */
function vividBody(renderer: string, s: Sample, stroke: string, showCompare: boolean) {
    switch (renderer) {
        case "trend_card":
        case "sparkline":
        case "line_chart":
        case "area_chart":
            return (
                <div className="space-y-1.5">
                    <ValueEl s={s} />
                    <svg viewBox="0 0 220 40" preserveAspectRatio="none" className="h-9 w-full">
                        <polyline points="0,30 40,24 80,28 120,16 160,22 200,10 220,14" fill="none" stroke={stroke} strokeWidth="2.5" />
                    </svg>
                    <DeltaEl s={s} showCompare={showCompare} />
                </div>
            );
        case "gauge":
            return (
                <div className="flex items-center gap-3">
                    <svg width="58" height="58" viewBox="0 0 58 58"><circle cx="29" cy="29" r="23" fill="none" strokeWidth="7" className="stroke-alloy-stone/15" /><circle cx="29" cy="29" r="23" fill="none" stroke={stroke} strokeWidth="7" strokeDasharray="145" strokeDashoffset="44" strokeLinecap="round" transform="rotate(-90 29 29)" /></svg>
                    <div><ValueEl s={s} /><DeltaEl s={s} showCompare={showCompare} /></div>
                </div>
            );
        case "bar_chart":
            return (
                <div className="flex flex-col gap-2 pt-1">
                    {[{ l: "Touring", w: 74 }, { l: "Waitlist", w: 52 }, { l: "Inquiry", w: 38 }].map((b) => (
                        <div key={b.l} className="flex items-center gap-2 text-[11px]">
                            <span className="w-14 shrink-0 text-alloy-midnight/55">{b.l}</span>
                            <span className="h-2 flex-1 rounded-full bg-alloy-stone/10"><span className="block h-full rounded-full" style={{ width: `${b.w}%`, background: stroke }} /></span>
                        </div>
                    ))}
                </div>
            );
        case "comparison":
            return (
                <div className="flex items-end gap-4 pt-1">
                    <div><div className="text-[10px] font-semibold uppercase text-alloy-midnight/40">Now</div><ValueEl s={s} /></div>
                    <div className="opacity-50"><div className="text-[10px] font-semibold uppercase text-alloy-midnight/40">Prior</div><div className="text-[22px] font-bold text-alloy-midnight/60">{s.value}</div></div>
                </div>
            );
        case "table":
            return (
                <div className="pt-1">
                    {[["Touring", "31"], ["Waitlist", "17"], ["Inquiry", "13"]].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between border-b border-alloy-stone/10 py-1 text-[12px]"><span className="text-alloy-midnight/65">{k}</span><span className="font-semibold tabular-nums text-alloy-midnight">{v}</span></div>
                    ))}
                </div>
            );
        case "scorecard":
            return (
                <div className="flex items-center gap-2 pt-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: stroke }} />
                    <ValueEl s={s} />
                </div>
            );
        case "affected_work":
            return (
                <div className="space-y-1 pt-1">
                    {[["Touring", "31"], ["Waitlist", "17"]].map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2 text-[12px]"><span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: stroke }}>{v}</span><span className="text-alloy-midnight/70">{k}</span></div>
                    ))}
                </div>
            );
        case "recommendation":
            return (
                <div className="space-y-1.5 pt-1">
                    <p className="text-[12.5px] font-semibold leading-snug text-alloy-midnight">Follow up the 17 stalled tours today</p>
                    <p className="text-[11px] font-medium" style={{ color: stroke }}>+6 conversions / month projected</p>
                </div>
            );
        case "forecast":
            return (
                <div className="flex items-end gap-4 pt-1">
                    <div><div className="text-[10px] font-semibold uppercase text-alloy-midnight/40">Now</div><ValueEl s={s} /></div>
                    <div><div className="text-[10px] font-semibold uppercase text-alloy-midnight/40">Projected</div><div className="text-[22px] font-bold" style={{ color: stroke }}>{s.value}↑</div></div>
                </div>
            );
        default:
            return (
                <div className="space-y-1"><ValueEl s={s} /><DeltaEl s={s} showCompare={showCompare} /></div>
            );
    }
}

/**
 * Vivid live preview that honors the card's config — renderer, title, question, comparison,
 * and visibility all change the canvas card instantly. Values are illustrative samples at
 * author time (no live resolution); the real numbers render in the runtime modal.
 */
const runtimeRenderer: SurfaceRuntimeRenderer = {
    renderCard: (instance, ctx) => {
        const calc = instance.contentId ? findOperationalCalculation(instance.contentId) : null;
        const cfg = (instance.config ?? {}) as Record<string, unknown>;
        const renderer = String(cfg.rendererKey ?? CARD_TYPE_DEFAULT_RENDERER[instance.cardTypeKey] ?? "kpi_card");
        const title = String((typeof cfg.title === "string" && cfg.title) || ctx.contentLabel || "Choose content");
        const question = (typeof cfg.question === "string" && cfg.question) ? cfg.question : (calc?.questionAnswered ?? null);
        const hasContent = Boolean(instance.contentId);
        const s = hasContent ? (SAMPLE[String(instance.contentId)] ?? FALLBACK_SAMPLE) : FALLBACK_SAMPLE;
        const baseTone = TONE[s.tone];
        const acc = typeof cfg.accent === "string" && cfg.accent !== "auto" ? ACCENT_COLOR[cfg.accent] : null;
        const tone = acc ? { ...baseTone, rail: acc.rail, chip: acc.chip, stroke: acc.stroke } : baseTone;
        const dimmed = cfg.visibility === "off";

        // Compact (header) tiles: a uniform KPI/Trend tile. Renderer changes the body
        // (Trend adds a sparkline); the health chip is off unless explicitly enabled; accent
        // controls color. Headers are a single readable row, so there is no size variation.
        if (ctx.density === "compact") {
            const showChip = cfg.showHealthChip === "on";
            const isTrend = renderer === "trend_card" || renderer === "sparkline" || renderer === "line_chart" || renderer === "area_chart";
            return (
                <div className={`relative overflow-hidden rounded-lg border border-alloy-stone/15 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${dimmed ? "opacity-50" : ""}`} data-metric-visual={`metric_${renderer}`}>
                    <span className={`absolute inset-y-0 left-0 w-[3px] ${tone.rail}`} aria-hidden="true" />
                    <div className="flex items-center justify-between gap-1.5 pl-1.5">
                        <p className="min-w-0 flex-1 text-[11px] font-semibold text-alloy-midnight" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</p>
                        {hasContent && showChip ? <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${tone.chip}`}>{tone.label}</span> : null}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1 pl-1.5">
                        {hasContent ? (
                            <>
                                <span className="text-[22px] font-bold leading-none tracking-tight text-alloy-midnight">{s.value}</span>
                                {s.unit ? <span className="text-[11px] font-semibold text-alloy-midnight/45">{s.unit}</span> : null}
                            </>
                        ) : <span className="text-[11px] font-medium text-alloy-midnight/35">Pick content →</span>}
                    </div>
                    {hasContent && isTrend ? (
                        <svg viewBox="0 0 120 20" preserveAspectRatio="none" className="mt-1 h-4 w-full pl-1.5">
                            <polyline points="0,15 24,12 48,14 72,8 96,11 120,5" fill="none" stroke={tone.stroke} strokeWidth="2" />
                        </svg>
                    ) : null}
                </div>
            );
        }

        return (
            <div className={`relative h-full overflow-hidden rounded-xl border border-alloy-stone/15 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${dimmed ? "opacity-50" : ""}`} data-metric-visual={`metric_${renderer}`}>
                <span className={`absolute inset-y-0 left-0 w-[3px] ${tone.rail}`} aria-hidden="true" />
                <div className="flex items-start gap-2 pl-1.5">
                    <div className="min-w-0 flex-1">
                        {question ? <p className="truncate text-[11px] font-medium text-alloy-midnight/45">{question}</p> : null}
                        <p className="truncate text-[13px] font-semibold text-alloy-midnight">{title}</p>
                    </div>
                    {hasContent ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.chip}`}>{tone.label}</span> : null}
                </div>
                <div className="mt-2.5 pl-1.5">
                    {hasContent ? vividBody(renderer, s, tone.stroke, cfg.comparison === "prior" || cfg.comparison === "target") : (
                        <p className="text-[13px] font-medium text-alloy-midnight/35">Pick content →</p>
                    )}
                </div>
            </div>
        );
    },
};

/** Exposed so header surfaces reuse the exact same metric card renderer + content. */
export { runtimeRenderer as operationalMetricRuntimeRenderer };

const tplKpi = (instanceId: string, contentId: string) => ({ instanceId, cardTypeKey: "kpi", contentId, config: { rendererKey: "kpi_card", visibility: "on" } });

/** Default starter dashboard — powers "Start from template" / "Reset to template". */
export const OPERATIONAL_INTELLIGENCE_TEMPLATE: SurfaceDoc = {
    sections: [
        {
            sectionId: "overview",
            title: "Overview",
            cards: [
                tplKpi("tpl-lead", "enrollment.lead_count"),
                { instanceId: "tpl-tour", cardTypeKey: "trend", contentId: "enrollment.tour_conversion_rate", config: { rendererKey: "trend_card", visibility: "on" } },
                tplKpi("tpl-attn", "ops.needs_attention_count"),
            ],
        },
        {
            sectionId: "health",
            title: "Health",
            cards: [
                tplKpi("tpl-overdue", "ops.work_overdue_count"),
                { instanceId: "tpl-delivery", cardTypeKey: "gauge", contentId: "comms.delivery_rate", config: { rendererKey: "gauge", visibility: "on" } },
            ],
        },
    ],
};

/**
 * Build the Operational Intelligence surface definition. The persistence adapter is
 * injected (the real `metric_placements` adapter in production; in-memory in tests).
 */
export function operationalIntelligenceSurfaceDefinition(
    persistence: SurfacePersistenceAdapter,
): SurfaceDefinition {
    return {
        surfaceType: "operational_intelligence",
        title: "Operational Intelligence",
        sections: "authorable",
        cardTypes: OPERATIONAL_INTELLIGENCE_CARD_TYPES,
        renderers: OPERATIONAL_INTELLIGENCE_RENDERERS,
        contentSource: operationalIntelligenceContentSource(),
        inspectorSchema: OPERATIONAL_INTELLIGENCE_INSPECTOR,
        runtimeRenderer,
        persistence,
        immediatePersist: true,
        appearsIn: "Workspace → Analytics modal",
        runtimeHref: "/workspace?workspaceModal=analytics",
        template: OPERATIONAL_INTELLIGENCE_TEMPLATE,
    };
}
