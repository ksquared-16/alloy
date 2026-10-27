"use client";

/**
 * Processing → Work → Documents (D5): the operational queue of received documents and the filing workspace.
 *
 * The queue is the Processing case spine, read through `GET /api/admin/processing/documents/queue`; each row's lane is
 * derived on the server. Opening a row shows the filing workspace in place — no separate Documents application:
 *   1. the received document (opened through the one signed-link decision),
 *   2. its type, from the organization's published Studio types (the classifier's suggestion is only a proposal),
 *   3. the record it belongs to, chosen from a household graph (never matched from a name or an email), plus any
 *      related records it also concerns,
 *   4. review, when the type requires it, and an optional sensitivity raise,
 *   5. the server's preview with every problem still to resolve, and
 *   6. File — the case's approval, which runs the Documents filing command and completes the case only when the filing
 *      committed. A refusal stays on the case as a filing error with Retry.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";
import {
    DOCUMENT_FILING_LANE_LABEL,
    DOCUMENT_FILING_LANES,
    type DocumentFilingLane,
    type DocumentFilingProposal,
    type ProposalSubject,
} from "@/lib/pos/documentFiling/documentFilingModel";
import type { DocumentFilingQueueRow, DocumentFilingWorkspace } from "@/lib/pos/documentFiling/documentFilingService";
import {
    fetchDocumentFilingQueue,
    fetchDocumentFilingWorkspace,
    fileDocumentCaseRequest,
    openDocumentLink,
    saveDocumentFilingProposalRequest,
    searchHouseholds,
    type HouseholdSearchHit,
} from "@/lib/pos/documentFiling/documentFilingClient";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import { invalidateDocumentLibraries } from "@/lib/documents/library/documentLibraryClient";
import { invalidateDocumentRequirementWork } from "@/lib/documents/requirements/documentRequirementWorkClient";

import ProcessingDocumentRequirementWork from "./ProcessingDocumentRequirementWork";

const SENSITIVITY_LABEL: Record<string, string> = {
    standard: "Standard",
    personal_identity: "Personal identity",
    medical: "Medical",
    custody_safeguarding: "Custody / safeguarding",
    restricted: "Restricted",
};
const SENSITIVITY_ORDER = ["standard", "personal_identity", "medical", "custody_safeguarding", "restricted"];
const SUBJECT_ROLE_LABEL: Record<string, string> = { household: "Household", adult: "Adult", child: "Child", case: "Case" };
const ENTITY_FOR_SUBJECT: Record<string, string> = { household: "customers", person: "persons", child: "customer_members", opportunity: "opportunities" };

const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const fmtSize = (n: number | null | undefined) => (typeof n === "number" ? (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : "—");

/**
 * Two views of one Documents work surface: received documents to file (D5) and missing documents — unmet, required
 * document requirements derived by the Documents evaluator (D6). Received documents stay the default.
 */
