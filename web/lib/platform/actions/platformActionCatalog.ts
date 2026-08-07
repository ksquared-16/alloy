/**
 * Platform Action Catalog — canonical operator-facing actions.
 *
 * Each entry maps a semantic operator intent (e.g. "waitlist_child") to its
 * execution path, subject grain, and default presentation metadata.
 *
 * This is the operator vocabulary layer. The Mutation Runtime handles execution.
 * Configuration controls which actions are recommended for a stage.
 *
 * Doctrine: docs/platform/modules/business-process-execution-platform.md
 */

export type PlatformActionGrain =
    | "opportunity"               // Lead / case grain
    | "opportunity_customer_member"; // Child enrollment grain

export type PlatformActionCategory =
    | "status_lifecycle"
    | "workflow"
    | "communication"
    | "record";

export type PlatformActionEntry = {
    /** Unique action key — matches action_definitions.key in DB. */
    key: string;
    /** Default operator-facing label. Overridable via stage action_catalog_v1. */
    defaultLabel: string;
    /** Entity grain this action operates on. */
    grain: PlatformActionGrain;
    category: PlatformActionCategory;
    /**
     * Mutation Runtime command key this action routes through.
     * Null for UI-only or workflow actions.
     */
    runtimeCommandKey: string | null;
    /** Whether this action supports multi-subject invocation. */
    supportsMultiSubject: boolean;
    confirmationPolicy: "required" | "none" | "destructive";
};

const CATALOG: readonly PlatformActionEntry[] = [
    // ─── Lead / case grain ───────────────────────────────────────────────────
    // INTERNAL / RUNTIME-ONLY: `update_lead_status` and `update_child_enrollment_status`
    // are the generic status-mutation commands that domain verbs (close_lead, waitlist_child,
    // enroll_child) and outcome execution route through. They are retained here so the runtime
    // can resolve label/grain (see stageActionEvaluator.getPlatformAction) — but they are NOT
    // operator-selectable. The Lifecycle/Process action editors expose the domain verbs instead
    // (see lib/lifecycle/lifecycleStageBaseActions.ts).
    {
        key: "update_lead_status",
        defaultLabel: "Update Lead Status",
        grain: "opportunity",
        category: "status_lifecycle",
        runtimeCommandKey: "update_lead_status",
        supportsMultiSubject: false,
        confirmationPolicy: "required",
    },
    {
        key: "close_lead",
        defaultLabel: "Close Lead",
        grain: "opportunity",
        category: "status_lifecycle",
        runtimeCommandKey: "close_lead",
        supportsMultiSubject: false,
        confirmationPolicy: "required",
    },
    {
        key: "schedule_tour",
        defaultLabel: "Schedule Tour",
        grain: "opportunity",
        category: "workflow",
        runtimeCommandKey: null,
        supportsMultiSubject: false,
        confirmationPolicy: "required",
    },
    {
        key: "send_tour_invitation",
        defaultLabel: "Send Tour Invitation",
        grain: "opportunity",
        category: "communication",
        runtimeCommandKey: null,
        supportsMultiSubject: false,
        confirmationPolicy: "required",
    },
    // ─── Child enrollment grain ───────────────────────────────────────────────
    {
        key: "update_child_enrollment_status",
        defaultLabel: "Update Child Enrollment Status",
        grain: "opportunity_customer_member",
        category: "status_lifecycle",
        runtimeCommandKey: "update_child_enrollment_status",
        supportsMultiSubject: false,
        confirmationPolicy: "required",
    },
    {
        key: "waitlist_child",
        defaultLabel: "Waitlist Child",
        grain: "opportunity_customer_member",
        category: "status_lifecycle",
        runtimeCommandKey: "waitlist_child",
        supportsMultiSubject: false,
        confirmationPolicy: "required",
    },
    {
        key: "enroll_child",
        defaultLabel: "Enroll Child",
        grain: "opportunity_customer_member",
        category: "status_lifecycle",
        runtimeCommandKey: "enroll_child",
        supportsMultiSubject: false,
        confirmationPolicy: "required",
    },
    // ─── Cross-grain utilities ────────────────────────────────────────────────
    {
        key: "send_message",
        defaultLabel: "Message",
        grain: "opportunity",
        category: "communication",
        runtimeCommandKey: null,
        supportsMultiSubject: false,
        confirmationPolicy: "none",
    },
    {
        key: "create_task",
        defaultLabel: "Create Work Item",
        grain: "opportunity",
        category: "workflow",
        runtimeCommandKey: "create_work_item",
        supportsMultiSubject: false,
        confirmationPolicy: "none",
    },
    {
        key: "send_form",
        defaultLabel: "Send Form",
        grain: "opportunity",
        category: "workflow",
        runtimeCommandKey: null,
        supportsMultiSubject: false,
        confirmationPolicy: "required",
    },
];

const CATALOG_BY_KEY = new Map(CATALOG.map((a) => [a.key, a]));

export function getPlatformAction(key: string): PlatformActionEntry | null {
    return CATALOG_BY_KEY.get(key) ?? null;
}

export function listPlatformActions(
    filter?: Partial<Pick<PlatformActionEntry, "grain" | "category">>
): PlatformActionEntry[] {
    if (!filter) return [...CATALOG];
    return CATALOG.filter((a) => {
        if (filter.grain && a.grain !== filter.grain) return false;
        if (filter.category && a.category !== filter.category) return false;
        return true;
    });
}

export function isPlatformActionKey(key: string): boolean {
    return CATALOG_BY_KEY.has(key);
}
