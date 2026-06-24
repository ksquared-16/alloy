import { describe, expect, it } from "vitest";
import {
    assertValidIsoDate,
    compareIsoDates,
    computePriorRowCloseDate,
    isInvalidSupersedeStartDate,
    isStartDateAfterToday,
    shouldTransitionAgreementEndingToEnded,
    validateEndOnOrAfterStart,
} from "@/lib/childcareOperational/effectiveDating";
import {
    deriveAgreementStatusFromStartDate,
    derivePlacementStatusFromStartDate,
    isAgreementOperationalStatus,
    isAgreementTerminalStatus,
    isPlacementOperationalStatus,
    isPlacementTerminalStatus,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";

describe("effectiveDating helpers", () => {
    it("computes prior row close date as new start minus one day", () => {
        expect(computePriorRowCloseDate("2026-06-15")).toBe("2026-06-14");
        expect(computePriorRowCloseDate("2026-01-01")).toBe("2025-12-31");
    });

    it("validates end on or after start", () => {
        expect(validateEndOnOrAfterStart("2026-06-01", "2026-06-15")).toBeNull();
        expect(validateEndOnOrAfterStart("2026-06-15", "2026-06-01")?.code).toBe(
            "end_before_start"
        );
    });

    it("detects start before/after today", () => {
        expect(isStartDateAfterToday("2026-06-20", "2026-06-15")).toBe(true);
        expect(isStartDateAfterToday("2026-06-15", "2026-06-15")).toBe(false);
    });

    it("rejects invalid supersede start dates", () => {
        expect(
            isInvalidSupersedeStartDate({
                priorStartDate: "2026-06-01",
                priorEndDate: null,
                newStartDate: "2026-06-01",
            })
        ).toBe(true);
        expect(
            isInvalidSupersedeStartDate({
                priorStartDate: "2026-06-01",
                priorEndDate: "2026-06-10",
                newStartDate: "2026-06-10",
            })
        ).toBe(true);
        expect(
            isInvalidSupersedeStartDate({
                priorStartDate: "2026-06-01",
                priorEndDate: null,
                newStartDate: "2026-06-15",
            })
        ).toBe(false);
    });

    it("transitions ending to ended when end_date before today", () => {
        expect(shouldTransitionAgreementEndingToEnded("ending", "2026-06-10", "2026-06-15")).toBe(
            true
        );
        expect(shouldTransitionAgreementEndingToEnded("ending", "2026-06-20", "2026-06-15")).toBe(
            false
        );
        expect(shouldTransitionAgreementEndingToEnded("active", "2026-06-10", "2026-06-15")).toBe(
            false
        );
    });

    it("derives planned vs active from start date", () => {
        expect(derivePlacementStatusFromStartDate("2026-06-20", "2026-06-15")).toBe("planned");
        expect(derivePlacementStatusFromStartDate("2026-06-15", "2026-06-15")).toBe("active");
        expect(deriveAgreementStatusFromStartDate("2026-06-20", "2026-06-15")).toBe("pending_start");
        expect(deriveAgreementStatusFromStartDate("2026-06-01", "2026-06-15")).toBe("active");
    });

    it("compareIsoDates orders calendar strings", () => {
        expect(compareIsoDates("2026-01-02", "2026-01-10")).toBe(-1);
        expect(compareIsoDates("2026-01-10", "2026-01-02")).toBe(1);
    });

    it("assertValidIsoDate rejects malformed values", () => {
        expect(() => assertValidIsoDate("2026-13-40")).toThrow();
    });
});

describe("enrollmentOperationalStatus helpers", () => {
    it("classifies operational vs terminal statuses", () => {
        expect(isAgreementOperationalStatus("active")).toBe(true);
        expect(isAgreementOperationalStatus("ending")).toBe(true);
        expect(isAgreementTerminalStatus("ended")).toBe(true);
        expect(isAgreementTerminalStatus("canceled")).toBe(true);
        expect(isPlacementOperationalStatus("planned")).toBe(true);
        expect(isPlacementTerminalStatus("superseded")).toBe(true);
    });
});
