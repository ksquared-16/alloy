/**
 * Top-level canonical answers become an existing-record proposal for the subject the session names.
 *
 * ## The gap this closes, and why it was never packet-specific
 *
 * Proposal generation was collection-group-only: `adaptFormSubmissionToRelatedRecordProposals`
 * walks `schema.fields` and skips anything that is not a `group` carrying a collection binding.
 * That is right for a repeatable set — several children, several household members — where each row
 * has to say which instance it is.
 *
 * But the real enrolment Forms ask "Child First Name" as a TOP-LEVEL question with a canonical
 * `field_source`. Those answers reached evidence and classification and then stopped:
 *
 *     top-level canonical answer -> evidence -> classification -> (nothing) -> no decision -> no write
 *
 * A single Form authored that way behaves identically, so this is a shared Forms → existing-record
 * return gap, fixed at the shared owner rather than beside it.
 *
 * ## Why this is not a fake collection group
 *
 * `children` is the canonical native-structural collection that OWNS customer_member records. The
 * group field is one authoring route to that owner; it was never the owner itself. A set of
 * top-level answers about one known child is the same ownership statement with the instance already
 * decided — so this emits the real proposal shape the existing executor already accepts, rather
 * than wrapping scalars in a synthetic repeatable row to sneak past a gate.
 *
 * ## Two different questions, kept apart
 *
 * The authoritative subject answers "who is this submission about?". It does NOT answer "who owns
 * this particular fact?". Ownership is read from the canonical binding through
 * `resolveMutationCapability`, never from the label and never from the subject:
 *
 *   customer_member-owned scalar  -> proposed against the subject
 *   relationship-owned            -> refused here; it belongs to the relationship path
 *   binding that resolves to no writable capability -> refused
 *   no binding at all             -> not a proposal; the answer stays Form truth
 *
 * A refusal is a diagnostic on the bundle, never a silent omission, because "we could not place
 * this" is something an operator has to be able to see.
 *
 * Pure. No I/O.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { resolveMutationCapability } from "@/lib/fields/mutation/resolveMutationCapability";
import { stableRelatedRecordProposalId } from "@/lib/intake/proposals/normalize";
import type {
    ProposalDiagnostic,
    RelatedRecordCollectionProposal,
    RelatedRecordFieldProposal,
    RelatedRecordInstanceProposal,
    RelatedRecordProposalStatus,
} from "@/lib/intake/proposals/types";

/**
 * The record a participant session was deliberately launched against.
 *
 * Absent for public intake, which is exactly why this module produces nothing there: with no
 * authoritative subject there is no existing record to propose against, and the existing
 * identity-resolution and creation flow stays in charge.
 */
export type AuthoritativeSubject = {
    /** The child this session is about. */
    readonly customerMemberId: string;
    /** The household it belongs to — the executor re-checks this. */
    readonly customerId: string | null;
};

/** The canonical collection that owns customer_member records. */
const CHILDREN_COLLECTION_REF = "children";
const CUSTOMER_MEMBER_ENTITY = "customer_member";
const SOURCE_KIND = "form_submission";

export type AdaptTopLevelFieldsContext = {
    readonly formSubmissionId: string;
    readonly subject: AuthoritativeSubject | null;
};

function providerRefFor(field: FormField): string | null {
    const entityType = field.field_source?.entity_type ?? null;
    const fieldKey = field.field_source?.field_key ?? null;
    if (!entityType || !fieldKey) return null;
    return `${entityType}.${fieldKey}`;
}

/**
 * Build the child-owned proposal for a submission's top-level canonical answers.
 *
 * @returns a single-instance `children` collection proposal, or null when there is nothing to
 *          propose (no subject, or no top-level answer that the child record owns)
 */
export function adaptTopLevelFieldsToRelatedRecordProposals(
    schema: FormSchemaV1 | null,
    values: Record<string, unknown>,
    ctx: AdaptTopLevelFieldsContext,
): { collection: RelatedRecordCollectionProposal | null; diagnostics: ProposalDiagnostic[] } {
    const diagnostics: ProposalDiagnostic[] = [];
    // No authoritative subject means public intake. Nothing here; creation flow is untouched.
    if (!schema || !ctx.subject) return { collection: null, diagnostics };

    const fieldProposals: RelatedRecordFieldProposal[] = [];

    for (const field of schema.fields) {
        // Groups are the other adapter's business, and a text block asks nothing.
        if (field.type === "group" || field.type === "text_block") continue;
        if (!Object.prototype.hasOwnProperty.call(values, field.id)) continue;

        const providerRef = providerRefFor(field);
        // An unmapped question is Form truth. Not a proposal, and not a problem.
        if (!providerRef) continue;

        const capability = resolveMutationCapability(providerRef);
        if (!capability) {
            diagnostics.push({
                code: "unsupported_item_entity",
                message: `"${field.label}" is bound to ${providerRef}, which is not writable through the canonical mutation platform.`,
                path: `values.${field.id}`,
            });
            continue;
        }
        if (capability.entity_type !== CUSTOMER_MEMBER_ENTITY) {
            /*
             * Relationship-owned, and it stays that way.
             *
             * The subject tells us who the submission is about; it does not make every returned
             * fact the child's to hold. Writing an emergency contact onto the child row would
             * flatten a relationship into a scalar, which is the precise mistake this whole seam
             * exists to prevent — so it is refused, visibly, rather than absorbed.
             */
            diagnostics.push({
                code: "unsupported_item_entity",
                message: `"${field.label}" is owned by ${capability.entity_type}, not by the child record, so it cannot be committed from this path.`,
                path: `values.${field.id}`,
            });
            continue;
        }

        fieldProposals.push({
            provider_ref: providerRef,
            submitted_value: values[field.id],
            source_fact_ref: field.id,
            label: field.label,
        });
    }

    if (fieldProposals.length === 0) return { collection: null, diagnostics };

    /*
     * The instance key is the subject itself.
     *
     * One submission proposes at most one change-set against one known child, so the record id is
     * the only honest identity for it — and it makes the proposal id stable across re-reads, which
     * is what lets the operator's decision still name the same proposal at commit time.
     */
    const instanceKey = ctx.subject.customerMemberId;
    const status: RelatedRecordProposalStatus = "valid";

    const instance: RelatedRecordInstanceProposal = {
        proposal_id: stableRelatedRecordProposalId({
            source_kind: SOURCE_KIND,
            source_record_id: ctx.formSubmissionId,
            collection_provider_ref: CHILDREN_COLLECTION_REF,
            instance_key: instanceKey,
        }),
        collection_provider_ref: CHILDREN_COLLECTION_REF,
        item_entity_type: CUSTOMER_MEMBER_ENTITY,
        instance_key: instanceKey,
        origin: "existing_record",
        existing_record_id: ctx.subject.customerMemberId,
        field_proposals: fieldProposals,
        execution_kind: "native_structural",
        source_lineage: {
            source_kind: SOURCE_KIND,
            source_record_id: ctx.formSubmissionId,
            source_path: "values",
            source_metadata: {
                // How this instance was identified, so an audit can tell it from a group row.
                subject_source: "authoritative_launch_subject",
                authoritative_customer_member_id: ctx.subject.customerMemberId,
                ...(ctx.subject.customerId ? { authoritative_customer_id: ctx.subject.customerId } : {}),
            },
        },
        diagnostics: [],
        status,
    };

    return {
        collection: {
            collection_key: CHILDREN_COLLECTION_REF,
            collection_provider_ref: CHILDREN_COLLECTION_REF,
            instances: [instance],
            status,
            diagnostics: [],
        },
        diagnostics,
    };
}
