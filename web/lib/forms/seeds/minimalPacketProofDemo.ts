/**
 * **Demo / proof only** — smallest two-step packet for manual E2E verification (not production enrollment).
 *
 * Seed: `scripts/seedMinimalPacketProofForOrg.ts`
 *
 * Org id: `FORMS_MINIMAL_PACKET_PROOF_ORG_ID`, `DEMO_RESET_ORG_ID`, or `--org=<uuid>`
 */

export const MINIMAL_PACKET_PROOF_CHILD_FORM_KEY = "minimal_packet_proof_child_v1" as const;
export const MINIMAL_PACKET_PROOF_GUARDIAN_FORM_KEY = "minimal_packet_proof_guardian_v1" as const;
export const MINIMAL_PACKET_PROOF_PACKET_KEY = "minimal_packet_proof_packet_v1" as const;

/** Plaintext embed token (hash stored in DB). */
export const MINIMAL_PACKET_PROOF_PUBLIC_TOKEN = "alloy_demo_minimal_packet_proof_v1" as const;

export const MINIMAL_PACKET_PROOF_METADATA_SEED = "minimal_packet_proof_demo" as const;

export const MINIMAL_PACKET_PROOF_DEFINITION_METADATA = {
    demo: true,
    proof_packet: true,
    not_production_enrollment: true,
    description: "Two-step fake packet for engine smoke tests only.",
} as const;

/** Child form — step 1 */
export const MINIMAL_PACKET_PROOF_CHILD_SCHEMA = {
    schema_version: 1 as const,
    title: "Test Child Basics",
    sections: [{ id: "sec1", title: "Child", field_ids: ["child_first_name", "child_last_name", "child_date_of_birth", "start_date"] }],
    fields: [
        { id: "child_first_name", type: "text" as const, label: "Child first name", required: true },
        { id: "child_last_name", type: "text" as const, label: "Child last name", required: true },
        { id: "child_date_of_birth", type: "date" as const, label: "Child date of birth", required: true },
        { id: "start_date", type: "date" as const, label: "Desired start date", required: true },
    ],
} as const;

/** Guardian form — step 2 */
export const MINIMAL_PACKET_PROOF_GUARDIAN_SCHEMA = {
    schema_version: 1 as const,
    title: "Test Guardian Basics",
    sections: [
        {
            id: "sec1",
            title: "Guardian",
            field_ids: ["guardian_first_name", "guardian_last_name", "guardian_email", "guardian_phone"],
        },
    ],
    fields: [
        { id: "guardian_first_name", type: "text" as const, label: "Guardian first name", required: true },
        { id: "guardian_last_name", type: "text" as const, label: "Guardian last name", required: true },
        { id: "guardian_email", type: "text" as const, label: "Guardian email", required: true },
        { id: "guardian_phone", type: "text" as const, label: "Guardian phone", required: true },
    ],
} as const;

/** Expected packet step order (sequence_index 0 then 1). */
export const MINIMAL_PACKET_PROOF_STEP_KEYS = [
    MINIMAL_PACKET_PROOF_CHILD_FORM_KEY,
    MINIMAL_PACKET_PROOF_GUARDIAN_FORM_KEY,
] as const;
