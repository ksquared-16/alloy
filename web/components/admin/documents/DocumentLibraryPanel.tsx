"use client";

/**
 * D4 — the household document library, as it renders inside the Focus Panel (Activity → Documents).
 *
 * One list for the household, its adults, its children and its cases, from `GET /api/admin/documents/library`.
 * Organization is logical — subject, then Studio category and type — never storage folders. A subject chip narrows the
 * library on the server. Version history and the document's history load only when a document is expanded; the type
 * vocabulary loads only when the upload form opens. Every write goes through the canonical routes (upload, versions)
 * and invalidates the library cache.
 *
 * What is shown is what the record holds: review and validity appear only when the version carries them, and nothing
 * here derives "missing" or "expiring". A D3 policy that is still declaration-only is never presented as enforced; the
 * one enforced rule (the type's default sensitivity) is named as such.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AlloySelect } from "@/components/workspace/AlloySelect";
import { formatDateTime } from "@/lib/adminFormatters";
import type { DocumentLibrary, LibraryDocument, LibrarySubject, LibrarySubjectRef } from "@/lib/documents/library/documentLibraryModel";
import { LIBRARY_UPLOAD_ENTITY_TYPE } from "@/lib/documents/library/documentLibraryModel";
import { cachedDocumentLibrary, invalidateDocumentLibraries, loadDocumentLibrary } from "@/lib/documents/library/documentLibraryClient";
import type { DocumentHistoryEntry } from "@/lib/documents/library/documentHistory";
import type { DocumentTypeSummary } from "@/lib/documents/configuration/documentConfigurationService";

type Props = {
    anchor: LibrarySubjectRef;
    /** The member the operator is working on (e.g. the selected child): the library opens narrowed to it. */
    initialFocus?: LibrarySubjectRef | null;
    canMutate: boolean;
};

const SENSITIVITY_LABEL: Record<string, string> = {
    personal_identity: "Personal identity",
    medical: "Medical",
    custody_safeguarding: "Custody / safeguarding",
    restricted: "Restricted",
};
const ROLE_LABEL: Record<LibrarySubject["role"], string> = { household: "Household", adult: "Adult", child: "Child", case: "Case" };
const KIND_LABEL: Record<DocumentHistoryEntry["kind"], string> = { committed: "Done", system: "System", refused: "Not applied", access: "Access" };

const refKey = (r: LibrarySubjectRef | null | undefined) => (r ? `${r.subject_type}:${r.subject_id}` : "all");

