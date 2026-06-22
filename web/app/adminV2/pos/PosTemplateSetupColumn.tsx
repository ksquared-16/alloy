"use client";

/**
 * POS Processing — Document → Form *template setup*, converged into a SINGLE review
 * workspace (Source PDF ↔ Form Definition):
 *
 *   ┌ status strip (setup status · extracted text · structure · source · quality) ┐
 *   ├ LEFT: source PDF preview (actual PDF) + highlighted detected fields ──────────┤
 *   ├ RIGHT: Review detected fields — tabs [ Fields | Extracted text ] ─────────────┤
 *   └ Create form from these fields (reviewed list; PDF provenance preserved) ───────┘
 *
 * Field rows ↔ PDF highlights stay in sync (click either to select). Fields are edited /
 * added / removed in place; manual fields are flagged "Not mapped to PDF". Create uses
 * the reviewed list (preserving pdf_field_name / page / bbox) and then jumps to POS →
 * Forms with the new form selected — never /admin/forms, never leaving the modal.
 *
 * Reuse-only: `/form-draft` (detect), `/form-draft/save` (reviewed list), `/form-draft/
 * create`, the signed-URL + extracted-text routes. No OCR, no AI, no commit.
 *
 * Feasibility note: the browser's native PDF viewer is an opaque embed, so we can't draw
 * reliable <div> overlays on it. The highlight layer is therefore an SVG schematic built
 * from the AcroForm page+bbox (a faithful, clickable map); the actual PDF is one toggle
 * away in the same pane. True raster overlay needs page rasterization (follow-up).
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pencil, Trash2, Plus, Download } from "lucide-react";
import type { PosCaseState } from "./usePosCase";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import { computePageMaps, type FieldWithRegion } from "@/lib/pos/processingCase/structure/pdfFieldMap";
import PosPdfFieldMap from "./PosPdfFieldMap";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";

function formatWhen(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function sourceReason(evidence?: string): string {
    switch (evidence) {
        case "pdf_field":
            return "from PDF field";
        case "operator":
            return "added manually";
        case "known field label":
        case "known label (text sweep)":
            return "from known label";
        case "column label":
            return "from PDF layout";
        case "signature line":
            return "from signature keyword";
        default:
            return evidence ? "from text" : "from text";
    }
}

const CONF_PILL: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-stone-100 text-stone-500",
};

const TYPE_LABEL: Record<string, string> = {
    text: "Text",
    date: "Date",
    number: "Number",
    boolean: "Checkbox (Yes/No)",
    signature: "Signature",
    file_ref: "File",
};
const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));

interface ReviewField {
    id: string;
    label: string;
    type: string;
    section: string;
    required?: boolean;
    confidence?: string;
    evidence?: string;
    pdf_field_name?: string;
    page?: number;
    bbox?: [number, number, number, number];
}

/** Build the editable reviewed list from the stored draft, preserving provenance. */
function seedReviewFields(draft: StoredFormDraftPreview | null): ReviewField[] {
    if (!draft) return [];
    const out: ReviewField[] = [];
    for (const s of draft.sections) {
        for (const fid of s.field_ids) {
            const f = draft.fields.find((x) => x.id === fid);
            if (!f) continue;
            out.push({
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
            });
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
    const [reviewFields, setReviewFields] = useState<ReviewField[]>(() => seedReviewFields(detail?.formDraftPreview ?? null));
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfErr, setPdfErr] = useState<string | null>(null);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
    const [tab, setTab] = useState<"fields" | "text">("fields");
    const [leftView, setLeftView] = useState<"highlights" | "pdf">("highlights");
    const [fullText, setFullText] = useState<string | null>(null);
    const [textQuery, setTextQuery] = useState("");

    const primary = detail?.sources.find((s) => s.role === "primary") ?? detail?.sources[0] ?? null;
    const docId = draft?.source_document_id ?? (primary?.kind === "document" ? (primary?.id ?? null) : null);

    // Re-seed the reviewed list when the stored draft changes (detect / save / case switch).
    useEffect(() => {
        const next = detail?.formDraftPreview ?? null;
        setDraft(next);
        setReviewFields(seedReviewFields(next));
        setErr(null);
        setSelectedFieldId(null);
        setEditingFieldId(null);
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

    const pageMaps = useMemo(() => computePageMaps(reviewFields as FieldWithRegion[]), [reviewFields]);

    if (!detail) return null;

    const created = detail.formDraftCreated;
    const docTitle = draft?.title || primary?.display.label || "Untitled document";
    const textLen = draft?.diagnostics.extracted_text_length ?? null;
    const textAvailable = draft ? draft.extracted_text_available : (detail.documentFormPreview?.extracted_text_available ?? null);
    const sectionCount = new Set(reviewFields.map((f) => f.section)).size;

    const detectorWeak = (draft?.warnings ?? []).some((w) => /weak detection/i.test(w));
    const goodFields = reviewFields.filter((f) => f.confidence !== "low").length;
    const quality: "strong" | "weak" | "failed" = !draft
        ? "failed"
        : reviewFields.length === 0
          ? "failed"
          : reviewFields.length >= 4 && goodFields >= 3 && !detectorWeak
            ? "strong"
            : "weak";
    const hasRegions = pageMaps.some((p) => p.rects.length > 0);

    // ---- field-list editing ----
    const updateField = (id: string, patch: Partial<ReviewField>) =>
        setReviewFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const removeField = (id: string) => {
        setReviewFields((fs) => fs.filter((f) => f.id !== id));
        if (selectedFieldId === id) setSelectedFieldId(null);
        if (editingFieldId === id) setEditingFieldId(null);
    };
    const addField = () => {
        const id = `new_${Date.now().toString(36)}`;
        const section = reviewFields[reviewFields.length - 1]?.section ?? "Form fields";
        setReviewFields((fs) => [...fs, { id, label: "", type: "text", section, evidence: "operator", confidence: "high" }]);
        setSelectedFieldId(id);
        setEditingFieldId(id);
    };

    // ---- endpoints ----
    async function detectDoc(): Promise<StoredFormDraftPreview | null> {
        const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft`, { method: "POST", credentials: "same-origin" });
        const body = (await res.json().catch(() => ({}))) as { data?: { form_draft_preview?: StoredFormDraftPreview }; error?: string };
        if (!res.ok) throw new Error(body.error || `Couldn’t read this document (${res.status})`);
        return body.data?.form_draft_preview ?? null;
    }

    const handleDetect = async () => {
        setBusy(true);
        setErr(null);
        try {
            const next = await detectDoc();
            setDraft(next);
            setReviewFields(seedReviewFields(next));
            await reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn’t read this document");
        } finally {
            setBusy(false);
        }
    };

    // Create from the REVIEWED list (preserving PDF provenance), then jump to POS → Forms.
    const handleCreate = async () => {
        const clean = reviewFields.filter((f) => f.label.trim().length > 0);
        if (clean.length === 0) {
            setErr("Add at least one field before creating the form.");
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
                    fields: clean.map((f) => ({
                        label: f.label,
                        type: f.type,
                        required: f.required,
                        section: f.section,
                        pdf_field_name: f.pdf_field_name,
                        page: f.page,
                        bbox: f.bbox,
                    })),
                }),
            });
            const saveBody = (await saveRes.json().catch(() => ({}))) as { error?: string };
            if (!saveRes.ok) throw new Error(saveBody.error || `Couldn’t save fields (${saveRes.status})`);

            const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/create`, { method: "POST", credentials: "same-origin" });
            const body = (await res.json().catch(() => ({}))) as { data?: { form_id?: string }; error?: string };
            if (!res.ok) throw new Error(body.error || `Couldn’t create the form (${res.status})`);
            await reload();
            const formId = body.data?.form_id ?? null;
            if (formId && onOpenForm) onOpenForm(formId);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn’t create the form");
        } finally {
            setCreating(false);
        }
    };

    // ---- no draft yet: simple set-up prompt ----
    if (!draft) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center bg-white p-6 text-center">
                <div className="max-w-sm">
                    <div className="text-[14px] font-semibold text-alloy-midnight">{docTitle}</div>
                    <p className="mt-1 text-[12px] text-stone-500">
                        Set this document up once: Alloy reads the PDF’s form fields, you review them against the document, then
                        create a reusable template. Nothing is created or published until you review it.
                    </p>
                    {err ? <div className="mt-2 text-[11px] text-amber-700">{err}</div> : null}
                    <button type="button" disabled={busy} onClick={() => void handleDetect()} className={`${WS_ACTION_PRIMARY} mt-3`}>
                        {busy ? "Reading document…" : "Set up this document"}
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
            {/* Status strip */}
            <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1.5 border-b border-alloy-stone/12 px-4 py-2.5 sm:grid-cols-5">
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
                    {sectionCount} section{sectionCount === 1 ? "" : "s"} · {reviewFields.length} field{reviewFields.length === 1 ? "" : "s"}
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

            {/* Two-pane review — PDF ↔ field definition, both visible, independent scroll */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
                {/* LEFT — source PDF preview + highlights */}
                <div className="flex min-w-0 flex-1 flex-col border-r border-alloy-stone/12">
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/10 px-3 py-1.5">
                        <span className="text-[11px] font-semibold text-alloy-midnight">Source PDF preview</span>
                        <div className="flex items-center gap-2">
                            <div className="flex overflow-hidden rounded-md border border-stone-200">
                                {(["highlights", "pdf"] as const).map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setLeftView(v)}
                                        className={`px-2 py-0.5 text-[10.5px] font-medium capitalize ${
                                            leftView === v ? "bg-[#00A283] text-white" : "bg-white text-stone-500 hover:bg-stone-50"
                                        }`}
                                    >
                                        {v === "pdf" ? "PDF" : "Highlights"}
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
                                    <PosPdfFieldMap pages={pageMaps} selectedId={selectedFieldId} onSelect={setSelectedFieldId} />
                                    <div className="mt-2 flex items-center gap-3 text-[10px] text-stone-500">
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block h-2.5 w-3 rounded-sm border border-[#9bbcb3] bg-[#00A283]/15" /> Detected field
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="inline-block h-2.5 w-3 rounded-sm border-2 border-[#00A283] bg-[#00A283]/30" /> Selected
                                        </span>
                                        <span className="ml-auto text-stone-400">Click a field or row to select</span>
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-md border border-dashed border-stone-300 bg-white p-4 text-center text-[11.5px] text-stone-400">
                                    No PDF field highlights — this draft came from text. Switch to PDF to view the document, and add
                                    fields on the right.
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

                {/* RIGHT — review detected fields, tabbed */}
                <div className="flex w-[22rem] shrink-0 flex-col">
                    <div className="shrink-0 border-b border-alloy-stone/10 px-3 pt-2">
                        <div className="text-[12.5px] font-semibold text-alloy-midnight">Review detected fields</div>
                        <p className="mt-0.5 text-[10.5px] text-stone-500">Highlighted fields were detected from the source PDF.</p>
                        <div className="mt-1.5 flex gap-3">
                            {(["fields", "text"] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTab(t)}
                                    className={`border-b-2 px-0.5 pb-1.5 text-[12px] font-medium ${
                                        tab === t ? "border-alloy-juniper text-alloy-juniper" : "border-transparent text-stone-500 hover:text-alloy-midnight"
                                    }`}
                                >
                                    {t === "fields" ? "Fields" : "Extracted text"}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {tab === "fields" ? (
                            <>
                                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                                    {reviewFields.length} field{reviewFields.length === 1 ? "" : "s"}
                                </div>
                                <ol className="space-y-1.5">
                                    {reviewFields.map((f, i) => {
                                        const sel = selectedFieldId === f.id;
                                        const isEditing = editingFieldId === f.id;
                                        const mapped = typeof f.page === "number" && Array.isArray(f.bbox);
                                        return (
                                            <li
                                                key={f.id}
                                                className={`rounded-md border ${sel ? "border-alloy-juniper bg-emerald-50/60" : "border-stone-200 bg-white"}`}
                                            >
                                                <div className="flex items-start gap-2 px-2 py-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedFieldId(sel ? null : f.id)}
                                                        className="flex min-w-0 flex-1 items-start gap-2 text-left"
                                                    >
                                                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-500">
                                                            {i + 1}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-[12px] font-medium text-alloy-midnight">
                                                                {f.label || <span className="text-stone-400">Untitled field</span>}
                                                            </span>
                                                            <span className="block text-[10px] text-stone-400">
                                                                {TYPE_LABEL[f.type] ?? f.type} · {mapped ? sourceReason(f.evidence) : "Not mapped to PDF"}
                                                            </span>
                                                        </span>
                                                    </button>
                                                    {f.confidence ? (
                                                        <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${CONF_PILL[f.confidence] ?? "bg-stone-100 text-stone-500"}`}>
                                                            {f.confidence === "high" ? "High" : f.confidence === "medium" ? "Med" : "Low"}
                                                        </span>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        aria-label="Edit field"
                                                        onClick={() => {
                                                            setEditingFieldId(isEditing ? null : f.id);
                                                            setSelectedFieldId(f.id);
                                                        }}
                                                        className="shrink-0 text-stone-400 hover:text-alloy-juniper"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label="Delete field"
                                                        onClick={() => removeField(f.id)}
                                                        className="shrink-0 text-stone-400 hover:text-amber-700"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                    </button>
                                                </div>
                                                {isEditing ? (
                                                    <div className="space-y-1.5 border-t border-stone-100 px-2 py-2">
                                                        <input
                                                            value={f.label}
                                                            onChange={(e) => updateField(f.id, { label: e.target.value })}
                                                            placeholder="Field label"
                                                            className="w-full rounded-md border border-stone-300 px-2 py-1 text-[12px] text-alloy-midnight focus:border-alloy-juniper focus:outline-none"
                                                        />
                                                        <div className="flex gap-1.5">
                                                            <select
                                                                value={f.type}
                                                                onChange={(e) => updateField(f.id, { type: e.target.value })}
                                                                className="flex-1 rounded-md border border-stone-300 px-1.5 py-1 text-[11.5px] text-stone-700"
                                                            >
                                                                {TYPE_OPTIONS.map((o) => (
                                                                    <option key={o.value} value={o.value}>
                                                                        {o.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <input
                                                                value={f.section}
                                                                onChange={(e) => updateField(f.id, { section: e.target.value })}
                                                                placeholder="Section"
                                                                className="w-28 rounded-md border border-stone-300 px-2 py-1 text-[11.5px] text-stone-600 focus:border-alloy-juniper focus:outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                </ol>
                                <button type="button" onClick={addField} className="mt-2 inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-[11.5px] font-medium text-stone-600 hover:bg-stone-50">
                                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add field
                                </button>
                                <p className="mt-2 text-[10px] text-stone-400">
                                    Fields without a highlighted area can still be captured, but won’t yet map back to the official PDF.
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

            {/* Create bar */}
            <div className="shrink-0 border-t border-alloy-stone/12 bg-white px-3 py-2.5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-alloy-juniper/80">Template setup</div>
                {err ? <div className="mb-2 text-[11px] text-amber-700">{err}</div> : null}
                {created ? (
                    <button type="button" onClick={() => created.form_id && onOpenForm?.(created.form_id)} className={`${WS_ACTION_PRIMARY} w-full`}>
                        Open in Forms builder
                    </button>
                ) : (
                    <button type="button" disabled={creating || busy || reviewFields.filter((f) => f.label.trim()).length === 0} onClick={() => void handleCreate()} className={`${WS_ACTION_PRIMARY} w-full`}>
                        {creating ? "Creating…" : "Create form from these fields"}
                    </button>
                )}
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {!created ? (
                        <button type="button" disabled={busy || creating} onClick={() => void handleDetect()} className={WS_ACTION_SECONDARY}>
                            {busy ? "Re-reading…" : "Re-detect fields"}
                        </button>
                    ) : null}
                    <button type="button" onClick={() => setTab("text")} className={WS_ACTION_SECONDARY}>
                        Review extracted text
                    </button>
                </div>
                {created ? (
                    <p className="mt-2 text-[10.5px] text-emerald-700">Form created — opens in POS → Forms; this case stays here.</p>
                ) : (
                    <p className="mt-2 text-[10.5px] text-stone-400">
                        Creates an unpublished draft form from the reviewed fields (PDF mapping preserved) and opens it in POS → Forms.
                    </p>
                )}
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
