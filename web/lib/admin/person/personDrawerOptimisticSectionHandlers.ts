import type { DrawerOperatingSaveSectionOptions } from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";

type PersonDrawerOptimisticSectionArgs = {
    isDirty: () => boolean;
    buildPatch: () => Record<string, unknown>;
    /**
     * Propagate the CONFIRMED patch to the parent record (and sync the local draft). Called only
     * after the server confirms — never before — so a failed save never leaves an unconfirmed value
     * in the record.
     */
    applyRecordPatch: (patch: Record<string, unknown>) => void;
    confirmSave: (patch: Record<string, unknown>) => Promise<void>;
};

/**
 * Shared Save-All handlers for person drawer operating sections.
 *
 * Failure contract (canonical — no silent data loss): the record/server baseline is never mutated
 * before the server confirms, so on a failed Save-All there is nothing to undo — the operator's
 * draft is retained, the card stays dirty, and the error surfaces for retry. On success the
 * confirmed patch propagates to the parent record. (Previously `applyOptimistic` mutated the parent
 * record up-front and `rollbackOptimistic` reverted only the draft — which discarded the operator's
 * edit and left the parent record inconsistent with the server.)
 */
export function createPersonDrawerOptimisticSectionHandlers(args: PersonDrawerOptimisticSectionArgs) {
    let pendingPatch: Record<string, unknown> | null = null;

    return {
        applyOptimistic: () => {
            // Capture the patch for confirm; do NOT mutate the record before the server confirms.
            if (!args.isDirty()) return;
            const patch = args.buildPatch();
            if (Object.keys(patch).length === 0) return;
            pendingPatch = patch;
        },
        rollbackOptimistic: () => {
            // Nothing was committed to the record, so there is nothing to undo. The operator's draft
            // is retained (still dirty), so they can retry.
            pendingPatch = null;
        },
        save: async (_options?: DrawerOperatingSaveSectionOptions) => {
            const patch = pendingPatch ?? args.buildPatch();
            if (Object.keys(patch).length === 0) return;
            await args.confirmSave(patch);
            // Confirmed — the patch is now server truth; propagate it to the parent record + draft.
            args.applyRecordPatch(patch);
            pendingPatch = null;
        },
    };
}
