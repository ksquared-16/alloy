export type { AssembleStaleStateCheckArgs } from "@/lib/adminV2/bos/recommendations/fingerprints/assembleStaleStateCheck";

export { assembleStaleStateCheck } from "@/lib/adminV2/bos/recommendations/fingerprints/assembleStaleStateCheck";

export type { RecommendationSemanticFingerprintPayloadV1 } from "@/lib/adminV2/bos/recommendations/fingerprints/operationalRecommendationFingerprint";

export {
    buildRecommendationId,
    buildSemanticFingerprintPayload,
    buildStaleFingerprintInputs,
    computeSemanticInputsFingerprint,
    computeStaleInputsFingerprint,
    FINGERPRINT_ALGORITHM_VERSION,
    hashNormalizedSignalCodes,
    hashFingerprintPayload,
} from "@/lib/adminV2/bos/recommendations/fingerprints/operationalRecommendationFingerprint";
