import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";

const HEADER_SLOTS = ["primary", "secondary", "overflow", "header"] as const;

function collectActionKeys(actions: ResolvedActionsBySlot | null | undefined): string[] {
    const keys = new Set<string>();
    if (!actions) return [];
    for (const slot of HEADER_SLOTS) {
        for (const action of actions[slot] ?? []) {
            const key = action.key?.trim();
            if (key) keys.add(key);
        }
    }
    return [...keys];
}

/** Resolve configured opportunity header actions for post-create recommendations. */
export async function fetchCreateLeadPostCreateActionKeys(input: {
    departmentId: string;
    opportunityId?: string | null;
}): Promise<string[]> {
    const qs = new URLSearchParams({
        surface: "record_header",
        entity_type: "opportunity",
        department_id: input.departmentId.trim(),
        hint_opportunity_status_key: "new_inquiry",
    });
    const opportunityId = input.opportunityId?.trim();
    if (opportunityId) qs.set("entity_id", opportunityId);

    try {
        const res = await fetch(`/api/admin/actions?${qs.toString()}`, { credentials: "include" });
        if (!res.ok) return [];
        const json = (await res.json()) as { actions?: ResolvedActionsBySlot };
        return collectActionKeys(json.actions);
    } catch {
        return [];
    }
}
