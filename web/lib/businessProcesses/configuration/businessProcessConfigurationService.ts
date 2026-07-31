/**
 * THE canonical write boundary for business-process configuration (Law 4).
 *
 * Every operator edit goes: draft save -> validate -> publish. Nothing else may durably write
 * `departments.metadata.lifecycle_builder_v1`; the database guard
 * (20260730130000_business_process_projection_write_guard.sql) enforces that independently of this
 * module, so a future call site cannot quietly reintroduce a direct write.
 *
 * Why a service and not per-route Supabase calls: the inventory found ~15 writers, and a single
 * stage save was 4-6 independent whole-column read-modify-writes with no CAS
 * (docs/platform/governance/business-process-writer-inventory.md). Consolidating them is what makes
 * "one publish = one revision" true.
 *
 * Draft flexibility is deliberate. A draft MAY be structurally invalid — operators need somewhere
 * to build a half-finished process. The hard integrity boundary is publish, not save.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    parseLifecycleBuilderV1,
    serializeLifecycleBuilderV1,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { businessProcessPayloadChecksum } from "@/lib/lifecycle/businessProcessPayloadChecksum";
import { invalidateTenantConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";

export const BUSINESS_PROCESS_DOMAIN_KEY = "business_process" as const;

export type BusinessProcessDraft = {
    id: string;
    departmentId: string;
    /** Stored configuration payload. May be invalid — that is the point of a draft. */
    payload: Record<string, unknown>;
    /** The publication this draft was opened against. The conflict token. */
    baseRevisionId: string | null;
    status: "draft" | "validated";
    validationErrors: unknown[];
};

export type PublishResult = {
    departmentId: string;
    revisionId: string;
    revisionNumber: number;
    publicationId: string;
    publishedAt: string;
};

/** A stale-draft conflict. Carries both sides so the surface can tell the operator what happened. */
export class BusinessProcessStaleDraftError extends Error {
    readonly code = "business_process_draft_stale";
    constructor(
        readonly currentRevisionId: string | null,
        readonly attemptedBaseRevisionId: string | null,
        message: string,
    ) {
        super(message);
        this.name = "BusinessProcessStaleDraftError";
    }
}

export class BusinessProcessDraftInvalidError extends Error {
    readonly code = "business_process_draft_not_validated";
    constructor(readonly validationErrors: unknown[]) {
        super("This configuration cannot be published until its problems are resolved.");
        this.name = "BusinessProcessDraftInvalidError";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read the published projection for a department — what runtime is currently serving.
 * This is a READ of the projection, never a write.
 */
export async function loadPublishedConfiguration(
    supabase: SupabaseClient,
    params: { orgId: string; departmentId: string },
): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", params.departmentId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    const metadata = (data as { metadata?: unknown } | null)?.metadata;
    if (!isRecord(metadata)) return null;
    const builder = metadata[LIFECYCLE_BUILDER_METADATA_KEY];
    return isRecord(builder) ? builder : null;
}

/**
 * Open the draft for editing, creating it from the published projection on first use so the
 * operator starts from what is live rather than from nothing.
 */
export async function openDraft(
    supabase: SupabaseClient,
    params: { orgId: string; departmentId: string; actorUserId?: string | null },
): Promise<BusinessProcessDraft> {
    const existing = await readDraft(supabase, params);
    if (existing) return existing;

    const published = (await loadPublishedConfiguration(supabase, params)) ?? {
        version: 1,
        active_process_id: null,
        processes: [],
    };

    // Seed base_revision_id from the current publication so the very first save already carries the
    // right conflict token — otherwise the first publish would look like a first-ever publish and
    // skip the staleness check.
    const currentRevisionId = await currentPublishedRevisionId(supabase, params);

    const { data, error } = await supabase
        .from("business_process_drafts")
        .insert({
            org_id: params.orgId,
            department_id: params.departmentId,
            payload: published,
            base_revision_id: currentRevisionId,
            draft_status: "draft",
            validation_errors: [],
            created_by: params.actorUserId ?? null,
            updated_by: params.actorUserId ?? null,
        })
        .select("id, department_id, payload, base_revision_id, draft_status, validation_errors")
        .single();
    if (error) throw new Error(error.message);
    return mapDraft(data);
}

export async function readDraft(
    supabase: SupabaseClient,
    params: { orgId: string; departmentId: string },
): Promise<BusinessProcessDraft | null> {
    const { data, error } = await supabase
        .from("business_process_drafts")
        .select("id, department_id, payload, base_revision_id, draft_status, validation_errors")
        .eq("org_id", params.orgId)
        .eq("department_id", params.departmentId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapDraft(data) : null;
}

/**
 * Persist an edit to the draft.
 *
 * Lossless by construction: the payload is round-tripped through the Law 7 parser/serializer, so
 * fields this branch does not understand survive. Any edit resets the draft to unvalidated —
 * validation is a deliberate act, not a side effect of typing.
 */
export async function saveDraft(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        builder: LifecycleBuilderV1;
        actorUserId?: string | null;
    },
): Promise<BusinessProcessDraft> {
    const payload = serializeLifecycleBuilderV1(params.builder);

    const { data, error } = await supabase
        .from("business_process_drafts")
        .update({
            payload,
            draft_status: "draft",
            validation_errors: [],
            validated_at: null,
            validated_by: null,
            updated_by: params.actorUserId ?? null,
            updated_at: new Date().toISOString(),
        })
        .eq("org_id", params.orgId)
        .eq("department_id", params.departmentId)
        .select("id, department_id, payload, base_revision_id, draft_status, validation_errors")
        .single();
    if (error) throw new Error(error.message);
    return mapDraft(data);
}

/**
 * Mark the draft validated (or record why it is not).
 *
 * `validationErrors` comes from the caller so the reference-integrity rules stay in one place
 * (Law 3). This function owns only the draft state transition.
 */
export async function recordDraftValidation(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        validationErrors: unknown[];
        actorUserId?: string | null;
    },
): Promise<BusinessProcessDraft> {
    const valid = params.validationErrors.length === 0;
    const { data, error } = await supabase
        .from("business_process_drafts")
        .update({
            draft_status: valid ? "validated" : "draft",
            validation_errors: params.validationErrors,
            validated_at: valid ? new Date().toISOString() : null,
            validated_by: valid ? (params.actorUserId ?? null) : null,
            updated_by: params.actorUserId ?? null,
            updated_at: new Date().toISOString(),
        })
        .eq("org_id", params.orgId)
        .eq("department_id", params.departmentId)
        .select("id, department_id, payload, base_revision_id, draft_status, validation_errors")
        .single();
    if (error) throw new Error(error.message);
    return mapDraft(data);
}

