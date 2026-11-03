"use client";

/**
 * D9.3 — archived documents of the library, and their staff restore.
 *
 * Collapsed by default; the list loads only when opened, from `GET /api/admin/documents/archived` (the library's own
 * admission and disclosure, over archived rows only). Restore posts to `POST /api/admin/documents/[id]/restore` with a
 * written reason and is offered only to an operator who may write documents. The server decides everything; this
 * renders its answer, including 503 `archive_unavailable` while the archive migration is not applied.
 */
import { useCallback, useEffect, useState } from "react";

import { formatDateTime } from "@/lib/adminFormatters";
import type { LibraryDocument, LibrarySubjectRef } from "@/lib/documents/library/documentLibraryModel";

type Props = {
    anchor: LibrarySubjectRef;
    focus: LibrarySubjectRef | null;
    canMutate: boolean;
    onRestored: () => Promise<void> | void;
};

const refKey = (r: LibrarySubjectRef | null | undefined) => (r ? `${r.subject_type}:${r.subject_id}` : "all");

function archivedUrl(anchor: LibrarySubjectRef, focus: LibrarySubjectRef | null): string {
    const q = new URLSearchParams({ subject_type: anchor.subject_type, subject_id: anchor.subject_id });
    if (focus) {
        q.set("focus_type", focus.subject_type);
        q.set("focus_id", focus.subject_id);
    }
    return `/api/admin/documents/archived?${q.toString()}`;
}

export default function ArchivedDocumentsSection({ anchor, focus, canMutate, onRestored }: Props) {
    const [open, setOpen] = useState(false);
    const [docs, setDocs] = useState<LibraryDocument[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        const res = await fetch(archivedUrl(anchor, focus), { credentials: "include" }).catch(() => null);
        const json = (await res?.json().catch(() => null)) as { ok?: boolean; documents?: LibraryDocument[]; error?: string } | null;
        if (!res?.ok || !json?.ok) {
            setDocs(null);
            setError(json?.error ?? "Archived documents could not be loaded.");
            return;
        }
        setDocs(json.documents ?? []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refKey(anchor), refKey(focus)]);

    // A different record or member closes the list; it reloads when reopened.
    useEffect(() => {
        setDocs(null);
        setRestoring(null);
        setMessage(null);
    }, [load]);
    useEffect(() => {
        if (open && docs === null) void load();
    }, [open, docs, load]);

    async function restore(id: string) {
        setBusy(true);
        setMessage(null);
        const res = await fetch(`/api/admin/documents/${encodeURIComponent(id)}/restore`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason }),
        }).catch(() => null);
        const json = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        setBusy(false);
        if (!res?.ok || !json?.ok) {
            setMessage(json?.error ?? "The document could not be restored.");
            return;
        }
        setRestoring(null);
        setReason("");
        setMessage("Restored. The document is back in the library.");
        await load();
        await onRestored();
    }

    return (
        <section data-testid="document-library-archived">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55 hover:text-alloy-midnight/80"
                data-testid="document-library-archived-toggle"
            >
                {open ? "Hide archived" : "Archived…"}
            </button>
            {open ? (
                <div className="mt-1 space-y-2">
                    {error ? (
                        <p className="text-[12px] text-amber-900" role="alert">
                            {error}
                        </p>
                    ) : docs === null ? (
                        <p className="text-[12px] text-alloy-midnight/55" aria-busy="true">
                            Loading archived documents…
                        </p>
                    ) : docs.length === 0 ? (
                        <p className="text-[12px] text-alloy-midnight/55" data-testid="document-library-archived-empty">
                            No archived documents.
                        </p>
                    ) : (
                        <ul className="divide-y divide-admin-border rounded-lg border border-admin-border bg-white">
                            {docs.map((d) => (
                                <li key={d.id} className="px-3 py-2 text-[12px]" data-testid={`document-library-archived-${d.id}`}>
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="font-medium text-alloy-midnight">{d.title}</span>
                                        <span className="text-alloy-midnight/55">{d.type.label}</span>
                                    </div>
                                    <p className="text-alloy-midnight/60">
                                        Archived {d.archive?.archived_at ? formatDateTime(d.archive.archived_at) : ""} by{" "}
                                        {d.archive?.by === "application" ? "a connected application" : "staff"}
                                        {d.archive?.reason ? ` — ${d.archive.reason}` : ""}
                                    </p>
                                    {canMutate ? (
                                        restoring === d.id ? (
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={reason}
                                                    onChange={(e) => setReason(e.target.value)}
                                                    placeholder="Why restore it (at least 10 characters)"
                                                    aria-label="Restore reason"
                                                    className="min-w-[14rem] flex-1 rounded border border-alloy-stone/30 px-2 py-1"
                                                    data-testid="document-library-restore-reason"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={busy || reason.trim().length < 10}
                                                    onClick={() => void restore(d.id)}
                                                    className="rounded-md bg-alloy-blue px-2.5 py-1 text-white disabled:opacity-50"
                                                    data-testid="document-library-restore-confirm"
                                                >
                                                    Restore
                                                </button>
                                                <button type="button" onClick={() => setRestoring(null)} className="text-alloy-midnight/60 hover:underline">
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setRestoring(d.id);
                                                    setReason("");
                                                    setMessage(null);
                                                }}
                                                className="mt-1 text-alloy-blue hover:underline"
                                                data-testid={`document-library-restore-${d.id}`}
                                            >
                                                Restore…
                                            </button>
                                        )
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                    {message ? (
                        <p className="text-[12px] text-alloy-midnight/70" role="status" data-testid="document-library-archived-message">
                            {message}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
