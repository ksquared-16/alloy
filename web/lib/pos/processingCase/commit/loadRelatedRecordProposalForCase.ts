import type { SupabaseClient } from "@supabase/supabase-js";
import { safeParseFormSchema } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { adaptSourceToRelatedRecordProposals } from "@/lib/intake/sources/adaptSourceToRelatedRecordProposals";
import { loadAccessibleExistingCollectionItemIds } from "@/lib/forms/processing/verifyFormCollectionItemAccess";
import { listCaseFormSubmissionSources } from "@/lib/pos/processingCase/sources/listCaseFormSubmissionSources";
import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";

export type RelatedRecordProposalCaseContext = {
    proposal: RelatedRecordInstanceProposal;
    expectedCustomerId: string | null;
    /** The enrollment opportunity the source submission belongs to, when it has one. */
    expectedOpportunityId: string | null;
    source: { source_kind: string; source_id: string };
    /** Which packet step and form the proposal came from, when it came from a packet. */
    provenance: {
        formSubmissionId: string;
        formDefinitionVersionId: string | null;
        packetSessionId: string | null;
        packetStepIndex: number | null;
        formName: string | null;
    };
};

/**
 * Find one proposal by id among everything the case rests on.
 *
 * ## Why this stopped skipping packets
 *
 * The loop used to read the case's sources and `continue` past anything that was not a bare
 * `form_submission`. A packet case's source is a `form_packet_session`, so every proposal a packet
 * produced was visible in the evidence panel and unreachable from the commit route — the operator
 * could see a decision they could never make. Enumeration now goes through
 * `listCaseFormSubmissionSources`, which expands a packet into the ordered submissions it always
 * was, so the SAME adapter and the SAME executors serve both shapes. Nothing packet-specific
 * happens below this line.
 *
 * Each submission is adapted on its own. Proposal ids are derived from the submission, so a fact
 * two forms both ask for yields two proposals — which is the disagreement an operator is meant to
 * resolve, not one this loader may quietly resolve for them.
 */
export async function loadRelatedRecordProposalForCase(args: {
    supabase: SupabaseClient;
    orgId: string;
    caseId: string;
    proposalId: string;
}): Promise<RelatedRecordProposalCaseContext | null> {
    const submissions = await listCaseFormSubmissionSources(args.supabase, args.orgId, args.caseId);

    for (const entry of submissions) {
        const { data: sub, error: subError } = await args.supabase
            .from("form_submissions")
            // `opportunity_id` is the operator-facing record a packet was launched from. It is the
            // subject a Processing-side canonical command is invoked against, and it belongs to the
            // proposal's provenance either way.
            .select("id, payload, form_definition_version_id, customer_id, customer_member_id, opportunity_id")
            .eq("org_id", args.orgId)
            .eq("id", entry.submissionId)
            .maybeSingle();
        if (subError) throw new Error(subError.message);
        const subRow = sub as {
            id: string;
            payload: Record<string, unknown> | null;
            form_definition_version_id: string | null;
            customer_id: string | null;
            customer_member_id: string | null;
            opportunity_id: string | null;
        } | null;
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
                packetSessionId: entry.packetSessionId,
                packetStepIndex: entry.stepIndex,
                formName: entry.formName,
                /*
                 * The submission's own subject is the authoritative one. It is stamped at submit
                 * time from the session that was launched against that child, so it is stronger
                 * evidence than anything re-inferred here.
                 */
                subject: subRow.customer_member_id
                    ? { customerMemberId: subRow.customer_member_id, customerId: subRow.customer_id }
                    : null,
                accessibleExistingItemIds: accessibleIds,
            },
        );
        for (const collection of bundle.collections) {
            const proposal = collection.instances.find((inst) => inst.proposal_id === args.proposalId);
            if (proposal) {
                return {
                    proposal,
                    expectedCustomerId: subRow.customer_id,
                    expectedOpportunityId: subRow.opportunity_id,
                    source: entry.caseSource,
                    provenance: {
                        formSubmissionId: subRow.id,
                        formDefinitionVersionId: subRow.form_definition_version_id,
                        packetSessionId: entry.packetSessionId,
                        packetStepIndex: entry.stepIndex,
                        formName: entry.formName,
                    },
                };
            }
        }
    }
    return null;
}
