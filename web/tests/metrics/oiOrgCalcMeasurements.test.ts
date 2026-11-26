import { describe, expect, it } from "vitest";
import {
    createOiOrgCalcMeasurementDraft,
    evaluateOiOrgCalcHealth,
    humanUnavailableReason,
    parseOiOrgCalcMeasurements,
    writeOiOrgCalcMeasurements,
} from "@/lib/metrics/oiOrgCalcMeasurements";

describe("oiOrgCalcMeasurements", () => {
    it("creates a draft bound to an exact published version", () => {
        const m = createOiOrgCalcMeasurementDraft({
            name: "Future Room Capacity",
            userId: "u1",
            source: {
                type: "organization_calculation",
                calculation_id: "c1",
                calculation_version_id: "v1",
                calculation_name: "Capacity",
                version_number: 1,
            },
            target: { kind: "count_min", value: 18 },
        });
        expect(m.subject_grain).toBe("room");
        expect(m.unit).toBe("seats");
        expect(m.source.calculation_version_id).toBe("v1");
        expect(m.target?.kind === "count_min" ? m.target.value : null).toBe(18);
    });

    it("round-trips percent + rate_range goals", () => {
        const m = createOiOrgCalcMeasurementDraft({
            name: "Room Utilization",
            userId: null,
            unit: "percent",
            source: {
                type: "organization_calculation",
                calculation_id: "c1",
                calculation_version_id: "v1",
                calculation_name: "Util",
                version_number: 1,
            },
            target: { kind: "rate_range", min: 75, max: 95 },
            question_key: "room_utilization",
        });
        const meta = writeOiOrgCalcMeasurements({}, [m]);
        const parsed = parseOiOrgCalcMeasurements(meta);
        expect(parsed[0]?.unit).toBe("percent");
        expect(parsed[0]?.target).toEqual({ kind: "rate_range", min: 75, max: 95 });
    });

    it("round-trips through org_settings metadata", () => {
        const m = createOiOrgCalcMeasurementDraft({
            name: "Future Room Capacity",
            userId: null,
            source: {
                type: "organization_calculation",
                calculation_id: "c1",
                calculation_version_id: "v1",
                calculation_name: "Capacity",
                version_number: 1,
            },
        });
        const meta = writeOiOrgCalcMeasurements({}, [m]);
        const parsed = parseOiOrgCalcMeasurements(meta);
        expect(parsed).toHaveLength(1);
        expect(parsed[0]?.source.calculation_version_id).toBe("v1");
    });

    it("evaluates health without treating missing as zero", () => {
        expect(
            evaluateOiOrgCalcHealth(
                {
                    id: "o1",
                    measurement_id: "m1",
                    room_id: "r1",
                    room_label: null,
                    effective_at: "2026-08-01",
                    evaluated_at: new Date().toISOString(),
                    value: null,
                    availability: "not_available",
                    unavailable_reason: "Required capacity inputs are not configured for this room.",
                    calculation_version_id: "v1",
                    version_number: 1,
                    explanation_summary: [],
                    provenance: {
                        source_type: "organization_calculation",
                        calculation_id: "c1",
                        calculation_name: "Capacity",
                    },
                },
                { kind: "count_min", value: 18 },
            ),
        ).toBe("not_available");

        expect(
            evaluateOiOrgCalcHealth(
                {
                    id: "o2",
                    measurement_id: "m1",
                    room_id: "r1",
                    room_label: null,
                    effective_at: "2026-08-01",
                    evaluated_at: new Date().toISOString(),
                    value: 20,
                    availability: "resolved",
                    unavailable_reason: null,
                    calculation_version_id: "v1",
                    version_number: 1,
                    explanation_summary: [],
                    provenance: {
                        source_type: "organization_calculation",
                        calculation_id: "c1",
                        calculation_name: "Capacity",
                    },
                },
                { kind: "count_min", value: 18 },
            ),
        ).toBe("on_goal");

        expect(
            evaluateOiOrgCalcHealth(
                {
                    id: "o3",
                    measurement_id: "m1",
                    room_id: "r1",
                    room_label: null,
                    effective_at: "2026-08-01",
                    evaluated_at: new Date().toISOString(),
                    value: 10,
                    availability: "resolved",
                    unavailable_reason: null,
                    calculation_version_id: "v1",
                    version_number: 1,
                    explanation_summary: [],
                    provenance: {
                        source_type: "organization_calculation",
                        calculation_id: "c1",
                        calculation_name: "Capacity",
                    },
                },
                { kind: "count_min", value: 18 },
            ),
        ).toBe("below_goal");
    });

    it("maps missing capacity to operator language", () => {
        expect(humanUnavailableReason("not_configured", [])).toMatch(/not configured/i);
    });
});
