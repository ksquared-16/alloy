/**
 * Declarative copy + structure for Growth workspace command rail (`growth_workspace_actions` block).
 * Lane key matches `work_units.key` for the two standard Growth queues.
 */

export type GrowthWorkUnitLaneKey = "new_leads" | "unbooked_quotes";

export function parseGrowthLaneParam(raw: string | null | undefined): GrowthWorkUnitLaneKey | null {
    const t = (raw ?? "").trim().toLowerCase();
    if (t === "new_leads") return "new_leads";
    if (t === "unbooked_quotes") return "unbooked_quotes";
    return null;
}

export function growthLaneLabel(lane: GrowthWorkUnitLaneKey | null): string {
    switch (lane) {
        case "new_leads":
            return "Front of funnel";
        case "unbooked_quotes":
            return "Priced · open";
        default:
            return "All lanes";
    }
}

export function growthLaneHelperText(lane: GrowthWorkUnitLaneKey | null): string {
    switch (lane) {
        case "new_leads":
            return "Qualify and start quote from each row. Owner assignment uses the opportunity record.";
        case "unbooked_quotes":
            return "Open the quote surface for pricing, discounts, and overrides. Mark won or lost on each row.";
        default:
            return "Pick a lane to see focused actions, or work directly from the queues below.";
    }
}
