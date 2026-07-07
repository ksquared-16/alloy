"use client";

/**
 * POS Processing — Document → Form *template setup*, converged into a SINGLE review
 * workspace (Source PDF ↔ Question resolution):
 *
 *   ┌ status strip (setup · extracted text · structure · detection mode · source · quality) ┐
 *   ├ LEFT: source PDF preview (actual PDF) + highlighted detected regions ────────────────┤
 *   ├ RIGHT: Resolve detected questions — tabs [ Questions | Extracted text ] ─────────────┤
 *   └ Generate native form (reviewed questions; PDF provenance preserved) ─────────────────┘
 *
 * Question rows ↔ PDF highlights stay in sync (click either to select). Questions are edited /
 * added / ignored in place; manual questions are flagged "Not mapped to PDF". Generate uses
 * expandQuestionsForDraftSave (preserving pdf_field_name / page / bbox) and then jumps to
 * Studio → Forms with the new form selected — never /admin/forms, never leaving the modal.
 *
 * Reuse-only: `/form-draft` (detect), `/form-draft/save` (reviewed list), `/form-draft/
 * create`, the signed-URL + extracted-text routes. No OCR, no AI, no commit.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, Download } from "lucide-react";
import type { PosCaseState } from "./usePosCase";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import { computePageMaps, svgRectToPdfBbox, type FieldWithRegion } from "@/lib/pos/processingCase/structure/pdfFieldMap";
import PosPdfFieldMap from "./PosPdfFieldMap";
import { ProcessingQuestionReviewList } from "./ProcessingQuestionReviewList";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";
import {
    seedReviewQuestionFromDraftField,
    expandQuestionsForDraftSave,
    inferQuestionIntent,
    defaultSubjectForIntent,
    deriveFieldSources,
    type ReviewQuestionInput,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import { detectionModeLabel, detectionModeHelper } from "@/lib/pos/processingCase/formDraft/detectionModeLabel";

function formatWhen(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Build the editable reviewed question list from the stored draft, preserving provenance. */
function seedReviewQuestions(draft: StoredFormDraftPreview | null): ReviewQuestionInput[] {
    if (!draft) return [];
    const out: ReviewQuestionInput[] = [];
    for (const s of draft.sections) {
        for (const fid of s.field_ids) {
            const f = draft.fields.find((x) => x.id === fid);
            if (!f) continue;
            out.push(
                seedReviewQuestionFromDraftField({
                    id: f.id,
                    label: f.label,
                    type: f.type,
                    section: s.title,
                    required: f.required,
                    confidence: f.confidence,
                    evidence: f.evidence,
                    pdf_field_name: f.pdf_field_name,
                    page: f.page,
                    bbox: f.bbox,
                    field_source: f.field_source,
                })
            );
        }
    }
    return out;
}

