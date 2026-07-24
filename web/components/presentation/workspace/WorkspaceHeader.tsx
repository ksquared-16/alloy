/**
 * Presentation Runtime V2 — WS.HEADER.
 *
 * Configurable workspace identity (title + subtitle) and 3–5 org-level KPI cards.
 * Pure presentation — receives the resolved header model from WorkspaceSurface / builder.
 * Builder and runtime share this component for parity.
 */

"use client";

import type { ReactNode } from "react";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
    type PresentationRuntimeLabel,
} from "@/components/presentation/runtimeLabels";
import {
    workspaceHeaderKpiIconClass,
    workspaceHeaderKpiIconWellClass,
    processTileIdentityWellClass,
} from "@/lib/presentation/runtime/processCardAccentStyles";
import type { ProcessCardAccent, ProcessCardIcon } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type {
    WorkspaceHeaderKpiVm,
    WorkspaceHeaderPresentationModel,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import { WORKSPACE_HEADER_NO_DATA_VALUE } from "@/lib/presentation/runtime/workspaceHeaderCards";
import { useAdaptiveMetricDensity } from "@/lib/presentation/useAmbientWorkspacePresentation";
import { ProcessCardGlyph } from "./ProcessCardGlyph";
import { WS_KPI_CARD_CHROME } from "@/components/workspace/workspaceTokens";

export type WorkspaceHeaderBuilderField =
    | "title"
    | "subtitle"
    | `kpi-${1 | 2 | 3 | 4 | 5}`;

export type WorkspaceHeaderBuilderProps = {
    activeField: WorkspaceHeaderBuilderField | null;
    onFieldClick: (field: WorkspaceHeaderBuilderField) => void;
};

export type SurfaceHeaderVariant = "workspace" | "work-unit";

/**
 * Work Unit page-header density. Orthogonal to ambient `metricDensity` (width):
 * - `browse` — full identity + KPI strip (no record of attention)
 * - `focus` — compact operational context bar when a record is selected / Focus Panel open
 */
export type WorkUnitHeaderDensity = "browse" | "focus";

const VARIANT_META: Record<
    SurfaceHeaderVariant,
    {
        section: string;
        calculationsSection: string;
        dataAttr: string;
        kpiIconAttr: string;
        kpiAria: string;
        headerLabel: PresentationRuntimeLabel;
        calculationsLabel: PresentationRuntimeLabel;
    }
> = {
    workspace: {
        section: "WS.HEADER",
        calculationsSection: "WS.HEADER_CALCULATIONS",
        dataAttr: "data-workspace-header",
        kpiIconAttr: "data-workspace-header-kpi-icon",
        kpiAria: "Workspace KPIs",
        headerLabel: PRESENTATION_RUNTIME_LABELS.workspaceHeader,
        calculationsLabel: PRESENTATION_RUNTIME_LABELS.workspaceHeaderCalculations,
    },
    "work-unit": {
        section: "WU.HEADER",
        calculationsSection: "WU.HEADER_CALCULATIONS",
        dataAttr: "data-work-unit-header",
        kpiIconAttr: "data-work-unit-header-kpi-icon",
        kpiAria: "Work unit KPIs",
        headerLabel: PRESENTATION_RUNTIME_LABELS.workUnitHeader,
        calculationsLabel: PRESENTATION_RUNTIME_LABELS.workUnitHeaderCalculations,
    },
};

const STATUS_GEM: Record<string, string> = {
    healthy: "bg-alloy-bend-pine",
    warning: "bg-alloy-gold",
    critical: "bg-alloy-ember",
    unknown: "bg-alloy-midnight/30",
};

const ACCENT_GEM: Record<ProcessCardAccent, string> = {
    pine: "bg-alloy-bend-pine",
    blue: "bg-alloy-blue",
    ember: "bg-alloy-ember",
    midnight: "bg-alloy-midnight",
    stone: "bg-alloy-stone",
    gold: "bg-alloy-gold",
};

function KpiGlyph({
    icon,
    className,
    iconAttr,
    size = "sm",
}: {
    icon: ProcessCardIcon;
    className: string;
    iconAttr: string;
    /** `sm` (work-unit compact tile) or `md` (workspace identity KPI, sits in a soft well). */
    size?: "sm" | "md";
}) {
    return (
        <ProcessCardGlyph
            icon={icon}
            className={`shrink-0 ${size === "md" ? "h-5 w-5" : "h-4 w-4"} ${className}`}
            {...{ [iconAttr]: true }}
        />
    );
}

function BuilderHit({
    field,
    builder,
    className,
    children,
}: {
    field: WorkspaceHeaderBuilderField;
    builder?: WorkspaceHeaderBuilderProps;
    className?: string;
    children: ReactNode;
}) {
    if (!builder) return <>{children}</>;
    const active = builder.activeField === field;
    return (
        <button
            type="button"
            data-builder-field={field}
            className={`${className ?? ""} rounded-md text-left transition-shadow ${
                active ? "ring-2 ring-alloy-bend-pine/50 ring-offset-2" : "hover:ring-1 hover:ring-alloy-stone/30"
            }`}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                builder.onFieldClick(field);
            }}
        >
            {children}
        </button>
    );
}

