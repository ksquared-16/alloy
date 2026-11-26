/**
 * Thread 8, Slice G — a diagnostic that guesses is worse than no diagnostic.
 *
 * It sends an administrator to fix the wrong thing, and it is believed, because
 * it appeared in a panel labelled diagnostics. So the properties under test are
 * mostly about restraint: nothing is reported that the facts do not support,
 * nothing is reported twice, and a healthy subject reports nothing at all.
 *
 * The copy is tested too. An administrator reading a permission key or a table
 * name learns nothing they can act on, and Thread 8's whole premise is that they
 * should never have to.
 */

import { describe, expect, it } from "vitest";
import {
    diagnoseChild,
    diagnoseDevice,
    diagnoseProducer,
    diagnoseStaffCapture,
    sortDiagnostics,
    type AttendanceDiagnostic,
} from "@/lib/childcareOperational/attendance/diagnostics/attendanceDiagnostics";

const healthyStaff = { linkedToPerson: true, captureScope: "site" as const, assignmentCount: 0 };
const healthyDevice = {
    status: "active" as const,
    deviceSiteLocationId: "site-1",
    expectedSiteLocationId: "site-1",
};
const healthyProducer = {
    status: "active" as const,
    grantedSiteLocationIds: ["site-1"],
    expectedSiteLocationId: "site-1",
    unresolvedMappingCount: 0,
};
const healthyChild = {
    hasCommittedPlacement: true,
    safeguardingScreened: true,
    authorizedPickupCount: 1,
    locationHierarchyUnresolvable: false,
};

describe("nothing wrong reports nothing", () => {
    it("is empty for every healthy subject", () => {
        expect(diagnoseStaffCapture(healthyStaff)).toEqual([]);
        expect(diagnoseDevice(healthyDevice)).toEqual([]);
        expect(diagnoseProducer(healthyProducer)).toEqual([]);
        expect(diagnoseChild(healthyChild)).toEqual([]);
    });
});

describe("staff capture", () => {
    it("reports an unset capture scope as unset, not as the permissive default", () => {
        // null is an unasked question. Treating it as "site" would report a
        // working configuration for a person who can record nothing.
        const [d] = diagnoseStaffCapture({ ...healthyStaff, captureScope: null });
        expect(d.code).toBe("capture_scope_unset");
        expect(d.severity).toBe("blocking");
    });

    it("reports assignment-scoped capture with no assignments", () => {
        const codes = diagnoseStaffCapture({
            ...healthyStaff,
            captureScope: "assigned",
            assignmentCount: 0,
        }).map((d) => d.code);
        expect(codes).toContain("assigned_capture_without_assignment");
    });

    it("does NOT report missing assignments for a site-scoped person", () => {
        // Their assignments have no bearing on what they can record; saying so
        // would send an administrator to fix an irrelevant setting.
        const codes = diagnoseStaffCapture({
            ...healthyStaff,
            captureScope: "site",
            assignmentCount: 0,
        }).map((d) => d.code);
        expect(codes).not.toContain("assigned_capture_without_assignment");
    });

    it("reports an unlinked login", () => {
        const codes = diagnoseStaffCapture({ ...healthyStaff, linkedToPerson: false }).map((d) => d.code);
        expect(codes).toContain("user_not_linked_to_person");
    });
});

describe("devices", () => {
    it("reports a revoked device and nothing else", () => {
        // Its site binding is not the operator's problem; two entries would
        // suggest two things need fixing.
        const result = diagnoseDevice({
            status: "revoked",
            deviceSiteLocationId: "site-2",
            expectedSiteLocationId: "site-1",
        });
        expect(result.map((d) => d.code)).toEqual(["kiosk_revoked"]);
    });

    it("reports a site mismatch for an active device", () => {
        const codes = diagnoseDevice({ ...healthyDevice, deviceSiteLocationId: "site-2" }).map((d) => d.code);
        expect(codes).toEqual(["kiosk_site_mismatch"]);
    });

    it("says nothing about the site when none was asked about", () => {
        expect(diagnoseDevice({ ...healthyDevice, expectedSiteLocationId: null })).toEqual([]);
    });
});

describe("external producers", () => {
    it("reports a revoked producer and stops", () => {
        const result = diagnoseProducer({ ...healthyProducer, status: "revoked", grantedSiteLocationIds: [] });
        expect(result.map((d) => d.code)).toEqual(["producer_revoked"]);
    });

    it("reports a missing site grant", () => {
        const codes = diagnoseProducer({ ...healthyProducer, grantedSiteLocationIds: ["site-9"] }).map(
            (d) => d.code,
        );
        expect(codes).toContain("producer_missing_site_grant");
    });

    it("reports unresolved mappings as attention, not as a blockage", () => {
        // Attendance is still working for everyone the system CAN identify.
        const [d] = diagnoseProducer({ ...healthyProducer, unresolvedMappingCount: 3 });
        expect(d.code).toBe("producer_mapping_unresolved");
        expect(d.severity).toBe("attention");
        expect(d.title).toContain("3");
    });

    it("says nothing when no records failed to match", () => {
        const codes = diagnoseProducer(healthyProducer).map((d) => d.code);
        expect(codes).not.toContain("producer_mapping_unresolved");
    });
});

