"use client";

import { useRef, useState } from "react";

import { EditableCardStatus } from "@/lib/experience/editing/EditableCardStatus";
import { editableCardIsSaving } from "@/lib/experience/editing/editableCardRuntime";
import { useEditableCardRuntime } from "@/lib/experience/editing/useEditableCardRuntime";
import {
    householdContactDirty,
    householdContactPatch,
} from "@/lib/adminV2/runtime/focusPanel/household/householdContactEditState";
import type {
    FocusPanelSaveResult,
    PersonContactPatch,
    PersonContactValues,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

/**
 * Household primary-contact edit surface — live replacement for CardEditPlaceholder
 * on the Household card's Edit depth (Edit is a capability of Focus;
 * see operational-depth-doctrine.md).
 *
 * Edit lifecycle is owned by the canonical Editable Card Runtime
 * (`useEditableCardRuntime`): Card Runtime owns the state machine; no second
 * coordinator (Focus Panel editing is single-card, not Save-All). Authoritative
 * confirmed save only (no optimistic): on failure the operator's draft is RETAINED
 * (no silent loss). Doctrine: docs/platform/experience/editable-card-runtime.md.
 */

type Props = {
    personId: string;
    /** Name of the contact being edited — titles the form ("Edit {name}"). */
    personName?: string;
    initial: PersonContactValues;
    save: (personId: string, patch: PersonContactPatch) => Promise<FocusPanelSaveResult>;
    onClose: () => void;
    /** Called after a confirmed save (brief "Saved" beat) so the card returns to the
     *  focused view and flashes its own saved confirmation. Falls back to onClose. */
    onSaved?: () => void;
};

/** How long the "Saved" confirmation shows before returning to the card. */
const SAVED_BEAT_MS = 900;

const FIELD_ROWS: { key: keyof PersonContactValues; label: string; type: string }[] = [
    { key: "first_name", label: "First name", type: "text" },
    { key: "last_name", label: "Last name", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "tel" },
];

export default function HouseholdContactEdit({ personId, personName, initial, save, onClose, onSaved }: Props) {
    const [draft, setDraft] = useState<PersonContactValues>(initial);
    const baselineRef = useRef<PersonContactValues>(initial);
    const draftRef = useRef(draft);
    draftRef.current = draft;

    const dirty = householdContactDirty(draft, baselineRef.current);

    // Card Runtime owns the edit lifecycle. No sectionId — Focus Panel editing is
    // single-card-isolated (no Save-All, no dirty guard across cards). Authoritative
    // confirmed save: on failure the operator's draft is retained (never silently
    // reverted). On success: lock the confirmed baseline, show the ack beat, then
    // hand back to the card via onAcknowledge → (onSaved ?? onClose).
    const edit = useEditableCardRuntime({
        dirty,
        acknowledgeMs: SAVED_BEAT_MS,
        onAcknowledge: () => (onSaved ?? onClose)(),
        save: async () => {
            const patch = householdContactPatch(draftRef.current, baselineRef.current);
            const result = await save(personId, patch);
            if (result.ok) {
                // Advance the baseline to the confirmed draft so re-entry (if any before
                // the ack timer fires) sees no phantom dirty against the old values.
                baselineRef.current = { ...draftRef.current };
                return { ok: true };
            }
            return { ok: false, error: result.error || "Save failed" };
        },
    });

    const saving = editableCardIsSaving(edit.state);
    // Lock inputs during the save in-flight AND during the brief ack window — the
    // operator shouldn't race an edit against the timer that closes the form.
    const locked = saving || edit.state.phase === "saved";

    const setField = (key: keyof PersonContactValues, value: string) => {
        const next = { ...draftRef.current, [key]: value };
        setDraft(next);
        edit.notifyChange(householdContactDirty(next, baselineRef.current));
    };

    const handleCancel = () => {
        // Reset clears any in-flight ack timer before closing.
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
                {FIELD_ROWS.map((row) => (
                    <label key={row.key} className="alloy-os-card-edit__row" data-household-edit-field={row.key}>
                        <span className="alloy-os-card-edit__label">{row.label}</span>
                        <input
                            className="alloy-os-card-edit__input"
                            data-testid={`household-edit-${row.key}`}
                            type={row.type}
                            value={draft[row.key]}
                            disabled={locked}
                            onChange={(e) => setField(row.key, e.target.value)}
                        />
                    </label>
                ))}
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
