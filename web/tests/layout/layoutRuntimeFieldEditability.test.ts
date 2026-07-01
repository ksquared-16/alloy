import { describe, expect, it } from "vitest";
import {
    isLayoutRuntimeChildComputedReadOnlyRefKey,
    isLayoutRuntimeChildEditableRefKey,
} from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import {
    isLayoutRuntimeEditableRefKeySupported,
    layoutRuntimeFieldIsEditable,
} from "@/lib/layout/runtime/layoutRuntimeFieldEditability";

describe("layoutRuntimeFieldEditability", () => {
    it("allows role-scoped contact phone/email when editable and production", () => {
        expect(
            layoutRuntimeFieldIsEditable(
                { editable: true, refKey: "person.secondary_phone" },
                "production",
            ),
        ).toBe(true);
        expect(
            layoutRuntimeFieldIsEditable(
                { editable: true, refKey: "person.emergency_contact_email" },
                "production",
            ),
        ).toBe(true);
    });

    it("allows person contact fields when editable and production", () => {
        expect(
            layoutRuntimeFieldIsEditable(
                { editable: true, refKey: "person.primary_phone" },
                "production",
            ),
        ).toBe(true);
    });

    it("allows supported child fields when editable and production", () => {
        expect(isLayoutRuntimeEditableRefKeySupported("child.first_name")).toBe(true);
        expect(
            layoutRuntimeFieldIsEditable(
                { editable: true, refKey: "child.first_name" },
                "production",
            ),
        ).toBe(true);
    });

    it("blocks computed child.full_name even when marked editable", () => {
        expect(isLayoutRuntimeChildComputedReadOnlyRefKey("child.full_name")).toBe(true);
        expect(isLayoutRuntimeChildEditableRefKey("child.full_name")).toBe(false);
        expect(
            layoutRuntimeFieldIsEditable(
                { editable: true, refKey: "child.full_name" },
                "production",
            ),
        ).toBe(false);
    });

    it("allows aliased child enrollment columns when editable and production", () => {
        expect(isLayoutRuntimeEditableRefKeySupported("child.program")).toBe(true);
        expect(
            layoutRuntimeFieldIsEditable({ editable: true, refKey: "child.schedule" }, "production"),
        ).toBe(true);
    });

    it("blocks editable fields when builder editable flag is false", () => {
        expect(
            layoutRuntimeFieldIsEditable({ editable: false, refKey: "opportunity.location_id" }, "production"),
        ).toBe(false);
        expect(
            layoutRuntimeFieldIsEditable({ editable: false, refKey: "child.program" }, "production"),
        ).toBe(false);
    });

    it("blocks editable fields in preview mode", () => {
        expect(
            layoutRuntimeFieldIsEditable(
                { editable: true, refKey: "person.primary_email" },
                "preview",
            ),
        ).toBe(false);
    });
});
