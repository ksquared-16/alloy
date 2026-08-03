import { describe, expect, it } from "vitest";
import { operatorFriendlyProgramOfferingError } from "@/lib/programs/operatorFriendlyProgramOfferingError";
import { operatorFriendlyCommercialError } from "@/lib/commercial/operatorFriendlyCommercialError";
import {
    chargeTimingSummary,
    readChargeTiming,
    writeChargeTimingMetadata,
} from "@/lib/commercial/chargeTiming";
import { commercialPolicyTypesByCategory } from "@/lib/commercial/execution/policy/policyTypes";
import { accountTypeLabel } from "@/lib/financials/gl/accountTypes";
import { occupiedCareFormatsForProgram } from "@/lib/financials/tuitionPlans/occupiedCareFormats";
import type { ProgramOffering } from "@/lib/programs/programOfferings";

describe("operatorFriendlyProgramOfferingError", () => {
    it("maps program_offerings_unique to operator language", () => {
        const message = operatorFriendlyProgramOfferingError(
            'duplicate key value violates unique constraint "program_offerings_unique"',
            { programLabel: "toddler", careFormat: "full_time", planName: "Toddler FT" },
        );
        expect(message).toMatch(/already/i);
        expect(message).not.toMatch(/duplicate key/i);
        expect(message).not.toMatch(/program_offerings_unique/i);
    });

    it("maps attendance change blocked by rates", () => {
        const message = operatorFriendlyProgramOfferingError(
            "Cannot change attendance type — variants have rates. Remove rates first.",
        );
        expect(message).toMatch(/Care format/i);
        expect(message).not.toMatch(/variants have rates/i);
    });
});

describe("operatorFriendlyCommercialError", () => {
    it("maps catalog and policy duplicates", () => {
        expect(
            operatorFriendlyCommercialError(
                'duplicate key value violates unique constraint "commercial_products_org_name"',
            ),
        ).toMatch(/catalog item/i);
        expect(
            operatorFriendlyCommercialError(
                'duplicate key value violates unique constraint "commercial_policies"',
            ),
        ).toMatch(/policy/i);
    });
});

describe("occupiedCareFormatsForProgram", () => {
    it("excludes the current offering", () => {
        const offerings = [
            { id: "a", program_key: "infant", attendance_type: "full_time" },
            { id: "b", program_key: "infant", attendance_type: "part_time" },
            { id: "c", program_key: "toddler", attendance_type: "full_time" },
        ] as ProgramOffering[];
        const occupied = occupiedCareFormatsForProgram(offerings, "infant", "a");
        expect(occupied.has("full_time")).toBe(false);
        expect(occupied.has("part_time")).toBe(true);
    });
});

describe("chargeTiming metadata", () => {
    it("round-trips event-driven timing without cadence", () => {
        const meta = writeChargeTimingMetadata({}, { mode: "event_driven", eventTrigger: "late_pickup" });
        expect(readChargeTiming(meta)).toEqual({ mode: "event_driven", eventTrigger: "late_pickup" });
        expect(
            chargeTimingSummary({
                mode: "event_driven",
                cadenceKey: null,
                eventTrigger: "late_pickup",
            }),
        ).toBe("Event · Late Pickup");
    });

    it("summarizes scheduled monthly", () => {
        expect(
            chargeTimingSummary({
                mode: "scheduled",
                cadenceKey: "monthly",
                eventTrigger: null,
                cadenceLabel: "Monthly",
            }),
        ).toBe("Scheduled · Monthly");
    });
});

describe("commercial policy categories", () => {
    it("groups every registry type under a category", () => {
        const groups = commercialPolicyTypesByCategory();
        expect(groups.map((g) => g.category)).toEqual([
            "pricing",
            "billing",
            "eligibility",
            "workflow",
            "exception",
        ]);
        const types = groups.flatMap((g) => g.types);
        expect(types).toContain("discount");
        expect(types).toContain("proration");
        expect(types).toContain("waiver");
    });
});

describe("accountTypeLabel", () => {
    it("labels known account types", () => {
        expect(accountTypeLabel("revenue")).toBe("Revenue");
        expect(accountTypeLabel("contra_revenue")).toBe("Contra Revenue");
    });
});
