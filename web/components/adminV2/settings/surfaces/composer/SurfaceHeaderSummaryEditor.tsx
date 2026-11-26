"use client";

import {
    SURFACE_COMPOSER_INSPECTOR_ATTR,
    SURFACE_FIELD_INSPECTOR_ATTRS,
    SURFACE_HEADER_RENDERER_KEYS,
    SURFACE_HEADER_RENDERER_LABELS,
    addSurfaceHeaderRenderer,
    moveSurfaceHeaderRenderer,
    removeSurfaceHeaderRenderer,
    updateSurfaceHeaderRenderer,
    type SurfaceHeaderRendererPlacement,
    type SurfaceHeaderSummaryConfig,
} from "@/lib/adminV2/settings/surfaces/surfaceComposer";

type Props = {
    config: SurfaceHeaderSummaryConfig;
    selectedId: string | null;
    sectionTitle?: string;
    onSelect: (id: string | null) => void;
    onChange: (next: SurfaceHeaderSummaryConfig) => void;
    onOpenLibrary: () => void;
};

const VISIBILITY_OPTIONS = [
    { value: "always" as const, label: "Always show" },
    { value: "hide_when_empty" as const, label: "Hide when empty" },
    { value: "show_when_exists" as const, label: "Show when data exists" },
];

/**
 * Shared header summary composer — configurable compact line beneath the record title.
 * Used by Focus Panel today; reusable for Drawer, Workspace, and other header surfaces.
 */
export default function SurfaceHeaderSummaryEditor({
    config,
    selectedId,
    sectionTitle = "Header Summary",
    onSelect,
    onChange,
    onOpenLibrary,
}: Props) {
    const selected = config.renderers.find((r) => r.id === selectedId) ?? null;

    return (
        <div className="space-y-3" {...{ [SURFACE_COMPOSER_INSPECTOR_ATTR]: "header-summary" }} data-surface-header-summary-editor="true">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{sectionTitle}</p>
                <button type="button" onClick={onOpenLibrary} className="config-secondary-btn text-xs" data-canvas-add-field="header-summary">
                    + Add renderer
                </button>
            </div>

            <div
                className="min-h-[2.5rem] cursor-pointer rounded-md border border-dashed border-alloy-stone/25 bg-alloy-stone/[0.03] px-3 py-2"
                data-surface-header-summary-canvas="true"
                onClick={() => {
                    if (config.renderers.length === 0) onOpenLibrary();
                }}
            >
                {config.renderers.length === 0 ? (
                    <p className="text-[12px] text-alloy-midnight/45">Click to compose the header summary line.</p>
                ) : (
                    <div className="flex flex-wrap gap-1">
                        {config.renderers.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelect(r.id);
                                }}
                                className={[
                                    "rounded px-1.5 py-0.5 text-[11px] font-medium",
                                    selectedId === r.id
                                        ? "bg-alloy-pine/[0.1] text-alloy-pine ring-1 ring-alloy-pine/40"
                                        : "bg-white text-alloy-midnight/80 ring-1 ring-alloy-stone/20 hover:ring-alloy-pine/30",
                                ].join(" ")}
                                {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.canvasField]: r.rendererKey }}
                                {...(selectedId === r.id ? { [SURFACE_FIELD_INSPECTOR_ATTRS.canvasFieldSelected]: true } : {})}
                            >
                                {SURFACE_HEADER_RENDERER_LABELS[r.rendererKey]}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selected ?
                <HeaderRendererInspector
                    placement={selected}
                    onChange={(patch) => onChange(updateSurfaceHeaderRenderer(config, selected.id, patch))}
                    onMoveEarlier={() => onChange(moveSurfaceHeaderRenderer(config, selected.id, "earlier"))}
                    onMoveLater={() => onChange(moveSurfaceHeaderRenderer(config, selected.id, "later"))}
                    onRemove={() => {
                        onChange(removeSurfaceHeaderRenderer(config, selected.id));
                        onSelect(null);
                    }}
                />
            :   null}
        </div>
    );
}

function HeaderRendererInspector({
    placement,
    onChange,
    onMoveEarlier,
    onMoveLater,
    onRemove,
}: {
    placement: SurfaceHeaderRendererPlacement;
    onChange: (patch: Partial<Omit<SurfaceHeaderRendererPlacement, "id">>) => void;
    onMoveEarlier: () => void;
    onMoveLater: () => void;
    onRemove: () => void;
}) {
    return (
        <div className="rounded-md border border-alloy-stone/15 bg-white p-3" data-surface-header-renderer-inspector="true">
            <p className="config-typo-sublabel mb-2">Renderer</p>
            <select
                value={placement.rendererKey}
                onChange={(e) => onChange({ rendererKey: e.target.value as typeof placement.rendererKey })}
                className="mb-3 w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
            >
                {SURFACE_HEADER_RENDERER_KEYS.map((key) => (
                    <option key={key} value={key}>
                        {SURFACE_HEADER_RENDERER_LABELS[key]}
                    </option>
                ))}
            </select>

            <p className="config-typo-sublabel mb-1">Label prefix (optional)</p>
            <input
                type="text"
                value={placement.labelPrefix ?? ""}
                onChange={(e) => onChange({ labelPrefix: e.target.value || null })}
                placeholder="e.g. Children:"
                className="mb-3 w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
            />

            <p className="config-typo-sublabel mb-1">Visibility</p>
            <div className="mb-3 flex flex-wrap gap-1">
                {VISIBILITY_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange({ visibility: opt.value })}
                        className={[
                            "rounded-md border px-2 py-1 text-[11px] font-medium",
                            (placement.visibility ?? "hide_when_empty") === opt.value
                                ? "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine"
                                : "border-alloy-stone/20 text-alloy-midnight/70",
                        ].join(" ")}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onMoveEarlier} className="config-secondary-btn text-xs">Move earlier</button>
                <button type="button" onClick={onMoveLater} className="config-secondary-btn text-xs">Move later</button>
                <button type="button" onClick={onRemove} className="rounded-md border border-alloy-ember/25 px-2 py-1 text-xs font-medium text-alloy-ember">Remove</button>
            </div>
        </div>
    );
}

export { addSurfaceHeaderRenderer };
