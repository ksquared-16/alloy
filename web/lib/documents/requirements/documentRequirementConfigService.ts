/**
 * D6 — document requirement configuration and waivers: the server-side operations behind
 * `/api/admin/documents/configuration/requirements/*` and `/api/admin/documents/requirements/waivers/*`.
 *
 * Every write goes through the service-role client into tables the database guards (migration 20261212090000):
 * stable keys, immutable published versions, publication only through `document_requirement_publish`
 * (compare-and-swap), validation only through `document_requirement_validate`, waivers only through
 * `document_requirement_waiver_grant` / `_revoke`. This module maps the database's typed refusals to stable codes; it
 * never re-implements a guard the database already holds.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isForbiddenQaOrgId, isRegisteredQaOrgId } from "@/lib/qa/sharedQaRegistry";

import {
    documentRequirementDraftProblems,
    type DocumentRequirementDraft,
    type RequirementProblem,
} from "@/lib/documents/requirements/documentRequirementPolicy";

export type RequirementConfigError = { ok: false; code: string; status: number; message: string };
export type RequirementConfigResult<T> = { ok: true; value: T } | RequirementConfigError;

const REFUSALS: Array<[RegExp, string, number]> = [
    [/document_requirement_identity|document_requirement_version_identity/, "IDENTITY_IMMUTABLE", 409],
    [/document_requirement_in_use/, "REQUIREMENT_IN_USE", 409],
    [/document_requirement_archived/, "REQUIREMENT_ARCHIVED", 409],
    [/document_requirement_publish_conflict/, "PUBLISH_CONFLICT", 409],
    [/document_requirement_version_not_validated/, "NOT_VALIDATED", 409],
    [/document_requirement_version_not_open/, "VERSION_NOT_OPEN", 409],
    [/document_requirement_version_invalid/, "INVALID", 400],
    [/document_requirement_version_immutable/, "VERSION_IMMUTABLE", 409],
    [/document_requirement_not_live/, "REQUIREMENT_NOT_LIVE", 409],
    [/document_requirement_not_waivable/, "NOT_WAIVABLE", 409],
    [/document_requirement_waiver_grain/, "WAIVER_SUBJECT_GRAIN", 400],
    [/document_requirement_waiver_subject_unresolved/, "NOT_FOUND", 404],
    [/document_requirement_waiver_reason_required/, "REASON_REQUIRED", 400],
    [/document_requirement_waiver_already_expired/, "WAIVER_ALREADY_EXPIRED", 400],
    [/document_requirement_waiver_exists/, "WAIVER_EXISTS", 409],
    [/document_requirement_waiver_not_active/, "WAIVER_NOT_ACTIVE", 409],
    [/document_requirement_waiver_not_found/, "NOT_FOUND", 404],
    [/document_requirement_purge_refused/, "PURGE_REFUSED", 409],
    [/document_requirement_not_found|document_requirement_version_not_found/, "NOT_FOUND", 404],
    [/uq_document_requirements_key/, "KEY_TAKEN", 409],
    [/chk_document_requirements_key/, "KEY_INVALID", 400],
];

function refusal(error: { message?: string } | null | undefined): RequirementConfigError {
    const message = error?.message ?? "unknown error";
    for (const [re, code, status] of REFUSALS) if (re.test(message)) return { ok: false, code, status, message };
    return { ok: false, code: "REQUIREMENT_WRITE_FAILED", status: 500, message };
}

export type DocumentRequirementVersion = DocumentRequirementDraft & {
    id: string;
    requirement_id: string;
    version_number: number;
    status: "draft" | "validated" | "published" | "superseded";
    validation_errors: RequirementProblem[];
    created_at: string;
    published_at: string | null;
    superseded_at: string | null;
};
export type DocumentRequirementIdentity = {
    id: string;
    key: string;
    status: "active" | "archived";
    published_version_id: string | null;
    created_at: string;
    archived_at: string | null;
};
export type DocumentRequirementSummary = DocumentRequirementIdentity & {
    published: DocumentRequirementVersion | null;
    open_draft: DocumentRequirementVersion | null;
};

const IDENTITY_COLUMNS = "id, key, status, published_version_id, created_at, archived_at";
export const REQUIREMENT_VERSION_COLUMNS =
    "id, requirement_id, version_number, status, label, description, document_type_key, subject_type, scope, timing, policy, waivable, effective_from, effective_until, validation_errors, created_at, published_at, superseded_at";

export async function listRequirements(supabase: SupabaseClient, orgId: string): Promise<RequirementConfigResult<DocumentRequirementSummary[]>> {
    const [{ data: reqs, error: rErr }, { data: versions, error: vErr }] = await Promise.all([
        supabase.from("document_requirements").select(IDENTITY_COLUMNS).eq("org_id", orgId).order("key"),
        supabase.from("document_requirement_versions").select(REQUIREMENT_VERSION_COLUMNS).eq("org_id", orgId).in("status", ["published", "draft", "validated"]),
    ]);
    if (rErr || vErr) return refusal(rErr ?? vErr);
    const byReq = new Map<string, DocumentRequirementVersion[]>();
    for (const v of (versions ?? []) as DocumentRequirementVersion[]) {
        const list = byReq.get(v.requirement_id) ?? [];
        list.push(v);
        byReq.set(v.requirement_id, list);
    }
    return {
        ok: true,
        value: ((reqs ?? []) as DocumentRequirementIdentity[]).map((r) => {
            const vs = byReq.get(r.id) ?? [];
            return {
                ...r,
                published: vs.find((v) => v.status === "published") ?? null,
                open_draft: vs.find((v) => v.status === "draft" || v.status === "validated") ?? null,
            };
        }),
    };
}

export async function getRequirement(
    supabase: SupabaseClient,
    orgId: string,
    requirementId: string,
): Promise<RequirementConfigResult<{ requirement: DocumentRequirementIdentity; versions: DocumentRequirementVersion[] }>> {
    const { data, error } = await supabase.from("document_requirements").select(IDENTITY_COLUMNS).eq("org_id", orgId).eq("id", requirementId).maybeSingle();
    if (error) return refusal(error);
    if (!data) return { ok: false, code: "NOT_FOUND", status: 404, message: "requirement not found" };
    const { data: versions, error: vErr } = await supabase
        .from("document_requirement_versions")
        .select(REQUIREMENT_VERSION_COLUMNS)
        .eq("org_id", orgId)
        .eq("requirement_id", requirementId)
        .order("version_number", { ascending: false });
    if (vErr) return refusal(vErr);
    return { ok: true, value: { requirement: data as DocumentRequirementIdentity, versions: (versions ?? []) as DocumentRequirementVersion[] } };
}

function draftColumns(draft: DocumentRequirementDraft) {
    return {
        label: draft.label,
        description: draft.description ?? null,
        document_type_key: draft.document_type_key,
        subject_type: draft.subject_type,
        scope: draft.scope,
        timing: draft.timing,
        policy: draft.policy,
        waivable: draft.waivable,
        effective_from: draft.effective_from,
        effective_until: draft.effective_until,
    };
}

export async function createRequirement(
    supabase: SupabaseClient,
    input: { requirementId: string; orgId: string; key: string; draft: DocumentRequirementDraft; actorUserId: string },
): Promise<RequirementConfigResult<{ requirement_id: string; version_id: string }>> {
    const { data, error } = await supabase
        .from("document_requirements")
        .insert({ id: input.requirementId, org_id: input.orgId, key: input.key, created_by: input.actorUserId, updated_by: input.actorUserId })
        .select("id")
        .single();
    if (error) return refusal(error);
    const requirementId = (data as { id: string }).id;
    const { data: version, error: vErr } = await supabase
        .from("document_requirement_versions")
        .insert({ org_id: input.orgId, requirement_id: requirementId, version_number: 1, status: "draft", ...draftColumns(input.draft), created_by: input.actorUserId, updated_by: input.actorUserId })
        .select("id")
        .single();
    if (vErr) {
        // Nothing references the identity yet; remove it so a failed create leaves nothing behind.
        await supabase.from("document_requirements").delete().eq("org_id", input.orgId).eq("id", requirementId);
        return refusal(vErr);
    }
    return { ok: true, value: { requirement_id: requirementId, version_id: (version as { id: string }).id } };
}

/** Save the open draft, or open a new revision (n+1) when only published/superseded versions exist. */
export async function saveRequirementDraft(
    supabase: SupabaseClient,
    input: { orgId: string; requirementId: string; draft: DocumentRequirementDraft; actorUserId: string },
): Promise<RequirementConfigResult<{ version_id: string; version_number: number; created: boolean }>> {
    const got = await getRequirement(supabase, input.orgId, input.requirementId);
    if (!got.ok) return got;
    const open = got.value.versions.find((v) => v.status === "draft" || v.status === "validated");
    if (open) {
        const { data, error } = await supabase
            .from("document_requirement_versions")
            .update({ ...draftColumns(input.draft), updated_by: input.actorUserId, validation_errors: [] })
            .eq("org_id", input.orgId)
            .eq("id", open.id)
            .select("id")
            .maybeSingle();
        if (error) return refusal(error);
        if (!data) return { ok: false, code: "NOT_FOUND", status: 404, message: "draft not found" };
        return { ok: true, value: { version_id: open.id, version_number: open.version_number, created: false } };
    }
    const next = Math.max(0, ...got.value.versions.map((v) => v.version_number)) + 1;
    const { data, error } = await supabase
        .from("document_requirement_versions")
        .insert({ org_id: input.orgId, requirement_id: input.requirementId, version_number: next, status: "draft", ...draftColumns(input.draft), created_by: input.actorUserId, updated_by: input.actorUserId })
        .select("id")
        .single();
    if (error) return refusal(error);
    return { ok: true, value: { version_id: (data as { id: string }).id, version_number: next, created: true } };
}

