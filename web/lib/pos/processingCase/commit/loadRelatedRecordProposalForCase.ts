import type { SupabaseClient } from "@supabase/supabase-js";
import { safeParseFormSchema } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { adaptSourceToRelatedRecordProposals } from "@/lib/intake/sources/adaptSourceToRelatedRecordProposals";
import { loadAccessibleExistingCollectionItemIds } from "@/lib/forms/processing/verifyFormCollectionItemAccess";
import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";

export type RelatedRecordProposalCaseContext = {
    proposal: RelatedRecordInstanceProposal;
    expectedCustomerId: string | null;
    source: { source_kind: string; source_id: string };
};

export async function loadRelatedRecordProposalForCase(args: {
    supabase: SupabaseClient;
    orgId: string;
    caseId: string;
    proposalId: string;
}): Promise<RelatedRecordProposalCaseContext | null> {
    const { data: sources, error: sourceError } = await args.supabase
        .from("processing_case_sources")
        .select("source_kind, source_id")
        .eq("org_id", args.orgId)
        .eq("processing_case_id", args.caseId);
    if (sourceError) throw new Error(sourceError.message);

    for (const source of (sources ?? []) as { source_kind: string; source_id: string }[]) {
        if (source.source_kind !== "form_submission") continue;
        const { data: sub, error: subError } = await args.supabase
            .from("form_submissions")
            .select("id, payload, form_definition_version_id, customer_id")
            .eq("org_id", args.orgId)
            .eq("id", source.source_id)
            .maybeSingle();
        if (subError) throw new Error(subError.message);
        const subRow = sub as { id: string; payload: Record<string, unknown> | null; form_definition_version_id: string | null; customer_id: string | null } | null;
        if (!subRow) continue;

        let schemaJson: unknown = null;
        if (subRow.form_definition_version_id) {
            const { data: ver, error: verError } = await args.supabase
                .from("form_definition_versions")
                .select("schema_json")
                .eq("org_id", args.orgId)
                .eq("id", subRow.form_definition_version_id)
                .maybeSingle();
            if (verError) throw new Error(verError.message);
            schemaJson = (ver as { schema_json?: unknown } | null)?.schema_json ?? null;
        }
        const schemaParsed = safeParseFormSchema(schemaJson);
        if (!schemaParsed.success) continue;
        const payload = (subRow.payload ?? null) as FormPayload | null;
        const accessibleIds = await loadAccessibleExistingCollectionItemIds(args.supabase, args.orgId, payload);
        const bundle = adaptSourceToRelatedRecordProposals(
            {
                sourceKind: "form_submission",
                sourceRecordId: subRow.id,
                formSchema: schemaParsed.data,
                formPayload: payload,
            },
            {
                formDefinitionVersionId: subRow.form_definition_version_id,
                accessibleExistingItemIds: accessibleIds,
            },
        );
        for (const collection of bundle.collections) {
            const proposal = collection.instances.find((inst) => inst.proposal_id === args.proposalId);
            if (proposal) return { proposal, expectedCustomerId: subRow.customer_id, source };
        }
    }
    return null;
}
