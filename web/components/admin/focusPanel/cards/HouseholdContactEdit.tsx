"use client";

import { useState } from "react";

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
    initial: PersonContactValues;
    save: (personId: string, patch: PersonContactPatch) => Promise<FocusPanelSaveResult>;
    onClose: () => void;
};

const FIELD_ROWS: { key: keyof PersonContactValues; label: string; type: string }[] = [
    { key: "first_name", label: "First name", type: "text" },
    { key: "last_name", label: "Last name", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "tel" },
];

export default function HouseholdContactEdit({ personId, initial, save, onClose }: Props) {
    const [baseline, setBaseline] = useState<PersonContactValues>(initial);
    const [draft, setDraft] = useState<PersonContactValues>(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const dirty = householdContactDirty(draft, baseline);

    const setField = (key: keyof PersonContactValues, value: string) => {
        setDraft((prev) => ({ ...prev, [key]: value }));
        setSaved(false);
        setError(null);
    };

    const handleCancel = () => {
        setDraft(baseline);
        setError(null);
        onClose();
    };

    const handleSave = async () => {
        if (!dirty || saving) return;
        setSaving(true);
        setError(null);
        const result = await save(personId, householdContactPatch(draft, baseline));
        if (result.ok) {
            // Confirmed save: lock the new baseline so the form reads clean; the host
            // re-merges truth and the card recomposes underneath.
            setBaseline(draft);
            setSaved(true);
        } else {
            setError(result.error || "Save failed");
        }
        setSaving(false);
    };

    return (
        <div className="alloy-os-card-edit" data-household-contact-edit="true">
            <p className="alloy-os-card-edit__title">Edit primary contact</p>
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
            ) : saved && !dirty ? (
                <p className="alloy-os-card-edit__saved" data-household-edit-saved="true">
                    Saved
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
                    onClick={handleSave}
                    disabled={!dirty || saving}
                >
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>
        </div>
    );
}