export async function discardRequirementDraft(
    supabase: SupabaseClient,
    input: { orgId: string; requirementId: string },
): Promise<RequirementConfigResult<{ version_id: string; version_number: number }>> {
    const got = await getRequirement(supabase, input.orgId, input.requirementId);
    if (!got.ok) return got;
    const open = got.value.versions.find((v) => v.status === "draft" || v.status === "validated");
    if (!open) return { ok: false, code: "NO_OPEN_DRAFT", status: 404, message: "the requirement has no unpublished draft" };
    if (got.value.versions.length === 1) return { ok: false, code: "ONLY_VERSION", status: 409, message: "delete the requirement instead" };
    const { data, error } = await supabase
        .from("document_requirement_versions")
        .delete()
        .eq("org_id", input.orgId)
        .eq("id", open.id)
        .in("status", ["draft", "validated"])
        .select("id");
    if (error) return refusal(error);
    if (!data || data.length === 0) return { ok: false, code: "NO_OPEN_DRAFT", status: 404, message: "the draft is no longer open" };
    return { ok: true, value: { version_id: open.id, version_number: open.version_number } };
}

export async function validateRequirementVersion(
    supabase: SupabaseClient,
    input: { orgId: string; versionId: string; actorUserId: string },
): Promise<RequirementConfigResult<{ valid: boolean; problems: RequirementProblem[] }>> {
    const { data, error } = await supabase.rpc("document_requirement_validate", { p_org_id: input.orgId, p_version_id: input.versionId, p_actor: input.actorUserId });
    if (error) return refusal(error);
    const r = (data ?? {}) as { valid?: boolean; problems?: RequirementProblem[] };
    return { ok: true, value: { valid: r.valid === true, problems: r.problems ?? [] } };
}

