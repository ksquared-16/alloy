import type { ActionWorkspaceBosSuggestion } from "@/lib/admin/actions/actionWorkspaceTypes";

export const SAMPLE_PASTE = `Parent: Jordan Lee
Email: jordan@example.com
Phone: (555) 123-4567
Child: Riley Lee
Program: Toddler Room
Source: Website inquiry
Notes: Wants a tour next week, flexible on start date`;

export const BOS_SUGGESTIONS: ActionWorkspaceBosSuggestion[] = [
    {
        id: "first_name:Jordan",
        payload_key: "first_name",
        field_label: "First name",
        suggested_value: "Jordan",
        confidence: "high",
        selected: true,
    },
    {
        id: "last_name:Lee",
        payload_key: "last_name",
        field_label: "Last name",
        suggested_value: "Lee",
        confidence: "high",
        selected: true,
    },
    {
        id: "email:jordan@example.com",
        payload_key: "email",
        field_label: "Email",
        suggested_value: "jordan@example.com",
        confidence: "high",
        selected: true,
    },
    {
        id: "phone:(555) 123-4567",
        payload_key: "phone",
        field_label: "Phone",
        suggested_value: "(555) 123-4567",
        confidence: "high",
        selected: true,
    },
    {
        id: "child_first_name:Riley",
        payload_key: "child_first_name",
        field_label: "Child first name",
        suggested_value: "Riley",
        confidence: "high",
        selected: true,
    },
    {
        id: "source:Website",
        payload_key: "source",
        field_label: "Source",
        suggested_value: "Website inquiry",
        confidence: "medium",
        selected: true,
    },
];

/** Post-apply values when BOS had medium-confidence fields — Review path required. */
export const GATHER_VALUES_WITH_MEDIUM_CONFIDENCE: Record<string, string> = {
    first_name: "Jordan",
    last_name: "Lee",
    email: "jordan@example.com",
    phone: "(555) 123-4567",
    child_first_name: "Riley",
    child_last_name: "Lee",
    child_program: "Toddler Room",
    source: "Website inquiry",
    intake_notes: "Wants a tour next week",
    child_date_of_birth: "",
    child_desired_start_date: "",
};

export const GATHER_VALUES_FILLED: Record<string, string> = {
    first_name: "Jordan",
    last_name: "Lee",
    email: "jordan@example.com",
    phone: "(555) 123-4567",
    child_first_name: "Riley",
    child_last_name: "Lee",
    child_program: "Toddler Room",
    source: "Website inquiry",
    intake_notes: "Wants a tour next week, flexible on start date",
    child_date_of_birth: "",
    child_desired_start_date: "",
};
