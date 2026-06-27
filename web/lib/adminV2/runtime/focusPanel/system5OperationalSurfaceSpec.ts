/**
 * System 5 — Operational Surface Design System (platform tokens).
 * @see docs/platform/operator/operational-surface-design-system.md
 */

import type { FocusPanelCardKey, FocusPanelCardRole, FocusPanelCardTier } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/** Lucide icon names — resolved in UniversalCardIcon. */
export const SYSTEM5_CARD_ICON: Partial<Record<FocusPanelCardKey, string>> = {
    attention: "AlertCircle",
    current_mission: "Target",
    current_work: "Briefcase",
    required_information: "ClipboardList",
    readiness_kpi: "ShieldCheck",
    health: "HeartPulse",
    tour_summary: "Calendar",
    household: "Home",
    children: "Baby",
    communications: "MessageSquare",
    documents: "FileText",
    work_launcher: "Rocket",
    workflow_steps: "GitBranch",
    tasks: "CheckSquare",
    automations: "Zap",
    primary_next_action: "ArrowRight",
    timeline: "Clock",
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
    communications: { label: "View communications →", variant: "secondary" },
    documents: { label: "View documents →", variant: "secondary" },
};

export function system5IconForCard(key: FocusPanelCardKey): string | null {
    return SYSTEM5_CARD_ICON[key] ?? null;
}

export function system5DefaultActionForCard(
    key: FocusPanelCardKey,
): { label: string; variant: "primary" | "secondary" } | null {
    return SYSTEM5_DEFAULT_CARD_ACTIONS[key] ?? null;
}
