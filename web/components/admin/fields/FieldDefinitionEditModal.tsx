"use client";

import OptionSetKeyPicker from "@/components/admin/OptionSetKeyPicker";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import { isSelectLikeFieldType } from "@/lib/admin/fieldDefinitionOptionSetConfig";
import { sectionKeyInOptions } from "@/lib/admin/fieldSectionSelectOptions";
import { operatorModalShowsDeveloperDetailsByDefault } from "@/lib/fields/fieldEditModalOperatorUi";
import {
    canOperatorEditRequirementInline,
    operatorFieldDisplayLabel,
} from "@/lib/fields/fieldSettingsOperatorUi";
import type {
    FieldPolicyInteractionPreset,
    FieldPolicySettingsView,
} from "@/lib/fields/fieldPolicySettingsUi";

export type FieldDefinitionEditModalProps = {
    open: boolean;
    saving: boolean;
    canMutate: boolean;
    entityType: string;
    entityTitle: string;
    row: FieldDef;
    policySettingsSupported: boolean;
    policyView: FieldPolicySettingsView | null;
    sectionOptions: Array<{ value: string; label: string }>;
    manageOptionSetsHref?: string;
    editLabel: string;
    setEditLabel: (v: string) => void;
    editDescription: string;
    setEditDescription: (v: string) => void;
    editHelpText: string;
    setEditHelpText: (v: string) => void;
    editRequired: boolean;
    setEditRequired: (v: boolean) => void;
    editInteractionPreset: FieldPolicyInteractionPreset;
    setEditInteractionPreset: (v: FieldPolicyInteractionPreset) => void;
    editActive: boolean;
    setEditActive: (v: boolean) => void;
    editVisibleDrawer: boolean;
    setEditVisibleDrawer: (v: boolean) => void;
    editVisibleForm: boolean;
    setEditVisibleForm: (v: boolean) => void;
    editVisibleTable: boolean;
    setEditVisibleTable: (v: boolean) => void;
    editSectionKey: string;
    setEditSectionKey: (v: string) => void;
    editSortOrder: number;
    setEditSortOrder: (v: number) => void;
    editPlaceholder: string;
    setEditPlaceholder: (v: string) => void;
    editOptionSetKey: string;
    setEditOptionSetKey: (v: string) => void;
    editError: string | null;
    onClose: () => void;
    onSave: () => void;
};