export async function publishRequirementVersion(
    supabase: SupabaseClient,
    input: { orgId: string; requirementId: string; versionId: string; expectedPublishedVersionId: string | null; actorUserId: string },
): Promise<RequirementConfigResult<{ version_id: string; version_number: number; superseded_version_id: string | null }>> {
    const { data, error } = await supabase.rpc("document_requirement_publish", {
        p_org_id: input.orgId,
        p_requirement_id: input.requirementId,
        p_version_id: input.versionId,
        p_expected_published_version_id: input.expectedPublishedVersionId,
        p_actor: input.actorUserId,
    });
    if (error) return refusal(error);
    return { ok: true, value: data as { version_id: string; version_number: number; superseded_version_id: string | null } };
}

export async function setRequirementStatus(
    supabase: SupabaseClient,
    input: { orgId: string; requirementId: string; status: "active" | "archived"; actorUserId: string },
): Promise<RequirementConfigResult<{ id: string; status: string }>> {
    const { data, error } = await supabase
        .from("document_requirements")
        .update({ status: input.status, updated_by: input.actorUserId, ...(input.status === "archived" ? { archived_by: input.actorUserId } : {}) })
        .eq("org_id", input.orgId)
        .eq("id", input.requirementId)
        .select("id, status")
        .maybeSingle();
    if (error) return refusal(error);
    if (!data) return { ok: false, code: "NOT_FOUND", status: 404, message: "requirement not found" };
    return { ok: true, value: data as { id: string; status: string } };
}

