/** Card 9b — Task Assist command bar entity search (opportunities-first; optional customer→opp). */

export type TaskAssistEntitySearchConfidence = "high" | "medium" | "low";

export type TaskAssistEntitySearchSource =
    | "opportunity_name"
    | "customer_family"
    | "customer_member"
    | "primary_person"
    | "primary_contact"
    | "uuid_match";

export type TaskAssistEntitySearchCandidate = {
    entity_type: "opportunities";
    entity_id: string;
    label: string;
    subtitle: string | null;
    confidence: TaskAssistEntitySearchConfidence;
    source: TaskAssistEntitySearchSource;
    matched_fields: string[];
    disambiguation?: {
        customer_name?: string | null;
        opportunity_number?: string | number | null;
        location_name?: string | null;
    };
};

export type TaskAssistEntitySearchResponseBody = {
    ok: true;
    q: string;
    candidates: TaskAssistEntitySearchCandidate[];
};
