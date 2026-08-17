/**
 * Universal Card presentation model — business question first, not layout sections.
 * @see docs/platform/operator/operational-surface-design-system.md (System 5)
 * @see docs/platform/operator/universal-universal-card-archetypes.md (System 5A)
 * @see docs/sprints/archive/06_2026/alloy_os_system_4_universal_card_system.md
 */

import type { FocusPanelCardDensity, FocusPanelCardSpan } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";

export const FOCUS_PANEL_CARD_TIERS = [
    "attention",
    "work",
    "context",
    "reference",
    "historical",
    "metric",
] as const;

export type FocusPanelCardTier = (typeof FOCUS_PANEL_CARD_TIERS)[number];

/** System 5 card role — maps tier to presentation vocabulary. */
export type FocusPanelCardRole =
    | "critical"
    | "active-work"
    | "metric"
    | "context"
    | "history"
    | "reference";

/** System 5A card archetype — purpose-specific composition within shared design language. */
export const FOCUS_PANEL_CARD_ARCHETYPES = [
    "action",
    "status",
    "summary",
    "profile",
    "collection",
    "metric",
    "timeline",
    "launcher",
] as const;

export type FocusPanelCardArchetype = (typeof FOCUS_PANEL_CARD_ARCHETYPES)[number];

export type FocusPanelProfileField = {
    label: string;
    value: string | null;
    /**
     * Another RECORD this field names, when it names one — which makes the row an operator gesture
     * instead of a printed string.
     *
     * "Household — Kurzman Family" on a child's identity card is a reference to a record that
     * exists, and an operator reading it wants to go there. Without this the only route to the
     * family is to search for it by name, retyping something the surface is already showing.
     *
     * `subject_type` is deliberately a plain string, matching `OperationalSubjectRef.type`: the
     * platform contract stays open so a producer can name a grain without a platform-layer edit, and
     * the renderer narrows it through `durableSubjectTypeFor` — an unrecognised grain renders as
     * plain text rather than as a control that goes nowhere.
     */
    record?: { subject_type: string; subject_id: string } | null;
};

export type FocusPanelCollectionItem = {
    label: string;
    status?: string | null;
};

export type FocusPanelTimelineEvent = {
    when: string;
    label: string;
};

export type FocusPanelLauncherRow = {
    key: string;
    label: string;
    description: string;
    actionLabel: string;
};

export type FocusPanelCardPayload = {
    profileFields?: FocusPanelProfileField[];
    collectionItems?: FocusPanelCollectionItem[];
    overflowCount?: number;
    statusIssues?: string[];
    timelineEvents?: FocusPanelTimelineEvent[];
    launcherRows?: FocusPanelLauncherRow[];
};

/**
 * Platform-owned card blueprint keys (not layout section keys).
 *
 * ONE vocabulary for every surface. Which subject a card can compose for is a DECLARATION on the
 * registry (`CardGrainApplicability`), not a property of this list and no longer a property of the
 * `@grain` comments below — those record each key's origin, and the registry is the authority a
 * composer actually reads. An undeclared card is case-only.
 *
 * @see lib/adminV2/runtime/focusPanel/focusPanelCardGrainConcern.ts
 * @see docs/platform/operator/operational-grain-doctrine.md §5
 */
export const FOCUS_PANEL_CARD_KEYS = [
    /** @grain case — family attention flags */
    "attention",
    /** @grain case — current lifecycle mission label */
    "current_mission",
    /** @grain case — open work items for this family */
    "current_work",
    /** @grain case — required information checklist */
    "required_information",
    /** @grain case — enrollment readiness KPI */
    "readiness_kpi",
    /** @grain case — case health signal */
    "health",
    /** @grain case — tour booking status + actions */
    "tour_summary",
    /** @grain case — household identity + contact fields (fully editable) */
    "household",
    /** @grain case — children roster (read-only; child facts are case-grain display) */
    "children",
    /**
     * @grain case — employment held by the case's linked contacts (read-only).
     *
     * Person-owned truth displayed at case grain for the same reason `children` is: a person
     * has no host Work Unit of its own, so the case panel is the only surface that composes
     * for them. Employment facts are never authored here.
     */
    "employment",
    /** @grain case — meaningful completed/committed outcomes (not Activity history) */
    "milestones",
    /** @grain case — per-child scheduling state (room · weekly pattern · dates); Create/Change via configured command */
    "scheduling",
    /** @grain case — outreach / scheduled sends status (action-only) */
    "communications",
    /** @grain case — uploaded documents */
    "documents",
    /**
     * @grain child — the durable child's own identity (name · date of birth · age · household).
     *
     * The FIRST child-grain card. Deliberately NOT the `children` card, which is a case-grain
     * ROSTER of a family's children and answers a different question. Everything here comes from
     * the `customer_members` row, which is the canonical child identity — `person_id` on it is
     * NULLABLE, so a child can exist with no `persons` row at all and must still be identifiable.
     *
     * Enrollment-scoped facts (program, room, schedule, start date) are deliberately absent: they
     * require an enrollment, and a durable child record must open without one.
     */
    "child_identity",
    /** @grain case — available workflow actions launcher */
    "work_launcher",
    /** @grain case — lifecycle workflow steps rail */
    "workflow_steps",
    /** @grain case — open tasks */
    "tasks",
    /** @grain case — configured automations */
    "automations",
    /** @grain case — primary recommended next action */
    "primary_next_action",
    /** @grain case — event timeline (read-only append-only) */
    "timeline",
    /** @grain case — billing configuration preview (deferred; read-only until assignment route exists) */
    "billing_preview",
    /** @grain case — notes */
    "notes",
    /** @grain case — audit trail */
    "audit",
    /** @grain case — workflow completion history */
    "workflow_history",
] as const;

export type FocusPanelCardKey = (typeof FOCUS_PANEL_CARD_KEYS)[number];

export type FocusPanelCardAction = {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: "primary" | "secondary";
};

export type FocusPanelCardModel = {
    key: FocusPanelCardKey;
    /** System 5A archetype — platform-owned composition primitive. */
    archetype: FocusPanelCardArchetype;
    /** Operator-facing card title — the business question category (1–3 words). */
    title: string;
    /** Meaning-first answer line (required for scan). */
    insight: string;
    tier: FocusPanelCardTier;
    span: FocusPanelCardSpan;
    density: FocusPanelCardDensity;
    statusChip?: string | null;
    statusTone?: "ready" | "blocked" | "at-risk" | "due" | "done" | "neutral";
    primaryAction?: FocusPanelCardAction | null;
    secondaryInsight?: string | null;
    iconName?: string | null;
    /** Archetype-specific structured body (profile rows, collection items, etc.). */
    payload?: FocusPanelCardPayload;
    /** When false, card is omitted from the grid. */
    visible: boolean;
};

/**
 * One placed card in the grid. `key` is the platform-owned card TYPE (drives the
 * model + renderer). `instanceKey` is the stable per-placement id (defaults to the
 * type) so the same type can be duplicated without colliding React keys.
 */
export type FocusPanelCardGridCell = Pick<FocusPanelCardModel, "key" | "span" | "density" | "tier"> & {
    instanceKey?: string;
};

export type FocusPanelCardGridSpec = {
    rows: { cells: FocusPanelCardGridCell[] }[];
};
