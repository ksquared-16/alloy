/** Runtime Test 1C/1D fixtures — Alloy Bend org only (historical; not used for Demo validation). */
export const INTAKE_RUNTIME_TEST_ORG_ID = "7803388d-cdee-4afb-89cf-23a137f39423";
export const INTAKE_RUNTIME_TEST_FORM_ID = "e68e0160-3157-44fd-b207-2c0f14d1764f";
export const INTAKE_RUNTIME_TEST_1C_ID = "c5e2e078-97ee-4e17-9d66-1527a9f0c46b";
export const INTAKE_RUNTIME_TEST_1D_ID = "50ac6911-5887-4934-9ae8-a221d61f81f6";
export const INTAKE_RUNTIME_TEST_EMBED_TOKEN = "alloy_demo_medication_authorization_v1";

/** Demo Childcare Co — active browser validation org (Test 2D). */
export const DEMO_CHILDCARE_ORG_ID = "93667019-bd28-49b5-a688-acc9bb1e0a19";
export const DEMO_CHILDCARE_MED_FORM_ID = "8432c527-8799-4a55-88c7-f860bd78e747";
export const DEMO_CHILDCARE_MED_LINK_ID = "187ba369-78ab-4df1-99d9-ca8d3120379f";
export const DEMO_CHILDCARE_MED_EMBED_TOKEN =
    "alloy_demo_medication_authorization_v1__org_93667019-bd28-49b5-a688-acc9bb1e0a19";
export const DEMO_CHILDCARE_CENTER_LOCATION_ID = "7ce70708-3517-4ab3-93d0-241a75ec3284";
export const DEMO_CHILDCARE_ENROLLMENT_DEPT_ID = "04958a78-32ca-4091-bcd3-4bbaef3fee4b";
export const DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID = "5ba90557-876d-4450-9c28-36beac6e83be";
export const DEMO_CHILDCARE_VERTICAL_ID = "1000d719-2248-4816-8ff6-cbdeee8e91ce";

/** IC-4 review routing — Demo Childcare medication intake link metadata shape.
 *  First submit is **review-required** when `auto_create_customer_member: true` (IC-4 blocks auto-op). */
export const DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA = {
    lead_capture: true,
    intake: true,
    mode: "intake",
    auto_create_person: true,
    auto_create_customer: true,
    auto_create_customer_member: true,
    auto_create_opportunity: true,
    default_vertical_id: DEMO_CHILDCARE_VERTICAL_ID,
    default_location_id: DEMO_CHILDCARE_CENTER_LOCATION_ID,
    default_work_unit_id: DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID,
    default_department_id: DEMO_CHILDCARE_ENROLLMENT_DEPT_ID,
    default_opportunity_status_key: "new_inquiry",
    review_mode: "confidence",
    auto_operationalize: true,
    embed_mode: true,
    intake_opportunity_source: "embed",
    runtime_test: "forms_2d_demo_childcare",
} as const;

/** Lead-only auto-op proof path — same routing/review config without child member auto-create. */
export const DEMO_CHILDCARE_LEAD_ONLY_AUTO_OP_LINK_METADATA = {
    ...DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA,
    auto_create_customer_member: false,
    runtime_test: "forms_2d_demo_childcare_lead_only_auto_op",
} as const;

/** IC-5.6 — canonical enrollment lead opportunity proof (guardian-only demo form). */
export const DEMO_CHILDCARE_ENROLLMENT_LEAD_FORM_ID = "7cb6bd8f-8579-4a2b-8a64-969b4a37b457";
export const DEMO_CHILDCARE_ENROLLMENT_LEAD_LINK_ID = "81f5ba41-1619-4b39-9b1c-d282ba5e79a5";
export const DEMO_CHILDCARE_ENROLLMENT_LEAD_FORM_KEY = "enrollment_lead_capture_demo";
export const DEMO_CHILDCARE_ENROLLMENT_LEAD_EMBED_TOKEN =
    "alloy_demo_enrollment_lead_capture_v1__org_93667019-bd28-49b5-a688-acc9bb1e0a19";

export const DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA = {
    lead_capture: true,
    intake: true,
    mode: "intake",
    auto_create_person: true,
    auto_create_customer: true,
    auto_create_customer_member: false,
    auto_create_opportunity: true,
    default_vertical_id: DEMO_CHILDCARE_VERTICAL_ID,
    default_location_id: DEMO_CHILDCARE_CENTER_LOCATION_ID,
    default_work_unit_id: DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID,
    default_department_id: DEMO_CHILDCARE_ENROLLMENT_DEPT_ID,
    default_opportunity_status_key: "new_inquiry",
    review_mode: "confidence",
    auto_operationalize: true,
    embed_mode: true,
    intake_opportunity_source: "embed",
    runtime_test: "forms_2d_demo_enrollment_lead_proof",
} as const;

export const FORMS_SUBMISSIONS_API_PATH = "/api/admin/forms/submissions?limit=200";
