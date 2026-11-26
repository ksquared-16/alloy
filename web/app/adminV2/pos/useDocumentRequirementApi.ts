"use client";

import type { DocumentRequirementSummary, DocumentRequirementVersion, DocumentRequirementWaiver } from "@/lib/documents/requirements/documentRequirementConfigService";
import type { DocumentRequirementDraft, RequirementProblem } from "@/lib/documents/requirements/documentRequirementPolicy";
import type { RequirementWorkRow } from "@/lib/documents/requirements/documentRequirementService";

import type { StudioResult } from "./useDocumentStudioApi";

/** Data access for D6 requirements, readiness, work and waivers. Every read and write is a server route. */
async function call<T>(url: string, init?: RequestInit): Promise<StudioResult<T>> {
    try {
        const res = await fetch(url, { credentials: "include", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) return { ok: false, status: res.status, code: typeof json.code === "string" ? json.code : null, error: typeof json.error === "string" ? json.error : "Request failed" };
        return { ok: true, data: json as T };
    } catch (e) {
        return { ok: false, status: 0, code: null, error: (e as Error).message };
    }
}

const CFG = "/api/admin/documents/configuration/requirements";
const REQ = "/api/admin/documents/requirements";

export const documentRequirementApi = {
    list: () => call<{ requirements: DocumentRequirementSummary[] }>(CFG),
    get: (id: string) =>
        call<{ requirement: { id: string; key: string; status: "active" | "archived"; published_version_id: string | null }; versions: DocumentRequirementVersion[] }>(`${CFG}/${id}`),
    create: (body: DocumentRequirementDraft & { key?: string }) => call<{ requirement_id: string; version_id: string }>(CFG, { method: "POST", body: JSON.stringify(body) }),
    saveDraft: (id: string, draft: DocumentRequirementDraft) =>
        call<{ version_id: string; version_number: number; problems: RequirementProblem[] }>(`${CFG}/${id}/draft`, { method: "PUT", body: JSON.stringify(draft) }),
    validate: (id: string, versionId: string) =>
        call<{ valid: boolean; problems: RequirementProblem[] }>(`${CFG}/${id}/validate`, { method: "POST", body: JSON.stringify({ version_id: versionId }) }),
    publish: (id: string, versionId: string, expected: string | null) =>
        call<{ version_id: string; version_number: number }>(`${CFG}/${id}/publish`, { method: "POST", body: JSON.stringify({ version_id: versionId, expected_published_version_id: expected }) }),
    setStatus: (id: string, action: "archive" | "activate") => call<{ status: string }>(`${CFG}/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
    remove: (id: string) => call<{ deleted: true }>(`${CFG}/${id}`, { method: "DELETE" }),
    work: () => call<{ rows: RequirementWorkRow[]; truncated: boolean; today: string }>(`${REQ}/work`),
    waivers: (subjectType: string, subjectId: string) =>
        call<{ waivers: DocumentRequirementWaiver[] }>(`${REQ}/waivers?subject_type=${encodeURIComponent(subjectType)}&subject_id=${encodeURIComponent(subjectId)}`),
    grantWaiver: (body: { requirement_id: string; subject_type: string; subject_id: string; reason: string; effective_until?: string | null }) =>
        call<{ waiver_id: string }>(`${REQ}/waivers`, { method: "POST", body: JSON.stringify(body) }),
    revokeWaiver: (waiverId: string, reason: string) => call<{ waiver_id: string }>(`${REQ}/waivers/${waiverId}`, { method: "PATCH", body: JSON.stringify({ action: "revoke", reason }) }),
};
