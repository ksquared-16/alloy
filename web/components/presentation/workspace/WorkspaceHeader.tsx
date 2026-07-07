/**
 * Presentation Runtime V2 — WS.HEADER.
 *
 * Configurable workspace identity (title + subtitle) and 3–5 org-level KPI cards.
 * Pure presentation — receives the resolved header model from WorkspaceSurface / builder.
 * Builder and runtime share this component for parity.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
    type PresentationRuntimeLabel,
} from "@/components/presentation/runtimeLabels";
import {
    workspaceHeaderKpiIconClass,
    workspaceHeaderKpiIconWellClass,
} from "@/lib/presentation/runtime/processCardAccentStyles";
import type { ProcessCardAccent, ProcessCardIcon } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type {
    WorkspaceHeaderKpiVm,
    WorkspaceHeaderPresentationModel,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import { WORKSPACE_HEADER_NO_DATA_VALUE } from "@/lib/presentation/runtime/workspaceHeaderCards";
import { ProcessCardGlyph } from "./ProcessCardGlyph";

export type WorkspaceHeaderBuilderField =
    | "title"
    | "subtitle"
    | `kpi-${1 | 2 | 3 | 4 | 5}`;

export type WorkspaceHeaderBuilderProps = {
    activeField: WorkspaceHeaderBuilderField | null;
    onFieldClick: (field: WorkspaceHeaderBuilderField) => void;
};

export type SurfaceHeaderVariant = "workspace" | "work-unit";

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
    interactive,
    variant,
}: {
    kpi: WorkspaceHeaderKpiVm;
    /** False in the builder (parent owns clicks). */
    interactive: boolean;
    variant: SurfaceHeaderVariant;
}) {
    const meta = VARIANT_META[variant];
    const kpiAttr = variant === "work-unit" ? "data-work-unit-header-kpi" : "data-workspace-header-kpi";
    const valueAttr = variant === "work-unit" ? "data-work-unit-header-kpi-value" : "data-workspace-header-kpi-value";
    const labelAttr = variant === "work-unit" ? "data-work-unit-header-kpi-label" : "data-workspace-header-kpi-label";
    const statusAttr = variant === "work-unit" ? "data-work-unit-header-kpi-status" : "data-workspace-header-kpi-status";
    // Work Unit KPIs are compact bordered metadata tiles with equal rhythm.
    // Workspace identity KPIs stay open (no tile chrome) so this shared header
    // only applies the work-unit structure when used on the process surface.
    // Work Unit KPIs are compact bordered metadata tiles; Workspace identity KPIs get a premium
    // card treatment (soft border/shadow + a larger glyph in an Alloy-token icon well).
    const tileClass =
        variant === "work-unit"
            ? "flex h-full w-full min-w-0 flex-col justify-center rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.02] px-3 py-2 shadow-[0_1px_1px_rgba(15,23,42,0.03)]"
            : "flex h-full min-w-[9.5rem] items-center gap-3.5 rounded-xl border border-alloy-stone/12 bg-white px-4 py-3.5";
    const body =
        variant === "work-unit" ? (
            <div className={tileClass} {...{ [kpiAttr]: kpi.slot }} data-calculation-key={kpi.sourceKey ?? undefined}>
                <div className="flex items-center gap-2">
                    <KpiGlyph
                        icon={kpi.icon}
                        className={workspaceHeaderKpiIconClass({ accent: kpi.accent, status: kpi.status })}
                        iconAttr={meta.kpiIconAttr}
                    />
                    <span
                        className="text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-alloy-midnight"
                        {...{ [valueAttr]: true }}
                    >
                        {kpi.formattedValue || WORKSPACE_HEADER_NO_DATA_VALUE}
                    </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rotate-45 ${gemClass(kpi)}`}
                        {...{ [statusAttr]: kpi.status }}
                    />
                    <span
                        className="truncate text-[12px] font-medium leading-none text-alloy-midnight/50"
                        {...{ [labelAttr]: true }}
                        title={kpi.label}
                    >
                        {kpi.label}
                    </span>
                </div>
            </div>
        ) : (
            <div className={tileClass} {...{ [kpiAttr]: kpi.slot }} data-calculation-key={kpi.sourceKey ?? undefined}>
                <span
                    aria-hidden
                    data-workspace-header-kpi-icon-well
                    className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${workspaceHeaderKpiIconWellClass(
                        { accent: kpi.accent, status: kpi.status },
                    )}`}
                >
                    <KpiGlyph
                        icon={kpi.icon}
                        className={workspaceHeaderKpiIconClass({ accent: kpi.accent, status: kpi.status })}
                        iconAttr={meta.kpiIconAttr}
                        size="md"
                    />
                </span>
                <div className="min-w-0">
                    <span
                        className="block text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums text-alloy-midnight"
                        {...{ [valueAttr]: true }}
                    >
                        {kpi.formattedValue || WORKSPACE_HEADER_NO_DATA_VALUE}
                    </span>
                    <span className="mt-2 flex items-center gap-1.5">
                        <span
                            aria-hidden
                            className={`h-2 w-2 shrink-0 rotate-45 ${gemClass(kpi)}`}
                            {...{ [statusAttr]: kpi.status }}
                        />
                        <span
                            className="truncate text-[12px] font-medium leading-none text-alloy-midnight/50"
                            {...{ [labelAttr]: true }}
                            title={kpi.label}
                        >
                            {kpi.label}
                        </span>
                    </span>
                </div>
            </div>
        );

    if (interactive && kpi.drillHref) {
        return (
            <Link
                href={kpi.drillHref}
                className="block h-full no-underline transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-bend-pine/50"
            >
                {body}
            </Link>
        );
    }
    return body;
}

