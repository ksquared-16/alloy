/**
 * Keys set only by public route handlers — clients must not supply trusted copies.
 */
const SERVER_CONTROLLED_META_KEYS = new Set(["client_ip_hash", "intake_resolution_path"]);

/**
 * Merge `payload.meta` for persistence: drop server-controlled keys from client input, then apply IP hash when known.
 */
export function mergePublicSubmissionMeta(
    meta: Record<string, unknown> | undefined,
    ipHash: string | null
): Record<string, unknown> {
    const base = { ...(meta ?? {}) };
    for (const k of SERVER_CONTROLLED_META_KEYS) {
        delete base[k];
    }
    if (ipHash) {
        base.client_ip_hash = ipHash;
    }
    return base;
}
