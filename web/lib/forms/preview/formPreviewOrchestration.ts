/**
 * Form preview orchestration — shared across operator preview and public runtime adapters.
 *
 * Modes:
 * 1. design_placeholder — representative structure only, no canonical records
 * 2. context_backed — canonical prefill when launch context is available
 * 3. respondent_runtime — public embed path (uses context_backed when prefill applies)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import { resolveFormPrefillPayload } from "@/lib/forms/prefill/resolveFormPrefillPayload";
import type { FormsCollectionGroupPrefillState } from "@/lib/forms/prefill/formsCollectionPrefillResolver";

export type FormPreviewMode = "design_placeholder" | "context_backed" | "respondent_runtime";

export type FormPreviewOrchestrationResult = {
    mode: FormPreviewMode;
    payload: FormPayload;
    /** Operator diagnostics — not shown to respondents. */
    diagnostics?: {
        prefill_applied?: boolean;
        collection_states?: Record<string, FormsCollectionGroupPrefillState>;
        invalid_context_groups?: string[];
        placeholder?: boolean;
    };
};

export type FormAuthoringPreviewLaunchContext = {
    customer_id?: string | null;
    person_id?: string | null;
    customer_member_id?: string | null;
    opportunity_id?: string | null;
    form_context_mode?: string;
};

/** Derive operator preview launch context from link or form metadata — no fabrication. */
export function previewLaunchContextFromMetadata(
    metadata: Record<string, unknown> | null | undefined,
): FormAuthoringPreviewLaunchContext | null {
    if (!metadata || typeof metadata !== "object") return null;
    const customerId = typeof metadata.customer_id === "string" ? metadata.customer_id.trim() : "";
    if (!customerId) return null;
    return {
        customer_id: customerId,
        person_id: typeof metadata.person_id === "string" ? metadata.person_id : null,
        customer_member_id: typeof metadata.customer_member_id === "string" ? metadata.customer_member_id : null,
        opportunity_id: typeof metadata.opportunity_id === "string" ? metadata.opportunity_id : null,
        form_context_mode:
            typeof metadata.form_context_mode === "string" && metadata.form_context_mode.trim()
                ? metadata.form_context_mode.trim()
                : "existing_record",
    };
}

const PLACEHOLDER_META = {
    preview_mode: "design_placeholder",
    preview_notice: "Design preview — placeholder data only. Not resolved from canonical records.",
} as const;

/** Design placeholder — min repeat structure without fabricating canonical collection items. */
export function buildDesignPlaceholderPreviewPayload(schema: FormSchemaV1): FormPreviewOrchestrationResult {
    return {
        mode: "design_placeholder",
        payload: {
            ...payloadWithMinimumRepeatingGroups(schema),
            meta: { ...PLACEHOLDER_META },
        },
        diagnostics: {
            placeholder: true,
        },
    };
}

/** Context-backed operator preview — uses canonical prefill orchestration. */
export async function resolveContextBackedPreviewPayload(args: {
    supabase: SupabaseClient;
    orgId: string;
    schema: FormSchemaV1;
    linkMetadata: Record<string, unknown>;
    formDefinitionMetadata?: Record<string, unknown> | null;
    launchFks: LaunchFkStamp;
}): Promise<FormPreviewOrchestrationResult> {
    const result = await resolveFormPrefillPayload({
        supabase: args.supabase,
        orgId: args.orgId,
        linkMetadata: args.linkMetadata,
        formDefinitionMetadata: args.formDefinitionMetadata ?? null,
        schema: args.schema,
        launchFks: args.launchFks,
    });

    const invalidGroups = Object.entries(result.collectionStates)
        .filter(([, state]) => state.kind === "invalid_context" || state.kind === "unavailable")
        .map(([groupId]) => groupId);

    return {
        mode: "context_backed",
        payload: {
            ...result.payload,
            meta: {
                ...(result.payload.meta ?? {}),
                preview_mode: "context_backed",
                prefill_applied: result.prefillApplied,
            },
        },
        diagnostics: {
            prefill_applied: result.prefillApplied,
            collection_states: result.collectionStates,
            invalid_context_groups: invalidGroups.length ? invalidGroups : undefined,
        },
    };
}
