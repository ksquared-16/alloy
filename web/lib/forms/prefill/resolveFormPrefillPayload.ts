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
import { resolveFormsCollectionPrefillGroups, type FormsCollectionGroupPrefillState } from "@/lib/forms/prefill/formsCollectionPrefillResolver";
import { resolveAddressBindingPrefill, type AddressBindingPlanEntry } from "@/lib/forms/prefill/addressBindingPrefill";
import { mergeFormPrefillPayload } from "@/lib/forms/prefill/mergeFormPrefillPayload";
import { payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";

export type FormPrefillPayloadResult = {
    payload: FormPayload;
    scalarPrefill: Record<string, string | number | boolean>;
    collectionStates: Record<string, FormsCollectionGroupPrefillState>;
    /** What each `address_binding` group resolved to, and why. Read by tests and diagnostics. */
    addressBindingPlan: readonly AddressBindingPlanEntry[];
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
            addressBindingPlan: [],
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

    /*
     * Address binding is resolved AFTER the generic scalar pass and wins over it. A bound group's
     * children carry `person.address_line1`, which the scalar map can only take literally — and
     * `persons` has no address column, so that path resolves to nothing at all. The binding is the
     * more specific statement of whose address it is, so it is the one that answers.
     */
    const addressResult = await resolveAddressBindingPrefill(
        args.supabase,
        args.orgId,
        schema,
        args.launchFks,
    );
    const mergedScalarPrefill: Record<string, string | number | boolean> = {
        ...scalarPrefill,
        ...addressResult.values,
    };

    const payload = mergeFormPrefillPayload({
        schema,
        saved: savedPayload,
        scalarPrefill: mergedScalarPrefill,
        collectionPrefill: collectionResult.groups,
    });

    return {
        payload,
        scalarPrefill: mergedScalarPrefill,
        collectionStates: collectionResult.states,
        addressBindingPlan: addressResult.plan,
        prefillApplied:
            Object.keys(mergedScalarPrefill).length > 0 || Object.keys(collectionResult.groups).length > 0,
    };
}
