/**
 * POS-FP4 — source evidence / proposed-value resolution (FP2-owned read model).
 *
 * Lives inside the FP2 read-model module so FP2 remains the single owner of all
 * read-model logic. Given a Processing Case detail, it live-resolves, per source:
 *   - proposed values (labeled answers) — read-only; NEVER promoted to records;
 *   - a document handle (for "open document") when the source is a document;
 *   - the record TYPES a source's proposed values would touch ("may be affected").
 *
 * Pure orchestration over injected per-kind loaders (batched per kind = no N+1).
 * Unknown kinds / missing sources resolve to empty evidence — never an error.
 * Nothing is copied or persisted; values are proposals resolved at view time.
 */

import type { ProcessingCaseDetail, ProcessingCaseSourceKind, ProcessingCaseSourceRole } from "./types";

/**
 * A single read-only proposed value from a source.
 * `entityType` + `fieldKey` are the canonical `field_source` mapping
 * (`entity_type.field_key`, e.g. person.email) — the meaning layer, not a guess.
 */
export interface ProposedValue {
    label: string;
    value: string | null;
    entityType: string | null;
    fieldKey?: string | null;
}

/** Raw evidence a per-kind loader returns for one source id. */
export interface SourceEvidenceRaw {
    proposedValues: ProposedValue[];
    documentId: string | null;
}

/** Batched loader for one source kind: ids -> id -> raw evidence (one call per kind). */
export type SourceEvidenceLoader = (ids: string[]) => Promise<Map<string, SourceEvidenceRaw>>;

export type SourceEvidenceRegistry = Map<ProcessingCaseSourceKind, SourceEvidenceLoader>;

/** Per-source evidence attached to a case source. Read-only. */
export interface SourceEvidence {
    kind: ProcessingCaseSourceKind;
    id: string;
    role: ProcessingCaseSourceRole;
    proposedValues: ProposedValue[];
    documentId: string | null;
}

export interface ProcessingCaseDetailEvidence {
    detail: ProcessingCaseDetail;
    evidence: SourceEvidence[];
    /** Distinct record types the proposed values would touch — read-only hint, nothing promoted. */
    affectedRecordTypes: string[];
}

const EMPTY_RAW: SourceEvidenceRaw = { proposedValues: [], documentId: null };

function evidenceKey(kind: ProcessingCaseSourceKind, id: string): string {
    return `${kind}::${id}`;
}

export async function resolveSourceEvidence(
    detail: ProcessingCaseDetail,
    registry: SourceEvidenceRegistry
): Promise<ProcessingCaseDetailEvidence> {
    // Group ids by kind (deduped) for one loader call per kind.
    const idsByKind = new Map<ProcessingCaseSourceKind, string[]>();
    for (const source of detail.sources) {
        const list = idsByKind.get(source.kind) ?? [];
        if (!list.includes(source.id)) list.push(source.id);
        idsByKind.set(source.kind, list);
    }

    const rawByKey = new Map<string, SourceEvidenceRaw>();
    for (const [kind, ids] of idsByKind) {
        const loader = registry.get(kind);
        if (!loader) {
            for (const id of ids) rawByKey.set(evidenceKey(kind, id), EMPTY_RAW);
            continue;
        }
        const loaded = await loader(ids); // exactly one call per kind
        for (const id of ids) rawByKey.set(evidenceKey(kind, id), loaded.get(id) ?? EMPTY_RAW);
    }

    const evidence: SourceEvidence[] = detail.sources.map((source) => {
        const raw = rawByKey.get(evidenceKey(source.kind, source.id)) ?? EMPTY_RAW;
        return {
            kind: source.kind,
            id: source.id,
            role: source.role,
            proposedValues: raw.proposedValues,
            documentId: raw.documentId,
        };
    });

    const affected = new Set<string>();
    for (const e of evidence) {
        for (const v of e.proposedValues) {
            if (v.entityType) affected.add(v.entityType);
        }
    }

    return { detail, evidence, affectedRecordTypes: [...affected] };
}
