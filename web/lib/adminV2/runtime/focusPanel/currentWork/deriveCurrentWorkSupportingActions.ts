import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";

/** Administrative keys that belong in Manage — not Current Work supporting. */
const MANAGE_ONLY_ACTION_KEYS = new Set([
    "duplicate_lead",
    "merge_lead",
    "transfer_lead",
    "export_lead",
    "archive_lead",
    "delete_lead",
    "open_record",
]);

/** Operational completion keys Current Work owns when outcome picker is active. */
const CURRENT_WORK_COMPLETION_DUPLICATE_KEYS = new Set([
    "close_lead",
    "update_lead_status",
    "complete_stage_contact_attempts",
    "contact_attempted",
]);

/**
 * Registry-backed supporting actions for Current Work Focus.
 * Uses record_header primary/secondary/header slots — not Manage overflow.
 */
export function deriveCurrentWorkSupportingActions(args: {
    recordHeaderSlots: ResolvedActionsBySlot | null | undefined;
    showOutcomeCompletion: boolean;
    primaryActionLabel: string | null;
}): ResolvedActionForClient[] {
    const slots = args.recordHeaderSlots;
    if (!slots) return [];

    const candidates = [
        ...(slots.primary ?? []),
        ...(slots.secondary ?? []),
        ...(slots.header ?? []),
    ];

    const seen = new Set<string>();
    const out: ResolvedActionForClient[] = [];

    for (const action of candidates) {
        const key = action.key.trim();
        if (!key || seen.has(key)) continue;
        if (MANAGE_ONLY_ACTION_KEYS.has(key)) continue;
        if (args.showOutcomeCompletion && CURRENT_WORK_COMPLETION_DUPLICATE_KEYS.has(key)) continue;

        const label = action.label.trim();
        const primary = args.primaryActionLabel?.trim().toLowerCase() ?? "";
        if (primary && label.toLowerCase() === primary) continue;
        if (primary && label.toLowerCase() === primary.replace(/\s*→$/, "").trim()) continue;

        seen.add(key);
        out.push(action);
    }

    return out;
}
