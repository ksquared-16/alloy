/**
 * The configuration-only allowlist for a tenant's export and import (briefing M8, §5.6; P3 R1).
 *
 * P3 R1: KEEP-CONFIG is re-authored through the app's own write paths from a reviewed configuration-only listing,
 * never a row dump. This module is that listing's definition, and the only place a kind becomes transferable:
 *
 *   TRANSFERABLE_KINDS   what the export may write and the import may re-author, each with its exact field list
 *   NOT_TRANSFERRED      every other kind anyone might ask for, with the reason it is refused
 *   TABLE_CLASSES        the §5.6 table classification: what the import writes, and what must keep its step-9 count
 *
 * A kind joins TRANSFERABLE_KINDS only when (a) P3 classifies it KEEP-CONFIG, or the owner has decided an OWNER item
 * that way, and (b) the import has an app write path for it. Pure data; no I/O.
 */

export const CONFIG_EXPORT_FORMAT = "alloy.tenant-config-export.v1" as const;

export const TRANSFERABLE_KINDS = ["sites", "rooms", "household_role_types", "enrollment_process"] as const;
export type TransferableKind = (typeof TRANSFERABLE_KINDS)[number];

/** The exact keys of each item in the export file. An item with any other key is refused by the import. */
export const KIND_FIELDS: Record<TransferableKind, readonly string[]> = {
    // P3 C5. Address is the school's, not a person's. Label is the natural key within the org.
    sites: ["ref", "label", "is_active", "address1", "address2", "city", "state", "postal_code", "country", "metadata"],
    // P3 C5. Capacity, ratio and age group live in metadata, as on the live tenant.
    rooms: ["ref", "site_ref", "label", "unit_role", "is_active", "metadata"],
    // P4 F4 (K7 is per-org on a fresh database, so KEEP-CONFIG for a rebuilt tenant).
    household_role_types: ["ref", "key", "label", "description", "sort_order", "is_active"],
    // P3 C1/C2. The lifecycle department and its published Enrollment process; its lane work units are derived by
    // the app's work-unit repair, so only their keys travel, to be checked after the import.
    enrollment_process: ["ref", "department", "process", "derived_work_unit_keys"],
};

/** Metadata keys kept on locations. Every other key is dropped and named in the file's `dropped_metadata_keys`. */
export const LOCATION_METADATA_KEYS: Record<"sites" | "rooms", readonly string[]> = {
    sites: ["site_key"],
    rooms: ["capacity", "ratio", "classroom_age_group", "age_group", "licensed_capacity"],
};

export const DEPARTMENT_FIELDS = ["key", "name", "description", "sort_order"] as const;

/** Firefly's lifecycle department (P3 C1; lib/staging/fireflyStagingSeed/lifecycleTarget.ts). C3/C4 stay behind. */
export const ENROLLMENT_DEPARTMENT_KEYS = ["lead_management"] as const;

/**
 * Kinds that are refused by name. `--kinds` naming one of these, or a file carrying one, fails with this reason.
 * Bindings and merchants are never transferred (P3 C15, B4; briefing I-7): re-provisioned per environment.
 */