export default function ProcessingDocumentsWork({ onLeaveProcessing }: { onLeaveProcessing?: () => void }) {
    const [mode, setMode] = useState<"received" | "missing">("received");
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 gap-1 border-b border-stone-200 px-2 py-1.5" role="tablist" aria-label="Documents work">
                {(
                    [
                        ["received", "Received documents"],
                        ["missing", "Missing documents"],
                    ] as const
                ).map(([k, label]) => (
                    <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={mode === k}
                        data-testid={`documents-work-mode-${k}`}
                        onClick={() => setMode(k)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold ${mode === k ? "bg-alloy-bend-pine/10 text-alloy-bend-pine" : "text-alloy-midnight/60 hover:bg-stone-100"}`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {mode === "received" ? <ReceivedDocumentsWork onLeaveProcessing={onLeaveProcessing} /> : <ProcessingDocumentRequirementWork onLeaveProcessing={onLeaveProcessing} />}
        </div>
    );
}

function ReceivedDocumentsWork({ onLeaveProcessing }: { onLeaveProcessing?: () => void }) {
    const [rows, setRows] = useState<DocumentFilingQueueRow[] | null>(null);
    const [queueError, setQueueError] = useState<string | null>(null);
    const [lane, setLane] = useState<DocumentFilingLane | "all">("all");
    const [selected, setSelected] = useState<string | null>(null);

    const loadQueue = useCallback(async () => {
        const r = await fetchDocumentFilingQueue();
        if (!r.ok) {
            setQueueError(r.message);
            return;
        }
        setQueueError(null);
        setRows(r.body.rows);
    }, []);
    useEffect(() => {
        void loadQueue();
    }, [loadQueue]);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const r of rows ?? []) c[r.lane] = (c[r.lane] ?? 0) + 1;
        return c;
    }, [rows]);
    const visible = (rows ?? []).filter((r) => lane === "all" || r.lane === lane);

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden" data-testid="processing-documents-work">
            <aside className="flex w-[34%] min-w-[18rem] flex-col border-r border-stone-200" aria-label="Documents queue">
                <div className="flex flex-wrap gap-1 border-b border-stone-200 p-2" role="tablist" aria-label="Document lanes">
                    {(["all", ...DOCUMENT_FILING_LANES] as const).map((k) => (
                        <button
                            key={k}
                            type="button"
                            role="tab"
                            aria-selected={lane === k}
                            data-testid={`documents-lane-${k}`}
                            onClick={() => setLane(k)}
                            className={`rounded-full px-2.5 py-1 text-xs ${lane === k ? "bg-alloy-midnight text-white" : "bg-stone-100 text-alloy-midnight/75 hover:bg-stone-200"}`}
                        >
                            {k === "all" ? "All" : DOCUMENT_FILING_LANE_LABEL[k]}
                            <span className="ml-1 tabular-nums opacity-70">{k === "all" ? rows?.length ?? 0 : counts[k] ?? 0}</span>
                        </button>
                    ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {queueError ? (
                        <div className="p-3 text-sm text-red-700" role="alert">
                            {queueError}{" "}
                            <button type="button" className="underline" onClick={() => void loadQueue()}>
                                Retry
                            </button>
                        </div>
                    ) : rows === null ? (
                        <p className="p-3 text-sm text-alloy-midnight/60">Loading documents…</p>
                    ) : visible.length === 0 ? (
                        <p className="p-3 text-sm text-alloy-midnight/60" data-testid="documents-queue-empty">
                            No documents here.
                        </p>
                    ) : (
                        <ul>
                            {visible.map((r) => (
                                <li key={r.case_id}>
                                    <button
                                        type="button"
                                        data-testid={`documents-queue-row-${r.case_id}`}
                                        onClick={() => setSelected(r.case_id)}
                                        className={`w-full border-b border-stone-100 px-3 py-2 text-left hover:bg-stone-50 ${selected === r.case_id ? "bg-stone-100" : ""}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium text-alloy-midnight">{r.title}</span>
                                            <span className="shrink-0 text-[11px] text-alloy-midnight/55">{fmtDate(r.received_at)}</span>
                                        </div>
                                        <div className="mt-0.5 text-xs text-alloy-midnight/65">
                                            {r.proposed_type?.label ?? (r.suggested_type ? `Suggested: ${r.suggested_type.label}` : "Type not chosen")}
                                            {" · "}
                                            {r.proposed_subject?.label ?? "No record chosen"}
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                                            <span data-testid={`documents-queue-lane-${r.case_id}`} className="rounded bg-stone-100 px-1.5 py-0.5">
                                                {DOCUMENT_FILING_LANE_LABEL[r.lane]}
                                            </span>
                                            <span className="text-alloy-midnight/60">{r.required_action}</span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </aside>
            <section className="min-h-0 flex-1 overflow-y-auto" aria-label="Filing workspace">
                {selected ? (
                    <DocumentFilingWorkspacePanel key={selected} caseId={selected} onChanged={loadQueue} onLeaveProcessing={onLeaveProcessing} />
                ) : (
                    <p className="p-6 text-sm text-alloy-midnight/60">Choose a document to classify it, choose its record and file it.</p>
                )}
            </section>
        </div>
    );
}

function DocumentFilingWorkspacePanel({ caseId, onChanged, onLeaveProcessing }: { caseId: string; onChanged: () => void; onLeaveProcessing?: () => void }) {
    const [ws, setWs] = useState<DocumentFilingWorkspace | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<null | "save" | "file" | "open">(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<HouseholdSearchHit[]>([]);
    const focusRecord = useOperatorRecordFocus();

    const load = useCallback(
        async (householdId?: string | null) => {
            const r = await fetchDocumentFilingWorkspace(caseId, householdId);
            if (!r.ok) {
                setError(r.message);
                return;
            }
            setError(null);
            setWs(r.body.workspace);
        },
        [caseId],
    );
    useEffect(() => {
        void load();
    }, [load]);

    const save = useCallback(
        async (patch: Partial<DocumentFilingProposal>) => {
            if (!ws) return;
            setBusy("save");
            setNotice(null);
            const next = { ...ws.proposal, ...patch };
            const r = await saveDocumentFilingProposalRequest(caseId, next);
            setBusy(null);
            if (!r.ok) {
                setNotice(r.message);
                return;
            }
            await load(next.household_id);
            onChanged();
        },
        [caseId, load, onChanged, ws],
    );

    if (error) {
        return (
            <div className="p-6 text-sm text-red-700" role="alert" data-testid="documents-workspace-error">
                {error}{" "}
                <button type="button" className="underline" onClick={() => void load()}>
                    Retry
                </button>
            </div>
        );
    }
    if (!ws) return <p className="p-6 text-sm text-alloy-midnight/60">Loading…</p>;

    const p = ws.proposal;
    const policy = ws.preview?.policy ?? (p.doc_type ? ws.catalog.find((t) => t.key === p.doc_type) ?? null : null);
    const doc = ws.preview?.document ?? null;
    const result = ws.case.operational_result as null | { filed_document_id?: string; primary?: { subject_type: string; subject_id: string; label?: string | null }; mode?: string; version_number?: number | null };
    const problems = ws.preview?.problems ?? [];
    const memberChosen = (m: ProposalSubject) => p.primary?.subject_type === m.subject_type && p.primary.subject_id === m.subject_id;
    const contextChosen = (m: ProposalSubject) => p.contexts.some((c) => c.subject_type === m.subject_type && c.subject_id === m.subject_id);
    const minSensitivity = ws.preview?.resulting_sensitivity ?? "standard";

    const openDocument = async () => {
        setBusy("open");
        const url = await openDocumentLink(ws.document_id);
        setBusy(null);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        else setNotice("The document could not be opened.");
    };
    const file = async () => {
        setBusy("file");
        setNotice(null);
        const r = await fileDocumentCaseRequest(caseId);
        setBusy(null);
        if (!r.ok) setNotice(r.message);
        else {
            invalidateDocumentLibraries();
            // A filed document can satisfy a requirement: the derived work is re-read, never patched.
            invalidateDocumentRequirementWork();
        }
        await load(p.household_id);
        onChanged();
    };
    const openRecord = async () => {
        const primary = result?.primary;
        if (!primary) return;
        const opened = await focusRecord({
            entity_type: ENTITY_FOR_SUBJECT[primary.subject_type] ?? primary.subject_type,
            entity_id: primary.subject_id,
            intent: "durable_record",
            card_focus: { card_key: OPERATOR_FOCUS_CARDS.documents, item_id: result?.filed_document_id ?? null },
        });
        if (!opened) setNotice("That record can't be opened from here.");
        else onLeaveProcessing?.();
    };

    if (ws.case.filed) {
        return (
            <div className="space-y-3 p-6" data-testid="documents-filed-result">
                <h3 className="text-base font-semibold text-alloy-midnight">Filed</h3>
                <p className="text-sm text-alloy-midnight/75">
                    {result?.mode === "new_version" ? `Filed as version ${result?.version_number ?? ""} of the record's existing document` : "Filed"} under{" "}
                    <strong>{result?.primary?.label ?? "the chosen record"}</strong>. It is in that record's document library.
                </p>
                <button type="button" className={WS_ACTION_PRIMARY} data-testid="documents-open-record" onClick={() => void openRecord()}>
                    Open record
                </button>
                {notice ? <p className="text-sm text-alloy-midnight/70">{notice}</p> : null}
            </div>
        );
    }

    return (
        <div className="space-y-5 p-5" data-testid="documents-filing-workspace">
            <header className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-alloy-midnight">{doc?.title ?? "Received document"}</h3>
                    <p className="text-xs text-alloy-midnight/60">
                        Received {fmtDate(doc?.received_at ?? ws.case.received_at)} · {doc?.format?.toUpperCase() ?? "—"} · {fmtSize(doc?.byte_size)}
                    </p>
                </div>
                <button type="button" className={WS_ACTION_SECONDARY} disabled={busy !== null || Boolean(ws.blocked)} onClick={() => void openDocument()}>
                    Open document
                </button>
            </header>

            {ws.blocked ? (
                <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="documents-blocked">
                    {ws.blocked.message}
                </div>
            ) : null}
            {p.last_error ? (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="documents-filing-error">
                    Filing did not happen: {p.last_error.message}
                </div>
            ) : null}

            {/* 1. Type */}
            <section aria-labelledby="doc-type-h" className="space-y-2">
                <h4 id="doc-type-h" className="text-sm font-semibold text-alloy-midnight">
                    Document type
                </h4>
                {ws.suggested_type && !p.doc_type ? (
                    <div className="flex items-center justify-between rounded bg-stone-50 p-2 text-xs text-alloy-midnight/75" data-testid="documents-suggestion">
                        <span>
                            Suggested: <strong>{ws.suggested_type.label}</strong> ({Math.round(ws.suggested_type.confidence * 100)}%, {ws.suggested_type.method})
                        </span>
                        <button type="button" className="underline" onClick={() => void save({ doc_type: ws.suggested_type!.key, doc_type_source: "suggested" })}>
                            Use
                        </button>
                    </div>
                ) : null}
                <select
                    data-testid="documents-type-select"
                    className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                    value={p.doc_type ?? ""}
                    disabled={busy !== null || Boolean(ws.blocked)}
                    onChange={(e) => void save({ doc_type: e.target.value || null, doc_type_source: "operator", mode: "new_document", target_document_id: null, review_accepted: false })}
                >
                    <option value="">Choose a type…</option>
                    {ws.catalog.map((t) => (
                        <option key={t.key} value={t.key}>
                            {t.label}
                            {t.category_label ? ` — ${t.category_label}` : ""}
                        </option>
                    ))}
                </select>
                {policy ? (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-alloy-midnight/75" data-testid="documents-type-policy">
                        <dt>Category</dt>
                        <dd>{policy.category_label ?? "—"}</dd>
                        <dt>Applies to</dt>
                        <dd>{policy.subject_types.join(", ")}</dd>
                        <dt>Sensitivity</dt>
                        <dd>{SENSITIVITY_LABEL[policy.default_sensitivity] ?? policy.default_sensitivity}</dd>
                        <dt>Formats</dt>
                        <dd>{policy.allowed_formats.map((f) => f.toUpperCase()).join(", ")}</dd>
                        <dt>Review</dt>
                        <dd>{policy.review_required ? "Required before filing" : "Not required"}</dd>
                        <dt>Replacement</dt>
                        <dd>{policy.replacement_policy === "new_version" ? "New version of the existing document" : policy.replacement_policy === "not_allowed" ? "Not allowed" : "Kept as separate documents"}</dd>
                    </dl>
                ) : null}
            </section>

            {/* 2. Record */}
            <section aria-labelledby="doc-record-h" className="space-y-2">
                <h4 id="doc-record-h" className="text-sm font-semibold text-alloy-midnight">
                    Record
                </h4>
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (query.trim().length >= 2) void searchHouseholds(query.trim()).then(setHits);
                    }}
                >
                    <input
                        data-testid="documents-record-search"
                        className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
                        placeholder="Find a family, parent or child"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        disabled={Boolean(ws.blocked)}
                    />
                    <button type="submit" className={WS_ACTION_SECONDARY} disabled={Boolean(ws.blocked)}>
                        Search
                    </button>
                </form>
                {hits.length ? (
                    <ul className="rounded border border-stone-200 text-sm" data-testid="documents-record-hits">
                        {hits.map((h) => (
                            <li key={h.household_id}>
                                <button
                                    type="button"
                                    className="w-full px-2 py-1.5 text-left hover:bg-stone-50"
                                    onClick={() => {
                                        setHits([]);
                                        void save({ household_id: h.household_id, primary: null, contexts: [] });
                                    }}
                                >
                                    {h.display_name} <span className="text-xs text-alloy-midnight/55">({h.kind})</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : null}
                {ws.household ? (
                    <div className="rounded border border-stone-200 p-2" data-testid="documents-household">
                        <p className="mb-1 text-xs text-alloy-midnight/60">{ws.household.label}</p>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-alloy-midnight/55">
                                    <th className="font-normal">Record</th>
                                    <th className="font-normal">Filed under</th>
                                    <th className="font-normal">Also relates to</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ws.household.members.map((m) => {
                                    const s: ProposalSubject = { subject_type: m.subject_type as ProposalSubject["subject_type"], subject_id: m.subject_id, label: m.label };
                                    const key = `${m.subject_type}-${m.subject_id}`;
                                    return (
                                        <tr key={key}>
                                            <td>
                                                {m.label} <span className="text-xs text-alloy-midnight/55">{SUBJECT_ROLE_LABEL[m.role] ?? m.role}</span>
                                            </td>
                                            <td>
                                                <input
                                                    type="radio"
                                                    name="documents-primary"
                                                    aria-label={`File under ${m.label}`}
                                                    data-testid={`documents-primary-${key}`}
                                                    checked={memberChosen(s)}
                                                    disabled={busy !== null}
                                                    onChange={() => void save({ primary: s, contexts: p.contexts.filter((c) => !(c.subject_type === s.subject_type && c.subject_id === s.subject_id)), mode: "new_document", target_document_id: null })}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Also relates to ${m.label}`}
                                                    data-testid={`documents-context-${key}`}
                                                    checked={contextChosen(s)}
                                                    disabled={busy !== null || memberChosen(s)}
                                                    onChange={(e) =>
                                                        void save({
                                                            contexts: e.target.checked
                                                                ? [...p.contexts, s]
                                                                : p.contexts.filter((c) => !(c.subject_type === s.subject_type && c.subject_id === s.subject_id)),
                                                        })
                                                    }
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-xs text-alloy-midnight/60" data-testid="documents-record-unresolved">
                        No record chosen. Find the family; Alloy does not match a document to a person by name or email.
                    </p>
                )}
            </section>

            {/* 3. Replacement: the record already holds this type */}
            {ws.preview?.existing_of_type.length && policy?.replacement_policy === "new_version" ? (
                <section className="space-y-1 rounded border border-stone-200 p-2 text-sm" data-testid="documents-new-version">
                    <p className="text-alloy-midnight/75">This record already holds {policy.label}. File this as its new version:</p>
                    {ws.preview.existing_of_type.map((d) => (
                        <label key={d.id} className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="documents-target"
                                data-testid={`documents-target-${d.id}`}
                                checked={p.mode === "new_version" && p.target_document_id === d.id}
                                onChange={() => void save({ mode: "new_version", target_document_id: d.id })}
                            />
                            {d.title ?? "Existing document"} <span className="text-xs text-alloy-midnight/55">({fmtDate(d.created_at)})</span>
                        </label>
                    ))}
                </section>
            ) : null}

            {/* 4. Review and sensitivity */}
            {policy?.review_required ? (
                <label className="flex items-center gap-2 text-sm" data-testid="documents-review">
                    <input type="checkbox" checked={p.review_accepted} disabled={busy !== null} onChange={(e) => void save({ review_accepted: e.target.checked })} />I reviewed this document and it is a valid {policy.label}.
                </label>
            ) : null}
            {p.mode === "new_document" && policy ? (
                <label className="flex items-center gap-2 text-sm">
                    Sensitivity
                    <select
                        data-testid="documents-sensitivity"
                        className="rounded border border-stone-300 px-2 py-1 text-sm"
                        value={p.sensitivity ?? minSensitivity}
                        onChange={(e) => void save({ sensitivity: e.target.value === minSensitivity ? null : e.target.value })}
                    >
                        {SENSITIVITY_ORDER.filter((s) => SENSITIVITY_ORDER.indexOf(s) >= SENSITIVITY_ORDER.indexOf(minSensitivity)).map((s) => (
                            <option key={s} value={s}>
                                {SENSITIVITY_LABEL[s]}
                            </option>
                        ))}
                    </select>
                    <span className="text-xs text-alloy-midnight/55">Can be raised, never lowered.</span>
                </label>
            ) : null}

            {/* 5. Preview */}
            <section className="rounded bg-stone-50 p-3 text-sm" data-testid="documents-preview">
                {problems.length ? (
                    <ul className="list-disc pl-5 text-alloy-midnight/80" data-testid="documents-problems">
                        {problems.map((pr) => (
                            <li key={pr.code} data-code={pr.code}>
                                {pr.message}
                            </li>
                        ))}
                    </ul>
                ) : ws.preview?.can_file ? (
                    <p data-testid="documents-ready">
                        Will file {policy?.label ?? "the document"}
                        {p.mode === "new_version" ? " as a new version of the existing document" : ` under ${p.primary?.label ?? "the record"}`}
                        {p.contexts.length ? `, also relating to ${p.contexts.map((c) => c.label).join(", ")}` : ""}, sensitivity{" "}
                        {SENSITIVITY_LABEL[ws.preview.resulting_sensitivity ?? "standard"]}.
                    </p>
                ) : (
                    <p className="text-alloy-midnight/60">Choose the type and the record to see what will be filed.</p>
                )}
            </section>

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    data-testid="documents-file"
                    className={WS_ACTION_PRIMARY}
                    disabled={busy !== null || !ws.preview?.can_file || Boolean(ws.blocked)}
                    onClick={() => void file()}
                >
                    {busy === "file" ? "Filing…" : p.last_error ? "Retry filing" : "File document"}
                </button>
                {notice ? (
                    <p className="text-sm text-red-700" role="alert" data-testid="documents-notice">
                        {notice}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
