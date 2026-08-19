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
import { normalizeBusinessProcessPayloadRequirements } from "@/lib/businessProcesses/configuration/normalizePublishedStageRequirements";
import { invalidateTenantConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";

export const BUSINESS_PROCESS_DOMAIN_KEY = "business_process" as const;

export type BusinessProcessDraft = {
    id: string;
    departmentId: string;
    /** Stored configuration payload. May be invalid — that is the point of a draft. */
    payload: Record<string, unknown>;
    /** The publication this draft was opened against. The PUBLICATION conflict token. */
    baseRevisionId: string | null;
    /**
     * The DRAFT-EDIT conflict token. Advances by one on every payload change.
     * `baseRevisionId` only moves at publish, so it cannot detect two operators editing the same
     * draft between publishes; this can.
     */
    draftRevision: number;
    status: "draft" | "validated";
    validationErrors: unknown[];
};

export type BusinessProcessPublication = {
    revisionId: string;
    revisionNumber: number;
    payloadChecksum: string;
    publishedAt: string;
};

export type PublishResult = {
    departmentId: string;
    revisionId: string;
    revisionNumber: number;
    publicationId: string;
    publishedAt: string;
    /**
     * True when the request changed nothing because this exact payload was ALREADY live from this
     * publication lineage. The identity returned is the existing revision, and no revision,
     * publication, audit event or projection write occurred. Callers use this to say "already
     * applied" instead of implying a new version was cut.
     */
    alreadyPublished: boolean;
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

/**
 * Someone else edited the draft after this editor loaded it.
 *
 * Deliberately a different error from {@link BusinessProcessStaleDraftError}: one means "reload,
 * a colleague is editing", the other means "a newer configuration is already live". Collapsing
 * them would give the operator no way to tell which recovery applies.
 */
export class BusinessProcessDraftEditConflictError extends Error {
    readonly code = "business_process_draft_edit_conflict";
    constructor(
        readonly currentDraftRevision: number | null,
        readonly attemptedDraftRevision: number,
        message: string,
    ) {
        super(message);
        this.name = "BusinessProcessDraftEditConflictError";
    }
}

export class BusinessProcessDraftInvalidError extends Error {
    readonly code = "business_process_draft_not_validated";
    constructor(readonly validationErrors: unknown[]) {
        super("This configuration cannot be published until its problems are resolved.");
        this.name = "BusinessProcessDraftInvalidError";
    }
}

/** Every read of a draft returns the same shape, including both conflict tokens. */
const DRAFT_COLUMNS =
    "id, department_id, payload, base_revision_id, draft_revision, draft_status, validation_errors";

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
 * Open the draft for editing.
 *
 * READ PRECEDENCE — the canonical order every editor surface must follow:
 *
 *   1. the existing editable draft, if there is one;
 *   2. otherwise a new draft seeded from the latest published configuration;
 *   3. otherwise, only for a department with no configuration at all, `templateSeed`.
 *
 * Step 2 reads the published projection through {@link loadPublishedConfiguration} rather than
 * touching `departments.metadata` directly. That matters for every existing tenant: they have
 * `lifecycle_builder_v1` and zero publications, so the projection IS their latest publication until
 * they publish for the first time.
 *
 * Step 3 fires ONCE, at creation, and never again — the template is a seed, never a runtime or
 * reload-time authority (decision D1). A department that already has configuration never reaches it,
 * so a save can never resurrect template defaults an operator deleted.
 */
export async function openDraft(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        actorUserId?: string | null;
        /** Applied only when the department has no published configuration whatsoever. */
        templateSeed?: LifecycleBuilderV1 | null;
    },
): Promise<BusinessProcessDraft> {
    const existing = await readDraft(supabase, params);
    if (existing) return existing;

    const publishedProjection = await loadPublishedConfiguration(supabase, params);
    const published =
        publishedProjection ??
        (params.templateSeed ? serializeLifecycleBuilderV1(params.templateSeed) : null) ?? {
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
        .select(DRAFT_COLUMNS)
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
        .select(DRAFT_COLUMNS)
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
        /**
         * The `draftRevision` the editor loaded. Supplying it makes the write a compare-and-set:
         * if a colleague saved in between, this fails instead of silently overwriting them.
         * Omit only for callers that legitimately have no prior read (migrations, seeds).
         */
        expectedDraftRevision?: number;
    },
): Promise<BusinessProcessDraft> {
    const payload = serializeLifecycleBuilderV1(params.builder);

    // The database trigger requires payload changes to advance the token by exactly one, so the
    // next value is computed here rather than left to a raw `+ 1` PostgREST cannot express.
    const current =
        params.expectedDraftRevision ??
        (await readDraft(supabase, params))?.draftRevision ??
        null;
    if (current == null) {
        throw new Error("There is no draft configuration to save.");
    }

    let query = supabase
        .from("business_process_drafts")
        .update({
            payload,
            draft_revision: current + 1,
            draft_status: "draft",
            validation_errors: [],
            validated_at: null,
            validated_by: null,
            updated_by: params.actorUserId ?? null,
            updated_at: new Date().toISOString(),
        })
        .eq("org_id", params.orgId)
        .eq("department_id", params.departmentId);

    // The compare-and-set. A conditional UPDATE is a single atomic statement, so no RPC is needed.
    query = query.eq("draft_revision", current);

    const { data, error } = await query.select(DRAFT_COLUMNS).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
        const latest = await readDraft(supabase, params);
        throw new BusinessProcessDraftEditConflictError(
            latest?.draftRevision ?? null,
            current,
            "Someone else changed this configuration while you were editing. " +
                "Reload to see their changes, then reapply yours.",
        );
    }
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
        .select(DRAFT_COLUMNS)
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
 *
 * ## D-97 normalization
 *
 * Before the checksum, every stage is made to carry an explicit `requirements_v1` — authored
 * sections preserved exactly, absent ones materialized from the single legacy projection — so the
 * revision this publish stores is a SELF-CONTAINED executable artifact. Without it a pinned
 * instance (D-96) would still have to read live, unversioned department metadata to learn what its
 * stage requires, and a rollback would restore stages without their requirements.
 *
 * The normalized payload is written back to the DRAFT before the RPC runs, because
 * `publish_business_process_revision_v1` inserts `v_draft.payload` verbatim. Normalizing only in
 * memory would store the un-normalized payload under a checksum describing the normalized one.
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

    const normalized = normalizeBusinessProcessPayloadRequirements({
        payload: draft.payload,
        departmentMetadata: await readDepartmentMetadata(supabase, params),
    });

    if (normalized.changed) {
        // CAS on the draft-edit token, for the same reason `saveDraft` does: between reading the
        // draft and the RPC reading it again, a concurrent save could replace the payload — and the
        // RPC would then store THEIR payload under the checksum computed for OURS. Status and
        // validation are deliberately left alone: materializing requirements the tenant already had
        // cannot invalidate a draft that was just validated.
        //
        // `draft_revision` MUST advance here. `guard_business_process_draft_revision` makes the
        // optimistic token structural — a payload change that does not advance it by exactly one is
        // refused — so this write, which changes the payload, has to move the token like any other
        // edit. Omitting it made every publish that normalization touches fail, which is every
        // tenant's FIRST publish after D-97: theirs is the only case where stages still lack
        // `requirements_v1` and normalization therefore has something to do. Firefly hit it exactly
        // there, and the trigger's refusal reached the client as a dropped socket rather than a
        // PostgREST error, which is why it read as a network fault for two attempts.
        const { data: rebased, error: rebaseError } = await supabase
            .from("business_process_drafts")
            .update({ payload: normalized.payload, draft_revision: draft.draftRevision + 1 })
            .eq("id", draft.id)
            .eq("org_id", params.orgId)
            .eq("draft_revision", draft.draftRevision)
            .select("id")
            .maybeSingle();
        if (rebaseError) throw new Error(rebaseError.message);
        if (!rebased) {
            const latest = await readDraft(supabase, params);
            throw new BusinessProcessDraftEditConflictError(
                latest?.draftRevision ?? null,
                draft.draftRevision,
                "Someone else changed this configuration while it was being published. " +
                    "Reload to see their changes, then publish again.",
            );
        }
    }

    const checksum = businessProcessPayloadChecksum(normalized.payload);

    const { data, error } = await supabase.rpc("publish_business_process_revision_v1", {
        p_org_id: params.orgId,
        p_department_id: params.departmentId,
        p_actor_user_id: params.actorUserId ?? null,
        p_payload_checksum: checksum,
    });

    if (error) throw translatePublishError(error, draft);

    const result = mapPublishResult(data);
    // Only bust the cache when the projection actually moved. A no-op republish leaves the
    // projection byte-identical, so invalidating would evict warm config for no reason.
    if (!result.alreadyPublished) invalidateTenantConfigReadCache(params.orgId);
    return result;
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
    const result = mapPublishResult(data);
    if (!result.alreadyPublished) invalidateTenantConfigReadCache(params.orgId);
    return result;
}