/**
 * The QA fixture purge is bounded by organization AND run: only an ARCHIVED requirement in a registered QA organization
 * (QA Shared / QA Secondary, never Firefly or a tenant) whose key is in the named governed run's namespace
 * (`qa_<run>_…` for `qar_<run>`) is ever purged. `document_requirement_purge` re-checks every condition.
 */
export const QA_RUN_ID = /^qar_([a-z0-9]{8,40})$/;

export function qaRunRequirementPrefix(qaRunId: string): string | null {
    const m = QA_RUN_ID.exec(qaRunId);
    return m ? `qa_${m[1]}_` : null;
}

export function requirementIsPurgeableFixture(orgId: string, r: { key: string; status: string }, qaRunId: string | null | undefined): boolean {
    if (r.status !== "archived" || !qaRunId || !isRegisteredQaOrgId(orgId) || isForbiddenQaOrgId(orgId)) return false;
    const prefix = qaRunRequirementPrefix(qaRunId);
    return prefix !== null && r.key.startsWith(prefix) && /^qa_[a-z0-9_]+$/.test(r.key);
}

/** Remove an archived QA run's fixture requirement with its versions and waivers (the database re-checks every bound). */
export async function purgeFixtureRequirement(
    supabase: SupabaseClient,
    orgId: string,
    requirementId: string,
    qaRunId: string,
): Promise<RequirementConfigResult<{ requirement_id: string; versions: number; waivers: number }>> {
    const { data, error } = await supabase.rpc("document_requirement_purge", { p_org_id: orgId, p_requirement_id: requirementId, p_qa_run_id: qaRunId });
    if (error) return refusal(error);
    return { ok: true, value: data as { requirement_id: string; versions: number; waivers: number } };
}

export async function deleteRequirement(supabase: SupabaseClient, orgId: string, requirementId: string): Promise<RequirementConfigResult<{ id: string }>> {
    const { data, error } = await supabase.from("document_requirements").delete().eq("org_id", orgId).eq("id", requirementId).select("id");
    if (error) return refusal(error);
    if (!data || data.length === 0) return { ok: false, code: "NOT_FOUND", status: 404, message: "requirement not found" };
    return { ok: true, value: { id: requirementId } };
}

