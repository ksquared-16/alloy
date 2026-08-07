/**
 * Platform Capability Registry spine (P0.S1 — honesty only).
 *
 * Composes around RegisteredAction keys (validated in tests against
 * {@link listRegisteredActionKeys}): every registered handler must have an
 * `executable` capability with `executionOwner: "registered_action"`. Other identities are
 * classified against current domain owners without moving execution.
 *
 * @see qa/missions/commands-capability-ledger-msn_188e8bea6fb6de28dd21.md
 */

import { ALL_IDENTITY_COMMAND_KEYS } from "@/lib/pos/processingIdentity/commands/commandKeys";
import { RELATIONSHIP_DEFINITIONS } from "@/lib/fields/relationship/relationshipDefinitions";
import type {
    CapabilityCatalogVisibility,
    CapabilityExecutionOwner,
    CapabilityMaturity,
    PlatformCapabilityDefinition,
} from "@/lib/platform/commands/capabilityTypes";

/** Must stay in sync with REGISTERED_ACTION_LIST — enforced by capabilityRegistry.test.ts. */
export const REGISTERED_ACTION_CAPABILITY_KEYS = [
    "update_status",
    "create_lead",
    "confirm_tour",
    "send_tour_invitation",
    "schedule.create",
    "assignment.create",
    "assignment.change_room",
    "assignment.set_primary",
    "assignment.archive",
    "assignment.promote_proposed",
    "assignment.delete_proposed",
] as const;

function def(
    partial: PlatformCapabilityDefinition
): PlatformCapabilityDefinition {
    return partial;
}

/**
 * Explicit spine entries for identities required to prove P0.S1 honesty.
 * Not a dump of every historical seed — see ledger for verified set.
 */
