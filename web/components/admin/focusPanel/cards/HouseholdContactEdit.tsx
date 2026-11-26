"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { EditableCardStatus } from "@/lib/experience/editing/EditableCardStatus";
import { editableCardIsSaving } from "@/lib/experience/editing/editableCardRuntime";
import { useEditableCardRuntime } from "@/lib/experience/editing/useEditableCardRuntime";
import {
    householdContactDirty,
    householdContactPatch,
} from "@/lib/adminV2/runtime/focusPanel/household/householdContactEditState";
import { buildHouseholdContactEditFieldRows } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import ComposableRegionShell from "@/components/admin/focusPanel/drillIn/ComposableRegionShell";
import InlineRuntimeFieldList from "@/components/admin/focusPanel/drillIn/InlineRuntimeFieldList";
import { CONTACT_EDIT_FIELD_MAP } from "@/lib/adminV2/runtime/focusPanel/household/householdSurfaceFields";
import { fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { IdentityFieldCellVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import type {
    FocusPanelSaveResult,
    PersonContactPatch,
    PersonContactValues,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

type Props = {
    personId: string;
    personName?: string;
    initial: PersonContactValues;
    save: (personId: string, patch: PersonContactPatch) => Promise<FocusPanelSaveResult>;
    onClose: () => void;
    onSaved?: () => void;
    nestedConfig?: NestedSurfaceConfig | null;
    /** Semantic section driving edit presentation (Parent/Guardian shared). */
    sectionKey?: string;
};

const SAVED_BEAT_MS = 900;

const INPUT_TYPE_BY_VALUE_KEY: Record<keyof PersonContactValues, string> = {
    first_name: "text",
    last_name: "text",
    email: "email",
    phone: "tel",
    address_line1: "text",
    address_line2: "text",
    city: "text",
    state: "text",
    postal_code: "text",
};

/**
 * Person-level Household contact editor.
 * Presentation comes from the shared `contact_edit` / Parent-Guardian semantic map;
 * selected person supplies values + mutation target only.
 */
export default function HouseholdContactEdit({
    personId,
    personName,
    initial,
    save,
    onClose,
    onSaved,
    nestedConfig = null,
}: Props) {
    const composer = useFocusPanelComposer();
    const composing = composer?.isComposingSurface(HOUSEHOLD_SURFACE_ID) ?? false;
    const activeConfig = composer?.enabled ? composer.configFor(HOUSEHOLD_SURFACE_ID) : nestedConfig;
    const [draft, setDraft] = useState<PersonContactValues>(initial);
    const [hydrated, setHydrated] = useState(false);
    const baselineRef = useRef<PersonContactValues>(initial);
    const draftRef = useRef(draft);
    draftRef.current = draft;

    // Re-hydrate when the selected person seed changes (Kelly vs Kristi).
    useEffect(() => {
        setDraft(initial);
        baselineRef.current = initial;
        setHydrated(true);
    }, [personId, initial.first_name, initial.last_name, initial.email, initial.phone]);

    const identityRows = useMemo(
        () =>
            buildHouseholdContactEditFieldRows({
                config: activeConfig,
                values: draft,
                canMutate: true,
            }),
        [activeConfig, draft],
    );

    const formCells = useMemo(
        () =>
            identityRows.flatMap((row) =>
                row.cells.filter(
                    (cell: IdentityFieldCellVM) =>
                        fieldShouldRender(cell.policy) && CONTACT_EDIT_FIELD_MAP[cell.fieldRef],
                ),
            ),
        [identityRows],
    );

    // Fallback: if contact_edit has no configured fields, still offer the canonical
    // four contact values so edit is never a blank surface for parents.
    const cellsOrFallback: IdentityFieldCellVM[] = useMemo(() => {
        if (formCells.length > 0) return formCells;
        const fallback = (fieldRef: string, label: string): IdentityFieldCellVM => ({
            fieldRef,
            label,
            value: null,
            labelMode: "visible",
            policy: "editable",
            editable: true,
            hideWhenEmpty: false,
            width: "full",
        });
        return [
            fallback("contact.first_name", "First name"),
            fallback("contact.last_name", "Last name"),
            fallback("contact.phone", "Phone"),
            fallback("contact.email", "Email"),
        ];
    }, [formCells]);

    const saveableKeys = useMemo(
        () =>
            new Set(
                cellsOrFallback
                    .filter((cell) => cell.editable)
                    .map((cell) => CONTACT_EDIT_FIELD_MAP[cell.fieldRef])
                    .filter((key): key is keyof PersonContactValues => Boolean(key)),
            ),
        [cellsOrFallback],
    );

    const dirty = householdContactDirty(draft, baselineRef.current);

    const edit = useEditableCardRuntime({
        dirty,
        acknowledgeMs: SAVED_BEAT_MS,
        onAcknowledge: () => (onSaved ?? onClose)(),
        save: async () => {
            const patch = householdContactPatch(
                draftRef.current,
                baselineRef.current,
                saveableKeys,
            );
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
        edit.notifyChange(householdContactDirty(next, baselineRef.current));
    };

    const handleCancel = () => {
        edit.reset();
        setDraft(baselineRef.current);
        onClose();
    };

    return (
        <ComposableRegionShell
            surfaceId={HOUSEHOLD_SURFACE_ID}
            groupKey="contact_edit"
            label="Contact Edit"
            className="alloy-os-card-edit"
            dataAttrs={{
                "data-household-contact-edit": "true",
                "data-edit-person-id": personId,
                "data-edit-hydrated": hydrated ? "true" : "false",
            }}
        >
            <div data-household-contact-edit-inner="true" className="alloy-os-card-edit__opaque">
                <p className="alloy-os-card-edit__title" data-household-edit-title="true">
                    {personName ? `Edit ${personName}` : "Edit contact"}
                </p>
                {composing ? (
                    <InlineRuntimeFieldList
                        surfaceId={HOUSEHOLD_SURFACE_ID}
                        groupKey="contact_edit"
                        previewByFieldKey={{
                            "contact.first_name": draft.first_name,
                            "contact.last_name": draft.last_name,
                            "contact.email": draft.email,
                            "contact.phone": draft.phone,
                        }}
                        className="mb-3"
                    />
                ) : null}
                {!hydrated ? (
                    <p className="alloy-os-card-edit__loading" data-household-edit-loading="true">
                        Loading contact…
                    </p>
                ) : (
                    <div className="alloy-os-card-edit__form">
                        {cellsOrFallback.map((cell) => {
                            const valueKey = CONTACT_EDIT_FIELD_MAP[cell.fieldRef]!;
                            const editable = Boolean(cell.editable);
                            return (
                                <label
                                    key={cell.fieldRef}
                                    className="alloy-os-card-edit__row"
                                    data-household-edit-field={valueKey}
                                    data-identity-field-ref={cell.fieldRef}
                                    data-identity-policy={cell.policy}
                                >
                                    <span className="alloy-os-card-edit__label">{cell.label}</span>
                                    {editable ? (
                                        <input
                                            className="alloy-os-card-edit__input"
                                            data-testid={`household-edit-${valueKey}`}
                                            type={INPUT_TYPE_BY_VALUE_KEY[valueKey]}
                                            value={draft[valueKey]}
                                            disabled={locked}
                                            onChange={(e) => setField(valueKey, e.target.value)}
                                        />
                                    ) : (
                                        <span className="alloy-os-card-edit__readonly" title={draft[valueKey] || undefined}>
                                            {draft[valueKey] || "—"}
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                )}

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
                        disabled={!dirty || locked || !hydrated}
                    >
                        {saving ? "Saving…" : edit.state.phase === "saved" ? "✓ Saved" : "Save"}
                    </button>
                </div>
            </div>
        </ComposableRegionShell>
    );
}
