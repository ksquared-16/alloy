import { emitEvent } from "@/lib/emitEvent";

export type FormSubmissionRowLike = {
    id: string;
    org_id: string;
    form_definition_id: string;
    form_definition_version_id: string;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    created_via_public_link_id: string | null;
};

export function buildFormSubmissionWorkflowPayload(
    sub: FormSubmissionRowLike,
    extras?: { document_id?: string | null }
): Record<string, unknown> {
    return {
        form_submission_id: sub.id,
        form_definition_id: sub.form_definition_id,
        form_definition_version_id: sub.form_definition_version_id,
        person_id: sub.person_id,
        customer_id: sub.customer_id,
        customer_member_id: sub.customer_member_id,
        opportunity_id: sub.opportunity_id,
        org_id: sub.org_id,
        public_link_id: sub.created_via_public_link_id,
        ...(extras?.document_id ? { document_id: extras.document_id } : {}),
    };
}

export async function emitFormSubmittedSafe(sub: FormSubmissionRowLike): Promise<void> {
    try {
        await emitEvent({
            org_id: sub.org_id,
            event_type: "form_submitted",
            entity_type: "form_submissions",
            entity_id: sub.id,
            payload: buildFormSubmissionWorkflowPayload(sub),
        });
    } catch (e) {
        console.warn("[emitFormSubmittedSafe]", e instanceof Error ? e.message : e);
    }
}

export async function emitFormSignedSafe(sub: FormSubmissionRowLike): Promise<void> {
    try {
        await emitEvent({
            org_id: sub.org_id,
            event_type: "form_signed",
            entity_type: "form_submissions",
            entity_id: sub.id,
            payload: buildFormSubmissionWorkflowPayload(sub),
        });
    } catch (e) {
        console.warn("[emitFormSignedSafe]", e instanceof Error ? e.message : e);
    }
}

export async function emitFormDocumentGeneratedSafe(sub: FormSubmissionRowLike, documentId: string): Promise<void> {
    try {
        await emitEvent({
            org_id: sub.org_id,
            event_type: "form_document_generated",
            entity_type: "form_submissions",
            entity_id: sub.id,
            payload: buildFormSubmissionWorkflowPayload(sub, { document_id: documentId }),
        });
    } catch (e) {
        console.warn("[emitFormDocumentGeneratedSafe]", e instanceof Error ? e.message : e);
    }
}
