import type { ChildLifecycleSlotState } from "@/lib/admin/person/personDrawerChildLifecycleSlots";

export type PersonDrawerChildLifecycleAction =
    | { kind: "overview_enrollment" }
    | { kind: "open_opportunity"; opportunity_id: string }
    | { kind: "tab"; tab: "documents" | "related" | "overview" }
    | { kind: "opportunity_communications"; opportunity_id: string }
    | null;

/** Resolve actionable target for a lifecycle slot — future modules remain inert. */
export function resolvePersonDrawerChildLifecycleAction(
    slot: ChildLifecycleSlotState,
    primaryOpportunityId: string | null
): PersonDrawerChildLifecycleAction {
    switch (slot.key) {
        case "lead":
        case "enrollment_activity":
            if (primaryOpportunityId) {
                return { kind: "open_opportunity", opportunity_id: primaryOpportunityId };
            }
            if (slot.phase !== "future") {
                return { kind: "overview_enrollment" };
            }
            return null;
        case "documents":
            return { kind: "tab", tab: "documents" };
        case "communications":
            if (primaryOpportunityId) {
                return { kind: "opportunity_communications", opportunity_id: primaryOpportunityId };
            }
            return null;
        case "history":
            return { kind: "tab", tab: "related" };
        default:
            return null;
    }
}

export function personDrawerChildLifecycleActionLabel(
    slot: ChildLifecycleSlotState,
    action: PersonDrawerChildLifecycleAction
): string | null {
    if (!action) return null;
    if (action.kind === "open_opportunity") return "Open family lead";
    if (action.kind === "overview_enrollment") return "View enrollment";
    if (action.kind === "tab" && action.tab === "documents") return "Open documents";
    if (action.kind === "tab" && action.tab === "related") return "Open activity";
    if (action.kind === "opportunity_communications") return "Open communications";
    if (action.kind === "tab" && action.tab === "overview") return "View overview";
    if (slot.phase === "future") return null;
    return null;
}
