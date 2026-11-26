/**
 * The stable adoption identity for one Processing identity **subject**.
 *
 * The governed decision grain is the subject, not the case: a Processing Case
 * carries several subjects (parents, children, household, lead) and each gets
 * its own judgment. The case is context; `subject_ref` is the grain.
 *
 * ```text
 * org_id + processing_case_id + subject_ref + decision_class_key
 *        + input_facts_hash + material_projection_version + identity_resolver_version
 * ```
 *
 * Seven components, ratified. Three of them are version pins and each is a
 * SEPARATE dimension on purpose:
 *
 *  - `input_facts_hash` — the content identity of the evidence cohort, made
 *    content-deterministic in Phase 1.2;
 *  - `material_projection_version` — which projection produced that hash;
 *  - `identity_resolver_version` — which algorithm formed the judgment.
 *
 * A change in any one is a genuinely different governed decision.
 *
 * **Not persisted, and not a production contract id yet.** This slice defines
 * the derivation and proves its properties; nothing writes it.
 *
 * Processing-owned: no `lib/trust` import. Trust may later consume the value.
 */

import { createHash } from "node:crypto";

/** Bumped if the component set or the canonical serialization changes. */
export const IDENTITY_ADOPTION_IDENTITY_VERSION = "proc-identity-adoption-v1" as const;

export type ProcessingIdentityAdoptionIdentityInput = {
    readonly org_id: string;
    readonly processing_case_id: string;
    readonly subject_ref: string;
    readonly decision_class_key: string;
    readonly input_facts_hash: string;
    readonly material_projection_version: string;
    readonly identity_resolver_version: string;
};

/**
 * Canonical serialization.
 *
 * Field order is the contract and the separator is a unit separator, so no
 * component value can impersonate a boundary. Written positionally rather than
 * via `JSON.stringify`, so object-key order cannot reach the digest.
 */
function canonicalIdentityString(input: ProcessingIdentityAdoptionIdentityInput): string {
    return [
        IDENTITY_ADOPTION_IDENTITY_VERSION,
        input.org_id,
        input.processing_case_id,
        input.subject_ref,
        input.decision_class_key,
        input.input_facts_hash,
        input.material_projection_version,
        input.identity_resolver_version,
    ].join("\u001f");
}

/**
 * The deterministic adoption identity, in v4-uuid form.
 *
 * Shaped as a uuid so a later slice may adopt it as the Decision Contract's
 * primary key — the same mechanism source classification already uses to make
 * the contract table the exactly-once authority. This slice only derives it.
 */
export function processingIdentitySubjectAdoptionId(
    input: ProcessingIdentityAdoptionIdentityInput,
): string {
    const hex = createHash("sha256").update(canonicalIdentityString(input)).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
