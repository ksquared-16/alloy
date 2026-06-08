import { canConfirmStatusesStep } from "@/lib/lifecycle/lifecycleActivationStep3";
import {
    isStatusDraftDirtyForStage,
    normalizeLifecycleBuilderStageKey,
    statusDraftKeysForStage,
    type StatusDraftByStageKey,
} from "@/lib/lifecycle/lifecycleStatusStepDraft";

export const LIFECYCLE_STATUS_STATE_SPLIT = "LIFECYCLE_STATUS_STATE_SPLIT" as const;

export type LifecycleStatusesSaveState = {
    stageKey: string;
    stageLabel: string;
    normalizedStageKey: string;
    /** Keys driving checkbox `checked` state — same array as saveDraftKeys. */
    checkboxSelectedKeys: string[];
    saveDraftKeys: string[];
    canSaveStatuses: boolean;
    disabledReason: string | null;
    dirty: boolean;
};

export function resolveLifecycleStatusesSaveState(params: {
    stageKey: string;
    stageLabel: string;
    statusDraftByStageKey: StatusDraftByStageKey;
    statusDraftDirtyByStage: Record<string, boolean>;
    statusesLoading: boolean;
    statusesSaving: boolean;
}): LifecycleStatusesSaveState {
    const normalizedStageKey = normalizeLifecycleBuilderStageKey(params.stageKey);
    const saveDraftKeys = statusDraftKeysForStage(params.statusDraftByStageKey, normalizedStageKey);
    const checkboxSelectedKeys = saveDraftKeys;
    const canSaveStatuses = canConfirmStatusesStep({
        statusesLoading: params.statusesLoading,
        statusesSaving: params.statusesSaving,
        draftCount: saveDraftKeys.length,
    });
    const disabledReason = resolveStatusesSaveDisabledReason({
        normalizedStageKey,
        draftCount: saveDraftKeys.length,
        statusesLoading: params.statusesLoading,
        statusesSaving: params.statusesSaving,
    });
    const dirty = isStatusDraftDirtyForStage(params.statusDraftDirtyByStage, normalizedStageKey);
    return {
        stageKey: params.stageKey,
        stageLabel: params.stageLabel,
        normalizedStageKey,
        checkboxSelectedKeys,
        saveDraftKeys,
        canSaveStatuses,
        disabledReason,
        dirty,
    };
}

export function resolveStatusesSaveDisabledReason(params: {
    normalizedStageKey: string;
    draftCount: number;
    statusesLoading: boolean;
    statusesSaving: boolean;
}): string | null {
    if (!params.normalizedStageKey) return "no_active_stage";
    if (params.statusesLoading) return "statuses_loading";
    if (params.statusesSaving) return "statuses_saving";
    if (params.draftCount < 1) return "no_status_selected";
    return null;
}

export function detectLifecycleStatusStateSplit(params: {
    checkboxSelectedKeys: readonly string[];
    saveDraftKeys: readonly string[];
    mountedInstanceIds: readonly string[];
    stageKey: string;
    normalizedStageKey: string;
}): { split: boolean; detail: Record<string, unknown> } {
    const checkbox = [...params.checkboxSelectedKeys].sort();
    const save = [...params.saveDraftKeys].sort();
    const split = checkbox.length > 0 && save.length === 0;
    return {
        split,
        detail: {
            code: LIFECYCLE_STATUS_STATE_SPLIT,
            mountedInstanceIds: [...params.mountedInstanceIds],
            stageKey: params.stageKey,
            normalizedStageKey: params.normalizedStageKey,
            checkboxSelectedKeys: checkbox,
            saveDraftKeys: save,
        },
    };
}

/** Tracks mounted LifecycleStatusesCard instances (dev/debug). */
const statusesCardInstances = new Map<string, { stageKey: string; mountedAt: number }>();
let statusesCardInstanceSeq = 0;

export function registerLifecycleStatusesCardInstance(stageKey: string): string {
    const id = `statuses-card-${++statusesCardInstanceSeq}`;
    statusesCardInstances.set(id, {
        stageKey: normalizeLifecycleBuilderStageKey(stageKey),
        mountedAt: Date.now(),
    });
    return id;
}

export function unregisterLifecycleStatusesCardInstance(instanceId: string): void {
    statusesCardInstances.delete(instanceId);
}

export function getLifecycleStatusesCardMountSnapshot(): {
    count: number;
    instanceIds: string[];
} {
    const instanceIds = [...statusesCardInstances.keys()];
    return { count: instanceIds.length, instanceIds };
}

export function __resetLifecycleStatusesCardMountRegistryForTests(): void {
    statusesCardInstances.clear();
    statusesCardInstanceSeq = 0;
}

/** Row click / explicit activate — next `selected` for `onToggleStatus(statusKey, selected)`. */
export function resolveLifecycleStatusRowToggleSelected(
    currentlyChecked: boolean
): boolean {
    return !currentlyChecked;
}
