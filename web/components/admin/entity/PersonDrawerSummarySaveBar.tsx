"use client";

/** Explicit save affordance for parent/child summary — Bend Pine primary. */
export default function PersonDrawerSummarySaveBar({
    dirty,
    saving,
    canMutate,
    onSave,
}: {
    dirty: boolean;
    saving: boolean;
    canMutate: boolean;
    onSave: () => void;
}) {
    if (!canMutate) return null;

    return (
        <div
            className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-alloy-stone/15 pt-3"
            data-person-drawer-summary-save-bar="true"
        >
            {dirty ? (
                <span className="text-[11px] font-medium text-amber-800/85" data-person-drawer-summary-dirty="true">
                    Unsaved changes
                </span>
            ) : (
                <span className="text-[11px] text-alloy-midnight/40">All changes saved</span>
            )}
            <button
                type="button"
                disabled={!dirty || saving}
                onClick={onSave}
                className="rounded-md border border-alloy-pine/40 bg-alloy-pine px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-alloy-pine/90 disabled:cursor-not-allowed disabled:border-alloy-stone/25 disabled:bg-alloy-stone/20 disabled:text-alloy-midnight/45"
                data-person-drawer-summary-save="true"
            >
                {saving ? "Saving…" : "Save"}
            </button>
        </div>
    );
}
