/**
 * Approved Organization Calculation catalog — proving slice (capacity projections).
 * Expanding this catalog is a deliberate platform change.
 */

export const APPROVED_INPUT_REFS = [
    "capacity.room_binding.physical",
    "capacity.room_binding.licensed",
    "capacity.room_binding.operational",
    "capacity.room_binding.ratio_limited",
    "capacity.room_binding.binding",
] as const;

export type ApprovedInputRef = (typeof APPROVED_INPUT_REFS)[number];

export type BinaryOp = "add" | "sub" | "mul" | "div";
export type CallFn = "min" | "max" | "coalesce";

export type CatalogInputDescriptor = {
    ref: ApprovedInputRef;
    label: string;
    description: string;
    platformKey: "capacity.room_binding";
    projection: "physical" | "licensed" | "operational" | "ratioLimited" | "binding";
};

export const CATALOG_INPUTS: readonly CatalogInputDescriptor[] = [
    {
        ref: "capacity.room_binding.physical",
        label: "Physical capacity",
        description: "Physical seat capacity for the room",
        platformKey: "capacity.room_binding",
        projection: "physical",
    },
    {
        ref: "capacity.room_binding.licensed",
        label: "Licensed capacity",
        description: "Licensed ceiling for the room",
        platformKey: "capacity.room_binding",
        projection: "licensed",
    },
    {
        ref: "capacity.room_binding.operational",
        label: "Operational capacity",
        description: "Configured operational capacity for the room",
        platformKey: "capacity.room_binding",
        projection: "operational",
    },
    {
        ref: "capacity.room_binding.ratio_limited",
        label: "Ratio-limited capacity",
        description: "Ratio-limited child capacity for the cohort",
        platformKey: "capacity.room_binding",
        projection: "ratioLimited",
    },
    {
        ref: "capacity.room_binding.binding",
        label: "Binding capacity",
        description: "Platform binding capacity (most restrictive known limit)",
        platformKey: "capacity.room_binding",
        projection: "binding",
    },
] as const;

export const CATALOG_OPERATORS = {
    unary: ["neg"] as const,
    binary: ["add", "sub", "mul", "div"] as const,
    calls: ["min", "max", "coalesce"] as const,
};

export function listOrganizationCalculationCatalog() {
    return {
        subject_grains: ["room"] as const,
        inputs: CATALOG_INPUTS,
        operators: CATALOG_OPERATORS,
        notes:
            "Proving slice: compose approved capacity.room_binding projections only. No SQL, JS, or arbitrary tables.",
    };
}

export function catalogLabelForRef(ref: ApprovedInputRef): string {
    return CATALOG_INPUTS.find((i) => i.ref === ref)?.label ?? ref;
}
