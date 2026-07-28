/**
 * Operator-facing capacity recipe copy for OI measurement creation.
 * Never expose AST / coalesce / fallback / function names on the primary path.
 */

import type { OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";

export type CapacityRecipeCopy = {
    id: OrgCalcProductTypeId;
    /** Card title on “How should capacity be determined?” */
    title: string;
    /** One-sentence explanation */
    summary: string;
    /** Source line on measurement overview */
    sourceLine: string;
};

export const CAPACITY_RECIPES: readonly CapacityRecipeCopy[] = [
    {
        id: "capacity_lowest_physical_licensed",
        title: "Lowest of physical and licensed seats",
        summary: "Uses whichever is smaller for the room: physical seats or licensed seats.",
        sourceLine: "Lowest of physical and licensed seats",
    },
    {
        id: "capacity_operational_with_fallback",
        title: "Operational seats when available",
        summary: "Uses the room’s operational seats when set. If not set, uses physical seats.",
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
    if (t.includes("lowest") || t.includes("physical and licensed")) return CAPACITY_RECIPES[0]!;
    if (t.includes("capacity_operational")) return CAPACITY_RECIPES[1]!;
    return CAPACITY_RECIPES[0]!;
}
