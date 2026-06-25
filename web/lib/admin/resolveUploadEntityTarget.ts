/**
 * Decide the entity target for a document upload (pure, testable).
 *
 * Existing behavior is preserved: a normal upload still REQUIRES a valid
 * `entity_type` + `entity_id`. The only new path is POS document intake — when the
 * caller opts into a Processing Case (`open_processing_case=true`) but has no CRM
 * entity yet, the document is accepted as entity-less `pos_intake` (the `documents`
 * table allows null `entity_type`/`entity_id`). Matching a document to a record is a
 * later sprint; this just lets the artifact enter the spine.
 */

export type UploadEntityTarget =
    | { ok: true; mode: "entity"; canonicalType: string; entityId: string }
    | { ok: true; mode: "pos_intake" }
    | { ok: false; code: "MISSING_ENTITY" | "UNSUPPORTED_ENTITY"; message: string };

export function resolveUploadEntityTarget(
    input: { openProcessingCase: boolean; entityTypeRaw: string; entityId: string },
    canonicalMap: Record<string, string>
): UploadEntityTarget {
    const hasEntity = Boolean(input.entityTypeRaw && input.entityId);

    if (!hasEntity) {
        // POS intake may upload without a CRM entity; everything else still requires one.
        if (input.openProcessingCase) return { ok: true, mode: "pos_intake" };
        return { ok: false, code: "MISSING_ENTITY", message: "entity_type and entity_id are required" };
    }

    const canonicalType = canonicalMap[input.entityTypeRaw] ?? input.entityTypeRaw;
    const valid =
        Boolean(canonicalMap[input.entityTypeRaw]) || Object.values(canonicalMap).includes(canonicalType);
    if (!valid) return { ok: false, code: "UNSUPPORTED_ENTITY", message: "Unsupported entity_type" };

    return { ok: true, mode: "entity", canonicalType, entityId: input.entityId };
}
