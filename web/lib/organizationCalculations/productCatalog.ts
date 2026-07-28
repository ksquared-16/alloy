/**
 * Administrator-facing calculation types for Organization Calculations V1.
 * Exactly the templates the platform supports today — no fake future types.
 */

import { provingMinPhysicalLicensedAst, type OrgCalcExpr } from "@/lib/organizationCalculations/ast";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";

export type OrgCalcProductTypeId = "capacity_lowest_physical_licensed" | "capacity_operational_with_fallback";

export type OrgCalcProductType = {
    id: OrgCalcProductTypeId;
    /** Short label shown in collection rows and Definition */
    typeLabel: string;
    /** Card title in New Calculation */
    title: string;
    /** One-line business description */
    summary: string;
    /** What the result means */
    outputLabel: string;
    units: string;
    /** Human input labels (never registry keys) */
    inputLabels: string[];
    buildAst: () => OrgCalcExpr;
};

export const ORG_CALC_PRODUCT_TYPES: readonly OrgCalcProductType[] = [
    {
        id: "capacity_lowest_physical_licensed",
        typeLabel: "Capacity",
        title: "Lowest of physical and licensed seats",
        summary: "Uses whichever is smaller for the room: physical seats or licensed seats.",
        outputLabel: "Effective seats",
        units: "seats",
        inputLabels: ["Physical seats", "Licensed seats"],
        buildAst: provingMinPhysicalLicensedAst,
    },
    {
        id: "capacity_operational_with_fallback",
        typeLabel: "Operational capacity",
        title: "Operational seats when available",
        summary: "Uses the room’s operational seats when set. If operational seats are not set, use physical seats.",
        outputLabel: "Effective seats",
        units: "seats",
        inputLabels: ["Operational seats", "Physical seats"],
        buildAst: () => ({
            kind: "call",
            fn: "coalesce",
            id: "root",
            args: [
                { kind: "input", ref: "capacity.room_binding.operational" as ApprovedInputRef, id: "in_op" },
                { kind: "input", ref: "capacity.room_binding.physical" as ApprovedInputRef, id: "in_phys" },
            ],
        }),
    },
] as const;

export function productTypeById(id: string | null | undefined): OrgCalcProductType | null {
    if (!id) return null;
    return ORG_CALC_PRODUCT_TYPES.find((t) => t.id === id) ?? null;
}

/** Infer product type from a stored AST (best-effort for existing drafts). */
export function inferProductTypeFromAst(ast: unknown): OrgCalcProductType {
    const raw = JSON.stringify(ast ?? {});
    if (raw.includes("coalesce") && raw.includes("operational")) {
        return ORG_CALC_PRODUCT_TYPES[1]!;
    }
    return ORG_CALC_PRODUCT_TYPES[0]!;
}

export function statusLabel(lifecycle: string): string {
    if (lifecycle === "published") return "Published";
    if (lifecycle === "archived") return "Archived";
    return "Draft";
}
