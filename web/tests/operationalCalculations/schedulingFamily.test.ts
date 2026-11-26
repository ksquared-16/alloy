import { describe, expect, it } from "vitest";
import {
    OCCUPANCY_EXPECTED,
    OCCUPANCY_ACTUAL,
    SCHEDULING_EXPECTED_STAFFING,
    SCHEDULING_ACTUAL_STAFFING,
    SCHEDULING_DEFINITIONS,
    type OccupancyCalculationRequest,
    type StaffingCalculationRequest,
} from "@/lib/operationalCalculations/families/scheduling";
import { resolveCalculation } from "@/lib/operationalCalculations/runtime";
import {
    getOperationalCalculationDefinition,
    listOperationalCalculationDefinitionsByFamily,
} from "@/lib/operationalCalculations/registry";

const CLOCK_ISO = "2026-07-17T12:00:00.000Z";
const clock = () => new Date(CLOCK_ISO);
const ROOM = "room-a";
const DATE = "2026-07-20";

const occupancy: OccupancyCalculationRequest = {
    entries: [
        { roomLocationId: ROOM, date: DATE, childCount: 7 },
        { roomLocationId: "room-b", date: DATE, childCount: 3 },
    ],
    roomLocationId: ROOM,
    date: DATE,
};

const staffing: StaffingCalculationRequest = {
    entries: [
        { roomLocationId: ROOM, date: DATE, childCount: 7, requiredStaff: 2, exceedsDefinedTiers: false },
    ],
    roomLocationId: ROOM,
    date: DATE,
};

describe("scheduling family — registration", () => {
    it("registers the four Definitions in the canonical registry, keyed by family", () => {
        expect(SCHEDULING_DEFINITIONS).toHaveLength(4);
        expect(getOperationalCalculationDefinition("occupancy.expected")).toBe(OCCUPANCY_EXPECTED);
        expect(getOperationalCalculationDefinition("scheduling.actual_staffing")).toBe(SCHEDULING_ACTUAL_STAFFING);
        expect(listOperationalCalculationDefinitionsByFamily("occupancy").map((d) => d.key).sort()).toEqual([
            "occupancy.actual",
            "occupancy.expected",
        ]);
        expect(listOperationalCalculationDefinitionsByFamily("scheduling").map((d) => d.key).sort()).toEqual([
            "scheduling.actual_staffing",
            "scheduling.expected_staffing",
        ]);
    });

    it("does NOT re-register the ratio/capacity calcs (they live in resource/capacity)", () => {
        const keys = SCHEDULING_DEFINITIONS.map((d) => d.key);
        expect(keys).not.toContain("scheduling.required_staff");
        expect(keys).not.toContain("scheduling.binding_capacity");
    });
});

describe("scheduling family — occupancy (scalar)", () => {
    it("resolves the room/date childCount as a scalar", () => {
        const r = resolveCalculation(OCCUPANCY_EXPECTED, occupancy, { clock });
        expect(r.value).toEqual({ kind: "scalar", value: 7 });
        expect(r.status).toBe("resolved");
        expect(r.scope).toEqual({ type: "room", id: ROOM });
        expect(r.effective).toEqual({ asOf: DATE });
        expect(r.calculationKey).toBe("occupancy.expected");
    });

    it("a room/date the read-model did not emit is a resolved 0, never null", () => {
        const r = resolveCalculation(OCCUPANCY_ACTUAL, { ...occupancy, roomLocationId: "room-empty" }, { clock });
        expect(r.value).toEqual({ kind: "scalar", value: 0 });
        expect(r.status).toBe("resolved");
    });
});

describe("scheduling family — staffing (requirement)", () => {
    it("resolves requiredStaff as a requirement value, ratio ceiling null", () => {
        const r = resolveCalculation(SCHEDULING_EXPECTED_STAFFING, staffing, { clock });
        expect(r.value).toEqual({
            kind: "requirement",
            requiredStaff: 2,
            ratioConstrainedCapacity: null,
            appliedTier: null,
            exceedsDefinedTiers: false,
        });
        expect(r.status).toBe("resolved");
    });

    it("a child count beyond the highest tier makes the result incomplete with the flag carried", () => {
        const beyond: StaffingCalculationRequest = {
            entries: [{ roomLocationId: ROOM, date: DATE, childCount: 99, requiredStaff: 3, exceedsDefinedTiers: true }],
            roomLocationId: ROOM,
            date: DATE,
        };
        const r = resolveCalculation(SCHEDULING_ACTUAL_STAFFING, beyond, { clock });
        expect(r.status).toBe("incomplete");
        expect((r.value as { exceedsDefinedTiers: boolean }).exceedsDefinedTiers).toBe(true);
    });

    it("no staff on a room/date the read-model did not emit is a resolved 0 requirement", () => {
        const r = resolveCalculation(SCHEDULING_EXPECTED_STAFFING, { ...staffing, roomLocationId: "room-empty" }, { clock });
        expect(r.status).toBe("resolved");
        expect((r.value as { requiredStaff: number }).requiredStaff).toBe(0);
    });
});

describe("scheduling family — no judgment, deterministic", () => {
    it("emits no verdict warnings (no over_capacity / understaffed)", () => {
        const r = resolveCalculation(SCHEDULING_EXPECTED_STAFFING, staffing, { clock });
        expect(r.warnings).toEqual([]);
    });

    it("is byte-identical across runs with the same injected clock", () => {
        const a = resolveCalculation(OCCUPANCY_EXPECTED, occupancy, { clock });
        const b = resolveCalculation(OCCUPANCY_EXPECTED, occupancy, { clock });
        expect(a).toEqual(b);
    });
});
