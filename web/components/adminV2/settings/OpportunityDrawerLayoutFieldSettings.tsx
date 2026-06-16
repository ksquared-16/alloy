"use client";

import { LAYOUT_ADORNMENT_ICONS } from "@/lib/layout/layoutV2";
import {
    LAYOUT_EDITOR_DISPLAY_TYPES,
    LAYOUT_LINK_BEHAVIORS,
    LAYOUT_TYPOGRAPHY_INTENTS,
    type LayoutEditorDisplayConfig,
} from "@/lib/layout/layoutEditorDisplayConfig";
import {
    LAYOUT_EDITOR_VISIBILITY_PRESETS,
    type LayoutEditorVisibilityRule,
} from "@/lib/layout/layoutEditorVisibilityRules";
import type { LayoutEditorFieldNode } from "@/lib/layout/layoutEditorCompositionModel";

type Props = {
    node: LayoutEditorFieldNode;
    onChange: (patch: {
        label?: string;
        display?: LayoutEditorDisplayConfig;
        visibility?: LayoutEditorVisibilityRule;
    }) => void;
    onClose: () => void;
};

export default function OpportunityDrawerLayoutFieldSettings({ node, onChange, onClose }: Props) {
    const display = node.displayConfig;

    return (
        <div className="rounded-lg border border-alloy-forge/12 bg-white p-3 shadow-sm" data-testid="visual-editor-field-settings">
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-alloy-midnight">{node.title}</p>
                <button type="button" className="text-[11px] text-alloy-midnight/50 hover:text-alloy-pine" onClick={onClose}>
                    Close
                </button>
            </div>

            <label className="block text-[11px] text-alloy-midnight/60">
                Label override
                <input
                    type="text"
                    defaultValue={node.title}
                    onBlur={(e) => onChange({ label: e.target.value })}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-label"
                />
            </label>

            <label className="mt-2 flex items-center gap-2 text-[11px] text-alloy-midnight/70">
                <input
                    type="checkbox"
                    checked={display.showLabel !== false}
                    onChange={(e) => onChange({ display: { showLabel: e.target.checked } })}
                    data-testid="visual-editor-field-show-label"
                />
                Show label
            </label>

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Display type
                <select
                    value={display.displayType ?? "text"}
                    onChange={(e) => onChange({ display: { displayType: e.target.value as LayoutEditorDisplayConfig["displayType"] } })}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-display-type"
                >
                    {LAYOUT_EDITOR_DISPLAY_TYPES.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </label>

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Icon
                <select
                    value={display.icon ?? ""}
                    onChange={(e) => onChange({ display: { icon: (e.target.value || undefined) as LayoutEditorDisplayConfig["icon"] } })}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-icon"
                >
                    <option value="">None</option>
                    {LAYOUT_ADORNMENT_ICONS.map((icon) => (
                        <option key={icon} value={icon}>
                            {icon}
                        </option>
                    ))}
                </select>
            </label>

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Typography
                <select
                    value={display.typographyIntent ?? "primary"}
                    onChange={(e) =>
                        onChange({ display: { typographyIntent: e.target.value as LayoutEditorDisplayConfig["typographyIntent"] } })
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-typography"
                >
                    {LAYOUT_TYPOGRAPHY_INTENTS.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </label>

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Empty state
                <input
                    type="text"
                    value={display.emptyState ?? ""}
                    placeholder="No phone number"
                    onChange={(e) => onChange({ display: { emptyState: e.target.value } })}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-empty-state"
                />
            </label>

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Helper text
                <input
                    type="text"
                    value={display.helperText ?? ""}
                    onChange={(e) => onChange({ display: { helperText: e.target.value } })}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-helper-text"
                />
            </label>

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Link behavior
                <select
                    value={display.linkBehavior ?? "none"}
                    onChange={(e) =>
                        onChange({ display: { linkBehavior: e.target.value as LayoutEditorDisplayConfig["linkBehavior"] } })
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-link-behavior"
                >
                    {LAYOUT_LINK_BEHAVIORS.map((b) => (
                        <option key={b} value={b}>
                            {b}
                        </option>
                    ))}
                </select>
            </label>

            <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                Visibility
                <select
                    value={node.visibilityRule}
                    onChange={(e) => onChange({ visibility: e.target.value as LayoutEditorVisibilityRule })}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-visibility"
                >
                    {LAYOUT_EDITOR_VISIBILITY_PRESETS.map((p) => (
                        <option key={p.key} value={p.key}>
                            {p.label}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}
