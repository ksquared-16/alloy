import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import type { IntakeFact } from "@/lib/intake/types";
import { hashIdentityFactMaterial } from "./factMaterialProjection";

export type ProcessingFactRow = {
    id: string;
    org_id: string;
    case_id: string;
    source_id: string | null;
    subject_ref: string | null;
    fact_type: string;
    semantic_key: string | null;
    raw_value: string | null;
    normalized_value: string | null;
    data_type: string | null;
    extraction_method: string | null;
    evidence: Record<string, unknown>;
    extraction_confidence: number | null;
    validation_state: string | null;
    mapping_state: string | null;
    role_hint: string | null;
    produced_by: string | null;
    extractor_version: string | null;
    generation_id: string;
    corrected_from: string | null;
    retention_class: string;
    created_at: string;
};

function factEvidencePayload(fact: IntakeFact): Record<string, unknown> {
    const base: Record<string, unknown> = {
        fact_id: fact.fact_id,
        source_line: fact.source_line ?? null,
        source_span: fact.source_span ?? null,
    };
    if (typeof fact.evidence === "string" && fact.evidence.trim()) {
        base.note = fact.evidence;
    }
    return base;
}

function confidenceToNumeric(confidence: IntakeFact["confidence"]): number | null {
    switch (confidence) {
        case "high":
            return 0.9;
        case "medium":
            return 0.6;
        case "low":
            return 0.3;
        default:
            return null;
    }
}

export function intakeFactToInsertRow(input: {
    orgId: string;
    caseId: string;
    sourceId?: string | null;
    generationId: string;
    fact: IntakeFact;
    retentionClass?: string;
}): Omit<ProcessingFactRow, "id" | "created_at"> {
    return {
        org_id: input.orgId,
        case_id: input.caseId,
        source_id: input.sourceId ?? null,
        subject_ref: input.fact.role_hint ?? null,
        fact_type: input.fact.fact_type,
        semantic_key: input.fact.fact_type,
        raw_value: input.fact.raw_value ?? null,
        normalized_value:
            typeof input.fact.normalized_value === "string" ?
                input.fact.normalized_value
            :   input.fact.normalized_value != null ?
                JSON.stringify(input.fact.normalized_value)
            :   null,
        data_type: input.fact.fact_type,
        extraction_method: "intake_extract",
        evidence: factEvidencePayload(input.fact),
        extraction_confidence: confidenceToNumeric(input.fact.confidence),
        validation_state: input.fact.validation_state ?? null,
        mapping_state: "unmapped",
        role_hint: input.fact.role_hint ?? null,
        produced_by: "intake",
        extractor_version: "proc-identity-b2",
        generation_id: input.generationId,
        corrected_from: null,
        retention_class: input.retentionClass ?? "uncommitted_submission",
    };
}

export function validateFactEvidence(evidence: unknown): evidence is Record<string, unknown> {
    if (evidence == null) return true;
    if (typeof evidence !== "object" || Array.isArray(evidence)) return false;
    return true;
}

export async function insertProcessingFacts(
    supabase: SupabaseClient,
    rows: Array<Omit<ProcessingFactRow, "id" | "created_at">>,
): Promise<ProcessingFactRow[]> {
    if (rows.length === 0) return [];
    for (const row of rows) {
        if (!validateFactEvidence(row.evidence)) {
            throw new Error("malformed_fact_evidence");
        }
    }
    const { data, error } = await supabase.from("processing_facts").insert(rows).select("*");
    if (error) throw new Error(error.message);
    return (data ?? []) as ProcessingFactRow[];
}

export async function appendCorrectedProcessingFact(
    supabase: SupabaseClient,
    input: {
        original: ProcessingFactRow;
        correctedNormalizedValue: string;
        operatorId?: string | null;
        generationId?: string;
    },
): Promise<ProcessingFactRow> {
    const row = {
        org_id: input.original.org_id,
        case_id: input.original.case_id,
        source_id: input.original.source_id,
        subject_ref: input.original.subject_ref,
        fact_type: input.original.fact_type,
        semantic_key: input.original.semantic_key,
        raw_value: input.original.raw_value,
        normalized_value: input.correctedNormalizedValue,
        data_type: input.original.data_type,
        extraction_method: "operator_correction",
        evidence: {
            ...input.original.evidence,
            corrected_from_fact_id: input.original.id,
            operator_id: input.operatorId ?? null,
        },
        extraction_confidence: input.original.extraction_confidence,
        validation_state: "corrected",
        mapping_state: input.original.mapping_state,
        role_hint: input.original.role_hint,
        produced_by: "operator_review",
        extractor_version: input.original.extractor_version,
        generation_id: input.generationId ?? randomUUID(),
        corrected_from: input.original.id,
        retention_class: input.original.retention_class,
    };
    const inserted = await insertProcessingFacts(supabase, [row]);
    return inserted[0]!;
}

export async function listProcessingFactsByCase(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string,
): Promise<ProcessingFactRow[]> {
    const { data, error } = await supabase
        .from("processing_facts")
        .select("*")
        .eq("org_id", orgId)
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProcessingFactRow[];
}

/**
 * Content-deterministic hash of the fact cohort backing a resolution generation.
 *
 * Previously this hashed `f.id` — a `gen_random_uuid()` primary key — so
 * semantically identical facts stored as different rows produced different
 * hashes (defect D-1). It now delegates to the versioned material projection,
 * which admits only fields that carry semantic content, evidentiary provenance
 * or a version pin.
 *
 * The projection version is pinned inside the hashed payload. The resolver
 * version stays a SEPARATE dimension, already persisted on
 * `processing_resolutions.resolver_version`, so an algorithm change remains
 * distinguishable without invalidating material hashes.
 *
 * @see ./factMaterialProjection.ts — the admitted/excluded field decisions
 */
export function hashFactsForResolution(facts: ProcessingFactRow[]): string {
    return hashIdentityFactMaterial(facts);
}

export function newGenerationId(): string {
    return randomUUID();
}

export function stableGenerationIdFromKey(key: string): string {
    const hex = createHash("sha256").update(key).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