export const NOT_TRANSFERRED: Record<string, string> = {
    customers: "household data (P3 L1); never carried (D7)",
    households: "household data (P3 L1); never carried (D7)",
    families: "household data (P3 L1); never carried (D7)",
    guardians: "person data (P3 L1); never carried (D7)",
    children: "person data (P3 L1); never carried (D7)",
    persons: "person data (P3 L1); never carried (D7)",
    contacts: "person data (P3 L1); never carried (D7)",
    leads: "records (P3 L1); never carried (D7)",
    opportunities: "records (P3 L1); never carried (D7)",
    cases: "records (P3 L1); never carried (D7)",
    participations: "records (P3 L1); never carried (D7)",
    tasks: "records (P3 L1, L12); never carried (D7)",
    work_items: "runtime state (P3 L12); never carried (D7)",
    process_instances: "runtime state (P3 L12); never carried (D7)",
    staff: "staff personal data; never carried (D7)",
    employments: "staff personal data; never carried (D7)",
    users: "identities are added in Auth by the owner, never exported (P3 L8)",
    memberships: "identities and memberships are re-provisioned, never exported (P3 L8)",
    charges: "transactions (P3 L2); never carried (D7)",
    payments: "transactions (P3 L2); never carried (D7)",
    agreements: "transactions (P3 L2); never carried (D7)",
    documents: "documents and storage objects (P3 L3); never carried (D7)",
    storage: "documents and storage objects (P3 L3); never carried (D7)",
    messages: "communications history (P3 L4); never carried (D7)",
    threads: "communications history (P3 L4); never carried (D7)",
    outbox: "communications history (P3 L4); never carried (D7)",
    audit_events: "history (P3 L12, C18); never carried",
    mutation_events: "history (P3 L12, C18); never carried",
    configuration_history: "P3 C18 recommendation LEAVE: only the current published state travels",
    provider_bindings: "environment credentials: re-provisioned per environment, never transferred (P3 C15, B4; I-7)",
    payment_merchants: "environment credentials: re-provisioned per environment, never transferred (P3 C15, B4; I-7)",
    sender_identities: "environment credentials: re-provisioned per environment, never transferred (P3 C15, B4; I-7)",
    secrets: "secrets are never data to export (P3 B4; I-7)",
    vault_credentials: "provisioned per org in Vault, never transferred (P3 B4; I-7)",
    // KEEP-CONFIG or OWNER items not yet in the allowlist, each with what would admit it.
    programs:
        "P3 C6 KEEP-CONFIG, but the app's only path that makes a Program available at a site " +
        "(assignProgramDistribution) writes configuration_distribution_runs columns the migration chain never creates " +
        "(requested_by, requested_by_label, subject_key, revision_*), so it fails on a database built from the chain; " +
        "not transferable until that is fixed (B3 finding)",
    program_categories: "see programs",
    catalog_rates: "P3 C8 is OWNER (real prices or demo numbers?); not transferable until the owner decides",
    charge_templates: "P3 C10: no app write path exists for charge templates (only a demo seeder); not transferable yet",
    financial_policies: "P3 C11: LEAVE, or OWNER for \"Tuition terms — net 10\"; not transferable until the owner decides",
    accounting_calendar: "P3 C12 is OWNER; not transferable until the owner decides",
    forms: "P3 C13: counts BLOCKED on STG-CENSUS; not transferable yet",
    document_types: "P3 C13: counts BLOCKED on STG-CENSUS; not transferable yet",
    control_plane: "P3 C14: BLOCKED on STG-CENSUS; the org helper provisions the relationship-field configuration",
    communication_templates: "P3 C15 KEEP-CONFIG, but no reviewed re-authoring path yet; not transferable yet",
    tour_availability: "P3 C16: BLOCKED on STG-CENSUS; public links embed the staging origin and are re-issued",
    role_definitions: "P3 C17: system roles come with the org (K2); tenant role definitions need a key-by-key review first",
    org_settings: "P3 C17: one JSON document that may mix real settings with QA toggles; review key by key first",
    other_departments: "P3 C3 (OWNER, recommendation LEAVE) and C4 (BLOCKED on STG-CENSUS)",
};

/** Why a kind is refused: the named reason, or "not on the allowlist". */
export function refusalReasonForKind(kind: string): string | null {
    if ((TRANSFERABLE_KINDS as readonly string[]).includes(kind)) return null;
    return NOT_TRANSFERRED[kind] ?? "not on the configuration allowlist (lib/tenancy/configTransfer/allowlist.ts)";
}

/**
 * The §5.6 table classification (briefing §9: "the export names each table as configuration, record/transaction or
 * platform"). `import_writes` are the tables the org helper and the import write, directly or through the app's
 * own write paths (publication, audit, projection). Every `record_or_transaction` table must hold exactly its step-9
 * baseline count after step 16, and so must every other table the baseline names that is not in `import_writes`.
 */
