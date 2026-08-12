/**
 * RSC / Client Component prop boundary — strip non-JSON values (notably
 * `Symbol.for("alloy.config.unknownFields")` residue on parsed config).
 *
 * Next.js Flight cannot pass objects with symbol properties from Server → Client.
 * `JSON.stringify` ignores symbols; this is the deliberate client-boundary scrub.
 * Persistence writers must still use {@link serializeWithUnknownFields} so residue
 * survives read-modify-write — this helper is only for the RSC wire.
 */

export function toRscPlainJson<T>(value: T): T {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value)) as T;
}
