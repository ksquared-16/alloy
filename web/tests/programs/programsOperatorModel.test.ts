import { describe, expect, it } from "vitest";
import {
    formatProgramAgeRange,
    formatProgramAgeRangeDetail,
    normalizeProgramAgeBoundaryToDays,
    operatorProgramError,
    programLifecycleLabel,
    readProgramAgeRange,
    validateProgramAgeRange,
    writeProgramAgeAudience,
} from "@/lib/programs/programsOperatorPresentation";
import {
    buildProgramOperatorDetail,
    buildProgramsOperatorCollection,
    filterProgramOperatorRows,
    normalizeProgramsLifecycleFilter,
    normalizeProgramsSortField,
    sortProgramOperatorRows,
} from "@/lib/programs/programsOperatorModel";
import {
    deriveLocationProgramAvailabilityStatus,
    formatProgramCollectionAvailabilitySummary,
    buildLocationProgramAvailabilityView,
} from "@/lib/programs/locationProgramAvailability";
import { organizationProgramsHref } from "@/lib/admin/canonicalAdminRoutes";
import { resolveCommandSurfaceRailStarterSuggestions } from "@/lib/adminV2/aiCommandSurface/commandSurfaceShellLayout";
import type { ProgramPublicationSnapshot } from "@/lib/programs/publication/programPublicationService";
import { effectiveLocationProgramLabel } from "@/lib/locations/locationProgramCategories";
import { buildProgramsLandingModel } from "@/lib/programs/programsOperatorLanding";

