/** Optional dirty-state gate for person drawer summary saves (close / back / navigate). */

import { personDrawerOperatingRevertAll } from "@/lib/admin/person/personDrawerEditingCoordinator";

let dirtyChecker: (() => boolean) | null = null;

export function setPersonDrawerUnsavedChecker(check: (() => boolean) | null): void {
    dirtyChecker = check;
}

export function personDrawerHasUnsavedChanges(): boolean {
    return dirtyChecker?.() ?? false;
}

export type PersonDrawerUnsavedPromptRequest = {
    onDiscard: () => void;
};

let promptOpener: ((request: PersonDrawerUnsavedPromptRequest) => void) | null = null;

export function setPersonDrawerUnsavedPromptOpener(
    opener: ((request: PersonDrawerUnsavedPromptRequest) => void) | null
): void {
    promptOpener = opener;
}

/**
 * When the person drawer has unsaved operating edits, opens the branded modal and returns false.
 * Callers should run `onDiscard` from the modal (revert + pending navigation).
 */
export function confirmDiscardPersonDrawerUnsaved(onProceed: () => void): boolean {
    if (!personDrawerHasUnsavedChanges()) {
        onProceed();
        return true;
    }
    if (typeof window === "undefined" || !promptOpener) return false;
    promptOpener({
        onDiscard: () => {
            personDrawerOperatingRevertAll();
            onProceed();
        },
    });
    return false;
}

/** @deprecated Tests only — prefer confirmDiscardPersonDrawerUnsaved with a proceed callback. */
export function confirmDiscardPersonDrawerUnsavedLegacy(): boolean {
    return !personDrawerHasUnsavedChanges();
}
