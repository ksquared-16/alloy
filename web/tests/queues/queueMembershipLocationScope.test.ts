import { describe, expect, it } from "vitest";
import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import {
    applyOcmLocationScopeToQuery,
    applyRelatedSubjectLocationVisibility,
    applyWaitlistCandidateLocationScopeToQuery,
    defaultLocationScopeSourceForSubjectType,
    filterOcmEnrollmentTrackRowsByLocationScope,
    filterWaitlistCandidateRowsByLocationScope,
    passesSubjectLocationScope,
    relatedSubjectVisibilityForLocation,
    resolveCandidateRowSubjectLocationId,
    resolveEffectiveLocationScopeSource,
    resolveOcmRowSubjectLocationId,
} from "@/lib/queues/queueMembershipLocationScope";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

const LOC_A = "loc-a";
const LOC_B = "loc-b";
const restrictedScope: RecordScopeConstraints = {
    workUnitIds: null,
    locationIds: [LOC_A],
    impossible: false,
};

describe("queueMembershipLocationScope defaults", () => {
    it("defaults location scope source by subject type", () => {
        expect(defaultLocationScopeSourceForSubjectType("child")).toBe("ocm_site");
        expect(defaultLocationScopeSourceForSubjectType("candidate")).toBe("placement_site");
        expect(defaultLocationScopeSourceForSubjectType("case")).toBe("case_site");
    });

    it("resolveEffectiveLocationScopeSource uses membership default", () => {
        const membership: QueueMembershipV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "tour",
            subject_type: "child",
            count_unit: "enrollment_tracks",
            included_disposition_keys: ["tour_scheduled"],
        };
        expect(resolveEffectiveLocationScopeSource(membership)).toBe("ocm_site");
    });
});

describe("passesSubjectLocationScope", () => {
    it("unrestricted user includes rows with missing location", () => {
        expect(
            passesSubjectLocationScope({
                subjectLocationId: null,
                recordScopeConstraints: null,
            }),
        ).toBe(true);
    });

    it("restricted user excludes rows with missing location", () => {
        expect(
            passesSubjectLocationScope({
                subjectLocationId: null,
                recordScopeConstraints: restrictedScope,
            }),
        ).toBe(false);
    });

    it("restricted user includes matching location only", () => {
        expect(
            passesSubjectLocationScope({
                subjectLocationId: LOC_A,
                recordScopeConstraints: restrictedScope,
            }),
        ).toBe(true);
        expect(
            passesSubjectLocationScope({
                subjectLocationId: LOC_B,
                recordScopeConstraints: restrictedScope,
            }),
        ).toBe(false);
    });
});

describe("resolveOcmRowSubjectLocationId", () => {
    it("ocm_site uses OCM location only", () => {
        expect(
            resolveOcmRowSubjectLocationId({
                ocmLocationId: LOC_A,
                opportunityLocationId: LOC_B,
                scopeSource: "ocm_site",
            }),
        ).toBe(LOC_A);
        expect(
            resolveOcmRowSubjectLocationId({
                ocmLocationId: null,
                opportunityLocationId: LOC_B,
                scopeSource: "ocm_site",
            }),
        ).toBeNull();
    });

    it("case_site uses opportunity location", () => {
        expect(
            resolveOcmRowSubjectLocationId({
                ocmLocationId: LOC_A,
                opportunityLocationId: LOC_B,
                scopeSource: "case_site",
            }),
        ).toBe(LOC_B);
    });
});

