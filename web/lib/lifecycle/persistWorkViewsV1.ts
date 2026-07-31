/**
 * Work Views persistence — draft-only.
 *
 * WHAT CHANGED AND WHY
 *
 * This module used to read `departments.metadata.lifecycle_builder_v1`, merge the new views into
 * it, and UPDATE the department row. That is a direct projection write: the runtime changed the
 * instant an operator typed, with no draft, no validation, no revision and no publish. It was the
 * last ordinary writer of its kind alongside participation.
 *
 * It now writes the DRAFT and nothing else. Runtime moves only when someone publishes.
 *
 * The read half deliberately stays here too, because "which Work Views am I looking at?" has to
 * be answered from the same place the write lands — an editor that saves to the draft but reads
 * the projection shows the operator their edit vanishing on reload, which is the exact defect
 * this sprint already fixed once for the stage editor.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    WORK_VIEWS_V1_METADATA_KEY,
    normalizeWorkViewsDisplayOrder,
    parseWorkViewsV1,
    type WorkViewConfigV1Stored,
} from "@/lib/lifecycle/workViewsConfigV1";
import {
    loadBusinessProcessEditorState,
    type BusinessProcessEditorState,
} from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import {
    draftAsDepartmentMetadata,
    editProcessInDraft,
} from "@/lib/businessProcesses/configuration/editProcessInDraft";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

export type WorkViewsDraftSaveResult = {
    workViews: WorkViewConfigV1Stored[];
    /** The token the editor must send with its next save. */
    draftRevision: number;
    /** Always true: the save moved the draft, so runtime is now behind until a publish. */
    publicationRequired: true;
};

/**
 * Save process Work Views into the draft.
 *
 * `expectedDraftRevision` is the token the editor loaded. Passing it makes the write a
 * compare-and-set, so a colleague editing the same draft produces a conflict the operator can
 * see rather than a silent overwrite. It is optional only because a caller with no prior read
 * has nothing truthful to send.
 */
export async function persistWorkViewsForProcessSave(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        processId: string;
        workViews: WorkViewConfigV1Stored[];
        actorUserId?: string | null;
        expectedDraftRevision?: number;
    },
): Promise<WorkViewsDraftSaveResult> {
    const normalized = normalizeWorkViewsDisplayOrder(params.workViews);

    const result = await editProcessInDraft(supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        processId: params.processId,
        actorUserId: params.actorUserId ?? null,
        expectedDraftRevision: params.expectedDraftRevision,
        // Spread, so `row_grain_v1` and every unknown field this branch cannot name survive.
        edit: (process) => ({
            ...process,
            work_views_v1: normalized.length ? normalized : undefined,
        }),
    });

    return {
        workViews: normalized,
        draftRevision: result.draftRevision,
        publicationRequired: result.publicationRequired,
    };
}

/** Work Views as the EDITOR should see them — the draft, which is what a save lands in. */
export async function readWorkViewsForEditor(
    supabase: SupabaseClient,
    params: { orgId: string; departmentId: string; processId: string; actorUserId?: string | null },
): Promise<{
    workViews: WorkViewConfigV1Stored[] | null;
    builderMetadata: Record<string, unknown>;
    editorState: BusinessProcessEditorState;
}> {
    const editorState = await loadBusinessProcessEditorState(supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        actorUserId: params.actorUserId ?? null,
    });
    if (!editorState) {
        throw new Error("There is no draft configuration for this department.");
    }
    const builderMetadata = draftAsDepartmentMetadata(editorState);
    return {
        workViews: readWorkViewsFromMetadata(builderMetadata, params.processId),
        builderMetadata,
        editorState,
    };
}

export function readWorkViewsFromMetadata(
    metadata: unknown,
    processId: string,
): WorkViewConfigV1Stored[] | null {
    if (!isRecord(metadata)) return null;
    const builderRaw = metadata[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) return null;
    for (const processRaw of builderRaw.processes) {
        if (!isRecord(processRaw) || String(processRaw.id ?? "").trim() !== processId.trim()) continue;
        return parseWorkViewsV1(processRaw[WORK_VIEWS_V1_METADATA_KEY]);
    }
    return null;
}

/** Retained for callers that legitimately inspect the PUBLISHED projection (diagnostics, runtime). */
export function readPublishedWorkViews(
    departmentMetadata: unknown,
    processId: string,
): WorkViewConfigV1Stored[] | null {
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = builder.processes.find((p) => p.id === processId.trim());
    return process?.work_views_v1 ?? null;
}
