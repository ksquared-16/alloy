/**
 * POS-FP3 — parse a read-only queue request into FP2 query inputs.
 *
 * Pure: only parses/validates/clamps URL params into FP2's ProcessingCaseQueueQuery
 * + ProcessingCaseCountQuery. It performs NO enrichment, NO filtering, NO shaping —
 * FP2 remains the single read-model owner. The endpoint simply delegates.
 */

import type {
    ProcessingCaseCountQuery,
    ProcessingCaseQueueQuery,
    ProcessingCaseQueueSortKey,
    ProcessingCaseSourceKind,
    ProcessingCaseStatus,
} from "./types";

const STATUS_VALUES: ProcessingCaseStatus[] = [
    "received",
    "processing",
    "needs_review",
    "needs_resolution",
    "ready",
    "completed",
    "archived",
];
const SOURCE_KIND_VALUES: ProcessingCaseSourceKind[] = [
    "form_submission",
    "form_packet_session",
    "document",
    "upload",
    "email_attachment",
    "import",
    "recreated_document",
];
const SORT_KEYS: ProcessingCaseQueueSortKey[] = ["created_at", "status_changed_at"];

export const DEFAULT_QUEUE_LIMIT = 25;
export const MAX_QUEUE_LIMIT = 100;

function parseCsvEnum<T extends string>(raw: string | null, allowed: readonly T[]): T[] | undefined {
    if (!raw) return undefined;
    const allowedSet = new Set<string>(allowed);
    const values = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => allowedSet.has(s)) as T[];
    return values.length > 0 ? [...new Set(values)] : undefined;
}

function parseCsv(raw: string | null): string[] | undefined {
    if (!raw) return undefined;
    const values = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return values.length > 0 ? values : undefined;
}

export interface ParsedProcessingQueueRequest {
    query: ProcessingCaseQueueQuery;
    countQuery: ProcessingCaseCountQuery;
}

export function buildProcessingQueueRequest(
    params: URLSearchParams,
    orgId: string
): ParsedProcessingQueueRequest {
    const statuses = parseCsvEnum(params.get("status"), STATUS_VALUES);
    const sourceKinds = parseCsvEnum(params.get("source_kind"), SOURCE_KIND_VALUES);
    const caseTypes = parseCsv(params.get("case_type"));
    const receivedFrom = params.get("received_from") ?? undefined;
    const receivedTo = params.get("received_to") ?? undefined;

    const sortRaw = params.get("sort");
    const sortKey: ProcessingCaseQueueSortKey =
        sortRaw && (SORT_KEYS as string[]).includes(sortRaw) ? (sortRaw as ProcessingCaseQueueSortKey) : "created_at";
    const sortDir: "asc" | "desc" = params.get("dir") === "asc" ? "asc" : "desc";

    const limitRaw = Number(params.get("limit"));
    const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
            ? Math.min(Math.floor(limitRaw), MAX_QUEUE_LIMIT)
            : DEFAULT_QUEUE_LIMIT;

    const cursorSort = params.get("cursor_sort");
    const cursorId = params.get("cursor_id");
    const cursor = cursorSort && cursorId ? { sortValue: cursorSort, id: cursorId } : null;

    const query: ProcessingCaseQueueQuery = {
        orgId,
        statuses,
        sourceKinds,
        caseTypes,
        receivedFrom,
        receivedTo,
        sortKey,
        sortDir,
        limit,
        cursor,
    };
    const countQuery: ProcessingCaseCountQuery = {
        orgId,
        sourceKinds,
        caseTypes,
        receivedFrom,
        receivedTo,
    };
    return { query, countQuery };
}