describe("filterOcmEnrollmentTrackRowsByLocationScope", () => {
    const rows = [
        {
            id: "ocm-1",
            location_id: LOC_A,
            opportunities: { location_id: LOC_B },
        },
        {
            id: "ocm-2",
            location_id: null,
            opportunities: { location_id: LOC_B },
        },
        {
            id: "ocm-3",
            location_id: LOC_B,
            opportunities: { location_id: LOC_B },
        },
    ];

    it("unrestricted returns all rows", () => {
        expect(filterOcmEnrollmentTrackRowsByLocationScope(rows, null, "ocm_site").length).toBe(3);
    });

    it("restricted filters by OCM site for ocm_site scope", () => {
        const filtered = filterOcmEnrollmentTrackRowsByLocationScope(rows, restrictedScope, "ocm_site");
        expect(filtered.map((r) => r.id)).toEqual(["ocm-1"]);
    });

    it("restricted filters by opportunity site for case_site scope", () => {
        const withOppA = [
            ...rows,
            {
                id: "ocm-4",
                location_id: LOC_B,
                opportunities: { location_id: LOC_A },
            },
        ];
        const filtered = filterOcmEnrollmentTrackRowsByLocationScope(withOppA, restrictedScope, "case_site");
        expect(filtered.map((r) => r.id)).toEqual(["ocm-4"]);
    });
});

describe("filterWaitlistCandidateRowsByLocationScope", () => {
    const rows = [
        {
            id: "pc-1",
            site_id: LOC_A,
            opportunities: { location_id: LOC_B },
        },
        {
            id: "pc-2",
            site_id: null,
            opportunities: { location_id: LOC_A },
        },
        {
            id: "pc-3",
            site_id: LOC_B,
            opportunities: { location_id: LOC_B },
        },
    ];

    it("placement_site prefers candidate site_id", () => {
        const filtered = filterWaitlistCandidateRowsByLocationScope(rows, restrictedScope, "placement_site");
        expect(filtered.map((r) => r.id)).toEqual(["pc-1", "pc-2"]);
    });

    it("case_site uses opportunity location", () => {
        const filtered = filterWaitlistCandidateRowsByLocationScope(rows, restrictedScope, "case_site");
        expect(filtered.map((r) => r.id)).toEqual(["pc-2"]);
    });
});

describe("resolveCandidateRowSubjectLocationId", () => {
    it("placement_site falls back to opportunity when site missing", () => {
        expect(
            resolveCandidateRowSubjectLocationId({
                siteId: null,
                opportunityLocationId: LOC_A,
                scopeSource: "placement_site",
            }),
        ).toBe(LOC_A);
    });
});

describe("related subject redaction", () => {
    it("redacts out-of-scope sibling details", () => {
        const visibility = relatedSubjectVisibilityForLocation(LOC_B, [LOC_A]);
        expect(visibility).toBe("redacted");

        const redacted = applyRelatedSubjectLocationVisibility(
            {
                subject_type: "child",
                subject_id: "child-1",
                display_name: "Alice",
                status_label: "Tour scheduled",
                location_id: LOC_B,
                location_label: "Site B",
                program_label: "Preschool",
            },
            visibility,
        );
        expect(redacted.display_name).toBe("Other child");
        expect(redacted.location_label).toBeUndefined();
        expect(redacted.program_label).toBeUndefined();
        expect(redacted.visibility).toBe("redacted");
    });

    it("keeps full sibling in allowed scope", () => {
        const visibility = relatedSubjectVisibilityForLocation(LOC_A, [LOC_A]);
        const full = applyRelatedSubjectLocationVisibility(
            {
                subject_type: "child",
                subject_id: "child-1",
                display_name: "Alice",
                status_label: "Enrolled",
                location_id: LOC_A,
            },
            visibility,
        );
        expect(full.display_name).toBe("Alice");
        expect(full.visibility).toBe("full");
    });
});

describe("query scope helpers", () => {
    it("applyOcmLocationScopeToQuery uses OCM column for ocm_site", () => {
        const calls: string[] = [];
        const q = {
            in(col: string, vals: string[]) {
                calls.push(`${col}:${vals.join(",")}`);
                return this;
            },
        };
        applyOcmLocationScopeToQuery(q, restrictedScope, "ocm_site");
        expect(calls).toContain(`location_id:${LOC_A}`);
    });

    it("applyWaitlistCandidateLocationScopeToQuery builds placement_site or filter", () => {
        const q = {
            or(expr: string) {
                expect(expr).toContain("site_id.in");
                return this;
            },
            in() {
                return this;
            },
        };
        applyWaitlistCandidateLocationScopeToQuery(q, restrictedScope, "placement_site");
    });
});
