"use client";

/**
 * D6 — the client read of derived document requirement work, shared by Processing → Work → Documents and Work Items.
 *
 * One request (`GET /api/admin/documents/requirements/work`) feeds both surfaces, so they cannot disagree about the same
 * row. A short-lived snapshot with subscribers, like the Processing and Communications warm caches. Nothing here is a
 * store of work: every load is a fresh server evaluation, and `invalidateDocumentRequirementWork` drops the snapshot
 * after an upload, review, filing or waiver.
 */
import type { RequirementWorkRow } from "@/lib/documents/requirements/documentRequirementService";
import type { DocumentAttentionRow } from "@/lib/documents/validity/documentAttentionVocabulary";

/** `documents` (D7): document-attention rows (expired, expiring soon, review due, date missing) from the same read. */
/** B3: `documentsNextCursor` continues the document-attention scan; `documentsComplete` once nothing remains. */
export type DocumentRequirementWorkSnapshot = {
    rows: RequirementWorkRow[];
    documents: DocumentAttentionRow[];
    truncated: boolean;
    documentsNextCursor: string | null;
    documentsComplete: boolean;
    loadedAt: number;
};
type WorkView = Omit<DocumentRequirementWorkSnapshot, "loadedAt">;
export type DocumentRequirementWorkLoad = ({ ok: true } & WorkView) | { ok: false; status: number; error: string };
type WorkJson = {
    rows?: RequirementWorkRow[];
    documents?: DocumentAttentionRow[];
    truncated?: boolean;
    documents_next_cursor?: string | null;
    documents_complete?: boolean;
    error?: string;
};
const view = (s: DocumentRequirementWorkSnapshot): WorkView => ({
    rows: s.rows,
    documents: s.documents,
    truncated: s.truncated,
    documentsNextCursor: s.documentsNextCursor,
    documentsComplete: s.documentsComplete,
});

const STALE_MS = 30_000;
let snapshot: DocumentRequirementWorkSnapshot | null = null;
let inflight: Promise<DocumentRequirementWorkLoad> | null = null;
const listeners = new Set<() => void>();

export function getDocumentRequirementWorkSnapshot(): DocumentRequirementWorkSnapshot | null {
    return snapshot;
}

export function subscribeDocumentRequirementWork(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function invalidateDocumentRequirementWork(): void {
    snapshot = null;
    for (const l of listeners) l();
}

export async function loadDocumentRequirementWork(opts: { fresh?: boolean } = {}): Promise<DocumentRequirementWorkLoad> {
    if (!opts.fresh && snapshot && Date.now() - snapshot.loadedAt < STALE_MS) return { ok: true, ...view(snapshot) };
    if (inflight) return inflight;
    inflight = (async (): Promise<DocumentRequirementWorkLoad> => {
        try {
            const res = await fetch("/api/admin/documents/requirements/work", { credentials: "include" });
            const json = (await res.json().catch(() => ({}))) as WorkJson;
            if (!res.ok) return { ok: false, status: res.status, error: json.error ?? "Document requirements could not be read." };
            snapshot = {
                rows: json.rows ?? [],
                documents: json.documents ?? [],
                truncated: json.truncated === true,
                documentsNextCursor: json.documents_next_cursor ?? null,
                documentsComplete: json.documents_complete !== false,
                loadedAt: Date.now(),
            };
            for (const l of listeners) l();
            return { ok: true, ...view(snapshot) };
        } catch (e) {
            return { ok: false, status: 0, error: (e as Error).message };
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

/**
 * B3: the next page of document attention, appended to the snapshot (de-duplicated by row id). Requirement rows are
 * re-read with it, because they decide which documents a requirement row already represents.
 */
export async function loadMoreDocumentAttention(): Promise<DocumentRequirementWorkLoad> {
    const cursor = snapshot?.documentsNextCursor;
    if (!snapshot || !cursor) return snapshot ? { ok: true, ...view(snapshot) } : loadDocumentRequirementWork();
    try {
        const res = await fetch(`/api/admin/documents/requirements/work?documents_cursor=${encodeURIComponent(cursor)}`, { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as WorkJson;
        if (!res.ok) return { ok: false, status: res.status, error: json.error ?? "Document attention could not be read." };
        const seen = new Set(snapshot.documents.map((d) => d.id));
        snapshot = {
            ...snapshot,
            rows: json.rows ?? snapshot.rows,
            documents: [...snapshot.documents, ...(json.documents ?? []).filter((d) => !seen.has(d.id))],
            documentsNextCursor: json.documents_next_cursor ?? null,
            documentsComplete: json.documents_complete !== false,
        };
        for (const l of listeners) l();
        return { ok: true, ...view(snapshot) };
    } catch (e) {
        return { ok: false, status: 0, error: (e as Error).message };
    }
}

export function resetDocumentRequirementWorkForTests(): void {
    snapshot = null;
    inflight = null;
    listeners.clear();
}
