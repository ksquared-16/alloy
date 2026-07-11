/**
 * Temporary source-adapter dispatch owned by Processing case ingestion (P5A).
 * Centralized seam — delegates to source adapters; does not parse Forms payloads.
 *
 * P5A — minimal source dispatch: adapt a Processing source record to canonical related-record proposals.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import type { RelatedRecordProposalBundle } from "@/lib/intake/proposals/types";

export type AdaptSourceToProposalsContext = {
    accessibleExistingItemIds?: ReadonlySet<string>;
    formDefinitionVersionId?: string | null;
    packetSessionId?: string | null;
};

export type AdaptFormSubmissionSourceInput = {
    sourceKind: "form_submission";
    sourceRecordId: string;
    formSchema: FormSchemaV1 | null;
    formPayload: FormPayload | null | undefined;
};

export type AdaptUnknownSourceInput = {
    sourceKind: string;
    sourceRecordId: string;
};

export type AdaptSourceToProposalsInput = AdaptFormSubmissionSourceInput | AdaptUnknownSourceInput;

export function adaptSourceToRelatedRecordProposals(
    input: AdaptSourceToProposalsInput,
    ctx: AdaptSourceToProposalsContext = {},
): RelatedRecordProposalBundle {
    if (input.sourceKind === "form_submission" && "formSchema" in input) {
        return adaptFormSubmissionToRelatedRecordProposals(input.formSchema, input.formPayload, {
            formSubmissionId: input.sourceRecordId,
            formDefinitionVersionId: ctx.formDefinitionVersionId ?? null,
            packetSessionId: ctx.packetSessionId ?? null,
            accessibleExistingItemIds: ctx.accessibleExistingItemIds,
        });
    }

    return {
        collections: [],
        diagnostics: [
            {
                code: "missing_source_context",
                message: `No related-record proposal adapter registered for source kind "${input.sourceKind}".`,
            },
        ],
    };
}
