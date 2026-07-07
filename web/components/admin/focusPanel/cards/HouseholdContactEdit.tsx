"use client";

import { useMemo, useRef, useState } from "react";

import { EditableCardStatus } from "@/lib/experience/editing/EditableCardStatus";
import { editableCardIsSaving } from "@/lib/experience/editing/editableCardRuntime";
import { useEditableCardRuntime } from "@/lib/experience/editing/useEditableCardRuntime";
import {
    householdContactDirtyForPolicy,
    householdContactPatch,
} from "@/lib/adminV2/runtime/focusPanel/household/householdContactEditState";
import {
    editableContactValueKeys,
    resolveContactEditFieldPolicy,
} from "@/lib/adminV2/runtime/focusPanel/household/householdContactFieldPolicy";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type {
    FocusPanelSaveResult,
    PersonContactPatch,
    PersonContactValues,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

type Props = {
    personId: string;
    personName?: string;
    initial: PersonContactValues;
    contactConfig?: NestedSurfaceConfig | null;
    save: (personId: string, patch: PersonContactPatch) => Promise<FocusPanelSaveResult>;
    onClose: () => void;
    onSaved?: () => void;
};

const SAVED_BEAT_MS = 900;

export default function HouseholdContactEdit({
    personId,
    personName,
    initial,
    contactConfig = null,
    save,
    onClose,
    onSaved,
}: Props) {
    const fieldPolicy = useMemo(() => resolveContactEditFieldPolicy(contactConfig), [contactConfig]);
    const editableKeys = useMemo(() => editableContactValueKeys(fieldPolicy), [fieldPolicy]);
    const displayedRows = fieldPolicy.filter((row) => row.displayed);

    const [draft, setDraft] = useState<PersonContactValues>(initial);
    const baselineRef = useRef<PersonContactValues>(initial);
    const draftRef = useRef(draft);
    draftRef.current = draft;

    const dirty = householdContactDirtyForPolicy(draft, baselineRef.current, editableKeys);

    const edit = useEditableCardRuntime({
        dirty,
        acknowledgeMs: SAVED_BEAT_MS,
        onAcknowledge: () => (onSaved ?? onClose)(),
        save: async () => {
            const patch = householdContactPatch(draftRef.current, baselineRef.current, editableKeys);
            const result = await save(personId, patch);
            if (result.ok) {
                baselineRef.current = { ...draftRef.current };
                return { ok: true };
            }
            return { ok: false, error: result.error || "Save failed" };
        },
    });

    const saving = editableCardIsSaving(edit.state);
    const locked = saving || edit.state.phase === "saved";

    const setField = (key: keyof PersonContactValues, value: string) => {
        const next = { ...draftRef.current, [key]: value };
        setDraft(next);
        edit.notifyChange(householdContactDirtyForPolicy(next, baselineRef.current, editableKeys));
    };

    const handleCancel = () => {
        edit.reset();
        setDraft(baselineRef.current);
        onClose();
    };

    return (
        <div className="alloy-os-card-edit" data-household-contact-edit="true" data-edit-person-id={personId}>
            <p className="alloy-os-card-edit__title" data-household-edit-title="true">
                {personName ? `Edit ${personName}` : "Edit contact"}
            </p>
            <div className="alloy-os-card-edit__form">
                {displayedRows.map((row) => {
                    if (!row.valueKey) {
                        return (
                            <div
                                key={row.configKey}
                                className="alloy-os-card-edit__row alloy-os-card-edit__row--locked"
                                data-household-edit-field={row.configKey}
                                data-domain-locked="true"
                            >
                                <span className="alloy-os-card-edit__label">{row.label}</span>
                                <span className="alloy-os-card-edit__locked-note">Managed elsewhere</span>
                            </div>
                        );
                    }
                    const readOnly = !row.editable;
                    return (
                        <label
                            key={row.configKey}
                            className="alloy-os-card-edit__row"
                            data-household-edit-field={row.valueKey}
                            data-household-edit-readonly={readOnly ? "true" : undefined}
                        >
                            <span className="alloy-os-card-edit__label">{row.label}</span>
                            <input
                                className="alloy-os-card-edit__input"
                                data-testid={`household-edit-${row.valueKey}`}
                                type={row.inputType}
                                value={draft[row.valueKey]}
                                disabled={locked || readOnly}
                                readOnly={readOnly}
                                onChange={(e) => setField(row.valueKey!, e.target.value)}
                            />
                        </label>
                    );
                })}
            </div>

            <EditableCardStatus state={edit.state} />

            <div className="alloy-os-card-edit__actions">
                <button
                    type="button"
                    className="alloy-os-card-edit__btn"
                    data-testid="household-edit-cancel"
                    onClick={handleCancel}
                    disabled={saving}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="alloy-os-card-edit__btn alloy-os-card-edit__btn--primary"
                    data-testid="household-edit-save"
                    data-save-phase={edit.state.phase}
                    onClick={() => void edit.commit()}
                    disabled={!dirty || locked}
                >
                    {saving ? "Saving…" : edit.state.phase === "saved" ? "✓ Saved" : "Save"}
                </button>
            </div>
        </div>
    );
}
