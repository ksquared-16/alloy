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
    tone = "default",
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
    tone?: "default" | "footer";
}) {
    if (!canMutate) return null;
    if (!isDirty && !saveSuccess) return null;

    const unsavedTone =
        tone === "footer" ?
            "inline-flex items-center gap-1.5 text-[11px] font-medium text-alloy-midnight/80"
        :   "inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-800/90";
    const dotTone = tone === "footer" ? "bg-alloy-ember" : "bg-amber-500";
    const footerCancelBtn =
        "rounded-md border border-alloy-midnight/12 bg-white px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/75 hover:bg-alloy-stone/70";
    const footerSaveBtn =
        "rounded-md border border-alloy-juniper/40 bg-alloy-juniper px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-juniper/90";

    if (!isDirty && saveSuccess) {
        return (
            <span
                className="text-[11px] font-semibold text-alloy-juniper"
                data-opportunity-drawer-save-success="true"
                aria-live="polite"
            >
                Saved
            </span>
        );
    }

    return (
        <>
            <span
                className={unsavedTone}
                data-person-drawer-dirty={dirtyDataAttr === "person-drawer-dirty" ? "true" : undefined}
                data-opportunity-drawer-dirty={dirtyDataAttr === "opportunity-drawer-dirty" ? "true" : undefined}
                data-drawer-record-dirty={
                    dirtyDataAttr !== "person-drawer-dirty" && dirtyDataAttr !== "opportunity-drawer-dirty"
                        ? "true"
                        : undefined
                }
                aria-live="polite"
            >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTone}`} aria-hidden />
                Unsaved
            </span>
            {saveSuccess ?
                <span className="text-[11px] font-semibold text-alloy-juniper">Saved</span>
            :   null}
            <RecordDrawerHeaderActionButton
                label="Cancel"
                disabled={saving}
                onClick={onCancel}
                className={tone === "footer" ? footerCancelBtn : undefined}
                data-person-drawer-revert={revertDataAttr === "person-drawer-revert" ? "true" : undefined}
                data-opportunity-drawer-revert={revertDataAttr === "opportunity-drawer-revert" ? "true" : undefined}
            />
            <RecordDrawerHeaderActionButton
                label={saving ? "Saving…" : "Save changes"}
                busy={saving}
                disabled={saving}
                onClick={() => void onSave()}
                className={tone === "footer" ? footerSaveBtn : undefined}
                data-person-drawer-save-changes={saveDataAttr === "person-drawer-save-changes" ? "true" : undefined}
                data-opportunity-drawer-save-changes={saveDataAttr === "opportunity-drawer-save-changes" ? "true" : undefined}
            />
        </>
    );
}