function snapshotFixture(asOf = "2026-07-22"): ProgramPublicationSnapshot {
    void asOf;
    return {
        capabilities: { canManage: true },
        programs: [
            {
                id: "p1",
                key: "kindergarten",
                lifecycleStatus: "active",
                createdAt: "2026-01-01T00:00:00Z",
                draft: {
                    id: "d1",
                    programId: "p1",
                    status: "validated",
                    baseRevisionId: null,
                    validationErrors: [],
                    updatedAt: "2026-07-10T00:00:00Z",
                    programKey: "kindergarten",
                    label: "Kindergarten",
                    description: "A year of learning",
                    category: null,
                    eligibility: {},
                    audience: {
                        minimum: { value: 5, unit: "years" },
                        maximum: { value: 6, unit: "years" },
                        minimumAge: 5,
                        maximumAge: 6,
                        ageUnit: "years",
                    },
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
                createdAt: "2026-02-01T00:00:00Z",
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
            {
                id: "p3",
                key: "infant",
                lifecycleStatus: "active",
                createdAt: "2026-03-01T00:00:00Z",
                draft: {
                    id: "d3",
                    programId: "p3",
                    status: "validated",
                    baseRevisionId: null,
                    validationErrors: [],
                    updatedAt: "2026-07-20T00:00:00Z",
                    programKey: "infant",
                    label: "Infant",
                    description: null,
                    category: null,
                    eligibility: {},
                    audience: {
                        minimum: { value: 6, unit: "weeks" },
                        maximum: { value: 12, unit: "months" },
                        minimumAge: 6,
                        maximumAge: 12,
                        ageUnit: "weeks",
                    },
                    requiredResourceType: null,
                    qualificationRequirements: [],
                    defaultPolicyRefs: {},
                    defaultCommercialPosture: {},
                },
                revisions: [],
                publications: [],
                latestPublication: null,
            },
        ],
        locations: [
            { id: "l1", label: "North Campus" },
            { id: "l2", label: "South Campus" },
        ],
        runs: [],
        attempts: [],
        assignments: [],
        availability: [
            {
                id: "a1",
                programId: "p1",
                programKey: "kindergarten",
                locationId: "l1",
                locationLabel: "North Campus",
                offered: true,
                consumedRevisionId: null,
                localDescriptionOverride: null,
                localAuthorizationEvidence: null,
                localDisplayName: null,
                availableFrom: null,
                availableThrough: null,
                metadata: {},
            },
            {
                id: "a2",
                programId: "p3",
                programKey: "infant",
                locationId: "l1",
                locationLabel: "North Campus",
                offered: true,
                consumedRevisionId: null,
                localDescriptionOverride: null,
                localAuthorizationEvidence: null,
                localDisplayName: "Young Infants",
                availableFrom: null,
                availableThrough: null,
                metadata: {},
            },
            {
                id: "a3",
                programId: "p3",
                programKey: "infant",
                locationId: "l2",
                locationLabel: "South Campus",
                offered: true,
                consumedRevisionId: null,
                localDescriptionOverride: null,
                localAuthorizationEvidence: null,
                localDisplayName: null,
                availableFrom: "2027-03-01",
                availableThrough: null,
                metadata: {},
            },
        ],
        offerings: [],
        variants: [],
        tuitionRates: [],
        policies: [],
        products: [],
    };
}

describe("programsOperatorPresentation", () => {
    it("formats mixed-unit and same-unit age ranges", () => {
        expect(
            formatProgramAgeRange({
                minimum: { value: 6, unit: "weeks" },
                maximum: { value: 12, unit: "months" },
            }),
        ).toBe("6 weeks–12 months");
        expect(
            formatProgramAgeRange({
                minimum: { value: 1, unit: "month" },
                maximum: { value: 18, unit: "months" },
            }),
        ).toBe("1 month–18 months");
        expect(
            formatProgramAgeRange({
                minimum: { value: 18, unit: "months" },
                maximum: { value: 3, unit: "years" },
            }),
        ).toBe("18 months–3 years");
        expect(formatProgramAgeRange({ minimumAge: 3, maximumAge: 5, ageUnit: "years" })).toBe("3–5 years");
        expect(formatProgramAgeRange({ minimum: { value: 6, unit: "weeks" } })).toBe("From 6 weeks");
        expect(formatProgramAgeRange({ maximum: { value: 18, unit: "months" } })).toBe("Up to 18 months");
        expect(formatProgramAgeRangeDetail({})).toBe("Not specified");
        expect(formatProgramAgeRange({ minimum: { value: 1, unit: "week" } })).toBe("From 1 week");
        expect(formatProgramAgeRange({ minimum: { value: 2, unit: "weeks" } })).toBe("From 2 weeks");
    });

    it("validates reversed mixed-unit ranges after normalization", () => {
        expect(
            validateProgramAgeRange({
                minimum: { value: 3, unit: "years" },
                maximum: { value: 6, unit: "weeks" },
            }),
        ).toMatch(/older/i);
        expect(
            validateProgramAgeRange({
                minimum: { value: 6, unit: "weeks" },
                maximum: { value: 12, unit: "months" },
            }),
        ).toBeNull();
    });

    it("normalizes boundaries to days for sorting", () => {
        expect(normalizeProgramAgeBoundaryToDays({ value: 6, unit: "weeks" })).toBe(42);
        expect(normalizeProgramAgeBoundaryToDays({ value: 1, unit: "months" })).toBe(30);
        expect(normalizeProgramAgeBoundaryToDays({ value: 1, unit: "years" })).toBe(365);
    });

    it("round-trips structured audience writes", () => {
        const written = writeProgramAgeAudience({
            minimum: { value: 6, unit: "weeks" },
            maximum: { value: 12, unit: "months" },
        });
        expect(readProgramAgeRange(written)).toEqual({
            minimum: { value: 6, unit: "weeks" },
            maximum: { value: 12, unit: "months" },
        });
    });

    it("formats lifecycle in operator language", () => {
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

describe("locationProgramAvailability", () => {
    it("derives scheduled, active, ended, and inclusive boundaries", () => {
        expect(
            deriveLocationProgramAvailabilityStatus({
                offered: true,
                availableFrom: "2027-03-01",
                availableThrough: null,
                asOfYmd: "2026-07-22",
            }),
        ).toBe("scheduled");
        expect(
            deriveLocationProgramAvailabilityStatus({
                offered: true,
                availableFrom: null,
                availableThrough: null,
                asOfYmd: "2026-07-22",
            }),
        ).toBe("active");
        expect(
            deriveLocationProgramAvailabilityStatus({
                offered: true,
                availableFrom: "2026-01-01",
                availableThrough: "2026-07-22",
                asOfYmd: "2026-07-22",
            }),
        ).toBe("active");
        expect(
            deriveLocationProgramAvailabilityStatus({
                offered: true,
                availableFrom: "2026-01-01",
                availableThrough: "2026-07-21",
                asOfYmd: "2026-07-22",
            }),
        ).toBe("ended");
        expect(
            deriveLocationProgramAvailabilityStatus({
                offered: false,
                availableFrom: null,
                availableThrough: null,
            }),
        ).toBe("not_offered");
    });

    it("formats collection summaries for active vs scheduled", () => {
        expect(
            formatProgramCollectionAvailabilitySummary({
                activeCount: 3,
                scheduledCount: 0,
                earliestScheduledFrom: null,
            }),
        ).toBe("Available at 3 Locations");
        expect(
            formatProgramCollectionAvailabilitySummary({
                activeCount: 2,
                scheduledCount: 1,
                earliestScheduledFrom: "2027-03-01",
            }),
        ).toBe("Available at 2 Locations · 1 scheduled");
        expect(
            formatProgramCollectionAvailabilitySummary({
                activeCount: 0,
                scheduledCount: 1,
                earliestScheduledFrom: "2027-03-01",
            }),
        ).toBe("Available beginning Mar 1, 2027");
        expect(
            formatProgramCollectionAvailabilitySummary({
                activeCount: 0,
                scheduledCount: 0,
                earliestScheduledFrom: null,
            }),
        ).toBe("Not available at any Locations");
    });

    it("inherits organization name unless local override is set", () => {
        const inherited = buildLocationProgramAvailabilityView({
            locationId: "l1",
            locationLabel: "North Campus",
            organizationProgramName: "Infant",
            localDisplayName: null,
            availableFrom: null,
            availableThrough: null,
            offered: true,
        });
        expect(inherited.effectiveLabel).toBe("Infant");
        expect(inherited.secondaryLine).toBeNull();

        const overridden = buildLocationProgramAvailabilityView({
            locationId: "l1",
            locationLabel: "North Campus",
            organizationProgramName: "Infant",
            localDisplayName: "Young Infants",
            availableFrom: null,
            availableThrough: null,
            offered: true,
        });
        expect(overridden.effectiveLabel).toBe("Young Infants");
        expect(overridden.secondaryLine).toContain("Young Infants");

        expect(
            effectiveLocationProgramLabel({ label: "Infant", local_display_name: null }),
        ).toBe("Infant");
        expect(
            effectiveLocationProgramLabel({ label: "Infant", local_display_name: "Young Infants" }),
        ).toBe("Young Infants");
        // Org rename leaves override untouched.
        expect(
            effectiveLocationProgramLabel({ label: "Infants", local_display_name: "Young Infants" }),
        ).toBe("Young Infants");
        expect(
            effectiveLocationProgramLabel({ label: "Infants", local_display_name: null }),
        ).toBe("Infants");
    });
});

describe("programsOperatorModel", () => {
    it("builds collection rows with scheduled-aware availability summaries", () => {
        const rows = buildProgramsOperatorCollection(snapshotFixture());
        const infant = rows.find((row) => row.id === "p3");
        expect(infant?.ageRangeLabel).toBe("6 weeks–12 months");
        expect(infant?.availabilityLabel).toBe("Available at 1 Location · 1 scheduled");
        expect(JSON.stringify(rows)).not.toMatch(/readiness|category|revision|publication/i);
    });

    it("filters active/archived/all and restores URL filter values", () => {
        const rows = buildProgramsOperatorCollection(snapshotFixture());
        expect(filterProgramOperatorRows(rows, { search: "", filter: "active" })).toHaveLength(2);
        expect(filterProgramOperatorRows(rows, { search: "", filter: "archived" })).toHaveLength(1);
        expect(filterProgramOperatorRows(rows, { search: "", filter: "all" })).toHaveLength(3);
        expect(normalizeProgramsLifecycleFilter("archived")).toBe("archived");
        expect(normalizeProgramsLifecycleFilter(undefined)).toBe("active");
        expect(normalizeProgramsSortField("age_range")).toBe("age");
    });

    it("sorts by name, mixed-unit age, locations, and dates", () => {
        const rows = buildProgramsOperatorCollection(snapshotFixture());
        const byNameAsc = sortProgramOperatorRows(rows, "name", "asc").map((row) => row.name);
        expect(byNameAsc).toEqual(["Infant", "Kindergarten", "Preschool"]);
        const byNameDesc = sortProgramOperatorRows(rows, "name", "desc").map((row) => row.name);
        expect(byNameDesc[0]).toBe("Preschool");

        const byAgeAsc = sortProgramOperatorRows(
            filterProgramOperatorRows(rows, { search: "", filter: "all" }),
            "age",
            "asc",
        );
        expect(byAgeAsc.map((row) => row.id)).toEqual(["p3", "p1", "p2"]);

        const byLocations = sortProgramOperatorRows(
            filterProgramOperatorRows(rows, { search: "", filter: "active" }),
            "locations",
            "desc",
        );
        expect(byLocations[0]?.id).toBe("p3");
    });

    it("blocks delete when associations or history exist", () => {
        const snapshot = snapshotFixture();
        const active = buildProgramOperatorDetail(snapshot, "p1");
        const archived = buildProgramOperatorDetail(snapshot, "p2");
        const infant = buildProgramOperatorDetail(snapshot, "p3");
        expect(active?.canDelete).toBe(false);
        expect(archived?.canDelete).toBe(false);
        expect(infant?.locationAvailability.some((row) => row.secondaryLine)).toBe(true);
        expect(infant?.locationAvailability.find((row) => row.locationId === "l2")?.status).toBe("scheduled");
        expect(archived?.descriptionDisplay).toBe("No description added");
        expect(archived?.ageRangeDisplay).toBe("Not specified");
    });

    it("builds URL filter and sort params without defaults", () => {
        expect(organizationProgramsHref("abc", null, { status: "active", sort: "name", direction: "asc" })).toBe(
            "/organization/programs?programId=abc",
        );
        expect(organizationProgramsHref("abc", null, { status: "archived", sort: "age", direction: "desc" })).toBe(
            "/organization/programs?programId=abc&status=archived&sort=age&direction=desc",
        );
        expect(organizationProgramsHref(null, null, { status: "active", sort: "name", direction: "asc" })).toBe(
            "/organization/programs",
        );
    });
});

describe("programsOperatorLanding", () => {
    it("counts org Program state separately from Location availability", () => {
        const model = buildProgramsLandingModel(snapshotFixture(), "2026-07-22");
        expect(model.activeProgramCount).toBe(2);
        expect(model.archivedProgramCount).toBe(1);
        expect(model.locationsOfferingCount).toBe(1);
        expect(model.locationRows).toEqual([
            { locationId: "l1", locationLabel: "North Campus", activeProgramCount: 2 },
        ]);
        expect(model.upcoming).toHaveLength(1);
        expect(model.upcoming[0]?.programName).toBe("Infant");
        expect(model.upcoming[0]?.summaryLine).toContain("Begins Mar 1, 2027");
        expect(model.upcoming[0]?.summaryLine).toContain("South Campus");
    });

    it("omits upcoming section data when nothing is scheduled", () => {
        const snapshot = snapshotFixture();
        snapshot.availability = snapshot.availability.filter((row) => !row.availableFrom);
        const model = buildProgramsLandingModel(snapshot, "2026-07-22");
        expect(model.upcoming).toEqual([]);
    });
});

describe("programs BOS starters", () => {
    it("suppresses unpublished-changes copy on Programs routes", () => {
        const suggestions = resolveCommandSurfaceRailStarterSuggestions({
            hasWorkUnitScope: false,
            hasOpportunityContext: false,
            opportunitySingular: "Inquiry",
            isConfigurationContext: true,
            pathname: "/organization/programs",
        });
        expect(suggestions.map((row) => row.title)).toEqual([
            "Summarize this Program",
            "Which Locations offer this Program?",
            "What changed recently?",
        ]);
        expect(suggestions.map((row) => row.title).join(" ")).not.toMatch(/unpublished/i);
    });
});
