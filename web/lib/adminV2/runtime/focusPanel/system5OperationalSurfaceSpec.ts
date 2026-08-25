/**
 * System 5 — Operational Surface Design System (platform tokens).
 * @see docs/platform/operator/operational-surface-design-system.md
 */

import type { FocusPanelCardKey, FocusPanelCardRole, FocusPanelCardTier } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardSpan } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";

/**
 * Card footprint — the *default width intent* of an archetype on the Overview
 * grid. Composition no longer assumes every card is the same width.
 *
 * Vocabulary (design intent):
 *   narrow  — a single answer / metric (Current Work, Tour)
 *   medium  — a small assessment with supporting evidence (Readiness, Billing)
 *   wide    — identity / collection that needs two columns (Household, Children, Communications)
 *   full    — spans the whole row (Timeline, Activity)
 *
 * PROTOTYPE NOTE: the active responsive grid only expresses three integer
 * widths (`1`, `2`, `"row"`). `narrow` and `medium` therefore both resolve to a
 * single column today. A future finer column base (a 6-unit grid) would let
 * `medium` sit visually between `narrow` and `wide`. See
 * docs/sprints/archive/06_2026/focus-panel-composition-review for the full recommendation.
 */
export type FocusPanelCardFootprint = "narrow" | "medium" | "wide" | "full";

export const SYSTEM5_CARD_FOOTPRINT: Partial<Record<FocusPanelCardKey, FocusPanelCardFootprint>> = {
    household: "wide",
    children: "wide",
    employment: "wide",
    scheduling: "wide",
    current_work: "narrow",
    business_process: "narrow",
    readiness_kpi: "medium",
    tour_summary: "narrow",
    communications: "wide",
    documents: "wide",
    timeline: "full",
    attention: "narrow",
    current_mission: "medium",
    health: "medium",
    billing_preview: "medium",
};

export const SYSTEM5_DEFAULT_FOOTPRINT: FocusPanelCardFootprint = "medium";

/** Default footprint for an archetype card (Experience Builder may override later). */
export function system5FootprintForCard(key: FocusPanelCardKey): FocusPanelCardFootprint {
    return SYSTEM5_CARD_FOOTPRINT[key] ?? SYSTEM5_DEFAULT_FOOTPRINT;
}

/**
 * Map a footprint to the current grid span vocabulary.
 * `narrow`/`medium` collapse to a single column until the finer column base lands.
 */
export function footprintToGridSpan(footprint: FocusPanelCardFootprint): FocusPanelCardSpan {
    switch (footprint) {
        case "full":
            return "row";
        case "wide":
            return 2;
        case "medium":
        case "narrow":
        default:
            return 1;
    }
}

/** Lucide icon names — resolved in UniversalCardIcon (every key must resolve). */
export const SYSTEM5_CARD_ICON: Record<FocusPanelCardKey, string> = {
    attention: "AlertCircle",
    current_mission: "Target",
    current_work: "Briefcase",
    // The journey rail is the card's spine, so it takes the branch glyph, not the briefcase.
    business_process: "GitBranch",
    required_information: "ClipboardList",
    readiness_kpi: "ShieldCheck",
    health: "HeartPulse",
    tour_summary: "Calendar",
    household: "Home",
    children: "Baby",
    // The durable child's own identity. Same glyph family as `children` on purpose — same subject
    // matter, different question (this child, vs this family's children).
    child_identity: "Baby",
    employment: "Users",
    milestones: "Flag",
    scheduling: "CalendarDays",
    communications: "MessageSquare",
    documents: "FileText",
    work_launcher: "Rocket",
    workflow_steps: "GitBranch",
    tasks: "CheckSquare",
    automations: "Zap",
    primary_next_action: "ArrowRight",
    timeline: "Clock",
    billing_preview: "Receipt",
    notes: "StickyNote",
    audit: "ScrollText",
    workflow_history: "History",
};

export const SYSTEM5_TIER_TO_ROLE: Record<FocusPanelCardTier, FocusPanelCardRole> = {
    attention: "critical",
    work: "active-work",
    metric: "metric",
    context: "context",
    reference: "reference",
    historical: "history",
};

/** Default summary-mode card actions when no handler-specific label exists. */
export const SYSTEM5_DEFAULT_CARD_ACTIONS: Partial<
    Record<FocusPanelCardKey, { label: string; variant: "primary" | "secondary" }>
> = {
    attention: { label: "View details →", variant: "secondary" },
    current_mission: { label: "View mission →", variant: "secondary" },
    current_work: { label: "Open work →", variant: "primary" },
    health: { label: "View health →", variant: "secondary" },
    readiness_kpi: { label: "Resolve →", variant: "primary" },
    tour_summary: { label: "Schedule tour →", variant: "primary" },
    household: { label: "View household →", variant: "secondary" },
    children: { label: "View children →", variant: "secondary" },
    scheduling: { label: "Create schedule →", variant: "primary" },
    communications: { label: "View communications →", variant: "secondary" },
    documents: { label: "View documents →", variant: "secondary" },
};

export function system5IconForCard(key: FocusPanelCardKey): string {
    return SYSTEM5_CARD_ICON[key] ?? "LayoutGrid";
}

export function system5DefaultActionForCard(
    key: FocusPanelCardKey,
): { label: string; variant: "primary" | "secondary" } | null {
    return SYSTEM5_DEFAULT_CARD_ACTIONS[key] ?? null;
}
