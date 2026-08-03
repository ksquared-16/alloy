/**
 * Canonical checksum for a business-process configuration payload (Law 4).
 *
 * Mirrors the Programs algorithm (`programPayloadChecksum`) deliberately — stable key order, then
 * sha256 over the serialized form — so the two domains on the shared publication runtime compute
 * `payload_checksum` the same way.
 *
 * Canonical ordering is not cosmetic: without it two semantically identical payloads hash
 * differently, which breaks both the no-op publish guard and any "has this actually changed?"
 * comparison an operator surface wants to make.
 *
 * Note this hashes the SERIALIZED payload. Unknown fields preserved by the Law 7 carrier are part
 * of the configuration and must be included, so callers pass the output of
 * `serializeLifecycleBuilderV1`, never the in-memory typed record.
 */

import { createHash } from "crypto";

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value != null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, entry]) => [key, stableValue(entry)]),
        );
    }
    return value;
}

export function businessProcessPayloadChecksum(payload: Record<string, unknown>): string {
    return createHash("sha256").update(JSON.stringify(stableValue(payload))).digest("hex");
}
