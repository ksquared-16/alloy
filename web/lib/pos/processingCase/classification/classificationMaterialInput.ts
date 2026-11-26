/**
 * Material classification input — the replay identity of one source-classification
 * judgment (Trust adoption, Phase 1.1).
 *
 * Processing owns this module because it encodes which inputs the classifier
 * ACTUALLY reads. That is classification semantics, not governance, and it must
 * not drift into `lib/trust`.
 *
 * Two facts drive the shape, both read straight out of `classifyNonFormSource`:
 *
 *  1. **`mimeType` is declared on the input type but never read.** The haystack is
 *     built from `fileName`, `title`, `docType` and the scalar values of
 *     `metadata` only. Including `mimeType` in the fingerprint would make two
 *     inputs that classify identically fingerprint differently, which would make
 *     the replay claim false.
 *  2. **`metadata` contributes only its scalar values**, via `Object.values()`.
 *     Insertion order therefore affects the ORDER of the emitted `signals` array
 *     but never the `classification_key`, `confidence` or `status`. The
 *     fingerprint sorts, so object-key order cannot change replay material.
 *
 * The fingerprint exists so the governed record can prove "same material input →
 * same judgment" WITHOUT copying filenames, titles or document content into
 * Trust. A filename can carry a family name; a hash cannot.
 */

import { createHash } from "node:crypto";
import type { ClassifyNonFormSourceInput, ProcessingClassificationResult } from "./types";

/** Bumped when the set of inputs the classifier reads changes. Pinned into the fingerprint. */
export const CLASSIFICATION_MATERIAL_INPUT_VERSION = "proc-source-classification-material-v1";

/**
 * The scalar metadata values the classifier can actually match against, sorted.
 *
 * Mirrors `metadataStrings()` in the classifier: strings pass through, numbers
 * and booleans are stringified, everything else is ignored. Sorting is what
 * makes key order immaterial.
 */
function materialMetadataValues(metadata: Record<string, unknown> | null | undefined): string[] {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const out: string[] = [];
    for (const v of Object.values(metadata)) {
        if (typeof v === "string") out.push(v);
        else if (typeof v === "number" || typeof v === "boolean") out.push(String(v));
    }
    return out.sort();
}

/**
 * The exact projection of an input that can change the classification.
 *
 * Lowercased because the classifier lowercases every field before matching, so
 * case is immaterial to the judgment and must be immaterial to its identity.
 */
export function materialClassificationInput(input: ClassifyNonFormSourceInput): {
    source_kind: string;
    file_name: string;
    title: string;
    doc_type: string;
    metadata_values: string[];
} {
    return {
        source_kind: input.sourceKind,
        file_name: (input.fileName ?? "").toLowerCase(),
        title: (input.title ?? "").toLowerCase(),
        doc_type: (input.docType ?? "").toLowerCase(),
        metadata_values: materialMetadataValues(input.metadata).map((s) => s.toLowerCase()),
    };
}

/** Stable JSON: keys sorted recursively so serialization is canonical. */
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            out[key] = canonicalize((value as Record<string, unknown>)[key]);
        }
        return out;
    }
    return value;
}

/**
 * SHA-256 over the canonicalized material input.
 *
 * Carries no source content into Trust — only the identity of the input that
 * produced the judgment. Two calls with the same material input agree; a call
 * differing only in `mimeType`, in metadata key ORDER, or in letter case agrees
 * too, because none of those can change what the classifier decides.
 */
export function classificationMaterialFingerprint(input: ClassifyNonFormSourceInput): string {
    const payload = {
        version: CLASSIFICATION_MATERIAL_INPUT_VERSION,
        material: materialClassificationInput(input),
    };
    return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

/**
 * The judgment's identity, independent of signal emission order.
 *
 * `signals` order follows `Object.values(metadata)` insertion order, so two
 * equivalent inputs can emit the same signals in a different sequence. The
 * recommendation carries the signals VERBATIM — this fingerprint is the thing
 * that answers "is this the same judgment?", and it sorts.
 */
export function classificationJudgmentFingerprint(result: ProcessingClassificationResult): string {
    const payload = {
        classification_key: result.classification_key,
        status: result.status,
        confidence: result.confidence,
        classifier_version: result.classifier_version,
        signals: [...result.signals]
            .map((s) => `${s.source}:${s.value}:${s.weight}`)
            .sort(),
    };
    return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}
