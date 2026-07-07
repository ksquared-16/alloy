"use client";

import { useRef, useState } from "react";

import { EditableCardStatus } from "@/lib/experience/editing/EditableCardStatus";
import { editableCardIsSaving } from "@/lib/experience/editing/editableCardRuntime";
import { useEditableCardRuntime } from "@/lib/experience/editing/useEditableCardRuntime";
import {
    buildChildFocusSavePatch,
    childFocusEditDirtyForPolicy,
    type ChildFocusEditSeed,
} from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";
import {
    editableChildFocusValueKeys,
    resolveChildFocusEditPolicy,
    type ChildFocusEditFieldRow,
    type ChildFocusEditValues,
} from "@/lib/adminV2/runtime/focusPanel/children/childFocusFieldPolicy";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { FocusPanelSaveResult } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { ChildFocusSavePatch } from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";

const SAVED_BEAT_MS = 900;

type Props = {
    seed: ChildFocusEditSeed;
    childName: string;
    childSurfaceConfig: NestedSurfaceConfig | null;
    opportunityStartDate?: string | null;
    save: (args: {
        childId: string;
        row: ChildFocusEditSeed["row"];
        patch: ChildFocusSavePatch;
        identityBaseline: ChildFocusEditSeed["identityBaseline"];
    }) => Promise<FocusPanelSaveResult>;
    onClose: () => void;
    onSaved?: () => void;
    /** Composer preview — render fields but disable save. */
    previewOnly?: boolean;
};

export default function ChildFocusEdit({
    seed,
    childName,
    childSurfaceConfig,
    opportunityStartDate,
    save,
    onClose,
    onSaved,
    previewOnly = false,
}: Props) {
    const policy = resolveChildFocusEditPolicy(childSurfaceConfig);
    const editableKeys = editableChildFocusValueKeys(policy);

    const [draft, setDraft] = useState<ChildFocusEditValues>(seed.values);
    const baselineRef = useRef<ChildFocusEditValues>(seed.values);
    const draftRef = useRef(draft);
    draftRef.current = draft;

    const dirty = childFocusEditDirtyForPolicy(draft, baselineRef.current, editableKeys);

    const edit = useEditableCardRuntime({
        dirty,
        acknowledgeMs: SAVED_BEAT_MS,
        onAcknowledge: () => (onSaved ?? onClose)(),
        save: async () => {
            const patch = buildChildFocusSavePatch({
                row: seed.row,
                draft: draftRef.current,
                baseline: baselineRef.current,
                identityBaseline: seed.identityBaseline,
                editableKeys,
                opportunityStartDate,
            });
            const hasChanges =
                Object.keys(patch.identityPatch).length > 0 || Object.keys(patch.ocmPatch).length > 0;
            if (!hasChanges) return { ok: true };
            const result = await save({
                childId: seed.childId,
                row: seed.row,
                patch,
                identityBaseline: seed.identityBaseline,
            });
            if (result.ok) {
                baselineRef.current = { ...draftRef.current };
                return { ok: true };
            }
            return { ok: false, error: result.error || "Save failed" };
        },
    });

    const saving = editableCardIsSaving(edit.state);
    const locked = previewOnly || saving || edit.state.phase === "saved";

    const setField = (key: keyof ChildFocusEditValues, value: string) => {
        const next = { ...draftRef.current, [key]: value };
        setDraft(next);
        edit.notifyChange(childFocusEditDirtyForPolicy(next, baselineRef.current, editableKeys));
    };

    const handleCancel = () => {
        edit.reset();
        setDraft(baselineRef.current);
        onClose();
    };

    const rows = policy.filter((row) => row.displayed);

    return (
        <div className="alloy-os-card-edit" data-child-focus-edit="true" data-edit-child-id={seed.childId}>
            <p className="alloy-os-card-edit__title" data-child-edit-title="true">
                Edit {childName}
            </p>
            <div className="alloy-os-card-edit__form">
                {rows.map((row) => (
                    <ChildFocusEditRow
                        key={row.configKey}
                        row={row}
                        draft={draft}
                        locked={locked}
                        onChange={setField}
                    />
                ))}
            </div>

            {!previewOnly ? <EditableCardStatus state={edit.state} /> : null}

            {!previewOnly ? (
                <div className="alloy-os-card-edit__actions">
                    <button
                        type="button"
                        className="alloy-os-card-edit__btn"
                        data-testid="child-edit-cancel"
                        onClick={handleCancel}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="alloy-os-card-edit__btn alloy-os-card-edit__btn--primary"
                        data-testid="child-edit-save"
                        data-save-phase={edit.state.phase}
                        onClick={() => void edit.commit()}
                        disabled={!dirty || locked}
                    >
                        {saving ? "Saving…" : edit.state.phase === "saved" ? "✓ Saved" : "Save"}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function ChildFocusEditRow({
    row,
    draft,
    locked,
    onChange,
}: {
    row: ChildFocusEditFieldRow;
    draft: ChildFocusEditValues;
    locked: boolean;
    onChange: (key: keyof ChildFocusEditValues, value: string) => void;
}) {
    if (row.unsupported) {
        return (
            <div
                className="alloy-os-card-edit__row alloy-os-card-edit__row--locked"
                data-child-edit-field={row.configKey}
                data-domain-locked="true"
            >
                <span className="alloy-os-card-edit__label">{row.label}</span>
                <span className="alloy-os-card-edit__locked-note">Managed elsewhere</span>
            </div>
        );
    }

    if (!row.valueKey) return null;

    const readOnly = !row.editable;
    return (
        <label
            className="alloy-os-card-edit__row"
            data-child-edit-field={row.configKey}
            data-child-edit-readonly={readOnly ? "true" : undefined}
        >
            <span className="alloy-os-card-edit__label">{row.label}</span>
            <input
                className="alloy-os-card-edit__input"
                data-testid={`child-edit-${row.valueKey}`}
                type={row.inputType}
                value={draft[row.valueKey]}
                disabled={locked || readOnly}
                readOnly={readOnly}
                onChange={(e) => onChange(row.valueKey!, e.target.value)}
            />
        </label>
    );
}
