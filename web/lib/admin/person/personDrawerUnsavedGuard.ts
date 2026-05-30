/** Optional dirty-state gate for person drawer summary saves (close / back / navigate). */

let dirtyChecker: (() => boolean) | null = null;

export function setPersonDrawerUnsavedChecker(check: (() => boolean) | null): void {
    dirtyChecker = check;
}

export function personDrawerHasUnsavedChanges(): boolean {
    return dirtyChecker?.() ?? false;
}

export const PERSON_DRAWER_UNSAVED_CONFIRM_MESSAGE =
    "You have unsaved changes on this person. Leave without saving?";

export function confirmDiscardPersonDrawerUnsaved(): boolean {
    if (!personDrawerHasUnsavedChanges()) return true;
    if (typeof window === "undefined") return false;
    return window.confirm(PERSON_DRAWER_UNSAVED_CONFIRM_MESSAGE);
}
