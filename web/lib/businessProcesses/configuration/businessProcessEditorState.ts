/**
 * THE canonical configuration read for editor surfaces (Law 4, editor slice 2).
 *
 * Slice 1 made the stage save write a draft. That left the editor telling a lie: it saved to the
 * draft and reloaded from the published projection, so an operator's change appeared to vanish.
 * This module is the other half — one read contract, one answer to "what am I editing, what is
 * live, and do they differ?".
 *
 * READ PRECEDENCE
 *
 *   editing   draft -> (create from latest publication) -> (create from template, once, at creation)
 *   runtime   the published projection ONLY
 *
 * Runtime never reads a draft, and the editor never reads `departments.metadata.lifecycle_builder_v1`
 * except through `loadPublishedConfiguration` — which it does only to show the operator what is
 * currently live beside what they are editing.
 *
 * THE THREE STATES THE UI MUST NOT CONFLATE
 *
 *   draft      what you are editing; may be invalid; saved edits live here
 *   published  the latest immutable revision + publication act
 *   runtime    `departments.metadata.lifecycle_builder_v1`, rewritten only by the publish RPC
 *
 * A single "Saved" indicator over these three is what made the previous model unfalsifiable. The
 * status returned here distinguishes them, and `unpublished_changes` is computed by comparing
 * canonical checksums rather than by trusting a timestamp.
 *
 * THE DRAFT LIFECYCLE, decided here and documented in configuration-publication-model.md:
 * a draft is **retained and rebased**, never closed. `business_process_drafts` is UNIQUE per
 * department and the publish RPC already sets `base_revision_id = <new revision>` rather than
 * deleting the row, so publishing leaves exactly one draft that is now equal to what is live.
 * "Unpublished changes" is therefore a checksum comparison, not a row-existence question — which
 * also means an operator never loses their editing context by publishing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    latestPublication,
    loadPublishedConfiguration,
    openDraft,
    readDraft,
    type BusinessProcessDraft,
    type BusinessProcessPublication,
} from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import {
    validateBusinessProcessForPublish,
    type PublishValidationResult,
} from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { businessProcessPayloadChecksum } from "@/lib/lifecycle/businessProcessPayloadChecksum";
import type { LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

/**
 * What the editor shows in its status area. Each value is a distinct thing an operator can act on,
 * which is the point — `saved` and `published` are not the same claim.
 */
export type BusinessProcessDraftStatus =
    /** Draft equals what is live. Nothing to publish. */
    | "published"
    /**
     * Draft equals what runtime is serving, but no revision has ever been published.
     *
     * This is the state EVERY existing tenant starts in: they have `lifecycle_builder_v1` and zero
     * publications. Calling it "Published" while also reporting "never published" is a plain
     * contradiction on the operator's screen, so it gets its own status.
     */
    | "never_published"
    /** Draft differs from the publication and can be published. */
    | "unpublished_changes"
    /** Draft differs and cannot be published until its blocking issues are resolved. */
    | "publication_blocked"
    /** A newer revision was published after this draft was based on its predecessor. */
    | "draft_conflict";

export type BusinessProcessEditorState = {
    department_id: string;
    /** The editable configuration. This is what the editor renders. */
    draft_payload: Record<string, unknown>;
    /** Optimistic-concurrency token for draft EDITS — send it back on save. */
    draft_revision: number;
    draft_id: string;
    /** The publication this draft was opened against — the PUBLICATION conflict token. */
    base_revision_id: string | null;
    /** The publication currently serving runtime, or null before the first publish. */
    published_revision_id: string | null;
    published_revision_number: number | null;
    published_at: string | null;
    /** True when someone published after this draft was based on an earlier revision. */
    draft_is_stale: boolean;
    /** True when the draft differs from what is published (canonical checksum comparison). */
    unpublished_changes: boolean;
    status: BusinessProcessDraftStatus;
    /** Populated by an explicit Validate, or by any read once the draft diverges. */
    validation: PublishValidationResult;
    /**
     * The configuration runtime is serving right now. Supplied so the editor can show
     * "live vs editing" honestly rather than implying its own draft is live.
     */
    published_payload: Record<string, unknown> | null;
    /** Always true while unpublished changes exist: runtime will not move until a publish. */
    publication_required: boolean;
};

/**
 * Load the canonical editor state, materializing the draft on first use.
 *
 * `templateSeed` is forwarded to {@link openDraft} and applies ONLY to a department with no
 * configuration at all. An existing department can never reach it, so template defaults cannot
 * reappear after creation (decision D1).
 */
export async function loadBusinessProcessEditorState(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        actorUserId?: string | null;
        templateSeed?: LifecycleBuilderV1 | null;
        /** Skip draft creation — returns null when no draft exists yet. */
        readOnly?: boolean;
    },
): Promise<BusinessProcessEditorState | null> {
    const draft = params.readOnly
        ? await readDraft(supabase, params)
        : await openDraft(supabase, params);
    if (!draft) return null;

    const [publication, publishedPayload] = await Promise.all([
        latestPublication(supabase, params),
        loadPublishedConfiguration(supabase, params),
    ]);

    return buildBusinessProcessEditorState({
        departmentId: params.departmentId,
        draft,
        publication,
        publishedPayload,
    });
}

