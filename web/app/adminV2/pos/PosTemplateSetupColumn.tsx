"use client";

/**
 * POS Processing — Document → Form *template setup* (Workflow A), document-anchored.
 *
 * A document is NOT a record to commit — it's a form to recreate. This surface shows the
 * actual PDF beside the detected fields so setup is anchored to the real document:
 *
 *   PDF preview (signed URL)  ·  extracted-text status  ·  detected fields (label / type /
 *   confidence / source reason)  ·  honest quality gate  ·  diagnostics
 *   → (strong)  Create editable form
 *   → (weak)    Low-confidence — review against the PDF, then create or add manually
 *   → (failed)  Create blank form from this document   ← never a dead-end
 *   → Open Forms builder opens in a NEW TAB so the POS case stays in context.
 *
 * Honest + reuse-only: reads the case's stored `formDraftPreview` / `formDraftCreated`,
 * the document signed-URL route, and the EXISTING `/form-draft` + `/form-draft/create`
 * endpoints. No OCR, no AI, no publish, no records, no commit, no second forms system.
 * Detection is text-assisted only — there is no PDF coordinate mapping yet (see warnings).
 */

import { useEffect, useState } from "react";
import type { PosCaseState } from "./usePosCase";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import { POS_SOURCE_KIND_LABELS } from "./posSections";
import PosPanel from "./PosPanel";
import WorkspaceActionBar from "@/components/workspace/WorkspaceActionBar";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY } from "@/components/workspace/workspaceTokens";

function formatWhen(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Human "source reason" for a detected field, from the detector's evidence tag. */
function sourceReason(evidence?: string): string {
    switch (evidence) {
        case "signature line":
            return "signature keyword";
        case "column label":
            return "multi-column layout";
        case "known field label":
            return "known label";
        case "known label (text sweep)":
            return "known label (text)";
        case "bare label":
            return "uppercase / bare label line";
        case "labelled prompt":
            return "label with colon";
        case "underlined blank":
            return "underlined blank";
        case "checkbox option":
        case "checkbox yes/no group":
        case "yes/no question":
            return "checkbox / yes-no";
        case "question prompt":
            return "question";
        case "label above blank line":
            return "label above blank";
        default:
            return evidence || "text";
    }
}

const CONF_PILL: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-stone-100 text-stone-500",
};

interface EditorRow {
    label: string;
    type: string;
    section: string;
}
const DRAFT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "text", label: "Text" },
    { value: "date", label: "Date" },
    { value: "number", label: "Number" },
    { value: "boolean", label: "Checkbox" },
    { value: "signature", label: "Signature" },
    { value: "file_ref", label: "File" },
];