function formatBytes(n: number | null): string | null {
    if (n == null) return null;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function openSignedUrl(documentId: string, versionId?: string): Promise<string | null> {
    const q = versionId ? `?version=${encodeURIComponent(versionId)}` : "";
    try {
        const res = await fetch(`/api/admin/documents/${encodeURIComponent(documentId)}/signed-url${q}`, { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as { signedUrl?: string; error?: string };
        if (!res.ok || !json.signedUrl) return json.error ?? `Could not open file (${res.status})`;
        window.open(json.signedUrl, "_blank", "noopener,noreferrer");
        return null;
    } catch (e) {
        return (e as Error).message || "Network error";
    }
}

export default function DocumentLibraryPanel({ anchor, initialFocus = null, canMutate }: Props) {
    const [focus, setFocus] = useState<LibrarySubjectRef | null>(initialFocus);
    const seeded = cachedDocumentLibrary(anchor, initialFocus);
    const [library, setLibrary] = useState<DocumentLibrary | null>(seeded?.ok ? seeded.library : null);
    const [loading, setLoading] = useState(!seeded?.ok);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [uploadOpen, setUploadOpen] = useState(false);
    const request = useRef(0);

    // A new record (or a new selected member) starts from its own focus.
    useEffect(() => {
        setFocus(initialFocus);
        setExpanded(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refKey(anchor), refKey(initialFocus)]);

    const load = useCallback(
        async (fresh = false) => {
            const n = ++request.current;
            const cached = cachedDocumentLibrary(anchor, focus);
            if (cached?.ok && !fresh) {
                setLibrary(cached.library);
                setLoading(false);
            } else {
                setLoading(!cached?.ok);
            }
            const r = await loadDocumentLibrary(anchor, focus, { fresh });
            if (n !== request.current) return;
            setLoading(false);
            if (r.ok) {
                setLibrary(r.library);
                setError(null);
            } else {
                setError(r.error);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [refKey(anchor), refKey(focus)],
    );
    useEffect(() => {
        void load();
    }, [load]);

    const afterWrite = useCallback(async () => {
        invalidateDocumentLibraries();
        await load(true);
    }, [load]);

    const subjects = library?.subjects ?? [];
    const subjectLabel = useMemo(() => new Map(subjects.map((s) => [refKey(s), s])), [subjects]);
    const docs = library?.documents ?? [];
    const typeOptions = useMemo(() => [...new Map(docs.map((d) => [d.type.key ?? "", d.type.label])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [docs]);
    const categoryOptions = useMemo(
        () => [...new Map(docs.filter((d) => d.type.category_id).map((d) => [d.type.category_id as string, d.type.category_label ?? "Category"])).entries()],
        [docs],
    );

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return docs.filter((d) => {
            if (typeFilter && (d.type.key ?? "") !== typeFilter) return false;
            if (categoryFilter && d.type.category_id !== categoryFilter) return false;
            if (!q) return true;
            return [d.title, d.original_filename, d.type.label, d.type.category_label].some((v) => v && v.toLowerCase().includes(q));
        });
    }, [docs, query, typeFilter, categoryFilter]);

    // Group: owner subject (in household order), then category, then type.
    const groups = useMemo(() => {
        const order = new Map(subjects.map((s, i) => [refKey(s), i]));
        const bySubject = new Map<string, LibraryDocument[]>();
        for (const d of visible) {
            const k = d.owner ? refKey(d.owner) : "elsewhere";
            const list = bySubject.get(k) ?? [];
            list.push(d);
            bySubject.set(k, list);
        }
        return [...bySubject.entries()]
            .sort((a, b) => (order.get(a[0]) ?? 1e9) - (order.get(b[0]) ?? 1e9))
            .map(([k, list]) => ({
                key: k,
                subject: subjectLabel.get(k) ?? null,
                docs: [...list].sort(
                    (a, b) =>
                        (a.type.category_label ?? "~").localeCompare(b.type.category_label ?? "~") ||
                        a.type.label.localeCompare(b.type.label) ||
                        String(b.received_at ?? "").localeCompare(String(a.received_at ?? "")),
                ),
            }));
    }, [visible, subjects, subjectLabel]);

    const chips: Array<{ ref: LibrarySubjectRef | null; label: string }> = [
        { ref: null, label: library?.household ? "Whole household" : "All" },
        ...subjects.filter((s) => s.role !== "case").map((s) => ({ ref: { subject_type: s.subject_type, subject_id: s.subject_id }, label: s.label })),
    ];

    return (
        <div className="space-y-3" data-testid="document-library">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Whose documents">
                {chips.map((c) => (
                    <button
                        key={refKey(c.ref)}
                        type="button"
                        role="tab"
                        aria-selected={refKey(c.ref) === refKey(focus)}
                        onClick={() => setFocus(c.ref)}
                        data-testid={`document-library-focus-${refKey(c.ref)}`}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                            refKey(c.ref) === refKey(focus) ? "border-alloy-blue bg-alloy-blue/10 text-alloy-midnight" : "border-alloy-stone/30 text-alloy-midnight/65 hover:bg-alloy-stone/10"
                        }`}
                    >
                        {c.label}
                    </button>
                ))}
                {canMutate ? (
                    <button
                        type="button"
                        onClick={() => setUploadOpen((v) => !v)}
                        className="ml-auto rounded-md bg-alloy-blue px-2.5 py-1 text-[12px] text-white hover:opacity-90"
                        data-testid="document-library-upload-toggle"
                    >
                        {uploadOpen ? "Close upload" : "Upload…"}
                    </button>
                ) : null}
            </div>

            {uploadOpen && canMutate && library ? (
                <LibraryUploadForm subjects={subjects} defaultSubject={focus ?? subjects[0] ?? null} onDone={afterWrite} onMessage={setMessage} />
            ) : null}

            {docs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search documents"
                        aria-label="Search documents"
                        className="min-w-[10rem] flex-1 rounded border border-alloy-stone/30 px-2 py-1 text-[12px]"
                        data-testid="document-library-search"
                    />
                    <AlloySelect
                        aria-label="Type"
                        density="compact"
                        value={typeFilter}
                        onChange={setTypeFilter}
                        placeholder="All types"
                        options={typeOptions.map(([k, label]) => ({ value: k, label }))}
                        testId="document-library-type-filter"
                    />
                    {categoryOptions.length ? (
                        <AlloySelect
                            aria-label="Category"
                            density="compact"
                            value={categoryFilter}
                            onChange={setCategoryFilter}
                            placeholder="All categories"
                            options={categoryOptions.map(([id, label]) => ({ value: id, label }))}
                            testId="document-library-category-filter"
                        />
                    ) : null}
                </div>
            ) : null}

            {error ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
                    <span>Could not load documents: {error}</span>
                    <button type="button" onClick={() => void load(true)} className="rounded border border-amber-300 px-2 py-1 text-xs font-medium hover:bg-amber-100">
                        Retry
                    </button>
                </div>
            ) : null}

            {loading && !library ? (
                <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-4 text-sm text-alloy-midnight/60" aria-busy="true" data-testid="document-library-loading">
                    Loading documents…
                </div>
            ) : library && docs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-alloy-stone/40 bg-alloy-stone/5 px-3 py-4 text-center text-sm text-alloy-midnight/60" data-testid="document-library-empty">
                    <p className="font-medium text-alloy-midnight/70">No documents{focus ? ` for ${subjectLabel.get(refKey(focus))?.label ?? "this person"}` : ""}</p>
                    <p className="mt-1 text-xs text-alloy-midnight/50">{canMutate ? "Upload a file to file it here." : "Documents appear here once they are filed."}</p>
                </div>
            ) : (
                groups.map((g) => (
                    <section key={g.key} data-testid={`document-library-group-${g.key}`}>
                        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                            {g.subject ? `${g.subject.label} · ${ROLE_LABEL[g.subject.role]}` : "Related from another record"}
                        </h4>
                        <ul className="divide-y divide-admin-border rounded-lg border border-admin-border bg-white">
                            {g.docs.map((d) => (
                                <LibraryRow
                                    key={d.id}
                                    doc={d}
                                    subjectLabel={subjectLabel}
                                    expanded={expanded === d.id}
                                    onToggle={() => setExpanded((cur) => (cur === d.id ? null : d.id))}
                                    canMutate={canMutate}
                                    onMessage={setMessage}
                                    onAfterWrite={afterWrite}
                                />
                            ))}
                        </ul>
                    </section>
                ))
            )}

            {library?.truncated ? <p className="text-[11px] text-alloy-midnight/50">Showing the most recent documents. Narrow to one person to see more.</p> : null}
            {message ? (
                <p className="text-[12px] text-alloy-midnight/70" role="status" data-testid="document-library-message">
                    {message}
                </p>
            ) : null}
        </div>
    );
}

function LibraryRow({
    doc,
    subjectLabel,
    expanded,
    onToggle,
    canMutate,
    onMessage,
    onAfterWrite,
}: {
    doc: LibraryDocument;
    subjectLabel: Map<string, LibrarySubject>;
    expanded: boolean;
    onToggle: () => void;
    canMutate: boolean;
    onMessage: (m: string | null) => void;
    onAfterWrite: () => Promise<void>;
}) {
    const [opening, setOpening] = useState(false);
    const v = doc.current_version;
    const facts = [
        doc.type.label,
        doc.type.category_label,
        v ? `v${v.version_number}${doc.version_count > 1 ? ` of ${doc.version_count}` : ""}` : null,
        doc.received_at ? `Received ${formatDateTime(doc.received_at)}` : null,
        formatBytes(doc.byte_size),
    ].filter(Boolean);
    const recorded = [
        v?.review_status ? `Review: ${v.review_status}` : null,
        v?.effective_on ? `Effective ${v.effective_on}` : null,
        v?.expires_on ? `Expires ${v.expires_on}` : null,
    ].filter(Boolean);
    const others = doc.associations.filter((a) => !a.is_primary).map((a) => subjectLabel.get(`${a.subject_type}:${a.subject_id}`)?.label).filter(Boolean);

    return (
        <li className="px-3 py-2 text-sm" data-testid={`document-library-row-${doc.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggle} aria-expanded={expanded}>
                    <p className="truncate font-medium text-alloy-midnight">{doc.title}</p>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/55">{facts.join(" · ")}</p>
                    {recorded.length ? <p className="mt-0.5 text-[11px] text-alloy-midnight/55">{recorded.join(" · ")}</p> : null}
                    <p className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                        {SENSITIVITY_LABEL[doc.sensitivity] ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">{SENSITIVITY_LABEL[doc.sensitivity]}</span> : null}
                        {doc.forms_artifact ? <span className="rounded bg-alloy-stone/10 px-1.5 py-0.5 text-alloy-midnight/70">Forms</span> : null}
                        {!doc.type.registered && doc.type.key ? <span className="rounded bg-alloy-stone/10 px-1.5 py-0.5 text-alloy-midnight/60">Unregistered type</span> : null}
                        {others.length ? <span className="text-alloy-midnight/55">Also relates to {others.join(", ")}</span> : null}
                    </p>
                </button>
                <button
                    type="button"
                    disabled={opening}
                    onClick={async () => {
                        setOpening(true);
                        onMessage(await openSignedUrl(doc.id));
                        setOpening(false);
                    }}
                    className="shrink-0 text-[12px] font-medium text-alloy-blue disabled:opacity-50"
                    data-testid={`document-library-open-${doc.id}`}
                >
                    {opening ? "Opening…" : "Open"}
                </button>
            </div>
            {expanded ? <LibraryRowDetail doc={doc} canMutate={canMutate} onMessage={onMessage} onAfterWrite={onAfterWrite} /> : null}
        </li>
    );
}

type VersionView = { id: string; version_number: number; created_at: string | null; is_current?: boolean; replacement_reason?: string | null; original_filename?: string | null };

/** Deferred: versions and history are fetched only when a document is expanded. */
function LibraryRowDetail({ doc, canMutate, onMessage, onAfterWrite }: { doc: LibraryDocument; canMutate: boolean; onMessage: (m: string | null) => void; onAfterWrite: () => Promise<void> }) {
    const [versions, setVersions] = useState<VersionView[] | null>(null);
    const [history, setHistory] = useState<DocumentHistoryEntry[] | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const loadDetail = useCallback(async () => {
        setFailed(null);
        const [v, h] = await Promise.all([
            fetch(`/api/admin/documents/${encodeURIComponent(doc.id)}/versions`, { credentials: "include" }).then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
            fetch(`/api/admin/documents/${encodeURIComponent(doc.id)}/history`, { credentials: "include" }).then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
        ]).catch(() => [{ ok: false, j: {} }, { ok: false, j: {} }] as const);
        if (!v.ok || !h.ok) setFailed((v.j as { error?: string }).error ?? (h.j as { error?: string }).error ?? "Could not load the history.");
        setVersions(v.ok ? ((v.j as { versions?: VersionView[] }).versions ?? []) : []);
        setHistory(h.ok ? ((h.j as { entries?: DocumentHistoryEntry[] }).entries ?? []) : []);
    }, [doc.id]);
    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    const replace = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) return onMessage("Choose the new file first.");
        if (reason.trim().length < 10) return onMessage("Say why it is being replaced (at least 10 characters).");
        setBusy(true);
        const fd = new FormData();
        fd.set("file", file);
        fd.set("reason", reason.trim());
        const res = await fetch(`/api/admin/documents/${encodeURIComponent(doc.id)}/versions`, { method: "POST", body: fd, credentials: "include" }).catch(() => null);
        const json = (await res?.json().catch(() => ({}))) as { error?: string; code?: string } | undefined;
        setBusy(false);
        if (!res?.ok) return onMessage(`${json?.error ?? "The new version was not saved."}${json?.code ? ` (${json.code})` : ""}`);
        setReason("");
        if (fileRef.current) fileRef.current.value = "";
        onMessage("New version saved.");
        await onAfterWrite();
        await loadDetail();
    };

    return (
        <div className="mt-2 space-y-2 rounded-md bg-alloy-stone/5 p-2 text-[12px]" data-testid={`document-library-detail-${doc.id}`}>
            {failed ? <p className="text-red-800" role="alert">{failed}</p> : null}
            <div>
                <p className="mb-1 font-medium text-alloy-midnight/70">Versions</p>
                {versions == null ? (
                    <p className="text-alloy-midnight/50">Loading…</p>
                ) : (
                    <ul className="space-y-1">
                        {versions.map((v) => (
                            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span>
                                    v{v.version_number}
                                    {v.is_current ? " (current)" : ""} · {v.created_at ? formatDateTime(v.created_at) : "—"}
                                    {v.replacement_reason ? ` · ${v.replacement_reason}` : ""}
                                </span>
                                <button type="button" className="text-alloy-blue" onClick={async () => onMessage(await openSignedUrl(doc.id, v.id))}>
                                    Open v{v.version_number}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div>
                <p className="mb-1 font-medium text-alloy-midnight/70">History</p>
                {history == null ? (
                    <p className="text-alloy-midnight/50">Loading…</p>
                ) : history.length === 0 ? (
                    <p className="text-alloy-midnight/50">No recorded history.</p>
                ) : (
                    <ul className="space-y-0.5" data-testid={`document-library-history-${doc.id}`}>
                        {history.map((e, i) => (
                            <li key={`${e.at}-${i}`} data-history-kind={e.kind} className={e.kind === "refused" ? "text-alloy-midnight/55" : ""}>
                                <span className="mr-1 rounded bg-white px-1 text-[10px] uppercase text-alloy-midnight/55">{KIND_LABEL[e.kind]}</span>
                                {e.action}
                                {e.version_number ? ` (v${e.version_number})` : ""}
                                {e.detail ? ` — ${e.detail}` : ""} · {e.at ? formatDateTime(e.at) : ""}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {canMutate ? (
                <div className="space-y-1 border-t border-alloy-stone/15 pt-2">
                    <p className="font-medium text-alloy-midnight/70">Replace with a new version</p>
                    <input ref={fileRef} type="file" className="text-[12px]" aria-label="New version file" />
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it is being replaced" className="w-full rounded border border-alloy-stone/30 px-2 py-1" aria-label="Replacement reason" />
                    <button type="button" disabled={busy} onClick={() => void replace()} className="rounded border border-alloy-stone/30 px-2 py-1 disabled:opacity-50">
                        {busy ? "Saving…" : "Save new version"}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

/** Upload to one member of the household through the canonical upload route. The type list loads only when opened. */
function LibraryUploadForm({
    subjects,
    defaultSubject,
    onDone,
    onMessage,
}: {
    subjects: LibrarySubject[];
    defaultSubject: LibrarySubjectRef | null;
    onDone: () => Promise<void>;
    onMessage: (m: string | null) => void;
}) {
    const [subject, setSubject] = useState(refKey(defaultSubject));
    const [types, setTypes] = useState<DocumentTypeSummary[] | null>(null);
    const [typeKey, setTypeKey] = useState("");
    const [title, setTitle] = useState("");
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let live = true;
        void fetch("/api/admin/documents/configuration/types", { credentials: "include" })
            .then((r) => r.json())
            .then((j: { types?: DocumentTypeSummary[] }) => live && setTypes((j.types ?? []).filter((t) => t.status === "active" && t.published)))
            .catch(() => live && setTypes([]));
        return () => {
            live = false;
        };
    }, []);

    const chosen = types?.find((t) => t.key === typeKey) ?? null;
    const target = subjects.find((s) => refKey(s) === subject) ?? null;

    const submit = async () => {
        const file = fileRef.current?.files?.[0];
        if (!target) return onMessage("Choose who the document belongs to.");
        if (!file) return onMessage("Choose a file.");
        setBusy(true);
        onMessage(null);
        const fd = new FormData();
        fd.set("file", file);
        fd.set("entity_type", LIBRARY_UPLOAD_ENTITY_TYPE[target.subject_type]);
        fd.set("entity_id", target.subject_id);
        if (typeKey) fd.set("doc_type", typeKey);
        if (title.trim()) fd.set("title", title.trim());
        const res = await fetch("/api/admin/documents/upload", { method: "POST", body: fd, credentials: "include" }).catch(() => null);
        const json = (await res?.json().catch(() => ({}))) as { error?: string; code?: string; document?: { status?: string } } | undefined;
        setBusy(false);
        if (!res?.ok) return onMessage(`${json?.error ?? "Upload failed."}${json?.code ? ` (${json.code})` : ""}`);
        if (fileRef.current) fileRef.current.value = "";
        setTitle("");
        onMessage(json?.document?.status === "quarantined" ? "Uploaded and held for review by screening — it is not available until released." : "Uploaded.");
        await onDone();
    };

    return (
        <div className="space-y-2 rounded-lg border border-alloy-stone/30 bg-alloy-pine/5 p-3 text-[12px]" data-testid="document-library-upload">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                    <span className="mb-0.5 block text-alloy-midnight/60">Belongs to</span>
                    <AlloySelect
                        aria-label="Belongs to"
                        value={subject}
                        onChange={setSubject}
                        allowEmpty={false}
                        placeholder="Choose who it belongs to"
                        options={subjects.map((s) => ({ value: refKey(s), label: `${s.label} (${ROLE_LABEL[s.role]})` }))}
                        testId="document-library-upload-subject"
                    />
                </label>
                <label className="block">
                    <span className="mb-0.5 block text-alloy-midnight/60">Document type</span>
                    <AlloySelect
                        aria-label="Document type"
                        value={typeKey}
                        onChange={setTypeKey}
                        disabled={types == null}
                        placeholder={types == null ? "Loading types…" : "Unclassified"}
                        options={(types ?? []).map((t) => ({ value: t.key, label: t.published?.label ?? t.key }))}
                        testId="document-library-upload-type"
                    />
                </label>
                <label className="block sm:col-span-2">
                    <span className="mb-0.5 block text-alloy-midnight/60">Title (optional)</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border px-2 py-1" />
                </label>
            </div>
            {chosen?.published && chosen.published.default_sensitivity !== "standard" ? (
                <p className="text-alloy-midnight/65" data-testid="document-library-upload-sensitivity">
                    Classified {SENSITIVITY_LABEL[chosen.published.default_sensitivity] ?? chosen.published.default_sensitivity} by its type — enforced for new documents.
                </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" aria-label="File" className="text-[12px]" />
                <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-md bg-alloy-blue px-3 py-1 text-white disabled:opacity-50" data-testid="document-library-upload-submit">
                    {busy ? "Uploading…" : "Upload"}
                </button>
            </div>
            <p className="text-[11px] text-alloy-midnight/45">Files are checked and screened before they are stored. A file screening flags is held for review.</p>
        </div>
    );
}
