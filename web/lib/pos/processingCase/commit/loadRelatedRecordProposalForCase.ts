import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeParseFormSchema } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { adaptSourceToRelatedRecordProposals } from "@/lib/intake/sources/adaptSourceToRelatedRecordProposals";
import { loadAccessibleExistingCollectionItemIds } from "@/lib/forms/processing/verifyFormCollectionItemAccess";
import type { RelatedRecordInstanceProposal } from "@/lib/intake/proposals/types";
import { loadHealthCaptureDeclarations } from "@/lib/health/healthCaptureDeclaration";
import { adaptHealthCaptureToProposals } from "@/lib/health/healthCaptureProposals";
import { adaptPersonContactFactsToProposals } from "@/lib/fields/personContactFacts/personContactFactProposals";
import {
    adaptParticipantChildRequestToRelatedRecordProposals,
    loadParticipantChildRequests,
    PARTICIPANT_CHILD_REQUEST_SOURCE_KIND,
    type ParticipantChildRequestRow,
} from "@/lib/pos/processingCase/sources/participantChildRequest";

export type RelatedRecordProposalCaseContext = {
    proposal: RelatedRecordInstanceProposal;
    expectedCustomerId: string | null;
    /**
     * The child the SOURCE itself is about — a form submission's own `customer_member_id`. Evidence,
     * not inference: a child-scoped relationship from Ben's paperwork is Ben's.
     */
    expectedCustomerMemberId?: string | null;
    /** The adult the SOURCE is attributed to — a form submission's own `person_id`. */
    expectedPersonId?: string | null;
    source: { source_kind: string; source_id: string };
    /** Present when the source is a family's new-child statement. */
    participantChildRequest?: ParticipantChildRequestRow;
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

    /*
     * A PACKET SESSION'S PROPOSALS ARE ITS SUBMISSIONS'.
     *
     * An Enrollment packet opens its case from the packet session (packet completion), not from each
     * form submission. The case view already expands such a source into the submissions of its items
     * (`processingCaseEvidenceDb`), so an operator SAW a family's proposed new child — and commit,
     * which read form-submission sources only, answered "Proposal not found for case" for every one.
     * The same expansion here, org-scoped, so what the operator sees is what they can commit.
     */
    const expanded: { source_kind: string; source_id: string }[] = [];
    for (const source of (sources ?? []) as { source_kind: string; source_id: string }[]) {
        // A family's new-child statement IS its one proposal; its household is the one it was made for.
        if (source.source_kind === PARTICIPANT_CHILD_REQUEST_SOURCE_KIND) {
            const [row] = await loadParticipantChildRequests(args.supabase, args.orgId, [source.source_id]);
            if (!row) continue;
            const proposal = adaptParticipantChildRequestToRelatedRecordProposals(row).collections[0]?.instances
                .find((inst) => inst.proposal_id === args.proposalId);
            if (proposal) return { proposal, expectedCustomerId: row.customer_id, source, participantChildRequest: row };
            continue;
        }
        if (source.source_kind === "form_submission") {
            expanded.push(source);
            continue;
        }
        if (source.source_kind !== "form_packet_session") continue;
        const { data: items, error: itemError } = await args.supabase
            .from("form_packet_session_items")
            .select("form_submission_id")
            .eq("org_id", args.orgId)
            .eq("packet_session_id", source.source_id);
        if (itemError) throw new Error(itemError.message);
        for (const item of (items ?? []) as { form_submission_id: string | null }[]) {
            if (item.form_submission_id) expanded.push({ source_kind: "form_submission", source_id: item.form_submission_id });
        }
    }

    for (const source of expanded) {
        if (source.source_kind !== "form_submission") continue;
        const { data: sub, error: subError } = await args.supabase
            .from("form_submissions")
            .select("id, payload, form_definition_version_id, customer_id, customer_member_id, person_id")
            .eq("org_id", args.orgId)
            .eq("id", source.source_id)
            .maybeSingle();
        if (subError) throw new Error(subError.message);
        const subRow = sub as { id: string; payload: Record<string, unknown> | null; form_definition_version_id: string | null; customer_id: string | null; customer_member_id?: string | null; person_id?: string | null } | null;
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
        if (subRow.form_definition_version_id) {
            const capture = (await loadHealthCaptureDeclarations(args.supabase, args.orgId, [subRow.form_definition_version_id])).get(subRow.form_definition_version_id);
            if (capture) {
                bundle.collections.push(
                    ...adaptHealthCaptureToProposals(schemaParsed.data, payload, capture, { formSubmissionId: subRow.id, formDefinitionVersionId: subRow.form_definition_version_id }),
                );
            }
        }
        bundle.collections.push(
            ...adaptPersonContactFactsToProposals(schemaParsed.data, payload, { formSubmissionId: subRow.id, formDefinitionVersionId: subRow.form_definition_version_id }),
        );
        for (const collection of bundle.collections) {
            const proposal = collection.instances.find((inst) => inst.proposal_id === args.proposalId);
            if (proposal) return { proposal, expectedCustomerId: subRow.customer_id, expectedCustomerMemberId: subRow.customer_member_id ?? null, expectedPersonId: subRow.person_id ?? null, source };
        }
    }
    return null;
}

export type ProposalNotFoundCategory = "case_has_no_sources" | "no_source_holds_proposal" | "source_unreadable";

/**
 * A proposal the case does not hold: 404 with a CATEGORY and a correlation id — never proposal ids,
 * source ids or database text. The same correlation id and the case's source kinds are logged
 * server-side, so a deployed "not found" can be explained without shipping a diagnostic build.
 * (Replaces the temporary #1491 lookup body; the cause it found was a malformed request id.)
 */
export async function proposalNotFound(args: {
    supabase: SupabaseClient;
    orgId: string;
    caseId: string;
    proposalId: string;
}): Promise<NextResponse> {
    const correlationId = randomUUID();
    let category: ProposalNotFoundCategory = "no_source_holds_proposal";
    let kinds: string[] = [];
    try {
        const { data, error } = await args.supabase
            .from("processing_case_sources")
            .select("source_kind")
            .eq("org_id", args.orgId)
            .eq("processing_case_id", args.caseId);
        if (error) category = "source_unreadable";
        kinds = ((data ?? []) as { source_kind: string }[]).map((r) => r.source_kind);
        if (!error && kinds.length === 0) category = "case_has_no_sources";
    } catch {
        category = "source_unreadable";
    }
    console.warn("[processing] proposal_not_found", JSON.stringify({
        correlation_id: correlationId,
        category,
        case_id: args.caseId,
        source_kinds: kinds,
        proposal_id_shape: args.proposalId.split(":").map((part, i) => (i < 2 ? part : `${part.length}`)).join(":"),
    }));
    return NextResponse.json({ error: "Proposal not found for case", code: "proposal_not_found", category, correlation_id: correlationId }, { status: 404 });
}
