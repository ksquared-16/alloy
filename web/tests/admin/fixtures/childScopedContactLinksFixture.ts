/**
 * Fixture rows for child-scoped contact hydration regression tests.
 * Two siblings in one household with distinct guardians and emergency contacts.
 */

export const SIBLING_SCOPED_CONTACTS_FIXTURE = {
    orgId: "org-fixture",
    memberA: "member-child-a",
    memberB: "member-child-b",
    childPersonA: "person-child-a",
    childPersonB: "person-child-b",
    guardianAContactId: "contact-guardian-a",
    guardianBContactId: "contact-guardian-b",
    emergencyAContactId: "contact-emergency-a",
    emergencyBContactId: "contact-emergency-b",
} as const;

export function siblingHouseholdMemberContactRows() {
    const f = SIBLING_SCOPED_CONTACTS_FIXTURE;
    return [
        {
            id: "cmc-ga",
            customer_member_id: f.memberA,
            contact_id: f.guardianAContactId,
            role_key: "guardian",
            is_active: true,
            contact: {
                id: f.guardianAContactId,
                person_id: "person-guardian-a",
                first_name: "Jordan",
                last_name: "Lee",
                email: null,
                phone: null,
            },
        },
        {
            id: "cmc-gb",
            customer_member_id: f.memberB,
            contact_id: f.guardianBContactId,
            role_key: "guardian",
            is_active: true,
            contact: {
                id: f.guardianBContactId,
                person_id: "person-guardian-b",
                first_name: "Alex",
                last_name: "Johnson",
                email: null,
                phone: null,
            },
        },
        {
            id: "cmc-ea",
            customer_member_id: f.memberA,
            contact_id: f.emergencyAContactId,
            role_key: "emergency_contact",
            is_active: true,
            contact: {
                id: f.emergencyAContactId,
                person_id: "person-emergency-a",
                first_name: "Pat",
                last_name: "Lee",
                email: null,
                phone: null,
            },
        },
        {
            id: "cmc-eb",
            customer_member_id: f.memberB,
            contact_id: f.emergencyBContactId,
            role_key: "emergency_contact",
            is_active: true,
            contact: {
                id: f.emergencyBContactId,
                person_id: "person-emergency-b",
                first_name: "Sam",
                last_name: "Walsh",
                email: null,
                phone: null,
            },
        },
        {
            id: "cmc-bill-a",
            customer_member_id: f.memberA,
            contact_id: "contact-billing-a",
            role_key: "billing_contact",
            is_active: true,
            contact: {
                id: "contact-billing-a",
                person_id: "person-billing-a",
                first_name: "Taylor",
                last_name: "Lee",
                email: null,
                phone: null,
            },
        },
        {
            id: "cmc-bill-b",
            customer_member_id: f.memberB,
            contact_id: "contact-billing-b",
            role_key: "payer",
            is_active: true,
            contact: {
                id: "contact-billing-b",
                person_id: "person-billing-b",
                first_name: "Chris",
                last_name: "Johnson",
                email: null,
                phone: null,
            },
        },
    ];
}

export function siblingHouseholdRoleRows() {
    return [
        { role_key: "guardian", role_label: "Guardian", sort_order: 10 },
        { role_key: "emergency_contact", role_label: "Emergency contact", sort_order: 20 },
        { role_key: "billing_contact", role_label: "Billing contact", sort_order: 30 },
        { role_key: "payer", role_label: "Payer", sort_order: 31 },
    ];
}

export function siblingHouseholdMemberRows() {
    const f = SIBLING_SCOPED_CONTACTS_FIXTURE;
    return [
        { id: f.memberA, person_id: f.childPersonA },
        { id: f.memberB, person_id: f.childPersonB },
    ];
}

export function siblingInquiryChildren() {
    const f = SIBLING_SCOPED_CONTACTS_FIXTURE;
    return [
        {
            id: f.memberA,
            customer_member_id: f.memberA,
            person_id: f.childPersonA,
            display_name: "Riley Brooks",
            first_name: "Riley",
            last_name: "Brooks",
            dob: null,
            age: null,
            desired_program_type: null,
            desired_program_category_id: null,
            desired_program_label: null,
            desired_schedule_type: null,
            desired_schedule_label: null,
            outcome_status_key: null,
            outcome_status_label: null,
            fit_status: null,
            notes: null,
            desired_start_date: null,
            custom_fields: {},
            metadata: null,
            created_at: null,
        },
        {
            id: f.memberB,
            customer_member_id: f.memberB,
            person_id: f.childPersonB,
            display_name: "Sam Johnson",
            first_name: "Sam",
            last_name: "Johnson",
            dob: null,
            age: null,
            desired_program_type: null,
            desired_program_category_id: null,
            desired_program_label: null,
            desired_schedule_type: null,
            desired_schedule_label: null,
            outcome_status_key: null,
            outcome_status_label: null,
            fit_status: null,
            notes: null,
            desired_start_date: null,
            custom_fields: {},
            metadata: null,
            created_at: null,
        },
    ];
}
