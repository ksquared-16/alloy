/** Presentation-only profile keys — not persisted. */
export type PersonDrawerProfileKey =
    | "child"
    | "parent"
    | "guardian"
    | "employee"
    | "emergency_contact"
    | "mixed"
    | "unknown";

export type PersonDrawerProfileResult = {
    /** Resolved roles excluding `mixed` / `unknown`. */
    profiles: Exclude<PersonDrawerProfileKey, "mixed" | "unknown">[];
    /** Single display token for analytics / section gating. */
    display: PersonDrawerProfileKey;
    /** Operator-facing badge labels in precedence order. */
    badgeLabels: string[];
};

export type PersonRelationshipLink = {
    person_id: string | null;
    customer_member_id?: string | null;
    display_name: string | null;
    relationship_label: string | null;
};

export type PersonDrawerRelationshipGroups = {
    parents: PersonRelationshipLink[];
    guardians: PersonRelationshipLink[];
    emergency_contacts: PersonRelationshipLink[];
    children: PersonRelationshipLink[];
    siblings: PersonRelationshipLink[];
};

export type PersonEnrollmentMirrorRow = {
    id: string;
    opportunity_id: string;
    opportunity_name: string | null;
    opportunity_status_key: string | null;
    opportunity_status_label: string | null;
    customer_member_id: string;
    child_display_name: string | null;
    location_label: string | null;
    program_label: string | null;
    room_label: string | null;
    outcome_status_key: string | null;
    outcome_status_label: string | null;
};

export type PersonEnrollmentOpportunityRow = {
    opportunity_id: string;
    opportunity_name: string | null;
    status_key: string | null;
    status_label: string | null;
    role_label: string | null;
    link_source: "primary_person" | "opportunity_person";
};

export type PersonSiblingLinkRow = {
    customer_member_id: string;
    person_id: string | null;
    display_name: string | null;
    customer_id: string;
};

/** Adults on a shared household customer (projected for child-facing family links). */
export type PersonHouseholdAdultLinkRow = {
    person_id: string;
    display_name: string | null;
    role_type: string | null;
    role_label: string | null;
    customer_id: string;
    is_primary: boolean;
};

/** Child members on a shared household customer (projected for parent-facing family links). */
export type PersonHouseholdChildLinkRow = {
    customer_member_id: string;
    person_id: string | null;
    display_name: string | null;
    customer_id: string;
};
