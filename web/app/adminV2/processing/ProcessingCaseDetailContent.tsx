"use client";

/**
 * POS-FP-W/FP6 — Processing Case workspace (shared center surface).
 *
 * Used by BOTH the converged Processing modal and the standalone drawer. FP6 turns
 * the flat detail body into an operational work surface: context header → evidence →
 * proposed values → destination → activity, with a DOCKED action bar at the bottom
 * (Communications-composer analog). Read-only except the FP5 Approve action; proposed
 * values are visible but not promoted; records remain truth. Unsupported actions are
 * shown disabled ("Coming later"), never faked.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ProcessingCaseDetail } from "@/lib/pos/processingCase/readModel/types";
import type { SourceEvidence } from "@/lib/pos/processingCase/readModel/resolveSourceEvidence";
import type { HandoffResult } from "@/lib/pos/processingCase/approveHandoff";
import ReviewDecideCard, { DECISION_TO_ACTION, type RecommendationView } from "@/app/adminV2/processing/ReviewDecideCard";
import ClassificationPanel from "@/app/adminV2/processing/ClassificationPanel";
import IdentityReviewPanel from "@/app/adminV2/processing/IdentityReviewPanel";
import type { StoredProcessingExtraction } from "@/lib/pos/processingCase/extraction/types";
import { isExtractionStale } from "@/lib/pos/processingCase/extraction/processingCaseExtractionDb";
import type { StoredDocumentFormPreview } from "@/lib/pos/processingCase/structure/types";
import { describeTextUnavailableReason } from "@/lib/pos/processingCase/structure/extractDocumentTextSafe";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/** Operator decision vocabulary shown on every case (recommended one is highlighted; others are prototype). */
const OPERATOR_ACTIONS: Array<{ key: string; label: string }> = [
    { key: "link_existing", label: "Link existing" },
    { key: "create_new", label: "Create new" },
    { key: "update_existing", label: "Update existing" },
    { key: "route_for_review", label: "Route for review" },
    { key: "reject", label: "Reject / ignore" },
];

interface DetailResponse {
    data: {
        detail: ProcessingCaseDetail;
        evidence: SourceEvidence[];
        affectedRecordTypes: string[];
    };
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
    form_submission: "Form",
    form_packet_session: "Packet",
    document: "Document",
    upload: "Upload",
    email_attachment: "Email",
    import: "Import",
    recreated_document: "Recreated",
};

const RECORD_TYPE_LABELS: Record<string, string> = {
    person: "CRM · Person",
    customer: "CRM · Customer",
    opportunity: "CRM · Opportunity",
    customer_member: "CRM · Member",
};

