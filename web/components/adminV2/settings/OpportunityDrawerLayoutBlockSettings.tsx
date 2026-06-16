"use client";

import {
    LAYOUT_EDITOR_CONTACT_ROLES,
    LAYOUT_EDITOR_CONTACT_ROLE_LABELS,
    contactRoleEditorDescription,
    readLayoutEditorContactRole,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";
import {
    LAYOUT_EDITOR_ROW_ACTIONS,
    LAYOUT_EDITOR_ROW_ACTION_LABELS,
    LAYOUT_EDITOR_ROW_LAYOUT_MODES,
    LAYOUT_EDITOR_ROW_LAYOUT_MODE_LABELS,
    readLayoutEditorRowTemplateConfig,
    type LayoutEditorRowAction,
    type LayoutEditorRowTemplateConfig,
} from "@/lib/layout/layoutEditorRowTemplateConfig";
import type { LayoutEditorBlockNode } from "@/lib/layout/layoutEditorCompositionModel";

type Props = {
    block: LayoutEditorBlockNode;
    showContactRole?: boolean;
    contactRole?: LayoutEditorContactRole;
    rowTemplateConfig?: LayoutEditorRowTemplateConfig;
    onContactRoleChange?: (role: LayoutEditorContactRole) => void;
    onRowTemplateChange?: (patch: LayoutEditorRowTemplateConfig) => void;
    onClose: () => void;
};

export default function OpportunityDrawerLayoutBlockSettings({
    block,
    showContactRole = false,
    contactRole,
    rowTemplateConfig,
    onContactRoleChange,
    onRowTemplateChange,
    onClose,
}: Props) {
    const rowConfig = rowTemplateConfig ?? readLayoutEditorRowTemplateConfig(undefined);
    const isContactBlock = showContactRole;
    const isRowTemplate = block.kind === "related_list";
    const unsupportedRowActions: LayoutEditorRowAction[] = ["open_schedule"];

    return (
        <div
            className="mt-2 rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.03] p-3 shadow-sm"
            data-testid="visual-editor-block-settings"
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-alloy-midnight">{block.title}</p>
                <button type="button" className="text-[11px] text-alloy-midnight/50 hover:text-alloy-pine" onClick={onClose}>
                    Close
                </button>
            </div>

            {isContactBlock && onContactRoleChange ?
                <div className="space-y-2">
                    <p className="text-[11px] leading-relaxed text-alloy-midnight/60">
                        {contactRoleEditorDescription(contactRole ?? "primary")}
                    </p>
                    <fieldset className="space-y-1">
                        <legend className="text-[11px] font-medium text-alloy-midnight/60">Relationship role</legend>
                    {LAYOUT_EDITOR_CONTACT_ROLES.map((role) => (
                        <label key={role} className="flex items-center gap-2 text-[11px] text-alloy-midnight/75">
                            <input
                                type="radio"
                                name={`contact-role-${block.itemId}`}
                                checked={(contactRole ?? readLayoutEditorContactRole(undefined)) === role}
                                onChange={() => onContactRoleChange(role)}
                                data-testid={`visual-editor-block-role-${role}`}
                            />
                            {LAYOUT_EDITOR_CONTACT_ROLE_LABELS[role]}
                        </label>
                    ))}
                    </fieldset>
                </div>
            :   null}

            {isRowTemplate && onRowTemplateChange ?
                <div className="space-y-3">
                    <label className="block text-[11px] text-alloy-midnight/60">
                        Row layout
                        <select
                            value={rowConfig.layoutMode ?? "standard"}
                            onChange={(e) =>
                                onRowTemplateChange({
                                    ...rowConfig,
                                    layoutMode: e.target.value as LayoutEditorRowTemplateConfig["layoutMode"],
                                })
                            }
                            className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                            data-testid="visual-editor-row-layout-mode"
                        >
                            {LAYOUT_EDITOR_ROW_LAYOUT_MODES.map((mode) => (
                                <option key={mode} value={mode}>
                                    {LAYOUT_EDITOR_ROW_LAYOUT_MODE_LABELS[mode]}
                                </option>
                            ))}
                        </select>
                    </label>

                    <fieldset>
                        <legend className="text-[11px] font-medium text-alloy-midnight/60">Actions</legend>
                        <div className="mt-1 space-y-1">
                            {LAYOUT_EDITOR_ROW_ACTIONS.map((action) => {
                                const unsupported = unsupportedRowActions.includes(action);
                                return (
                                    <label key={action} className="flex items-center gap-2 text-[11px] text-alloy-midnight/75">
                                        <input
                                            type="checkbox"
                                            disabled={unsupported}
                                            checked={!unsupported && (rowConfig.actions?.includes(action) ?? false)}
                                            onChange={(e) => {
                                                if (unsupported) return;
                                                const current = new Set(rowConfig.actions ?? []);
                                                if (e.target.checked) current.add(action);
                                                else current.delete(action);
                                                onRowTemplateChange({ ...rowConfig, actions: [...current] });
                                            }}
                                            data-testid={`visual-editor-row-action-${action}`}
                                        />
                                        {LAYOUT_EDITOR_ROW_ACTION_LABELS[action]}
                                        {unsupported ?
                                            <span className="text-[10px] text-alloy-midnight/40">· coming later</span>
                                        :   null}
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className="text-[11px] font-medium text-alloy-midnight/60">Display</legend>
                        <div className="mt-1 space-y-1">
                            {(
                                [
                                    ["avatar", "Avatar"],
                                    ["statusPill", "Status pill"],
                                    ["secondaryMetadata", "Secondary metadata"],
                                ] as const
                            ).map(([key, label]) => (
                                <label key={key} className="flex items-center gap-2 text-[11px] text-alloy-midnight/75">
                                    <input
                                        type="checkbox"
                                        checked={rowConfig.display?.[key] !== false}
                                        onChange={(e) =>
                                            onRowTemplateChange({
                                                ...rowConfig,
                                                display: { ...rowConfig.display, [key]: e.target.checked },
                                            })
                                        }
                                        data-testid={`visual-editor-row-display-${key}`}
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                </div>
            :   null}
        </div>
    );
}
