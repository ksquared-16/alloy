import { describe, expect, it } from "vitest";
import {
    formatAvailabilityCount,
    formatProgramAgeRange,
    formatProgramAgeRangeDetail,
    operatorProgramError,
    programLifecycleLabel,
} from "@/lib/programs/programsOperatorPresentation";
import {
    buildProgramOperatorDetail,
    buildProgramsOperatorCollection,
    filterProgramOperatorRows,
} from "@/lib/programs/programsOperatorModel";
import type { ProgramPublicationSnapshot } from "@/lib/programs/publication/programPublicationService";

function snapshotFixture(): ProgramPublicationSnapshot {
    return {
        capabilities: { canManage: true },
        programs: [
            {
                id: "p1",
                key: "kindergarten",
                lifecycleStatus: "active",
                draft: {
                    id: "d1",
                    programId: "p1",
                    status: "validated",
                    baseRevisionId: null,
                    validationErrors: [],
                    updatedAt: "2026-07-01T00:00:00Z",
                    programKey: "kindergarten",
                    label: "Kindergarten",
                    description: "A year of learning",
                    category: null,
                    eligibility: {},
                    audience: { minimumAge: 5, maximumAge: 6, ageUnit: "years" },
                    requiredResourceType: null,
                    qualificationRequirements: [],
                    defaultPolicyRefs: {},
                    defaultCommercialPosture: {},
                },
                revisions: [],
                publications: [],
                latestPublication: null,
            },
            {
                id: "p2",
                key: "preschool",
                lifecycleStatus: "retired",
                draft: {
                    id: "d2",
                    programId: "p2",
                    status: "draft",
                    baseRevisionId: null,
                    validationErrors: [],
                    updatedAt: "2026-07-01T00:00:00Z",
                    programKey: "preschool",
                    label: "Preschool",
                    description: null,
                    category: null,
                    eligibility: {},
                    audience: {},
                    requiredResourceType: null,
                    qualificationRequirements: [],
                    defaultPolicyRefs: {},
                    defaultCommercialPosture: {},
                },
                revisions: [{ id: "r1" } as never],
                publications: [{ id: "pub1" } as never],
                latestPublication: { id: "pub1" } as never,
            },
        ],
        locations: [
            { id: "l1", label: "North Campus" },
            { id: "l2", label: "South Campus" },
        ],
        runs: [],
        attempts: [],
        assignments: [
            {
                id: "a1",
                programId: "p1",
                locationId: "l1",
                locationLabel: "North Campus",
                publicationId: "pub",
                revisionId: "rev",
                revisionNumber: 1,
                consumedAt: "2026-07-01T00:00:00Z",
                deliveredByRunId: "run",
            },
        ],
        availability: [],
        offerings: [],
        variants: [],
        tuitionRates: [],
        policies: [],
        products: [],
    };
}

describe("programsOperatorPresentation", () => {
    it("formats age ranges without inventing incompleteness", () => {
        expect(formatProgramAgeRange({ minimumAge: 5, maximumAge: 6, ageUnit: "years" })).toBe("5–6 years");
        expect(formatProgramAgeRange({ minimumAge: 0, maximumAge: 18, ageUnit: "months" })).toBe(
            "Birth–18 months",
        );
        expect(formatProgramAgeRange({})).toBeNull();
        expect(formatProgramAgeRangeDetail({})).toBe("Not specified");
    });

    it("formats availability and lifecycle in operator language", () => {
        expect(formatAvailabilityCount(0)).toBe("Not available at any Locations");
        expect(formatAvailabilityCount(1)).toBe("Available at 1 Location");
        expect(formatAvailabilityCount(4)).toBe("Available at 4 Locations");
        expect(programLifecycleLabel("retired")).toBe("Archived");
        expect(programLifecycleLabel("active")).toBe("Active");
    });

    it("maps technical errors to operator copy", () => {
        expect(operatorProgramError("duplicate key value violates programs_org_key_unique")).toContain(
            "already exists",
        );
        expect(operatorProgramError("A Program with this key already exists.")).not.toMatch(/\bkey\b/i);
    });
});

describe("programsOperatorModel", () => {
    it("builds collection rows without readiness or category", () => {
        const rows = buildProgramsOperatorCollection(snapshotFixture());
        expect(rows).toHaveLength(2);
        expect(rows[0]?.name).toBe("Kindergarten");
        expect(rows[0]?.ageRangeLabel).toBe("5–6 years");
        expect(rows[0]?.availabilityLabel).toBe("Available at 1 Location");
        expect(JSON.stringify(rows)).not.toMatch(/readiness|category|revision|publication/i);
    });

    it("filters active/archived and search", () => {
        const rows = buildProgramsOperatorCollection(snapshotFixture());
        expect(filterProgramOperatorRows(rows, { search: "", filter: "active" })).toHaveLength(1);
        expect(filterProgramOperatorRows(rows, { search: "", filter: "archived" })).toHaveLength(1);
        expect(filterProgramOperatorRows(rows, { search: "kind", filter: "all" })).toHaveLength(1);
    });

    it("blocks delete when associations or history exist", () => {
        const snapshot = snapshotFixture();
        const active = buildProgramOperatorDetail(snapshot, "p1");
        const archived = buildProgramOperatorDetail(snapshot, "p2");
        expect(active?.canDelete).toBe(false);
        expect(archived?.canDelete).toBe(false);
        expect(archived?.descriptionDisplay).toBe("No description added");
        expect(archived?.ageRangeDisplay).toBe("Not specified");
    });
});
