/**
 * Unwrap the standard entity-read success envelope.
 *
 * `GET /api/admin/entity/[type]/[id]` returns `{ ok: true, data: { entity }, correlation_id }`
 * (Phase 2D contract). This helper extracts the bare entity record so existing
 * downstream consumers (snapshot cache writers, readiness predicates, `_create`
 * checks) keep operating on the identical record shape they did before migration.
 *
 * Returns `null` when the body is absent, a failure envelope, or missing `data.entity`.
 *
 * @see docs/api/api-response-contract.md
 * @see docs/api/entity-record-api.md
 */
export function unwrapEntityRecord(json: unknown): Record<string, unknown> | null {
    if (!json || typeof json !== "object") return null;
    const entity = (json as { data?: { entity?: unknown } }).data?.entity;
    return entity && typeof entity === "object" ? (entity as Record<string, unknown>) : null;
}
