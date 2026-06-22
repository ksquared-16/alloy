"use client";

import { LAYOUT_ADORNMENT_ICONS } from "@/lib/layout/layoutV2";
import {
    LAYOUT_EDITOR_DISPLAY_TYPES,
    LAYOUT_AGE_FORMATS,
    LAYOUT_AGE_FORMAT_LABELS,
    LAYOUT_DATE_FORMATS,
    LAYOUT_ICON_POSITIONS,
    LAYOUT_LABEL_POSITIONS,
    LAYOUT_LINK_BEHAVIORS_EDITOR,
    LAYOUT_LINK_BEHAVIOR_LABELS,
    LAYOUT_STATUS_FORMATS,
    LAYOUT_TYPOGRAPHY_INTENT_LABELS,
    LAYOUT_TYPOGRAPHY_INTENTS_EDITOR,
    type LayoutEditorDisplayConfig,
} from "@/lib/layout/layoutEditorDisplayConfig";
import { layoutBuilderEditableInputProps } from "@/lib/layout/layoutBuilderEditableInput";
import {
    LAYOUT_EDITOR_VISIBILITY_PRESETS,
    layoutEditorContactFieldVisibilityPresets,
    type LayoutEditorVisibilityRule,
} from "@/lib/layout/layoutEditorVisibilityRules";
import type { LayoutEditorFieldNode } from "@/lib/layout/layoutEditorCompositionModel";

type Props = {
    node: LayoutEditorFieldNode;
    inline?: boolean;
    onChange: (patch: {
        label?: string;
        display?: LayoutEditorDisplayConfig;
        visibility?: LayoutEditorVisibilityRule;
        editable?: boolean;
    }) => void;
    onClose: () => void;
};

