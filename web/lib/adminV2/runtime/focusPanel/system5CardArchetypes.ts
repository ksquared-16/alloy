/**
 * System 5A — Universal Card Archetype registry.
 * @see docs/platform/operator/universal-universal-card-archetypes.md
 */

import type { FocusPanelCardArchetype, FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/** Platform-owned default archetype per Focus Panel card key. */
export const SYSTEM5_CARD_ARCHETYPE: Record<FocusPanelCardKey, FocusPanelCardArchetype> = {
    attention: "action",
    current_mission: "action",
    current_work: "action",
    business_process: "action",
    required_information: "action",
    primary_next_action: "action",
    readiness_kpi: "status",
    health: "status",
    tour_summary: "summary",
    communications: "summary",
    documents: "summary",
    workflow_steps: "summary",
    automations: "summary",
    notes: "summary",
    audit: "summary",
    workflow_history: "summary",
    household: "profile",
    children: "collection",
    employment: "profile",
    staff: "profile",
    milestones: "summary",
    scheduling: "collection",
    tasks: "collection",
    work_launcher: "launcher",
    timeline: "timeline",
    billing_preview: "status",
    // Durable child identity — a profile of durable facts, the same archetype `household` uses.
    child_identity: "profile",
};

export function system5ArchetypeForCard(key: FocusPanelCardKey): FocusPanelCardArchetype {
    return SYSTEM5_CARD_ARCHETYPE[key];
}

/** Cards that suppress footer CTA by archetype law. */
export function system5ArchetypeSuppressesFooterAction(archetype: FocusPanelCardArchetype): boolean {
    return archetype === "timeline" || archetype === "launcher";
}
