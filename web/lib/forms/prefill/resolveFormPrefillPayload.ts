/**
 * Canonical form bootstrap prefill orchestration.
 *
 * Single entry for scalar, relationship, and collection prefill resolution.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { resolveFormPrefillValues, shouldApplyServerPrefill } from "@/lib/forms/prefill/resolveFormPrefillValues";
import { resolveFormsCollectionPrefillGroups } from "@/lib/forms/prefill/formsCollectionPrefillResolver";
import { mergeFormPrefillPayload } from "@/lib/forms/prefill/mergeFormPrefillPayload";
import { payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";

export type FormPrefillPayloadResult = {
    payload: FormPayload;
    scalarPrefill: Record<string, string | number | boolean>;
    collectionStates: Record<string, unknown>;
    prefillApplied: boolean;
};

export async function resolveFormPrefillPayload(args: {
    supabase: SupabaseClient;
    orgId: string;
    linkMetadata: Record<string, unknown>;
    formDefinitionMetadata: Record<string, unknown> | null | undefined;
    schema: FormSchemaV1;
    launchFks: LaunchFkStamp;
    /** Saved draft payload when resuming — respondent values win over canonical prefill. */
    savedPayload?: FormPayload | null;
}): Promise<FormPrefillPayloadResult> {
    const { schema, savedPayload } = args;

    if (!shouldApplyServerPrefill(args.linkMetadata)) {
        const base = savedPayload ?? payloadWithMinimumRepeatingGroups(schema);
        return {
            payload: base,
            scalarPrefill: {},
            collectionStates: {},
            prefillApplied: false,
        };
    }

    const scalarPrefill = await resolveFormPrefillValues(
        args.supabase,
        args.orgId,
        args.linkMetadata,
        args.formDefinitionMetadata,
        schema,
        args.launchFks,
    );

    const collectionResult = await resolveFormsCollectionPrefillGroups(
        args.supabase,
        args.orgId,
        schema,
        args.launchFks,
    );

    const payload = mergeFormPrefillPayload({
        schema,
        saved: savedPayload,
        scalarPrefill,
        collectionPrefill: collectionResult.groups,
    });

    return {
        payload,
        scalarPrefill,
        collectionStates: collectionResult.states,
        prefillApplied: Object.keys(scalarPrefill).length > 0 || Object.keys(collectionResult.groups).length > 0,
    };
}