export default function PosTemplateSetupColumn({ state }: { state: PosCaseState }) {
    const { detail, reload } = state;
    const caseId = detail?.id ?? null;

    const [draft, setDraft] = useState<StoredFormDraftPreview | null>(detail?.formDraftPreview ?? null);
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [showText, setShowText] = useState(false);
    const [showPdf, setShowPdf] = useState(true);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfErr, setPdfErr] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [rows, setRows] = useState<EditorRow[]>([]);
    const [savingManual, setSavingManual] = useState(false);

    const primary = detail?.sources.find((s) => s.role === "primary") ?? detail?.sources[0] ?? null;
    const docId = draft?.source_document_id ?? (primary?.kind === "document" ? (primary?.id ?? null) : null);

    // Keep the local draft in sync if the case (or its stored preview) changes underneath us.
    useEffect(() => {
        setDraft(detail?.formDraftPreview ?? null);
        setErr(null);
        setShowText(false);
    }, [detail?.id, detail?.formDraftPreview]);

    // Fetch a time-limited signed URL so we can embed the real PDF in the workspace.
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

    if (!detail) return null;

    const created = detail.formDraftCreated;
    const builderPath = created ? `/admin/forms/${created.form_id}` : null;

    const docTitle = draft?.title || primary?.display.label || "Untitled document";
    const fields = draft?.fields ?? [];
    const fieldCount = draft?.diagnostics.field_count ?? null;
    const sectionCount = draft?.diagnostics.section_count ?? null;
    const textLen = draft?.diagnostics.extracted_text_length ?? null;
    const textAvailable = draft ? draft.extracted_text_available : (detail.documentFormPreview?.extracted_text_available ?? null);

    // Quality gate — honest. The detector's "weak" verdict (sparse/blob extraction) is
    // surfaced in warnings; combine it with field count/confidence so we never claim
    // "Ready to create" for a thin, low-confidence draft.
    const detectorWeak = (draft?.warnings ?? []).some((w) => /weak detection/i.test(w));
    const goodFields = fields.filter((f) => f.confidence !== "low").length;
    const quality: "strong" | "weak" | "failed" = !draft
        ? "failed"
        : fields.length === 0
          ? "failed"
          : fields.length >= 4 && goodFields >= 3 && !detectorWeak
            ? "strong"
            : "weak";
    const hasFields = fields.length > 0;
    const zeroFields = !!draft && fields.length === 0;

    async function detect(): Promise<StoredFormDraftPreview | null> {
        const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft`, { method: "POST", credentials: "same-origin" });
        const body = (await res.json().catch(() => ({}))) as { data?: { form_draft_preview?: StoredFormDraftPreview }; error?: string };
        if (!res.ok) throw new Error(body.error || `Couldn’t read this document (${res.status})`);
        return body.data?.form_draft_preview ?? null;
    }

    // Create the UNPUBLISHED editable form, then open the builder in a NEW TAB so the
    // operator keeps their POS case context (requirement: don't dump to /admin/forms).
    async function create(): Promise<void> {
        const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/create`, { method: "POST", credentials: "same-origin" });
        const body = (await res.json().catch(() => ({}))) as { data?: { form_id?: string; builder_path?: string }; error?: string };
        if (!res.ok) throw new Error(body.error || `Couldn’t create the form (${res.status})`);
        const path = body.data?.builder_path ?? (body.data?.form_id ? `/admin/forms/${body.data.form_id}` : null);
        if (path) window.open(path, "_blank", "noopener,noreferrer");
        await reload(); // reflect the created link; the case stays open in POS
    }

    const handleDetect = async () => {
        setBusy(true);
        setErr(null);
        try {
            setDraft(await detect());
            await reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn’t read this document");
        } finally {
            setBusy(false);
        }
    };

    const handleCreate = async () => {
        setCreating(true);
        setErr(null);
        try {
            await create();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn’t create the form");
        } finally {
            setCreating(false);
        }
    };

    const handleCreateBlank = async () => {
        setCreating(true);
        setErr(null);
        try {
            if (!draft) setDraft(await detect());
            await create();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn’t create the form");
        } finally {
            setCreating(false);
        }
    };

    // --- manual field editor: set up against the PDF when text detection is weak ---
    const openEditor = () => {
        const seeded: EditorRow[] = [];
        for (const s of draft?.sections ?? []) {
            for (const fid of s.field_ids) {
                const f = fields.find((x) => x.id === fid);
                if (f) seeded.push({ label: f.label, type: f.type, section: s.title });
            }
        }
        setRows(seeded.length ? seeded : [{ label: "", type: "text", section: "Form fields" }]);
        setEditing(true);
        setErr(null);
    };
    const updateRow = (i: number, patch: Partial<EditorRow>) =>
        setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    const addRow = () => setRows((rs) => [...rs, { label: "", type: "text", section: rs[rs.length - 1]?.section ?? "Form fields" }]);
    const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

    // Persist the reviewed list, then create the editable form from it.
    const handleSaveAndCreate = async () => {
        const clean = rows.filter((r) => r.label.trim().length > 0);
        if (clean.length === 0) {
            setErr("Add at least one field with a label.");
            return;
        }
        setSavingManual(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/save`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ title: draft?.title || docTitle, fields: clean }),
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(body.error || `Couldn’t save fields (${res.status})`);
            await create(); // existing path: builds the form, opens builder in a new tab, reloads
            setEditing(false);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn’t save fields");
        } finally {
            setSavingManual(false);
        }
    };

    const fieldById = (id: string) => fields.find((f) => f.id === id);

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {/* Header — document identity + intent */}
                <div className="rounded-lg border border-l-2 border-alloy-juniper border-alloy-stone/15 bg-emerald-50/50 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-alloy-midnight">{docTitle}</span>
                        <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10.5px] font-medium text-emerald-800">
                            Template setup
                        </span>
                    </div>
                    <div className="mt-1 text-[11px] text-stone-600">
                        {POS_SOURCE_KIND_LABELS[primary?.kind ?? ""] ?? "Document"} · recreate this document as a reusable form
                    </div>
                </div>

                {/* PDF preview — anchor setup to the real document */}
                <PosPanel
                    eyebrow="Source PDF"
                    accent={false}
                    right={
                        <button
                            type="button"
                            onClick={() => setShowPdf((v) => !v)}
                            className="text-[10.5px] font-medium text-alloy-juniper hover:underline"
                        >
                            {showPdf ? "Hide" : "Show"}
                        </button>
                    }
                >
                    {!showPdf ? (
                        <div className="text-[11.5px] text-stone-400">Preview hidden.</div>
                    ) : pdfUrl ? (
                        <object data={pdfUrl} type="application/pdf" className="h-[26rem] w-full rounded-md border border-stone-200">
                            <iframe src={pdfUrl} title="Source PDF" className="h-[26rem] w-full rounded-md border border-stone-200" />
                            <div className="p-2 text-[11.5px] text-stone-500">
                                Inline preview unavailable.{" "}
                                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-alloy-juniper underline">
                                    Open the PDF
                                </a>
                            </div>
                        </object>
                    ) : pdfErr ? (
                        <div className="text-[11.5px] text-stone-400">{pdfErr}</div>
                    ) : docId ? (
                        <div className="h-[26rem] w-full animate-pulse rounded-md bg-stone-100" />
                    ) : (
                        <div className="text-[11.5px] text-stone-400">No source document on this case.</div>
                    )}
                </PosPanel>

                {/* Setup status — extracted text, detected structure, draft quality */}
                <PosPanel eyebrow="Setup status" accent={false}>
                    <dl className="space-y-1.5 text-[12.5px]">
                        <div className="flex gap-2">
                            <dt className="w-36 shrink-0 text-stone-500">Extracted text</dt>
                            <dd className="min-w-0 flex-1 font-medium text-alloy-midnight">
                                {textAvailable === null
                                    ? "Not read yet"
                                    : textAvailable
                                      ? `${textLen ?? "—"} characters`
                                      : "Unavailable (scanned / image-only PDF)"}
                            </dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="w-36 shrink-0 text-stone-500">Detected structure</dt>
                            <dd className="min-w-0 flex-1 font-medium text-alloy-midnight">
                                {draft
                                    ? `${sectionCount ?? 0} section${sectionCount === 1 ? "" : "s"} · ${fieldCount ?? 0} field${fieldCount === 1 ? "" : "s"}`
                                    : "Not detected yet"}
                            </dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="w-36 shrink-0 text-stone-500">Draft quality</dt>
                            <dd className="min-w-0 flex-1 font-medium">
                                {created ? (
                                    <span className="text-emerald-700">Editable form created (draft)</span>
                                ) : quality === "strong" ? (
                                    <span className="text-emerald-700">Ready to create</span>
                                ) : quality === "weak" ? (
                                    <span className="text-amber-700">Low confidence — review against the PDF</span>
                                ) : draft ? (
                                    <span className="text-stone-500">No fields detected</span>
                                ) : (
                                    <span className="text-stone-400">Not generated</span>
                                )}
                                {draft ? (
                                    <span className="ml-1 text-[10px] text-stone-400">
                                        · {draft.generator_version} · {formatWhen(draft.generated_at)}
                                    </span>
                                ) : null}
                            </dd>
                        </div>
                    </dl>
                </PosPanel>

                {/* Quality messaging — explicit and honest */}
                {!created && !editing && (quality === "weak" || zeroFields) ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
                        <div className="font-medium">PDF preview available. Text extraction is weak. Add fields from the PDF.</div>
                        <p className="mt-1 text-[11.5px]">
                            {zeroFields
                                ? "No fields were detected from the text. "
                                : `Only ${fields.length} ${goodFields >= 3 ? "" : "low-confidence "}field${fields.length === 1 ? "" : "s"} ${fields.length === 1 ? "was" : "were"} detected. `}
                            This is a text-assisted draft, not exact PDF mapping — review against the PDF above and build the field
                            list yourself, then create the template.
                        </p>
                        <button type="button" onClick={openEditor} className={`${WS_ACTION_PRIMARY} mt-2`}>
                            Add / review fields from the PDF
                        </button>
                    </div>
                ) : null}

                {/* Manual field editor — operator builds the reviewed field list against the PDF */}
                {editing ? (
                    <PosPanel
                        eyebrow="Review & edit fields"
                        right={
                            <button type="button" onClick={() => setEditing(false)} className="text-[10.5px] font-medium text-stone-500 hover:underline">
                                Cancel
                            </button>
                        }
                    >
                        <div className="space-y-2">
                            {rows.map((r, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <input
                                        value={r.label}
                                        onChange={(e) => updateRow(i, { label: e.target.value })}
                                        placeholder="Field label (e.g. Child's Name)"
                                        className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-[12px] text-alloy-midnight focus:border-alloy-juniper focus:outline-none"
                                    />
                                    <select
                                        value={r.type}
                                        onChange={(e) => updateRow(i, { type: e.target.value })}
                                        className="shrink-0 rounded-md border border-stone-300 px-1.5 py-1 text-[11.5px] text-stone-700"
                                    >
                                        {DRAFT_TYPE_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        value={r.section}
                                        onChange={(e) => updateRow(i, { section: e.target.value })}
                                        placeholder="Section"
                                        className="w-24 shrink-0 rounded-md border border-stone-300 px-2 py-1 text-[11.5px] text-stone-600 focus:border-alloy-juniper focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeRow(i)}
                                        aria-label="Remove field"
                                        className="shrink-0 rounded-md border border-stone-200 px-1.5 py-1 text-[11px] text-stone-400 hover:text-amber-700"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            <button type="button" onClick={addRow} className={WS_ACTION_SECONDARY}>
                                + Add field
                            </button>
                            <button
                                type="button"
                                disabled={savingManual || creating}
                                onClick={() => void handleSaveAndCreate()}
                                className={WS_ACTION_PRIMARY}
                            >
                                {savingManual || creating ? "Creating…" : "Create form from these fields"}
                            </button>
                        </div>
                        <p className="mt-1.5 text-[10.5px] text-stone-400">
                            Creates an unpublished draft form from exactly these fields — opens in a new tab, the case stays here.
                        </p>
                    </PosPanel>
                ) : null}

                {/* Detected fields — label / type / confidence / source reason */}
                {draft && draft.sections.length > 0 ? (
                    <PosPanel eyebrow="Detected fields">
                        <div className="space-y-2.5">
                            {draft.sections.map((s) => (
                                <div key={s.id} className="rounded-md border border-stone-200 p-2.5">
                                    <div className="mb-1 text-[12.5px] font-medium text-stone-800">{s.title}</div>
                                    <ul className="space-y-1">
                                        {s.field_ids.map((fid) => {
                                            const f = fieldById(fid);
                                            if (!f) return null;
                                            return (
                                                <li key={fid} className="text-[12px] text-stone-600">
                                                    <div className="flex items-center gap-2">
                                                        <span className="min-w-0 flex-1 truncate text-alloy-midnight">{f.label}</span>
                                                        {f.required ? <span className="text-[10px] text-amber-700">required</span> : null}
                                                        <span className="rounded bg-stone-100 px-1 py-0.5 text-[9.5px] text-stone-500">{f.type}</span>
                                                        <span className={`rounded px-1 py-0.5 text-[9.5px] ${CONF_PILL[f.confidence] ?? "bg-stone-100 text-stone-500"}`}>
                                                            {f.confidence}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-stone-400">detected from {sourceReason(f.evidence)}</div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                        {draft.warnings.filter((w) => !w.startsWith("text_unavailable:")).length > 0 ? (
                            <ul className="mt-2 list-inside list-disc text-[11px] text-stone-500">
                                {draft.warnings
                                    .filter((w) => !w.startsWith("text_unavailable:"))
                                    .map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                            </ul>
                        ) : null}
                    </PosPanel>
                ) : null}

                {/* Review extracted text — what Alloy actually read */}
                {draft && (showText || zeroFields) ? (
                    <PosPanel eyebrow="Extracted text" accent={false}>
                        {draft.diagnostics.extracted_text_preview ? (
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-stone-600">
                                {draft.diagnostics.extracted_text_preview}
                            </pre>
                        ) : (
                            <div className="text-[11.5px] text-stone-400">No extracted text to show.</div>
                        )}
                    </PosPanel>
                ) : null}

                {!draft ? (
                    <p className="px-1 text-[12px] text-stone-500">
                        Set this document up once: Alloy reads it and detects what it can, you review the fields against the PDF
                        and tweak them in the Forms builder, then save it as a reusable template. Nothing is created or published
                        until you review it.
                    </p>
                ) : null}
            </div>

            {/* Decision area — template setup actions (NOT record commit) */}
            <WorkspaceActionBar eyebrow="Template setup">
                {err ? <div className="mb-2 text-[11px] text-amber-700">{err}</div> : null}

                {created ? (
                    <a
                        href={builderPath ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${WS_ACTION_PRIMARY} inline-block w-full text-center`}
                    >
                        Open in Forms builder ↗
                    </a>
                ) : hasFields ? (
                    <button type="button" disabled={creating || busy} onClick={() => void handleCreate()} className={`${WS_ACTION_PRIMARY} w-full`}>
                        {creating ? "Creating…" : quality === "strong" ? "Create editable form" : "Create editable form (review first)"}
                    </button>
                ) : zeroFields ? (
                    <button type="button" disabled={creating || busy} onClick={() => void handleCreateBlank()} className={`${WS_ACTION_PRIMARY} w-full`}>
                        {creating ? "Creating…" : "Create blank form from document"}
                    </button>
                ) : (
                    <button type="button" disabled={busy || creating} onClick={() => void handleDetect()} className={`${WS_ACTION_PRIMARY} w-full`}>
                        {busy ? "Reading document…" : "Set up this document"}
                    </button>
                )}

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {!created && draft && !editing ? (
                        <button type="button" disabled={busy || creating} onClick={openEditor} className={WS_ACTION_SECONDARY}>
                            Edit fields
                        </button>
                    ) : null}
                    {!created && draft ? (
                        <button type="button" disabled={busy || creating} onClick={() => void handleDetect()} className={WS_ACTION_SECONDARY}>
                            {busy ? "Re-reading…" : "Re-detect fields"}
                        </button>
                    ) : null}
                    {draft ? (
                        <button type="button" onClick={() => setShowText((v) => !v)} className={WS_ACTION_SECONDARY}>
                            {showText ? "Hide extracted text" : "Review extracted text"}
                        </button>
                    ) : null}
                </div>
                {created ? (
                    <p className="mt-2 text-[10.5px] text-emerald-700">Opened in a new tab — this case stays here in POS.</p>
                ) : (
                    <p className="mt-2 text-[10.5px] text-stone-400">
                        Creates an unpublished draft form (opens in a new tab) — text-assisted, no exact PDF mapping yet. Nothing is
                        published until you review it.
                    </p>
                )}
            </WorkspaceActionBar>
        </div>
    );
}
