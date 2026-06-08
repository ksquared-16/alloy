import { describe, expect, it } from "vitest";
import {
    personDrawerChildSectionTitle,
} from "@/lib/admin/person/personDrawerChildHeaderContext";
import {
    personDrawerChildLifecycleActionLabel,
    resolvePersonDrawerChildLifecycleAction,
} from "@/lib/admin/person/personDrawerChildLifecycleActions";
import {
    PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
    personDrawerChildChromeActive,
    resolvePersonDrawerProfileFromRecordWithHint,
} from "@/lib/admin/person/personDrawerChildChrome";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import {
    resolveChildLifecycleSlotStates,
} from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { applyPersonDrawerPresentationProfile, suppressEmptyChildDetailFields } from "@/lib/admin/person/personDrawerPresentationProfile";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

const childProfile: PersonDrawerProfileResult = {
    profiles: ["child"],
    display: "child",
    badgeLabels: ["Child"],
};

const childRecord = {
    id: "child-1",
    first_name: "Mia",
    last_name: "Chen",
    date_of_birth: "2021-03-15",
    gender: "Female",
    _enrollment_mirror: [
        {
            id: "ocm-1",
            opportunity_id: "opp-1",
            opportunity_name: "Family inquiry — Chen",
            opportunity_status_label: "Family inquiry",
            program_label: "Preschool",
            location_label: "North Campus",
        },
    ],
    _enrollment_opportunities: [],
};

describe("resolvePersonDrawerChildSummaryModel", () => {
    it("builds primary child summary fields with CRM labels", () => {
        const summary = resolvePersonDrawerChildSummaryModel(childRecord);
        expect(summary.display_name).toBe("Mia Chen");
        expect(summary.dob_label).toBeTruthy();
        expect(summary.age_label).toBeTruthy();
        expect(summary.gender_label).toBe("Female");
        expect(summary.program_label).toBe("Preschool");
        expect(summary.location_label).toBe("North Campus");
        expect(summary.status_label).toBe("Family Lead");
    });
});

describe("personDrawerChildChromeActive", () => {
    it("activates from open seed hint before profile joins hydrate", () => {
        expect(
            personDrawerChildChromeActive(null, {
                presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
                open_source: "opportunity_inquiry_child",
            })
        ).toBe(true);
    });

    it("resolves child profile from presentation hint on seed record", () => {
        const profile = resolvePersonDrawerProfileFromRecordWithHint(
            { id: "child-1", _drawer_presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS },
            null
        );
        expect(profile.profiles).toEqual(["child"]);
    });
});

describe("personDrawerChildSectionTitle", () => {
    it("renames overview sections for child emphasis", () => {
        expect(personDrawerChildSectionTitle("basic_info", "Profile")).toBe("Child details");
        expect(personDrawerChildSectionTitle("relationships", "Relationships")).toBe("Family");
    });
});

describe("lifecycle snapshot actions", () => {
    it("links lead to opportunity and activity to related tab", () => {
        const slots = resolveChildLifecycleSlotStates(childRecord);
        const lead = slots.find((s) => s.key === "lead")!;
        const history = slots.find((s) => s.key === "history")!;
        expect(lead.label).toBe("Family Lead");
        expect(history.label).toBe("Activity");
        const leadAction = resolvePersonDrawerChildLifecycleAction(lead, "opp-1");
        const historyAction = resolvePersonDrawerChildLifecycleAction(history, "opp-1");
        expect(leadAction).toEqual({ kind: "open_opportunity", opportunity_id: "opp-1" });
        expect(personDrawerChildLifecycleActionLabel(lead, leadAction)).toBe("Open family lead");
        expect(historyAction).toEqual({ kind: "tab", tab: "related" });
        expect(personDrawerChildLifecycleActionLabel(history, historyAction)).toBe("Open activity");
    });
});

describe("child details field policy", () => {
    it("hides dob and gender from child details — edited in child summary instead", () => {
        const sections: EntityDrawerSectionConfig[] = [
            {
                key: "basic_info",
                title: "Profile",
                defaultExpanded: true,
                collapsible: true,
                gridCols: 2,
                fields: [
                    { key: "first_name", label: "First name", span: 1 },
                    { key: "date_of_birth", label: "DOB", span: 1 },
                    { key: "gender", label: "Gender", span: 1 },
                    { key: "preferred_name", label: "Preferred", span: 1 },
                ],
            },
        ];
        const out = applyPersonDrawerPresentationProfile(sections, childProfile);
        expect(out[0]?.fields.map((f) => f.key)).toEqual(["preferred_name"]);
        const suppressed = suppressEmptyChildDetailFields(out, { preferred_name: "" });
        expect(suppressed).toEqual([]);
        const withPreferred = suppressEmptyChildDetailFields(out, { preferred_name: "Mimi" });
        expect(withPreferred[0]?.fields.map((f) => f.key)).toEqual(["preferred_name"]);
    });
});
