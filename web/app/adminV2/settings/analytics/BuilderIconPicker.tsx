"use client";

import type { LucideIcon } from "lucide-react";
import {
    Activity,
    AlertTriangle,
    BarChart3,
    Building2,
    Calendar,
    CheckCircle2,
    ClipboardList,
    DollarSign,
    Gauge,
    Users,
} from "lucide-react";
import { PLATFORM_BUILDER_SELECT } from "@/app/adminV2/settings/analytics/platformBuilderUi";

/**
 * Category/style icons only. Trend direction (up/down) is computed from metric
 * history at render time, so operators never pick a static "trending up" glyph.
 */
export const BUILDER_ICON_OPTIONS: { key: string; label: string; Icon: LucideIcon }[] = [
    { key: "users", label: "Users", Icon: Users },
    { key: "calendar", label: "Calendar", Icon: Calendar },
    { key: "clipboard", label: "Clipboard", Icon: ClipboardList },
    { key: "check-circle", label: "Check circle", Icon: CheckCircle2 },
    { key: "alert-triangle", label: "Alert triangle", Icon: AlertTriangle },
    { key: "dollar-sign", label: "Dollar sign", Icon: DollarSign },
    { key: "building", label: "Building", Icon: Building2 },
    { key: "activity", label: "Activity", Icon: Activity },
    { key: "bar-chart", label: "Bar chart", Icon: BarChart3 },
    { key: "gauge", label: "Gauge", Icon: Gauge },
];

export function BuilderIconPicker({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (key: string) => void;
    disabled?: boolean;
}) {
    const selected = BUILDER_ICON_OPTIONS.find((o) => o.key === value);

    return (
        <div className="mt-1 flex items-center gap-2">
            <select
                className={`${PLATFORM_BUILDER_SELECT} flex-1`}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
            >
                <option value="">No icon</option>
                {BUILDER_ICON_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                        {opt.label}
                    </option>
                ))}
            </select>
            {selected ?
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-alloy-stone/25 bg-white text-alloy-midnight/70">
                    <selected.Icon className="h-4 w-4" aria-hidden />
                </span>
            :   null}
        </div>
    );
}
