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
import { computePageMaps, pdfBboxToSvgRect, svgRectToPdfBbox, type FieldWithRegion } from "@/lib/pos/processingCase/structure/pdfFieldMap";
import PosPdfFieldMap from "./PosPdfFieldMap";
import ProcessingPdfCanvas, { type PdfHighlightRegion } from "./ProcessingPdfCanvas";
import PendingManualFieldEditor from "./PendingManualFieldEditor";
import {
    applyEscapeToCanvas,
    buildSavedManualQuestion,
    enterDrawRegionMode,
    exitDrawRegionMode,
    initialCanvasState,
    type PendingManualRegion,
    type ProcessingCanvasState,
} from "@/lib/pos/processingCase/formDraft/processingCanvasInteraction";
import { ProcessingQuestionReviewList } from "./ProcessingQuestionReviewList";
import { recommendSectionDisposition, type SectionDisposition } from "@/lib/pos/processingCase/formDraft/sectionDisposition";
import ProcessingWorkflowStepper from "./ProcessingWorkflowStepper";
import ProcessingSourceDocumentViewport from "./ProcessingSourceDocumentViewport";
import WorkspaceZonePanel from "@/components/workspace/WorkspaceZonePanel";
import ProcessingConceptReview from "./ProcessingConceptReview";
import PacketIntakeReview, { type PacketFactRow } from "./PacketIntakeReview";
import type { PacketIntakeResult } from "@/lib/pos/packetIntake/contracts";
import type { PacketReviewDecision } from "@/lib/pos/packetIntake/packetIntakeDb";
import type { BusinessConceptCandidate, ProposalDecisionState } from "@/lib/pos/discovery/contracts";
import { toDecisionRecords, fromDecisionRecords } from "@/lib/pos/discovery/discoveryDecisionBridge";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";
import { AlloyFieldLabel, AlloyTextInput } from "./ProcessingAlloyControls";
import {
    seedReviewQuestionFromDraftField,
    expandQuestionsForDraftSave,
    inferQuestionIntent,
    defaultSubjectForIntent,
    deriveFieldSources,
    type ReviewQuestionInput,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import {
    countReviewMappingDispositions,
    summarizeGenerateIncludedFields,
} from "@/lib/pos/processingCase/formDraft/generateStepPresentation";
import { detectionModeLabel } from "@/lib/pos/processingCase/formDraft/detectionModeLabel";
import { formatDisplayDateTime } from "@/lib/presentation/presentationDateFormat";
import { proposeGeneratedFormName } from "@/lib/pos/documentInstanceNaming";
import ProcessingNativeFormCreatingState from "./ProcessingNativeFormCreatingState";
import ProcessingConfirmDialog from "./ProcessingConfirmDialog";
import { capabilitiesForFormat, detectProcessingSourceFormat, processingImportAcceptList } from "@/lib/pos/processingSourceCapabilities";
import { uploadProcessingDocument } from "@/lib/pos/processingDocumentUpload";
import { isBulkAcceptSafe } from "@/lib/pos/discovery/bulkAcceptSafety";

function formatWhen(iso: string | null | undefined): string {
    // Canonical presentation datetime (doctrine: typography-and-presentation-doctrine.md).
    return (iso && formatDisplayDateTime(iso)) || "—";
}

/** Build the editable reviewed question list from the stored draft, preserving provenance. */
/** Translate OCR confidence (0–100) into operator language (numeric is supporting detail, not primary). */
function ocrConfidenceLabel(confidence: number): string {
    if (confidence <= 0) return "Could not determine";
    if (confidence >= 85) return "High confidence";
    if (confidence >= 70) return "Review recommended";
    return "Needs attention";
}

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

/** Client-side detect cap — slightly above the server's 60s bound, so a hung request surfaces an
 *  error + retry instead of an endless "Reading your document" spinner (the 7-minute complaint). */
const DETECT_CLIENT_TIMEOUT_MS = 70_000;

/** POST the detect endpoint with a hard client timeout; maps timeout/abort to operator language. */
async function postDetect(caseId: string): Promise<StoredFormDraftPreview | null> {
    let res: Response;
    try {
        res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft`, {
            method: "POST",
            credentials: "same-origin",
            signal: AbortSignal.timeout(DETECT_CLIENT_TIMEOUT_MS),
        });
    } catch (e) {
        if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
            throw new Error("Reading this document took too long and was stopped. You can try again.");
        }
        throw e;
    }
    const body = (await res.json().catch(() => ({}))) as {
        data?: { form_draft_preview?: StoredFormDraftPreview };
        error?: string;
    };
    if (!res.ok) throw new Error(body.error || `Couldn't read this document (${res.status})`);
    return body.data?.form_draft_preview ?? null;
}

export default function PosTemplateSetupColumn({
    state,
    onOpenForm,
}: {
    state: PosCaseState;
    onOpenForm?: (formId: string, formName?: string) => void;
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
    // Import progress the operator sees. Every value is backed by a real transition — the request
    // being in flight, or its response having arrived — never by a timer.
    const [detectStage, setDetectStage] = useState<"idle" | "reading" | "preparing">("idle");
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
    const [canvasState, setCanvasState] = useState<ProcessingCanvasState>(initialCanvasState);
    const [pendingManualRegion, setPendingManualRegion] = useState<PendingManualRegion | null>(null);
    const [pendingSaveBusy, setPendingSaveBusy] = useState(false);
    const pendingSaveLockRef = useRef(false);
    const [phase, setPhase] = useState<"review" | "generate">("review");
    // Configuration Discovery (FP16): concept-first review is the default entry; the detailed
    // field/question review is a drill-down. Operator decisions on proposals are held here.
    const [reviewMode, setReviewMode] = useState<"concepts" | "detailed" | "packet">("concepts");
    /**
     * A case that has been analysed as a packet IS a packet — land on it.
     *
     * The analysis was always durable and only the VIEW was not: `reviewMode` starts at "concepts",
     * so reopening this case rendered the single-document draft instead. On the real certification
     * packet that meant a three-question handbook preview standing in for 180 destinations, and the
     * operator had no way to reach the analysis their tenant already held.
     */
    const restoredPacketRef = useRef<string | null>(null);
    useEffect(() => {
        const stored = detail?.packetIntake as PacketIntakeResult | null | undefined;
        if (!caseId || !stored || restoredPacketRef.current === caseId) return;
        restoredPacketRef.current = caseId;
        setPacket(stored);
        setReviewMode("packet");
    }, [caseId, detail]);
    // Packet analysis: the SAME case read across every source attached to it. Held here beside the
    // single-document draft so the operator moves between them without leaving the case.
    const [packet, setPacket] = useState<PacketIntakeResult | null>(null);
    const [packetDecisions, setPacketDecisions] = useState<Record<string, PacketReviewDecision>>({});
    const [packetBusy, setPacketBusy] = useState(false);
    const [conceptDecisions, setConceptDecisions] = useState<Record<string, ProposalDecisionState>>({});
    const [applying, setApplying] = useState(false);
    const [applicationCounts, setApplicationCounts] = useState<Record<string, number> | null>(null);
    const [dispositionOverrides, setDispositionOverrides] = useState<Record<string, SectionDisposition>>({});
    const [formName, setFormName] = useState("");
    const [creatingPhase, setCreatingPhase] = useState(0);
    const [generateAnywayOpen, setGenerateAnywayOpen] = useState(false);

    // Per-section disposition: Alloy recommends an intent (with operator-language confidence); the
    // operator confirms/overrides. Effective disposition drives the emitted schema on create.
    const sectionInfo = useMemo(() => {
        const byTitle = new Map<string, string[]>();
        const order: string[] = [];
        for (const q of reviewQuestions) {
            if (q.ignored) continue;
            const title = (q.section ?? "").trim() || "Questions";
            if (!byTitle.has(title)) {
                byTitle.set(title, []);
                order.push(title);
            }
            byTitle.get(title)!.push(q.displayLabel || q.evidenceLabel || "");
        }
        // The native-layout detector classifies a section geometrically (signature block, consent/legal
        // prose, output copy) and carries that on the draft section. When present it is a high-confidence
        // recommendation and wins over the label-text heuristic; otherwise we fall back to that heuristic.
        const draftDisposition = new Map<string, SectionDisposition>();
        for (const s of draft?.sections ?? []) {
            if (s.disposition) draftDisposition.set(s.title, s.disposition);
        }
        const out: Record<string, { disposition: SectionDisposition; recommended: SectionDisposition; confidence: "high" | "medium" | "low" }> = {};
        for (const title of order) {
            const labels = byTitle.get(title)!;
            const detected = draftDisposition.get(title);
            const rec = detected
                ? { disposition: detected, confidence: "high" as const }
                : recommendSectionDisposition({ title, fieldLabels: labels, sectionText: labels.join("\n") });
            out[title] = {
                recommended: rec.disposition,
                confidence: rec.confidence,
                disposition: dispositionOverrides[title] ?? rec.disposition,
            };
        }
        return out;
    }, [reviewQuestions, dispositionOverrides, draft]);

    // Configuration Discovery: concept lookup for the concept-first review (stable across renders).
    const discovery = draft?.configuration_discovery ?? null;
    const conceptById = useMemo(() => {
        const m = new Map<string, BusinessConceptCandidate>();
        for (const c of discovery?.concepts ?? []) m.set(c.id, c);
        return m;
    }, [discovery]);

    // Durable decision persistence: load once per case, then debounced-save on operator change.
    const decisionsLoadedRef = useRef<string | null>(null);
    const decisionsDirtyRef = useRef(false);
    useEffect(() => {
        if (!caseId || !discovery) return;
        if (decisionsLoadedRef.current === caseId) return;
        decisionsLoadedRef.current = caseId;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/discovery-decisions`, { credentials: "same-origin" });
                const body = (await res.json().catch(() => ({}))) as { data?: { decisions?: Parameters<typeof fromDecisionRecords>[1] } };
                if (cancelled || !res.ok) return;
                const records = body.data?.decisions ?? [];
                if (records.length) setConceptDecisions(fromDecisionRecords(discovery, records));
            } catch {
                /* durable load is best-effort — the operator can still decide */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [caseId, discovery]);
    useEffect(() => {
        if (!caseId || !discovery || !decisionsDirtyRef.current) return;
        const records = toDecisionRecords(discovery, conceptDecisions, "operator", new Date().toISOString());
        const t = window.setTimeout(() => {
            void fetch(`/api/admin/processing/cases/${caseId}/form-draft/discovery-decisions`, {
                method: "PUT",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ decisions: records }),
            });
        }, 600);
        return () => window.clearTimeout(t);
    }, [conceptDecisions, caseId, discovery]);

    // Auto-detect bookkeeping lives in refs ON PURPOSE: any of these held as state would land in the
    // effect's dependency list and tear down the in-flight request that sets it (see the auto-detect
    // effect below for the deadlock this caused).
    const autoDetectAttemptedRef = useRef<string | null>(null);
    /** caseId of the request currently in flight, or null. */
    const detectInFlightRef = useRef<string | null>(null);
    /** The case this component is currently showing — used to decide whether a response is stale. */
    const detectCaseRef = useRef<string | null>(caseId);
    const mountedRef = useRef(true);

    const clearSelection = () => {
        setSelectedQuestionId(null);
        setEditingQuestionId(null);
    };

    const exitDrawMode = () => {
        setCanvasState(exitDrawRegionMode(canvasState));
        setMappingQuestionId(null);
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            const result = applyEscapeToCanvas({
                state: canvasState,
                hasPendingManual: pendingManualRegion !== null,
            });
            setCanvasState(result.state);
            if (result.state.mode === "select") setMappingQuestionId(null);
            if (result.clearPendingManual) setPendingManualRegion(null);
            if (result.clearSelection) clearSelection();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [canvasState, pendingManualRegion]);

    const primary = detail?.sources.find((s) => s.role === "primary") ?? detail?.sources[0] ?? null;
    const docId = draft?.source_document_id ?? (primary?.kind === "document" ? (primary?.id ?? null) : null);
    const processingIntent = detail?.processingIntent ?? null;
    // Format/capability detection MUST use the raw filename (with extension) — the display `label`
    // (e.g. "Upload 1784… — 07/24/2026") drops the extension and would misresolve to an unsupported
    // format, wrongly gating out "generate form" for a perfectly valid PDF.
    const sourceFilenameEarly = primary?.display.originalFilename ?? primary?.display.label ?? draft?.title ?? "Untitled document";
    const sourceFormat = detectProcessingSourceFormat(sourceFilenameEarly, "");
    const sourceCapabilities = capabilitiesForFormat(sourceFormat);
    // OCR provenance (scanned / image source). An OCR-derived document is eligible for form setup even
    // when its native format has no question detection — the review runs over the OCR text.
    const ocrProvenance = primary?.display.ocr ?? null;
    const isOcrDerived = !!ocrProvenance?.derived;
    const questionDetectionAvailable = sourceCapabilities.questionDetection || isOcrDerived;
    const shouldAutoDetect = processingIntent === "generate_form" && questionDetectionAvailable;

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
        setPendingManualRegion(null);
        setCanvasState(initialCanvasState());
        setMappingQuestionId(null);
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

    // Detected regions drawn over the real document. Only questions that carry the geometry the
    // detector actually read are shown — a highlight can never point somewhere Alloy did not look.
    const documentRegions = useMemo<PdfHighlightRegion[]>(
        () =>
            reviewQuestions
                .filter((q) => typeof q.page === "number" && Array.isArray(q.bbox) && !q.ignored)
                .map((q) => ({
                    id: q.id,
                    page: q.page as number,
                    bbox: q.bbox as [number, number, number, number],
                    tone: q.mappingOrigin === "operator_created" ? ("operator" as const) : ("auto" as const),
                })),
        [reviewQuestions]
    );

    // Show the source document itself whenever we have one. The SVG schematic remains the fallback
    // for text/OCR-derived drafts with no PDF, and for the draw-a-region mapping interaction, which
    // is built against that canvas.
    const showDocumentCanvas =
        leftView === "highlights" && !!pdfUrl && canvasState.mode !== "draw_region" && !pendingManualRegion;

    // Sections that Configuration Discovery resolved to a RELATIONSHIP. Questions inside them are
    // collected through that relationship (the Person is created/linked at submission), so they are
    // not "form field only" even though they carry no per-question field_source.
    const relationshipLabelBySection = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of discovery?.proposals ?? []) {
            if (p.disposition !== "relationship_binding") continue;
            const title = (p.source.section_title ?? "").trim().toLowerCase();
            const role = (p.target_relationship_role ?? "").replace(/_/g, " ").trim();
            if (title && role) map.set(title, role);
        }
        return map;
    }, [discovery]);

    const conceptsAwaitingDecision = useMemo(
        () =>
            (discovery?.proposals ?? []).some(
                (p) => (conceptDecisions[p.id] ?? p.decision_state) === "proposed"
            ),
        [discovery, conceptDecisions]
    );

    const regionMeta = useMemo(
        () =>
            reviewQuestions
                .filter((q) => typeof q.page === "number" && Array.isArray(q.bbox))
                .map((q) => ({ id: q.id, mappingOrigin: q.mappingOrigin ?? ("auto_detected" as const) })),
        [reviewQuestions]
    );

    const pendingRegionOverlay = useMemo(() => {
        if (!pendingManualRegion) return null;
        const pm = pageMaps.find((p) => p.page === pendingManualRegion.page);
        if (!pm) return null;
        const rect = pdfBboxToSvgRect(pendingManualRegion.bbox, pm);
        return { page: pendingManualRegion.page, ...rect };
    }, [pendingManualRegion, pageMaps]);

    const summaryCounts = useMemo(() => countReviewMappingDispositions(reviewQuestions), [reviewQuestions]);

    const includedSections = useMemo(
        () => summarizeGenerateIncludedFields(reviewQuestions),
        [reviewQuestions]
    );

    // AUTO-DETECT after import.
    //
    // This effect used to deadlock, and the symptom was "Reading your document" forever while the
    // server had already answered 200 in seconds:
    //
    //   `busy` was BOTH set inside the effect and listed as a dependency. `setBusy(true)` runs
    //   synchronously (before the first await), so the dependency changed while the request was in
    //   flight; React tore the effect down, the cleanup set `cancelled = true`, and when the POST
    //   resolved every line was skipped by `if (cancelled) return` — no draft, no error, and `busy`
    //   stuck true forever. Nothing could recover, because this surface has no polling: the case is
    //   fetched once per caseId and never revalidated.
    //
    // The fix is to keep in-flight bookkeeping in refs so it can never feed the dependency list, and
    // to make staleness mean "the case changed or we unmounted" rather than "the effect re-ran".
    // No timers, no polling: the awaited response is authoritative and is now actually applied.
    useEffect(() => {
        if (!caseId || draft || creating || !shouldAutoDetect) return;
        if (detectInFlightRef.current) return;
        if (autoDetectAttemptedRef.current === caseId) return;
        autoDetectAttemptedRef.current = caseId;
        detectInFlightRef.current = caseId;

        // Staleness is keyed to the CASE, not to this effect instance.
        const requestedCaseId = caseId;
        const isStale = () => mountedRef.current === false || detectCaseRef.current !== requestedCaseId;

        (async () => {
            setBusy(true);
            setErr(null);
            setDetectStage("reading");
            try {
                const next = await postDetect(requestedCaseId);
                if (isStale()) return;
                setDetectStage("preparing");
                setDraft(next);
                const seeded = seedReviewQuestions(next);
                setReviewQuestions(seeded);
                reviewQuestionsRef.current = seeded;
                await reload();
            } catch (e) {
                // Surface the failure. Swallowing it here is what turned a timeout into a hang.
                if (!isStale()) setErr(e instanceof Error ? e.message : "Couldn't read this document");
            } finally {
                detectInFlightRef.current = null;
                // Always clear the spinner for the case we were working on, even if it is no longer
                // the visible one — a stuck `busy` also permanently wedges the guard above.
                if (mountedRef.current) {
                    setBusy(false);
                    setDetectStage("idle");
                }
            }
        })();
    }, [caseId, draft, creating, shouldAutoDetect, reload]);

    // Reset the per-case guard when the case actually changes. This must not run as a separate
    // mount effect: effects fire in order, so a bare `[caseId]` reset ran immediately AFTER the
    // auto-detect effect above and erased the guard it had just written.
    useEffect(() => {
        mountedRef.current = true;
        if (detectCaseRef.current !== caseId) {
            detectCaseRef.current = caseId;
            autoDetectAttemptedRef.current = null;
            detectInFlightRef.current = null;
        }
        return () => {
            mountedRef.current = false;
        };
    }, [caseId]);

    if (!detail) return null;

    const created = detail.formDraftCreated;
    const docTitle = draft?.title || primary?.display.label || "Untitled document";
    const textLen = draft?.diagnostics.extracted_text_length ?? null;
    const textAvailable = draft ? draft.extracted_text_available : (detail.documentFormPreview?.extracted_text_available ?? null);
    const sectionCount = new Set(reviewQuestions.map((q) => q.section)).size;
    const activeFieldCount = reviewQuestions.filter((q) => !q.ignored).length;

    const setConceptDecision = (proposalId: string, state: ProposalDecisionState) => {
        decisionsDirtyRef.current = true;
        setConceptDecisions((prev) => ({ ...prev, [proposalId]: state }));
    };
    const applyConfiguration = async () => {
        if (!caseId || !discovery) return;
        setApplying(true);
        try {
            // Persist decisions first so the server applies exactly what the operator sees.
            const records = toDecisionRecords(discovery, conceptDecisions, "operator", new Date().toISOString());
            await fetch(`/api/admin/processing/cases/${caseId}/form-draft/discovery-decisions`, {
                method: "PUT",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ decisions: records }),
            });
            // Accepting a new-field proposal is the operator's explicit confirmation to create it.
            const confirmedNewFields = discovery.proposals
                .filter((p) => p.disposition === "create_proposed_field" && (conceptDecisions[p.id] ?? p.decision_state) === "accepted")
                .map((p) => p.id);
            const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/apply-discovery`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ confirmedNewFields }),
            });
            const body = (await res.json().catch(() => ({}))) as {
                data?: { application?: { counts?: Record<string, number> }; form_draft_preview?: StoredFormDraftPreview };
                error?: string;
            };
            if (res.ok) {
                setApplicationCounts(body.data?.application?.counts ?? null);
                // Re-seed the review from the BOUND draft so applied field bindings carry into
                // the generate/publish flow (published form retains the discovered bindings).
                const bound = body.data?.form_draft_preview ?? null;
                if (bound) {
                    setDraft(bound);
                    const seeded = seedReviewQuestions(bound);
                    setReviewQuestions(seeded);
                    reviewQuestionsRef.current = seeded;
                }
                await reload();
            } else {
                setErr(body.error || "Couldn't apply the configuration.");
            }
        } finally {
            setApplying(false);
        }
    };

    const bulkAcceptHighConfidence = () => {
        if (!discovery) return;
        decisionsDirtyRef.current = true;
        setConceptDecisions((prev) => {
            const next = { ...prev };
            for (const p of discovery.proposals) {
                // Confidence alone is not a licence. `isBulkAcceptSafe` also requires an ownership
                // conclusion that does not need a person — so a 99%-confident routing number stays.
                if (isBulkAcceptSafe(p) && (next[p.id] ?? p.decision_state) === "proposed") next[p.id] = "accepted";
            }
            return next;
        });
    };

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
    const sourceFilename = primary?.display.label ?? docTitle;

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
                        patch.displayLabel !== undefined ||
                        patch.destinationFieldId !== undefined)
                ) {
                    const intent = inferQuestionIntent(merged.evidenceLabel || merged.displayLabel, merged.section ?? "");
                    const subject = merged.questionSubject ?? defaultSubjectForIntent(intent);
                    merged.field_source = deriveFieldSources({
                        subject,
                        nameRepresentation: merged.nameRepresentation,
                        intent,
                        displayLabel: merged.displayLabel,
                        type: merged.type,
                        destinationFieldId: merged.destinationFieldId,
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
                    mappingOrigin: "operator_created" as const,
                    questionSubject: "processing_only" as const,
                },
            ];
            reviewQuestionsRef.current = next;
            return next;
        });
        setSelectedQuestionId(id);
        setEditingQuestionId(id);
    };

    const startDrawNewField = () => {
        setPendingManualRegion(null);
        clearSelection();
        setCanvasState(enterDrawRegionMode({ kind: "new_field" }));
        setMappingQuestionId(null);
        setLeftView("highlights");
    };

    const cancelDrawMode = () => exitDrawMode();

    const cancelPendingManual = () => {
        setPendingManualRegion(null);
        clearSelection();
    };

    const savePendingManual = () => {
        if (!pendingManualRegion || pendingSaveLockRef.current) return;
        pendingSaveLockRef.current = true;
        setPendingSaveBusy(true);
        try {
            const id = `manual_${Date.now().toString(36)}`;
            const saved = buildSavedManualQuestion(pendingManualRegion, id);
            const intent = inferQuestionIntent(saved.evidenceLabel || saved.displayLabel, saved.section ?? "");
            const subject = saved.questionSubject ?? defaultSubjectForIntent(intent);
            const field_source = deriveFieldSources({
                subject,
                intent,
                displayLabel: saved.displayLabel || saved.evidenceLabel,
                type: saved.type,
                destinationFieldId: saved.destinationFieldId,
            });
            setReviewQuestions((qs) => {
                const next = [...qs, { ...saved, field_source }];
                reviewQuestionsRef.current = next;
                return next;
            });
            setPendingManualRegion(null);
            setSelectedQuestionId(id);
            setEditingQuestionId(null);
        } finally {
            pendingSaveLockRef.current = false;
            setPendingSaveBusy(false);
        }
    };

    const startMapping = (id: string) => {
        setPendingManualRegion(null);
        setMappingQuestionId(id);
        setSelectedQuestionId(id);
        setCanvasState(enterDrawRegionMode({ kind: "map_question", questionId: id }));
        setLeftView("highlights");
    };

    const handleDrawRect = (page: number, rect: { x: number; y: number; w: number; h: number }) => {
        const pm = pageMaps.find((p) => p.page === page);
        if (!pm) return;
        const bbox = svgRectToPdfBbox(rect, pm);

        if (canvasState.drawTarget?.kind === "new_field") {
            const section = reviewQuestions[reviewQuestions.length - 1]?.section ?? "Form questions";
            setPendingManualRegion({
                page,
                bbox,
                evidenceLabel: "",
                displayLabel: "",
                type: "text",
                section,
                questionSubject: "processing_only",
            });
            clearSelection();
            exitDrawMode();
            return;
        }

        if (canvasState.drawTarget?.kind === "map_question") {
            const questionId = canvasState.drawTarget.questionId;
            const existing = reviewQuestions.find((q) => q.id === questionId);
            updateQuestion(questionId, {
                page,
                bbox,
                evidence: "manual_pdf_mapping",
                ...(existing?.mappingOrigin === "operator_created"
                    ? { mappingOrigin: "operator_created" as const }
                    : {}),
            });
            setSelectedQuestionId(questionId);
            exitDrawMode();
        }
    };

    // ---- endpoints ----
    async function detectDoc(): Promise<StoredFormDraftPreview | null> {
        if (!caseId) return null;
        return postDetect(caseId);
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

    /**
     * Analyse EVERY source attached to this case as one packet. Same case, same authorization, same
     * endpoint as the single-document detect — `mode: "packet"` is what changes. Publishes nothing.
     */
    /**
     * Add another source to THIS case.
     *
     * The whole gap in one control: `processing_case_sources` always allowed several sources and
     * packet analysis always read them, but nothing an operator could press ever wrote one — so
     * "Analyse as one packet" sat next to a case that could only ever have one.
     */
    const addSourceInputRef = useRef<HTMLInputElement | null>(null);
    const [addingSource, setAddingSource] = useState(false);

    const handleAddSource = async (file: File | null) => {
        if (!file || !caseId) return;
        setAddingSource(true);
        setErr(null);
        try {
            const res = await uploadProcessingDocument({
                file,
                intent: "generate_form",
                displayName: file.name,
                attachToCaseId: caseId,
            });
            if (res.attach_outcome && res.attach_outcome !== "attached" && res.attach_outcome !== "already_attached") {
                throw new Error(
                    res.attach_outcome === "is_primary"
                        ? "That document is already this case's primary source."
                        : `Couldn't attach that document (${res.attach_outcome}).`,
                );
            }
            await reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn't add that source");
        } finally {
            setAddingSource(false);
            if (addSourceInputRef.current) addSourceInputRef.current.value = "";
        }
    };

    const handleAnalyzePacket = async () => {
        if (!caseId) return;
        setPacketBusy(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mode: "packet" }),
            });
            const body = (await res.json().catch(() => ({}))) as {
                data?: { packet_intake?: PacketIntakeResult; packet_review_decisions?: PacketReviewDecision[] };
                error?: string;
            };
            if (!res.ok) throw new Error(body.error ?? "Couldn't analyse this case as a packet");
            setPacket(body.data?.packet_intake ?? null);
            const stored = body.data?.packet_review_decisions ?? [];
            setPacketDecisions(Object.fromEntries(stored.map((d) => [`${d.subject}:${d.subject_id}`, d])));
            setReviewMode("packet");
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn't analyse this case as a packet");
        } finally {
            setPacketBusy(false);
        }
    };

    /** Record ONE packet review decision. Persisted immediately — a decision the operator made is
     *  not something to lose to a reload. Actor and time are stamped server-side. */
    const recordPacketDecision = async (d: Omit<PacketReviewDecision, "decided_by" | "decided_at">) => {
        if (!caseId) return;
        const key = `${d.subject}:${d.subject_id}`;
        const optimistic: PacketReviewDecision = { ...d, decided_by: "you", decided_at: new Date().toISOString() };
        const next = { ...packetDecisions, [key]: optimistic };
        setPacketDecisions(next);
        try {
            await fetch(`/api/admin/processing/cases/${caseId}/form-draft/discovery-decisions`, {
                method: "PUT",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ packet_decisions: Object.values(next).map(({ decided_by: _b, decided_at: _a, ...rest }) => rest) }),
            });
        } catch {
            /* the decision is still shown; the next save retries the whole set */
        }
    };

    /** Facts, in the review grain: one row per proposal, with its concept and source. */
    const packetFacts: PacketFactRow[] = useMemo(() => {
        if (!packet) return [];
        const rows: PacketFactRow[] = [];
        const OBLIGATION = new Set(["acknowledgement", "upload_requirement", "signature"]);
        for (const src of packet.sources) {
            const analysis = packet.source_analysis?.[src.document_id];
            if (!analysis) continue;
            const byCandidate = new Map(analysis.proposals.map((p) => [p.candidate_id, p]));
            for (const c of analysis.concepts) {
                if (OBLIGATION.has(c.kind)) continue;
                const proposal = byCandidate.get(c.id);
                if (!proposal) continue;
                rows.push({ id: proposal.id, concept: c, proposal, documentId: src.document_id, documentTitle: src.title });
            }
        }
        return rows;
    }, [packet]);

    const handleCreate = async (generateAnyway = false) => {
        const trimmedFormName = formName.trim();
        if (!trimmedFormName) {
            setErr("Enter a form name before generating.");
            return;
        }
        const expanded = expandQuestionsForDraftSave(reviewQuestionsRef.current, { generateAnyway });
        if (expanded.length === 0) {
            setErr("Add at least one active question before generating the form.");
            return;
        }
        setCreating(true);
        setCreatingPhase(0);
        setErr(null);
        setGenerateAnywayOpen(false);
        try {
            setCreatingPhase(1);
            const saveRes = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/save`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    title: docTitle,
                    form_name: trimmedFormName,
                    fields: expanded.map((f) => ({
                        label: f.label,
                        type: f.type,
                        required: f.required,
                        section: f.section,
                        pdf_field_name: f.pdf_field_name,
                        page: f.page,
                        bbox: f.bbox,
                        evidence: f.evidence,
                        ...(f.description ? { description: f.description } : {}),
                        ...(f.field_source ? { field_source: f.field_source } : {}),
                    })),
                    section_dispositions: Object.entries(sectionInfo)
                        .filter(([, info]) => info.disposition !== "fields")
                        .map(([title, info]) => ({ title, disposition: info.disposition })),
                }),
            });
            const saveBody = (await saveRes.json().catch(() => ({}))) as { error?: string };
            if (!saveRes.ok) throw new Error(saveBody.error || `Couldn't save questions (${saveRes.status})`);

            setCreatingPhase(2);
            const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/create`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ form_name: trimmedFormName }),
            });
            const body = (await res.json().catch(() => ({}))) as {
                data?: { form_id?: string; form_name?: string };
                error?: string;
            };
            if (!res.ok) throw new Error(body.error || `Couldn't create the form (${res.status})`);
            setCreatingPhase(3);
            await reload();
            const formId = body.data?.form_id ?? null;
            const persistedName = body.data?.form_name?.trim() || trimmedFormName;
            if (formId && onOpenForm) onOpenForm(formId, persistedName);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn't create the form");
        } finally {
            setCreating(false);
        }
    };

    // ---- no draft yet: auto-detect for generate_form, manual gate otherwise ----
    if (!draft) {
        if (processingIntent === "generate_form" && !questionDetectionAvailable) {
            return (
                <div className="flex h-full min-h-0 flex-col items-center justify-center bg-white p-6 text-center">
                    <div className="max-w-sm">
                        <div className="text-[14px] font-semibold text-alloy-midnight">{docTitle}</div>
                        <p className="mt-1 text-[12px] text-alloy-midnight/50">
                            Automatic question detection is not available for {sourceCapabilities.label} files. You can
                            still store and preview the document, but native form generation requires a supported format
                            (PDF, DOCX, or plain text).
                        </p>
                        {detail.documentFormPreview ? (
                            <p className="mt-2 text-[11px] text-alloy-midnight/45">
                                Document preview is available — switch to another supported source to generate a form.
                            </p>
                        ) : null}
                    </div>
                </div>
            );
        }

        if (shouldAutoDetect) {
            return (
                <ProcessingNativeFormCreatingState
                    mode="detecting"
                    error={err}
                    detectStage={detectStage === "preparing" ? "preparing" : "reading"}
                    onRetry={err ? () => void handleDetect() : undefined}
                />
            );
        }

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
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
            <div className="mb-2 shrink-0 bg-white px-1.5">
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

            {isOcrDerived ? (
                <div
                    className="mb-2 shrink-0 rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1"
                    data-testid="ocr-derived-banner"
                >
                    <span className="text-[10px] font-semibold text-amber-800">Detected using OCR — review recommended</span>
                    <span className="mx-1.5 text-amber-300" aria-hidden>
                        ·
                    </span>
                    <span className="text-[10px] font-medium text-amber-800" data-testid="ocr-confidence">
                        {ocrConfidenceLabel(ocrProvenance?.confidence ?? 0)}
                    </span>
                    <span className="ml-1 text-[9px] text-amber-700/70">({ocrProvenance?.confidence ?? 0}% overall)</span>
                    <p className="mt-0.5 text-[9px] text-amber-700/80">
                        Read from a scanned/image document — verify each field against the original before publishing.
                    </p>
                </div>
            ) : null}

            {creating ? (
                <ProcessingNativeFormCreatingState
                    mode="creating"
                    phaseIndex={creatingPhase}
                    error={err}
                    onRetry={err ? () => void handleCreate() : undefined}
                />
            ) : phase === "generate" && !created ? (
                <>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <header className="mb-4">
                        <h2 className="text-[15px] font-semibold text-alloy-midnight">Ready to create your native form</h2>
                        <p className="mt-1 text-[12px] text-alloy-midnight/55">Review what Alloy will include before generating.</p>
                    </header>

                    <section className="mb-4 rounded-xl border border-alloy-stone/22 bg-white p-4">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Form setup</h3>
                        <div className="mt-3 space-y-3">
                            <div>
                                <AlloyFieldLabel>Form name</AlloyFieldLabel>
                                <AlloyTextInput
                                    value={formName}
                                    onChange={setFormName}
                                    testId="processing-generate-form-name"
                                />
                            </div>
                            <DetailRow label="Source document" value={sourceFilename} />
                            <DetailRow label="Document display name" value={docTitle} />
                            <DetailRow label="Detected document type" value={detectionModeLabel(draft)} />
                        </div>
                    </section>

                    <section className="mb-4 rounded-xl border border-alloy-stone/22 bg-alloy-stone/[0.03] p-3">
                        <div className="flex flex-wrap gap-3">
                            <SummaryRow label="Mapped" value={summaryCounts.mapped} tone="pine" />
                            <SummaryRow label="Form field only" value={summaryCounts.formFieldOnly} tone="midnight" />
                            <SummaryRow label="Unresolved" value={summaryCounts.unresolved} tone="muted" />
                            <SummaryRow label="Ignored" value={summaryCounts.ignored} tone="muted" />
                        </div>
                        {summaryCounts.unresolved > 0 ? (
                            <div className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2">
                                <p className="text-[11px] text-amber-900">
                                    {summaryCounts.unresolved} question{summaryCounts.unresolved === 1 ? "" : "s"} still
                                    need a store destination before answers can write to business records.
                                </p>
                            </div>
                        ) : null}
                    </section>

                    <section className="mb-4 rounded-xl border border-alloy-stone/22 bg-white p-4">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Included fields</h3>
                        {includedSections.every((s) => s.fields.length === 0) ? (
                            <p className="mt-2 text-[11px] text-alloy-midnight/40">No active questions to include.</p>
                        ) : (
                            <div className="mt-2 space-y-3">
                                {includedSections.map((section) => (
                                    <div key={section.title}>
                                        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                                            {section.title}
                                        </h4>
                                        <ul className="mt-1 space-y-1">
                                            {section.fields.map((q) => (
                                                <li
                                                    key={`${section.title}-${q.label}`}
                                                    className="flex items-start justify-between gap-3 text-[11px]"
                                                    data-testid={`generate-included-${q.label.replace(/\s+/g, "-").toLowerCase()}`}
                                                >
                                                    <span className="font-medium text-alloy-midnight">{q.label}</span>
                                                    <span className="shrink-0 text-alloy-midnight/45">{q.destination}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="rounded-lg border border-alloy-stone/18 bg-alloy-stone/[0.02] p-3 text-[11px]">
                        <h3 className="font-semibold uppercase tracking-wide text-alloy-midnight/35">Source details</h3>
                        <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                            <DetailRow label="Source filename" value={sourceFilename} />
                            <DetailRow label="Document type" value={detectionModeLabel(draft)} />
                            <DetailRow label="Pages" value={String(draft.pdf_pages?.length ?? "—")} />
                            <DetailRow label="Questions detected" value={String(activeFieldCount)} />
                            <DetailRow label="Extraction quality" value={quality === "strong" ? "High" : quality === "weak" ? "Needs review" : "Low"} />
                        </dl>
                    </section>
                </div>
                <div className="shrink-0 border-t border-alloy-stone/22 border-l-[3px] border-l-alloy-bend-pine bg-white px-3 py-2">
                    {err ? <div className="mb-1.5 text-[11px] text-alloy-midnight/60">{err}</div> : null}
                    <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => setPhase("review")} className={WS_ACTION_SECONDARY}>
                            Back to review
                        </button>
                        {summaryCounts.unresolved > 0 ? (
                            <>
                                <button
                                    type="button"
                                    disabled={creating || busy}
                                    onClick={() => setGenerateAnywayOpen(true)}
                                    className={`${WS_ACTION_SECONDARY} text-alloy-midnight/55`}
                                    data-testid="processing-generate-anyway"
                                >
                                    Generate anyway
                                </button>
                                <button
                                    type="button"
                                    disabled={creating || busy || activeFieldCount === 0}
                                    onClick={() => setPhase("review")}
                                    className={WS_ACTION_PRIMARY}
                                    data-testid="processing-review-unresolved"
                                >
                                    Review unresolved
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                disabled={creating || busy || activeFieldCount === 0 || !formName.trim()}
                                onClick={() => void handleCreate()}
                                className={WS_ACTION_PRIMARY}
                                data-testid="processing-generate-native-form"
                            >
                                Generate native form
                            </button>
                        )}
                    </div>
                </div>
                <ProcessingConfirmDialog
                    open={generateAnywayOpen}
                    onClose={() => setGenerateAnywayOpen(false)}
                    onConfirm={() => void handleCreate(true)}
                    title="Generate with unresolved questions?"
                    body={`${summaryCounts.unresolved} unresolved question${summaryCounts.unresolved === 1 ? "" : "s"} will be generated as form-only fields. They will not write to business records until you configure a destination in the form builder.`}
                    confirmLabel="Generate anyway"
                    confirming={creating}
                    testId="processing-generate-anyway-confirm"
                />
                </>
            ) : reviewMode === "packet" && packet ? (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-[13px] font-semibold text-alloy-midnight">Packet review</div>
                            <div className="text-[11px] text-alloy-midnight/55">
                                {packet.sources.length} source documents analysed together. Proposals only — nothing is published from this screen.
                            </div>
                        </div>
                        <button
                            type="button"
                            className="rounded-lg border border-alloy-stone/25 px-2.5 py-1 text-[11px] text-alloy-midnight/70"
                            data-testid="packet-back-to-document"
                            onClick={() => setReviewMode("concepts")}
                        >
                            Back to this document
                        </button>
                    </div>
                    <PacketIntakeReview
                        packet={packet}
                        facts={packetFacts}
                        decisions={packetDecisions}
                        onDecision={(d) => void recordPacketDecision(d)}
                        onRenameArtifact={(artifactId, name) =>
                            void recordPacketDecision({ subject: "artifact", subject_id: artifactId, decision: "renamed", name })
                        }
                    />
                </div>
            ) : reviewMode === "concepts" && discovery && !created ? (
                <ProcessingConceptReview
                    discovery={discovery}
                    conceptById={conceptById}
                    decisions={conceptDecisions}
                    onDecision={setConceptDecision}
                    onBulkAcceptHighConfidence={bulkAcceptHighConfidence}
                    onOpenDetailed={() => setReviewMode("detailed")}
                    onReviewProposal={(proposal) => {
                        // "Review recommended" must lead somewhere the operator can actually CHANGE
                        // something. Open the detailed review and select the question this proposal
                        // was read from, matched on the source labels the proposal carries.
                        setReviewMode("detailed");
                        const labels = new Set(
                            (proposal.source.labels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean)
                        );
                        const match = reviewQuestionsRef.current.find((q) => {
                            const evidence = (q.evidenceLabel || "").trim().toLowerCase();
                            const display = (q.displayLabel || "").trim().toLowerCase();
                            return (evidence && labels.has(evidence)) || (display && labels.has(display));
                        });
                        if (match) {
                            setSelectedQuestionId(match.id);
                            setEditingQuestionId(match.id);
                        }
                    }}
                    onApply={applyConfiguration}
                    applying={applying}
                    applicationCounts={applicationCounts}
                />
            ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {discovery && !created ? (
                <div className="shrink-0 border-b border-alloy-stone/22 px-3 py-1.5">
                    <button type="button" onClick={() => setReviewMode("concepts")} className="text-[11px] font-semibold text-alloy-bend-pine hover:underline" data-testid="concept-back">
                        ← Back to concept review
                    </button>
                </div>
            ) : null}
            <div className="flex min-h-0 flex-1 gap-3 overflow-hidden px-2 pb-2">
                <WorkspaceZonePanel
                    title="Source document"
                    className="min-h-0 min-w-0 flex-[55] self-stretch"
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
                                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" title="Open the PDF" className="text-alloy-midnight-forge hover:text-alloy-bend-pine">
                                    <Download className="h-3.5 w-3.5" aria-hidden />
                                </a>
                            ) : null}
                            {leftView === "highlights" && !created ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        canvasState.mode === "draw_region" && canvasState.drawTarget?.kind === "new_field"
                                            ? cancelDrawMode()
                                            : startDrawNewField()
                                    }
                                    className={`rounded px-2 py-0.5 text-[9px] font-semibold ${
                                        canvasState.mode === "draw_region" && canvasState.drawTarget?.kind === "new_field"
                                            ? "bg-alloy-bend-pine text-white"
                                            : "border border-alloy-stone/20 text-alloy-midnight/60 hover:bg-alloy-stone/[0.04]"
                                    }`}
                                    data-testid="map-field-toolbar-btn"
                                >
                                    {canvasState.mode === "draw_region" && canvasState.drawTarget?.kind === "new_field"
                                        ? "Cancel"
                                        : "Add field"}
                                </button>
                            ) : null}
                        </div>
                    }
                >
                    {showDocumentCanvas ? (
                        // THE SOURCE DOCUMENT ITSELF, with the detected regions drawn over it.
                        // Deliberately NOT nested in ProcessingSourceDocumentViewport: that wrapper
                        // owns its own scroll container and applies a CSS `zoom`, which would both
                        // double-scroll and rescale an already-rasterized bitmap (blurry). The canvas
                        // rasterizes at the requested scale itself, so it stays crisp.
                        <ProcessingPdfCanvas
                            url={pdfUrl!}
                            regions={documentRegions}
                            selectedId={selectedQuestionId}
                            onSelectRegion={(id) => (id ? setSelectedQuestionId(id) : clearSelection())}
                            onError={(message) => setPdfErr(message)}
                        />
                    ) : null}
                    <ProcessingSourceDocumentViewport
                        key={`${detail.id}-${leftView}`}
                        pdfMode={leftView === "pdf" && !!pdfUrl}
                        pageLayouts={pageMaps.map((p) => ({ width: p.width, height: p.height }))}
                        mappingBanner={
                            canvasState.mode === "draw_region" ? (
                                <div
                                    className="mx-1.5 mt-1.5 flex shrink-0 items-center justify-between rounded border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.06] px-2 py-0.5 text-[10px] text-alloy-bend-pine"
                                    data-testid="canvas-draw-mode-banner"
                                >
                                    <span>
                                        {canvasState.drawTarget?.kind === "new_field"
                                            ? "Draw a rectangle around the missed source field."
                                            : "Draw a rectangle to map this question to the source document."}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={cancelDrawMode}
                                        className="font-medium text-alloy-midnight/45 hover:underline"
                                        data-testid="canvas-draw-cancel"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : null
                        }
                    >
                        {leftView === "highlights" && !showDocumentCanvas ? (
                            hasRegions ? (
                                <>
                                    <PosPdfFieldMap
                                        pages={pageMaps}
                                        selectedId={selectedQuestionId}
                                        regionMeta={regionMeta}
                                        pendingRegion={pendingRegionOverlay}
                                        canvasMode={canvasState.mode}
                                        onSelect={setSelectedQuestionId}
                                        onDeselect={clearSelection}
                                        onDrawRect={handleDrawRect}
                                    />
                                    <div className="mt-2 flex items-center gap-3 pb-2 text-[9px] text-alloy-midnight/40">
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block h-2 w-2.5 rounded-sm border border-alloy-bend-pine/40 bg-alloy-bend-pine/15" /> Question
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block h-2 w-2.5 rounded-sm border-2 border-alloy-bend-pine bg-alloy-bend-pine/30" /> Selected
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex min-h-[12rem] items-center justify-center p-4">
                                    <div className="rounded border border-dashed border-alloy-stone/25 bg-white p-3 text-center text-[11px] text-alloy-midnight/40">
                                        No recognized question regions — this draft came from text. Switch to Original PDF to view the
                                        document, and add questions on the right.
                                    </div>
                                </div>
                            )
                        ) : pdfUrl ? (
                            <iframe
                                src={pdfUrl}
                                title="Source PDF"
                                className="w-full rounded border border-alloy-stone/22 bg-white"
                                style={{ height: "72rem" }}
                            />
                        ) : pdfErr ? (
                            <div className="p-2 text-[11px] text-alloy-midnight/40">{pdfErr}</div>
                        ) : (
                            <div className="flex items-center p-2">
                                <div className="h-64 w-full animate-pulse rounded bg-alloy-stone/10" />
                            </div>
                        )}
                    </ProcessingSourceDocumentViewport>
                </WorkspaceZonePanel>

                <WorkspaceZonePanel
                    title="Review questions"
                    className="min-h-0 min-w-0 flex-[23] self-stretch"
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
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                        {tab === "questions" ? (
                            <>
                                {pendingManualRegion ? (
                                    <PendingManualFieldEditor
                                        pending={pendingManualRegion}
                                        onChange={(patch) => setPendingManualRegion((prev) => (prev ? { ...prev, ...patch } : prev))}
                                        onSave={savePendingManual}
                                        onCancel={cancelPendingManual}
                                        saving={pendingSaveBusy}
                                    />
                                ) : null}
                                <ProcessingQuestionReviewList
                                    storageContext={(q) => {
                                        // A question is only "form field only" once the concept review
                                        // has actually decided so. Before that it is undecided, and a
                                        // guardian/emergency section is collected through its
                                        // relationship rather than as a loose field.
                                        const rel = relationshipLabelBySection.get((q.section ?? "").trim().toLowerCase());
                                        return {
                                            relationshipLabel: rel ?? null,
                                            awaitingConceptDecision: !rel && conceptsAwaitingDecision,
                                        };
                                    }}
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
                                    sectionInfo={sectionInfo}
                                    onSectionDisposition={(title, disposition) =>
                                        setDispositionOverrides((prev) => ({ ...prev, [title]: disposition }))
                                    }
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
                                    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded border border-alloy-stone/22 bg-alloy-stone/[0.03] p-2 text-[10px] leading-snug text-alloy-midnight/65">
                                        {matchedTextLines.lines.join("\n")}
                                    </pre>
                                ) : (
                                    <div className="text-[11px] text-alloy-midnight/40">No extracted text available.</div>
                                )}
                            </div>
                        )}
                    </div>
                    {busy ? (
                        <div
                            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 px-4 text-center backdrop-blur-[1px]"
                            data-testid="processing-redetect-overlay"
                            aria-live="polite"
                            aria-busy
                        >
                            <span
                                className="h-6 w-6 animate-spin rounded-full border-2 border-alloy-bend-pine/25 border-t-alloy-bend-pine"
                                aria-hidden
                            />
                            <p className="text-[12px] font-semibold text-alloy-midnight">Re-detecting questions…</p>
                            <p className="text-[11px] text-alloy-midnight/55">Reading the document again to refresh the detected fields.</p>
                        </div>
                    ) : null}
                </WorkspaceZonePanel>
            </div>

            {/* Footer — below review workspace; document scroll stays above */}
            <div className="shrink-0 border-t border-alloy-stone/22 border-l-[3px] border-l-alloy-bend-pine bg-white px-3 py-2">
                {err ? <div className="mb-1.5 text-[11px] text-alloy-midnight/60">{err}</div> : null}
                <div className="flex items-center justify-between gap-3">
                    {(detail?.sources.length ?? 0) > 1 ? (
                        <p className="min-w-0 text-[10px] text-alloy-midnight/55" data-testid="processing-case-sources">
                            {detail!.sources.length} sources on this case:{" "}
                            {detail!.sources
                                .map((s) => `${s.display.originalFilename ?? s.display.label}${s.role === "primary" ? " (primary)" : ""}`)
                                .join(" · ")}
                        </p>
                    ) : null}
                    <p className={`min-w-0 text-[10px] ${created ? "text-alloy-bend-pine" : "text-alloy-midnight/40"}`}>
                        {created
                            ? "Processing complete — your native form is ready. Continue in Studio → Forms to edit and publish."
                            : "When you're done reviewing, continue to generate your native form."}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                        {!created ? (
                            <button type="button" disabled={busy || creating} onClick={() => void handleDetect()} className={WS_ACTION_SECONDARY}>
                                {busy ? "Re-detecting…" : "Re-detect questions"}
                            </button>
                        ) : null}
                        {!created ? (
                            <>
                                <input
                                    ref={addSourceInputRef}
                                    type="file"
                                    accept={processingImportAcceptList()}
                                    className="hidden"
                                    data-testid="processing-add-source-input"
                                    onChange={(e) => void handleAddSource(e.target.files?.[0] ?? null)}
                                />
                                <button
                                    type="button"
                                    disabled={addingSource || packetBusy || busy || creating}
                                    onClick={() => addSourceInputRef.current?.click()}
                                    className={WS_ACTION_SECONDARY}
                                    data-testid="processing-add-source"
                                    title="Attach another document to this case, then analyse them together"
                                >
                                    {addingSource ? "Adding…" : "Add source"}
                                </button>
                            </>
                        ) : null}
                        {!created ? (
                            <button
                                type="button"
                                disabled={packetBusy || busy || creating}
                                onClick={() => void handleAnalyzePacket()}
                                className={WS_ACTION_SECONDARY}
                                data-testid="processing-analyze-packet"
                                title="Analyse every source attached to this case together"
                            >
                                {packetBusy ? "Analysing packet…" : packet ? "Re-analyse packet" : "Analyse as one packet"}
                            </button>
                        ) : null}
                        {created ? (
                            <button
                                type="button"
                                onClick={() => created.form_id && onOpenForm?.(created.form_id, formName.trim() || undefined)}
                                className={WS_ACTION_PRIMARY}
                            >
                                Edit form in Studio
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={activeFieldCount === 0}
                                onClick={() => {
                                    setFormName((cur) => cur.trim() || proposeGeneratedFormName(docTitle));
                                    setPhase("generate");
                                }}
                                className={WS_ACTION_PRIMARY}
                            >
                                Continue to generate
                            </button>
                        )}
                    </div>
                </div>
            </div>
            </div>
            )}
        </div>
    );
}

function SummaryPanel({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-alloy-stone/22 border-l-[3px] border-l-alloy-bend-pine bg-white p-3">
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