export default function PosTemplateSetupColumn({
    state,
    onOpenForm,
}: {
    state: PosCaseState;
    onOpenForm?: (formId: string) => void;
}) {
    const { detail, reload } = state;
    const caseId = detail?.id ?? null;

    const [draft, setDraft] = useState<StoredFormDraftPreview | null>(detail?.formDraftPreview ?? null);
    const [reviewQuestions, setReviewQuestions] = useState<ReviewQuestionInput[]>(() =>
        seedReviewQuestions(detail?.formDraftPreview ?? null)
    );
    const reviewQuestionsRef = useRef(reviewQuestions);
    useEffect(() => {
        reviewQuestionsRef.current = reviewQuestions;
    }, [reviewQuestions]);
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfErr, setPdfErr] = useState<string | null>(null);
    const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
    const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
    const [tab, setTab] = useState<"questions" | "text">("questions");
    const [leftView, setLeftView] = useState<"highlights" | "pdf">("highlights");
    const [fullText, setFullText] = useState<string | null>(null);
    const [textQuery, setTextQuery] = useState("");
    const [mappingQuestionId, setMappingQuestionId] = useState<string | null>(null);

    const primary = detail?.sources.find((s) => s.role === "primary") ?? detail?.sources[0] ?? null;
    const docId = draft?.source_document_id ?? (primary?.kind === "document" ? (primary?.id ?? null) : null);

    // Re-seed the reviewed list when the stored draft changes (detect / save / case switch).
    useEffect(() => {
        const next = detail?.formDraftPreview ?? null;
        setDraft(next);
        const seeded = seedReviewQuestions(next);
        setReviewQuestions(seeded);
        reviewQuestionsRef.current = seeded;
        setErr(null);
        setSelectedQuestionId(null);
        setEditingQuestionId(null);
    }, [detail?.id, detail?.formDraftPreview]);

    // Signed URL for the actual PDF.
    useEffect(() => {
        let cancelled = false;
        setPdfUrl(null);
        setPdfErr(null);
        if (!docId) return;
        (async () => {
            try {
                const res = await fetch(`/api/admin/documents/${docId}/signed-url`, { credentials: "same-origin" });
                const body = (await res.json().catch(() => ({}))) as { ok?: boolean; signedUrl?: string; error?: string };
                if (cancelled) return;
                if (res.ok && body.ok && body.signedUrl) setPdfUrl(body.signedUrl);
                else setPdfErr(body.error || "Preview unavailable");
            } catch {
                if (!cancelled) setPdfErr("Preview unavailable");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [docId]);

    // Lazy-load the full extracted text the first time the Extracted-text tab is opened.
    useEffect(() => {
        if (tab !== "text" || fullText !== null || !docId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/admin/pos/documents/${docId}/extracted-text`, { credentials: "same-origin" });
                const body = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string };
                if (!cancelled) setFullText(body.ok ? (body.text ?? "") : (draft?.diagnostics.extracted_text_preview ?? ""));
            } catch {
                if (!cancelled) setFullText(draft?.diagnostics.extracted_text_preview ?? "");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [tab, fullText, docId, draft?.diagnostics.extracted_text_preview]);

    const pageMaps = useMemo(() => {
        const fields: FieldWithRegion[] = reviewQuestions.map((q) => ({
            id: q.id,
            label: q.displayLabel || q.evidenceLabel,
            type: q.type,
            confidence: q.confidence,
            page: q.page,
            bbox: q.bbox,
        }));
        return computePageMaps(fields, draft?.pdf_pages);
    }, [reviewQuestions, draft?.pdf_pages]);

    if (!detail) return null;

    const created = detail.formDraftCreated;
    const docTitle = draft?.title || primary?.display.label || "Untitled document";
    const textLen = draft?.diagnostics.extracted_text_length ?? null;
    const textAvailable = draft ? draft.extracted_text_available : (detail.documentFormPreview?.extracted_text_available ?? null);
    const sectionCount = new Set(reviewQuestions.map((q) => q.section)).size;
    const activeFieldCount = reviewQuestions.filter((q) => !q.ignored).length;

    const detectorWeak = (draft?.warnings ?? []).some((w) => /weak detection/i.test(w));
    const goodQuestions = reviewQuestions.filter((q) => !q.ignored && q.confidence !== "low").length;
    const quality: "strong" | "weak" | "failed" = !draft
        ? "failed"
        : activeFieldCount === 0
          ? "failed"
          : activeFieldCount >= 4 && goodQuestions >= 3 && !detectorWeak
            ? "strong"
            : "weak";
    const hasRegions = pageMaps.some((p) => p.rects.length > 0);

    // ---- question-list editing ----
    const updateQuestion = (id: string, patch: Partial<ReviewQuestionInput>) =>
        setReviewQuestions((qs) => {
            const next = qs.map((q) => {
                if (q.id !== id) return q;
                const merged = { ...q, ...patch };
                if (
                    patch.field_source === undefined &&
                    (patch.questionSubject !== undefined ||
                        patch.nameRepresentation !== undefined ||
                        patch.displayLabel !== undefined)
                ) {
                    const intent = inferQuestionIntent(merged.evidenceLabel || merged.displayLabel);
                    const subject = merged.questionSubject ?? defaultSubjectForIntent(intent);
                    merged.field_source = deriveFieldSources({
                        subject,
                        nameRepresentation: merged.nameRepresentation,
                        intent,
                        displayLabel: merged.displayLabel,
                        type: merged.type,
                    });
                }
                return merged;
            });
            reviewQuestionsRef.current = next;
            return next;
        });

    const removeQuestion = (id: string) => {
        setReviewQuestions((qs) => {
            const next = qs.filter((q) => q.id !== id);
            reviewQuestionsRef.current = next;
            return next;
        });
        if (selectedQuestionId === id) setSelectedQuestionId(null);
        if (editingQuestionId === id) setEditingQuestionId(null);
    };

    const toggleIgnoreQuestion = (id: string) =>
        setReviewQuestions((qs) => {
            const next = qs.map((q) => (q.id === id ? { ...q, ignored: !q.ignored } : q));
            reviewQuestionsRef.current = next;
            return next;
        });

    const addQuestion = () => {
        const id = `new_${Date.now().toString(36)}`;
        const section = reviewQuestions[reviewQuestions.length - 1]?.section ?? "Form questions";
        setReviewQuestions((qs) => [
            ...qs,
            {
                id,
                evidenceLabel: "",
                displayLabel: "",
                type: "text",
                section,
                evidence: "operator",
                confidence: "high",
                questionSubject: "processing_only",
            },
        ]);
        setSelectedQuestionId(id);
        setEditingQuestionId(id);
    };

    const startMapping = (id: string) => {
        setMappingQuestionId(id);
        setSelectedQuestionId(id);
        setLeftView("highlights");
    };

    const handleDrawRect = (page: number, rect: { x: number; y: number; w: number; h: number }) => {
        if (!mappingQuestionId) return;
        const pm = pageMaps.find((p) => p.page === page);
        if (!pm) return;
        const bbox = svgRectToPdfBbox(rect, pm);
        updateQuestion(mappingQuestionId, { page, bbox, evidence: "manual_pdf_mapping" });
        setSelectedQuestionId(mappingQuestionId);
        setMappingQuestionId(null);
    };

    // ---- endpoints ----
    async function detectDoc(): Promise<StoredFormDraftPreview | null> {
        const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft`, { method: "POST", credentials: "same-origin" });
        const body = (await res.json().catch(() => ({}))) as { data?: { form_draft_preview?: StoredFormDraftPreview }; error?: string };
        if (!res.ok) throw new Error(body.error || `Couldn't read this document (${res.status})`);
        return body.data?.form_draft_preview ?? null;
    }

    const handleDetect = async () => {
        setBusy(true);
        setErr(null);
        try {
            const next = await detectDoc();
            setDraft(next);
            const seeded = seedReviewQuestions(next);
            setReviewQuestions(seeded);
            reviewQuestionsRef.current = seeded;
            await reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn't read this document");
        } finally {
            setBusy(false);
        }
    };

    const handleCreate = async () => {
        const expanded = expandQuestionsForDraftSave(reviewQuestionsRef.current);
        if (expanded.length === 0) {
            setErr("Add at least one active question before generating the form.");
            return;
        }
        setCreating(true);
        setErr(null);
        try {
            const saveRes = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/save`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    title: draft?.title || docTitle,
                    fields: expanded.map((f) => ({
                        label: f.label,
                        type: f.type,
                        required: f.required,
                        section: f.section,
                        pdf_field_name: f.pdf_field_name,
                        page: f.page,
                        bbox: f.bbox,
                        evidence: f.evidence,
                        ...(f.field_source ? { field_source: f.field_source } : {}),
                    })),
                }),
            });
            const saveBody = (await saveRes.json().catch(() => ({}))) as { error?: string };
            if (!saveRes.ok) throw new Error(saveBody.error || `Couldn't save questions (${saveRes.status})`);

            const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/create`, { method: "POST", credentials: "same-origin" });
            const body = (await res.json().catch(() => ({}))) as { data?: { form_id?: string }; error?: string };
            if (!res.ok) throw new Error(body.error || `Couldn't create the form (${res.status})`);
            await reload();
            const formId = body.data?.form_id ?? null;
            if (formId && onOpenForm) onOpenForm(formId);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn't create the form");
        } finally {
            setCreating(false);
        }
    };

    // ---- no draft yet: question-first detect prompt ----
    if (!draft) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center bg-white p-6 text-center">
                <div className="max-w-sm">
                    <div className="text-[14px] font-semibold text-alloy-midnight">{docTitle}</div>
                    <p className="mt-1 text-[12px] text-stone-500">
                        Alloy reads questions from the uploaded document. Review what each question means, then generate a
                        native form. Nothing is created or published until you confirm.
                    </p>
                    {err ? <div className="mt-2 text-[11px] text-amber-700">{err}</div> : null}
                    <button type="button" disabled={busy} onClick={() => void handleDetect()} className={`${WS_ACTION_PRIMARY} mt-3`}>
                        {busy ? "Detecting questions…" : "Detect questions"}
                    </button>
                </div>
            </div>
        );
    }

    const matchedTextLines = (() => {
        const text = fullText ?? draft.diagnostics.extracted_text_preview ?? "";
        if (!textQuery.trim()) return { lines: text.split(/\r?\n/), matches: null as number | null };
        const q = textQuery.toLowerCase();
        const all = text.split(/\r?\n/);
        const lines = all.filter((l) => l.toLowerCase().includes(q));
        return { lines, matches: lines.length };
    })();

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            {/* Status strip — 6 columns including detection mode */}
            <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1.5 border-b border-alloy-stone/12 px-4 py-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <StatusCell label="Setup status">
                    {created ? (
                        <span className="font-semibold text-emerald-700">Draft created</span>
                    ) : (
                        <span className="font-semibold text-alloy-midnight">Ready to review</span>
                    )}
                    <span className="ml-1 text-[10px] text-stone-400">
                        {draft.generator_version} · {formatWhen(draft.generated_at)}
                    </span>
                </StatusCell>
                <StatusCell label="Extracted text">
                    {textAvailable ? `${textLen ?? "—"} characters` : "Unavailable"}
                </StatusCell>
                <StatusCell label="Detected structure">
                    {sectionCount} section{sectionCount === 1 ? "" : "s"} · {activeFieldCount} question{activeFieldCount === 1 ? "" : "s"}
                </StatusCell>
                <StatusCell label="Detection mode">
                    <span className="font-semibold">{detectionModeLabel(draft)}</span>
                </StatusCell>
                <StatusCell label="Source">
                    <span className="truncate">{docTitle}</span>
                </StatusCell>
                <StatusCell label="Draft quality">
                    <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                            quality === "strong" ? "bg-emerald-50 text-emerald-700" : quality === "weak" ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-stone-500"
                        }`}
                    >
                        {quality === "strong" ? "High" : quality === "weak" ? "Low" : "None"}
                    </span>
                </StatusCell>
            </div>

            {/* Two-pane review — PDF ↔ question resolution, both visible, independent scroll */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
                {/* LEFT — source document: recognized regions or original PDF */}
                <div className="flex min-w-0 flex-1 flex-col border-r border-alloy-stone/12">
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/10 px-3 py-1.5">
                        <span className="text-[11px] font-semibold text-alloy-midnight">Source document</span>
                        <div className="flex items-center gap-2">
                            <div className="flex overflow-hidden rounded-md border border-stone-200" title="Two views of the same document">
                                {(["highlights", "pdf"] as const).map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setLeftView(v)}
                                        className={`px-2 py-0.5 text-[10.5px] font-medium ${
                                            leftView === v ? "bg-alloy-juniper text-white" : "bg-white text-stone-500 hover:bg-stone-50"
                                        }`}
                                    >
                                        {v === "pdf" ? "Original PDF" : "Recognized regions"}
                                    </button>
                                ))}
                            </div>
                            {pdfUrl ? (
                                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" title="Open the PDF" className="text-stone-400 hover:text-alloy-juniper">
                                    <Download className="h-3.5 w-3.5" aria-hidden />
                                </a>
                            ) : null}
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto bg-stone-50 p-3">
                        {leftView === "highlights" ? (
                            hasRegions ? (
                                <>
                                    {mappingQuestionId ? (
                                        <div className="mb-2 flex items-center justify-between rounded-md border border-alloy-juniper/30 bg-emerald-50/70 px-2 py-1 text-[11px] text-emerald-800">
                                            <span>Drag a rectangle on the page to map this question.</span>
                                            <button type="button" onClick={() => setMappingQuestionId(null)} className="font-medium text-stone-500 hover:underline">
                                                Cancel
                                            </button>
                                        </div>
                                    ) : null}
                                    <PosPdfFieldMap
                                        pages={pageMaps}
                                        selectedId={selectedQuestionId}
                                        onSelect={setSelectedQuestionId}
                                        mapping={!!mappingQuestionId}
                                        onDrawRect={handleDrawRect}
                                    />
                                    <div className="mt-2 flex items-center gap-3 text-[10px] text-stone-500">
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block h-2.5 w-3 rounded-sm border border-alloy-juniper/40 bg-alloy-juniper/15" /> Recognized question
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block h-2.5 w-3 rounded-sm border-2 border-alloy-juniper bg-alloy-juniper/30" /> Selected
                                        </span>
                                        <span className="ml-auto text-stone-400">Click a region or question row to select</span>
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-md border border-dashed border-stone-300 bg-white p-4 text-center text-[11.5px] text-stone-400">
                                    No recognized question regions — this draft came from text. Switch to Original PDF to view the
                                    document, and add questions on the right.
                                </div>
                            )
                        ) : pdfUrl ? (
                            <object data={pdfUrl} type="application/pdf" className="h-full min-h-[24rem] w-full rounded-md border border-stone-200 bg-white">
                                <iframe src={pdfUrl} title="Source PDF" className="h-full min-h-[24rem] w-full rounded-md border border-stone-200" />
                                <div className="p-2 text-[11.5px] text-stone-500">
                                    Inline preview unavailable.{" "}
                                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-alloy-juniper underline">
                                        Open the PDF
                                    </a>
                                </div>
                            </object>
                        ) : pdfErr ? (
                            <div className="text-[11.5px] text-stone-400">{pdfErr}</div>
                        ) : (
                            <div className="h-full min-h-[24rem] w-full animate-pulse rounded-md bg-stone-100" />
                        )}
                    </div>
                </div>

                {/* RIGHT — resolve detected questions, tabbed */}
                <div className="flex w-[22rem] shrink-0 flex-col">
                    <div className="shrink-0 border-b border-alloy-stone/10 px-3 pt-2">
                        <div className="text-[12.5px] font-semibold text-alloy-midnight">Resolve detected questions</div>
                        <p className="mt-0.5 text-[10.5px] text-stone-500">{detectionModeHelper(draft)}</p>
                        <div className="mt-1.5 flex gap-3">
                            {(["questions", "text"] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTab(t)}
                                    className={`border-b-2 px-0.5 pb-1.5 text-[12px] font-medium ${
                                        tab === t ? "border-alloy-juniper text-alloy-juniper" : "border-transparent text-stone-500 hover:text-alloy-midnight"
                                    }`}
                                >
                                    {t === "questions" ? "Questions" : "Extracted text"}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {tab === "questions" ? (
                            <>
                                <ProcessingQuestionReviewList
                                    questions={reviewQuestions}
                                    selectedId={selectedQuestionId}
                                    editingId={editingQuestionId}
                                    created={!!created}
                                    hasPageMaps={pageMaps.length > 0}
                                    mappingFieldId={mappingQuestionId}
                                    onSelect={setSelectedQuestionId}
                                    onEdit={setEditingQuestionId}
                                    onUpdate={updateQuestion}
                                    onIgnore={toggleIgnoreQuestion}
                                    onRemove={removeQuestion}
                                    onStartMapping={startMapping}
                                />
                                <button
                                    type="button"
                                    onClick={addQuestion}
                                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-[11.5px] font-medium text-stone-600 hover:bg-stone-50"
                                >
                                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add question
                                </button>
                                <p className="mt-2 text-[10px] text-stone-400">
                                    Questions without a highlighted area can still be captured, but won't yet map back to the official PDF.
                                </p>
                            </>
                        ) : (
                            <div className="flex h-full min-h-0 flex-col">
                                <input
                                    value={textQuery}
                                    onChange={(e) => setTextQuery(e.target.value)}
                                    placeholder="Search extracted text…"
                                    className="mb-2 w-full rounded-md border border-stone-300 px-2 py-1 text-[12px] focus:border-alloy-juniper focus:outline-none"
                                />
                                {textQuery.trim() ? (
                                    <div className="mb-1 text-[10px] text-stone-400">{matchedTextLines.matches} matching line(s)</div>
                                ) : null}
                                {fullText === null ? (
                                    <div className="text-[11.5px] text-stone-400">Loading…</div>
                                ) : (fullText || draft.diagnostics.extracted_text_preview) ? (
                                    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-stone-200 bg-stone-50 p-2 text-[11px] leading-snug text-stone-600">
                                        {matchedTextLines.lines.join("\n")}
                                    </pre>
                                ) : (
                                    <div className="text-[11.5px] text-stone-400">No extracted text available.</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer — generate / re-detect / open workspace */}
            <div className="shrink-0 border-t border-alloy-stone/12 bg-white px-3 py-2.5">
                {err ? <div className="mb-2 text-[11px] text-amber-700">{err}</div> : null}
                <div className="flex items-center justify-between gap-3">
                    <p className={`min-w-0 text-[10.5px] ${created ? "text-emerald-700" : "text-stone-400"}`}>
                        {created
                            ? "Native form created — open the form workspace to edit and publish."
                            : "Generates an unpublished native form from resolved questions (PDF mapping preserved)."}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                        {!created ? (
                            <button type="button" disabled={busy || creating} onClick={() => void handleDetect()} className={WS_ACTION_SECONDARY}>
                                {busy ? "Re-detecting…" : "Re-detect questions"}
                            </button>
                        ) : null}
                        {created ? (
                            <button type="button" onClick={() => created.form_id && onOpenForm?.(created.form_id)} className={WS_ACTION_PRIMARY}>
                                Open form workspace
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={creating || busy || activeFieldCount === 0}
                                onClick={() => void handleCreate()}
                                className={WS_ACTION_PRIMARY}
                            >
                                {creating ? "Generating…" : "Generate native form"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusCell({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-stone-400">{label}</div>
            <div className="truncate text-[12px] text-alloy-midnight">{children}</div>
        </div>
    );
}
