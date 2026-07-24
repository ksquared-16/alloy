/**
 * POS-FP2 — Processing Case read-model types.
 *
 * The read model ENRICHES; it never becomes truth. Source labels/metadata are
 * live-resolved; no source payloads are copied; nothing is denormalized into
 * persistence. These are query-time projections only.
 */

import type {
    ProcessingCaseSourceKind,
    ProcessingCaseSourceRole,
    ProcessingCaseStatus,
} from "../types";
import type { StoredProcessingClassification } from "../classification/types";
import type { StoredProcessingExtraction } from "../extraction/types";
import type { StoredDocumentFormPreview } from "../structure/types";
import type { StoredFormDraftPreview } from "../formDraft/types";
import type { DetectionModeKind } from "../formDraft/detectionModeLabel";
import type { FormDraftCreatedLink } from "../formDraft/createFormFromCaseDraft";
import type { ProcessingImportIntent } from "@/lib/pos/processingImportIntent";

export type { ProcessingCaseSourceKind, ProcessingCaseSourceRole, ProcessingCaseStatus };

/** A reference to a source (kind + id), owned by its source system. Never the payload. */
export interface SourceRef {
    kind: ProcessingCaseSourceKind;
    id: string;
    role: ProcessingCaseSourceRole;
    linkedAt: string | null;
}

/** A live-resolved, display-only descriptor for a source. `resolved=false` = generic fallback. */
export interface SourceDisplayDescriptor {
    kind: ProcessingCaseSourceKind;
    id: string;
    label: string;
    receivedAt: string | null;
    channel: string | null;
    resolved: boolean;
}

/** Deliverable 1 — the compressed operational queue row. Contains no source payload / record truth. */
export interface ProcessingCaseQueueRow {
    id: string;
    status: ProcessingCaseStatus;
    caseType: string | null;
    createdAt: string;
    statusChangedAt: string;
    primarySource: SourceRef | null;
    relatedSourceCount: number;
    sourceDisplay: SourceDisplayDescriptor | null;
    /**
     * Queue folder configured on the source form (`metadata.admin_category`), copied onto the case
     * at intake. Display/routing only — the folder rail matches on this before falling back to
     * keyword matching. Null when the form declares no folder.
     */
    adminCategory?: string | null;
    /** Display-only document→form state for queue rows. Derived from metadata, never authoritative. */
    formDraftSummary?: {
        detectionMode: DetectionModeKind | "unknown";
        questionCount: number;
        sectionCount: number;
        generatedFormId: string | null;
    } | null;
}

/** Deliverable 2 — the case detail projection: case fields + sources (no extraction/match/resolution/outcome — later). */
export interface ProcessingCaseDetail {
    id: string;
    status: ProcessingCaseStatus;
    caseType: string | null;
    createdAt: string;
    updatedAt: string | null;
    archivedAt: string | null;
    sources: Array<SourceRef & { display: SourceDisplayDescriptor }>;
    /** POS-FP9 read-only classification (from `metadata.classification`); null until classified. */
    classification: StoredProcessingClassification | null;
    /** POS-FP10 read-only intake extraction (from `metadata.extraction`): source/facts/candidates; null until extracted. Proposed values only — never committed. */
    extraction: StoredProcessingExtraction | null;
    /** POS-FP11 read-only Document → Form preview (from `metadata.document_form_preview`); null until generated. Preview only — no form created. */
    documentFormPreview: StoredDocumentFormPreview | null;
    /** POS-FP12 read-only Document → Form draft (from `metadata.form_draft_preview`); null until "Create form from document". Preview only — no form created/published. */
    formDraftPreview: StoredFormDraftPreview | null;
    /** POS-FP13 link to the unpublished editable form created from the draft (from `metadata.form_draft_created`); null until created. */
    formDraftCreated: FormDraftCreatedLink | null;
    /** Persisted import intent from case metadata (`processing_intent` / `import_purpose`). */
    processingIntent: ProcessingImportIntent | null;
}

export type ProcessingCaseQueueSortKey = "created_at" | "status_changed_at";

export interface ProcessingCaseQueueCursor {
    sortValue: string;
    id: string;
}

export interface ProcessingCaseQueueQuery {
    orgId: string;
    statuses?: ProcessingCaseStatus[];
    sourceKinds?: ProcessingCaseSourceKind[];
    caseTypes?: string[];
    receivedFrom?: string;
    receivedTo?: string;
    sortKey?: ProcessingCaseQueueSortKey;
    sortDir?: "asc" | "desc";
    limit: number;
    cursor?: ProcessingCaseQueueCursor | null;
}

export interface ProcessingCaseCountQuery {
    orgId: string;
    sourceKinds?: ProcessingCaseSourceKind[];
    caseTypes?: string[];
    receivedFrom?: string;
    receivedTo?: string;
}

/** DB row shapes the read model reads (no truth stored on these projections). */
export interface ReadModelCaseRow {
    id: string;
    status: ProcessingCaseStatus;
    case_type: string | null;
    created_at: string;
    status_changed_at: string;
    updated_at: string | null;
    archived_at: string | null;
    /** Present only on detail reads (getCase); carries `metadata.classification` for FP9. */
    metadata?: Record<string, unknown> | null;
}

export interface ReadModelSourceRow {
    processing_case_id: string;
    source_kind: ProcessingCaseSourceKind;
    source_id: string;
    role: ProcessingCaseSourceRole;
    linked_at: string | null;
}

/** Injected storage reads (DI so the service orchestration is unit-testable without a DB). */
export interface ProcessingCaseReadDeps {
    queryCases(query: ProcessingCaseQueueQuery): Promise<ReadModelCaseRow[]>;
    querySourcesForCases(args: { orgId: string; caseIds: string[] }): Promise<ReadModelSourceRow[]>;
    countByStatus(query: ProcessingCaseCountQuery): Promise<Record<string, number>>;
    getCase(args: { orgId: string; id: string }): Promise<ReadModelCaseRow | null>;
    getSourcesForCase(args: { orgId: string; caseId: string }): Promise<ReadModelSourceRow[]>;
}

/** A batched resolver for one source kind: given ids, returns id -> label (one call per kind = no N+1). */
export interface ResolvedSourceLabel {
    label: string;
    receivedAt: string | null;
    channel: string | null;
}
export type BatchedSourceResolver = (ids: string[]) => Promise<Map<string, ResolvedSourceLabel>>;

/** Deliverable 3 — the registry: source kind -> batched resolver. */
export type SourceDisplayResolverRegistry = Map<ProcessingCaseSourceKind, BatchedSourceResolver>;
