"use client";

import { FileText, FolderTree, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DocumentCategory, DocumentTypeSummary, DocumentTypeVersion } from "@/lib/documents/configuration/documentConfigurationService";
import {
    DOCUMENT_TYPE_FORMATS,
    documentTypeDraftProblems,
    POLICY_ENFORCEMENT,
    REPLACEMENT_POLICIES,
    VALIDITY_EVENTS,
    VALIDITY_KINDS,
    VALIDITY_UNITS,
    type DocumentTypeDraft,
    type PolicyProblem,
    type ValidityPolicy,
} from "@/lib/documents/configuration/documentTypePolicy";
import { DECLARED_DOCUMENT_SENSITIVITIES, type DeclaredDocumentSensitivity } from "@/lib/documents/documentSensitivity";
import { DOCUMENT_SUBJECT_TYPES, type DocumentSubjectType } from "@/lib/documents/documentSubjects";

import { documentStudioApi, useDocumentStudioLibrary } from "./useDocumentStudioApi";

/**
 * Studio → Documents (D3). The organization's document categories and types.
 *
 * Categories are vocabulary and save immediately. Types are versioned: edits go to a draft, the server validates it,
 * and only a published version is live. The Studio shows where each policy field is ENFORCED today (sensitivity for new
 * documents; subjects, formats and review on filing and upload; replacement on filing and replacement — D5) and which
 * are only DECLARED (validity, D7) — an unimplemented rule is never presented as active.
 *
 * Every action is a server route gated by `processing.documents.manage` (reads: `documents.read`). Hiding a control is
 * not the boundary; a refused write surfaces the server's code.
 */

const SENSITIVITY_LABEL: Record<DeclaredDocumentSensitivity, string> = {
    standard: "Standard",
    personal_identity: "Personal identity",
    medical: "Medical",
    custody_safeguarding: "Custody / safeguarding",
    restricted: "Restricted",
};
const SUBJECT_LABEL: Record<DocumentSubjectType, string> = {
    household: "Household",
    person: "Person (parent, staff)",
    child: "Child",
    opportunity: "Opportunity / case",
    vendor: "Vendor",
    processing_case: "Processing case",
    form_submission: "Form submission",
};
const VALIDITY_LABEL: Record<(typeof VALIDITY_KINDS)[number], string> = {
    none: "No expiration",
    explicit_date: "Expires on a date recorded with the document",
    duration: "Valid for a set duration",
    periodic_reconfirmation: "Reconfirm periodically",
    event_renewal: "Renew on an event",
};
const PROBLEM_TEXT: Record<string, string> = {
    label_required: "Give the type a name.",
    category_required: "Choose a category.",
    category_not_active: "The category is archived or not found.",
    subject_types_required: "Choose at least one subject.",
    allowed_formats_required: "Allow at least one file format.",
    medical_type_floor: "This is a medical type; it cannot be published below Medical.",
    sensitivity_lowering: "A revision cannot lower the published sensitivity.",
    validity_value_range: "Enter a whole number from 1 to 120.",
    validity_unit_unknown: "Choose days, months or years.",
    validity_event_unsupported: "Choose a supported event.",
    warning_days_order: "Warnings are whole days from 365 down to 1, largest first.",
    warning_days_shape: "Up to five warnings.",
    warning_without_expiry: "Warnings need an expiring policy.",
};
const ENFORCEMENT_LABEL: Record<string, string> = {
    enforced: "Enforced for new documents",
    enforced_filing: "Enforced when a document is filed or uploaded",
    enforced_replacement: "Enforced when a document is filed or replaced",
    declared_d7: "Declared — enforced from D7",
};

const EMPTY_DRAFT: DocumentTypeDraft = {
    label: "",
    description: null,
    category_id: null,
    subject_types: ["child"],
    allowed_formats: ["pdf"],
    default_sensitivity: "standard",
    review_required: false,
    replacement_policy: "new_version",
    validity_policy: { kind: "none" },
};

function draftFrom(v: DocumentTypeVersion | null | undefined): DocumentTypeDraft {
    if (!v) return { ...EMPTY_DRAFT };
    return {
        label: v.label,
        description: v.description ?? null,
        category_id: v.category_id,
        subject_types: [...v.subject_types],
        allowed_formats: [...v.allowed_formats],
        default_sensitivity: v.default_sensitivity,
        review_required: v.review_required,
        replacement_policy: v.replacement_policy,
        validity_policy: { ...(v.validity_policy as ValidityPolicy) },
    };
}

