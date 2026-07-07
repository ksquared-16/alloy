/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    FIELD_SURFACE_LABELS,
    layoutRefKeyForFieldDefinition,
    resolveFieldSurfaceAvailability,
    syntheticChildProfileFieldRows,
} from "@/lib/fields/fieldSurfaceAvailability";
import { CUSTOMER_MEMBER_ENTITY_TYPE } from "@/lib/fields/customerMemberFieldRegistry";
import {
    FIELDS_CUSTOM_FIELD_SURFACE_NOTE,
    FIELDS_SURFACE_AVAILABILITY_INTRO,
} from "@/lib/fields/fieldSettingsOperatorUi";

describe("fieldSurfaceAvailability", () => {
    it("exports operator intro copy for Fields settings", () => {
        expect(FIELDS_SURFACE_AVAILABILITY_INTRO).toMatch(/runtime resolvers/i);
        expect(FIELDS_CUSTOM_FIELD_SURFACE_NOTE).toMatch(/not immediately available/i);
    });

    it("returns five surface availability badges per field", () => {
        const badges = resolveFieldSurfaceAvailability("person", {
            field_key: "phone",
            is_visible_in_form: true,
            is_visible_in_drawer: true,
            is_visible_in_table: false,
        });
        expect(badges).toHaveLength(5);
        expect(badges.map((badge) => badge.surface)).toEqual([
            "forms",
            "drawers",
            "tables",
            "queue_rows",
            "focus_panel",
        ]);
        expect(badges.map((badge) => badge.label)).toEqual(Object.values(FIELD_SURFACE_LABELS));
    });

    it("maps customer_member gender to child.gender layout ref", () => {
        expect(layoutRefKeyForFieldDefinition(CUSTOMER_MEMBER_ENTITY_TYPE, "gender")).toBe("child.gender");
    });

    it("gender shows Forms, Drawers, and Queue Rows available on child profile manifest", () => {
        const genderRow = syntheticChildProfileFieldRows().find((row) => row.field_key === "gender");
        expect(genderRow).toBeDefined();

        const badges = resolveFieldSurfaceAvailability(CUSTOMER_MEMBER_ENTITY_TYPE, genderRow!);
        expect(badges.find((badge) => badge.surface === "forms")?.status).toBe("available");
        expect(badges.find((badge) => badge.surface === "drawers")?.status).toBe("available");
        expect(badges.find((badge) => badge.surface === "queue_rows")?.status).toBe("available");
        expect(badges.find((badge) => badge.surface === "queue_rows")?.reason).toMatch(/Children collection/i);
    });

    it("custom registry field without queue row resolver shows queue_rows unavailable", () => {
        const badges = resolveFieldSurfaceAvailability("customer", {
            field_key: "custom_notes",
            is_visible_in_form: true,
            is_visible_in_drawer: true,
            is_visible_in_table: true,
        });
        expect(badges.find((badge) => badge.surface === "queue_rows")?.status).toBe("unavailable");
    });
});
