/**
 * Keys set only by public route handlers — clients must not supply trusted copies.
 */
const SERVER_CONTROLLED_META_KEYS = new Set([
    "client_ip_hash",
    "intake_resolution_path",
    "intake_error",
    "intake_skip_reason",
    "intake_match_strategy",
    "intake_match_confidence",
    "intake_needs_review",
    "intake_review_reason",
    "intake_candidate_email_count",
    "intake_candidate_phone_count",
]);

/**
 * Merge `payload.meta` for persistence: drop server-controlled keys from client input, then apply IP hash when known.
 * Strips `intake` — lead-capture hints are rebuilt server-side on submit from form values + link metadata.
 */
export function mergePublicSubmissionMeta(
    meta: Record<string, unknown> | undefined,
    ipHash: string | null
): Record<string, unknown> {
    const base = { ...(meta ?? {}) };
    for (const k of SERVER_CONTROLLED_META_KEYS) {
        delete base[k];
    }
    delete base.intake;
    if (ipHash) {
        base.client_ip_hash = ipHash;
    }
    return base;
}
