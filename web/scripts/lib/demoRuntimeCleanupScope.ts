/**
 * Shared scope + delete-order contract for demo/runtime cleanup scripts.
 * @see docs/governance/demo-runtime-cleanup-schema-audit.md
 */

import {
    DEMO_ONE_FAMILY_GATE_PACKAGE,
    LEGACY_DEMO_SEED_PACKAGES,
    STAGING_DEMO_SEED_SOURCE,
    STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE,
} from "./stagingDemoMarkers";

/** Golden-path one-record seed package. */
export const GOLDEN_PATH_SEED_PACKAGE = "golden_path_enrollment_v1";

export const ALL_DEMO_SEED_PACKAGES = [
    ...LEGACY_DEMO_SEED_PACKAGES,
    DEMO_ONE_FAMILY_GATE_PACKAGE,
    GOLDEN_PATH_SEED_PACKAGE,
    "childcare_one_scenario_v1",
] as const;

export const DEMO_CLEANUP_CONFIRM_VALUE = "DELETE_DEMO_RUNTIME_DATA";

/** Explicit one-time org enrollment/lead queue reset (not default demo-metadata cleanup). */
export const ENROLLMENT_RUNTIME_RESET_MODE = "enrollment_runtime_reset";

/** Explicit orphan communications cleanup — unlinked threads/messages only. */
export const COMMUNICATIONS_ORPHAN_RESET_MODE = "communications_orphan_reset";

/** Status keys for enrollment New Leads / lifecycle lead lane visibility. */
export const ENROLLMENT_LEAD_STATUS_KEYS = ["new_inquiry", "needs_qualification", "open"] as const;

export type DemoCleanupMode = "default" | typeof ENROLLMENT_RUNTIME_RESET_MODE | typeof COMMUNICATIONS_ORPHAN_RESET_MODE;

/** Output key for demo-tagged locations — visibility only, never deleted. */
export const PROTECTED_LOCATIONS_TABLE_KEY = "protected_locations_not_deleted";

export type DemoCleanupScope = {
    orgId: string;
    cleanupMode: DemoCleanupMode;
    /** When set, only rows with this metadata.demo_seed_package. */
    demoSeedPackage: string | null;
    /** When set, only rows with this metadata.demo_seed_run_id. */
    demoSeedRunId: string | null;
    /** When set, only rows with this metadata.demo_seed_family_key. */
    demoSeedFamilyKey: string | null;
};

export type ResolvedDemoIds = {
    opportunityIds: string[];
    customerIds: string[];
    personIds: string[];
    customerMemberIds: string[];
    jobIds: string[];
    scheduleIds: string[];
    threadIds: string[];
    formSubmissionIds: string[];
    documentIds: string[];
    /** enrollment_runtime_reset only — persons preserved because they are linked to non-target records. */
    sharedPersonIds: string[];
    /** enrollment_runtime_reset only — customers preserved because they are linked to non-target records. */
    sharedCustomerIds: string[];
};

/** PostgREST `.or()` filter for metadata-tagged demo rows. */
export function demoMetadataOrFilter(scope: DemoCleanupScope): string {
    if (scope.demoSeedRunId) {
        return `metadata->>demo_seed_run_id.eq.${scope.demoSeedRunId}`;
    }
    if (scope.demoSeedFamilyKey) {
        return `metadata->>demo_seed_family_key.eq.${scope.demoSeedFamilyKey}`;
    }
    if (scope.demoSeedPackage) {
        return `metadata->>demo_seed_package.eq.${scope.demoSeedPackage}`;
    }

    const pkgOrs = ALL_DEMO_SEED_PACKAGES.map((p) => `metadata->>demo_seed_package.eq.${p}`).join(",");
    return [
        "metadata->>is_demo_data.eq.true",
        pkgOrs,
        `metadata->>seed_source.eq.${STAGING_DEMO_SEED_SOURCE}`,
        `metadata->>demo_seed.eq.${STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE}`,
        "metadata->>seed_key.like.childcare_realistic%",
        "metadata->>seed_key.like.enroll_demo%",
        "metadata->>seed_key.like.golden_path%",
        "metadata->>seed_key.like.dept_seed%",
        "metadata->>demo_seed.like.childcare_one_scenario%",
    ].join(",");
}