export default function OpportunityDrawerLayoutFieldSettings({ node, inline = false, onChange, onClose }: Props) {
    const display = node.displayConfig;
    const visibilityPresets =
        node.contactRole ?
            layoutEditorContactFieldVisibilityPresets(node.contactRole)
        :   LAYOUT_EDITOR_VISIBILITY_PRESETS.filter(
                (preset) =>
                    ![
                        "show_when_contact_record_exists",
                        "show_when_contact_count_gt_1",
                        "show_when_not_primary",
                    ].includes(preset.key),
            );

    return (
        <div
            className={
                inline ?
                    "mt-2 rounded-lg border border-alloy-pine/25 bg-alloy-pine/[0.04] p-3 shadow-sm"
                :   "rounded-lg border border-alloy-forge/12 bg-white p-3 shadow-sm"
            }
            data-testid="visual-editor-field-settings"
            data-visual-editor-field-settings-inline={inline ? "true" : undefined}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-alloy-midnight">Edit {node.title}</p>
                <button type="button" className="text-[11px] text-alloy-midnight/50 hover:text-alloy-pine" onClick={onClose}>
                    Close
                </button>
            </div>

            <label className="block text-[11px] text-alloy-midnight/60">
                Custom label
                <input
                    type="text"
                    value={node.title}
                    {...layoutBuilderEditableInputProps}
                    onChange={(e) => onChange({ label: e.target.value })}
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
                Label position
                <select
                    value={display.labelPosition ?? (display.showLabel === false ? "hidden" : "above")}
                    onChange={(e) =>
                        onChange({
                            display: {
                                labelPosition: e.target.value as LayoutEditorDisplayConfig["labelPosition"],
                                showLabel: e.target.value !== "hidden",
                            },
                        })
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-label-position"
                >
                    {LAYOUT_LABEL_POSITIONS.map((position) => (
                        <option key={position} value={position}>
                            {position === "above" ? "Above value" : position === "inline" ? "Inline with value" : "Hidden"}
                        </option>
                    ))}
                </select>
            </label>

            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Formatting</p>

            <label className="mt-1 block text-[11px] text-alloy-midnight/60">
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

            {(display.displayType === "date" || !display.displayType) ?
                <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                    Date format
                    <select
                        value={display.dateFormat ?? "medium"}
                        onChange={(e) =>
                            onChange({ display: { dateFormat: e.target.value as LayoutEditorDisplayConfig["dateFormat"] } })
                        }
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                        data-testid="visual-editor-field-date-format"
                    >
                        {LAYOUT_DATE_FORMATS.map((format) => (
                            <option key={format} value={format}>
                                {format}
                            </option>
                        ))}
                    </select>
                </label>
            :   null}

            {node.refKey === "child.dob_age" || node.refKey.endsWith(".dob_age") ?
                <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                    Age format
                    <select
                        value={display.ageFormat ?? "years_months"}
                        onChange={(e) =>
                            onChange({ display: { ageFormat: e.target.value as LayoutEditorDisplayConfig["ageFormat"] } })
                        }
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                        data-testid="visual-editor-field-age-format"
                    >
                        {LAYOUT_AGE_FORMATS.map((format) => (
                            <option key={format} value={format}>
                                {LAYOUT_AGE_FORMAT_LABELS[format]}
                            </option>
                        ))}
                    </select>
                </label>
            :   null}

            {display.displayType === "status" || display.displayType === "badge" || display.displayType === "pill" ?
                <label className="mt-2 block text-[11px] text-alloy-midnight/60">
                    Status / pill format
                    <select
                        value={display.statusFormat ?? (display.displayType === "pill" ? "pill" : "badge")}
                        onChange={(e) =>
                            onChange({ display: { statusFormat: e.target.value as LayoutEditorDisplayConfig["statusFormat"] } })
                        }
                        className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                        data-testid="visual-editor-field-status-format"
                    >
                        {LAYOUT_STATUS_FORMATS.map((format) => (
                            <option key={format} value={format}>
                                {format}
                            </option>
                        ))}
                    </select>
                </label>
            :   null}

            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Icon</p>

            <label className="mt-1 flex items-center gap-2 text-[11px] text-alloy-midnight/70">
                <input
                    type="checkbox"
                    checked={display.showIcon !== false && Boolean(display.icon)}
                    onChange={(e) => onChange({ display: { showIcon: e.target.checked } })}
                    data-testid="visual-editor-field-show-icon"
                />
                Show icon
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
                Icon position
                <select
                    value={display.iconPosition ?? "left"}
                    onChange={(e) =>
                        onChange({ display: { iconPosition: e.target.value as LayoutEditorDisplayConfig["iconPosition"] } })
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-icon-position"
                >
                    {LAYOUT_ICON_POSITIONS.map((position) => (
                        <option key={position} value={position}>
                            {position}
                        </option>
                    ))}
                </select>
            </label>

            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Text size</p>

            <label className="mt-1 block text-[11px] text-alloy-midnight/60">
                Emphasis
                <select
                    value={display.typographyIntent ?? "primary"}
                    onChange={(e) =>
                        onChange({
                            display: {
                                typographyIntent: e.target.value as LayoutEditorDisplayConfig["typographyIntent"],
                            },
                        })
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-typography-intent"
                >
                    {LAYOUT_TYPOGRAPHY_INTENTS_EDITOR.map((intent) => (
                        <option key={intent} value={intent}>
                            {LAYOUT_TYPOGRAPHY_INTENT_LABELS[intent]}
                        </option>
                    ))}
                </select>
            </label>

            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Behavior</p>

            <label className="mt-1 block text-[11px] text-alloy-midnight/60">
                Link behavior
                <select
                    value={
                        display.linkBehavior && LAYOUT_LINK_BEHAVIORS_EDITOR.includes(display.linkBehavior) ?
                            display.linkBehavior
                        :   "none"
                    }
                    onChange={(e) =>
                        onChange({ display: { linkBehavior: e.target.value as LayoutEditorDisplayConfig["linkBehavior"] } })
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-link-behavior"
                >
                    {LAYOUT_LINK_BEHAVIORS_EDITOR.map((b) => (
                        <option key={b} value={b}>
                            {LAYOUT_LINK_BEHAVIOR_LABELS[b]}
                        </option>
                    ))}
                </select>
                {display.linkBehavior === "open_record" ?
                    <span className="mt-1 block text-[10px] text-alloy-midnight/45">
                        Opens the full record workspace page.
                    </span>
                : display.linkBehavior === "open_drawer" ?
                    <span className="mt-1 block text-[10px] text-alloy-midnight/45">
                        Opens the related record in the side drawer without leaving this context.
                    </span>
                : display.linkBehavior === "mailto" ?
                    <span className="mt-1 block text-[10px] text-alloy-midnight/45">
                        Tapping the value opens the operator email composer.
                    </span>
                : display.linkBehavior === "tel" ?
                    <span className="mt-1 block text-[10px] text-alloy-midnight/45">
                        Tapping the value starts a phone call.
                    </span>
                :   null}
            </label>

            {display.linkBehavior === "external_url" || display.linkBehavior === "open_modal" ?
                <p className="mt-2 rounded-md border border-amber-200/80 bg-amber-50/80 px-2 py-1.5 text-[10px] text-amber-900">
                    This layout still uses an advanced link setting ({LAYOUT_LINK_BEHAVIOR_LABELS[display.linkBehavior]}).
                    Choose a supported action or clear it before publishing.
                </p>
            :   null}

            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Edit behavior</p>

            <label className="mt-1 flex items-center gap-2 text-[11px] text-alloy-midnight/70">
                <input
                    type="checkbox"
                    checked={node.editable === true}
                    onChange={(e) => onChange({ editable: e.target.checked })}
                    data-testid="visual-editor-field-inline-editable"
                />
                Inline editable in live drawer
            </label>

            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Visibility</p>

            <label className="mt-1 block text-[11px] text-alloy-midnight/60">
                When to show
                <select
                    value={node.visibilityRule}
                    onChange={(e) => onChange({ visibility: e.target.value as LayoutEditorVisibilityRule })}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-field-visibility"
                >
                    {visibilityPresets.map((p) => (
                        <option key={p.key} value={p.key}>
                            {p.label}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}