/**
 * Publish the draft. The ONLY sanctioned way published configuration changes.
 *
 * Everything that makes this safe lives in the RPC — CAS against the publication the draft was
 * based on, immutable revision, publication act, audit event, and the runtime projection, all in
 * one transaction. This function's job is to compute the checksum over the canonical serialization
 * and to translate database errors into something an operator surface can act on.
 */
export async function publishDraft(
    supabase: SupabaseClient,
    params: { orgId: string; departmentId: string; actorUserId?: string | null },
): Promise<PublishResult> {
    const draft = await readDraft(supabase, params);
    if (!draft) throw new Error("There is no draft configuration to publish.");
    if (draft.status !== "validated" || draft.validationErrors.length) {
        throw new BusinessProcessDraftInvalidError(draft.validationErrors);
    }

    const checksum = businessProcessPayloadChecksum(draft.payload);

    const { data, error } = await supabase.rpc("publish_business_process_revision_v1", {
        p_org_id: params.orgId,
        p_department_id: params.departmentId,
        p_actor_user_id: params.actorUserId ?? null,
        p_payload_checksum: checksum,
    });

    if (error) throw translatePublishError(error, draft);

    // The projection changed, so tenant config reads must not keep serving the previous revision.
    invalidateTenantConfigReadCache(params.orgId);
    return mapPublishResult(data);
}

/** Republish a prior revision forward. History is never rewritten. */
export async function rollbackToRevision(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        targetRevisionId: string;
        actorUserId?: string | null;
    },
): Promise<PublishResult> {
    const { data, error } = await supabase.rpc("rollback_business_process_to_revision_v1", {
        p_org_id: params.orgId,
        p_department_id: params.departmentId,
        p_target_revision_id: params.targetRevisionId,
        p_actor_user_id: params.actorUserId ?? null,
    });
    if (error) throw new Error(error.message);
    invalidateTenantConfigReadCache(params.orgId);
    return mapPublishResult(data);
}

async function currentPublishedRevisionId(
    supabase: SupabaseClient,
    params: { orgId: string; departmentId: string },
): Promise<string | null> {
    const { data, error } = await supabase
        .from("configuration_publications")
        .select("revision_id")
        .eq("org_id", params.orgId)
        .eq("domain_key", BUSINESS_PROCESS_DOMAIN_KEY)
        .eq("subject_id", params.departmentId)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { revision_id?: string } | null)?.revision_id ?? null;
}

/**
 * Turn the RPC's SQLSTATE into an operator-facing failure.
 * 40001 is the stale-draft conflict; it is a 409, not a 500.
 */
function translatePublishError(
    error: { message: string; code?: string },
    draft: BusinessProcessDraft,
): Error {
    if (error.message.includes("business_process_draft_stale")) {
        const current = /current_revision=([^\s)]+)/.exec(error.message)?.[1] ?? null;
        return new BusinessProcessStaleDraftError(
            current === "none" ? null : current,
            draft.baseRevisionId,
            "Someone else published a newer version of this configuration while you were editing. " +
                "Reload to see their changes, then reapply yours.",
        );
    }
    if (error.message.includes("business_process_draft_not_validated")) {
        return new BusinessProcessDraftInvalidError(draft.validationErrors);
    }
    return new Error(error.message);
}

function mapDraft(row: unknown): BusinessProcessDraft {
    const r = row as Record<string, unknown>;
    return {
        id: String(r.id),
        departmentId: String(r.department_id),
        payload: isRecord(r.payload) ? r.payload : {},
        baseRevisionId: r.base_revision_id ? String(r.base_revision_id) : null,
        status: r.draft_status === "validated" ? "validated" : "draft",
        validationErrors: Array.isArray(r.validation_errors) ? r.validation_errors : [],
    };
}

function mapPublishResult(data: unknown): PublishResult {
    const d = (isRecord(data) ? data : {}) as Record<string, unknown>;
    return {
        departmentId: String(d.department_id ?? ""),
        revisionId: String(d.revision_id ?? ""),
        revisionNumber: Number(d.revision_number ?? 0),
        publicationId: String(d.publication_id ?? ""),
        publishedAt: String(d.published_at ?? ""),
    };
}

/** Parse a draft payload into the typed builder, preserving unknown fields (Law 7). */
export function draftBuilder(draft: BusinessProcessDraft): LifecycleBuilderV1 | null {
    return parseLifecycleBuilderV1(draft.payload);
}
