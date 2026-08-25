/**
 * Packet intake — reasoning across the source artifacts of ONE enrollment packet.
 *
 * Every reader in Slice 1 works on one document. A real enrollment packet is three: a handbook to
 * read, a state immunization certificate to fill, and a hosted form that is itself four agreements.
 * Read one at a time, nothing can see that the child's name is written ten times, that the seven
 * authorizations in the handbook are the same seven the tuition agreement repeats, or that the
 * signature on the tuition terms must not stand in for the bank authorization.
 *
 * WHAT THIS LAYER IS: a description of source artifacts and a set of PROPOSALS about them.
 *
 * WHAT IT IS NOT: a second requirement authority. Published Business Process requirements remain
 * authority over what Enrollment requires. Forms, Fields, Requirements and Signatures keep their
 * ownership. Nothing here is applied, and every correlation carries the evidence that produced it
 * so an operator can reject it.
 *
 * Versioned like the discovery contracts it composes.
 */

import type { ConfigurationDiscoveryResult } from "@/lib/pos/discovery/contracts";
import type { DocumentStructureCandidate } from "@/lib/pos/processingCase/structure/types";
import type { LogicalArtifact } from "@/lib/pos/processingCase/structure/logicalArtifacts";

export const PACKET_INTAKE_CONTRACT_VERSION = "fp20.0";

/** How a source artifact's destinations were read. */
export type SourceReader = "acroform" | "hosted_form" | "layout" | "flat_text";

/** Provenance of one source artifact in the packet. Mirrors what `documents` already stores. */
export interface PacketSourceArtifact {
    /** The document row's id — the artifact's identity. */
    document_id: string;
    title: string;
    /** Original file name, or the hosted form's page title. */
    source_name: string | null;
    /** Where the bytes came from: a stored file path, or the hosted form's address. */
    source_uri: string | null;
    mime_type: string | null;
    /** Content hash of the exact bytes read. What makes a capture immutable. */
    checksum_sha256: string | null;
    reader: SourceReader;
    page_count: number | null;
    /** Whether this source is something to fill in or something to read. */
    fill_intent: "fillable" | "reference" | "unknown";
    /**
     * Controls/widgets the source physically contains, before normalization. A Yes/No question is
     * two checkbox elements and one destination. Recording both is what keeps normalization
     * visible instead of looking like loss.
     */
    raw_control_count?: number | null;
}

/** One destination in the packet, addressed by artifact + the reader's own identity for it. */
export interface PacketDestination {
    /** Globally unique inside the packet: `${document_id}::${evidence}`. */
    id: string;
    document_id: string;
    /** The reader's stable identity — an AcroForm field name, a hosted-form control name. */
    evidence: string;
    label: string;
    type: string;
    required: boolean;
    page: number | null;
    /** The logical artifact inside the source document that owns it, when the source has several. */
    logical_artifact_id: string | null;
}

/** Why two facts in different artifacts might be the same fact. */
export type CorrelationBasis =
    | "canonical_concept_key" // both resolved to the same canonical semantic key
    | "shared_collection_identity" // both belong to the same recognized repeating structure
    | "declared_option_set"; // both are the same closed choice, option for option

export interface CrossArtifactCorrelation {
    contract_version: string;
    /** Stable: the concept key plus the artifacts it spans. */
    id: string;
    concept_key: string;
    label: string;
    basis: CorrelationBasis;
    /** The concept ids being proposed as one fact, with the artifact each came from. */
    members: Array<{ document_id: string; concept_id: string; label: string; logical_artifact_id: string | null }>;
    /** How many source destinations collapse if the operator accepts this. */
    destinations_covered: number;
    confidence: "high" | "review" | "attention";
    /** Deterministic reasons. Never "the labels looked similar". */
    signals: string[];
    /** Always `proposed` here. Accepting is an operator act. */
    decision_state: "proposed";
    explanation: string;
}

/** What two obligations in different artifacts are to each other. */
export type ObligationRelation =
    | "same_obligation" // the identical commitment, printed twice
    | "distinct_obligation" // different commitments that merely share vocabulary
    | "instruction_and_requirement"; // one states a rule, the other is the act that satisfies it

export interface ObligationCorrelation {
    contract_version: string;
    id: string;
    relation: ObligationRelation;
    kind: "acknowledgement" | "upload_requirement" | "signature";
    members: Array<{ document_id: string; concept_id: string; label: string; logical_artifact_id: string | null }>;
    confidence: "high" | "review" | "attention";
    signals: string[];
    decision_state: "proposed";
    explanation: string;
}

/** A signature, and everything the source proves about who signs what. */
export interface SignatureBinding {
    contract_version: string;
    id: string;
    document_id: string;
    /** The artifact this signature executes. A signature never reaches beyond it. */
    logical_artifact_id: string | null;
    logical_artifact_title: string | null;
    destination_id: string;
    label: string;
    /** Initial required signature, or a re-sign line. */
    variant: "initial" | "update";
    /** The signer's grain. Always recipient — a signature is given by a person, not by a household. */
    signer_grain: "recipient";
    /** The date destination the source proves belongs to this signature, when there is one. */
    date_destination_id: string | null;
    date_signals: string[];
}

/** Reconciliation of every source destination — the packet's own audit. */
export interface PacketReconciliation {
    /** Destinations each reader reported, per source. */
    by_source: Array<{ document_id: string; title: string; raw: number | null; reported: number; accounted: number }>;
    /** Raw source controls across the packet, where a source could count them. */
    total_raw: number;
    total_reported: number;
    total_accounted: number;
    /** Destination ids seen more than once. Must be empty. */
    duplicated: string[];
    /** Destination ids a reader reported that the packet lost. Must be empty. */
    missing: string[];
    balanced: boolean;
}

export interface PacketIntakeInput {
    artifact: PacketSourceArtifact;
    structure: DocumentStructureCandidate;
    discovery: ConfigurationDiscoveryResult;
}

export interface PacketIntakeResult {
    contract_version: string;
    sources: PacketSourceArtifact[];
    /** Logical artifacts across the whole packet, in source order. */
    artifacts: Array<LogicalArtifact & { document_id: string }>;
    destinations: PacketDestination[];
    correlations: CrossArtifactCorrelation[];
    obligations: ObligationCorrelation[];
    signatures: SignatureBinding[];
    reconciliation: PacketReconciliation;
    warnings: string[];
}
