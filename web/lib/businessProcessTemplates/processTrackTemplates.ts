/**
 * WHICH CANONICAL TRACK CONFIGURATION AN EXISTING PROCESS MAY ADOPT.
 *
 * `applyEnrollmentTemplateToProcess` refuses a process that already has stages, and that refusal is
 * correct — it seeds a whole process and would otherwise overwrite authored work. But it left a real
 * gap: a builder-owned process that grew its own stages could never obtain `tracks_v1`, and without
 * `tracks_v1` the runtime resolver stays on legacy routing forever. Mixed-grain routing was
 * effectively exclusive to processes created after the template existed.
 *
 * This registry closes that gap by separating the two things the template was conflating: the STAGE
 * INVENTORY (which an existing process already owns and must keep) and the TRACK MODEL (which it
 * may adopt). Adoption takes only the second.
 *
 * ── WHY THE MAPPING LIVES HERE AND NOT IN THE EVALUATOR ──
 *
 * Assigning a stage to a track is a template judgement: only the template knows that a `child`-grain
 * stage belongs in `child_track`, because only the template named the tracks. The generic evaluator
 * in `lib/businessProcesses/configuration/processTrackAdoption.ts` APPLIES this descriptor and
 * never reads a track key, stage key or subject string of its own. That is the configuration/runtime
 * line: Enrollment defaults are allowed to be Enrollment-specific as long as they are DATA the
 * platform interprets generically.
 *
 * Generic runtime must NOT import this module.
 */

import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";
import {
    ENROLLMENT_DEFAULT_TRACKS,
    ENROLLMENT_STAGE_SPECS,
    ENROLLMENT_TEMPLATE_PROCESS_KEY,
    ENROLLMENT_TRACK_CHILD_KEY,
    ENROLLMENT_TRACK_FAMILY_KEY,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";

export type ProcessTrackAdoptionTemplate = {
    /** The process key this canonical track model belongs to. */
    process_key: string;
    /** The track model a freshly template-instantiated process of this key receives. */
    tracks: ProcessTracksV1;
    /**
     * Canonical track for a stage the template itself defines, by stage key.
     *
     * Consulted FIRST so a tenant that kept the template's stage keys lands on exactly the
     * assignment a new instantiation would have produced, even if that stage's grain has since
     * drifted — the drift then surfaces as a grain blocker rather than being quietly encoded into a
     * track assignment.
     */
    track_key_by_stage_key: Readonly<Record<string, string>>;
    /**
     * Fallback for stages the template has never heard of — the ones a tenant added themselves.
     *
     * A tenant's own stage still has a grain, and grain is exactly the fact that decides which
     * subject a track carries, so this is the only inference the platform needs and the template is
     * the only thing entitled to make it.
     */
    track_key_by_grain: Readonly<Partial<Record<StageGrain, string>>>;
};

const ENROLLMENT_TRACK_ADOPTION: ProcessTrackAdoptionTemplate = {
    process_key: ENROLLMENT_TEMPLATE_PROCESS_KEY,
    tracks: ENROLLMENT_DEFAULT_TRACKS,
    track_key_by_stage_key: Object.fromEntries(
        ENROLLMENT_STAGE_SPECS.map((spec) => [spec.key, spec.track_key]),
    ),
    track_key_by_grain: {
        family: ENROLLMENT_TRACK_FAMILY_KEY,
        child: ENROLLMENT_TRACK_CHILD_KEY,
    },
};

const REGISTRY: ReadonlyMap<string, ProcessTrackAdoptionTemplate> = new Map([
    [ENROLLMENT_TRACK_ADOPTION.process_key, ENROLLMENT_TRACK_ADOPTION],
]);

/**
 * The canonical track model a process of this key may adopt, or null when none is published.
 *
 * A process key with no entry is not an error — it means the platform has no canonical track model
 * to offer, and the adoption control simply does not appear for it.
 */
export function trackAdoptionTemplateForProcessKey(
    processKey: string | null | undefined,
): ProcessTrackAdoptionTemplate | null {
    const key = typeof processKey === "string" ? processKey.trim() : "";
    if (!key) return null;
    const found = REGISTRY.get(key);
    // Cloned on the way out: the caller writes the result into a draft that is then edited, and a
    // shared frozen-by-convention constant is one careless spread away from being mutated in place.
    return found ? structuredClone(found) : null;
}

/** Process keys the platform publishes a canonical track model for. */
export function processKeysWithAdoptableTracks(): string[] {
    return [...REGISTRY.keys()].sort();
}
