/**
 * Operator-facing capacity recipe copy for OI measurement creation.
 * Never expose AST / coalesce / fallback / function names on the primary path.
 */

import type { OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";

export type CapacityRecipeCopy = {
    id: OrgCalcProductTypeId;
    /** Short choice label in the recipe control */
    title: string;
    /** One-sentence explanation */
    summary: string;
    /** Readable recipe sentence on overview / builder */
    recipeSentence: string;
    /** Compact source line */
    sourceLine: string;
};

export const CAPACITY_RECIPES: readonly CapacityRecipeCopy[] = [
    {
        id: "capacity_lowest_physical_licensed",
        title: "Lower of physical and licensed seats",
        summary: "Uses whichever is smaller for the room: physical seats or licensed seats.",
        recipeSentence: "Capacity is the lower of physical seats and licensed seats.",
        sourceLine: "Lower of physical and licensed seats",
    },
    {
        id: "capacity_operational_with_fallback",
        title: "Operational seats when available",
        summary: "Uses the room’s operational seats when set. If operational seats are not set, use physical seats.",
        recipeSentence:
            "Capacity uses operational seats when set; if operational seats are not set, use physical seats.",
        sourceLine: "Operational seats when available",
    },
] as const;

export function capacityRecipeById(id: string | null | undefined): CapacityRecipeCopy | null {
    if (!id) return null;
    return CAPACITY_RECIPES.find((r) => r.id === id) ?? null;
}

export function capacityRecipeFromProductTypeLabel(typeLabel: string | null | undefined): CapacityRecipeCopy {
    const t = String(typeLabel ?? "").toLowerCase();
    if (t.includes("operational") || t.includes("when available")) return CAPACITY_RECIPES[1]!;
    if (t.includes("lowest") || t.includes("lower of") || t.includes("physical and licensed")) {
        return CAPACITY_RECIPES[0]!;
    }
    if (t.includes("capacity_operational")) return CAPACITY_RECIPES[1]!;
    return CAPACITY_RECIPES[0]!;
}
