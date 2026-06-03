import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";

export type StatusDraftByStageKey = Record<string, string[]>;

export function normalizeLifecycleBuilderStageKey(stageKey: string): string {
    return stageKey.trim();
}

export function statusDraftKeysForStage(
    draftByStage: StatusDraftByStageKey,
    stageKey: string
): string[] {
    const key = normalizeLifecycleBuilderStageKey(stageKey);
    if (!key) return [];
    return [...(draftByStage[key] ?? [])];
}

/** Do not replace a non-empty local draft/saved with an empty server snapshot. */
export function shouldApplyServerStatusKeysForStage(
    draftByStage: StatusDraftByStageKey,
    savedByStage: StatusDraftByStageKey,
    stageKey: string,
    serverKeys: readonly string[]
): boolean {
    if (serverKeys.length > 0) return true;
    const sk = normalizeLifecycleBuilderStageKey(stageKey);
    if (!sk) return false;
    const draftLen = draftByStage[sk]?.length ?? 0;
    const savedLen = savedByStage[sk]?.length ?? 0;
    return draftLen === 0 && savedLen === 0;
}

export function statusDraftSetForStage(
    draftByStage: StatusDraftByStageKey,
    stageKey: string
): Set<string> {
    return new Set(statusDraftKeysForStage(draftByStage, stageKey));
}

export function isStatusDraftDirtyForStage(
    dirtyByStage: Record<string, boolean>,
    stageKey: string
): boolean {
    const key = normalizeLifecycleBuilderStageKey(stageKey);
    if (!key) return false;
    return Boolean(dirtyByStage[key]);
}

/** Whether server/bootstrap payload may replace draft for this stage. */
export function shouldSyncStatusDraftForStage(
    dirtyByStage: Record<string, boolean>,
    stageKey: string
): boolean {
    return !isStatusDraftDirtyForStage(dirtyByStage, stageKey);
}

/** Keys for the active stage after toggling one status (card row / checkbox). */
export function draftKeysAfterStatusToggle(
    currentKeys: readonly string[],
    statusKey: string,
    selected: boolean
): string[] {
    const status = statusKey.trim();
    if (!status) return [...currentKeys];
    const next = new Set(currentKeys);
    if (selected) next.add(status);
    else next.delete(status);
    return [...next];
}

export function mergeStatusDraftToggle(
    draftByStage: StatusDraftByStageKey,
    stageKey: string,
    statusKey: string,
    selected: boolean
): StatusDraftByStageKey {
    const sk = normalizeLifecycleBuilderStageKey(stageKey);
    const status = statusKey.trim();
    if (!sk || !status) return draftByStage;
    const keys = draftKeysAfterStatusToggle(draftByStage[sk] ?? [], status, selected);
    return { ...draftByStage, [sk]: keys };
}

export function writeStatusDraftForStage(
    draftByStage: StatusDraftByStageKey,
    stageKey: string,
    keys: readonly string[]
): StatusDraftByStageKey {
    const sk = normalizeLifecycleBuilderStageKey(stageKey);
    if (!sk) return draftByStage;
    return { ...draftByStage, [sk]: [...keys] };
}

export function logLifecycleStatusStepDebug(
    event: string,
    payload: Record<string, unknown>
): void {
    if (!isLifecycleDebugUiEnabled()) return;
    console.info(`[lifecycle-status-step] ${event}`, payload);
}