function gemClass(kpi: WorkspaceHeaderKpiVm): string {
    if (kpi.accent) return ACCENT_GEM[kpi.accent];
    return STATUS_GEM[kpi.status] ?? STATUS_GEM.unknown;
}

function HeaderKpiCard({
    kpi,
    variant,
    density = "standard",
}: {
    kpi: WorkspaceHeaderKpiVm;
    variant: SurfaceHeaderVariant;
    density?: "standard" | "compact";
}) {
    const meta = VARIANT_META[variant];
    const compact = density === "compact";
    const kpiAttr = variant === "work-unit" ? "data-work-unit-header-kpi" : "data-workspace-header-kpi";
    const valueAttr = variant === "work-unit" ? "data-work-unit-header-kpi-value" : "data-workspace-header-kpi-value";
    const labelAttr = variant === "work-unit" ? "data-work-unit-header-kpi-label" : "data-workspace-header-kpi-label";
    const statusAttr = variant === "work-unit" ? "data-work-unit-header-kpi-status" : "data-workspace-header-kpi-status";
    const iconWellAttr =
        variant === "work-unit" ? "data-work-unit-header-kpi-icon-well" : "data-workspace-header-kpi-icon-well";
    const tileClass = `flex h-full ${compact ? "min-w-[7rem] items-center gap-2 px-2.5 py-2" : "min-w-[9.5rem] items-center gap-3.5 px-4 py-3.5"} ${WS_KPI_CARD_CHROME}`;
    const body = (
        <div className={tileClass} {...{ [kpiAttr]: kpi.slot }} data-calculation-key={kpi.sourceKey ?? undefined}>
            <span
                aria-hidden
                {...{ [iconWellAttr]: true }}
                className={`inline-flex shrink-0 items-center justify-center rounded-xl ${compact ? "h-9 w-9 rounded-lg" : "h-12 w-12"} ${workspaceHeaderKpiIconWellClass(
                    { accent: kpi.accent, status: kpi.status },
                )}`}
            >
                <KpiGlyph
                    icon={kpi.icon}
                    className={`${workspaceHeaderKpiIconClass({ accent: kpi.accent, status: kpi.status })} ${compact ? "opacity-90" : ""}`}
                    iconAttr={meta.kpiIconAttr}
                    size={compact ? "sm" : "md"}
                />
            </span>
            <div className="min-w-0">
                <span
                    className={`block font-bold leading-none tracking-[-0.03em] tabular-nums text-alloy-midnight ${compact ? "text-[18px]" : "text-[26px]"}`}
                    {...{ [valueAttr]: true }}
                    data-kpi-pending={kpi.pending ? "true" : undefined}
                    aria-busy={kpi.pending || undefined}
                    aria-label={kpi.pending ? `${kpi.label} loading` : undefined}
                >
                    {kpi.pending ? (
                        // RESERVED SETTLEMENT GEOMETRY. KPI values are Settlement (U-S5): the slot is
                        // laid out at first sight and the value settles into it, so the tile never
                        // shows a "—" that then flips to a number.
                        // It does NOT animate. A pulsing slot is the operator watching the app
                        // assemble itself — certification measures it as `visible_construction`, and
                        // the budget is 0 (absolute). Reserve the space; stay quiet.
                        <span
                            aria-hidden
                            data-settlement-reserved="kpi"
                            className={`inline-block rounded-md bg-alloy-midnight/[0.06] align-middle ${compact ? "h-[18px] w-10" : "h-[26px] w-14"}`}
                        />
                    ) : (
                        kpi.formattedValue || WORKSPACE_HEADER_NO_DATA_VALUE
                    )}
                </span>
                <span className={`flex items-center gap-1.5 ${compact ? "mt-1" : "mt-2"}`}>
                    <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rotate-45 ${gemClass(kpi)}`}
                        {...{ [statusAttr]: kpi.status }}
                    />
                    <span
                        className={`truncate font-medium leading-none text-alloy-midnight/42 ${compact ? "text-[10px]" : "text-[12px]"}`}
                        {...{ [labelAttr]: true }}
                        title={kpi.label}
                    >
                        {kpi.label}
                    </span>
                </span>
            </div>
        </div>
    );

    // Metric tiles are READOUTS, never navigation. The operator navigates through Work Views (the
    // pill strip / work-view rows), not the KPI tiles — a tile that drilled to a work unit (e.g.
    // "Needs attention") invited broken routes and competed with the Work Views. `drillHref` stays
    // on the VM for calculation provenance, but the tile no longer renders as a link.
    return body;
}

export function WorkspaceHeader({
    model,
    builder,
    variant = "workspace",
    actionsSlot = null,
    workUnitDensity = "browse",
}: {
    model: WorkspaceHeaderPresentationModel;
    builder?: WorkspaceHeaderBuilderProps;
    variant?: SurfaceHeaderVariant;
    /** Operational Actions chrome — workspace / Work Unit control band (not BOS). */
    actionsSlot?: ReactNode;
    /**
     * Work Unit only: browse (full identity/KPI) vs focus (compact context bar when a record
     * is selected). Ignored for workspace variant. Orthogonal to ambient metric density.
     */
    workUnitDensity?: WorkUnitHeaderDensity;
}) {
    const meta = VARIANT_META[variant];
    const titleAttr = variant === "work-unit" ? "data-work-unit-header-title" : "data-workspace-header-title";
    const subtitleAttr = variant === "work-unit" ? "data-work-unit-header-subtitle" : "data-workspace-header-subtitle";
    const kpisAttr = variant === "work-unit" ? "data-work-unit-header-kpis" : "data-workspace-header-kpis";
    const ambientMetricDensity = useAdaptiveMetricDensity();
    const focusMode = variant === "work-unit" && workUnitDensity === "focus";
    // Focus state forces compact KPI tiles so the Focus Panel rises; ambient still applies in browse.
    const metricDensity = focusMode ? "compact" : ambientMetricDensity;
    const kpiRowClass =
        metricDensity === "compact"
            ? "flex flex-nowrap items-stretch justify-start gap-2 overflow-x-auto"
            : "flex flex-nowrap items-stretch justify-start gap-4";

    return (
        <header
            {...runtimeLabelProps(meta.headerLabel)}
            data-alloy-section={meta.section}
            {...{ [meta.dataAttr]: true }}
            data-adaptive-metric-density={metricDensity}
            {...(variant === "work-unit"
                ? { "data-work-unit-header-mode": workUnitDensity }
                : {})}
            className={
                variant === "work-unit"
                    ? focusMode
                        ? "flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
                        : "flex flex-wrap items-start justify-between gap-x-6 gap-y-2"
                    : // Workspace: title owns the left half; the KPI region anchors at the ~50%
                      // center point and flows RIGHT (left-aligned from that anchor, never stretched).
                      "flex flex-col gap-y-5 lg:grid lg:grid-cols-2 lg:items-center lg:gap-x-8"
            }
        >
            <div
                className={`min-w-0 ${focusMode ? "max-w-2xl" : "max-w-xl"} ${
                    variant === "work-unit" ? `flex ${focusMode ? "items-center gap-2" : "items-start gap-3"}` : ""
                }`}
            >
                {variant === "work-unit" && model.identityIcon ? (
                    <span
                        aria-hidden
                        data-work-unit-header-identity-chip
                        className={`inline-flex shrink-0 items-center justify-center rounded-xl ${
                            focusMode ? "h-8 w-8 rounded-lg" : "h-11 w-11"
                        } ${processTileIdentityWellClass(model.identityAccent)} ${model.identityAccent ? workspaceHeaderKpiIconClass({ accent: model.identityAccent, status: "unknown" }) : "text-alloy-midnight/50"}`}
                    >
                        <ProcessCardGlyph
                            icon={model.identityIcon}
                            className={focusMode ? "h-3.5 w-3.5" : "h-5 w-5"}
                        />
                    </span>
                ) : null}
                <div className={`min-w-0 flex-1 ${focusMode ? "flex flex-wrap items-baseline gap-x-2 gap-y-0" : ""}`}>
                <BuilderHit field="title" builder={builder} className="block w-full min-w-0">
                    <h1
                        {...{ [titleAttr]: true }}
                        className={`leading-tight tracking-[-0.02em] text-alloy-midnight ${
                            variant === "work-unit"
                                ? focusMode
                                    ? "text-[18px] font-semibold"
                                    : "text-[28px] font-semibold"
                                : "text-[26px] font-semibold"
                        }`}
                    >
                        {model.title}
                    </h1>
                </BuilderHit>
                {model.subtitle ? (
                    <BuilderHit
                        field="subtitle"
                        builder={builder}
                        className={`block min-w-0 ${focusMode ? "mt-0" : "mt-0.5 w-full"}`}
                    >
                        <p
                            {...{ [subtitleAttr]: true }}
                            className={`leading-snug text-alloy-bend-pine ${
                                variant === "work-unit"
                                    ? focusMode
                                        ? "truncate text-[12px] font-medium text-alloy-midnight/55"
                                        : "text-[14px] font-medium"
                                    : "text-[15px] font-semibold"
                            }`}
                        >
                            {model.subtitle}
                        </p>
                    </BuilderHit>
                ) : builder ? (
                    <BuilderHit field="subtitle" builder={builder} className="mt-0.5 block w-full">
                        <p className="text-[14px] italic text-alloy-midnight/35">Add subtitle…</p>
                    </BuilderHit>
                ) : null}
                </div>
            </div>

            <div
                className={
                    variant === "work-unit"
                        ? `flex min-w-0 flex-wrap items-center justify-end ${focusMode ? "gap-2" : "gap-3"}`
                        : "flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-end"
                }
                data-workspace-header-control-band="true"
            >
                {model.kpis.length > 0 && !focusMode ? (
                    <div
                        {...runtimeLabelProps(meta.calculationsLabel)}
                        data-alloy-section={meta.calculationsSection}
                        {...{ [kpisAttr]: true }}
                        data-adaptive-metric-row
                        className={kpiRowClass}
                        role="list"
                        aria-label={meta.kpiAria}
                    >
                        {model.kpis.map((kpi) => (
                            <BuilderHit
                                key={kpi.slot}
                                field={`kpi-${kpi.slot as 1 | 2 | 3 | 4 | 5}`}
                                builder={builder}
                                className="block h-full min-w-0 shrink-0"
                            >
                                <div role="listitem" className="h-full min-w-0">
                                    <HeaderKpiCard kpi={kpi} variant={variant} density={metricDensity} />
                                </div>
                            </BuilderHit>
                        ))}
                    </div>
                ) : null}
                {model.kpis.length > 0 && focusMode ? (
                    <div
                        {...runtimeLabelProps(meta.calculationsLabel)}
                        data-alloy-section={meta.calculationsSection}
                        {...{ [kpisAttr]: true }}
                        data-work-unit-header-kpi-inline="true"
                        className="flex max-w-xl flex-nowrap items-center gap-x-3 overflow-x-auto text-[11px] text-alloy-midnight/55"
                        role="list"
                        aria-label={meta.kpiAria}
                    >
                        {model.kpis.map((kpi) => (
                            <span
                                key={kpi.slot}
                                role="listitem"
                                data-work-unit-header-kpi={kpi.slot}
                                className="inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap"
                                title={kpi.label}
                            >
                                <span className="font-semibold tabular-nums text-alloy-midnight/80">
                                    {kpi.pending ? "…" : kpi.formattedValue || WORKSPACE_HEADER_NO_DATA_VALUE}
                                </span>
                                <span className="truncate font-medium text-alloy-midnight/40">{kpi.label}</span>
                            </span>
                        ))}
                    </div>
                ) : null}
                {actionsSlot}
            </div>
        </header>
    );
}

/** Shared workspace / work-unit KPI tile — reuse outside presentation runtime headers. */
export { HeaderKpiCard as SurfaceHeaderKpiCard };
