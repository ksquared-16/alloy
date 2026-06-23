"use client";

/**
 * POS Forms — native form list + manual builder (no jump to legacy /forms).
 *
 * Operators can create useful forms by hand (not only from PDF extraction): create a
 * blank form, add fields of each type, edit label/required/help/options, reorder, group
 * into sections, preview with the real engine, save the draft, and publish. Reuses the
 * existing forms-admin API + the pure `formBuilderSchema` helpers; no new backend.
 *
 *   GET    /api/admin/forms                                   (list)
 *   POST   /api/admin/forms                                   (create definition)
 *   GET    /api/admin/forms/[formId]                          (versions)
 *   POST   /api/admin/forms/[formId]/versions                 (create draft)
 *   GET    /api/admin/forms/[formId]/versions/[versionId]     (schema_json)
 *   PATCH  /api/admin/forms/[formId]/versions/[versionId]     (save draft)
 *   POST   /api/admin/forms/[formId]/versions/[versionId]/publish
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Archive, Save, Upload, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { safeParseFormSchema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import WorkspaceSectionHeader from "@/components/workspace/WorkspaceSectionHeader";
import {
    createBlankSchema,
    addField,
    updateField,
    removeField,
    moveFieldWithinSection,
    addSection,
    type BuilderFieldType,
    type BuilderFieldSpec,
} from "@/lib/forms/formBuilderSchema";
import PosPanel from "./PosPanel";

interface FormRow {
    id: string;
    key: string;
    name: string | null;
    is_active: boolean;
    metadata?: Record<string, unknown>;
    has_published_version?: boolean;
}
interface VersionRow {
    id: string;
    version_number: number;
    status: string;
    published_at: string | null;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
    text: "Text",
    number: "Number",
    date: "Date",
    boolean: "Yes / No",
    select: "Dropdown",
    multiselect: "Multi-select",
    file_ref: "File upload",
    signature: "Signature",
    group: "Repeating group",
};

const BUILDER_PALETTE: Array<{ type: BuilderFieldType; label: string }> = [
    { type: "short_text", label: "Short text" },
    { type: "long_text", label: "Long text" },
    { type: "date", label: "Date" },
    { type: "number", label: "Number" },
    { type: "select", label: "Dropdown" },
    { type: "multiselect", label: "Multi-select" },
    { type: "boolean", label: "Yes / No" },
    { type: "file_ref", label: "File upload" },
    { type: "signature", label: "Signature" },
];

const EMPTY_PAYLOAD: FormPayload = { values: {}, groups: {}, signatures: {} };

function optionsToText(field: FormField | null): string {
    if (!field || (field.type !== "select" && field.type !== "multiselect")) return "";
    const opts = (field as { static_options?: Array<{ value: string; label: string }> }).static_options ?? [];
    return opts.map((o) => (o.value === o.label ? o.label : `${o.value} | ${o.label}`)).join("\n");
}
function parseOptions(text: string): Array<{ value: string; label: string }> {
    return text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split(/\s*[|=]\s*/);
            const label = (parts[1] ?? parts[0]).trim();
            const value = parts.length > 1 ? parts[0].trim() : label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
            return { value: value || label, label };
        });
}

