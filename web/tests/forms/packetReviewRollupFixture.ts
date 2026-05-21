import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

const SESS = "33333333-3333-4333-8333-333333333333";
const ORG = "11111111-1111-4111-8111-111111111111";

const SCHEMA = {
    schema_version: 1 as const,
    title: "Guardian Form",
    sections: [{ id: "s1", field_ids: ["guardian_first_name"] }],
    fields: [{ id: "guardian_first_name", type: "text" as const, label: "Guardian first name", required: true }],
};

/** Shared rollup fixture for PacketReviewRollupView and drawer modal tests. */
export function fixtureRollup(): PacketReviewRollupV1 {
    return {
        contract_version: 1,
        packet_session_id: SESS,
        org_id: ORG,
        status: "completed",
        operator_review: {
            status: "needs_review",
            warnings: [{ kind: "submitted_text_differs_from_crm", message: "Name mismatch with CRM" }],
            notes: null,
            reviewed_at: null,
            reviewed_by_user_id: null,
        },
        packet_definition: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Enrollment Packet", key: "enrollment" },
        enrollment_context: {
            opportunity_id: "22222222-2222-4222-8222-222222222222",
            opportunity_label: "Smith Family",
            customer_id: null,
            customer_label: null,
            launch_surface: "crm_opportunity",
            recipient_person_id: null,
        },
        progress: { total_steps: 2, submitted_steps: 2, current_sequence_index: 1 },
        linkage_summary: {
            any_intake_needs_review: true,
            steps_missing_crm_fk: 1,
            steps: [
                {
                    sequence_index: 1,
                    form_name: "Acknowledgement",
                    intake_needs_review: true,
                    has_crm_fk: false,
                    admin_submission_path: "/adminV2/forms/submissions/sub-ack",
                },
            ],
        },
        steps: [
            {
                sequence_index: 0,
                session_item_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                item_status: "submitted",
                submitted_at: "2026-05-01T10:00:00.000Z",
                form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                form_name: "Guardian PDF Form",
                form_key: "guardian_pdf",
                form_submission_id: "23232323-2323-4232-8232-232323232323",
                submission_status: "submitted",
                form_definition_version_id: "45454545-4545-4545-8545-454545454545",
                version_number: 1,
                has_pdf_mapping: true,
                artifact: {
                    kind: "generated_pdf",
                    label: "Generated PDF",
                    documents: [{ id: "67676767-6767-4767-8767-676767676767", name: "guardian.pdf", generation_label: "current" }],
                    admin_submission_path: "/adminV2/forms/submissions/sub-pdf",
                    helper_text: null,
                },
                answer_view: {
                    schema_json: SCHEMA,
                    payload: { values: { guardian_first_name: "Jamie" }, groups: {}, signatures: {} },
                },
                intake_meta: { intake_needs_review: false, intake_review_reason: null, intake_resolution_path: null },
            },
            {
                sequence_index: 1,
                session_item_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                item_status: "submitted",
                submitted_at: "2026-05-01T11:00:00.000Z",
                form_definition_id: "12121212-1212-4121-8121-121212121212",
                form_name: "Acknowledgement",
                form_key: "ack",
                form_submission_id: "34343434-3434-4343-8343-343434343434",
                submission_status: "submitted",
                form_definition_version_id: "56565656-5656-4656-8656-565656565656",
                version_number: 1,
                has_pdf_mapping: false,
                artifact: {
                    kind: "submitted_record",
                    label: "Submitted form record",
                    documents: [],
                    admin_submission_path: "/adminV2/forms/submissions/sub-ack",
                    helper_text: null,
                },
                answer_view: null,
                intake_meta: {
                    intake_needs_review: true,
                    intake_review_reason: "missing_customer",
                    intake_resolution_path: null,
                },
            },
        ],
        documents_index: [],
    };
}