/**
 * The pure half — every derived flag in one place so the API, the tests and any future surface
 * agree on what "published" means.
 */
export function buildBusinessProcessEditorState(input: {
    departmentId: string;
    draft: BusinessProcessDraft;
    publication: BusinessProcessPublication | null;
    publishedPayload: Record<string, unknown> | null;
}): BusinessProcessEditorState {
    const { draft, publication, publishedPayload } = input;

    const draftChecksum = businessProcessPayloadChecksum(draft.payload);
    // Before the first publish there is no revision checksum, so fall back to hashing the
    // projection. A pre-publication tenant whose draft still equals its live config is genuinely
    // "in sync", and telling them they have unpublished changes would be false.
    const publishedChecksum =
        publication?.payloadChecksum ||
        (publishedPayload ? businessProcessPayloadChecksum(publishedPayload) : null);

    const unpublished_changes = publishedChecksum == null || draftChecksum !== publishedChecksum;

    const draft_is_stale =
        publication != null && draft.baseRevisionId !== publication.revisionId;

    // Validation runs on read so the editor can show a truthful publishability state without the
    // operator first pressing Validate. It is pure and cheap — no database access.
    const validation: PublishValidationResult = unpublished_changes
        ? validateBusinessProcessForPublish(draft.payload)
        : { errors: [], warnings: [] };

    let status: BusinessProcessDraftStatus;
    if (draft_is_stale) {
        status = "draft_conflict";
    } else if (!unpublished_changes) {
        status = publication ? "published" : "never_published";
    } else if (validation.errors.length) {
        status = "publication_blocked";
    } else {
        status = "unpublished_changes";
    }

    return {
        department_id: input.departmentId,
        draft_payload: draft.payload,
        draft_revision: draft.draftRevision,
        draft_id: draft.id,
        base_revision_id: draft.baseRevisionId,
        published_revision_id: publication?.revisionId ?? null,
        published_revision_number: publication?.revisionNumber ?? null,
        published_at: publication?.publishedAt ?? null,
        draft_is_stale,
        unpublished_changes,
        status,
        validation,
        published_payload: publishedPayload,
        publication_required: unpublished_changes,
    };
}

/**
 * The compact shape an editor surface renders.
 *
 * Deliberately excludes `draft_payload` and `published_payload`: the stage editor already has the
 * configuration it needs from its own bootstrap, and shipping two full copies of the builder blob
 * on every stage load would be pure weight.
 */
export type BusinessProcessPublicationSummary = {
    draft_id: string;
    draft_revision: number;
    base_revision_id: string | null;
    published_revision_id: string | null;
    published_revision_number: number | null;
    published_at: string | null;
    draft_is_stale: boolean;
    unpublished_changes: boolean;
    status: BusinessProcessDraftStatus;
    status_message: string;
    blocking_errors: ConfigurationDiagnosticSummary[];
    warnings: ConfigurationDiagnosticSummary[];
};

/** Just enough of a diagnostic to render it; the full detail stays server-side. */
export type ConfigurationDiagnosticSummary = {
    code: string;
    message: string;
    path?: string;
    stage_key?: string;
};

export function summarizeBusinessProcessEditorState(
    state: BusinessProcessEditorState,
): BusinessProcessPublicationSummary {
    const summarize = (d: {
        code: string;
        message: string;
        path?: string;
        stage_key?: string;
    }): ConfigurationDiagnosticSummary => ({
        code: d.code,
        message: d.message,
        ...(d.path ? { path: d.path } : {}),
        ...(d.stage_key ? { stage_key: d.stage_key } : {}),
    });

    return {
        draft_id: state.draft_id,
        draft_revision: state.draft_revision,
        base_revision_id: state.base_revision_id,
        published_revision_id: state.published_revision_id,
        published_revision_number: state.published_revision_number,
        published_at: state.published_at,
        draft_is_stale: state.draft_is_stale,
        unpublished_changes: state.unpublished_changes,
        status: state.status,
        status_message: DRAFT_STATUS_COPY[state.status],
        blocking_errors: state.validation.errors.map(summarize),
        warnings: state.validation.warnings.map(summarize),
    };
}

/** Operator-facing sentence for each state. One place, so the API and UI cannot drift. */
export const DRAFT_STATUS_COPY: Record<BusinessProcessDraftStatus, string> = {
    published: "This configuration is published. Runtime is using it.",
    never_published:
        "Runtime is using this configuration, but it has never been published through the " +
        "configuration model. Publishing records an immutable revision you can roll back to.",
    unpublished_changes:
        "Your changes are saved as a draft. Runtime will continue using the currently published " +
        "configuration until you publish.",
    publication_blocked:
        "Your changes are saved as a draft, but they cannot be published until the problems below " +
        "are resolved. Runtime is still using the currently published configuration.",
    draft_conflict:
        "Someone else published a newer version of this configuration while you were editing. " +
        "Reload to see their changes, then reapply yours.",
};
