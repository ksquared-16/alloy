/**
 * Approved Organization Calculation catalog.
 * Expanding this catalog is a deliberate platform change.
 */

export const APPROVED_INPUT_REFS = [
    "capacity.room_binding.physical",
    "capacity.room_binding.licensed",
    "capacity.room_binding.operational",
    "capacity.room_binding.ratio_limited",
    "capacity.room_binding.binding",
    "occupancy.expected",
] as const;

export type ApprovedInputRef = (typeof APPROVED_INPUT_REFS)[number];

export type BinaryOp = "add" | "sub" | "mul" | "div";
export type CallFn = "min" | "max" | "coalesce";

export type CatalogCapacityProjection =
    | "physical"
    | "licensed"
    | "operational"
    | "ratioLimited"
    | "binding";

export type CatalogInputDescriptor =
    | {
          ref: ApprovedInputRef;
          label: string;
          description: string;
          platformKey: "capacity.room_binding";
          projection: CatalogCapacityProjection;
      }
    | {
          ref: "occupancy.expected";
          label: string;
          description: string;
          platformKey: "occupancy.expected";
          projection: "expected";
      };

export const CATALOG_INPUTS: readonly CatalogInputDescriptor[] = [
    {
        ref: "capacity.room_binding.physical",
        label: "Physical seats",
        description: "Physical seat capacity for the room",
        platformKey: "capacity.room_binding",
        projection: "physical",
    },
    {
        ref: "capacity.room_binding.licensed",
        label: "Licensed seats",
        description: "Licensed ceiling for the room",
        platformKey: "capacity.room_binding",
        projection: "licensed",
    },
    {
        ref: "capacity.room_binding.operational",
        label: "Operational seats",
        description: "Configured operational capacity for the room",
        platformKey: "capacity.room_binding",
        projection: "operational",
    },
    {
        ref: "capacity.room_binding.ratio_limited",
        label: "Ratio-limited seats",
        description: "Ratio-limited child capacity for the cohort",
        platformKey: "capacity.room_binding",
        projection: "ratioLimited",
    },
    {
        ref: "capacity.room_binding.binding",
        label: "Effective capacity",
        description: "Most restrictive known seat limit for the room",
        platformKey: "capacity.room_binding",
        projection: "binding",
    },
    {
        ref: "occupancy.expected",
        label: "Active enrolled children",
        description: "Children expected in the room on the selected date from committed schedules",
        platformKey: "occupancy.expected",
        projection: "expected",
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
            "Compose approved capacity and occupancy facts only. No SQL, JS, or arbitrary tables.",
    };
}

export function catalogLabelForRef(ref: ApprovedInputRef): string {
    return CATALOG_INPUTS.find((i) => i.ref === ref)?.label ?? ref;
}

export function isCapacityCatalogInput(
    input: CatalogInputDescriptor,
): input is Extract<CatalogInputDescriptor, { platformKey: "capacity.room_binding" }> {
    return input.platformKey === "capacity.room_binding";
}
