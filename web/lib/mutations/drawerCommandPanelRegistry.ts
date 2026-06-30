/**
 * Drawer Mutation Command Panel Registry.
 *
 * Maps command keys to the React component that renders the command surface
 * inside the opportunity Focus Panel (AdminEntityDrawerLegacy).
 *
 * To add a new lead-grain or opportunity-grain mutation command panel:
 *   1. Import its component
 *   2. Add an entry to DRAWER_COMMAND_PANELS below
 *   3. The drawer will render it automatically when that commandKey is active
 *
 * Note: child/OCM-grain mutation panels (e.g. update_child_enrollment_status)
 * are rendered inside OpportunityInquiryChildrenSection, not here, because they
 * require per-row OCM subject context that the drawer's top-level action state
 * does not carry. See CHILD_ROW_MUTATION_PANEL_REGISTRY for that boundary.
 *
 * Doctrine: docs/platform/modules/operational-mutation-platform.md
 */

import type React from "react";
import { UpdateLeadStatusPanel, type UpdateLeadStatusPanelProps } from "@/components/mutations/UpdateLeadStatusPanel";
import { UPDATE_LEAD_STATUS_COMMAND_KEY } from "@/lib/mutations/domains/leadStatus";

/** Props passed to every drawer-level mutation command panel. */
export type DrawerMutationPanelContext = UpdateLeadStatusPanelProps;

/** Render function type: receives context, returns JSX or null. */
type PanelRenderer = (ctx: DrawerMutationPanelContext) => React.ReactElement | null;

/**
 * Registry of drawer-level mutation command panels.
 * Key = command_key from action_definitions / DecisionIntent.
 */
export const DRAWER_COMMAND_PANELS: Record<string, PanelRenderer> = {
    [UPDATE_LEAD_STATUS_COMMAND_KEY]: (ctx) => React.createElement(UpdateLeadStatusPanel, ctx),
};

/**
 * Returns the panel renderer for a given command key, or null if none is registered.
 * The drawer calls this to decide whether/what to render.
 */
export function getDrawerCommandPanelRenderer(commandKey: string): PanelRenderer | null {
    return DRAWER_COMMAND_PANELS[commandKey] ?? null;
}
