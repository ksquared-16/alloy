/**
 * ONE COMMAND, MANY PLACEMENTS — carrying a record-header (Manage) action into the Current Work
 * command workspace.
 *
 * E2E-03. Manage → Add Child opened the legacy 4-step relationship wizard ("Link existing | Create
 * new" → role → scope → confirm) in the drawer action-modal host, and submitted through a different
 * writer, while the process card's Add Child opened the capture-first form in the Current Work
 * workspace. Same action key, two experiences, two writers — chosen by which button was pressed.
 *
 * The registry had already decided which experience is the operator's: `add_child` declares
 * `interactionHost: "inline_form"` ("capture-first create form — not the Link existing | Create new
 * wizard"). The Manage path never read that declaration and fell through to `relationship_execute`.
 * This module is the Manage path reading it.
 *
 * The rule is metadata, never an action name: a RELATIONSHIP capability whose declared interaction
 * host is `inline_form` is hosted by the Current Work workspace from every placement. Scheduling
 * capabilities also declare `inline_form`, and are deliberately NOT covered — Schedule Tour's host
 * convergence is separate work (E2E-09), not a side effect of this rule.
 *
 * The workspace owner (`OpportunityFocusPanelModeGrid`) sits below the header that owns Manage, so
 * the header hands the action across with a window event addressed to its record. The action
 * travels resolved: the workspace hosts the very action Manage resolved, even on a stage whose Work
 * Template does not list it as a helpful action.
 */

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";

export const ADMIN_V2_OPEN_CURRENT_WORK_ACTION = "adminv2:open-current-work-action" as const;

export type OpenCurrentWorkActionDetail = {
    /** The record whose Focus Panel should host the action. */
    opportunity_id: string;
    action: ResolvedActionForClient;
};

/** True when the registry declares this record action's operator experience to be the Current Work workspace. */
export function isCurrentWorkHostedRecordAction(action: Pick<ResolvedActionForClient, "key">): boolean {
    const key = (action.key ?? "").trim();
    if (!key) return false;
    const definition = canonicalActionDefinition(key);
    return Boolean(
        definition
            && definition.runtimeWired
            && definition.category === "relationship"
            && definition.interactionHost === "inline_form",
    );
}

export function dispatchOpenCurrentWorkAction(detail: OpenCurrentWorkActionDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMIN_V2_OPEN_CURRENT_WORK_ACTION, { detail }));
}

/**
 * The record's resolved action for `key` — from the same registry-resolved slots Manage is built
 * from. A card placement (Children "+ Add Child", Household "+ Add Contact") invokes THIS action
 * through the record action handler Manage uses, so its availability, permission and host are
 * Manage's, never a card's own. Absent → the card offers nothing.
 */
export function findRecordAction(
    slots: ResolvedActionsBySlot | null | undefined,
    key: string,
): ResolvedActionForClient | null {
    if (!slots) return null;
    const wanted = key.trim();
    for (const action of [
        ...(slots.header ?? []),
        ...(slots.primary ?? []),
        ...(slots.secondary ?? []),
        ...(slots.overflow ?? []),
    ]) {
        if (action?.key?.trim() === wanted) return action;
    }
    return null;
}
