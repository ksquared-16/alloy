"use client";

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import { sectionKeyInOptions } from "@/lib/admin/fieldSectionSelectOptions";
import {
    buildFieldEditModalCapabilities,
    operatorModalShowsDeveloperDetailsByDefault,
} from "@/lib/fields/fieldEditModalOperatorUi";
import { operatorFieldDisplayLabel } from "@/lib/fields/fieldSettingsOperatorUi";
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
    editLabel: string;
    setEditLabel: (v: string) => void;
    editHelpText: string;
    setEditHelpText: (v: string) => void;
    editRequired: boolean;
    setEditRequired: (v: boolean) => void;
    editInteractionPreset: FieldPolicyInteractionPreset;
    setEditInteractionPreset: (v: FieldPolicyInteractionPreset) => void;
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
    editError: string | null;
    onClose: () => void;
    onSave: () => void;
};

const FIELD_TYPE_LABELS: Record<string, string> = {
    text: "Text",
    email: "Email",
    phone: "Phone",
    number: "Number",
    date: "Date",
    datetime: "Date and time",
    boolean: "Yes/No",
    select: "Single choice",
    multiselect: "Multiple choice",
};

function operatorFieldTypeLabel(fieldType: string): string {
    return FIELD_TYPE_LABELS[fieldType] ?? fieldType.replace(/_/g, " ");
}

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
    editLabel,
    setEditLabel,
    editHelpText,
    setEditHelpText,
    editRequired,
    setEditRequired,
    editInteractionPreset,
    setEditInteractionPreset,
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
    editError,
    onClose,
    onSave,
}: FieldDefinitionEditModalProps) {
    if (!open) return null;

    const cap = buildFieldEditModalCapabilities({
        entityType,
        fieldKey: row.field_key,
        policySettingsSupported,
        policyView,
    });

    const recordLabel = entityTitle.replace(/ Fields$/, "").trim();
    const displayTitle = operatorFieldDisplayLabel(entityType, {
        field_key: row.field_key,
        is_system: row.is_system,
        label: row.label,
    });

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
                <h3 className="text-lg font-semibold text-[#31394d]">{displayTitle}</h3>
                <p className="mb-4 text-xs text-[#59678b]">{recordLabel} · Field settings</p>

                <div className="space-y-4" data-testid="field-edit-operator-sections">
                    <div data-testid="field-edit-display-label">
                        <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Display label</label>
                        <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                        />
                    </div>

                    <div data-testid="field-edit-help-text">
                        <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Help text</label>
                        <input
                            type="text"
                            value={editHelpText}
                            onChange={(e) => setEditHelpText(e.target.value)}
                            placeholder="Shown under the field when staff edit records"
                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                        />
                    </div>

                    {cap.showStaffEditabilitySelect ? (
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
                            {cap.requirementSetInTableNote ? (
                                <p className="mt-1 text-xs text-[#59678b]">Required is set in the field list.</p>
                            ) : null}
                        </div>
                    ) : null}

                    {cap.showStaffEditabilityLockedNote ? (
                        <div
                            className="rounded-md border border-[#e6e8ec] bg-[#f8f9fb] px-3 py-2 text-xs text-[#59678b]"
                            data-testid="field-edit-staff-editability-locked"
                        >
                            <span className="font-medium text-[#31394d]">Staff can edit</span>
                            <p className="mt-0.5">{cap.staffEditabilityLockedNote}</p>
                        </div>
                    ) : null}

                    {cap.showLegacyRequiredCheckbox ? (
                        <label
                            className="flex items-center gap-2 text-sm"
                            data-testid="field-edit-legacy-required"
                        >
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

                    <details
                        className="rounded-md border border-[#e6e8ec] px-3 py-2"
                        data-testid="field-edit-developer-details"
                    >
                        <summary className="cursor-pointer text-xs font-medium text-[#59678b]">Developer details</summary>
                        <div className="mt-3 space-y-3">
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Field key</label>
                                <p className="font-mono text-xs text-[#59678b]">{row.field_key}</p>
                            </div>
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Type</label>
                                <p className="text-sm text-[#31394d]">{operatorFieldTypeLabel(row.field_type)}</p>
                            </div>
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Catalog group</label>
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
                                <p className="mt-1 text-[10px] text-[#59678b]">
                                    Group labels are managed on{" "}
                                    <span className="font-medium">Field grouping</span>.
                                </p>
                            </div>
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Sort order</label>
                                <input
                                    type="number"
                                    value={editSortOrder}
                                    onChange={(e) => setEditSortOrder(Number(e.target.value) || 0)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                        </div>
                    </details>
                </div>

                {editError ? <p className="mt-2 text-sm text-red-600">{editError}</p> : null}
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
