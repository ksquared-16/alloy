"use client";

import { useRef, useState } from "react";

import IdentityAvatarEditable from "@/components/admin/focusPanel/identity/IdentityAvatarEditable";
import { AlloySelect } from "@/components/workspace/AlloySelect";
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
import { useOperationalPlacementOptions } from "@/lib/childcareOperational/useOperationalPlacementOptions";

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
    const customerMemberId = seed.row.customer_member_id?.trim() || null;
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
                        customerMemberId={customerMemberId}
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
                        locationId={seed.row.location_id?.trim() || null}
                        locationLabel={seed.row.location_label?.trim() || null}
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
    locationId,
    locationLabel,
    onChange,
}: {
    row: ChildFocusEditFieldRow;
    draft: ChildFocusEditValues;
    locked: boolean;
    locationId: string | null;
    /** Site display name — never show raw location_id UUID to operators. */
    locationLabel: string | null;
    onChange: (key: keyof ChildFocusEditValues, value: string) => void;
}) {
    // Site select uses effective location; Program options cascade from draft.location_id.
    const placementSiteId = draft.location_id.trim() || locationId || "";
    const placement = useOperationalPlacementOptions(
        placementSiteId,
        draft.program_category_id,
    );

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
    const isLocation = row.valueKey === "location_id";
    const isProgram = row.valueKey === "program_category_id";

    if (isLocation && !readOnly) {
        const selectValue = draft.location_id.trim() || locationId || "";
        return (
            <label
                className="alloy-os-card-edit__row"
                data-child-edit-field={row.configKey}
            >
                <span className="alloy-os-card-edit__label">{row.label}</span>
                <AlloySelect
                    value={selectValue}
                    onChange={(next) => onChange("location_id", next)}
                    options={placement.siteOptions ?? []}
                    disabled={locked}
                    aria-label={row.label}
                    testId="child-edit-location_id"
                />
            </label>
        );
    }

    if (isProgram && !readOnly) {
        const options = placement.programCategoryIdOptions ?? placement.programOptions;
        return (
            <label
                className="alloy-os-card-edit__row"
                data-child-edit-field={row.configKey}
            >
                <span className="alloy-os-card-edit__label">{row.label}</span>
                <AlloySelect
                    value={draft.program_category_id}
                    onChange={(next) => onChange("program_category_id", next)}
                    options={options}
                    disabled={locked || placement.programDisabled}
                    aria-label={row.label}
                    testId="child-edit-program_category_id"
                />
            </label>
        );
    }

    const displayValue = isLocation ? (locationLabel ?? "") : draft[row.valueKey];

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
                type={isLocation || isProgram ? "text" : row.inputType}
                value={
                    isProgram
                        ? (optionsLabel(placement.programCategoryIdOptions ?? placement.programOptions, draft.program_category_id)
                            || draft.program_category_id)
                        : displayValue
                }
                disabled={locked || readOnly || isProgram}
                readOnly={readOnly || isProgram}
                placeholder={isLocation && !locationLabel ? "Not set" : undefined}
                onChange={(e) => {
                    if (isProgram) return;
                    onChange(row.valueKey!, e.target.value);
                }}
            />
        </label>
    );
}

function optionsLabel(
    options: ReadonlyArray<{ value: string; label: string }>,
    value: string,
): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return options.find((o) => o.value === trimmed)?.label ?? "";
}
