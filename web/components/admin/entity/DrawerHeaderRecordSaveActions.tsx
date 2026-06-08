"use client";

import { RecordDrawerHeaderActionButton } from "@/components/admin/drawer/record/RecordDrawerActionRail";

/** Drawer header save/cancel — visible only when dirty; matches person/opportunity operating doctrine. */
export default function DrawerHeaderRecordSaveActions({
    canMutate,
    isDirty,
    saving,
    onSave,
    onCancel,
    saveSuccess,
    dirtyDataAttr = "drawer-record-dirty",
    saveDataAttr = "drawer-record-save-changes",
    revertDataAttr = "drawer-record-revert",
}: {
    canMutate: boolean;
    isDirty: boolean;
    saving: boolean;
    onSave: () => void | Promise<void>;
    onCancel: () => void;
    saveSuccess?: boolean;
    dirtyDataAttr?: string;
    saveDataAttr?: string;
    revertDataAttr?: string;
}) {
    if (!canMutate || !isDirty) return null;

    return (
        <>
            <span
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-800/90"
                data-person-drawer-dirty={dirtyDataAttr === "person-drawer-dirty" ? "true" : undefined}
                data-opportunity-drawer-dirty={dirtyDataAttr === "opportunity-drawer-dirty" ? "true" : undefined}
                data-drawer-record-dirty={dirtyDataAttr !== "person-drawer-dirty" && dirtyDataAttr !== "opportunity-drawer-dirty" ? "true" : undefined}
                aria-live="polite"
            >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                Unsaved
            </span>
            {saveSuccess ? <span className="text-sm text-alloy-juniper font-medium">Saved</span> : null}
            <RecordDrawerHeaderActionButton
                label="Cancel"
                disabled={saving}
                onClick={onCancel}
                data-person-drawer-revert={revertDataAttr === "person-drawer-revert" ? "true" : undefined}
                data-opportunity-drawer-revert={revertDataAttr === "opportunity-drawer-revert" ? "true" : undefined}
            />
            <RecordDrawerHeaderActionButton
                label={saving ? "Saving…" : "Save changes"}
                busy={saving}
                disabled={saving}
                onClick={() => void onSave()}
                data-person-drawer-save-changes={saveDataAttr === "person-drawer-save-changes" ? "true" : undefined}
                data-opportunity-drawer-save-changes={saveDataAttr === "opportunity-drawer-save-changes" ? "true" : undefined}
            />
        </>
    );
}
