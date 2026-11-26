"use client";

import { useCallback, useEffect, useState } from "react";

import type { DocumentCategory, DocumentTypeSummary, DocumentTypeVersion } from "@/lib/documents/configuration/documentConfigurationService";
import type { DocumentTypeDraft, PolicyProblem } from "@/lib/documents/configuration/documentTypePolicy";

/** Data access for Studio → Documents. Every write is a server route; the client never touches the database. */
export type StudioResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null; error: string };

async function call<T>(url: string, init?: RequestInit): Promise<StudioResult<T>> {
    try {
        const res = await fetch(url, {
            credentials: "include",
            ...init,
            headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
            return { ok: false, status: res.status, code: typeof json.code === "string" ? json.code : null, error: typeof json.error === "string" ? json.error : "Request failed" };
        }
        return { ok: true, data: json as T };
    } catch (e) {
        return { ok: false, status: 0, code: null, error: (e as Error).message };
    }
}

const BASE = "/api/admin/documents/configuration";

export const documentStudioApi = {
    listCategories: () => call<{ categories: DocumentCategory[] }>(`${BASE}/categories`),
    createCategory: (body: { label: string; key?: string; description?: string | null; parent_id?: string | null }) =>
        call<{ category: DocumentCategory }>(`${BASE}/categories`, { method: "POST", body: JSON.stringify(body) }),
    updateCategory: (id: string, body: Record<string, unknown>) =>
        call<{ category: DocumentCategory }>(`${BASE}/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteCategory: (id: string) => call<{ deleted: true }>(`${BASE}/categories/${id}`, { method: "DELETE" }),
    listTypes: () => call<{ types: DocumentTypeSummary[]; enforcement: Record<string, string> }>(`${BASE}/types`),
    getType: (id: string) => call<{ type: DocumentTypeSummary; versions: DocumentTypeVersion[]; enforcement: Record<string, string> }>(`${BASE}/types/${id}`),
    createType: (body: DocumentTypeDraft & { key?: string }) => call<{ type_id: string; version_id: string }>(`${BASE}/types`, { method: "POST", body: JSON.stringify(body) }),
    saveDraft: (id: string, draft: DocumentTypeDraft) =>
        call<{ version_id: string; version_number: number; problems: PolicyProblem[] }>(`${BASE}/types/${id}/draft`, { method: "PUT", body: JSON.stringify(draft) }),
    discardDraft: (id: string) => call<{ discarded: true; version_id: string; version_number: number }>(`${BASE}/types/${id}/draft`, { method: "DELETE" }),
    validate: (id: string, versionId: string) =>
        call<{ valid: boolean; problems: PolicyProblem[] }>(`${BASE}/types/${id}/validate`, { method: "POST", body: JSON.stringify({ version_id: versionId }) }),
    publish: (id: string, versionId: string, expected: string | null) =>
        call<{ version_id: string; version_number: number }>(`${BASE}/types/${id}/publish`, {
            method: "POST",
            body: JSON.stringify({ version_id: versionId, expected_published_version_id: expected }),
        }),
    setTypeStatus: (id: string, action: "archive" | "activate") => call<{ status: string }>(`${BASE}/types/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
    deleteType: (id: string) => call<{ deleted: true }>(`${BASE}/types/${id}`, { method: "DELETE" }),
};

/** The library: categories and types, reloaded after every write. */
export function useDocumentStudioLibrary() {
    const [categories, setCategories] = useState<DocumentCategory[]>([]);
    const [types, setTypes] = useState<DocumentTypeSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        const [c, t] = await Promise.all([documentStudioApi.listCategories(), documentStudioApi.listTypes()]);
        if (!c.ok || !t.ok) {
            setError((!c.ok ? c.error : !t.ok ? t.error : null) ?? "Failed to load");
        } else {
            setCategories(c.data.categories);
            setTypes(t.data.types);
        }
        setLoading(false);
    }, []);
    useEffect(() => {
        void reload();
    }, [reload]);
    return { categories, types, loading, error, reload };
}
