"use client";

import { useRef, useState } from "react";

import IdentityAvatarEditable from "@/components/admin/focusPanel/identity/IdentityAvatarEditable";
import { EditableCardStatus } from "@/lib/experience/editing/EditableCardStatus";
import { editableCardIsSaving, type EditableCardState } from "@/lib/experience/editing/editableCardRuntime";
import { useEditableCardRuntime } from "@/lib/experience/editing/useEditableCardRuntime";
import {
    CHILDREN_SAVE_PERF_MARK,
    markChildrenSavePerf,
    measureChildrenSavePerf,
} from "@/lib/experience/editing/childrenSavePerfMarks";
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
import { groupShowAvatarForNestedGroup } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { FocusPanelPhotoSaveResult, FocusPanelSaveResult } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { ChildFocusSavePatch } from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";

const SAVED_BEAT_MS = 900;

/** The single `idle|saving|saved|error` vocabulary for `data-children-save-state`. */
function childrenSaveStateAttr(state: EditableCardState): "idle" | "saving" | "saved" | "error" {
    if (state.error) return "error";
    if (state.phase === "saving") return "saving";
    if (state.phase === "saved") return "saved";
    return "idle";
}

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
    /** Current resolved photo (person/document evidence) — display only until changed. */
    imageUrl?: string | null;
    /**
     * Persist a just-uploaded document as this child's canonical profile photo.
     * Omitted when the mutation seam doesn't support it (e.g. dev/preview harnesses).
     */
    savePhoto?: (args: { childId: string; personId: string; documentId: string }) => Promise<FocusPanelPhotoSaveResult>;
    clearPhoto?: (args: { childId: string; personId: string }) => Promise<FocusPanelPhotoSaveResult>;
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
    imageUrl = null,
    savePhoto,
    clearPhoto,
}: Props) {
    const policy = resolveChildFocusEditPolicy(childSurfaceConfig, undefined, {
        hasCommittedPrimaryAssignment: seed.hasCommittedPrimaryAssignment === true,
    });
    const editableKeys = editableChildFocusValueKeys(policy);

    const [draft, setDraft] = useState<ChildFocusEditValues>(seed.values);
    const baselineRef = useRef<ChildFocusEditValues>(seed.values);
    const draftRef = useRef(draft);
    draftRef.current = draft;

    const dirty = childFocusEditDirtyForPolicy(draft, baselineRef.current, editableKeys);

    const edit = useEditableCardRuntime({
        dirty,
        acknowledgeMs: SAVED_BEAT_MS,
        onAcknowledge: () => {
            markChildrenSavePerf(CHILDREN_SAVE_PERF_MARK.done);
            measureChildrenSavePerf(
                "children-save-total",
                CHILDREN_SAVE_PERF_MARK.click,
                CHILDREN_SAVE_PERF_MARK.done,
            );
            (onSaved ?? onClose)();
        },
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
            markChildrenSavePerf(CHILDREN_SAVE_PERF_MARK.request);
            const result = await save({
                childId: seed.childId,
                row: seed.row,
                patch,
                identityBaseline: seed.identityBaseline,
            });
            markChildrenSavePerf(CHILDREN_SAVE_PERF_MARK.response);
            measureChildrenSavePerf(
                "children-save-network",
                CHILDREN_SAVE_PERF_MARK.request,
                CHILDREN_SAVE_PERF_MARK.response,
            );
            if (result.ok) {
                baselineRef.current = { ...draftRef.current };
                return { ok: true };
            }
            return { ok: false, error: result.error || "Save failed" };
        },
    });

    const saveState = childrenSaveStateAttr(edit.state);

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

    const handleSaveClick = () => {
        // Guard double-submit at the click boundary too — commit() itself is idempotent
        // (savingRef), but this keeps the perf mark honest to the FIRST click only.
        if (saving || !dirty || locked) return;
        markChildrenSavePerf(CHILDREN_SAVE_PERF_MARK.click);
        void edit.commit();
    };

    const personId = seed.row.person_id?.trim() || null;
    // Surfaces Avatar on → render + allow upload when editable (Photos toggle only affects display URL).
    const avatarEnabled = !childSurfaceConfig || groupShowAvatarForNestedGroup(childSurfaceConfig, "identity");

    return (
        <div
            className="alloy-os-card-edit"
            data-child-focus-edit="true"
            data-edit-child-id={seed.childId}
            data-children-save-state={saveState}
            data-child-edit-photos={avatarEnabled ? "on" : "off"}
        >
            <p className="alloy-os-card-edit__title" data-child-edit-title="true">
                Edit {childName}
            </p>
            {!previewOnly && savePhoto && avatarEnabled ? (
                <div className="alloy-os-card-edit__avatar" data-child-edit-avatar="true">
                    <IdentityAvatarEditable
                        name={childName}
                        imageUrl={imageUrl}
                        size={48}
                        visible={true}
                        recordId={seed.childId}
                        personId={personId}
                        onSavePhoto={savePhoto}
                        onClearPhoto={clearPhoto}
                        disabled={locked}
                    />
                </div>
            ) : null}
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
                        onClick={handleSaveClick}
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
