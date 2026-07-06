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
} from "@/components/presentation/runtimeLabels";
import { workspaceHeaderKpiIconClass } from "@/lib/presentation/runtime/processCardAccentStyles";
import type { ProcessCardAccent, ProcessCardIcon } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type {
    WorkspaceHeaderKpiVm,
    WorkspaceHeaderPresentationModel,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import { WORKSPACE_HEADER_NO_DATA_VALUE } from "@/lib/presentation/runtime/workspaceHeaderCards";

export type WorkspaceHeaderBuilderField =
    | "title"
    | "subtitle"
    | `kpi-${1 | 2 | 3 | 4 | 5}`;

export type WorkspaceHeaderBuilderProps = {
    activeField: WorkspaceHeaderBuilderField | null;
    onFieldClick: (field: WorkspaceHeaderBuilderField) => void;
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

const ICON_GLYPH: Record<ProcessCardIcon, ReactNode> = {
    grid: <path d="M5 5h4v4H5zM11 5h4v4h-4zM5 11h4v4H5zM11 11h4v4h-4z" />,
    spark: <path d="M10 3l1.2 4.2L15 8l-3.8 1.2L10 14l-1.2-4.8L5 8l3.8-0.8L10 3z" />,
    route: <path d="M4 6c0-1.1 1-2 2.2-2 1.5 0 2.5 1.2 2.8 2.6M16 14c0 1.1-1 2-2.2 2-1.5 0-2.5-1.2-2.8-2.6M6.5 8.5l7 3M6.5 11.5l7-3" />,
    users: <path d="M7 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 15a4 4 0 018 0M13 6v4M11 8h4" />,
    calendar: <path d="M4 6h12v10H4zM4 6l0-2M16 6l0-2M4 9h12" />,
    clipboard: <path d="M7 4h6v2H7zM5 6h10v10H5z" />,
    chart: <path d="M5 14V8M10 14V5M15 14v-4" />,
    message: <path d="M4 5h12v8H8l-4 3V5z" />,
    shield: <path d="M10 3l6 2v5c0 3.5-2.5 5.8-6 7-3.5-1.2-6-3.5-6-7V5l6-2z" />,
    book: <path d="M6 4h8v12H6zM6 4c0 0 2-1 4-1s4 1 4 1" />,
    bolt: <path d="M11 3L6 11h4l-1 6 6-9h-4l0-5z" />,
    layers: <path d="M10 4l7 3.5L10 11 3 7.5 10 4zM3 12.5L10 16l7-3.5M3 16.5L10 20l7-3.5" />,
};

function KpiGlyph({ icon, className }: { icon: ProcessCardIcon; className: string }) {
    return (
        <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 shrink-0 ${className}`}
            data-workspace-header-kpi-icon
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            {ICON_GLYPH[icon]}
        </svg>
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
}: {
    kpi: WorkspaceHeaderKpiVm;
    /** False in the builder (parent owns clicks). */
    interactive: boolean;
}) {
    const body = (
        <div className="min-w-[6.5rem]" data-workspace-header-kpi={kpi.slot} data-calculation-key={kpi.sourceKey ?? undefined}>
            <div className="flex items-center gap-2">
                <KpiGlyph
                    icon={kpi.icon}
                    className={workspaceHeaderKpiIconClass({ accent: kpi.accent, status: kpi.status })}
                />
                <span
                    className="text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums text-alloy-midnight"
                    data-workspace-header-kpi-value
                >
                    {kpi.formattedValue || WORKSPACE_HEADER_NO_DATA_VALUE}
                </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
                <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rotate-45 ${gemClass(kpi)}`}
                    data-workspace-header-kpi-status={kpi.status}
                />
                <span
                    className="truncate text-[12px] font-medium leading-none text-alloy-midnight/50"
                    data-workspace-header-kpi-label
                    title={kpi.label}
                >
                    {kpi.label}
                </span>
            </div>
        </div>
    );

    if (interactive && kpi.drillHref) {
        return (
            <Link
                href={kpi.drillHref}
                className="block no-underline transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-bend-pine/50"
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
}: {
    model: WorkspaceHeaderPresentationModel;
    builder?: WorkspaceHeaderBuilderProps;
}) {
    return (
        <header
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workspaceHeader)}
            data-alloy-section="WS.HEADER"
            data-workspace-header="true"
            className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4"
        >
            <div className="min-w-0 max-w-xl">
                <BuilderHit field="title" builder={builder} className="block w-full">
                    <h1
                        data-workspace-header-title
                        className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-alloy-midnight"
                    >
                        {model.title}
                    </h1>
                </BuilderHit>
                {model.subtitle ? (
                    <BuilderHit field="subtitle" builder={builder} className="mt-1 block w-full">
                        <p
                            data-workspace-header-subtitle
                            className="text-[15px] font-semibold leading-snug text-alloy-bend-pine"
                        >
                            {model.subtitle}
                        </p>
                    </BuilderHit>
                ) : builder ? (
                    <BuilderHit field="subtitle" builder={builder} className="mt-1 block w-full">
                        <p className="text-[15px] italic text-alloy-midnight/35">Add subtitle…</p>
                    </BuilderHit>
                ) : null}
            </div>

            {model.kpis.length > 0 ? (
                <div
                    {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workspaceHeaderCalculations)}
                    data-alloy-section="WS.HEADER_CALCULATIONS"
                    data-workspace-header-kpis
                    className="flex flex-wrap items-start gap-x-8 gap-y-4"
                    role="list"
                    aria-label="Workspace KPIs"
                >
                    {model.kpis.map((kpi) => (
                        <BuilderHit
                            key={kpi.slot}
                            field={`kpi-${kpi.slot as 1 | 2 | 3 | 4 | 5}`}
                            builder={builder}
                            className="block"
                        >
                            <div role="listitem">
                                <HeaderKpiCard kpi={kpi} interactive={!builder} />
                            </div>
                        </BuilderHit>
                    ))}
                </div>
            ) : null}
        </header>
    );
}
