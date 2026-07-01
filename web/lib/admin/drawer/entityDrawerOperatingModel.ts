/**
 * Drawer Operating Model v1 — platform shell contract types.
 *
 * Documents ownership boundaries for the shared entity drawer shell.
 * See docs/system/drawer-operating-model-v1.md
 */

import type { DrawerTabKey } from "@/lib/entityPresentation";
import { OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP } from "@/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs";

/** Platform-owned shell slots — layouts MUST NOT own these. */
export type EntityDrawerShellSlot =
    | "frame"
    | "header"
    | "lifecycle_rail_container"
    | "summary_strip_container"
    | "tabs_container"
    | "bos"
    | "actions"
    | "status"
    | "close"
    | "relationship_navigation"
    | "performance_reveal";

/** Layout-owned regions — configured via /settings/layouts. */
export type EntityDrawerLayoutSlot =
    | "overview_cards"
    | "widgets"
    | "field_placement"
    | "related_record_tables"
    | "labels"
    | "ordering"
    | "visibility"
    | "tab_contents";

export type EntityDrawerOperatingEntity =
    | "opportunity"
    | "person"
    | "child"
    | "enrollment"
    | "contract"
    | "waitlist"
    | "room"
    | "program";

/** AdminV2 entity drawer left-accent colors — platform-owned. */
export const ENTITY_DRAWER_ACCENT_COLORS: Readonly<Record<EntityDrawerOperatingEntity, string>> = {
    opportunity: "#2d6a9f",
    person: "#0d9488",
    child: "#2563eb",
    enrollment: "#2d6a9f",
    contract: "#6366f1",
    waitlist: "#7c3aed",
    room: "#64748b",
    program: "#64748b",
};

export function entityDrawerAccentColor(entity: EntityDrawerOperatingEntity): string {
    return ENTITY_DRAWER_ACCENT_COLORS[entity];
}

/** Process entities show lifecycle rail by default (§5 drawer-operating-model-v1). */
const PROCESS_ENTITIES_DEFAULT_LIFECYCLE: ReadonlySet<EntityDrawerOperatingEntity> = new Set([
    "opportunity",
    "enrollment",
    "contract",
    "waitlist",
]);

export function shouldShowLifecycleRailByDefault(entity: EntityDrawerOperatingEntity): boolean {
    return PROCESS_ENTITIES_DEFAULT_LIFECYCLE.has(entity);
}

/** Default tab strips — layout may override visibility/content; platform owns container. */
export const OPPORTUNITY_DRAWER_DEFAULT_TABS: readonly DrawerTabKey[] = OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP;

export const PERSON_DRAWER_DEFAULT_TABS: readonly DrawerTabKey[] = [
    "overview",
    "related",
    "documents",
    "communications",
];

export const CHILD_DRAWER_DEFAULT_TABS: readonly DrawerTabKey[] = PERSON_DRAWER_DEFAULT_TABS;

/** Coordinated first-reveal gates — all must pass before shell mounts visible. */
export type EntityDrawerRevealGate =
    | "header_ready"
    | "lifecycle_ready_if_applicable"
    | "summary_strip_ready"
    | "initial_tab_ready"
    | "actions_ready"
    | "status_ready";

export const ENTITY_DRAWER_FIRST_REVEAL_GATES: readonly EntityDrawerRevealGate[] = [
    "header_ready",
    "lifecycle_ready_if_applicable",
    "summary_strip_ready",
    "initial_tab_ready",
    "actions_ready",
    "status_ready",
];