/** The latest publication for a department, or null before the first publish. */
export async function latestPublication(
    supabase: SupabaseClient,
    params: { orgId: string; departmentId: string },
): Promise<BusinessProcessPublication | null> {
    const { data, error } = await supabase
        .from("configuration_publications")
        .select("revision_id, revision_number, payload_checksum, published_at")
        .eq("org_id", params.orgId)
        .eq("domain_key", BUSINESS_PROCESS_DOMAIN_KEY)
        .eq("subject_id", params.departmentId)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
        revisionId: String(row.revision_id ?? ""),
        revisionNumber: Number(row.revision_number ?? 0),
        payloadChecksum: String(row.payload_checksum ?? ""),
        publishedAt: String(row.published_at ?? ""),
    };
}

/**
 * The department's live metadata, for D-97 normalization.
 *
 * Read here rather than passed in because publish is the only caller that needs it and the legacy
 * requirement stores live nowhere else. Note this reads the LIVE metadata deliberately: what a
 * never-authored stage requires TODAY is exactly what the revision being published must capture.
 */
async function readDepartmentMetadata(
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
    return metadata != null && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : null;
}

async function currentPublishedRevisionId(
    supabase: SupabaseClient,
    params: { orgId: string; departmentId: string },
): Promise<string | null> {
    return (await latestPublication(supabase, params))?.revisionId ?? null;
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
        draftRevision: Number(r.draft_revision ?? 1),
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
        alreadyPublished: d.already_published === true,
    };
}

/** Parse a draft payload into the typed builder, preserving unknown fields (Law 7). */
export function draftBuilder(draft: BusinessProcessDraft): LifecycleBuilderV1 | null {
    return parseLifecycleBuilderV1(draft.payload);
}