export const TABLE_CLASSES = {
    import_writes: [
        // Measured: B3 rehearsal, step-9 census against the census after step 16 (evidence release/step16-census-diff.txt).
        // the org helper
        "orgs",
        "user_roles",
        "user_access_profiles",
        "role_definitions",
        "role_permission_grants",
        "field_section_definitions",
        "option_sets",
        "option_set_items",
        "field_definitions",
        // the org's per-org defaults, written by the database when the org row is inserted
        "document_categories",
        "document_types",
        "document_type_versions",
        // sites and rooms
        "locations",
        // household role vocabulary
        "customer_person_role_types",
        // the lifecycle department, its published process, the publish route's follow-ups
        "departments",
        "business_process_drafts",
        "business_process_revisions",
        "configuration_publications",
        "workflow_events",
        "record_drawer_layouts",
        // lane work units and projection hosts (the work-unit repair; not reached when the export names none)
        "work_units",
    ],
    record_or_transaction: [
        "customers", "customer_members", "customer_persons", "customer_member_contacts", "customer_member_contact_roles",
        "customer_subscriptions", "customer_tags", "persons", "person_locations", "person_relationships",
        "person_child_relationships", "person_child_relationship_roles", "person_health_facts", "person_medical_consents",
        "person_kiosk_codes", "user_person_links", "opportunities", "opportunity_persons", "opportunity_customer_members",
        "opportunity_tags", "process_instances", "operational_tasks", "tour_bookings", "child_placements",
        "child_enrollment_agreements", "child_attendance_events", "child_safeguarding_restrictions",
        "child_safeguarding_screenings", "enrollment_pricing_terms", "enrollment_requirement_exceptions",
        "employments", "employment_positions", "employment_compensation_terms", "staff_qualifications",
        "staff_qualification_evidence", "staff_presence_events", "staff_availability_windows",
        "staff_availability_exceptions", "staff_coverage_allocations", "charges", "charge_line_items", "payments",
        "payment_allocations", "payment_methods", "payment_instruments", "payment_autopay_arrangements",
        "payment_collection_attempts", "payment_holds", "payment_provider_events", "payment_provider_refunds",
        "payment_provider_disputes", "ledger_transactions", "documents", "document_versions", "document_field_values",
        "form_submissions", "form_submission_documents", "form_submission_signatures", "communication_threads",
        "communication_messages", "communication_message_recipients", "communication_message_reads",
        "communication_scheduled_sends", "communication_delivery_events", "communication_inbound_ingress",
        "messages", "messages_outbox", "consumption_events",
    ],
    never_transferred_bindings: [
        "communication_provider_accounts", "communication_provider_bindings", "communication_identities",
        "communication_identity_grants", "communication_identity_location_bindings", "communication_ingress_routes",
        "payment_provider_merchants", "organization_provider_credential_events", "tour_public_booking_links",
    ],
} as const;

/**
 * P3 §T test-data markers, applied to keys and labels. A row carrying one is left behind and named in the file's
 * `left_behind` list (key or label and the marker only, never other columns).
 */
export const LABEL_MARKERS: ReadonlyArray<{ marker: string; test: RegExp }> = [
    { marker: "QA prefix", test: /^QA\b/i },
    { marker: "Cert … timestamp", test: /^Cert\b.*\d{6,}/i },
    { marker: "S<n> proof", test: /\bS\d+ proof\b/i },
    { marker: "cert_ key prefix", test: /^cert_/i },
    { marker: "epoch-ms key suffix", test: /_\d{13}$/ },
    { marker: "stage4_ok3_ key", test: /^stage4_ok3_/i },
    { marker: "[Staging seed] name", test: /\[Staging seed\]/i },
    { marker: "QA<slice> <run> prefix", test: /^QA[0-9a-z]+ [a-z0-9_-]{4,}/i },
];

export const SEED_ID_PREFIX = "f17e0000-0000-4000-8000-" as const;
export const MARKER_EXTERNAL_SOURCES = ["alloy_qa_fixture", "alloy_qa_structure", "alloy_seed_fixture", "firefly_staging_seed"] as const;

/** Row-level markers: metadata and source columns, and the seed id namespace. */
export function rowMarker(row: {
    id?: string | null;
    external_source?: string | null;
    metadata?: Record<string, unknown> | null;
}, opts: { keepSeedConfig: boolean }): string | null {
    const md = row.metadata ?? {};
    if (md.qa_run_id != null) return "metadata.qa_run_id";
    if (md.demo_seed_package != null) return "metadata.demo_seed_package";
    if (md.is_demo_data === true) return "metadata.is_demo_data";
    if (typeof md.seed_key === "string" && md.seed_key.startsWith("golden_path")) return "metadata.seed_key golden_path";
    const src = String(row.external_source ?? "");
    if (src && (MARKER_EXTERNAL_SOURCES as readonly string[]).includes(src) && !(opts.keepSeedConfig && src === "firefly_staging_seed")) {
        return `external_source ${src}`;
    }
    if (!opts.keepSeedConfig) {
        if (md.seed != null) return "metadata.seed";
        if (String(row.id ?? "").startsWith(SEED_ID_PREFIX)) return "seed id namespace";
    }
    return null;
}

export function labelMarker(...texts: Array<string | null | undefined>): string | null {
    for (const text of texts) {
        if (!text) continue;
        for (const m of LABEL_MARKERS) if (m.test.test(text)) return m.marker;
    }
    return null;
}