/** Tables reported in dry-run / execute output (FK-safe order). */
export const DEMO_CLEANUP_TABLE_ORDER = [
    "communication_message_reads",
    "communication_messages",
    "communication_scheduled_sends",
    "communication_threads",
    "task_assist_proposals",
    "operational_tasks",
    "placement_overrides",
    "placement_link_group_members",
    "placement_link_groups",
    "placement_candidates",
    "tour_public_booking_links",
    "tour_bookings",
    "opportunity_tags",
    "opportunity_persons",
    "opportunity_customer_members",
    "quotes",
    "discount_redemptions",
    "discount_applications",
    "messages",
    "workflow_action_runs",
    "messages_outbox",
    "workflow_runs",
    "workflow_events",
    "action_links",
    "schedule_tags",
    "payments",
    "assignments",
    "schedules",
    "jobs",
    "form_packet_session_items",
    "form_packet_sessions",
    "form_submission_signatures",
    "form_submission_documents",
    "form_submissions",
    "document_field_values",
    "document_versions",
    "documents",
    "field_values",
    "opportunities",
    "customer_member_contacts",
    "customer_tags",
    "customer_subscriptions",
    "customer_payment_methods",
    "customer_members",
    "customer_persons",
    "contacts",
    "person_locations",
    "person_relationships",
    "customers",
    "persons",
    "work_units",
    "departments",
    PROTECTED_LOCATIONS_TABLE_KEY,
] as const;

export type DemoCleanupTable = (typeof DEMO_CLEANUP_TABLE_ORDER)[number];

/** FK-safe delete order for communications_orphan_reset (comms tables only). */
export const COMMUNICATIONS_ORPHAN_CLEANUP_TABLE_ORDER = [
    "communication_message_reads",
    "communication_messages",
    "communication_scheduled_sends",
    "messages_outbox",
    "communication_threads",
] as const;

export type CommunicationsOrphanCleanupTable = (typeof COMMUNICATIONS_ORPHAN_CLEANUP_TABLE_ORDER)[number];

const EXPLICIT_CLEANUP_MODES = new Set<DemoCleanupMode>([
    ENROLLMENT_RUNTIME_RESET_MODE,
    COMMUNICATIONS_ORPHAN_RESET_MODE,
]);

export function isExplicitCleanupMode(mode: DemoCleanupMode): boolean {
    return EXPLICIT_CLEANUP_MODES.has(mode);
}

export function isGoldenPathProtectedMetadata(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const m = metadata as Record<string, unknown>;
    if (m.demo_seed_package === GOLDEN_PATH_SEED_PACKAGE) return true;
    const seedKey = typeof m.seed_key === "string" ? m.seed_key.trim() : "";
    return seedKey.startsWith("golden_path");
}

export function parseDemoCleanupModeFromEnv(): DemoCleanupMode {
    const mode = process.env.DEMO_CLEANUP_MODE?.trim();
    if (mode === ENROLLMENT_RUNTIME_RESET_MODE) return ENROLLMENT_RUNTIME_RESET_MODE;
    if (mode === COMMUNICATIONS_ORPHAN_RESET_MODE) return COMMUNICATIONS_ORPHAN_RESET_MODE;
    return "default";
}

export function parseDemoCleanupScopeFromEnv(): DemoCleanupScope {
    const orgId = process.env.DEMO_RESET_ORG_ID?.trim() || process.env.DEMO_SEED_ORG_ID?.trim();
    if (!orgId) {
        throw new Error("Missing DEMO_RESET_ORG_ID (or DEMO_SEED_ORG_ID)");
    }
    const cleanupMode = parseDemoCleanupModeFromEnv();
    if (isExplicitCleanupMode(cleanupMode)) {
        if (process.env.DEMO_SEED_PACKAGE?.trim() || process.env.DEMO_SEED_RUN_ID?.trim() || process.env.DEMO_SEED_FAMILY_KEY?.trim()) {
            throw new Error(
                `DEMO_CLEANUP_MODE=${cleanupMode} cannot be combined with DEMO_SEED_PACKAGE / DEMO_SEED_RUN_ID / DEMO_SEED_FAMILY_KEY`
            );
        }
    }
    return {
        orgId,
        cleanupMode,
        demoSeedPackage: process.env.DEMO_SEED_PACKAGE?.trim() || null,
        demoSeedRunId: process.env.DEMO_SEED_RUN_ID?.trim() || null,
        demoSeedFamilyKey: process.env.DEMO_SEED_FAMILY_KEY?.trim() || null,
    };
}

export function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
