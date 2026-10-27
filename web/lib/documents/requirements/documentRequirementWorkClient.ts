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
export type DocumentRequirementWorkSnapshot = { rows: RequirementWorkRow[]; documents: DocumentAttentionRow[]; truncated: boolean; loadedAt: number };
export type DocumentRequirementWorkLoad =
    | { ok: true; rows: RequirementWorkRow[]; documents: DocumentAttentionRow[]; truncated: boolean }
    | { ok: false; status: number; error: string };

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
    if (!opts.fresh && snapshot && Date.now() - snapshot.loadedAt < STALE_MS) return { ok: true, rows: snapshot.rows, documents: snapshot.documents, truncated: snapshot.truncated };
    if (inflight) return inflight;
    inflight = (async (): Promise<DocumentRequirementWorkLoad> => {
        try {
            const res = await fetch("/api/admin/documents/requirements/work", { credentials: "include" });
            const json = (await res.json().catch(() => ({}))) as { rows?: RequirementWorkRow[]; documents?: DocumentAttentionRow[]; truncated?: boolean; error?: string };
            if (!res.ok) return { ok: false, status: res.status, error: json.error ?? "Document requirements could not be read." };
            snapshot = { rows: json.rows ?? [], documents: json.documents ?? [], truncated: json.truncated === true, loadedAt: Date.now() };
            for (const l of listeners) l();
            return { ok: true, rows: snapshot.rows, documents: snapshot.documents, truncated: snapshot.truncated };
        } catch (e) {
            return { ok: false, status: 0, error: (e as Error).message };
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

export function resetDocumentRequirementWorkForTests(): void {
    snapshot = null;
    inflight = null;
    listeners.clear();
}
