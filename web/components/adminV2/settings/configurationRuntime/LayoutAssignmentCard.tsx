"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    BUSINESS_PROCESS_LENS_OPEN_LAYOUTS,
    BUSINESS_PROCESS_PRESENTATION_CHANGE,
    BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_EXPLANATION,
    BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_LABEL,
    BUSINESS_PROCESS_PRESENTATION_UNPUBLISHED_WARNING,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import { formatLayoutTitleWithVersion } from "@/lib/layout/layoutVersionNaming";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import { ConfigRuntimeMutedDetail } from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimePrimitives";

function layoutStatusChip(
    usingDefault: boolean,
    record: EntityLayoutRecord | null,
): { label: "Default" | "Published" | "Draft"; className: string } {
    if (usingDefault || !record) {
        return {
            label: "Default",
            className: "border-alloy-forge/12 bg-alloy-stone/[0.04] text-alloy-midnight/55",
        };
    }
    if (record.status === "published") {
        return {
            label: "Published",
            className: "border-alloy-pine/25 bg-alloy-pine/[0.08] text-alloy-pine",
        };
    }
    return {
        label: "Draft",
        className: "border-amber-200/80 bg-amber-50/80 text-amber-900/85",
    };
}

export default function LayoutAssignmentCard({
    title,
    subtitle,
    selectedId,
    assignedRecord,
    options,
    allLayouts = [],
    layoutsHref = LAYOUTS_SETTINGS_HREF,
    onChange,
    testIdPrefix,
}: {
    title: string;
    subtitle: string;
    preview?: React.ReactNode;
    selectedId: string;
    assignedRecord: EntityLayoutRecord | null;
    options: EntityLayoutRecord[];
    allLayouts?: EntityLayoutRecord[];
    layoutsHref?: string;
    onChange: (layoutId: string) => void;
    testIdPrefix: string;
}) {
    const [changing, setChanging] = useState(false);
    const usingDefault = !selectedId.trim();
    const displayName =
        assignedRecord ?
            formatLayoutTitleWithVersion(assignedRecord.name, assignedRecord.version)
        :   BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_LABEL;

    const fullRecord =
        assignedRecord ?? (selectedId ? allLayouts.find((l) => l.id === selectedId) ?? null : null);
    const unpublished =
        fullRecord && fullRecord.status !== "published"
            ? fullRecord
            :   selectedId && !options.some((o) => o.id === selectedId)
              ? fullRecord
              :   null;
    const chip = layoutStatusChip(usingDefault, fullRecord);

    useEffect(() => {
        if (usingDefault) setChanging(false);
    }, [usingDefault]);

    return (
        <div className="config-runtime-assignment-card !p-3" data-testid={`${testIdPrefix}-assignment-card`}>
            <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-alloy-midnight">{title}</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-alloy-midnight/55">{subtitle}</p>
                    </div>
                    <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${chip.className}`}
                        data-testid={`${testIdPrefix}-status-chip`}
                    >
                        {chip.label}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {changing || usingDefault ?
                        <select
                            value={selectedId}
                            onChange={(e) => {
                                onChange(e.target.value);
                                if (e.target.value) setChanging(false);
                            }}
                            className="config-runtime-select min-w-[12rem] flex-1 text-sm"
                            data-testid={`${testIdPrefix}-select`}
                        >
                            <option value="">{BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_LABEL}</option>
                            {options.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {formatLayoutTitleWithVersion(opt.name, opt.version)}
                                </option>
                            ))}
                        </select>
                    :   <p
                            className={`min-w-0 flex-1 text-sm font-semibold ${usingDefault ? "text-alloy-midnight/70" : "text-alloy-pine"}`}
                            data-testid={`${testIdPrefix}-assigned-name`}
                        >
                            {displayName}
                        </p>
                    }
                    {!changing && !usingDefault ?
                        <button
                            type="button"
                            onClick={() => setChanging(true)}
                            className="rounded-lg border border-alloy-pine/35 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-pine hover:bg-alloy-pine/[0.05]"
                            data-testid={`${testIdPrefix}-change`}
                        >
                            {BUSINESS_PROCESS_PRESENTATION_CHANGE}
                        </button>
                    :   null}
                    <Link
                        href={layoutsHref}
                        className="rounded-lg border border-alloy-forge/15 px-2.5 py-1 text-[11px] font-medium text-alloy-pine hover:bg-alloy-pine/[0.04]"
                        data-testid={`${testIdPrefix}-open-layouts`}
                    >
                        {BUSINESS_PROCESS_LENS_OPEN_LAYOUTS} →
                    </Link>
                </div>

                {usingDefault ?
                    <ConfigRuntimeMutedDetail>{BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_EXPLANATION}</ConfigRuntimeMutedDetail>
                :   null}
                {unpublished ?
                    <p
                        className="text-[10px] font-medium text-amber-800"
                        data-testid={`${testIdPrefix}-unpublished-warning`}
                    >
                        {BUSINESS_PROCESS_PRESENTATION_UNPUBLISHED_WARNING}
                    </p>
                :   null}
            </div>
        </div>
    );
}