function statusLabel(status: string): string {
    return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Eyebrow({ children }: { children: ReactNode }) {
    return <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">{children}</div>;
}

/** B — fetch a time-limited signed URL and open the document; show a useful error on failure. */
function OpenDocumentButton({ documentId }: { documentId: string }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const open = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/documents/${documentId}/signed-url`, { credentials: "same-origin" });
            const body = (await res.json().catch(() => ({}))) as { ok?: boolean; signedUrl?: string; error?: string };
            if (!res.ok || !body.ok || !body.signedUrl) {
                throw new Error(body.error || `Couldn’t open document (${res.status})`);
            }
            window.open(body.signedUrl, "_blank", "noopener,noreferrer");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn’t open document");
        } finally {
            setBusy(false);
        }
    }, [documentId]);
    return (
        <div className="mt-1">
            <button
                type="button"
                disabled={busy}
                onClick={() => void open()}
                className="text-[11.5px] font-medium text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
                {busy ? "Opening…" : "Open document"}
            </button>
            {error ? <div className="mt-0.5 text-[11px] text-amber-700">{error}</div> : null}
        </div>
    );
}

/** Generate handoff — opens Form Builder inside Processing Studio. Never /admin/forms. */
function FormDraftSection({
    caseId,
    primarySourceKind,
    initial,
    created,
    onOpenForm,
}: {
    caseId: string;
    primarySourceKind: string | null;
    initial: StoredFormDraftPreview | null;
    created: { form_id: string; form_version_id: string; created_at: string } | null;
    onOpenForm?: (formId: string) => void;
}) {
    const [draft, setDraft] = useState<StoredFormDraftPreview | null>(initial);
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localCreatedId, setLocalCreatedId] = useState<string | null>(created?.form_id ?? null);

    if (primarySourceKind !== "document") return null;

    const generate = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft`, {
                method: "POST",
                credentials: "same-origin",
            });
            const body = (await res.json().catch(() => ({}))) as { data?: { form_draft_preview?: StoredFormDraftPreview }; error?: string };
            if (!res.ok) throw new Error(body.error || `Couldn’t create form draft (${res.status})`);
            setDraft(body.data?.form_draft_preview ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn’t create form draft");
        } finally {
            setBusy(false);
        }
    };

    const createForm = async () => {
        setCreating(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/create`, {
                method: "POST",
                credentials: "same-origin",
            });
            const body = (await res.json().catch(() => ({}))) as { data?: { form_id?: string }; error?: string };
            if (!res.ok) throw new Error(body.error || `Couldn’t create form (${res.status})`);
            const formId = body.data?.form_id ?? null;
            if (formId) {
                setLocalCreatedId(formId);
                onOpenForm?.(formId);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn’t create form");
        } finally {
            setCreating(false);
        }
    };

    const fieldById = (id: string) => draft?.fields.find((f) => f.id === id);
    const readyFormId = localCreatedId ?? created?.form_id ?? null;

    return (
        <section className="mb-5 rounded-lg border border-emerald-200 bg-white p-3.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700">Set up this document</span>
                {draft ? (
                    <span className="text-[10px] text-stone-400">
                        {draft.generator_version} · {formatWhen(draft.generated_at)}
                    </span>
                ) : null}
            </div>

            <div className="mb-2 flex flex-wrap items-center gap-2">
                {readyFormId ? (
                    <>
                        <button
                            type="button"
                            onClick={() => onOpenForm?.(readyFormId)}
                            className="rounded-md bg-[#00A283] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#009276]"
                        >
                            Open in Studio
                        </button>
                        <span className="text-[11px] text-emerald-700">Form created — continue in Studio Form Builder.</span>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            disabled={busy || creating}
                            onClick={() => void generate()}
                            className="rounded-md border border-stone-300 px-3 py-1.5 text-[12.5px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                        >
                            {busy ? "Detecting…" : draft ? "Re-detect fields" : "Set up this document"}
                        </button>
                        {draft && draft.fields.length > 0 ? (
                            <button
                                type="button"
                                disabled={creating || busy}
                                onClick={() => void createForm()}
                                className="rounded-md bg-[#00A283] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#009276] disabled:opacity-50"
                            >
                                {creating ? "Generating…" : "Generate form"}
                            </button>
                        ) : null}
                    </>
                )}
            </div>
            {error ? <div className="mb-2 text-[11.5px] text-amber-700">{error}</div> : null}

            {!draft ? (
                <p className="text-[12px] text-stone-500">
                    Alloy detects questions on this document. Review them, generate a native form, then finish in Studio.
                </p>
            ) : (
                <div>
                    <div className="mb-2">
                        <div className="text-[10.5px] font-medium uppercase tracking-wide text-stone-400">Form title</div>
                        <div className="text-[14px] font-medium text-stone-900">{draft.title}</div>
                        <div className="text-[10.5px] text-stone-400">
                            {draft.title_from_text ? "from document text" : "from filename / classification"} ·{" "}
                            {draft.fields.length} field{draft.fields.length === 1 ? "" : "s"} · {draft.sections.length} section
                            {draft.sections.length === 1 ? "" : "s"}
                        </div>
                    </div>

                    {/* Debug visibility: what Alloy actually saw (helps explain zero-field results). */}
                    <details className="mb-2 rounded-md border border-stone-200 bg-stone-50/60 p-2">
                        <summary className="cursor-pointer text-[10.5px] font-medium uppercase tracking-wide text-stone-500">
                            Diagnostics — extracted text {draft.diagnostics.extracted_text_length} chars ·{" "}
                            {draft.diagnostics.section_count} sections · {draft.diagnostics.field_count} fields
                        </summary>
                        {draft.diagnostics.extracted_text_preview ? (
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-stone-600">
                                {draft.diagnostics.extracted_text_preview}
                            </pre>
                        ) : (
                            <div className="mt-1 text-[11px] text-stone-400">No extracted text.</div>
                        )}
                    </details>

                    {draft.sections.length === 0 ? (
                        <div className="text-[12px] text-stone-400">No sections/fields were detected to draft.</div>
                    ) : (
                        <div className="space-y-2.5">
                            {draft.sections.map((s) => (
                                <div key={s.id} className="rounded-md border border-stone-200 p-2.5">
                                    <div className="mb-1 text-[12.5px] font-medium text-stone-800">{s.title}</div>
                                    <ul className="space-y-0.5">
                                        {s.field_ids.map((fid) => {
                                            const f = fieldById(fid);
                                            if (!f) return null;
                                            return (
                                                <li key={fid} className="flex items-center gap-2 text-[12px] text-stone-600">
                                                    <span className="min-w-0 flex-1 truncate">{f.label}</span>
                                                    {f.required ? <span className="text-[10px] text-amber-700">required</span> : null}
                                                    <span className="rounded bg-stone-100 px-1 py-0.5 text-[9.5px] text-stone-500">{f.type}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}

                    {draft.warnings.length > 0 ? (
                        <ul className="mt-2 list-inside list-disc text-[11.5px] text-amber-700">
                            {draft.warnings
                                .filter((w) => !w.startsWith("text_unavailable:"))
                                .map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            {draft.warnings.some((w) => w.startsWith("text_unavailable:")) ? (
                                <li>{describeTextUnavailableReason(draft.warnings.find((w) => w.startsWith("text_unavailable:"))!.slice("text_unavailable:".length))}</li>
                            ) : null}
                        </ul>
                    ) : null}

                    <p className="mt-2 text-[10.5px] text-stone-400">Draft only — no form is created or published until you review it.</p>
                </div>
            )}
        </section>
    );
}

/** FP11 — Document → Form preview: honest state + read-only outline. Never creates a form. */
function DocumentFormPreviewSection({
    preview,
    primarySourceKind,
}: {
    preview: StoredDocumentFormPreview | null;
    primarySourceKind: string | null;
}) {
    // Only relevant for document sources.
    if (primarySourceKind !== "document") return null;

    const CreateDraftButton = ({ reason }: { reason: string }) => (
        <button
            type="button"
            disabled
            title={reason}
            className="mt-2 inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-[12px] text-stone-400"
        >
            Create form draft
            <span className="rounded bg-stone-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-stone-400">Planned</span>
        </button>
    );

    const Shell = ({ children }: { children: ReactNode }) => (
        <section className="mb-5 rounded-lg border border-stone-200 bg-white p-3.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-500">Document → Form</span>
                {preview ? (
                    <span className="text-[10px] text-stone-400">
                        {preview.generator_version} · {formatWhen(preview.generated_at)}
                    </span>
                ) : null}
            </div>
            {children}
        </section>
    );

    if (!preview) {
        return (
            <Shell>
                <div className="text-[13px] font-medium text-stone-700">Structure detection pending</div>
                <p className="mt-0.5 text-[12px] text-stone-500">No form preview has been generated for this document yet.</p>
            </Shell>
        );
    }

    if (!preview.extracted_text_available) {
        const reasonTag = preview.warnings.find((w) => w.startsWith("text_unavailable:"));
        const reason = reasonTag ? reasonTag.slice("text_unavailable:".length) : null;
        return (
            <Shell>
                <div className="text-[13px] font-medium text-stone-700">Text extraction unavailable</div>
                <p className="mt-0.5 text-[12px] text-stone-500">{describeTextUnavailableReason(reason)}</p>
                <CreateDraftButton reason="Needs document text before a structure can be detected" />
            </Shell>
        );
    }

    if (preview.sections.length === 0) {
        return (
            <Shell>
                <div className="text-[13px] font-medium text-stone-700">No structure detected</div>
                <p className="mt-0.5 text-[12px] text-stone-500">
                    Text was available but no labelled sections or fields were found.
                </p>
                <CreateDraftButton reason="No sections/fields detected to draft from" />
            </Shell>
        );
    }

    return (
        <Shell>
            <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-[#00A283] px-2 py-0.5 text-[11px] font-semibold text-white">
                    Draft outline available
                </span>
                <span className="text-[11px] text-stone-500">
                    {preview.sections.length} section{preview.sections.length === 1 ? "" : "s"}
                </span>
            </div>
            <div className="space-y-2.5">
                {preview.sections.map((s, si) => (
                    <div key={`${s.title}:${si}`} className="rounded-md border border-stone-200 p-2.5">
                        <div className="mb-1 flex items-center gap-2">
                            <span className="text-[12.5px] font-medium text-stone-800">{s.title}</span>
                            <span className="rounded bg-stone-100 px-1 py-0.5 text-[9.5px] text-stone-500">{s.confidence}</span>
                        </div>
                        <ul className="space-y-0.5">
                            {s.fields.map((f, fi) => (
                                <li key={`${f.label}:${fi}`} className="flex items-center gap-2 text-[12px] text-stone-600">
                                    <span className="min-w-0 flex-1 truncate">{f.label}</span>
                                    {f.required ? <span className="text-[10px] text-amber-700">required</span> : null}
                                    <span className="rounded bg-stone-100 px-1 py-0.5 text-[9.5px] text-stone-500">
                                        {f.suggested_type}
                                    </span>
                                    <span className="rounded bg-stone-100 px-1 py-0.5 text-[9.5px] text-stone-400">{f.confidence}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            {preview.warnings.filter((w) => !w.startsWith("text_unavailable:")).length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-[11.5px] text-amber-700">
                    {preview.warnings
                        .filter((w) => !w.startsWith("text_unavailable:"))
                        .map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                </ul>
            ) : null}
            <CreateDraftButton reason="Draft creation + review path is not built yet (preview only)" />
            <p className="mt-1.5 text-[10.5px] text-stone-400">Preview only — no form is created.</p>
        </Shell>
    );
}

/** C — present the intake-aligned extraction result: facts ("what Alloy found") + candidates ("what it maps to"). */
function ExtractionSection({
    extraction,
    currentClassificationKey,
    classificationStatus,
}: {
    extraction: StoredProcessingExtraction | null;
    currentClassificationKey: string | null;
    classificationStatus: string | null;
}) {
    // D — unknown next-step.
    if (classificationStatus === "unknown") {
        return (
            <section className="mb-5 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                <Eyebrow>Extraction</Eyebrow>
                <div className="text-[13px] font-medium text-stone-700">This document is unknown</div>
                <p className="mt-0.5 text-[12px] text-stone-500">
                    Alloy couldn’t tell what this is, so it proposed no values. Change the classification above to help
                    Alloy understand it — extraction re-runs automatically.
                </p>
            </section>
        );
    }

    if (!extraction) {
        return (
            <section className="mb-5">
                <Eyebrow>Extraction</Eyebrow>
                <div className="text-sm text-stone-400">No extraction yet for this case.</div>
            </section>
        );
    }

    const stale = isExtractionStale(extraction, currentClassificationKey);

    return (
        <section className="mb-5 rounded-lg border border-stone-200 bg-white p-3.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-500">Extraction</span>
                <span className="text-[10px] text-stone-400">
                    {extraction.extractor_version} · {formatWhen(extraction.extracted_at)}
                </span>
            </div>

            {stale ? (
                <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800">
                    These candidates were produced for “{extraction.classification_key}”, but the classification is now
                    “{currentClassificationKey}”. Re-run extraction to refresh them.
                </div>
            ) : null}

            {/* What Alloy found = facts */}
            <div className="mb-3">
                <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">
                    What Alloy found ({extraction.facts.length})
                </div>
                {extraction.facts.length === 0 ? (
                    <div className="text-[12px] text-stone-400">No facts read from this document.</div>
                ) : (
                    <ul className="flex flex-wrap gap-1.5">
                        {extraction.facts.map((f) => (
                            <li
                                key={f.fact_id}
                                className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-50/60 px-2 py-0.5 text-[11.5px] text-stone-700"
                            >
                                <span className="text-stone-400">{f.fact_type}:</span>
                                <span className="font-medium">{String(f.normalized_value ?? f.raw_value)}</span>
                                <span className="rounded bg-stone-100 px-1 py-0.5 text-[9.5px] text-stone-500">{f.confidence}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* What Alloy thinks this maps to = candidates */}
            <div>
                <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">
                    What Alloy thinks this maps to ({extraction.candidates.length})
                </div>
                {extraction.candidates.length === 0 ? (
                    <div className="text-[12px] text-stone-400">No field candidates proposed.</div>
                ) : (
                    <dl className="space-y-1.5">
                        {extraction.candidates.map((c, i) => (
                            <div key={`${c.payload_key}:${i}`} className="flex items-baseline gap-2 text-[13px]">
                                <dt className="w-48 shrink-0 truncate">
                                    <span className="text-stone-600">{c.payload_key}</span>
                                    <span className="ml-1.5 rounded bg-stone-100 px-1 py-0.5 text-[9.5px] text-stone-500">
                                        {c.confidence}
                                    </span>
                                </dt>
                                <dd className="min-w-0 flex-1 text-stone-800">{c.value || "—"}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </div>

            {extraction.review_warnings.length > 0 ? (
                <div className="mt-2.5 border-t border-stone-100 pt-2">
                    <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">Review notes</div>
                    <ul className="list-inside list-disc space-y-0.5 text-[11.5px] text-amber-700">
                        {extraction.review_warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <p className="mt-2 text-[10.5px] text-stone-400">Proposed values only — nothing is written until you approve.</p>
        </section>
    );
}

export default function ProcessingCaseDetailContent({
    caseId,
    onOpenForm,
}: {
    caseId: string;
    onOpenForm?: (formId: string) => void;
}) {
    const [data, setData] = useState<DetailResponse["data"] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [approving, setApproving] = useState(false);
    const [approveErr, setApproveErr] = useState<string | null>(null);
    const [approveResult, setApproveResult] = useState<HandoffResult | null>(null);
    const [rec, setRec] = useState<RecommendationView | null>(null);
    const [recLoading, setRecLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}`, { credentials: "same-origin" });
            if (!res.ok) {
                throw new Error(res.status === 404 ? "Processing case not found" : `Request failed (${res.status})`);
            }
            const body = (await res.json()) as DetailResponse;
            setData(body.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => {
        void load();
    }, [load]);

    // Recommendation is read-only and reuses the existing FP8a endpoint (no new matching).
    useEffect(() => {
        let cancelled = false;
        setRecLoading(true);
        setRec(null);
        (async () => {
            try {
                const res = await fetch(`/api/admin/processing/cases/${caseId}/recommendation`, {
                    credentials: "same-origin",
                });
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const body = (await res.json()) as { data?: RecommendationView };
                if (!cancelled) setRec(body.data ?? null);
            } catch {
                if (!cancelled) setRec(null);
            } finally {
                if (!cancelled) setRecLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [caseId]);

    const approve = useCallback(async () => {
        setApproving(true);
        setApproveErr(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/approve`, {
                method: "POST",
                credentials: "same-origin",
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: { operationalResult?: HandoffResult | null } };
            setApproveResult(body.data?.operationalResult ?? null);
            await load();
        } catch (e) {
            setApproveErr(e instanceof Error ? e.message : "Approve failed");
        } finally {
            setApproving(false);
        }
    }, [caseId, load]);

    if (loading) {
        return (
            <div className="space-y-3 p-4" aria-busy="true">
                <div className="h-5 w-2/3 animate-pulse rounded bg-stone-100" />
                <div className="h-20 animate-pulse rounded bg-stone-100" />
                <div className="h-16 animate-pulse rounded bg-stone-100" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="m-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-medium">Couldn’t load this case</div>
                <div className="mt-0.5 text-xs text-amber-700">{error}</div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-2 rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                    Retry
                </button>
            </div>
        );
    }
    const detail = data?.detail ?? null;
    if (!detail) return null;

    const primary = detail.sources.find((s) => s.role === "primary") ?? detail.sources[0] ?? null;
    const evidenceFor = (kind: string, id: string): SourceEvidence | undefined =>
        data?.evidence.find((e) => e.kind === kind && e.id === id);
    const proposed = data?.evidence.flatMap((e) => e.proposedValues) ?? [];
    const destinations = data?.affectedRecordTypes ?? [];
    const isClosed = detail.status === "completed" || detail.status === "archived";

    // The operator action Alloy recommends (drives the primary button + highlight).
    const recommendedActionKey =
        rec?.supported && rec.recommendation ? DECISION_TO_ACTION[rec.recommendation.decision].key : null;
    const recommendedActionLabel =
        rec?.supported && rec.recommendation ? DECISION_TO_ACTION[rec.recommendation.decision].label : null;

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Context header */}
            <div className="shrink-0 border-l-2 border-alloy-juniper bg-emerald-50/60 px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-stone-900">
                        {primary?.display.label ?? "Processing case"}
                    </span>
                    <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        {statusLabel(detail.status)}
                    </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-stone-600">
                    <span>{SOURCE_TYPE_LABELS[primary?.kind ?? ""] ?? "Source"}</span>
                    {primary?.display.channel ? <span>· via {primary.display.channel}</span> : null}
                    <span>· received {formatWhen(primary?.display.receivedAt ?? detail.createdAt)}</span>
                    {destinations.length > 0 ? (
                        <span>· → {RECORD_TYPE_LABELS[destinations[0]!] ?? destinations[0]}</span>
                    ) : null}
                </div>
            </div>

            {/* Work surface (scrolls) */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {/* What kind of artifact this is (non-form sources). Read-only display + operator
                    correction (annotation only — never changes status/records/extraction). */}
                <ClassificationPanel
                    classification={detail.classification}
                    primarySourceKind={primary?.kind ?? null}
                    caseId={caseId}
                    onCorrected={() => void load()}
                />

                {/* Workflow A — the product moment: recreate this document as a form draft. */}
                <FormDraftSection
                    caseId={caseId}
                    primarySourceKind={primary?.kind ?? null}
                    initial={detail.formDraftPreview}
                    created={detail.formDraftCreated}
                    onOpenForm={onOpenForm}
                />

                {/* What Alloy found (facts) + what it maps to (candidates) — proposals only. */}
                <ExtractionSection
                    extraction={detail.extraction}
                    currentClassificationKey={detail.caseType}
                    classificationStatus={detail.classification?.status ?? null}
                />

                {/* Document → Form preview (read-only structure outline; no form is created). */}
                <DocumentFormPreviewSection
                    preview={detail.documentFormPreview}
                    primarySourceKind={primary?.kind ?? null}
                />

                {/* Core POS moment: what Alloy understood + what it recommends */}
                {!isClosed ? <ReviewDecideCard view={rec} loading={recLoading} /> : null}

                {/* D3 — identity review → plan → approval → explicit commit (canonical operator workflow). */}
                <IdentityReviewPanel caseId={caseId} />

                <section className="mb-5">
                    <Eyebrow>Evidence</Eyebrow>
                    <ul className="space-y-2">
                        {detail.sources.map((s) => (
                            <li key={`${s.kind}:${s.id}`} className="rounded-md border border-stone-200 p-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">
                                        {SOURCE_TYPE_LABELS[s.kind] ?? "Source"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{s.display.label}</span>
                                    <span className="text-[11px] text-stone-400">{s.role}</span>
                                </div>
                                {evidenceFor(s.kind, s.id)?.documentId ? (
                                    <OpenDocumentButton documentId={evidenceFor(s.kind, s.id)!.documentId!} />
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="mb-5">
                    <Eyebrow>What Alloy read</Eyebrow>
                    <p className="mb-2 text-[11px] text-amber-700">Proposed — not yet promoted to records.</p>
                    {proposed.length === 0 ? (
                        <div className="text-sm text-stone-400">No proposed values on these sources.</div>
                    ) : (
                        <dl className="space-y-1.5">
                            {proposed.map((v, i) => (
                                <div key={`${v.label}:${i}`} className="flex gap-2 text-[13px]">
                                    <dt className="w-44 shrink-0">
                                        <span className="text-stone-600">{v.label}</span>
                                        <span className="ml-1.5">
                                            {v.entityType && v.fieldKey ? (
                                                <span className="rounded bg-stone-100 px-1 py-0.5 text-[10px] text-stone-500">
                                                    {v.entityType}.{v.fieldKey}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-stone-400">unmapped</span>
                                            )}
                                        </span>
                                    </dt>
                                    <dd className="min-w-0 flex-1 text-stone-800">{v.value ?? "—"}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </section>

                <section className="mb-5">
                    <Eyebrow>Destination</Eyebrow>
                    {destinations.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {destinations.map((t) => (
                                <span key={t} className="rounded-md bg-stone-100 px-2 py-0.5 text-[12px] text-stone-700">
                                    {RECORD_TYPE_LABELS[t] ?? t}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-stone-400">Resolved on approval — nothing is promoted until reviewed.</div>
                    )}
                </section>

                <section>
                    <Eyebrow>Activity</Eyebrow>
                    <div className="space-y-1 text-[12px] text-stone-500">
                        <div>Received · {formatWhen(detail.createdAt)}</div>
                        <div>
                            Read {detail.sources.length} source{detail.sources.length === 1 ? "" : "s"}
                            {proposed.length > 0 ? ` · ${proposed.length} proposed value${proposed.length === 1 ? "" : "s"}` : ""}
                        </div>
                        {isClosed ? (
                            <div className="text-emerald-700">
                                {statusLabel(detail.status)} · {formatWhen(detail.updatedAt ?? detail.createdAt)}
                                {approveResult?.recordId
                                    ? ` · ${approveResult.created ? "created" : "linked"} ${RECORD_TYPE_LABELS[approveResult.recordType ?? ""] ?? approveResult.recordType} ${approveResult.recordId}`
                                    : ""}
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>

            {/* Docked action bar */}
            <div className="shrink-0 border-t border-stone-200 bg-stone-50/80 px-4 py-3">
                {isClosed ? (
                    <div className="flex items-center gap-2 text-[12.5px] text-stone-700">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</span>
                        <span>
                            {statusLabel(detail.status)}
                            {approveResult?.recordId
                                ? ` — ${approveResult.created ? "created" : "linked"} ${RECORD_TYPE_LABELS[approveResult.recordType ?? ""] ?? approveResult.recordType} ${approveResult.recordId}`
                                : approveResult?.note
                                  ? ` — ${approveResult.note}`
                                  : ""}
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-[12.5px] text-stone-800">
                                <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-700">Operator decision</span>
                                <div>
                                    {recommendedActionLabel
                                        ? `Alloy recommends “${recommendedActionLabel}” — approve to execute, or choose another.`
                                        : "Review the proposal, then approve to execute."}
                                </div>
                            </div>
                            <span className="shrink-0 text-right text-[10px] leading-tight text-stone-400">
                                Review-first
                                <br />
                                no silent execution
                            </span>
                        </div>
                        {approveResult?.kind === "needs_mapping" ? (
                            <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800">
                                Can’t promote yet — {approveResult.note}
                            </div>
                        ) : null}
                        {approveErr ? <div className="mb-2 text-[11.5px] text-amber-700">{approveErr}</div> : null}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Real, preserved approve path — executes Alloy's link-or-create handoff. */}
                            <button
                                type="button"
                                disabled={approving}
                                onClick={() => void approve()}
                                className="rounded-md bg-[#00A283] px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#009276] disabled:opacity-50"
                            >
                                {approving
                                    ? "Approving…"
                                    : recommendedActionLabel
                                      ? `Approve — ${recommendedActionLabel}`
                                      : "Approve action"}
                            </button>
                            {/* Operator decision alternatives — visible decision model; not yet wired. */}
                            {OPERATOR_ACTIONS.filter((a) => a.key !== recommendedActionKey).map((a) => (
                                <button
                                    key={a.key}
                                    type="button"
                                    disabled
                                    title="Prototype — choose this decision once alternative outcomes are wired"
                                    className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-stone-200 px-3 py-1.5 text-[12.5px] text-stone-400"
                                >
                                    {a.label}
                                    <span className="rounded bg-stone-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-stone-400">
                                        Proto
                                    </span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
