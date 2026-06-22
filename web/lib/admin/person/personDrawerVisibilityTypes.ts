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
    /** OCM / opportunity site location — used for site-scope household filtering. */
    location_id: string | null;
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
    /** Legacy `customer_persons.is_primary` — prefer `is_household_primary_contact` for badges. */
    is_primary: boolean;
    /** Household/customer-scoped primary contact (`role_type = primary_contact` + `is_primary`). */
    is_household_primary_contact: boolean;
};

/** Household customer names for child profile summary (read-only projection). */
export type PersonHouseholdContextRow = {
    customer_id: string;
    customer_name: string | null;
};

/** Child members on a shared household customer (projected for parent-facing family links). */
export type PersonHouseholdChildLinkRow = {
    customer_member_id: string;
    person_id: string | null;
    display_name: string | null;
    customer_id: string;
    date_of_birth?: string | null;
    age_label?: string | null;
    status_key?: string | null;
    status_label?: string | null;
    photo_url?: string | null;
};

/** Customer-owned mailing address from `locations` (location_type = address). */
export type PersonHouseholdCustomerAddressRow = {
    customer_id: string;
    location_id: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    label: string | null;
};

/** Child-scoped contact link from `customer_member_contacts` (+ resolved person when available). */
export type ChildScopedContactLinkRow = {
    customer_member_id: string;
    child_person_id: string | null;
    person_id: string | null;
    contact_id: string | null;
    display_name: string;
    role_type: string;
    role_label: string | null;
    is_primary: boolean;
    phone: string | null;
    email: string | null;
    sort_order: number | null;
};
