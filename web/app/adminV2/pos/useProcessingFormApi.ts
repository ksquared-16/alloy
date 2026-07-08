"use client";

import { useCallback, useMemo, useState } from "react";
import { brandingMetadataPatch, type ProcessingFormBranding } from "@/lib/forms/processingFormBranding";
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { createBlankSchema } from "@/lib/forms/formBuilderSchema";

export interface ProcessingFormRow {
    id: string;
    key: string;
    name: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
    has_published_version?: boolean;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface ProcessingFormVersionRow {
    id: string;
    version_number: number;
    status: string;
}

export type FormLoadState = "idle" | "loading" | "empty" | "error" | "ready";

export function useProcessingFormApi() {
    const [forms, setForms] = useState<ProcessingFormRow[]>([]);
    const [listErr, setListErr] = useState<string | null>(null);
    const [listLoaded, setListLoaded] = useState(false);

    const loadForms = useCallback(async () => {
        setListErr(null);
        try {
            const res = await fetch("/api/admin/forms", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: ProcessingFormRow[] };
            setForms(body.data ?? []);
        } catch (e) {
            setListErr(e instanceof Error ? e.message : "Failed to load forms");
            setForms([]);
        } finally {
            setListLoaded(true);
        }
    }, []);

    const loadFormSchema = useCallback(
        async (
            formId: string
        ): Promise<{
            schema: FormSchemaV1 | null;
            editVersionId: string | null;
            state: FormLoadState;
            formRow: ProcessingFormRow | null;
        }> => {
            try {
                const res = await fetch(`/api/admin/forms/${formId}`, { credentials: "same-origin" });
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const body = (await res.json()) as { data?: ProcessingFormRow & { versions?: ProcessingFormVersionRow[] } };
                const formRow = body.data ?? null;
                const versions = formRow?.versions ?? [];
                if (versions.length === 0) return { schema: null, editVersionId: null, state: "empty", formRow };

                const latest = [...versions].sort((a, b) => b.version_number - a.version_number)[0]!;
                const vRes = await fetch(`/api/admin/forms/${formId}/versions/${latest.id}`, { credentials: "same-origin" });
                if (!vRes.ok) throw new Error(`Request failed (${vRes.status})`);
                const vBody = (await vRes.json()) as { data?: { schema_json?: unknown } };
                const parsed = safeParseFormSchema(vBody.data?.schema_json);
                if (!parsed.success) return { schema: null, editVersionId: null, state: "empty", formRow };

                if (latest.status === "draft") {
                    return { schema: parsed.data, editVersionId: latest.id, state: "ready", formRow };
                }

                const draftRes = await fetch(`/api/admin/forms/${formId}/versions`, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ schema_json: parsed.data }),
                });
                if (!draftRes.ok) {
                    return { schema: parsed.data, editVersionId: null, state: "ready", formRow };
                }
                const draftBody = (await draftRes.json()) as { data?: { id?: string } };
                return {
                    schema: parsed.data,
                    editVersionId: draftBody.data?.id ?? null,
                    state: "ready",
                    formRow,
                };
            } catch {
                return { schema: null, editVersionId: null, state: "error", formRow: null };
            }
        },
        []
    );

    const patchFormBranding = useCallback(
        async (formId: string, branding: ProcessingFormBranding, existingMeta: Record<string, unknown> = {}) => {
            await fetch(`/api/admin/forms/${formId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    description: branding.description.trim() || null,
                    metadata: brandingMetadataPatch(branding, existingMeta),
                }),
            });
        },
        []
    );

    const syncFormStats = useCallback(
        async (
            formId: string,
            schema: FormSchemaV1,
            opts?: { description?: string | null; branding?: ProcessingFormBranding; existingMeta?: Record<string, unknown>; formName?: string }
        ) => {
            const existingMeta = opts?.existingMeta ?? {};
            const metadata = brandingMetadataPatch(
                opts?.branding ?? {
                    brand_name: typeof existingMeta.brand_name === "string" ? existingMeta.brand_name : "",
                    accent_color:
                        typeof existingMeta.accent_color === "string" ? existingMeta.accent_color : "#00A283",
                    logo_url: typeof existingMeta.logo_url === "string" ? existingMeta.logo_url : null,
                    description: opts?.description ?? "",
                },
                {
                    ...existingMeta,
                    field_count: schema.fields.length,
                    section_count: schema.sections.length,
                    origin: existingMeta.origin ?? "blank",
                }
            );
            const payload: Record<string, unknown> = { metadata };
            if (opts?.formName !== undefined) payload.name = opts.formName.trim() || schema.title;
            if (opts?.description !== undefined) payload.description = opts.description || null;
            else if (opts?.branding) payload.description = opts.branding.description.trim() || null;
            await fetch(`/api/admin/forms/${formId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }).catch(() => undefined);
        },
        []
    );

    const createBlankForm = useCallback(
        async (input: {
            name: string;
            description?: string;
            brand_name?: string;
            accent_color?: string;
            origin?: "blank" | "document" | "packet";
        }): Promise<string | null> => {
            const name = input.name.trim();
            setListErr(null);
            try {
                const brandingMeta = brandingMetadataPatch({
                    brand_name: input.brand_name?.trim() ?? "",
                    accent_color: input.accent_color ?? "#00A283",
                    logo_url: null,
                    description: input.description?.trim() ?? "",
                });
                const defRes = await fetch("/api/admin/forms", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name,
                        kind: "center",
                        description: input.description?.trim() || null,
                        metadata: { source: "processing", origin: input.origin ?? "blank", ...brandingMeta },
                    }),
                });
                const defBody = (await defRes.json().catch(() => ({}))) as { data?: { id: string }; error?: string };
                if (!defRes.ok || !defBody.data?.id) throw new Error(defBody.error || `Create failed (${defRes.status})`);
                const formId = defBody.data.id;
                const blankSchema = createBlankSchema(name);
                await fetch(`/api/admin/forms/${formId}/versions`, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ schema_json: blankSchema }),
                });
                await syncFormStats(formId, blankSchema, {
                    description: input.description?.trim() || null,
                    branding: {
                        brand_name: input.brand_name?.trim() ?? "",
                        accent_color: input.accent_color ?? "#00A283",
                        logo_url: null,
                        description: input.description?.trim() ?? "",
                    },
                    existingMeta: { source: "processing", origin: input.origin ?? "blank" },
                });
                await loadForms();
                return formId;
            } catch (e) {
                setListErr(e instanceof Error ? e.message : "Failed to create form");
                return null;
            }
        },
        [loadForms, syncFormStats]
    );

    const saveDraft = useCallback(
        async (
            formId: string,
            versionId: string,
            schema: FormSchemaV1,
            opts?: { branding?: ProcessingFormBranding; existingMeta?: Record<string, unknown>; formName?: string }
        ) => {
            const res = await fetch(`/api/admin/forms/${formId}/versions/${versionId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ schema_json: schema }),
            });
            if (!res.ok) {
                const b = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(b.error || `Save failed (${res.status})`);
            }
            await syncFormStats(formId, schema, {
                branding: opts?.branding,
                existingMeta: opts?.existingMeta,
                formName: opts?.formName ?? schema.title,
            });
        },
        [syncFormStats]
    );

    const publishForm = useCallback(
        async (
            formId: string,
            versionId: string,
            schema: FormSchemaV1,
            opts?: { branding?: ProcessingFormBranding; existingMeta?: Record<string, unknown>; formName?: string }
        ) => {
            await saveDraft(formId, versionId, schema, opts);
            const res = await fetch(`/api/admin/forms/${formId}/versions/${versionId}/publish`, {
                method: "POST",
                credentials: "same-origin",
            });
            if (!res.ok) {
                const b = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(b.error || `Publish failed (${res.status})`);
            }
        },
        [saveDraft]
    );

    const archiveForm = useCallback(
        async (formId: string) => {
            const res = await fetch(`/api/admin/forms/${formId}/archive`, {
                method: "POST",
                credentials: "same-origin",
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(body.error || `Archive failed (${res.status})`);
            setForms((cur) => cur.filter((f) => f.id !== formId));
        },
        []
    );

    const deleteForm = useCallback(async (formId: string) => {
        const res = await fetch(`/api/admin/forms/${formId}`, {
            method: "DELETE",
            credentials: "same-origin",
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error || `Delete failed (${res.status})`);
        setForms((cur) => cur.filter((f) => f.id !== formId));
    }, []);

    return useMemo(
        () => ({
            forms,
            listErr,
            listLoaded,
            loadForms,
            loadFormSchema,
            createBlankForm,
            saveDraft,
            publishForm,
            archiveForm,
            deleteForm,
            patchFormBranding,
            setListErr,
        }),
        [forms, listErr, listLoaded, loadForms, loadFormSchema, createBlankForm, saveDraft, publishForm, archiveForm, deleteForm, patchFormBranding]
    );
}
