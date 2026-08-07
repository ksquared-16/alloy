/**
 * Authoring convenience: same-subject stage destinations only.
 *
 * Keeps grain-incompatible stages (e.g. child Waitlist) out of family
 * `move_to_stage` / Ways Out destination pickers. Server validators remain
 * defense in depth — this is UX only.
 */

import { resolveStageGrain, type StageGrain } from "@/lib/lifecycle/stageGrainResolution";

export type StageDestinationOption = {
    key: string;
    label: string;
    grain?: string | null;
};

/**
 * Filter process stages to destinations compatible with the current stage grain.
 * When `entityGrain` is null/unknown, returns all destinations except self (fail-open for authoring).
 * When a destination's grain cannot be resolved, it is withheld rather than offered.
 */
export function filterGrainCompatibleStageDestinations(input: {
    processStages: ReadonlyArray<StageDestinationOption>;
    stageKey: string;
    entityGrain: StageGrain | null;
}): StageDestinationOption[] {
    const stageKey = input.stageKey.trim();
    return input.processStages
        .filter((stage) => stage.key.trim() && stage.key !== stageKey)
        .filter((stage) => {
            if (!input.entityGrain) return true;
            const resolution = resolveStageGrain({
                stageKey: stage.key,
                configuredMetadataGrain: stage.grain,
            });
            return resolution.ok && resolution.grain === input.entityGrain;
        });
}

/** Journey segment on the operating plan → family/child grain for destination filtering. */
export function entityGrainFromJourneySegment(
    journeySegment: string | null | undefined,
): StageGrain | null {
    if (journeySegment === "child") return "child";
    if (journeySegment === "family") return "family";
    return null;
}