export default function PosFormsWorkspace({ focusFormId = null }: { focusFormId?: string | null } = {}) {
    const [forms, setForms] = useState<FormRow[] | null>(null);
    const [listErr, setListErr] = useState<string | null>(null);
    const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
    const [schema, setSchema] = useState<FormSchemaV1 | null>(null);
    const [schemaState, setSchemaState] = useState<"idle" | "loading" | "empty" | "error" | "ready">("idle");
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [mode, setMode] = useState<"build" | "preview">("build");
    const [archiving, setArchiving] = useState(false);
    // Builder
    const [editVersionId, setEditVersionId] = useState<string | null>(null); // set only when the loaded version is a draft
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [builderErr, setBuilderErr] = useState<string | null>(null);
    const [optionsText, setOptionsText] = useState("");

    const editable = editVersionId !== null;

    const loadForms = useCallback(async () => {
        setListErr(null);
        try {
            const res = await fetch("/api/admin/forms", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: FormRow[] };
            setForms(body.data ?? []);
        } catch (e) {
            setListErr(e instanceof Error ? e.message : "Failed to load forms");
            setForms(null);
        }
    }, []);

    useEffect(() => {
        void loadForms();
    }, [loadForms]);

    const selectForm = useCallback(async (formId: string) => {
        setSelectedFormId(formId);
        setSelectedFieldId(null);
        setMode("build");
        setSchema(null);
        setEditVersionId(null);
        setDirty(false);
        setBuilderErr(null);
        setSchemaState("loading");
        try {
            const res = await fetch(`/api/admin/forms/${formId}`, { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: { versions?: VersionRow[] } };
            const versions = body.data?.versions ?? [];
            if (versions.length === 0) {
                setSchemaState("empty");
                return;
            }
            const latest = [...versions].sort((a, b) => b.version_number - a.version_number)[0]!;
            const vRes = await fetch(`/api/admin/forms/${formId}/versions/${latest.id}`, { credentials: "same-origin" });
            if (!vRes.ok) throw new Error(`Request failed (${vRes.status})`);
            const vBody = (await vRes.json()) as { data?: { schema_json?: unknown } };
            const parsed = safeParseFormSchema(vBody.data?.schema_json);
            if (!parsed.success) {
                setSchemaState("empty");
                return;
            }
            setSchema(parsed.data);
            setActiveSectionId(parsed.data.sections[0]?.id ?? null);
            setEditVersionId(latest.status === "draft" ? latest.id : null); // editable only when draft
            setSchemaState("ready");
        } catch {
            setSchemaState("error");
        }
    }, []);

    useEffect(() => {
        if (focusFormId && forms && forms.some((f) => f.id === focusFormId) && selectedFormId !== focusFormId) {
            void selectForm(focusFormId);
        }
    }, [focusFormId, forms, selectedFormId, selectForm]);

    const createBlankForm = useCallback(async () => {
        const name = window.prompt("New form name");
        if (!name?.trim()) return;
        setListErr(null);
        try {
            const defRes = await fetch("/api/admin/forms", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), kind: "center" }),
            });
            const defBody = (await defRes.json().catch(() => ({}))) as { data?: { id: string }; error?: string };
            if (!defRes.ok || !defBody.data?.id) throw new Error(defBody.error || `Create failed (${defRes.status})`);
            const formId = defBody.data.id;
            const verRes = await fetch(`/api/admin/forms/${formId}/versions`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ schema_json: createBlankSchema(name.trim()) }),
            });
            if (!verRes.ok) {
                const b = (await verRes.json().catch(() => ({}))) as { error?: string };
                throw new Error(b.error || `Draft create failed (${verRes.status})`);
            }
            await loadForms();
            await selectForm(formId);
        } catch (e) {
            setListErr(e instanceof Error ? e.message : "Failed to create form");
        }
    }, [loadForms, selectForm]);

    const mutate = useCallback((fn: (s: FormSchemaV1) => FormSchemaV1) => {
        setSchema((cur) => (cur ? fn(cur) : cur));
        setDirty(true);
        setBuilderErr(null);
    }, []);

    const addFieldOfType = useCallback(
        (type: BuilderFieldType) => {
            if (!schema || !editable) return;
            const label = BUILDER_PALETTE.find((p) => p.type === type)?.label ?? "Field";
            const spec: BuilderFieldSpec = {
                type,
                label: `Untitled ${label.toLowerCase()}`,
                sectionId: activeSectionId ?? schema.sections[0]?.id,
                ...(type === "select" || type === "multiselect" ? { options: [{ value: "option_1", label: "Option 1" }] } : {}),
            };
            const { schema: next, fieldId } = addField(schema, spec);
            setSchema(next);
            setSelectedFieldId(fieldId);
            setDirty(true);
            setBuilderErr(null);
        },
        [schema, editable, activeSectionId]
    );

    const saveDraft = useCallback(async () => {
        if (!selectedFormId || !editVersionId || !schema) return;
        setSaving(true);
        setBuilderErr(null);
        try {
            const res = await fetch(`/api/admin/forms/${selectedFormId}/versions/${editVersionId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ schema_json: schema }),
            });
            if (!res.ok) {
                const b = (await res.json().catch(() => ({}))) as { error?: string; validation_errors?: Array<{ path?: string; message?: string }> };
                const detail = b.validation_errors?.[0] ? ` (${b.validation_errors[0].path}: ${b.validation_errors[0].message})` : "";
                throw new Error((b.error || `Save failed (${res.status})`) + detail);
            }
            setDirty(false);
        } catch (e) {
            setBuilderErr(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }, [selectedFormId, editVersionId, schema]);

    const publishForm = useCallback(async () => {
        if (!selectedFormId || !editVersionId || !schema) return;
        setPublishing(true);
        setBuilderErr(null);
        try {
            // Save first so the published version reflects the latest edits.
            const patch = await fetch(`/api/admin/forms/${selectedFormId}/versions/${editVersionId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ schema_json: schema }),
            });
            if (!patch.ok) {
                const b = (await patch.json().catch(() => ({}))) as { error?: string; validation_errors?: Array<{ path?: string; message?: string }> };
                const detail = b.validation_errors?.[0] ? ` (${b.validation_errors[0].path}: ${b.validation_errors[0].message})` : "";
                throw new Error((b.error || `Save failed (${patch.status})`) + detail);
            }
            const res = await fetch(`/api/admin/forms/${selectedFormId}/versions/${editVersionId}/publish`, { method: "POST", credentials: "same-origin" });
            if (!res.ok) {
                const b = (await res.json().catch(() => ({}))) as { error?: string; binding_violations?: Array<{ field_id?: string }> };
                const detail = b.binding_violations?.length ? ` (${b.binding_violations.length} field(s) need binding)` : "";
                throw new Error((b.error || `Publish failed (${res.status})`) + detail);
            }
            setDirty(false);
            await loadForms();
            await selectForm(selectedFormId);
        } catch (e) {
            setBuilderErr(e instanceof Error ? e.message : "Publish failed");
        } finally {
            setPublishing(false);
        }
    }, [selectedFormId, editVersionId, schema, loadForms, selectForm]);

    const archiveForm = useCallback(
        async (formId: string) => {
            if (!window.confirm("Archive this form? It's removed from the list and its share links are deactivated.")) return;
            setArchiving(true);
            setListErr(null);
            try {
                const res = await fetch(`/api/admin/forms/${formId}/archive`, { method: "POST", credentials: "same-origin" });
                if (!res.ok) {
                    const b = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(b.error || `Archive failed (${res.status})`);
                }
                if (selectedFormId === formId) {
                    setSelectedFormId(null);
                    setSchema(null);
                    setSchemaState("idle");
                }
                await loadForms();
            } catch (e) {
                setListErr(e instanceof Error ? e.message : "Archive failed");
            } finally {
                setArchiving(false);
            }
        },
        [selectedFormId, loadForms]
    );

    const fieldById = useMemo(() => {
        const map = new Map<string, FormField>();
        const walk = (fields: FormField[]) => {
            for (const f of fields) {
                map.set(f.id, f);
                if (f.type === "group") walk(f.fields);
            }
        };
        if (schema) walk(schema.fields);
        return map;
    }, [schema]);

    const selectedForm = forms?.find((f) => f.id === selectedFormId) ?? null;
    const selectedField = selectedFieldId ? fieldById.get(selectedFieldId) ?? null : null;

    useEffect(() => {
        setOptionsText(optionsToText(selectedField));
    }, [selectedFieldId, selectedField]);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader title="Forms" subtitle="Build forms by hand or from documents. Forms are the source ingredients for packets." />

            <div className="flex min-h-0 flex-1 overflow-x-auto">
                {/* Column 1 — form list */}
                <div className="flex w-[15rem] shrink-0 flex-col overflow-y-auto border-r border-alloy-stone/12 bg-white">
                    <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">All forms</span>
                        <button type="button" onClick={() => void createBlankForm()} className="inline-flex items-center gap-1 rounded bg-[#00A283] px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-[#00917a]">
                            <Plus className="h-3 w-3" aria-hidden /> New
                        </button>
                    </div>
                    {listErr ? (
                        <div className="m-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">{listErr}</div>
                    ) : !forms ? (
                        <div className="space-y-1.5 p-2">{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-stone-100" />)}</div>
                    ) : forms.length === 0 ? (
                        <div className="p-3 text-[12px] text-stone-400">No forms yet — click New.</div>
                    ) : (
                        <ul>
                            {forms.map((f) => {
                                const active = f.id === selectedFormId;
                                return (
                                    <li key={f.id}>
                                        <button type="button" onClick={() => void selectForm(f.id)} className={`flex w-full flex-col items-start border-l-2 px-3 py-2 text-left ${active ? "border-alloy-juniper bg-emerald-50/70" : "border-transparent hover:bg-stone-50"}`}>
                                            <span className="truncate text-[12.5px] font-medium text-alloy-midnight">{f.name || f.key}</span>
                                            <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                                {f.metadata?.source === "document_form_draft" ? <span className="rounded bg-sky-50 px-1 text-[9px] font-medium text-sky-700">From document</span> : null}
                                                <span className="rounded bg-stone-100 px-1 text-[9px] text-stone-500">{f.has_published_version ? "Published" : "Draft"}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Column 2 — builder canvas / preview */}
                <div className="flex min-w-[20rem] flex-1 flex-col overflow-hidden border-r border-alloy-stone/12 bg-white">
                    {!selectedForm ? (
                        <EmptyColumn title="Select or create a form" body="Click New to build a form by hand, or choose one to edit/preview." />
                    ) : (
                        <>
                            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/12 bg-white px-3 py-1.5">
                                <span className="truncate text-[12.5px] font-semibold text-alloy-midnight">
                                    {selectedForm.name || selectedForm.key}
                                    {editable ? <span className="ml-1.5 rounded bg-amber-50 px-1 text-[9px] font-medium text-amber-700">Draft{dirty ? " · unsaved" : ""}</span> : <span className="ml-1.5 rounded bg-stone-100 px-1 text-[9px] text-stone-500">Published · read-only</span>}
                                </span>
                                <div className="flex shrink-0 items-center gap-2">
                                    <div className="flex shrink-0 overflow-hidden rounded-md border border-stone-200">
                                        {(["build", "preview"] as const).map((m) => (
                                            <button key={m} type="button" onClick={() => setMode(m)} className={`px-2.5 py-1 text-[11px] font-medium capitalize ${mode === m ? "bg-[#00A283] text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>{m}</button>
                                        ))}
                                    </div>
                                    {editable ? (
                                        <>
                                            <button type="button" disabled={saving || !dirty} onClick={() => void saveDraft()} className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40">
                                                <Save className="h-3.5 w-3.5" aria-hidden /> {saving ? "Saving…" : "Save"}
                                            </button>
                                            <button type="button" disabled={publishing} onClick={() => void publishForm()} className="inline-flex items-center gap-1 rounded-md bg-[#00A283] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#00917a] disabled:opacity-50">
                                                <Upload className="h-3.5 w-3.5" aria-hidden /> {publishing ? "Publishing…" : "Publish"}
                                            </button>
                                        </>
                                    ) : (
                                        <button type="button" disabled={archiving} onClick={() => void archiveForm(selectedForm.id)} className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-500 hover:border-amber-300 hover:text-amber-700 disabled:opacity-50">
                                            <Archive className="h-3.5 w-3.5" aria-hidden /> {archiving ? "Archiving…" : "Archive"}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {builderErr ? <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{builderErr}</div> : null}
                            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                                {schemaState === "loading" ? (
                                    <div className="space-y-2"><div className="h-6 w-1/2 animate-pulse rounded bg-stone-100" /><div className="h-24 animate-pulse rounded bg-stone-100" /></div>
                                ) : schemaState === "empty" ? (
                                    <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-6 text-center text-[12.5px] text-stone-400">No schema yet for this form.</div>
                                ) : schemaState === "error" ? (
                                    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">Couldn't load this form's schema.</div>
                                ) : schema && mode === "preview" ? (
                                    <div className="rounded-lg border border-alloy-stone/15 bg-white p-3">
                                        <FormEngineRenderer schema={schema} payload={EMPTY_PAYLOAD} onChange={() => {}} mode="readonly" />
                                    </div>
                                ) : schema ? (
                                    <div className="space-y-3">
                                        {schema.fields.length === 0 ? <div className="rounded border border-dashed border-stone-300 p-4 text-center text-[11.5px] text-stone-400">Add fields from the palette on the right.</div> : null}
                                        {schema.sections.map((section, si) => (
                                            <PosPanel key={section.id} eyebrow={section.title || `Section ${si + 1}`}>
                                                <ul className="space-y-1.5">
                                                    {section.field_ids.map((fid) => {
                                                        const field = fieldById.get(fid);
                                                        if (!field) return null;
                                                        const active = selectedFieldId === fid;
                                                        return (
                                                            <li key={fid}>
                                                                <button type="button" onClick={() => setSelectedFieldId(fid)} className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left ${active ? "border-emerald-300 bg-emerald-50/60" : "border-stone-200 bg-white hover:bg-stone-50"}`}>
                                                                    <span className="min-w-0">
                                                                        <span className="block truncate text-[12.5px] font-medium text-alloy-midnight">{field.label}</span>
                                                                        <span className="block text-[10px] text-stone-400">{FIELD_TYPE_LABELS[field.type] ?? field.type}{field.field_source ? ` · ${field.field_source.entity_type}.${field.field_source.field_key}` : ""}</span>
                                                                    </span>
                                                                    {field.required ? <span className="shrink-0 rounded bg-stone-100 px-1 text-[9px] font-medium text-stone-500">Required</span> : null}
                                                                </button>
                                                            </li>
                                                        );
                                                    })}
                                                    {section.field_ids.length === 0 ? <li className="text-[10.5px] text-stone-400">No fields in this section yet.</li> : null}
                                                </ul>
                                            </PosPanel>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </>
                    )}
                </div>

                {/* Column 3 — palette + properties */}
                <div className="flex w-[16rem] shrink-0 flex-col gap-3 overflow-y-auto bg-white p-3">
                    {editable ? (
                        <PosPanel eyebrow="Add field" accent={false}>
                            {schema && schema.sections.length > 1 ? (
                                <select value={activeSectionId ?? ""} onChange={(e) => setActiveSectionId(e.target.value)} className="mb-2 w-full rounded border border-stone-200 px-1.5 py-1 text-[11px] text-stone-700">
                                    {schema.sections.map((s, i) => <option key={s.id} value={s.id}>{s.title || `Section ${i + 1}`}</option>)}
                                </select>
                            ) : null}
                            <div className="grid grid-cols-2 gap-1.5">
                                {BUILDER_PALETTE.map((p) => (
                                    <button key={p.type} type="button" onClick={() => addFieldOfType(p.type)} className="rounded border border-stone-200 px-1.5 py-1 text-[10.5px] text-stone-600 hover:border-emerald-300 hover:bg-emerald-50/50">{p.label}</button>
                                ))}
                            </div>
                            <button type="button" onClick={() => { const t = window.prompt("Section title"); if (t?.trim() && schema) { const r = addSection(schema, t.trim()); setSchema(r.schema); setActiveSectionId(r.sectionId); setDirty(true); } }} className="mt-2 w-full rounded border border-dashed border-stone-300 px-2 py-1 text-[10.5px] text-stone-500 hover:bg-stone-50">+ Add section</button>
                        </PosPanel>
                    ) : null}

                    <PosPanel eyebrow="Properties" accent={false}>
                        {!selectedField ? (
                            <div className="text-[11.5px] text-stone-400">{editable ? "Add or select a field to edit it." : "Select a field to see its properties."}</div>
                        ) : !editable ? (
                            <dl className="space-y-1.5 text-[11.5px]">
                                <Prop label="Label" value={selectedField.label} />
                                <Prop label="Type" value={FIELD_TYPE_LABELS[selectedField.type] ?? selectedField.type} />
                                <Prop label="Required" value={selectedField.required ? "Yes" : "No"} />
                                <Prop label="Binding" value={selectedField.field_source ? `${selectedField.field_source.entity_type}.${selectedField.field_source.field_key}` : "Unmapped"} mono />
                            </dl>
                        ) : (
                            <div className="space-y-2 text-[11.5px]">
                                <label className="block">
                                    <span className="text-[10px] text-stone-400">Label</span>
                                    <input value={selectedField.label} onChange={(e) => mutate((s) => updateField(s, selectedField.id, { label: e.target.value }))} className="mt-0.5 w-full rounded border border-stone-200 px-1.5 py-1" />
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={selectedField.required} onChange={(e) => mutate((s) => updateField(s, selectedField.id, { required: e.target.checked }))} />
                                    <span>Required</span>
                                </label>
                                <label className="block">
                                    <span className="text-[10px] text-stone-400">Help text</span>
                                    <input value={(selectedField as { description?: string }).description ?? ""} onChange={(e) => mutate((s) => updateField(s, selectedField.id, { description: e.target.value }))} className="mt-0.5 w-full rounded border border-stone-200 px-1.5 py-1" />
                                </label>
                                {selectedField.type === "select" || selectedField.type === "multiselect" ? (
                                    <label className="block">
                                        <span className="text-[10px] text-stone-400">Options (one per line; "value | label")</span>
                                        <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} onBlur={() => mutate((s) => updateField(s, selectedField.id, { options: parseOptions(optionsText) }))} rows={4} className="mt-0.5 w-full rounded border border-stone-200 px-1.5 py-1 font-mono text-[10.5px]" />
                                    </label>
                                ) : null}
                                <div className="rounded border border-stone-100 bg-stone-50/60 p-1.5">
                                    <span className="text-[10px] text-stone-400">Canonical binding (optional)</span>
                                    <div className="mt-0.5 flex gap-1">
                                        <input placeholder="entity_type" value={selectedField.field_source?.entity_type ?? ""} onChange={(e) => mutate((s) => updateField(s, selectedField.id, { field_source: { entity_type: e.target.value, field_key: selectedField.field_source?.field_key ?? "" } }))} className="min-w-0 flex-1 rounded border border-stone-200 px-1.5 py-1 font-mono text-[10px]" />
                                        <input placeholder="field_key" value={selectedField.field_source?.field_key ?? ""} onChange={(e) => mutate((s) => updateField(s, selectedField.id, { field_source: { entity_type: selectedField.field_source?.entity_type ?? "", field_key: e.target.value } }))} className="min-w-0 flex-1 rounded border border-stone-200 px-1.5 py-1 font-mono text-[10px]" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 pt-1">
                                    <button type="button" onClick={() => mutate((s) => moveFieldWithinSection(s, selectedField.id, -1))} className="rounded border border-stone-200 p-1 text-stone-500 hover:bg-stone-50"><ArrowUp className="h-3.5 w-3.5" /></button>
                                    <button type="button" onClick={() => mutate((s) => moveFieldWithinSection(s, selectedField.id, 1))} className="rounded border border-stone-200 p-1 text-stone-500 hover:bg-stone-50"><ArrowDown className="h-3.5 w-3.5" /></button>
                                    <button type="button" onClick={() => { mutate((s) => removeField(s, selectedField.id)); setSelectedFieldId(null); }} className="ml-auto inline-flex items-center gap-1 rounded border border-stone-200 px-2 py-1 text-[10.5px] text-stone-500 hover:border-rose-300 hover:text-rose-600"><Trash2 className="h-3 w-3" /> Remove</button>
                                </div>
                            </div>
                        )}
                    </PosPanel>
                </div>
            </div>
        </div>
    );
}

function Prop({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-stone-400">{label}</dt>
            <dd className={`min-w-0 flex-1 break-words text-alloy-midnight ${mono ? "font-mono text-[10.5px]" : ""}`}>{value}</dd>
        </div>
    );
}

function EmptyColumn({ title, body }: { title: string; body: string }) {
    return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="text-[12.5px] font-medium text-stone-600">{title}</div>
            <p className="mx-auto mt-1 max-w-[18rem] text-[11px] leading-relaxed text-stone-400">{body}</p>
        </div>
    );
}
