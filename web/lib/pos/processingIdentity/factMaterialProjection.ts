/**
 * Material projection for Processing identity facts (defect D-1).
 *
 * `hashFactsForResolution` previously hashed `processing_facts.id` — a
 * `gen_random_uuid()` primary key. Semantically identical facts inserted as
 * different rows therefore produced different `input_facts_hash` values, so the
 * hash identified the **rows that happened to store the evidence** rather than
 * the evidence itself. That makes replay unprovable and blocks any exactly-once
 * adoption keyed on it.
 *
 * This module defines the one versioned projection that fixes it. Processing
 * owns it: nothing here imports `lib/trust`, and Trust may later CONSUME the
 * hash but must never own its calculation.
 *
 * ## What the engine actually consumes
 *
 * Read `runCanonicalIdentityResolution` before extending this. The deterministic
 * judgment is produced by `generateHouseholdGraphCandidates` and
 * `resolveIntakeRecordResolution`, both driven by the intake **household** — not
 * by these facts. The facts are persisted and hashed as the *evidence cohort*
 * backing a resolution generation. That is why fields are admitted for
 * evidentiary meaning rather than for influence on the judgment, and why exact
 * duplicates may be collapsed (see below).
 *
 * ## Field decisions, and the evidence for each
 *
 * ADMITTED — material semantic content, provenance that changes evidentiary
 * meaning, or a version pin:
 *   `fact_type`, `semantic_key`      what the fact asserts
 *   `normalized_value` ?? `raw_value` the asserted value, normalization-first
 *   `data_type`                       how the value is to be read
 *   `subject_ref`, `role_hint`        which subject the evidence backs
 *   `extraction_method`, `produced_by` intake extraction vs operator correction
 *   `extractor_version`               the algorithm that derived the value
 *   `validation_state`                `corrected` is materially different
 *   `extraction_confidence`           evidentiary weight
 *   `is_correction`                   derived from `corrected_from != null`
 *
 * EXCLUDED, each for a stated reason:
 *   `id`               random storage identity — the defect itself
 *   `corrected_from`   a random row id; its MEANING is kept as `is_correction`
 *   `generation_id`    the label the hash is stored under; including it would
 *                      make every generation trivially unique and defeat the point
 *   `org_id`, `case_id` constant across a cohort; the hash already labels one case
 *   `source_id`        constant across the cohort the engine consumes — the
 *                      engine stamps ONE `input.sourceId` onto every fact in a
 *                      batch, so it discriminates nothing while reintroducing a
 *                      random uuid
 *   `evidence` jsonb   carries `fact_id`, which `extractFactsFromText` derives
 *                      from a module-level mutable counter (`factCounter`) — it
 *                      is process state, not content, and is exactly the class of
 *                      defect being fixed here
 *   `mapping_state`    mutable operational metadata
 *   `retention_class`  retention policy, not evidence
 *   `created_at`       a timestamp that does not change meaning
 */

import { createHash } from "node:crypto";

/**
 * Bumped when the ADMITTED field set or the canonical serialization changes.
 *
 * Pinned INSIDE the hashed payload, so two projections provably cannot collide:
 * the same facts under a different projection version yield a different hash.
 */
export const PROCESSING_IDENTITY_FACT_MATERIAL_VERSION = "proc-identity-fact-material-v1" as const;

/** The unit separator between projected fields. Part of the contract. */
const FIELD_SEP = "\u001f";
/** The separator between projected facts. Part of the contract. */
const FACT_SEP = "\u001e";

/** Only the fields this projection reads. Deliberately narrower than the row. */
export type ProcessingIdentityFactMaterialInput = {
    fact_type: string;
    semantic_key?: string | null;
    raw_value?: string | null;
    normalized_value?: string | null;
    data_type?: string | null;
    subject_ref?: string | null;
    role_hint?: string | null;
    extraction_method?: string | null;
    produced_by?: string | null;
    extractor_version?: string | null;
    validation_state?: string | null;
    extraction_confidence?: number | null;
    corrected_from?: string | null;
};

