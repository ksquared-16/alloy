/**
 * POS-FP2 — read-model query services (Deliverables 5 & 6).
 *
 * Pure orchestration over injected storage deps + a source resolver registry:
 * - listProcessingCaseQueue: queue rows (filtered/sorted/paginated by deps),
 *   primary source grouped, descriptors batch-resolved (no N+1).
 * - countProcessingCasesByStatus: lane counts.
 * - getProcessingCaseDetail: case + its sources with descriptors.
 *
 * The read model enriches; it never becomes truth. No payload copied; nothing
 * persisted.
 */

import type {
    ProcessingCaseCountQuery,
    ProcessingCaseDetail,
    ProcessingCaseQueueCursor,
    ProcessingCaseQueueQuery,
    ProcessingCaseQueueRow,
    ProcessingCaseReadDeps,
    ReadModelSourceRow,
    SourceDisplayResolverRegistry,
    SourceRef,
} from "./types";
import { descriptorKey, genericFallbackDescriptor, resolveSourceDescriptors } from "./sourceDisplayResolvers";
import { parseStoredClassification } from "../classification/processingCaseClassificationDb";
import { parseStoredExtraction } from "../extraction/processingCaseExtractionDb";
import { parseStoredDocumentFormPreview } from "../structure/documentFormPreviewDb";
import { parseStoredFormDraftPreview } from "../formDraft/formDraftPreviewDb";
import { parseFormDraftCreated } from "../formDraft/createFormFromCaseDraft";
import { resolveDetectionMode } from "../formDraft/detectionModeLabel";
import { parseProcessingIntentFromMetadata } from "@/lib/pos/processingImportIntent";

function toRef(row: ReadModelSourceRow): SourceRef {
    return { kind: row.source_kind, id: row.source_id, role: row.role, linkedAt: row.linked_at };
}

export interface ProcessingCaseQueueResult {
    rows: ProcessingCaseQueueRow[];
    nextCursor: ProcessingCaseQueueCursor | null;
}

export async function listProcessingCaseQueue(
    deps: ProcessingCaseReadDeps,
    registry: SourceDisplayResolverRegistry,
    query: ProcessingCaseQueueQuery
): Promise<ProcessingCaseQueueResult> {
    const cases = await deps.queryCases(query);
    const caseIds = cases.map((c) => c.id);

    // ONE batched fetch of sources for all cases on the page (no per-row query).
    const sourceRows = caseIds.length ? await deps.querySourcesForCases({ orgId: query.orgId, caseIds }) : [];

    const grouped = new Map<string, { primary: ReadModelSourceRow | null; relatedCount: number }>();
    for (const id of caseIds) grouped.set(id, { primary: null, relatedCount: 0 });
    for (const row of sourceRows) {
        const g = grouped.get(row.processing_case_id);
        if (!g) continue;
        if (row.role === "primary") g.primary = row;
        else g.relatedCount += 1;
    }

    // Collect primary refs and batch-resolve their descriptors (one resolver call per kind).
    const primaryRefs: SourceRef[] = [];
    for (const c of cases) {
        const g = grouped.get(c.id);
        if (g?.primary) primaryRefs.push(toRef(g.primary));
    }
    const descriptors = await resolveSourceDescriptors(primaryRefs, registry);

    const rows: ProcessingCaseQueueRow[] = cases.map((c) => {
        const g = grouped.get(c.id);
        const primary = g?.primary ? toRef(g.primary) : null;
        const sourceDisplay = primary
            ? descriptors.get(descriptorKey(primary.kind, primary.id)) ?? genericFallbackDescriptor(primary)
            : null;
        return {
            id: c.id,
            status: c.status,
            caseType: c.case_type,
            createdAt: c.created_at,
            statusChangedAt: c.status_changed_at,
            primarySource: primary,
            relatedSourceCount: g?.relatedCount ?? 0,
            sourceDisplay,
            caseTitle: (() => {
                const raw = (c.metadata as Record<string, unknown> | null)?.case_title;
                return typeof raw === "string" && raw.trim() ? raw.trim() : null;
            })(),
            adminCategory: (() => {
                const raw = (c.metadata as Record<string, unknown> | null)?.admin_category;
                return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : null;
            })(),
            formDraftSummary: (() => {
                const draft = parseStoredFormDraftPreview(c.metadata);
                const created = parseFormDraftCreated(c.metadata);
                if (!draft && !created) return null;
                return {
                    detectionMode: draft ? resolveDetectionMode(draft) : "unknown",
                    questionCount: draft?.fields.length ?? 0,
                    sectionCount: draft?.sections.length ?? 0,
                    generatedFormId: created?.form_id ?? null,
                };
            })(),
        };
    });

    const sortKey = query.sortKey ?? "created_at";
    const last = cases.length === query.limit ? cases[cases.length - 1] : undefined;
    const nextCursor: ProcessingCaseQueueCursor | null = last
        ? { sortValue: sortKey === "status_changed_at" ? last.status_changed_at : last.created_at, id: last.id }
        : null;

    return { rows, nextCursor };
}

export async function countProcessingCasesByStatus(
    deps: ProcessingCaseReadDeps,
    query: ProcessingCaseCountQuery
): Promise<Record<string, number>> {
    return deps.countByStatus(query);
}

export async function getProcessingCaseDetail(
    deps: ProcessingCaseReadDeps,
    registry: SourceDisplayResolverRegistry,
    args: { orgId: string; id: string }
): Promise<ProcessingCaseDetail | null> {
    const c = await deps.getCase(args);
    if (!c) return null;

    const sourceRows = await deps.getSourcesForCase({ orgId: args.orgId, caseId: args.id });
    const refs = sourceRows.map(toRef);
    const descriptors = await resolveSourceDescriptors(refs, registry);

    const sources = refs.map((ref) => ({
        ...ref,
        display: descriptors.get(descriptorKey(ref.kind, ref.id)) ?? genericFallbackDescriptor(ref),
    }));

    return {
        id: c.id,
        status: c.status,
        caseType: c.case_type,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        archivedAt: c.archived_at,
        sources,
        caseTitle: (() => {
            const raw = (c.metadata as Record<string, unknown> | null)?.case_title;
            return typeof raw === "string" && raw.trim() ? raw.trim() : null;
        })(),
        classification: parseStoredClassification(c.metadata),
        extraction: parseStoredExtraction(c.metadata),
        documentFormPreview: parseStoredDocumentFormPreview(c.metadata),
        formDraftPreview: parseStoredFormDraftPreview(c.metadata),
        formDraftCreated: parseFormDraftCreated(c.metadata),
        processingIntent: parseProcessingIntentFromMetadata(c.metadata),
        // Present only when the case was analysed as a packet. Read, never recomputed here.
        packetIntake: ((c.metadata as Record<string, unknown> | null)?.packet_intake ?? null) as unknown,
    };
}
