/**
 * Deterministic payload fingerprint for authoring-intake idempotency (P1 · Wave B).
 *
 * Same authoring payload → same fingerprint, independent of key ordering. A retry
 * with the same idempotency key but a DIFFERENT fingerprint is an idempotency
 * conflict (mirrors the `plan_content_hash` precedent). Pure; no IO.
 */

import { createHash } from "node:crypto";
import type { AuthoringInput } from "@/lib/operationalExpectations/intake/authoringTypes";

/** Stable JSON: object keys sorted recursively so ordering never changes the hash. */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Fingerprint the MATERIAL authoring content (everything that defines the act
 * except the idempotency key itself). Two requests with the same key must carry
 * the same material payload or the intake rejects the retry as a conflict.
 */
export function fingerprintAuthoringInput(input: AuthoringInput): string {
    const material = {
        verb: input.verb,
        authority: input.authority,
        modality: input.modality,
        subjects: input.subjects,
        condition: input.condition,
        temporalFrame: input.temporalFrame,
        beneficiary: input.beneficiary ?? null,
        footprint: input.footprint,
        configVersionRef: input.configVersionRef ?? null,
        predecessorId: input.predecessorId ?? null,
    };
    return createHash("sha256").update(stableStringify(material)).digest("hex");
}