const CAPABILITY_DEFINITIONS: readonly PlatformCapabilityDefinition[] = [
    // ── Registered Action (executable) ─────────────────────────────────────
    def({
        capabilityKey: "create_lead",
        canonicalCommandKey: "create_lead",
        operatorLabel: "Create lead",
        family: "record_creation",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["none", "opportunity"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "create_lead",
        implementationStatus: "production",
    }),
    def({
        capabilityKey: "update_status",
        canonicalCommandKey: "update_status",
        operatorLabel: "Update status",
        family: "status",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "internal_only",
        supportedSubjects: ["opportunity"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "update_status",
        implementationStatus: "legacy",
        reason: "Domain verbs (close_lead / waitlist_child / enroll_child) are the operator catalog; update_status remains internal.",
    }),
    def({
        capabilityKey: "confirm_tour",
        canonicalCommandKey: "confirm_tour",
        operatorLabel: "Confirm tour",
        family: "tours",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "confirm_tour",
        implementationStatus: "production",
        reason: "RegisteredAction delegates to tour domain; tour REST also exists — P5 converges invoke path.",
    }),
    def({
        capabilityKey: "send_tour_invitation",
        canonicalCommandKey: "send_tour_invitation",
        operatorLabel: "Send tour invitation",
        family: "tours",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "send_tour_invitation",
        implementationStatus: "production",
        reason: "Slice D: the only operator entry point that mints a tour invitation and sends it through the canonical communication path.",
    }),
    def({
        capabilityKey: "schedule.create",
        canonicalCommandKey: "schedule.create",
        operatorLabel: "Create schedule",
        family: "scheduling",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["schedule", "opportunity_customer_member"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "schedule.create",
        implementationStatus: "partial",
    }),
    def({
        capabilityKey: "assignment.set_primary",
        canonicalCommandKey: "assignment.set_primary",
        operatorLabel: "Set primary assignment",
        family: "scheduling",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["child", "person"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "assignment.set_primary",
        implementationStatus: "production",
        reason:
            "Assignment platform RegisteredAction (staging). Domain: setPrimaryOperationalAssignment. Registry honesty after staging merge; not a Commands destructive cutover.",
    }),
    def({
        capabilityKey: "assignment.create",
        canonicalCommandKey: "assignment.create",
        operatorLabel: "Create assignment",
        family: "scheduling",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["child", "person"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "assignment.create",
        implementationStatus: "production",
        reason: "Assignment platform RegisteredAction (staging). Registry honesty; not Commands P4.",
    }),
    def({
        capabilityKey: "assignment.change_room",
        canonicalCommandKey: "assignment.change_room",
        operatorLabel: "Change assignment room",
        family: "scheduling",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["child", "person"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "assignment.change_room",
        implementationStatus: "production",
        reason: "Assignment platform RegisteredAction (staging). Registry honesty; not Commands P4.",
    }),
    def({
        capabilityKey: "assignment.archive",
        canonicalCommandKey: "assignment.archive",
        operatorLabel: "Archive assignment",
        family: "scheduling",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["child", "person"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "assignment.archive",
        implementationStatus: "production",
        reason:
            "Archives an operational assignment row — distinct from archive_lead (unavailable). Registry honesty after staging merge.",
    }),
    def({
        capabilityKey: "assignment.promote_proposed",
        canonicalCommandKey: "assignment.promote_proposed",
        operatorLabel: "Promote proposed assignment",
        family: "scheduling",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["child", "person"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "assignment.promote_proposed",
        implementationStatus: "production",
        reason: "Assignment platform RegisteredAction (staging). Registry honesty; not Commands P4.",
    }),
    def({
        capabilityKey: "assignment.delete_proposed",
        canonicalCommandKey: "assignment.delete_proposed",
        operatorLabel: "Delete proposed assignment",
        family: "scheduling",
        maturity: "executable",
        executionOwner: "registered_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["child", "person"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        registeredActionKey: "assignment.delete_proposed",
        implementationStatus: "production",
        reason: "Assignment platform RegisteredAction (staging). Registry honesty; not Commands P4.",
    }),

    // ── Mutation Runtime (adapted) ─────────────────────────────────────────
    def({
        capabilityKey: "update_lead_status",
        canonicalCommandKey: "update_lead_status",
        operatorLabel: "Update Lead Status",
        family: "status",
        maturity: "adapted",
        executionOwner: "mutation_runtime",
        catalogVisibility: "internal_only",
        supportedSubjects: ["opportunity"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        implementationStatus: "production",
        reason: "Runtime-internal umbrella; operator catalog prefers close_lead.",
    }),
    def({
        capabilityKey: "change_lead_location",
        canonicalCommandKey: "change_lead_location",
        operatorLabel: "Change lead location",
        family: "workflow",
        maturity: "adapted",
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "domain_owned",
        implementationStatus: "production",
        reason:
            "Manage modal → PATCH opportunities.location_id (family default); optional OCM updates for inheriting children.",
    }),
    def({
        capabilityKey: "close_lead",
        canonicalCommandKey: "close_lead",
        operatorLabel: "Close Lead",
        family: "status",
        maturity: "adapted",
        executionOwner: "mutation_runtime",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: true,
        confirmationPolicy: "strong_confirm",
        compatibilityAliases: ["mark_lost"],
        implementationStatus: "production",
    }),
    def({
        capabilityKey: "update_child_enrollment_status",
        canonicalCommandKey: "update_child_enrollment_status",
        operatorLabel: "Update Child Enrollment Status",
        family: "enrollment",
        maturity: "adapted",
        executionOwner: "mutation_runtime",
        catalogVisibility: "internal_only",
        supportedSubjects: ["opportunity_customer_member"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        implementationStatus: "production",
    }),
    def({
        capabilityKey: "waitlist_child",
        canonicalCommandKey: "waitlist_child",
        operatorLabel: "Waitlist Child",
        family: "enrollment",
        maturity: "adapted",
        executionOwner: "mutation_runtime",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity_customer_member"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        compatibilityAliases: ["move_to_waitlist"],
        implementationStatus: "partial",
    }),
    def({
        capabilityKey: "enroll_child",
        canonicalCommandKey: "enroll_child",
        operatorLabel: "Enroll Child",
        family: "enrollment",
        maturity: "adapted",
        executionOwner: "mutation_runtime",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity_customer_member"],
        supportsPreview: true,
        confirmationPolicy: "confirm",
        compatibilityAliases: ["approve_enrollment"],
        implementationStatus: "partial",
    }),

    // ── Relationship Runtime (adapted) ─────────────────────────────────────
    def({
        capabilityKey: "add_billing_contact",
        canonicalCommandKey: "add_billing_contact",
        operatorLabel: "Add Billing Contact",
        family: "relationships",
        maturity: "adapted",
        executionOwner: "relationship_runtime",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["child", "person", "opportunity"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "production",
    }),
    def({
        capabilityKey: "add_child",
        canonicalCommandKey: "add_child",
        operatorLabel: "Add Child",
        family: "relationships",
        maturity: "adapted",
        executionOwner: "relationship_runtime",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "person"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "production",
        reason: "Also has inquiry-modal dual UI path; P3 converges hub without changing ownership here.",
    }),
    def({
        capabilityKey: "link_existing_person",
        canonicalCommandKey: "link_existing_person",
        operatorLabel: "Link Existing Person",
        family: "relationships",
        maturity: "adapted",
        executionOwner: "relationship_runtime",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "person", "child"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "production",
    }),
    def({
        capabilityKey: "link_existing_child",
        canonicalCommandKey: "link_existing_child",
        operatorLabel: "Link Existing Child",
        family: "relationships",
        maturity: "adapted",
        executionOwner: "relationship_runtime",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "person"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "production",
    }),
    def({
        capabilityKey: "make_primary_contact",
        canonicalCommandKey: "make_primary_contact",
        operatorLabel: "Make Primary Contact",
        family: "relationships",
        maturity: "adapted",
        /**
         * Not Relationship Framework (`executeRelationshipAction` rejects externalExecutor).
         * Canonical write: PATCH /api/admin/customers/:id/household-primary-contact
         * → setHouseholdPrimaryContactForCustomer (displaces prior is_primary + syncs opportunities).
         * P4.S2: Command Runtime replacement cutover (preview + correlated commit).
         * Domain authority unchanged: setHouseholdPrimaryContactForCustomer.
         * Direct PATCH /api/admin/customers/:id/household-primary-contact remains (Option A).
         */
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["person", "opportunity"],
        supportsPreview: true,
        confirmationPolicy: "strong_confirm",
        destructiveKind: "replace",
        implementationStatus: "production",
        reason:
            "Household primary designation with displacement. P4.S2: facade preview+commit via " +
            "destructive replacement adapter → setHouseholdPrimaryContactForCustomer. " +
            "Direct customer PATCH remains a compatibility path without preview tokens.",
    }),

    // ── Family overlap (explicit; no execution consolidation in P0) ────────
    def({
        capabilityKey: "add_family_member",
        canonicalCommandKey: "add_family_member",
        operatorLabel: "Add family member",
        family: "relationships",
        maturity: "adapted",
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "person"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        compatibilityAliases: ["add_related_person", "add_person"],
        implementationStatus: "production",
        reason: "Capture-first path via executeAdminAction; product hub converges in P3 — not consolidated here.",
    }),
    def({
        capabilityKey: "add_sibling",
        canonicalCommandKey: "add_sibling",
        operatorLabel: "Add sibling",
        family: "relationships",
        maturity: "adapted",
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "partial",
        reason: "Maps to add_child form path; overlap with relationship add_child remains until P3.",
    }),

    // ── Tours (domain; confirm_tour also registered — see above) ───────────
    def({
        capabilityKey: "schedule_tour",
        canonicalCommandKey: "schedule_tour",
        operatorLabel: "Schedule tour",
        family: "tours",
        maturity: "adapted",
        executionOwner: "tour_domain",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "domain_owned",
        implementationStatus: "production",
        reason: "Not a RegisteredAction; modals + booking create API.",
    }),
    def({
        capabilityKey: "reschedule_tour",
        canonicalCommandKey: "reschedule_tour",
        operatorLabel: "Reschedule tour",
        family: "tours",
        maturity: "adapted",
        executionOwner: "tour_domain",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "tour_booking"],
        supportsPreview: true,
        confirmationPolicy: "domain_owned",
        implementationStatus: "production",
        reason:
            "P5.S1: facade → rescheduleTourBooking (in-place booking update). Direct POST .../bookings/:id/reschedule remains compatibility (Option A).",
    }),
    def({
        capabilityKey: "cancel_tour",
        canonicalCommandKey: "cancel_tour",
        operatorLabel: "Cancel tour",
        family: "tours",
        maturity: "adapted",
        executionOwner: "tour_domain",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: true,
        confirmationPolicy: "strong_confirm",
        destructiveKind: "cancel",
        implementationStatus: "production",
        reason:
            "P5.S2: facade destructive preview + strong confirm → cancelTourBooking. " +
            "Direct POST .../bookings/:id/cancel remains compatibility (Option A). Reopen Tour unavailable.",
    }),
    def({
        capabilityKey: "complete_tour",
        canonicalCommandKey: "complete_tour",
        operatorLabel: "Complete tour",
        family: "tours",
        maturity: "adapted",
        executionOwner: "tour_domain",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "tour_booking"],
        supportsPreview: true,
        confirmationPolicy: "domain_owned",
        implementationStatus: "production",
        reason:
            "P5.S3: facade → markTourBookingCompleted (confirmed|rescheduled only). " +
            "Direct POST .../bookings/:id/complete remains compatibility (Option A).",
    }),
    def({
        capabilityKey: "no_show_tour",
        canonicalCommandKey: "no_show_tour",
        operatorLabel: "Mark tour no-show",
        family: "tours",
        maturity: "adapted",
        executionOwner: "tour_domain",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "tour_booking"],
        supportsPreview: true,
        confirmationPolicy: "domain_owned",
        compatibilityAliases: ["mark_tour_no_show"],
        implementationStatus: "production",
        reason:
            "P5.S3: facade → markTourBookingNoShow. Alias mark_tour_no_show → no_show_tour. " +
            "Direct POST .../bookings/:id/no-show remains compatibility (Option A).",
    }),
    def({
        capabilityKey: "reopen_tour",
        canonicalCommandKey: "reopen_tour",
        operatorLabel: "Reopen tour",
        family: "tours",
        maturity: "unavailable",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "strong_confirm",
        implementationStatus: "missing",
        reason: "Contract-only until post-P5; recovery today = Schedule Tour (new booking).",
    }),

    // ── Destructive / recovery reference (classified; not newly exposed) ───
    def({
        capabilityKey: "delete_lead",
        canonicalCommandKey: "delete_lead",
        operatorLabel: "Delete Lead",
        family: "destructive",
        maturity: "adapted",
        executionOwner: "admin_action",
        catalogVisibility: "internal_only",
        supportedSubjects: ["opportunity"],
        supportsPreview: true,
        confirmationPolicy: "typed_confirm",
        destructiveKind: "delete",
        implementationStatus: "partial",
        reason: "Hard-delete via executeDeleteOpportunityLead. P4.S3: facade preview+typed confirm+commit. Direct POST /api/admin/opportunities/:id/delete remains compatibility (Option A).",
    }),
    def({
        capabilityKey: "archive_lead",
        canonicalCommandKey: "archive_lead",
        operatorLabel: "Archive Lead",
        family: "destructive",
        maturity: "unavailable",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: true,
        confirmationPolicy: "strong_confirm",
        destructiveKind: "archive",
        implementationStatus: "missing",
        reason:
            "P4.S4 Disposition B: Manage stub only (disabled). No production archive executor, API, or reopen/unarchive path. Not an alias of close_lead or delete_lead. Facade commit remains disabled.",
    }),
    def({
        capabilityKey: "reopen_lead",
        canonicalCommandKey: "reopen_lead",
        operatorLabel: "Reopen Lead",
        family: "status",
        maturity: "unavailable",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "missing",
    }),
    def({
        capabilityKey: "withdraw_child",
        canonicalCommandKey: "withdraw_child",
        operatorLabel: "Withdraw Child",
        family: "enrollment",
        maturity: "unavailable",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity_customer_member"],
        supportsPreview: true,
        confirmationPolicy: "strong_confirm",
        destructiveKind: "withdraw",
        implementationStatus: "missing",
        reason: "Planned intent / catalog stub only. P4.S1: withdraw policy classified; facade commit disabled.",
    }),

    // ── Navigation / assist ────────────────────────────────────────────────
    def({
        capabilityKey: "open_record",
        canonicalCommandKey: "open_record",
        operatorLabel: "Open record",
        family: "navigation",
        maturity: "navigation_only",
        executionOwner: "navigation",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "person", "child", "job"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "production",
    }),
    def({
        capabilityKey: "ask_bos",
        canonicalCommandKey: "ask_bos",
        operatorLabel: "Ask BOS",
        family: "administration",
        maturity: "navigation_only",
        executionOwner: "navigation",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "person", "child"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "production",
        reason: "Opens BOS assist — not a mutation executor.",
    }),

    // ── Communications / documents (adapted / partial) ─────────────────────
    def({
        capabilityKey: "quick_message",
        canonicalCommandKey: "quick_message",
        operatorLabel: "Message",
        family: "communications",
        maturity: "adapted",
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "partial",
        reason: "Naming drift vs platform catalog send_message; not consolidated in P0.",
    }),
    def({
        capabilityKey: "send_message",
        canonicalCommandKey: "send_message",
        operatorLabel: "Message",
        family: "communications",
        maturity: "unavailable",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "missing",
        reason: "Platform catalog key without dedicated executor; operators use quick_message today.",
    }),
    def({
        capabilityKey: "send_form",
        canonicalCommandKey: "send_form",
        operatorLabel: "Send form",
        family: "documents",
        maturity: "adapted",
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "partial",
    }),
    def({
        capabilityKey: "create_work_item",
        canonicalCommandKey: "create_work_item",
        operatorLabel: "Create Work Item",
        family: "workflow",
        maturity: "adapted",
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        compatibilityAliases: ["create_task"],
        implementationStatus: "partial",
        reason:
            "Opens Create Work Item modal. Process Actions / action_definitions may still use create_task as the placement key.",
    }),
    def({
        capabilityKey: "send_enrollment_packet",
        canonicalCommandKey: "send_enrollment_packet",
        operatorLabel: "Send enrollment packet",
        family: "documents",
        maturity: "adapted",
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "partial",
    }),

    // ── Legacy operator forms ──────────────────────────────────────────────
    def({
        capabilityKey: "update_enrollment_status",
        canonicalCommandKey: "update_enrollment_status",
        operatorLabel: "Change Enrollment Status",
        family: "status",
        maturity: "legacy",
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity", "child"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "legacy",
        reason: "Still wired via admin_execute; doctrine prefers domain verbs — preserve path, classify legacy.",
    }),
    def({
        capabilityKey: "update_status_add_note",
        canonicalCommandKey: "update_enrollment_status",
        operatorLabel: "Change Enrollment Status (legacy key)",
        family: "status",
        maturity: "legacy",
        executionOwner: "admin_action",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity", "child"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "legacy",
        reason: "Legacy placement key; settingsConfigurable false.",
    }),
    def({
        capabilityKey: "mark_won",
        canonicalCommandKey: "mark_won",
        operatorLabel: "Mark won / enrolled",
        family: "enrollment",
        maturity: "legacy",
        executionOwner: "admin_action",
        catalogVisibility: "organization_command_catalog",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "confirm",
        implementationStatus: "legacy",
        reason: "Overlaps enroll_child / outcomes; preserve until drain.",
    }),

    // ── Workflow-only representative ───────────────────────────────────────
    def({
        capabilityKey: "workflow.effect",
        canonicalCommandKey: "workflow.effect",
        operatorLabel: "Workflow effect",
        family: "workflow",
        maturity: "workflow_only",
        executionOwner: "workflow",
        catalogVisibility: "hidden",
        supportedSubjects: [],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "production",
        reason: "Representative marker — workflow actions are not organization Commands.",
    }),

    // ── Configuration-maintenance representative ───────────────────────────
    def({
        capabilityKey: "configuration.maintenance",
        canonicalCommandKey: "configuration.maintenance",
        operatorLabel: "Configuration maintenance",
        family: "configuration",
        maturity: "configuration_maintenance",
        executionOwner: "configuration_runtime",
        catalogVisibility: "hidden",
        supportedSubjects: [],
        supportsPreview: false,
        confirmationPolicy: "strong_confirm",
        implementationStatus: "production",
        reason: "Settings CRUD stays outside organization operational Command catalog.",
    }),

    // ── Placeholder pattern examples ───────────────────────────────────────
    def({
        capabilityKey: "send_message_placeholder",
        canonicalCommandKey: "send_message_placeholder",
        operatorLabel: "Message (placeholder)",
        family: "communications",
        maturity: "placeholder",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "missing",
    }),
    def({
        capabilityKey: "send_paperwork_placeholder",
        canonicalCommandKey: "send_paperwork_placeholder",
        operatorLabel: "Send paperwork (placeholder)",
        family: "documents",
        maturity: "placeholder",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "missing",
    }),
    def({
        capabilityKey: "add_to_waitlist_placeholder",
        canonicalCommandKey: "add_to_waitlist_placeholder",
        operatorLabel: "Add to waitlist (placeholder)",
        family: "enrollment",
        maturity: "placeholder",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "missing",
    }),
    def({
        capabilityKey: "convert_to_enrolled_placeholder",
        canonicalCommandKey: "convert_to_enrolled_placeholder",
        operatorLabel: "Convert to enrolled (placeholder)",
        family: "enrollment",
        maturity: "placeholder",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "missing",
    }),

    // Early legacy seeds
    def({
        capabilityKey: "qualify_opportunity",
        canonicalCommandKey: "qualify_opportunity",
        operatorLabel: "Qualify opportunity",
        family: "status",
        maturity: "unavailable",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "missing",
    }),
    def({
        capabilityKey: "start_quote",
        canonicalCommandKey: "start_quote",
        operatorLabel: "Start quote",
        family: "unknown",
        maturity: "unavailable",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "missing",
    }),
    def({
        capabilityKey: "create_inquiry",
        canonicalCommandKey: "create_inquiry",
        operatorLabel: "Create inquiry",
        family: "record_creation",
        maturity: "unavailable",
        executionOwner: "none",
        catalogVisibility: "hidden",
        supportedSubjects: ["opportunity"],
        supportsPreview: false,
        confirmationPolicy: "none",
        implementationStatus: "missing",
    }),
];

/**
 * Relationship capabilities — DERIVED, one per relationship definition.
 *
 * These were hand-authored, so a newly configured relationship had no capability and could never be
 * resolved by the command runtime (the facade gate requires one). `add_billing_contact`, `add_child`,
 * `link_existing_*` and `make_primary_contact` stay hand-authored above: they are not relationship
 * definitions. @see docs/platform/core/data/relationship-model.md
 */
const RELATIONSHIP_DEFINITION_CAPABILITIES: readonly PlatformCapabilityDefinition[] =
    RELATIONSHIP_DEFINITIONS.map((rel) =>
        def({
            capabilityKey: rel.apply_command_key,
            canonicalCommandKey: rel.apply_command_key,
            operatorLabel: rel.command_presentation?.label ?? `Add ${rel.label}`,
            family: "relationships",
            maturity: "adapted",
            executionOwner: "relationship_runtime",
            catalogVisibility: "organization_command_catalog",
            // A relationship anchored on a child is operable from the child and person subjects;
            // household-scoped commands additionally surface on the opportunity.
            supportedSubjects: rel.command_presentation?.allowed_surfaces?.includes("opportunity_drawer")
                ? ["child", "person", "opportunity"]
                : ["child", "person"],
            supportsPreview: false,
            confirmationPolicy: "confirm",
            implementationStatus: "production",
        }),
    );

/** Processing Identity keys — namespaced to avoid colliding with operator `create_lead`. */
const PROCESSING_CAPABILITIES: readonly PlatformCapabilityDefinition[] = ALL_IDENTITY_COMMAND_KEYS.map(
    (identityKey) =>
        def({
            capabilityKey: `processing.${identityKey}`,
            canonicalCommandKey: `processing.${identityKey}`,
            operatorLabel: identityKey,
            family: "processing",
            maturity: "processing_only",
            executionOwner: "processing_identity",
            catalogVisibility: "hidden",
            supportedSubjects: [],
            supportsPreview: false,
            confirmationPolicy: "none",
            implementationStatus: "production",
            reason:
                identityKey === "create_lead"
                    ? "Processing plan key — distinct from operator Command create_lead."
                    : "Processing Identity commit-plan key; not an organization Command.",
        })
);

const ALL_DEFINITIONS: readonly PlatformCapabilityDefinition[] = [
    ...CAPABILITY_DEFINITIONS,
    ...RELATIONSHIP_DEFINITION_CAPABILITIES,
    ...PROCESSING_CAPABILITIES,
];

// ── Index construction + integrity checks (load-time in non-production) ────

const BY_KEY = new Map<string, PlatformCapabilityDefinition>();
const ALIAS_TO_CANONICAL = new Map<string, string>();

function isStrictEnv(): boolean {
    return process.env.NODE_ENV !== "production";
}

function assertRegistryIntegrity(definitions: readonly PlatformCapabilityDefinition[]): void {
    const errors: string[] = [];
    const seenCanonical = new Set<string>();

    for (const entry of definitions) {
        if (BY_KEY.has(entry.capabilityKey)) {
            errors.push(`Duplicate capabilityKey "${entry.capabilityKey}"`);
        }
        BY_KEY.set(entry.capabilityKey, entry);

        if (entry.capabilityKey !== entry.canonicalCommandKey && !BY_KEY.has(entry.canonicalCommandKey)) {
            // Alias-style primary rows (e.g. update_status_add_note → update_enrollment_status) OK
            // if canonical exists elsewhere; checked after pass.
        }

        if (entry.maturity === "placeholder" || entry.maturity === "unavailable") {
            if (entry.catalogVisibility === "organization_command_catalog") {
                errors.push(
                    `Capability "${entry.capabilityKey}" is ${entry.maturity} but catalogVisibility is organization_command_catalog`
                );
            }
            if (entry.maturity === "placeholder" && entry.executionOwner !== "none") {
                errors.push(`Placeholder "${entry.capabilityKey}" must have executionOwner none`);
            }
        }

        if (entry.executionOwner === "registered_action") {
            const regKey = entry.registeredActionKey ?? entry.capabilityKey;
            if (!(REGISTERED_ACTION_CAPABILITY_KEYS as readonly string[]).includes(regKey)) {
                errors.push(
                    `Capability "${entry.capabilityKey}" claims registered_action but "${regKey}" is not in REGISTERED_ACTION_CAPABILITY_KEYS`
                );
            }
            if (entry.maturity !== "executable") {
                errors.push(
                    `Capability "${entry.capabilityKey}" has registered_action owner but maturity ${entry.maturity}`
                );
            }
        }

        if (entry.maturity === "executable" && entry.executionOwner !== "registered_action") {
            errors.push(
                `Capability "${entry.capabilityKey}" maturity executable requires registered_action owner in P0`
            );
        }

        for (const alias of entry.compatibilityAliases ?? []) {
            if (ALIAS_TO_CANONICAL.has(alias)) {
                errors.push(
                    `Duplicate alias "${alias}" → ${ALIAS_TO_CANONICAL.get(alias)} and ${entry.canonicalCommandKey}`
                );
            }
            if (alias === entry.capabilityKey) {
                errors.push(`Alias "${alias}" must not equal capabilityKey`);
            }
            ALIAS_TO_CANONICAL.set(alias, entry.canonicalCommandKey);
        }

        seenCanonical.add(entry.canonicalCommandKey);
    }

    // Alias targets must exist as capability keys (or equal canonical on an entry).
    for (const [alias, canonical] of ALIAS_TO_CANONICAL) {
        if (!BY_KEY.has(canonical) && ![...BY_KEY.values()].some((e) => e.canonicalCommandKey === canonical)) {
            errors.push(`Alias "${alias}" points to missing canonical "${canonical}"`);
        }
        // Cycle: alias maps to key that is itself an alias mapping elsewhere differently
        const hop = ALIAS_TO_CANONICAL.get(canonical);
        if (hop && hop !== canonical) {
            errors.push(`Alias cycle involving "${alias}" → "${canonical}" → "${hop}"`);
        }
        if (ALIAS_TO_CANONICAL.has(alias) && ALIAS_TO_CANONICAL.get(canonical) === alias) {
            errors.push(`Alias cycle between "${alias}" and "${canonical}"`);
        }
    }

    // Every RegisteredAction capability key must have an executable entry.
    for (const actionKey of REGISTERED_ACTION_CAPABILITY_KEYS) {
        const cap = BY_KEY.get(actionKey);
        if (!cap || cap.maturity !== "executable" || cap.executionOwner !== "registered_action") {
            errors.push(`RegisteredAction "${actionKey}" lacks executable registered_action capability`);
        }
    }

    if (errors.length > 0 && isStrictEnv()) {
        throw new Error(`[capabilityRegistry] integrity failures:\n- ${errors.join("\n- ")}`);
    }
    if (errors.length > 0) {
        console.warn(`[capabilityRegistry] ${errors.length} integrity issue(s)`, errors);
    }
}

assertRegistryIntegrity(ALL_DEFINITIONS);

export type PlatformCapabilityResolution =
    | { status: "known"; capability: PlatformCapabilityDefinition }
    | { status: "unknown"; key: string };

function normalizeKey(key: string): string {
    return (key ?? "").trim();
}

/**
 * Resolve a capability by key or compatibility alias.
 * Unknown keys: throws in development/test; returns unknown in production.
 */
export function resolvePlatformCapability(key: string): PlatformCapabilityResolution {
    const k = normalizeKey(key);
    if (!k) {
        if (isStrictEnv()) throw new Error("[capabilityRegistry] Empty capability key");
        return { status: "unknown", key: k };
    }

    const viaAlias = ALIAS_TO_CANONICAL.get(k);
    const lookup = viaAlias ?? k;
    const direct = BY_KEY.get(lookup) ?? BY_KEY.get(k);
    if (direct) return { status: "known", capability: direct };

    // Alias pointed at canonicalCommandKey that lives on another row's capabilityKey
    if (viaAlias) {
        for (const entry of BY_KEY.values()) {
            if (entry.canonicalCommandKey === viaAlias || entry.capabilityKey === viaAlias) {
                return { status: "known", capability: entry };
            }
        }
    }

    if (isStrictEnv()) {
        throw new Error(
            `[capabilityRegistry] Unknown capability key "${k}". ` +
                `Classify it in capabilityRegistry or treat as unavailable config.`
        );
    }
    return { status: "unknown", key: k };
}

/** Safe resolve for production partitioning — never throws. */
export function tryResolvePlatformCapability(key: string): PlatformCapabilityResolution {
    const k = normalizeKey(key);
    if (!k) return { status: "unknown", key: k };
    try {
        // Avoid throw path: duplicate lookup without assert
        const viaAlias = ALIAS_TO_CANONICAL.get(k);
        const lookup = viaAlias ?? k;
        const direct = BY_KEY.get(lookup) ?? BY_KEY.get(k);
        if (direct) return { status: "known", capability: direct };
        if (viaAlias) {
            for (const entry of BY_KEY.values()) {
                if (entry.canonicalCommandKey === viaAlias || entry.capabilityKey === viaAlias) {
                    return { status: "known", capability: entry };
                }
            }
        }
        return { status: "unknown", key: k };
    } catch {
        return { status: "unknown", key: k };
    }
}

export function canonicalCapabilityKeyForAlias(key: string): string | null {
    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status !== "known") return null;
    return resolved.capability.canonicalCommandKey;
}

export function executionOwnerForCapability(key: string): CapabilityExecutionOwner | null {
    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status !== "known") return null;
    return resolved.capability.executionOwner;
}

export function isExecutablePlatformCapability(key: string): boolean {
    const resolved = tryResolvePlatformCapability(key);
    return resolved.status === "known" && resolved.capability.maturity === "executable";
}

/**
 * True when the identity may appear as an organization operational Command
 * (library / future /configuration/commands). Not authorization.
 */
export function isOrganizationCatalogCapability(key: string): boolean {
    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status !== "known") return false;
    const { maturity, catalogVisibility } = resolved.capability;
    if (catalogVisibility !== "organization_command_catalog") return false;
    if (maturity === "placeholder" || maturity === "unavailable") return false;
    if (maturity === "processing_only" || maturity === "workflow_only") return false;
    if (maturity === "configuration_maintenance") return false;
    return true;
}

export function isUnavailableCapability(key: string): boolean {
    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status !== "known") return false;
    const { maturity } = resolved.capability;
    return maturity === "unavailable" || maturity === "placeholder";
}

/** Keys that must not be offered as runnable Commands in Settings add / process pickers. */
export function isNonRunnableCatalogCapability(key: string): boolean {
    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status !== "known") return false;
    const m = resolved.capability.maturity;
    return (
        m === "unavailable" ||
        m === "placeholder" ||
        m === "processing_only" ||
        m === "workflow_only" ||
        m === "configuration_maintenance"
    );
}

export function listPlatformCapabilities(): readonly PlatformCapabilityDefinition[] {
    return [...BY_KEY.values()];
}

export function listPlatformCapabilityKeys(): string[] {
    return [...BY_KEY.keys()].sort();
}

export function getPlatformCapability(key: string): PlatformCapabilityDefinition | null {
    const resolved = tryResolvePlatformCapability(key);
    return resolved.status === "known" ? resolved.capability : null;
}

/** Dev/test: unknown capability fails loudly. */
export function assertKnownPlatformCapability(key: string): PlatformCapabilityDefinition {
    const resolved = resolvePlatformCapability(key);
    if (resolved.status !== "known") {
        throw new Error(`[capabilityRegistry] Unknown capability "${key}"`);
    }
    return resolved.capability;
}

export function catalogVisibilityForCapability(key: string): CapabilityCatalogVisibility | null {
    return getPlatformCapability(key)?.catalogVisibility ?? null;
}

export function maturityForCapability(key: string): CapabilityMaturity | null {
    return getPlatformCapability(key)?.maturity ?? null;
}

/** Processing Identity raw key → namespaced capability key. */
export function processingCapabilityKey(identityKey: string): string {
    return `processing.${identityKey.trim()}`;
}

export function isProcessingIdentityCapabilityKey(key: string): boolean {
    return normalizeKey(key).startsWith("processing.");
}
