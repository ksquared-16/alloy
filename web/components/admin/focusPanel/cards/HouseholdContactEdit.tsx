"use client";

import { useEffect, useRef, useState } from "react";

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
 * Household primary-contact edit surface — the live replacement for
 * `CardEditPlaceholder` on the Household card's Edit depth (Edit is a capability of
 * Focus; see operational-depth-doctrine.md). Confirmed save only (no optimistic):
 * local draft + dirty + cancel-reverts + loading + success + error. Persistence is
 * the injected `save` (existing person PATCH path); on success the host re-merges
 * the VM and the card recomposes from refreshed truth — this form does not refetch.
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

/** How long the "Saved ✓" confirmation shows before returning to the card. */
const SAVED_BEAT_MS = 900;

const FIELD_ROWS: { key: keyof PersonContactValues; label: string; type: string }[] = [
    { key: "first_name", label: "First name", type: "text" },
    { key: "last_name", label: "Last name", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "tel" },
];

export default function HouseholdContactEdit({ personId, personName, initial, save, onClose, onSaved }: Props) {
    const [baseline, setBaseline] = useState<PersonContactValues>(initial);
    const [draft, setDraft] = useState<PersonContactValues>(initial);
    // idle → saving → saved (brief confirmation beat) → returns to the card view.
    const [phase, setPhase] = useState<"idle" | "saving" | "saved">("idle");
    const [error, setError] = useState<string | null>(null);
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

    const dirty = householdContactDirty(draft, baseline);
    const saving = phase === "saving";

    const setField = (key: keyof PersonContactValues, value: string) => {
        setDraft((prev) => ({ ...prev, [key]: value }));
        setPhase("idle");
        setError(null);
    };

    const handleCancel = () => {
        setDraft(baseline);
        setError(null);
        onClose();
    };

    const handleSave = async () => {
        if (!dirty || saving) return;
        setPhase("saving");
        setError(null);
        const result = await save(personId, householdContactPatch(draft, baseline));
        if (result.ok) {
            // Confirmed save: lock the new baseline, show a brief "Saved ✓" beat, then
            // hand back to the card (which recomposes from refreshed truth + flashes
            // its own saved confirmation with the updated, formatted values).
            setBaseline(draft);
            setPhase("saved");
            savedTimer.current = setTimeout(() => (onSaved ?? onClose)(), SAVED_BEAT_MS);
        } else {
            setError(result.error || "Save failed");
            setPhase("idle");
        }
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
                            disabled={saving}
                            onChange={(e) => setField(row.key, e.target.value)}
                        />
                    </label>
                ))}
            </div>

            {error ? (
                <p className="alloy-os-card-edit__error" data-household-edit-error="true" role="alert">
                    {error}
                </p>
            ) : phase === "saved" ? (
                <p className="alloy-os-card-edit__saved" data-household-edit-saved="true" role="status">
                    ✓ Saved
                </p>
            ) : null}

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
                    data-save-phase={phase}
                    onClick={handleSave}
                    disabled={!dirty || saving || phase === "saved"}
                >
                    {phase === "saving" ? "Saving…" : phase === "saved" ? "✓ Saved" : "Save"}
                </button>
            </div>
        </div>
    );
}
