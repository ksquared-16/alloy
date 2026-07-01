/** Frozen read model for multi-step packet session operator review (contract_version: 1). Enrollment is the first vertical; contracts are packet-generic. */

export type OperatorReviewWarningV1 = {
    kind: string;
    message: string;
    field_key?: string;
};

export type PacketReviewRollupV1 = {
    contract_version: 1;
    packet_session_id: string;
    org_id: string;
    status: "in_progress" | "completed" | "cancelled";
    operator_review: {
        status: "needs_review" | "approved" | "rejected" | "needs_correction" | null;
        warnings: OperatorReviewWarningV1[];
        notes: string | null;
        reviewed_at: string | null;
        reviewed_by_user_id: string | null;
    };
    packet_definition: { id: string; name: string; key: string | null };
    enrollment_context: {
        opportunity_id: string | null;
        opportunity_label: string | null;
        customer_id: string | null;
        customer_label: string | null;
        launch_surface: string | null;
        recipient_person_id: string | null;
    };
    progress: {
        total_steps: number;
        submitted_steps: number;
        current_sequence_index: number | null;
    };
    linkage_summary: {
        any_intake_needs_review: boolean;
        steps_missing_crm_fk: number;
        steps: Array<{
            sequence_index: number;
            form_name: string;
            intake_needs_review: boolean;
            has_crm_fk: boolean;
            admin_submission_path: string | null;
        }>;
    };
    steps: PacketReviewRollupStepV1[];
    documents_index: PacketReviewDocumentIndexEntryV1[];
};

export type PacketReviewRollupStepV1 = {
    sequence_index: number;
    session_item_id: string;
    item_status: string;
    submitted_at: string | null;
    form_definition_id: string;
    form_name: string;
    form_key: string | null;
    form_submission_id: string | null;
    submission_status: "draft" | "submitted" | null;
    form_definition_version_id: string | null;
    version_number: number | null;
    has_pdf_mapping: boolean;
    artifact: {
        kind: "generated_pdf" | "submitted_record" | "pending" | "not_started";
        label: string;
        documents: Array<{ id: string; name: string | null; generation_label: "current" | "also_generated" }>;
        admin_submission_path: string | null;
        helper_text: string | null;
    };
    answer_view: {
        schema_json: unknown;
        payload: unknown;
        option_values_by_field_id?: Record<string, string[]>;
    } | null;
    intake_meta: {
        intake_needs_review: boolean;
        intake_review_reason: string | null;
        intake_resolution_path: string | null;
    } | null;
};

export type DocumentProvenanceV1 = {
    form_definition_id: string;
    form_name: string;
    form_definition_version_id: string;
    version_number: number;
    form_submission_id: string;
    submission_submitted_at: string | null;
    generated_at: string | null;
    template_key: string | null;
    idempotency_key: string | null;
    generation_label: "current" | "also_generated";
};

export type PacketReviewDocumentIndexEntryV1 = {
    kind: "generated_pdf" | "submitted_record";
    step_sequence_index: number;
    form_name: string;
    form_submission_id: string;
    document_id: string | null;
    title: string;
    provenance: DocumentProvenanceV1;
    admin_links: {
        submission_path: string;
        packet_session_path: string;
    };
};
