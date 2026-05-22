/**
 * Stale-state check assembly (Phase 1 / Card 1.3).
 */

import {
    buildStaleFingerprintInputs,
    computeStaleInputsFingerprint,
    FINGERPRINT_ALGORITHM_VERSION,
    hashNormalizedSignalCodes,
} from "@/lib/adminV2/bos/recommendations/fingerprints/operationalRecommendationFingerprint";
import type { OperationalRecommendationStaleInputsV1 } from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";
import type { GroundingSignalV1, StaleStateCheckV1 } from "@/lib/adminV2/bos/recommendations/types";

export type AssembleStaleStateCheckArgs = {
    entity_id: string;
    stale_inputs: OperationalRecommendationStaleInputsV1;
    evaluated_at_iso: string;
    normalized_signals: GroundingSignalV1[];
    /** When comparing live state in later cards; false at initial build. */
    is_stale?: boolean;
};

/**
 * Build {@link StaleStateCheckV1} for a freshly built recommendation.
 * `source_signals_hash` is represented via normalized signal codes inside fingerprint inputs
 * (execution pack uses `fingerprint_inputs` + `inputs_fingerprint` only on wire).
 */
export function assembleStaleStateCheck(args: AssembleStaleStateCheckArgs): StaleStateCheckV1 {
    const fingerprint_inputs = buildStaleFingerprintInputs({
        entity_id: args.entity_id,
        stale: args.stale_inputs,
    });
    const inputs_fingerprint = computeStaleInputsFingerprint(fingerprint_inputs);
    // Deterministic auxiliary digest for tests / future compare (not a separate wire field).
    void hashNormalizedSignalCodes(args.normalized_signals);

    return {
        fingerprint_version: FINGERPRINT_ALGORITHM_VERSION,
        inputs_fingerprint,
        fingerprint_inputs,
        evaluated_at_iso: args.evaluated_at_iso,
        is_stale: args.is_stale ?? false,
        stale_reason: null,
    };
}
