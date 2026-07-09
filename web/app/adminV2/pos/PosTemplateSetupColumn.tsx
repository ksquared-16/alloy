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
import ProcessingWorkflowStepper from "./ProcessingWorkflowStepper";
import WorkspaceZonePanel from "@/components/workspace/WorkspaceZonePanel";
import { WS_FIELD } from "@/components/workspace/workspaceTokens";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";
import {
    seedReviewQuestionFromDraftField,
    expandQuestionsForDraftSave,
    inferQuestionIntent,
    defaultSubjectForIntent,
    deriveFieldSources,
    type ReviewQuestionInput,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import { detectionModeLabel } from "@/lib/pos/processingCase/formDraft/detectionModeLabel";

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
    const [phase, setPhase] = useState<"review" | "generate">("review");

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
        setPhase("review");
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

    const summaryCounts = useMemo(() => {
        let resolved = 0;
        let processingOnly = 0;
        let ignored = 0;
        for (const q of reviewQuestions) {
            if (q.ignored) {
                ignored += 1;
                continue;
            }
            if (q.questionSubject === "processing_only") processingOnly += 1;
            else resolved += 1;
        }
        return { resolved, processingOnly, ignored };
    }, [reviewQuestions]);

    const includedQuestions = useMemo(() => {
        return expandQuestionsForDraftSave(reviewQuestions).map((f) => ({
            label: f.label,
            section: f.section,
        }));
    }, [reviewQuestions]);

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
        setReviewQuestions((qs) => {
            const next = [
                ...qs,
                {
                    id,
                    evidenceLabel: "",
                    displayLabel: "",
                    type: "text",
                    section,
                    evidence: "operator",
                    confidence: "high",
                    questionSubject: "processing_only" as const,
                },
            ];
            reviewQuestionsRef.current = next;
            return next;
        });
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
                    <p className="mt-1 text-[12px] text-alloy-midnight/50">
                        Alloy reads questions from the uploaded document. Review what each question means, then generate a
                        native form. Nothing is created or published until you confirm.
                    </p>
                    {err ? <div className="mt-2 text-[11px] text-alloy-midnight/60">{err}</div> : null}
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
            <div className="shrink-0 border-b border-alloy-stone/10 bg-white px-2 py-1">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                    <ProcessingWorkflowStepper
                        compact
                        active={created ? "edit" : phase === "generate" ? "generate" : "review"}
                    />
                    <p className="min-w-0 truncate text-[9px] text-alloy-midnight/45">
                        <span className="font-medium text-alloy-midnight/70">{docTitle}</span>
                        <span aria-hidden> · </span>
                        {detectionModeLabel(draft)}
                        <span aria-hidden> · </span>
                        {activeFieldCount} question{activeFieldCount === 1 ? "" : "s"}
                        <span aria-hidden> · </span>
                        {quality === "strong" ? "Ready to generate" : "Needs review"}
                    </p>
                </div>
            </div>

            {phase === "generate" && !created ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="grid gap-3 lg:grid-cols-3">
                        <SummaryPanel title="Summary">
                            <SummaryRow label="Resolved" value={summaryCounts.resolved} tone="pine" />
                            <SummaryRow label="Processing only" value={summaryCounts.processingOnly} tone="midnight" />
                            <SummaryRow label="Ignored" value={summaryCounts.ignored} tone="muted" />
                        </SummaryPanel>
                        <SummaryPanel title="What will be included">
                            {includedQuestions.length === 0 ? (
                                <p className="text-[11px] text-alloy-midnight/40">No active questions to include.</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {includedQuestions.map((q) => (
                                        <li key={`${q.section}-${q.label}`} className="flex items-start gap-2 text-[11px]" data-testid={`generate-included-${q.label.replace(/\s+/g, "-").toLowerCase()}`}>
                                            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-bend-pine" aria-hidden />
                                            <span>
                                                <span className="font-medium text-alloy-midnight">{q.label}</span>
                                                <span className="block text-alloy-midnight/40">{q.section}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </SummaryPanel>
                        <SummaryPanel title="Document details">
                            <dl className="space-y-1.5 text-[11px]">
                                <DetailRow label="Filename" value={docTitle} />
                                <DetailRow label="Detection mode" value={detectionModeLabel(draft)} />
                                <DetailRow
                                    label="Detection quality"
                                    value={quality === "strong" ? "High" : quality === "weak" ? "Needs review" : "Low"}
                                />
                                <DetailRow label="Sections" value={String(sectionCount)} />
                                <DetailRow label="Questions" value={String(activeFieldCount)} />
                            </dl>
                        </SummaryPanel>
                    </div>
                </div>
            ) : (
            <>
            <div className={`flex min-h-0 flex-1 gap-3 overflow-hidden ${WS_FIELD} p-2 pt-1`}>
                <WorkspaceZonePanel
                    title="Source document"
                    className="min-w-0 flex-[55]"
                    headerAction={
                        <div className="flex items-center gap-1.5">
                            <div className="inline-flex rounded-md border border-alloy-stone/20 bg-white p-0.5">
                                {(["highlights", "pdf"] as const).map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setLeftView(v)}
                                        className={`rounded px-2 py-0.5 text-[9px] font-semibold ${
                                            leftView === v ? "bg-alloy-bend-pine text-white" : "text-alloy-midnight/50 hover:text-alloy-midnight"
                                        }`}
                                    >
                                        {v === "pdf" ? "PDF" : "Regions"}
                                    </button>
                                ))}
                            </div>
                            {pdfUrl ? (
                                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" title="Open the PDF" className="text-alloy-midnight/35 hover:text-alloy-bend-pine">
                                    <Download className="h-3.5 w-3.5" aria-hidden />
                                </a>
                            ) : null}
                        </div>
                    }
                >
                    <div
                        className={`min-h-0 flex-1 bg-alloy-stone/[0.02] p-1.5 ${
                            leftView === "pdf" && pdfUrl ? "flex flex-col overflow-hidden" : "overflow-y-auto overscroll-y-contain"
                        }`}
                    >
                        {leftView === "highlights" ? (
                            hasRegions ? (
                                <>
                                    {mappingQuestionId ? (
                                        <div className="mb-1 flex items-center justify-between rounded border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.06] px-2 py-0.5 text-[10px] text-alloy-bend-pine">
                                            <span>Drag a rectangle on the page to map this question.</span>
                                            <button type="button" onClick={() => setMappingQuestionId(null)} className="font-medium text-alloy-midnight/45 hover:underline">
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
                                    <div className="mt-1 flex items-center gap-3 text-[9px] text-alloy-midnight/40">
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block h-2 w-2.5 rounded-sm border border-alloy-bend-pine/40 bg-alloy-bend-pine/15" /> Question
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block h-2 w-2.5 rounded-sm border-2 border-alloy-bend-pine bg-alloy-bend-pine/30" /> Selected
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <div className="rounded border border-dashed border-alloy-stone/25 bg-white p-3 text-center text-[11px] text-alloy-midnight/40">
                                    No recognized question regions — this draft came from text. Switch to Original PDF to view the
                                    document, and add questions on the right.
                                </div>
                            )
                        ) : pdfUrl ? (
                            <iframe
                                src={pdfUrl}
                                title="Source PDF"
                                className="min-h-0 flex-1 w-full rounded border border-alloy-stone/15 bg-white"
                            />
                        ) : pdfErr ? (
                            <div className="text-[11px] text-alloy-midnight/40">{pdfErr}</div>
                        ) : (
                            <div className="h-64 w-full animate-pulse rounded bg-alloy-stone/10" />
                        )}
                    </div>
                </WorkspaceZonePanel>

                <WorkspaceZonePanel
                    title="Review questions"
                    className="min-w-0 flex-[23] bg-alloy-stone/[0.02]"
                    headerAction={
                        <div className="flex gap-2">
                            {(["questions", "text"] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTab(t)}
                                    className={`text-[10px] font-semibold ${
                                        tab === t ? "text-alloy-bend-pine" : "text-alloy-midnight/45 hover:text-alloy-midnight/70"
                                    }`}
                                >
                                    {t === "questions" ? "Questions" : "Text"}
                                </button>
                            ))}
                        </div>
                    }
                >
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
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
                                    className="mt-1.5 inline-flex items-center gap-1 rounded border border-alloy-stone/20 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/[0.04]"
                                >
                                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add question
                                </button>
                                <p className="mt-1.5 text-[9px] text-alloy-midnight/35">
                                    Questions without a highlighted area can still be captured, but won't yet map back to the official PDF.
                                </p>
                            </>
                        ) : (
                            <div className="flex h-full min-h-0 flex-col">
                                <input
                                    value={textQuery}
                                    onChange={(e) => setTextQuery(e.target.value)}
                                    placeholder="Search extracted text…"
                                    className="mb-1.5 w-full rounded border border-alloy-stone/20 px-2 py-1 text-[11px] focus:border-alloy-bend-pine/40 focus:outline-none"
                                />
                                {textQuery.trim() ? (
                                    <div className="mb-1 text-[9px] text-alloy-midnight/35">{matchedTextLines.matches} matching line(s)</div>
                                ) : null}
                                {fullText === null ? (
                                    <div className="text-[11px] text-alloy-midnight/40">Loading…</div>
                                ) : (fullText || draft.diagnostics.extracted_text_preview) ? (
                                    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded border border-alloy-stone/15 bg-alloy-stone/[0.03] p-2 text-[10px] leading-snug text-alloy-midnight/65">
                                        {matchedTextLines.lines.join("\n")}
                                    </pre>
                                ) : (
                                    <div className="text-[11px] text-alloy-midnight/40">No extracted text available.</div>
                                )}
                            </div>
                        )}
                    </div>
                </WorkspaceZonePanel>
            </div>
            </>
            )}

            {/* Footer */}
            <div className="shrink-0 border-t border-alloy-stone/12 border-l-[3px] border-l-alloy-bend-pine bg-white px-3 py-2">
                {err ? <div className="mb-1.5 text-[11px] text-alloy-midnight/60">{err}</div> : null}
                <div className="flex items-center justify-between gap-3">
                    <p className={`min-w-0 text-[10px] ${created ? "text-alloy-bend-pine" : "text-alloy-midnight/40"}`}>
                        {created
                            ? "Processing complete — your native form is ready. Continue in Studio → Forms to edit and publish."
                            : phase === "generate"
                              ? "Alloy will create an unpublished native form from your reviewed questions."
                              : "When you're done reviewing, continue to generate your native form."}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                        {!created && phase === "generate" ? (
                            <button type="button" onClick={() => setPhase("review")} className={WS_ACTION_SECONDARY}>
                                Back to review
                            </button>
                        ) : !created ? (
                            <button type="button" disabled={busy || creating} onClick={() => void handleDetect()} className={WS_ACTION_SECONDARY}>
                                {busy ? "Re-detecting…" : "Re-detect questions"}
                            </button>
                        ) : null}
                        {created ? (
                            <button type="button" onClick={() => created.form_id && onOpenForm?.(created.form_id)} className={WS_ACTION_PRIMARY}>
                                Edit form in Studio
                            </button>
                        ) : phase === "review" ? (
                            <button
                                type="button"
                                disabled={activeFieldCount === 0}
                                onClick={() => setPhase("generate")}
                                className={WS_ACTION_PRIMARY}
                            >
                                Continue to generate
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

function SummaryPanel({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-alloy-stone/15 border-l-[3px] border-l-alloy-bend-pine bg-white p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">{title}</h3>
            <div className="mt-2">{children}</div>
        </section>
    );
}

function SummaryRow({ label, value, tone }: { label: string; value: number; tone: "pine" | "midnight" | "muted" }) {
    const cls =
        tone === "pine" ? "text-alloy-bend-pine" : tone === "midnight" ? "text-alloy-midnight" : "text-alloy-midnight/45";
    return (
        <div className="flex items-center justify-between text-[12px]">
            <span className="text-alloy-midnight/55">{label}</span>
            <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-alloy-midnight/40">{label}</dt>
            <dd className="font-medium text-alloy-midnight">{value}</dd>
        </div>
    );
}