describe("one child", () => {
    it("reports a missing placement", () => {
        const codes = diagnoseChild({ ...healthyChild, hasCommittedPlacement: false }).map((d) => d.code);
        expect(codes).toContain("child_without_committed_placement");
    });

    it("reports an unresolvable room, which Slice A's ancestry walk can detect", () => {
        const codes = diagnoseChild({ ...healthyChild, locationHierarchyUnresolvable: true }).map(
            (d) => d.code,
        );
        expect(codes).toContain("location_hierarchy_unresolvable");
    });

    it("reports unscreened safeguarding INSTEAD of missing pickup, never both", () => {
        // With the question unasked, "no adult is listed" is not yet a
        // conclusion, and reporting both would imply two separate tasks.
        const codes = diagnoseChild({
            ...healthyChild,
            safeguardingScreened: false,
            authorizedPickupCount: 0,
        }).map((d) => d.code);
        expect(codes).toContain("safeguarding_unresolved");
        expect(codes).not.toContain("pickup_authority_absent");
    });

    it("reports missing pickup authority only once the question has been asked", () => {
        const codes = diagnoseChild({ ...healthyChild, authorizedPickupCount: 0 }).map((d) => d.code);
        expect(codes).toContain("pickup_authority_absent");
    });

    it("does not call an unscreened child an attendance blockage", () => {
        // It blocks COLLECTION at a device, not recording attendance.
        const [d] = diagnoseChild({ ...healthyChild, safeguardingScreened: false });
        expect(d.severity).toBe("attention");
    });
});

describe("operator copy never leaks implementation", () => {
    const every: AttendanceDiagnostic[] = [
        ...diagnoseStaffCapture({ linkedToPerson: false, captureScope: null, assignmentCount: 0 }),
        ...diagnoseStaffCapture({ linkedToPerson: true, captureScope: "assigned", assignmentCount: 0 }),
        ...diagnoseDevice({ status: "revoked", deviceSiteLocationId: "a", expectedSiteLocationId: "b" }),
        ...diagnoseDevice({ status: "active", deviceSiteLocationId: "a", expectedSiteLocationId: "b" }),
        ...diagnoseProducer({
            status: "active",
            grantedSiteLocationIds: [],
            expectedSiteLocationId: "s",
            unresolvedMappingCount: 2,
        }),
        ...diagnoseProducer({
            status: "revoked",
            grantedSiteLocationIds: [],
            expectedSiteLocationId: null,
            unresolvedMappingCount: 0,
        }),
        ...diagnoseChild({
            hasCommittedPlacement: false,
            safeguardingScreened: false,
            authorizedPickupCount: 0,
            locationHierarchyUnresolvable: true,
        }),
    ];

    const FORBIDDEN = [
        "attendance_capture_scope",
        "user_access_profiles",
        "user_person_links",
        "unit_role",
        "producer_key",
        "attendance.record",
        "customer_member",
        "location_type",
        "parent_location_id",
        "consumption_events",
        "kiosk",
        "null",
        "undefined",
    ];

    it("names no table, key, column or enum in any title or detail", () => {
        for (const d of every) {
            const text = `${d.title} ${d.detail}`.toLowerCase();
            for (const word of FORBIDDEN) {
                expect(text, `${d.code} leaked "${word}"`).not.toContain(word);
            }
        }
    });

    it("gives every diagnostic a title and something to do about it", () => {
        for (const d of every) {
            expect(d.title.length).toBeGreaterThan(0);
            expect(d.detail.length).toBeGreaterThan(0);
        }
    });

    it("emits a stable machine-readable code alongside the copy", () => {
        for (const d of every) {
            expect(d.code).toMatch(/^[a-z_]+$/);
        }
    });
});

describe("ordering", () => {
    it("puts what blocks attendance above what merely needs attention", () => {
        const mixed = diagnoseChild({
            hasCommittedPlacement: false,
            safeguardingScreened: true,
            authorizedPickupCount: 0,
            locationHierarchyUnresolvable: false,
        });
        const sorted = sortDiagnostics(mixed);
        expect(sorted[0].severity).toBe("blocking");
        expect(sorted[sorted.length - 1].severity).toBe("attention");
    });
});