export default function FieldDefinitionEditModal({
    open,
    saving,
    canMutate,
    entityType,
    entityTitle,
    row,
    policySettingsSupported,
    policyView,
    sectionOptions,
    manageOptionSetsHref,
    editLabel,
    setEditLabel,
    editDescription,
    setEditDescription,
    editHelpText,
    setEditHelpText,
    editRequired,
    setEditRequired,
    editInteractionPreset,
    setEditInteractionPreset,
    editActive,
    setEditActive,
    editVisibleDrawer,
    setEditVisibleDrawer,
    editVisibleForm,
    setEditVisibleForm,
    editVisibleTable,
    setEditVisibleTable,
    editSectionKey,
    setEditSectionKey,
    editSortOrder,
    setEditSortOrder,
    editPlaceholder,
    setEditPlaceholder,
    editOptionSetKey,
    setEditOptionSetKey,
    editError,
    onClose,
    onSave,
}: FieldDefinitionEditModalProps) {
    if (!open) return null;

    const showStaffEditability =
        policySettingsSupported && policyView?.policyEditable && canOperatorEditRequirementInline(policyView);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !saving && onClose()}
        >
            <div
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                data-testid="field-definition-edit-modal"
            >
                <h3 className="text-lg font-semibold text-[#31394d]">
                    {operatorFieldDisplayLabel(entityType, {
                        field_key: row.field_key,
                        is_system: row.is_system,
                        label: row.label,
                    })}
                </h3>
                <p className="mb-4 text-xs text-[#59678b]">
                    {row.is_system ? "System field" : "Custom field"} · {entityTitle.replace(/ Fields$/, "")}
                </p>

                <div className="space-y-4" data-testid="field-edit-operator-sections">
                    <div>
                        <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Display label</label>
                        <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                        />
                    </div>

                    <div>
                        <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Help text</label>
                        <input
                            type="text"
                            value={editHelpText}
                            onChange={(e) => setEditHelpText(e.target.value)}
                            placeholder="Shown under the field when staff edit records"
                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                        />
                    </div>

                    {showStaffEditability ? (
                        <div data-testid="field-edit-staff-editability">
                            <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Staff can edit</label>
                            <select
                                value={editInteractionPreset}
                                onChange={(e) => setEditInteractionPreset(e.target.value as FieldPolicyInteractionPreset)}
                                className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                            >
                                <option value="editable">Yes</option>
                                <option value="read_only">No (read-only)</option>
                            </select>
                            <p className="mt-1 text-xs text-[#59678b]">Required is set in the field list.</p>
                        </div>
                    ) : !policySettingsSupported ? (
                        <label className="flex items-center gap-2 text-sm" data-testid="field-edit-legacy-required">
                            <input
                                type="checkbox"
                                checked={editRequired}
                                onChange={(e) => setEditRequired(e.target.checked)}
                                className="rounded border-[#c4c8cc]"
                            />
                            Required
                        </label>
                    ) : null}

                    <div data-testid="field-edit-where-it-appears">
                        <div className="mb-1 text-xs font-semibold text-[#31394d]">Where it appears</div>
                        <div className="flex flex-wrap gap-4">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={editVisibleDrawer}
                                    onChange={(e) => setEditVisibleDrawer(e.target.checked)}
                                    className="rounded border-[#c4c8cc]"
                                />
                                Record drawer
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={editVisibleForm}
                                    onChange={(e) => setEditVisibleForm(e.target.checked)}
                                    className="rounded border-[#c4c8cc]"
                                />
                                Forms
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={editVisibleTable}
                                    onChange={(e) => setEditVisibleTable(e.target.checked)}
                                    className="rounded border-[#c4c8cc]"
                                />
                                Lists
                            </label>
                        </div>
                    </div>

                    <details className="rounded-md border border-[#e6e8ec] px-3 py-2" data-testid="field-edit-developer-details">
                        <summary className="cursor-pointer text-xs font-medium text-[#59678b]">Developer details</summary>
                        <div className="mt-3 space-y-3">
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Internal description</label>
                                <input
                                    type="text"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={editActive}
                                    onChange={(e) => setEditActive(e.target.checked)}
                                    className="rounded border-[#c4c8cc]"
                                />
                                Active
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">List order</label>
                                    <input
                                        type="number"
                                        value={editSortOrder}
                                        onChange={(e) => setEditSortOrder(Number(e.target.value) || 0)}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Placeholder</label>
                                    <input
                                        type="text"
                                        value={editPlaceholder}
                                        onChange={(e) => setEditPlaceholder(e.target.value)}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    />
                                </div>
                            </div>
                            {isSelectLikeFieldType(row.field_type) && (
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Option list</label>
                                    <OptionSetKeyPicker
                                        value={editOptionSetKey}
                                        onChange={setEditOptionSetKey}
                                        disabled={!canMutate || saving}
                                        manageOptionSetsHref={manageOptionSetsHref}
                                    />
                                </div>
                            )}
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Form group</label>
                                <select
                                    value={
                                        sectionKeyInOptions(sectionOptions, editSectionKey)
                                            ? editSectionKey
                                            : (sectionOptions[0]?.value ?? "custom")
                                    }
                                    onChange={(e) => setEditSectionKey(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                >
                                    {sectionOptions.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <p className="text-[10px] font-mono text-[#59678b]/70">
                                {row.field_type} · {row.field_key}
                            </p>
                        </div>
                    </details>
                </div>

                {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => !saving && onClose()}
                        className="rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium hover:bg-[#eef0f4]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving || !canMutate}
                        className="rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** @internal for tests */
export function fieldEditModalDefaultDeveloperDetailsOpen(): boolean {
    return operatorModalShowsDeveloperDetailsByDefault();
}
