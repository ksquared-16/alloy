"use client";

/**
 * POS Forms — NATIVE composer (no jump to legacy /forms).
 *
 * Left-to-right: form list → builder canvas (Build / Preview) → field palette +
 * properties. Reuses existing form data and logic only:
 *   • GET /api/admin/forms                                   (list)
 *   • GET /api/admin/forms/[formId]                          (versions)
 *   • GET /api/admin/forms/[formId]/versions/[versionId]     (schema_json)
 *   • safeParseFormSchema (lib/forms/schema) + FormEngineRenderer (preview)
 *
 * Editing/creating is intentionally prototype-thin and clearly badged — it does NOT
 * mutate stored forms, so existing creation/storage logic is untouched. The point
 * of this pass is that a form opens INSIDE POS, not the old forms app.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Archive } from "lucide-react";
import { safeParseFormSchema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import WorkspaceSectionHeader from "@/components/workspace/WorkspaceSectionHeader";
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

const PALETTE: Array<{ type: string; label: string }> = Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => ({
    type,
    label,
}));

const EMPTY_PAYLOAD: FormPayload = { values: {}, groups: {}, signatures: {} };

export default function PosFormsWorkspace({ focusFormId = null }: { focusFormId?: string | null } = {}) {
    const [forms, setForms] = useState<FormRow[] | null>(null);
    const [listErr, setListErr] = useState<string | null>(null);
    const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
    const [schema, setSchema] = useState<FormSchemaV1 | null>(null);
    const [schemaState, setSchemaState] = useState<"idle" | "loading" | "empty" | "error" | "ready">("idle");
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [mode, setMode] = useState<"build" | "preview">("build");
    const [archiving, setArchiving] = useState(false);

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
            const published = versions.filter((v) => v.status === "published").sort((a, b) => b.version_number - a.version_number);
            const pick = published[0] ?? [...versions].sort((a, b) => b.version_number - a.version_number)[0]!;
            const vRes = await fetch(`/api/admin/forms/${formId}/versions/${pick.id}`, { credentials: "same-origin" });
            if (!vRes.ok) throw new Error(`Request failed (${vRes.status})`);
            const vBody = (await vRes.json()) as { data?: { schema_json?: unknown } };
            const parsed = safeParseFormSchema(vBody.data?.schema_json);
            if (!parsed.success) {
                setSchemaState("empty");
                return;
            }
            setSchema(parsed.data);
            setSchemaState("ready");
        } catch {
            setSchemaState("error");
        }
    }, []);

    // Stay-in-POS deep link: when the modal jumps here with a freshly-created form, select it.
    useEffect(() => {
        if (focusFormId && forms && forms.some((f) => f.id === focusFormId) && selectedFormId !== focusFormId) {
            void selectForm(focusFormId);
        }
    }, [focusFormId, forms, selectedFormId, selectForm]);

    const archiveForm = useCallback(
        async (formId: string) => {
            if (
                !window.confirm(
                    "Archive this form? It’s removed from the list and its share links are deactivated. An admin can restore it."
                )
            ) {
                return;
            }
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

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader title="Forms" subtitle="A form is one Source. Build and review it natively inside POS." />

            <div className="flex min-h-0 flex-1 overflow-x-auto">
                {/* Column 1 — form list */}
                <div className="flex w-[15rem] shrink-0 flex-col overflow-y-auto border-r border-alloy-stone/12 bg-white">
                    <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">All forms</span>
                        <button
                            type="button"
                            disabled
                            title="Prototype — create form lands next"
                            className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-400"
                        >
                            <Plus className="h-3 w-3" aria-hidden /> New
                        </button>
                    </div>
                    {listErr ? (
                        <div className="m-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">{listErr}</div>
                    ) : !forms ? (
                        <div className="space-y-1.5 p-2">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-9 animate-pulse rounded bg-stone-100" />
                            ))}
                        </div>
                    ) : forms.length === 0 ? (
                        <div className="p-3 text-[12px] text-stone-400">No forms yet.</div>
                    ) : (
                        <ul>
                            {forms.map((f) => {
                                const active = f.id === selectedFormId;
                                return (
                                    <li key={f.id}>
                                        <button
                                            type="button"
                                            onClick={() => void selectForm(f.id)}
                                            className={`flex w-full flex-col items-start border-l-2 px-3 py-2 text-left ${
                                                active ? "border-alloy-juniper bg-emerald-50/70" : "border-transparent hover:bg-stone-50"
                                            }`}
                                        >
                                            <span className="truncate text-[12.5px] font-medium text-alloy-midnight">{f.name || f.key}</span>
                                            <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                                {f.metadata?.source === "document_form_draft" ? (
                                                    <span className="rounded bg-sky-50 px-1 text-[9px] font-medium text-sky-700">From document</span>
                                                ) : null}
                                                {f.metadata?.pos_connected === true ? (
                                                    <span className="rounded bg-emerald-50 px-1 text-[9px] font-medium text-emerald-700">Processing</span>
                                                ) : null}
                                                <span className="rounded bg-stone-100 px-1 text-[9px] text-stone-500">
                                                    {f.has_published_version ? "Published" : "Draft"}
                                                </span>
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
                        <EmptyColumn title="Select a form" body="Choose a form to build or preview it here — no jumping to the old forms app." />
                    ) : (
                        <>
                            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/12 bg-white px-3 py-1.5">
                                <span className="truncate text-[12.5px] font-semibold text-alloy-midnight">{selectedForm.name || selectedForm.key}</span>
                                <div className="flex shrink-0 items-center gap-2">
                                    <div className="flex shrink-0 overflow-hidden rounded-md border border-stone-200">
                                        {(["build", "preview"] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setMode(m)}
                                                className={`px-2.5 py-1 text-[11px] font-medium capitalize ${
                                                    mode === m ? "bg-[#00A283] text-white" : "bg-white text-stone-500 hover:bg-stone-50"
                                                }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        disabled={archiving}
                                        onClick={() => void archiveForm(selectedForm.id)}
                                        title={selectedForm.has_published_version ? "Archive — deactivates share links" : "Archive this draft form"}
                                        className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-500 hover:border-amber-300 hover:text-amber-700 disabled:opacity-50"
                                    >
                                        <Archive className="h-3.5 w-3.5" aria-hidden />
                                        {archiving ? "Archiving…" : "Archive"}
                                    </button>
                                </div>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                                {schemaState === "loading" ? (
                                    <div className="space-y-2">
                                        <div className="h-6 w-1/2 animate-pulse rounded bg-stone-100" />
                                        <div className="h-24 animate-pulse rounded bg-stone-100" />
                                    </div>
                                ) : schemaState === "empty" ? (
                                    <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-6 text-center text-[12.5px] text-stone-400">
                                        No published schema yet for this form.
                                    </div>
                                ) : schemaState === "error" ? (
                                    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">Couldn’t load this form’s schema.</div>
                                ) : schema && mode === "preview" ? (
                                    <div className="rounded-lg border border-alloy-stone/15 bg-white p-3">
                                        <FormEngineRenderer schema={schema} payload={EMPTY_PAYLOAD} onChange={() => {}} mode="readonly" />
                                    </div>
                                ) : schema ? (
                                    <div className="space-y-3">
                                        {schema.sections.map((section, si) => (
                                            <PosPanel key={si} eyebrow={section.title || `Section ${si + 1}`}>
                                                <ul className="space-y-1.5">
                                                    {section.field_ids.map((fid) => {
                                                        const field = fieldById.get(fid);
                                                        if (!field) return null;
                                                        const active = selectedFieldId === fid;
                                                        return (
                                                            <li key={fid}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedFieldId(fid)}
                                                                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left ${
                                                                        active ? "border-emerald-300 bg-emerald-50/60" : "border-stone-200 bg-white hover:bg-stone-50"
                                                                    }`}
                                                                >
                                                                    <span className="min-w-0">
                                                                        <span className="block truncate text-[12.5px] font-medium text-alloy-midnight">{field.label}</span>
                                                                        <span className="block text-[10px] text-stone-400">{FIELD_TYPE_LABELS[field.type] ?? field.type}</span>
                                                                    </span>
                                                                    {field.required ? (
                                                                        <span className="shrink-0 rounded bg-stone-100 px-1 text-[9px] font-medium text-stone-500">Required</span>
                                                                    ) : null}
                                                                </button>
                                                            </li>
                                                        );
                                                    })}
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
                <div className="flex w-[15rem] shrink-0 flex-col gap-3 overflow-y-auto bg-white p-3">
                    <PosPanel eyebrow="Field palette" right={<span className="text-[9px] text-stone-400">Prototype</span>} accent={false}>
                        <div className="grid grid-cols-2 gap-1.5">
                            {PALETTE.map((p) => (
                                <button
                                    key={p.type}
                                    type="button"
                                    disabled
                                    title="Prototype — drag-to-add not wired"
                                    className="cursor-not-allowed rounded border border-stone-200 px-1.5 py-1 text-[10.5px] text-stone-500"
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </PosPanel>

                    <PosPanel eyebrow="Properties" accent={false}>
                        {!selectedField ? (
                            <div className="text-[11.5px] text-stone-400">Select a field to see its properties.</div>
                        ) : (
                            <dl className="space-y-1.5 text-[11.5px]">
                                <Prop label="Label" value={selectedField.label} />
                                <Prop label="Type" value={FIELD_TYPE_LABELS[selectedField.type] ?? selectedField.type} />
                                <Prop label="Field id" value={selectedField.id} mono />
                                <Prop label="Required" value={selectedField.required ? "Yes" : "No"} />
                                <Prop
                                    label="Binding"
                                    value={
                                        selectedField.field_source
                                            ? `${selectedField.field_source.entity_type}.${selectedField.field_source.field_key ?? "—"}`
                                            : "Unmapped"
                                    }
                                    mono
                                />
                            </dl>
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