export function WorkspaceHeader({
    model,
    builder,
    variant = "workspace",
}: {
    model: WorkspaceHeaderPresentationModel;
    builder?: WorkspaceHeaderBuilderProps;
    variant?: SurfaceHeaderVariant;
}) {
    const meta = VARIANT_META[variant];
    const titleAttr = variant === "work-unit" ? "data-work-unit-header-title" : "data-workspace-header-title";
    const subtitleAttr = variant === "work-unit" ? "data-work-unit-header-subtitle" : "data-workspace-header-subtitle";
    const kpisAttr = variant === "work-unit" ? "data-work-unit-header-kpis" : "data-workspace-header-kpis";

    return (
        <header
            {...runtimeLabelProps(meta.headerLabel)}
            data-alloy-section={meta.section}
            {...{ [meta.dataAttr]: true }}
            className={
                variant === "work-unit"
                    ? "flex flex-wrap items-start justify-between gap-x-6 gap-y-2"
                    : // Workspace: title owns the left half; the KPI region anchors at the ~50%
                      // center point and flows RIGHT (left-aligned from that anchor, never stretched).
                      "flex flex-col gap-y-5 lg:grid lg:grid-cols-2 lg:items-center lg:gap-x-8"
            }
        >
            <div className="min-w-0 max-w-xl">
                <BuilderHit field="title" builder={builder} className="block w-full">
                    <h1
                        {...{ [titleAttr]: true }}
                        className={`font-bold leading-tight tracking-[-0.02em] text-alloy-midnight ${
                            variant === "work-unit" ? "text-[24px]" : "text-[26px]"
                        }`}
                    >
                        {model.title}
                    </h1>
                </BuilderHit>
                {model.subtitle ? (
                    <BuilderHit field="subtitle" builder={builder} className="mt-0.5 block w-full">
                        <p
                            {...{ [subtitleAttr]: true }}
                            className={`font-semibold leading-snug text-alloy-bend-pine ${
                                variant === "work-unit" ? "text-[14px]" : "text-[15px]"
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

            {model.kpis.length > 0 ? (
                <div
                    {...runtimeLabelProps(meta.calculationsLabel)}
                    data-alloy-section={meta.calculationsSection}
                    {...{ [kpisAttr]: true }}
                    className={
                        variant === "work-unit"
                            ? "grid w-full max-w-xl flex-1 auto-cols-fr grid-flow-col gap-2 sm:max-w-none"
                            : // Cards flow from the center anchor rightward, left-aligned, wrapping
                              // as needed — never stretched across the full row.
                              "flex flex-wrap items-stretch justify-start gap-4"
                    }
                    role="list"
                    aria-label={meta.kpiAria}
                >
                    {model.kpis.map((kpi) => (
                        <BuilderHit
                            key={kpi.slot}
                            field={`kpi-${kpi.slot as 1 | 2 | 3 | 4 | 5}`}
                            builder={builder}
                            className="block h-full min-w-0"
                        >
                            <div role="listitem" className="h-full min-w-0">
                                <HeaderKpiCard kpi={kpi} interactive={!builder} variant={variant} />
                            </div>
                        </BuilderHit>
                    ))}
                </div>
            ) : null}
        </header>
    );
}
