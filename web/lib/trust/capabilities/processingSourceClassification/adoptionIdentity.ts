/**
 * The stable adoption identity for `processing_source_classification`.
 *
 * A leaf module with no imports beyond node's crypto, so the consumer, the
 * reconciliation path and the Processing gap store can each name the identity
 * without importing one another.
 *
 * ## The identity
 *
 * ```text
 * org_id + processing_case_id + decision_class_key
 *        + material_input_fingerprint + classifier_version
 * ```
 *
 * Ratified. Five components, no more: a different Processing Case is a distinct
 * decision even when the file content is identical, and a changed fingerprint or
 * classifier version is a NEW decision rather than a duplicate.
 *
 * `registry_version` is deliberately EXCLUDED. It is pinned into every contract
 * for replay, but it is not part of what makes two classifications the same
 * judgment — including it would make an unrelated governance bump silently
 * re-govern every case.
 *
 * ## Why this becomes the Decision Contract's id
 *
 * `trust_decision_contracts.id` is a uuid PRIMARY KEY, and
 * `trust_decision_packages.contract_id` is UNIQUE against it. Deriving the
 * contract id from the adoption identity therefore makes the DATABASE the
 * exactly-once authority, with no new table, no new index and no migration:
 *
 *  - one adoption identity → one contract id → at most one contract row;
 *  - one contract row → at most one package row.
 *
 * A concurrent second create loses on primary key, which is a real serialization
 * point rather than a best-effort check. The loser resolves the winner and
 * returns it.
 *
 * This is only sound because the class is DETERMINISTIC at escalation 0: the
 * same material input provably yields the same judgment, so the same contract
 * genuinely is the same contract. It must not be copied to a probabilistic class
 * without rethinking that.
 */

// The ONE-SHOT `hash()` rather than the incremental `createHash` builder. The
// structural boundary suite scans `lib/trust` source TEXT for the mutation
// method name, so the builder form cannot appear here — not even in a comment,
// which is why this note does not spell it out.
import { hash as oneShotHash } from "node:crypto";

/** The five ratified components. */
export type ProcessingSourceClassificationAdoptionIdentity = {
    readonly org_id: string;
    readonly processing_case_id: string;
    readonly decision_class_key: string;
    readonly material_input_fingerprint: string;
    readonly classifier_version: string;
};

/**
 * The canonical serialization. Order and separator are part of the contract —
 * changing either changes every derived id, which would orphan stored gaps.
 */
function canonicalIdentityString(identity: ProcessingSourceClassificationAdoptionIdentity): string {
    return [
        identity.org_id,
        identity.processing_case_id,
        identity.decision_class_key,
        identity.material_input_fingerprint,
        identity.classifier_version,
    ].join("|");
}

/**
 * The deterministic Decision Contract id for one adoption identity.
 *
 * Shaped as a v4-form uuid so it satisfies the `uuid` column type, using the
 * same derivation this repository already uses for stable generation ids
 * (`stableGenerationIdFromKey`).
 */
export function processingSourceClassificationContractId(
    identity: ProcessingSourceClassificationAdoptionIdentity,
): string {
    const hex = oneShotHash("sha256", canonicalIdentityString(identity), "hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
