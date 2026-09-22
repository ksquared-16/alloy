/**
 * System 5A — Universal Card Archetype registry.
 * @see docs/platform/operator/universal-card-archetypes.md
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
    // A collection, not a profile: the answer is a LIST whose length varies — the qualifications
    // held and the requirements that apply. A profile archetype would present a fixed set of
    // labelled fields, which is the wrong shape for a list that is often empty and sometimes long.
    staff_qualifications: "collection",
    // A list whose length varies — the weekdays worked, and the exceptions on the
    // books. A profile archetype would promise a fixed set of labelled fields.
    staff_availability: "collection",
    // The same archetype as the case-grain readiness answer, so the two look alike.
    staff_readiness: "status",
    staff_compensation: "status",
    attendance: "timeline",
    financials: "summary",
    health_safety: "status",
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
