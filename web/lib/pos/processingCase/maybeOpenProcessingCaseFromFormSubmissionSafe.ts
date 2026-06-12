/**
 * POS-FP1 — best-effort, marker-gated on-ramp from a form submission.
 *
 * On a POS-connected form submission, open one Processing Case with the submission
 * as the primary source. Legacy (non-POS-connected) submissions are untouched.
 *
 * Best-effort: this NEVER throws and must NEVER break the original submission flow
 * (mirrors the `emit*Safe` pattern). Any failure is logged and swallowed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dbGetFormDefinition } from "@/lib/admin/forms/formsAdminDb";
import { isPosConnectedSurface } from "@/lib/forms/binding/posConnectedMarker";
import { makeProcessingCaseDbDeps } from "./processingCaseDb";
import { openProcessingCaseFromSource } from "./openProcessingCaseFromSource";

/**
 * Pure decision: should a POS-connected case be opened for this surface?
 * Exposed for unit testing without a database.
 */
export function shouldOpenProcessingCaseForSurface(args: {
    definitionMetadata?: unknown;
    versionMetadata?: unknown;
}): boolean {
    return isPosConnectedSurface(args);
}

export async function maybeOpenProcessingCaseFromFormSubmissionSafe(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        submissionId: string;
        formDefinitionId: string;
        versionMetadata?: unknown;
    }
): Promise<void> {
    try {
        if (!args.formDefinitionId) return;
        const { data: def } = await dbGetFormDefinition(supabase, args.orgId, args.formDefinitionId);
        const posConnected = shouldOpenProcessingCaseForSurface({
            definitionMetadata: (def as { metadata?: unknown } | null)?.metadata,
            versionMetadata: args.versionMetadata,
        });
        if (!posConnected) return;

        const deps = makeProcessingCaseDbDeps(supabase);
        await openProcessingCaseFromSource(deps, {
            orgId: args.orgId,
            sourceKind: "form_submission",
            sourceId: args.submissionId,
        });
    } catch (e) {
        console.warn(
            "[maybeOpenProcessingCaseFromFormSubmissionSafe]",
            e instanceof Error ? e.message : e
        );
    }
}
