/**
 * The one way an ordinary Business Process editor changes configuration.
 *
 * Every editor family — Work Views, Participation, and whatever comes next — is doing the same
 * thing underneath: take the current draft, change one part of one process, write the draft back
 * under compare-and-set, and touch nothing the runtime reads.
 *
 * Before this existed, each family hand-rolled that sequence against
 * `departments.metadata.lifecycle_builder_v1` and got it subtly differently: some busted the
 * runtime cache (claiming a change the runtime had not made), none used a conflict token, and all
 * of them moved runtime the instant an operator typed. Giving them one operation is what makes
 * "Business Process has ONE publication system" true rather than aspirational.
 *
 * What a caller supplies is the edit itself. What it does NOT get to decide is whether the write
 * lands in the draft — that is the point.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    loadBusinessProcessEditorState,
    type BusinessProcessEditorState,
} from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { saveDraft } from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";

export type ProcessDraftEditResult = {
    /** The token the editor must send with its next save. */
    draftRevision: number;
    /** Always true: the draft moved, so runtime is behind until someone publishes. */
    publicationRequired: true;
};

/**
 * Apply `edit` to one process inside the draft and persist it.
 *
 * `edit` receives the process as the Law 7 parser produced it — including fields this branch does
 * not understand, carried on the unknown-field symbol — and returns the replacement. Spreading
 * the input (`{ ...process, work_views_v1: next }`) preserves that carrier; rebuilding the object
 * from scratch would silently drop `row_grain_v1` and every future field with it.
 */
export async function editProcessInDraft(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        processId: string;
        actorUserId?: string | null;
        /** The token the editor loaded; omit only when the caller genuinely had no prior read. */
        expectedDraftRevision?: number;
        edit: (process: LifecycleBuilderProcessRecord) => LifecycleBuilderProcessRecord;
    },
): Promise<ProcessDraftEditResult> {
    const processId = params.processId.trim();

    const editorState = await loadBusinessProcessEditorState(supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        actorUserId: params.actorUserId ?? null,
    });
    if (!editorState) {
        throw new Error("There is no draft configuration for this department.");
    }

    const builder = builderFromDraft(editorState);
    const process = builder.processes.find((p) => p.id === processId);
    if (!process) {
        throw new Error(`Process "${processId}" is not configured on this department.`);
    }

    const nextBuilder = {
        ...builder,
        processes: builder.processes.map((p) => (p.id === processId ? params.edit(p) : p)),
    };

    const saved = await saveDraft(supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        builder: nextBuilder,
        actorUserId: params.actorUserId ?? null,
        expectedDraftRevision: params.expectedDraftRevision ?? editorState.draft_revision,
    });

    // Deliberately no projection write and no runtime cache invalidation. Nothing the runtime
    // reads has changed, and busting the cache would show the operator a change that has not
    // actually happened yet.
    return { draftRevision: saved.draftRevision, publicationRequired: true };
}

/**
 * Apply an edit to the WHOLE draft builder.
 *
 * Per-process edits should use {@link editProcessInDraft}; this is for changes to the process set
 * itself — adding or removing a process — where the unit of change is the builder, not a member
 * of it. Same draft, same compare-and-set, same refusal to touch the projection.
 */
export async function editBuilderInDraft(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        actorUserId?: string | null;
        expectedDraftRevision?: number;
        edit: (builder: ReturnType<typeof builderFromDraft>) => ReturnType<typeof builderFromDraft>;
    },
): Promise<ProcessDraftEditResult> {
    const editorState = await loadBusinessProcessEditorState(supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        actorUserId: params.actorUserId ?? null,
    });
    if (!editorState) {
        throw new Error("There is no draft configuration for this department.");
    }

    const saved = await saveDraft(supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        builder: params.edit(builderFromDraft(editorState)),
        actorUserId: params.actorUserId ?? null,
        expectedDraftRevision: params.expectedDraftRevision ?? editorState.draft_revision,
    });

    return { draftRevision: saved.draftRevision, publicationRequired: true };
}

/**
 * The draft payload, parsed as a builder.
 *
 * The parser takes department-shaped metadata, so the payload is wrapped under the builder key
 * exactly as the stage bootstrap wraps it. One helper so every family wraps it identically.
 */
export function builderFromDraft(editorState: Pick<BusinessProcessEditorState, "draft_payload">) {
    return lifecycleBuilderFromDepartmentMetadata({
        [LIFECYCLE_BUILDER_METADATA_KEY]: editorState.draft_payload,
    });
}

/** Draft payload in department-metadata shape, for readers that expect that envelope. */
export function draftAsDepartmentMetadata(
    editorState: Pick<BusinessProcessEditorState, "draft_payload">,
): Record<string, unknown> {
    return { [LIFECYCLE_BUILDER_METADATA_KEY]: editorState.draft_payload };
}
