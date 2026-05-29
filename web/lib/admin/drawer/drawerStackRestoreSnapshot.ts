/** Shell/UI state captured when pushing an opportunity drawer onto the stack (Back restore). */

const TTL_MS = 120_000;

export type OpportunityDrawerRestoreShell = {
    drawerTab: string;
    opportunityBootstrapAppliedId: string | null;
    opportunityDrawerBelowFoldRevealed: boolean;
    opportunityDrawerSecondaryReady: boolean;
    opportunityDrawerEnrichmentHeld: boolean;
    opportunityDrawerFirstPaintPreloaded: boolean;
    capturedAt: number;
};

type RestoreEntry = OpportunityDrawerRestoreShell;

const restoreByKey = new Map<string, RestoreEntry>();

export function drawerStackRestoreKey(type: string, id: string): string {
    return `${type}:${id}`;
}

export function putDrawerStackRestoreSnapshot(
    type: string | null | undefined,
    id: string | null | undefined,
    shell: Omit<OpportunityDrawerRestoreShell, "capturedAt"> | null | undefined
): void {
    if (!type?.trim() || !id?.trim() || id === "new" || shell == null) return;
    restoreByKey.set(drawerStackRestoreKey(type, id), {
        ...shell,
        capturedAt: Date.now(),
    });
}

export function peekDrawerStackRestoreSnapshot(
    type: string | null | undefined,
    id: string | null | undefined
): OpportunityDrawerRestoreShell | null {
    if (!type?.trim() || !id?.trim() || id === "new") return null;
    const ent = restoreByKey.get(drawerStackRestoreKey(type, id));
    if (!ent) return null;
    if (Date.now() - ent.capturedAt > TTL_MS) {
        restoreByKey.delete(drawerStackRestoreKey(type, id));
        return null;
    }
    return ent;
}

/** @internal test helper */
export function __clearDrawerStackRestoreSnapshotsForTests(): void {
    restoreByKey.clear();
}
