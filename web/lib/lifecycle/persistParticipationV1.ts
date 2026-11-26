/**
 * Participation persistence — draft-only.
 *
 * This wrote `departments.metadata.lifecycle_builder_v1` directly, which meant the runtime changed
 * the moment an operator saved: no draft, no validation, no revision, no publish. It now goes
 * through the same single draft operation every other ordinary editor family uses.
 *
 * The old header called this "the Publish step". It was not a publish — it was a projection write
 * wearing the word. Publishing is a deliberate act with a revision behind it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { parseParticipationConfigV1, type ParticipationConfigV1 } from "@/lib/process/participationConfig";
import {
    draftAsDepartmentMetadata,
    editProcessInDraft,
} from "@/lib/businessProcesses/configuration/editProcessInDraft";
import { loadBusinessProcessEditorState } from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { unknownFieldsOf, withUnknownFields } from "@/lib/config/preserveUnknownFields";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

export async function persistParticipationForProcessSave(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        processId: string;
        participation: ParticipationConfigV1;
        actorUserId?: string | null;
        expectedDraftRevision?: number;
    },
): Promise<{ participation: ParticipationConfigV1; draftRevision: number; publicationRequired: true }> {
    const result = await editProcessInDraft(supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        processId: params.processId,
        actorUserId: params.actorUserId ?? null,
        expectedDraftRevision: params.expectedDraftRevision,
        edit: (process) => ({
            ...process,
            // The incoming config came over HTTP, and `JSON.stringify` cannot carry the Law 7
            // unknown-field symbol — so the client was never SENT the residue and cannot send it
            // back. Replacing wholesale would therefore delete every field this branch does not
            // name, on every save, no matter how careful the parser is.
            //
            // The fix is a merge, not a spread: keep the residue captured from the draft we just
            // read, and let the caller's known fields land on top of it. A client can only be
            // responsible for what it was given.
            participation_v1: withUnknownFields(
                params.participation,
                unknownFieldsOf(process.participation_v1) ?? {},
            ),
        }),
    });

    return {
        participation: params.participation,
        draftRevision: result.draftRevision,
        publicationRequired: result.publicationRequired,
    };
}

/** Participation as the EDITOR should see it — the draft, which is where a save lands. */
export async function readParticipationForEditor(
    supabase: SupabaseClient,
    params: { orgId: string; departmentId: string; processId: string; actorUserId?: string | null },
): Promise<{ participation: ParticipationConfigV1 | null; editorState: NonNullable<Awaited<ReturnType<typeof loadBusinessProcessEditorState>>> }> {
    const editorState = await loadBusinessProcessEditorState(supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        actorUserId: params.actorUserId ?? null,
    });
    if (!editorState) {
        throw new Error("There is no draft configuration for this department.");
    }
    return {
        participation: readParticipationFromMetadata(
            draftAsDepartmentMetadata(editorState),
            params.processId,
        ),
        editorState,
    };
}

/** Read the saved participation config for a process from department metadata (null when unset). */
export function readParticipationFromMetadata(
    metadata: unknown,
    processId: string,
): ParticipationConfigV1 | null {
    if (!isRecord(metadata)) return null;
    const builderRaw = metadata[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) return null;
    for (const processRaw of builderRaw.processes) {
        if (!isRecord(processRaw) || String(processRaw.id ?? "").trim() !== processId.trim()) continue;
        return parseParticipationConfigV1(processRaw.participation_v1);
    }
    return null;
}