const INPUT = "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-[13px] shadow-sm focus:border-alloy-bend-pine/40 focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/15";
const BTN = "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/70 disabled:opacity-50";
const PRIMARY = "rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50";

export default function ProcessingDocumentsStudio() {
    const lib = useDocumentStudioLibrary();
    const [section, setSection] = useState<"types" | "categories">("types");
    const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" data-testid="processing-documents-studio">
            <div className="flex shrink-0 items-center gap-2 border-b border-alloy-stone/12 px-5 py-3">
                {(["types", "categories"] as const).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => {
                            setSection(s);
                            setSelectedTypeId(null);
                            setCreating(false);
                        }}
                        className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${section === s ? "bg-alloy-bend-pine/10 text-alloy-bend-pine" : "text-alloy-midnight/55"}`}
                        data-testid={`documents-studio-section-${s}`}
                    >
                        {s === "types" ? "Document types" : "Categories"}
                    </button>
                ))}
            </div>
            {lib.error ? (
                <div className="m-6 rounded-xl border border-alloy-stone/20 p-6 text-center" role="alert">
                    <p className="text-[13px] font-medium text-alloy-midnight/75">Couldn&apos;t load the document configuration</p>
                    <p className="mt-1 text-[12px] text-alloy-midnight/50">{lib.error}</p>
                    <button type="button" className={`mt-4 ${BTN}`} onClick={() => void lib.reload()}>
                        Retry
                    </button>
                </div>
            ) : section === "categories" ? (
                <CategoryLibrary categories={lib.categories} types={lib.types} onChanged={lib.reload} />
            ) : selectedTypeId || creating ? (
                <TypeEditor
                    typeId={selectedTypeId}
                    categories={lib.categories}
                    onClose={() => {
                        setSelectedTypeId(null);
                        setCreating(false);
                        void lib.reload();
                    }}
                    onCreated={(id) => {
                        setCreating(false);
                        setSelectedTypeId(id);
                    }}
                />
            ) : (
                <TypeLibrary types={lib.types} categories={lib.categories} loading={lib.loading} onSelect={setSelectedTypeId} onCreate={() => setCreating(true)} />
            )}
        </div>
    );
}

function TypeLibrary({
    types,
    categories,
    loading,
    onSelect,
    onCreate,
}: {
    types: DocumentTypeSummary[];
    categories: DocumentCategory[];
    loading: boolean;
    onSelect: (id: string) => void;
    onCreate: () => void;
}) {
    const [search, setSearch] = useState("");
    const catLabel = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories]);
    const q = search.trim().toLowerCase();
    const rows = types.filter((t) => !q || t.key.includes(q) || (t.published?.label ?? t.open_draft?.label ?? "").toLowerCase().includes(q));
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 px-5 py-3">
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search document types…" className={`max-w-md ${INPUT}`} data-testid="documents-studio-search" />
                <button type="button" onClick={onCreate} className={`ml-auto inline-flex items-center gap-1 ${PRIMARY}`} data-testid="documents-studio-new-type">
                    <Plus className="h-3.5 w-3.5" aria-hidden /> New type
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
                {loading ? (
                    <p className="text-[12px] text-alloy-midnight/45" aria-busy="true">
                        Loading…
                    </p>
                ) : rows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-alloy-stone/25 p-8 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/70">{types.length === 0 ? "No document types yet" : "No types match your search"}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                        {rows.map((t) => {
                            const v = t.published ?? t.open_draft;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => onSelect(t.id)}
                                    className="relative overflow-hidden rounded-xl border border-alloy-stone/15 bg-white p-4 text-left shadow-[0_2px_12px_rgba(15,23,42,0.05)]"
                                    data-testid={`documents-studio-type-${t.key}`}
                                >
                                    <span className={`absolute inset-y-0 left-0 w-1 ${t.status === "active" ? "bg-alloy-bend-pine" : "bg-alloy-stone/25"}`} aria-hidden />
                                    <div className="flex items-start gap-3 pl-2">
                                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-alloy-bend-pine" aria-hidden />
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-[14px] font-semibold text-alloy-midnight">{v?.label ?? t.key}</h4>
                                            <p className="text-[11px] text-alloy-midnight/45">
                                                {t.key} · {v?.category_id ? catLabel.get(v.category_id) ?? "—" : "No category"}
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                                                <span className="rounded-full bg-alloy-stone/12 px-2 py-0.5 text-alloy-midnight/60">
                                                    {t.status === "archived" ? "Archived" : t.published ? `Published v${t.published.version_number}` : "Draft only"}
                                                </span>
                                                {t.open_draft ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Draft v{t.open_draft.version_number}</span> : null}
                                                {t.published && t.published.default_sensitivity !== "standard" ? (
                                                    <span className="rounded-full bg-alloy-bend-pine/10 px-2 py-0.5 text-alloy-bend-pine">{SENSITIVITY_LABEL[t.published.default_sensitivity]}</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="flex items-baseline justify-between text-[12px] font-semibold text-alloy-midnight/70">
                {label}
                {note ? <span className="text-[10px] font-medium text-alloy-midnight/40">{note}</span> : null}
            </span>
            <div className="mt-1">{children}</div>
        </label>
    );
}

function TypeEditor({
    typeId,
    categories,
    onClose,
    onCreated,
}: {
    typeId: string | null;
    categories: DocumentCategory[];
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const [type, setType] = useState<DocumentTypeSummary | null>(null);
    const [versions, setVersions] = useState<DocumentTypeVersion[]>([]);
    const [draft, setDraft] = useState<DocumentTypeDraft>({ ...EMPTY_DRAFT });
    const [newKey, setNewKey] = useState("");
    const [problems, setProblems] = useState<PolicyProblem[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const published = versions.find((v) => v.status === "published") ?? null;
    const open = versions.find((v) => v.status === "draft" || v.status === "validated") ?? null;
    const activeCategories = categories.filter((c) => c.status === "active");

    const load = useCallback(async () => {
        if (!typeId) return;
        const r = await documentStudioApi.getType(typeId);
        if (!r.ok) {
            setMessage(r.error);
            return;
        }
        setType(r.data.type);
        setVersions(r.data.versions);
        const o = r.data.versions.find((v) => v.status === "draft" || v.status === "validated");
        setDraft(draftFrom(o ?? r.data.versions.find((v) => v.status === "published")));
        setProblems(o?.validation_errors ?? []);
    }, [typeId]);
    useEffect(() => {
        void load();
    }, [load]);

    // Shown while editing; the server is the authority on validate and publish.
    const preview = documentTypeDraftProblems(draft, {
        typeKey: type?.key ?? newKey,
        categoryActive: activeCategories.some((c) => c.id === draft.category_id),
        publishedSensitivity: published?.default_sensitivity ?? null,
    });
    const shown = problems.length ? problems : preview;

    const set = <K extends keyof DocumentTypeDraft>(k: K, v: DocumentTypeDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
    const toggle = <T extends string>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
    const setValidity = (patch: Partial<ValidityPolicy>) => setDraft((d) => ({ ...d, validity_policy: { ...d.validity_policy, ...patch } }));

    async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string; code?: string | null }>) {
        setBusy(true);
        setMessage(null);
        const r = await fn();
        setBusy(false);
        setMessage(r.ok ? label : `${r.error ?? "Failed"}${r.code ? ` (${r.code})` : ""}`);
    }

    const save = () =>
        run("Draft saved.", async () => {
            if (!typeId) {
                const r = await documentStudioApi.createType({ ...draft, ...(newKey ? { key: newKey } : {}) });
                if (r.ok) onCreated(r.data.type_id);
                return r;
            }
            const r = await documentStudioApi.saveDraft(typeId, draft);
            if (r.ok) {
                await load();
                setProblems(r.data.problems);
            }
            return r;
        });
    const validate = () =>
        run("Validated — ready to publish.", async () => {
            if (!typeId || !open) return { ok: false, error: "Save a draft first." };
            const r = await documentStudioApi.validate(typeId, open.id);
            if (r.ok) {
                await load();
                // The server's answer wins over whatever the reload carried.
                setProblems(r.data.problems);
                if (!r.data.valid) return { ok: false, error: "The draft has problems." };
            }
            return r;
        });
    const publish = () =>
        run("Published.", async () => {
            if (!typeId || !open) return { ok: false, error: "Nothing to publish." };
            const r = await documentStudioApi.publish(typeId, open.id, type?.published_version_id ?? null);
            if (r.ok) await load();
            return r;
        });
    const discard = () =>
        run("Draft discarded.", async () => {
            if (!typeId || !open) return { ok: false, error: "No unpublished draft." };
            const r = await documentStudioApi.discardDraft(typeId);
            if (r.ok) {
                setProblems([]);
                await load();
            }
            return r;
        });
    const setStatus = (action: "archive" | "activate") =>
        run(action === "archive" ? "Archived." : "Re-activated.", async () => {
            if (!typeId) return { ok: false, error: "Not saved yet." };
            const r = await documentStudioApi.setTypeStatus(typeId, action);
            if (r.ok) await load();
            return r;
        });
    const remove = () =>
        run("Deleted.", async () => {
            if (!typeId) return { ok: false, error: "Not saved yet." };
            const r = await documentStudioApi.deleteType(typeId);
            if (r.ok) onClose();
            return r;
        });

    const sensitivityOptions = DECLARED_DOCUMENT_SENSITIVITIES.filter(
        (s) => !published || s === published.default_sensitivity || published.default_sensitivity === "standard" || s === "restricted",
    );
    const vp = draft.validity_policy;

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="documents-studio-type-editor">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-alloy-stone/12 px-5 py-3">
                <button type="button" className={BTN} onClick={onClose}>
                    ← Types
                </button>
                <h3 className="text-[14px] font-semibold text-alloy-midnight">{type ? (published?.label ?? open?.label ?? type.key) : "New document type"}</h3>
                {type ? <span className="text-[11px] text-alloy-midnight/45">key {type.key} · {type.status}</span> : null}
                <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" className={BTN} disabled={busy} onClick={save} data-testid="documents-studio-save">
                        Save draft
                    </button>
                    <button type="button" className={BTN} disabled={busy || !open} onClick={validate} data-testid="documents-studio-validate">
                        Validate
                    </button>
                    <button type="button" className={PRIMARY} disabled={busy || open?.status !== "validated"} onClick={publish} data-testid="documents-studio-publish">
                        Publish
                    </button>
                    {type && open && versions.length > 1 ? (
                        <button type="button" className={BTN} disabled={busy} onClick={discard} data-testid="documents-studio-discard">
                            Discard draft
                        </button>
                    ) : null}
                    {type ? (
                        <button type="button" className={BTN} disabled={busy} onClick={() => setStatus(type.status === "active" ? "archive" : "activate")} data-testid="documents-studio-archive">
                            {type.status === "active" ? "Archive" : "Re-activate"}
                        </button>
                    ) : null}
                    {type ? (
                        <button type="button" className={BTN} disabled={busy} onClick={remove} data-testid="documents-studio-delete">
                            Delete
                        </button>
                    ) : null}
                </div>
            </div>
            {message ? (
                <p className="px-5 pt-3 text-[12px] text-alloy-midnight/70" role="status" data-testid="documents-studio-message">
                    {message}
                </p>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-4">
                    {!type ? (
                        <Field label="Key" note="Never changes after creation">
                            <input className={INPUT} value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="derived from the name if empty" data-testid="documents-studio-key" />
                        </Field>
                    ) : null}
                    <Field label="Name">
                        <input className={INPUT} value={draft.label} onChange={(e) => set("label", e.target.value)} data-testid="documents-studio-label" />
                    </Field>
                    <Field label="Description">
                        <textarea className={INPUT} rows={2} value={draft.description ?? ""} onChange={(e) => set("description", e.target.value || null)} />
                    </Field>
                    <Field label="Category">
                        <select className={INPUT} value={draft.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)} data-testid="documents-studio-category">
                            <option value="">Choose…</option>
                            {activeCategories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Applies to" note={ENFORCEMENT_LABEL[POLICY_ENFORCEMENT.subject_types]}>
                        <div className="flex flex-wrap gap-2">
                            {DOCUMENT_SUBJECT_TYPES.map((s) => (
                                <label key={s} className="inline-flex items-center gap-1.5 text-[12px] text-alloy-midnight/70">
                                    <input type="checkbox" checked={draft.subject_types.includes(s)} onChange={() => set("subject_types", toggle(draft.subject_types, s))} />
                                    {SUBJECT_LABEL[s]}
                                </label>
                            ))}
                        </div>
                    </Field>
                    <Field label="Allowed formats" note={ENFORCEMENT_LABEL[POLICY_ENFORCEMENT.allowed_formats]}>
                        <div className="flex flex-wrap gap-2">
                            {DOCUMENT_TYPE_FORMATS.map((f) => (
                                <label key={f} className="inline-flex items-center gap-1.5 text-[12px] uppercase text-alloy-midnight/70">
                                    <input type="checkbox" checked={draft.allowed_formats.includes(f)} onChange={() => set("allowed_formats", toggle(draft.allowed_formats, f))} />
                                    {f}
                                </label>
                            ))}
                        </div>
                    </Field>
                    <Field label="Default sensitivity" note={ENFORCEMENT_LABEL[POLICY_ENFORCEMENT.default_sensitivity]}>
                        <select
                            className={INPUT}
                            value={draft.default_sensitivity}
                            onChange={(e) => set("default_sensitivity", e.target.value as DeclaredDocumentSensitivity)}
                            data-testid="documents-studio-sensitivity"
                        >
                            {sensitivityOptions.map((s) => (
                                <option key={s} value={s}>
                                    {SENSITIVITY_LABEL[s]}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-[11px] text-alloy-midnight/45">Raise-only. Applies to new documents of this type; existing documents keep their class.</p>
                    </Field>
                    <Field label="Review" note={ENFORCEMENT_LABEL[POLICY_ENFORCEMENT.review_required]}>
                        <label className="inline-flex items-center gap-2 text-[12px] text-alloy-midnight/70">
                            <input type="checkbox" checked={draft.review_required} onChange={(e) => set("review_required", e.target.checked)} /> Each version needs review
                        </label>
                    </Field>
                    <Field label="Replacement" note={ENFORCEMENT_LABEL[POLICY_ENFORCEMENT.replacement_policy]}>
                        <select className={INPUT} value={draft.replacement_policy} onChange={(e) => set("replacement_policy", e.target.value as DocumentTypeDraft["replacement_policy"])}>
                            {REPLACEMENT_POLICIES.map((r) => (
                                <option key={r} value={r}>
                                    {r === "new_version" ? "A replacement becomes a new version" : r === "new_document" ? "A replacement is a new document" : "Replacement not allowed"}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Validity" note={ENFORCEMENT_LABEL[POLICY_ENFORCEMENT.validity_policy]}>
                        <select
                            className={INPUT}
                            value={vp.kind}
                            onChange={(e) => {
                                const kind = e.target.value as ValidityPolicy["kind"];
                                set("validity_policy", kind === "duration" || kind === "periodic_reconfirmation" ? { kind, value: 12, unit: "months" } : kind === "event_renewal" ? { kind, event: "program_year_start" } : { kind });
                            }}
                            data-testid="documents-studio-validity-kind"
                        >
                            {VALIDITY_KINDS.map((k) => (
                                <option key={k} value={k}>
                                    {VALIDITY_LABEL[k]}
                                </option>
                            ))}
                        </select>
                        {vp.kind === "duration" || vp.kind === "periodic_reconfirmation" ? (
                            <div className="mt-2 flex gap-2">
                                <input type="number" className={INPUT} value={vp.value ?? ""} onChange={(e) => setValidity({ value: Number(e.target.value) })} data-testid="documents-studio-validity-value" />
                                <select className={INPUT} value={vp.unit ?? "months"} onChange={(e) => setValidity({ unit: e.target.value as ValidityPolicy["unit"] })}>
                                    {VALIDITY_UNITS.map((u) => (
                                        <option key={u} value={u}>
                                            {u}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : null}
                        {vp.kind === "event_renewal" ? (
                            <select className={`mt-2 ${INPUT}`} value={vp.event ?? ""} onChange={(e) => setValidity({ event: e.target.value as ValidityPolicy["event"] })}>
                                {VALIDITY_EVENTS.map((ev) => (
                                    <option key={ev} value={ev}>
                                        {ev.replace(/_/g, " ")}
                                    </option>
                                ))}
                            </select>
                        ) : null}
                        {vp.kind !== "none" ? (
                            <input
                                className={`mt-2 ${INPUT}`}
                                placeholder="Warn days before, e.g. 30, 7"
                                value={(vp.warning_days ?? []).join(", ")}
                                onChange={(e) => {
                                    const days = e.target.value.split(",").map((x) => x.trim()).filter(Boolean).map(Number);
                                    setDraft((d) => {
                                        const next = { ...d.validity_policy } as ValidityPolicy;
                                        if (days.length) next.warning_days = days;
                                        else delete next.warning_days;
                                        return { ...d, validity_policy: next };
                                    });
                                }}
                                data-testid="documents-studio-warning-days"
                            />
                        ) : null}
                    </Field>
                </div>
                <aside className="space-y-4">
                    <div className="rounded-xl border border-alloy-stone/15 p-4">
                        <h4 className="text-[12px] font-semibold text-alloy-midnight/70">Validation</h4>
                        {shown.length === 0 ? (
                            <p className="mt-1 text-[12px] text-alloy-bend-pine" data-testid="documents-studio-valid">
                                No problems.
                            </p>
                        ) : (
                            <ul className="mt-1 space-y-1" data-testid="documents-studio-problems">
                                {shown.map((p, i) => (
                                    <li key={`${p.field}-${p.code}-${i}`} className="text-[12px] text-red-700">
                                        {PROBLEM_TEXT[p.code] ?? p.code}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="rounded-xl border border-alloy-stone/15 p-4">
                        <h4 className="text-[12px] font-semibold text-alloy-midnight/70">Versions</h4>
                        <ul className="mt-1 space-y-1 text-[12px] text-alloy-midnight/60" data-testid="documents-studio-versions">
                            {versions.length === 0 ? <li>None yet.</li> : null}
                            {versions.map((v) => (
                                <li key={v.id}>
                                    v{v.version_number} · {v.status} · {SENSITIVITY_LABEL[v.default_sensitivity]}
                                </li>
                            ))}
                        </ul>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function CategoryLibrary({ categories, types, onChanged }: { categories: DocumentCategory[]; types: DocumentTypeSummary[]; onChanged: () => Promise<void> }) {
    const [label, setLabel] = useState("");
    const [parentId, setParentId] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
    const typeCount = useMemo(() => {
        const m = new Map<string, number>();
        for (const t of types) {
            const c = (t.published ?? t.open_draft)?.category_id;
            if (c && t.status === "active") m.set(c, (m.get(c) ?? 0) + 1);
        }
        return m;
    }, [types]);

    async function act(fn: () => Promise<{ ok: boolean; error?: string; code?: string | null }>, done: string) {
        setMessage(null);
        const r = await fn();
        setMessage(r.ok ? done : `${r.error ?? "Failed"}${r.code ? ` (${r.code})` : ""}`);
        if (r.ok) await onChanged();
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" data-testid="documents-studio-categories">
            <div className="flex flex-wrap items-end gap-2">
                <Field label="New category">
                    <input className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} data-testid="documents-studio-category-label" />
                </Field>
                <Field label="Inside">
                    <select className={INPUT} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                        <option value="">Top level</option>
                        {categories
                            .filter((c) => c.status === "active")
                            .map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.label}
                                </option>
                            ))}
                    </select>
                </Field>
                <button
                    type="button"
                    className={PRIMARY}
                    disabled={!label.trim()}
                    onClick={() =>
                        void act(async () => {
                            const r = await documentStudioApi.createCategory({ label: label.trim(), parent_id: parentId || null });
                            if (r.ok) setLabel("");
                            return r;
                        }, "Category created.")
                    }
                    data-testid="documents-studio-category-create"
                >
                    Add
                </button>
            </div>
            {message ? (
                <p className="mt-3 text-[12px] text-alloy-midnight/70" role="status" data-testid="documents-studio-category-message">
                    {message}
                </p>
            ) : null}
            <ul className="mt-4 divide-y divide-alloy-stone/10 rounded-xl border border-alloy-stone/15">
                {categories.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid={`documents-studio-category-${c.key}`}>
                        <FolderTree className="h-4 w-4 text-alloy-bend-pine" aria-hidden />
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-alloy-midnight">
                                {c.parent_id ? `${byId.get(c.parent_id)?.label ?? "…"} › ` : ""}
                                {c.label}
                            </p>
                            <p className="text-[11px] text-alloy-midnight/45">
                                {c.key} · {c.status} · {typeCount.get(c.id) ?? 0} active types
                            </p>
                        </div>
                        <button
                            type="button"
                            className={BTN}
                            onClick={() => void act(() => documentStudioApi.updateCategory(c.id, { action: c.status === "active" ? "archive" : "activate" }), c.status === "active" ? "Archived." : "Re-activated.")}
                        >
                            {c.status === "active" ? "Archive" : "Re-activate"}
                        </button>
                        <button type="button" className={BTN} onClick={() => void act(() => documentStudioApi.deleteCategory(c.id), "Deleted.")}>
                            Delete
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