/** The editor's problems before validation, with the server-only context (published type grains, duplicates) filled in. */
export async function previewRequirementProblems(
    supabase: SupabaseClient,
    input: { orgId: string; requirementId: string | null; draft: DocumentRequirementDraft },
): Promise<RequirementProblem[]> {
    const typeSubjectTypes = await publishedTypeSubjectTypes(supabase, input.orgId, input.draft.document_type_key);
    let duplicate = false;
    const { data: live } = await supabase
        .from("document_requirement_versions")
        .select("requirement_id, document_type_key, subject_type, scope")
        .eq("org_id", input.orgId)
        .eq("status", "published")
        .eq("document_type_key", input.draft.document_type_key)
        .eq("subject_type", input.draft.subject_type);
    const liveIds = ((live ?? []) as Array<{ requirement_id: string; scope: unknown }>)
        .filter((v) => v.requirement_id !== input.requirementId && JSON.stringify(v.scope) === JSON.stringify(input.draft.scope))
        .map((v) => v.requirement_id);
    if (liveIds.length > 0) {
        const { data: active } = await supabase.from("document_requirements").select("id").eq("org_id", input.orgId).eq("status", "active").in("id", liveIds);
        duplicate = ((active ?? []) as unknown[]).length > 0;
    }
    return documentRequirementDraftProblems(input.draft, { typeSubjectTypes, duplicate });
}

async function publishedTypeSubjectTypes(supabase: SupabaseClient, orgId: string, key: string): Promise<string[] | null> {
    if (!key) return null;
    const { data: type } = await supabase.from("document_types").select("id, status, published_version_id").eq("org_id", orgId).eq("key", key).maybeSingle();
    const t = type as { status?: string; published_version_id?: string | null } | null;
    if (!t || t.status !== "active" || !t.published_version_id) return null;
    const { data: v } = await supabase.from("document_type_versions").select("subject_types").eq("org_id", orgId).eq("id", t.published_version_id).maybeSingle();
    return v ? (((v as { subject_types?: string[] }).subject_types ?? []) as string[]) : null;
}

// ── waivers ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type DocumentRequirementWaiver = {
    id: string;
    requirement_id: string;
    requirement_version_id: string;
    subject_type: string;
    subject_id: string;
    reason: string;
    state: "active" | "revoked";
    effective_until: string | null;
    granted_by: string;
    granted_at: string;
    revoked_by: string | null;
    revoked_at: string | null;
    revoke_reason: string | null;
};
export const WAIVER_COLUMNS =
    "id, requirement_id, requirement_version_id, subject_type, subject_id, reason, state, effective_until, granted_by, granted_at, revoked_by, revoked_at, revoke_reason";

export async function getWaiver(supabase: SupabaseClient, orgId: string, waiverId: string): Promise<DocumentRequirementWaiver | null> {
    const { data } = await supabase.from("document_requirement_waivers").select(WAIVER_COLUMNS).eq("org_id", orgId).eq("id", waiverId).maybeSingle();
    return (data as DocumentRequirementWaiver | null) ?? null;
}

export async function grantRequirementWaiver(
    supabase: SupabaseClient,
    input: { orgId: string; requirementId: string; subjectType: string; subjectId: string; reason: string; effectiveUntil: string | null; actorUserId: string },
): Promise<RequirementConfigResult<{ waiver_id: string; requirement_version_id: string }>> {
    const { data, error } = await supabase.rpc("document_requirement_waiver_grant", {
        p_org_id: input.orgId,
        p_requirement_id: input.requirementId,
        p_subject_type: input.subjectType,
        p_subject_id: input.subjectId,
        p_reason: input.reason,
        p_effective_until: input.effectiveUntil,
        p_actor: input.actorUserId,
    });
    if (error) return refusal(error);
    return { ok: true, value: data as { waiver_id: string; requirement_version_id: string } };
}

export async function revokeRequirementWaiver(
    supabase: SupabaseClient,
    input: { orgId: string; waiverId: string; reason: string; actorUserId: string },
): Promise<RequirementConfigResult<{ waiver_id: string; requirement_id: string }>> {
    const { data, error } = await supabase.rpc("document_requirement_waiver_revoke", {
        p_org_id: input.orgId,
        p_waiver_id: input.waiverId,
        p_reason: input.reason,
        p_actor: input.actorUserId,
    });
    if (error) return refusal(error);
    return { ok: true, value: data as { waiver_id: string; requirement_id: string } };
}