/**
 * One fact's material projection.
 *
 * Field ORDER here is the serialization contract, not incidental: a reordering
 * changes every derived hash, which is why the version constant exists.
 */
export type ProcessingIdentityFactMaterialV1 = {
    readonly fact_type: string;
    readonly semantic_key: string;
    /** Normalization-first, mirroring what the engine persists and reads. */
    readonly material_value: string;
    readonly data_type: string;
    readonly subject_ref: string;
    readonly role_hint: string;
    readonly extraction_method: string;
    readonly produced_by: string;
    readonly extractor_version: string;
    readonly validation_state: string;
    /** Serialized as a fixed-precision string so `0.9` and `0.90` agree. */
    readonly extraction_confidence: string;
    /** The evidentiary meaning of `corrected_from`, without its random uuid. */
    readonly is_correction: boolean;
};

function text(value: string | null | undefined): string {
    return typeof value === "string" ? value : "";
}

/**
 * Fixed-precision so numerically equal confidences serialize identically.
 * `null` is distinct from `0` and stays distinct.
 */
function confidence(value: number | null | undefined): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "";
    return value.toFixed(6);
}

export function projectIdentityFactMaterial(
    fact: ProcessingIdentityFactMaterialInput,
): ProcessingIdentityFactMaterialV1 {
    return {
        fact_type: text(fact.fact_type),
        semantic_key: text(fact.semantic_key),
        // The engine stores `normalized_value` when it has one and falls back to
        // `raw_value`; the projection reads the same precedence so the hash
        // describes the value the engine would actually use.
        material_value: text(fact.normalized_value) || text(fact.raw_value),
        data_type: text(fact.data_type),
        subject_ref: text(fact.subject_ref),
        role_hint: text(fact.role_hint),
        extraction_method: text(fact.extraction_method),
        produced_by: text(fact.produced_by),
        extractor_version: text(fact.extractor_version),
        validation_state: text(fact.validation_state),
        extraction_confidence: confidence(fact.extraction_confidence),
        is_correction: fact.corrected_from != null,
    };
}

/**
 * Canonical serialization of one projected fact.
 *
 * Written field-by-field in a FIXED order rather than via `JSON.stringify`, so
 * the result cannot depend on object-key insertion order from any upstream
 * payload.
 */
export function serializeIdentityFactMaterial(material: ProcessingIdentityFactMaterialV1): string {
    return [
        material.fact_type,
        material.semantic_key,
        material.material_value,
        material.data_type,
        material.subject_ref,
        material.role_hint,
        material.extraction_method,
        material.produced_by,
        material.extractor_version,
        material.validation_state,
        material.extraction_confidence,
        material.is_correction ? "1" : "0",
    ].join(FIELD_SEP);
}

/**
 * The canonical material payload for a fact cohort.
 *
 * **Ordering:** the serialized facts are SORTED, so neither database return
 * order nor insertion order can change the result.
 *
 * **Duplicates:** exact material duplicates are COLLAPSED. Evidence, not guess:
 * the resolution engine consumes none of these facts when forming its judgment
 * (it resolves from the intake household), so a second byte-identical assertion
 * carries no additional weight the engine can act on. Two facts that differ in
 * ANY admitted field — including subject, method, producer or confidence —
 * remain distinct, which is what preserves genuine corroboration.
 */
export function canonicalIdentityFactMaterialPayload(
    facts: readonly ProcessingIdentityFactMaterialInput[],
): string {
    const serialized = facts.map((f) => serializeIdentityFactMaterial(projectIdentityFactMaterial(f)));
    const distinct = Array.from(new Set(serialized)).sort();
    return [PROCESSING_IDENTITY_FACT_MATERIAL_VERSION, ...distinct].join(FACT_SEP);
}

/**
 * Content-deterministic hash of a fact cohort.
 *
 * Same material facts under the same projection version → same hash, whatever
 * row ids, insertion order or timestamps the database assigned.
 */
export function hashIdentityFactMaterial(
    facts: readonly ProcessingIdentityFactMaterialInput[],
): string {
    return createHash("sha256").update(canonicalIdentityFactMaterialPayload(facts)).digest("hex");
}
