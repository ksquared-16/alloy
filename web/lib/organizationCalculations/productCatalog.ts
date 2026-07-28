/**
 * Administrator-facing calculation types for Organization Calculations.
 * Exactly the templates the platform supports today — no fake future types.
 */

import { provingMinPhysicalLicensedAst, type OrgCalcExpr } from "@/lib/organizationCalculations/ast";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";

export type OrgCalcProductTypeId =
    | "capacity_lowest_physical_licensed"
    | "capacity_operational_with_fallback"
    | "room_utilization_pct";

export type OrgCalcProductType = {
    id: OrgCalcProductTypeId;
    typeLabel: string;
    title: string;
    summary: string;
    outputLabel: string;
    units: string;
    inputLabels: string[];
    buildAst: () => OrgCalcExpr;
};

/** Occupied children ÷ effective capacity × 100 */
export function roomUtilizationPctAst(): OrgCalcExpr {
    return {
        kind: "binary",
        op: "mul",
        id: "root",
        left: {
            kind: "binary",
            op: "div",
            id: "ratio",
            left: { kind: "input", ref: "occupancy.expected" as ApprovedInputRef, id: "occ" },
            right: {
                kind: "input",
                ref: "capacity.room_binding.binding" as ApprovedInputRef,
                id: "cap",
            },
        },
        right: { kind: "const", value: 100, id: "pct" },
    };
}

export const ORG_CALC_PRODUCT_TYPES: readonly OrgCalcProductType[] = [
    {
        id: "capacity_lowest_physical_licensed",
        typeLabel: "Capacity",
        title: "Lower of physical and licensed seats",
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
    {
        id: "room_utilization_pct",
        typeLabel: "Utilization",
        title: "Room utilization",
        summary: "Active enrolled children divided by effective capacity, shown as a percentage.",
        outputLabel: "Utilization",
        units: "percent",
        inputLabels: ["Active enrolled children", "Effective capacity"],
        buildAst: roomUtilizationPctAst,
    },
] as const;

export function productTypeById(id: string | null | undefined): OrgCalcProductType | null {
    if (!id) return null;
    return ORG_CALC_PRODUCT_TYPES.find((t) => t.id === id) ?? null;
}

export function inferProductTypeFromAst(ast: unknown): OrgCalcProductType {
    const raw = JSON.stringify(ast ?? {});
    if (raw.includes("occupancy.expected") && raw.includes("capacity.room_binding.binding")) {
        return ORG_CALC_PRODUCT_TYPES.find((t) => t.id === "room_utilization_pct")!;
    }
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
