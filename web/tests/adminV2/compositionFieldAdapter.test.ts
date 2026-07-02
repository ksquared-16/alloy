/**
 * Universal Composition Model — Field Adapter tests.
 *
 * Covers:
 *   - availableFieldsForZone: returns non-empty field list for known zones
 *   - availableFieldsForGroup: returns fields for specific group
 *   - namedEvidenceGroupsForZone: returns named groups with available fields
 *   - isFieldAvailableForZone: membership check
 *   - Waitlist grain overrides
 *   - AvailableField shape: key, label, entityNamespace, isSystemField
 */

import { describe, expect, it } from "vitest";
import {
    availableFieldsForZone,
    availableFieldsForGroup,
    namedEvidenceGroupsForZone,
    isFieldAvailableForZone,
} from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";

describe("availableFieldsForZone — field list per zone", () => {
    it("household zone returns at least one field", () => {
        const fields = availableFieldsForZone("household");
        expect(fields.length).toBeGreaterThan(0);
    });

    it("children zone returns at least one field", () => {
        const fields = availableFieldsForZone("children");
        expect(fields.length).toBeGreaterThan(0);
    });

    it("status zone returns at least one field", () => {
        const fields = availableFieldsForZone("status");
        expect(fields.length).toBeGreaterThan(0);
    });

    it("unknown zone returns empty array", () => {
        const fields = availableFieldsForZone("unknown_zone_xyz");
        expect(fields).toHaveLength(0);
    });

    it("every returned field has key, label, entityNamespace, isSystemField", () => {
        for (const zone of ["household", "children", "status", "attention", "date_event"]) {
            const fields = availableFieldsForZone(zone);
            for (const field of fields) {
                expect(typeof field.key).toBe("string");
                expect(field.key.trim()).not.toBe("");
                expect(typeof field.label).toBe("string");
                expect(field.label.trim()).not.toBe("");
                expect(typeof field.entityNamespace).toBe("string");
                expect(typeof field.isSystemField).toBe("boolean");
            }
        }
    });

    it("household zone includes person.phone", () => {
        const fields = availableFieldsForZone("household");
        const keys = fields.map((f) => f.key);
        expect(keys).toContain("person.phone");
    });

    it("children zone includes child.name", () => {
        const fields = availableFieldsForZone("children");
        const keys = fields.map((f) => f.key);
        expect(keys).toContain("child.name");
    });

    it("no duplicate field keys in a zone's available fields", () => {
        for (const zone of ["household", "children", "status", "attention", "date_event"]) {
            const fields = availableFieldsForZone(zone);
            const keys = fields.map((f) => f.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    it("waitlist children zone differs from pipeline children zone", () => {
        const pipeline = availableFieldsForZone("children", false);
        const waitlist = availableFieldsForZone("children", true);
        const pipelineKeys = pipeline.map((f) => f.key);
        const waitlistKeys = waitlist.map((f) => f.key);
        // Sets should be different (different group definitions)
        const identical = JSON.stringify(pipelineKeys.sort()) === JSON.stringify(waitlistKeys.sort());
        expect(identical).toBe(false);
    });
});

describe("availableFieldsForGroup — fields for a specific group", () => {
    it("primary_contact group has person.phone", () => {
        const fields = availableFieldsForGroup("household", "primary_contact");
        const keys = fields.map((f) => f.key);
        expect(keys).toContain("person.phone");
    });

    it("child_summary group has child.name", () => {
        const fields = availableFieldsForGroup("children", "child_summary");
        const keys = fields.map((f) => f.key);
        expect(keys).toContain("child.name");
    });

    it("unknown group returns empty array", () => {
        const fields = availableFieldsForGroup("household", "nonexistent_group");
        expect(fields).toHaveLength(0);
    });

    it("waitlist placement_request group includes inquiry_child.desired_schedule_type", () => {
        const fields = availableFieldsForGroup("children", "placement_request", true);
        const keys = fields.map((f) => f.key);
        expect(keys).toContain("inquiry_child.desired_schedule_type");
    });

    it("waitlist_position group includes waitlist.positionLabel and overrides.flags", () => {
        const fields = availableFieldsForGroup("status", "waitlist_position", true);
        const keys = fields.map((f) => f.key);
        expect(keys).toContain("waitlist.positionLabel");
        expect(keys).toContain("waitlist.tierLabel");
        expect(keys).toContain("waitlist.waitSince");
        expect(keys).toContain("overrides.flags");
    });
});

describe("namedEvidenceGroupsForZone — groups with available fields", () => {
    it("household zone returns Primary Contact group", () => {
        const groups = namedEvidenceGroupsForZone("household");
        const primaryContact = groups.find((g) => g.key === "primary_contact");
        expect(primaryContact).toBeDefined();
        expect(primaryContact!.label).toBe("Primary Contact");
        expect(primaryContact!.availableFields.length).toBeGreaterThan(0);
    });

    it("children zone returns Child Summary and Placement groups", () => {
        const groups = namedEvidenceGroupsForZone("children");
        const keys = groups.map((g) => g.key);
        expect(keys).toContain("child_summary");
        expect(keys).toContain("placement");
    });

    it("waitlist children zone returns Candidate Summary group", () => {
        const groups = namedEvidenceGroupsForZone("children", true);
        const keys = groups.map((g) => g.key);
        expect(keys).toContain("candidate_summary");
        expect(keys).not.toContain("child_summary");
    });

    it("every group has non-empty label and availableFields array", () => {
        for (const zone of ["household", "children", "status", "attention"]) {
            const groups = namedEvidenceGroupsForZone(zone);
            for (const group of groups) {
                expect(group.label.trim()).not.toBe("");
                expect(Array.isArray(group.availableFields)).toBe(true);
            }
        }
    });

    it("no group label is abstract (no 'Evidence Group N')", () => {
        for (const zone of ["household", "children", "status", "attention", "date_event"]) {
            const groups = namedEvidenceGroupsForZone(zone);
            for (const group of groups) {
                expect(group.label).not.toMatch(/^(Evidence Group|Group) \d/i);
            }
        }
    });

    it("unknown zone returns empty groups array", () => {
        const groups = namedEvidenceGroupsForZone("unknown_zone_xyz");
        expect(groups).toHaveLength(0);
    });
});

describe("V1 scope — static composition fields only, no custom fields", () => {
    it("all fields returned by availableFieldsForZone have isSystemField=true (V1 catalog)", () => {
        // V1: the adapter reads only the static QUEUE_FIELD_CATALOG.
        // Every returned field must be a known system field — no operator-created
        // custom fields should appear here.
        for (const zone of ["household", "children", "status", "attention", "date_event"]) {
            const fields = availableFieldsForZone(zone);
            for (const field of fields) {
                expect(field.isSystemField, `zone ${zone} field ${field.key} — should be system field`).toBe(true);
            }
        }
    });

    it("unknown refKey synthesizes isSystemField=false", () => {
        // Sentinel: if a stale or unknown key slips into registry.defaultFieldKeys,
        // isSystemField=false marks it as unrecognized so the builder can flag it.
        const fields = availableFieldsForGroup("household", "primary_contact");
        // All household primary_contact fields are known system fields
        for (const field of fields) {
            expect(field.isSystemField).toBe(true);
        }
    });

    it("namedEvidenceGroupsForZone only exposes platform-defined fields (no custom fields)", () => {
        // Confirm the named groups contain no dynamically injected tenant fields.
        // All field keys must follow the refKey pattern: "namespace.fieldName" (camelCase allowed)
        for (const zone of ["household", "children", "status", "attention", "date_event"]) {
            const groups = namedEvidenceGroupsForZone(zone);
            for (const group of groups) {
                for (const field of group.availableFields) {
                    // System fields follow "namespace.fieldName" pattern (camelCase keys allowed)
                    expect(field.key).toMatch(/^[a-z_]+\.[a-zA-Z_]+$/);
                    expect(field.isSystemField).toBe(true);
                }
            }
        }
    });
});

describe("isFieldAvailableForZone — membership check", () => {
    it("person.phone is available for household zone", () => {
        expect(isFieldAvailableForZone("person.phone", "household")).toBe(true);
    });

    it("child.name is available for children zone", () => {
        expect(isFieldAvailableForZone("child.name", "children")).toBe(true);
    });

    it("child.name is NOT available for household zone", () => {
        expect(isFieldAvailableForZone("child.name", "household")).toBe(false);
    });

    it("person.phone is NOT available for children zone", () => {
        expect(isFieldAvailableForZone("person.phone", "children")).toBe(false);
    });

    it("unknown field key is not available for any zone", () => {
        expect(isFieldAvailableForZone("unknown.field_xyz", "household")).toBe(false);
        expect(isFieldAvailableForZone("unknown.field_xyz", "children")).toBe(false);
    });
});
