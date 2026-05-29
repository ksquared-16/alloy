import { describe, expect, it } from "vitest";
import { applyPersonDrawerPresentationProfile, personDrawerRelationshipPresentation } from "@/lib/admin/person/personDrawerPresentationProfile";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";

const baseSections = [
    {
        key: "basic_info",
        title: "Profile",
        fields: [
            { key: "first_name" },
            { key: "last_name" },
            { key: "preferred_name" },
        ],
    },
    { key: "contact_info", title: "Contact", fields: [{ key: "email" }, { key: "phone" }] },
    { key: "medical", title: "Medical", fields: [{ key: "allergies" }] },
    { key: "emergency", title: "Emergency", fields: [{ key: "emergency_contact_notes" }] },
    { key: "employee_placement", title: "Employee", fields: [] },
    { key: "record_info", title: "Record", fields: [{ key: "person_number" }] },
    { key: "consent", title: "Consent", fields: [{ key: "sms_consent" }, { key: "notes" }] },
] as Parameters<typeof applyPersonDrawerPresentationProfile>[0];

describe("personDrawerPresentationProfile", () => {
    it("hides contact, employee, medical-adjacent, and record sections for child profiles", () => {
        const profile: PersonDrawerProfileResult = {
            profiles: ["child"],
            display: "child",
            badgeLabels: ["Child"],
        };
        const out = applyPersonDrawerPresentationProfile(baseSections, profile);
        expect(out.map((s) => s.key)).toEqual(["basic_info", "medical"]);
        expect(out[0]?.fields?.map((f) => f.key)).toEqual(["first_name", "last_name", "preferred_name"]);
    });

    it("hides medical and emergency for parent-like profiles and keeps messaging consent toggles", () => {
        const profile: PersonDrawerProfileResult = {
            profiles: ["parent"],
            display: "parent",
            badgeLabels: ["Parent"],
        };
        const out = applyPersonDrawerPresentationProfile(baseSections, profile, { sms_consent: "boolean", notes: "text" });
        expect(out.map((s) => s.key)).not.toContain("contact_info");
        expect(out.map((s) => s.key)).not.toContain("medical");
        expect(out.map((s) => s.key)).not.toContain("emergency");
        const basic = out.find((s) => s.key === "basic_info");
        expect(basic?.fields?.map((f) => f.key)).toEqual([
            "first_name",
            "last_name",
            "preferred_name",
            "email",
            "phone",
        ]);
        expect(basic?.fields?.find((f) => f.key === "phone")?.label).toBe("Mobile");
        const consent = out.find((s) => s.key === "consent");
        expect(consent?.fields?.map((f) => f.key)).toEqual(["sms_consent"]);
        expect(consent?.fields?.[0]?.renderHint).toBe("primary_yes_no");
    });

    it("shows basic info and contact for emergency-contact profiles without medical by default", () => {
        const profile: PersonDrawerProfileResult = {
            profiles: ["emergency_contact"],
            display: "emergency_contact",
            badgeLabels: ["Emergency Contact"],
        };
        const out = applyPersonDrawerPresentationProfile(baseSections, profile);
        expect(out.map((s) => s.key)).toEqual(["basic_info", "contact_info"]);
        expect(out.map((s) => s.key)).not.toContain("medical");
        expect(out.map((s) => s.key)).not.toContain("employee_placement");
    });

    it("unlocks adult identity fields in Profile basic section", () => {
        const profile: PersonDrawerProfileResult = {
            profiles: ["parent"],
            display: "parent",
            badgeLabels: ["Parent"],
        };
        const out = applyPersonDrawerPresentationProfile(baseSections, profile);
        const basic = out.find((s) => s.key === "basic_info");
        expect(basic?.fields?.find((f) => f.key === "first_name")).toMatchObject({ editable: true, locked: false });
        expect(basic?.fields?.find((f) => f.key === "last_name")).toMatchObject({ editable: true, locked: false });
    });

    it("hides sibling group for parent-like relationship presentation", () => {
        const parentProfile: PersonDrawerProfileResult = {
            profiles: ["parent"],
            display: "parent",
            badgeLabels: ["Parent"],
        };
        expect(personDrawerRelationshipPresentation(parentProfile)).toMatchObject({
            hideEmergency: true,
            hideSiblings: true,
        });
        const childProfile: PersonDrawerProfileResult = {
            profiles: ["child"],
            display: "child",
            badgeLabels: ["Child"],
        };
        expect(personDrawerRelationshipPresentation(childProfile).hideSiblings).toBe(false);
    });
});
