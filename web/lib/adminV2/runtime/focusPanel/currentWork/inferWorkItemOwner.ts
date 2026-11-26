/**
 * Infer which Focus Panel card owns the best *work surface* for a checklist item.
 *
 * Rule: route to where the operator *does the work*, not only where contact truth lives.
 * Household is reserved for contact-data verification — not outreach itself.
 *
 * Used for checklist navigation handoffs — pure + testable.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalWorkItem } from "@/lib/adminV2/runtime/operationalContext/types";

export type WorkItemOwner = { card: FocusPanelCardKey; focus: string | null };

/** Route checklist items to the best work surface / action owner. */
export function inferWorkItemOwner(item: OperationalWorkItem): WorkItemOwner | null {
    const label = item.label.toLowerCase();

    if (/\b(document|upload|form|paperwork|packet)\b/.test(label)) {
        return { card: "documents", focus: null };
    }

    // Contact-data tasks stay on Household (verify / find / update phone·email·address).
    if (
        /\b(verify|confirm|update|find|collect|add|missing)\b.{0,40}\b(contact|phone|email|address)\b/.test(
            label,
        )
        || /\b(contact info|contact information|phone number|email address)\b/.test(label)
    ) {
        return { card: "household", focus: "primary_contact" };
    }

    // Outreach work — message/email/call/contact family — opens Communications Focus
    // (action registry + send/compose surface), not Household identity.
    if (/\b(message|text|email|send|outreach|communicat|call|contact|reach|follow[\s-]?up)\b/.test(label)) {
        return { card: "communications", focus: null };
    }

    if (/\b(program|schedule|enroll|enrollment|child|roster|placement|fit|start date)\b/.test(label)) {
        return { card: "children", focus: null };
    }

    return null;
}
