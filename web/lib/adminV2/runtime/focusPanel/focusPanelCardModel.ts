/**
 * Universal Card presentation model — business question first, not layout sections.
 * @see docs/platform/operator/operational-surface-design-system.md (System 5)
 * @see docs/platform/operator/universal-card-archetypes.md (System 5A)
 * @see docs/sprints/06_2026/alloy_os_system_4_universal_card_system.md
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

/** Platform-owned card blueprint keys (not layout section keys). */
export const FOCUS_PANEL_CARD_KEYS = [
    "attention",
    "current_mission",
    "current_work",
    "required_information",
    "readiness_kpi",
    "health",
    "tour_summary",
    "household",
    "children",
    "communications",
    "documents",
    "work_launcher",
    "workflow_steps",
    "tasks",
    "automations",
    "primary_next_action",
    "timeline",
    "notes",
    "audit",
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

export type FocusPanelCardGridSpec = {
    rows: { cells: Pick<FocusPanelCardModel, "key" | "span" | "density" | "tier">[] }[];
};
