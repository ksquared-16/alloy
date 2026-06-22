"use client";

import { GLOBAL_WIDGET_CATALOG } from "@/lib/layout/fieldCatalog";
import { layoutBuilderWidgetOptionsForSurface } from "@/lib/layout/layoutBuilderPaletteModel";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";

type Props = {
    disabled?: boolean;
    surfaceKey?: DrawerLayoutEditorSurfaceKey;
    onPickWidget: (widgetKey: string) => void;
};

export default function OpportunityDrawerLayoutWidgetPicker({
    disabled = false,
    surfaceKey = "opportunity_drawer",
    onPickWidget,
}: Props) {
    const allowedKeys = new Set(layoutBuilderWidgetOptionsForSurface(surfaceKey).map((w) => w.key));
    const widgets = GLOBAL_WIDGET_CATALOG.filter(
        (w) =>
            allowedKeys.has(w.widgetKey)
            && (!w.relevantSurfaces?.length || w.relevantSurfaces.includes("drawer")),
    );

    return (
        <div className="rounded-md border border-alloy-forge/15 bg-white p-2" data-testid="visual-editor-widget-picker">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Pick widget</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
                {widgets.map((widget) => (
                    <li key={widget.widgetKey}>
                        <button
                            type="button"
                            disabled={disabled}
                            className="w-full rounded px-2 py-1 text-left text-[11px] hover:bg-alloy-pine/[0.06] disabled:opacity-40"
                            onClick={() => onPickWidget(widget.widgetKey)}
                            data-testid={`visual-editor-pick-widget-${widget.widgetKey}`}
                        >
                            <span className="font-medium text-alloy-midnight">{widget.label}</span>
                            <span className="mt-0.5 block text-[10px] text-alloy-midnight/45">{widget.description}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
