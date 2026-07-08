/**
 * Current Work checklist handoff — routes outreach to Communications Focus,
 * Activity, or a configured composer action. No silent close.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    focusPanelCardBackLabel,
    isFocusElevatingCard,
    type FocusPanelCoordination,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";

import type { CurrentWorkChecklistItem } from "./projectCurrentWork";

export type WorkItemHandoffPlan =
    | { kind: "focus"; card: FocusPanelCardKey; focus: string | null }
    | { kind: "activity" }
    | { kind: "header_action" }
    | { kind: "blocked"; message: string };

function communicationsInLayout(coordination: FocusPanelCoordination): boolean {
    const targets = coordination.focusTargets;
    if (!targets) return true;
    return targets.has("communications");
}

/** Outreach / contact-family work — opens communications surfaces, not Household. */
export function isOutreachChecklistItem(item: CurrentWorkChecklistItem): boolean {
    return item.handoffKind === "outreach";
}

export function resolveWorkItemHandoff(
    item: CurrentWorkChecklistItem,
    coordination: FocusPanelCoordination | undefined,
): WorkItemHandoffPlan | null {
    if (!coordination || item.state === "complete" || !item.ownerCard) return null;

    if (item.ownerCard === "communications" || item.handoffKind === "outreach") {
        if (communicationsInLayout(coordination)) {
            return { kind: "focus", card: "communications", focus: item.ownerFocus };
        }
        if (coordination.openFocusPanelMode) {
            return { kind: "activity" };
        }
        const action = coordination.resolveCommunicationsComposerAction?.();
        if (action && coordination.invokeHeaderAction) {
            return { kind: "header_action" };
        }
        return {
            kind: "blocked",
            message: "No communications surface is configured — add Communications to the panel or use Activity.",
        };
    }

    const card = item.ownerCard;
    if (!isFocusElevatingCard(card)) {
        return {
            kind: "blocked",
            message: `${focusPanelCardBackLabel(card)} is not available on this surface.`,
        };
    }

    const targets = coordination.focusTargets;
    if (targets && !targets.has(card)) {
        return {
            kind: "blocked",
            message: `${focusPanelCardBackLabel(card)} is not on this panel.`,
        };
    }

    return { kind: "focus", card, focus: item.ownerFocus };
}
