import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    isPersonDrawerChildSuppressedOverviewSection,
    isPersonDrawerParentSuppressedOverviewSection,
    personDrawerChildOperatingOverviewSections,
    personDrawerParentOperatingOverviewSections,
} from "@/lib/admin/person/personDrawerOperatingOverviewSections";

describe("personDrawerOperatingOverviewSections", () => {
    it("suppresses parent Profile, Contact, Record Info, and Basic by key and title", () => {
        const sections = [
            { key: "basic_info", title: "Profile", fields: [{ key: "first_name", label: "first_name" }] },
            { key: "contact_info", title: "Contact", fields: [{ key: "email", label: "email" }] },
            { key: "record_info", title: "Record Info", fields: [{ key: "created_at", label: "created_at" }] },
            { key: "custom_xyz", title: "Basic", fields: [{ key: "notes", label: "notes" }] },
            { key: "preferred_name", title: "Preferred Name", fields: [{ key: "preferred_name", label: "preferred_name" }] },
            { key: "medical", title: "Medical", fields: [{ key: "allergies", label: "allergies" }] },
        ];
        for (const section of sections.slice(0, 5)) {
            expect(isPersonDrawerParentSuppressedOverviewSection(section)).toBe(true);
        }
        expect(isPersonDrawerParentSuppressedOverviewSection(sections[5]!)).toBe(true);
        expect(personDrawerParentOperatingOverviewSections(sections).map((s) => s.key)).toEqual([]);
    });

    it("suppresses child Child Profile, Basic, Profile, Contact, and Record Info", () => {
        const sections = [
            { key: "child_profile", title: "Child Profile", fields: [{ key: "allergies", label: "allergies" }] },
            { key: "basic_info", title: "Basic", fields: [{ key: "first_name", label: "first_name" }] },
            { key: "profile", title: "Profile", fields: [{ key: "nickname", label: "nickname" }] },
            { key: "contact_info", title: "Contact", fields: [{ key: "email", label: "email" }] },
            { key: "record_info", title: "Record Info", fields: [{ key: "id", label: "id" }] },
            { key: "medical", title: "Medical", fields: [{ key: "medical_notes", label: "medical_notes" }] },
        ];
        for (const section of sections.slice(0, 5)) {
            expect(isPersonDrawerChildSuppressedOverviewSection(section)).toBe(true);
        }
        expect(personDrawerChildOperatingOverviewSections(sections).map((s) => s.key)).toEqual(["medical"]);
    });
});
