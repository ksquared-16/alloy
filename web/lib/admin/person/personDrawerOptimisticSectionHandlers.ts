import type { DrawerOperatingSaveSectionOptions } from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";

type PersonDrawerOptimisticSectionArgs = {
    isDirty: () => boolean;
    buildPatch: () => Record<string, unknown>;
    applyRecordPatch: (patch: Record<string, unknown>) => void;
    revertDraft: () => void;
    confirmSave: (patch: Record<string, unknown>) => Promise<void>;
};

/** Shared optimistic Save All handlers for person drawer operating sections. */
export function createPersonDrawerOptimisticSectionHandlers(args: PersonDrawerOptimisticSectionArgs) {
    let pendingPatch: Record<string, unknown> | null = null;
    let reverted = false;

    return {
        applyOptimistic: () => {
            if (!args.isDirty()) return;
            pendingPatch = args.buildPatch();
            if (Object.keys(pendingPatch).length === 0) return;
            reverted = false;
            args.applyRecordPatch(pendingPatch);
        },
        rollbackOptimistic: () => {
            reverted = true;
            pendingPatch = null;
            args.revertDraft();
        },
        save: async (options?: DrawerOperatingSaveSectionOptions) => {
            const patch = pendingPatch ?? args.buildPatch();
            if (Object.keys(patch).length === 0) return;
            await args.confirmSave(patch);
            if (!reverted) {
                pendingPatch = null;
            }
        },
    };
}
