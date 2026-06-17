"use client";

/**
 * POS Processing — Document → Form *template setup* (Workflow A).
 *
 * This is the work/decision surface for a case whose primary source is an uploaded
 * DOCUMENT. A document is NOT a record to commit — it is a form to recreate. So this
 * column replaces the record "Commit / Manual review" flow with guided template setup:
 *
 *   document title → extracted-text status → detected sections/fields → draft preview
 *   → (primary) Create editable form / Open Forms builder
 *   → (fallback) Create blank form from this document   ← never a dead-end at 0 fields
 *   → (secondary) Review extracted text
 *
 * Honest + reuse-only: reads the case's stored `formDraftPreview` / `formDraftCreated`
 * and calls the EXISTING endpoints (`/form-draft` to detect, `/form-draft/create` to
 * make an UNPUBLISHED editable form in the Forms builder). No publish, no records, no
 * matching, no commit, no second forms system.
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

export default function PosTemplateSetupColumn({ state }: { state: PosCaseState }) {
    const { detail, reload } = state;
    const caseId = detail?.id ?? null;

    const [draft, setDraft] = useState<StoredFormDraftPreview | null>(detail?.formDraftPreview ?? null);
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [showText, setShowText] = useState(false);

    // Keep the local draft in sync if the case (or its stored preview) changes underneath us.
    useEffect(() => {
        setDraft(detail?.formDraftPreview ?? null);
        setErr(null);
        setShowText(false);
    }, [detail?.id, detail?.formDraftPreview]);

    if (!detail) return null;

    const primary = detail.sources.find((s) => s.role === "primary") ?? detail.sources[0] ?? null;
    const created = detail.formDraftCreated;
    const builderPath = created ? `/admin/forms/${created.form_id}` : null;

    const docTitle = draft?.title || primary?.display.label || "Untitled document";
    const fieldCount = draft?.diagnostics.field_count ?? null;
    const sectionCount = draft?.diagnostics.section_count ?? null;
    const textLen = draft?.diagnostics.extracted_text_length ?? null;
    const textAvailable = draft ? draft.extracted_text_available : (detail.documentFormPreview?.extracted_text_available ?? null);
    const hasFields = !!draft && (fieldCount ?? 0) > 0;
    const zeroFields = !!draft && (fieldCount ?? 0) === 0;

    // POST /form-draft — detect structure + store the preview (may be 0 fields; that is honest, not an error).
    async function detect(): Promise<StoredFormDraftPreview | null> {
        const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft`, {
            method: "POST",
            credentials: "same-origin",
        });
        const body = (await res.json().catch(() => ({}))) as {
            data?: { form_draft_preview?: StoredFormDraftPreview };
            error?: string;
        };
        if (!res.ok) throw new Error(body.error || `Couldn’t read this document (${res.status})`);
        return body.data?.form_draft_preview ?? null;
    }

    // POST /form-draft/create — turn the stored preview into an UNPUBLISHED editable form, then open the builder.
    async function create(): Promise<void> {
        const res = await fetch(`/api/admin/processing/cases/${caseId}/form-draft/create`, {
            method: "POST",
            credentials: "same-origin",
        });
        const body = (await res.json().catch(() => ({}))) as {
            data?: { form_id?: string; builder_path?: string };
            error?: string;
        };
        if (!res.ok) throw new Error(body.error || `Couldn’t create the form (${res.status})`);
        const path = body.data?.builder_path ?? (body.data?.form_id ? `/admin/forms/${body.data.form_id}` : null);
        if (path) window.location.href = path;
    }

    const handleDetect = async () => {
        setBusy(true);
        setErr(null);
        try {
            const next = await detect();
            setDraft(next);
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

    // Fallback: never dead-end at 0 fields. Ensure a preview exists, then create a blank
    // editable form seeded with this document's title — the operator adds fields in the builder.
    const handleCreateBlank = async () => {
        setCreating(true);
        setErr(null);
        try {
            if (!draft) {
                const next = await detect();
                setDraft(next);
            }
            await create();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn’t create the form");
        } finally {
            setCreating(false);
        }
    };

    const fieldById = (id: string) => draft?.fields.find((f) => f.id === id);

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

                {/* Setup status — extracted text, detected structure, draft preview */}
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
                                {draft ? `${sectionCount ?? 0} section${sectionCount === 1 ? "" : "s"} · ${fieldCount ?? 0} field${fieldCount === 1 ? "" : "s"}` : "Not detected yet"}
                            </dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="w-36 shrink-0 text-stone-500">Draft form</dt>
                            <dd className="min-w-0 flex-1 font-medium text-alloy-midnight">
                                {created
                                    ? "Editable form created (draft)"
                                    : hasFields
                                      ? "Ready to create"
                                      : zeroFields
                                        ? "No fields detected"
                                        : "Not generated"}
                                {draft ? <span className="ml-1 text-[10px] text-stone-400">· {draft.generator_version} · {formatWhen(draft.generated_at)}</span> : null}
                            </dd>
                        </div>
                    </dl>
                </PosPanel>

                {/* Zero-field guidance — never a dead-end (requirement 7) */}
                {zeroFields && !created ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
                        Text was extracted, but no fields were detected. Start with a blank editable form using this
                        document as the source, then add fields in the Forms builder.
                    </div>
                ) : null}

                {/* Draft preview — detected sections + fields (read-only; edits happen in the builder) */}
                {draft && draft.sections.length > 0 ? (
                    <PosPanel eyebrow="Detected fields">
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
                        {draft.warnings.filter((w) => !w.startsWith("text_unavailable:")).length > 0 ? (
                            <ul className="mt-2 list-inside list-disc text-[11.5px] text-amber-700">
                                {draft.warnings
                                    .filter((w) => !w.startsWith("text_unavailable:"))
                                    .map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                            </ul>
                        ) : null}
                    </PosPanel>
                ) : null}

                {/* Review extracted text — what Alloy actually read (explains 0-field results) */}
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
                        Set this document up once: Alloy reads it and detects what it can, you review and tweak the fields in
                        the Forms builder, then save it as a reusable template. Nothing is created or published until you review it.
                    </p>
                ) : null}
            </div>

            {/* Decision area — template setup actions (NOT record commit) */}
            <WorkspaceActionBar eyebrow="Template setup">
                {err ? <div className="mb-2 text-[11px] text-amber-700">{err}</div> : null}

                {created ? (
                    <a href={builderPath ?? "#"} className={`${WS_ACTION_PRIMARY} inline-block w-full text-center`}>
                        Open in Forms builder
                    </a>
                ) : hasFields ? (
                    <button type="button" disabled={creating || busy} onClick={() => void handleCreate()} className={`${WS_ACTION_PRIMARY} w-full`}>
                        {creating ? "Creating…" : "Create editable form"}
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
                {!created ? (
                    <p className="mt-2 text-[10.5px] text-stone-400">
                        Creates an unpublished draft form — nothing is published until you review it in the builder.
                    </p>
                ) : null}
            </WorkspaceActionBar>
        </div>
    );
}
