import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatPhoneUS } from "@/lib/adminFormatters";
import { personDrawerOpenSeedFromGlobalSearchHit } from "@/lib/admin/globalSearch/personDrawerOpenSeedFromGlobalSearchHit";
import { resolveGlobalSearchOpenFromHit } from "@/lib/admin/globalSearch/globalRecordSearchOpenResolution";
import {
    buildChildSummaryPatch,
    childSummaryDraftIsDirty,
    parentSummaryDraftIsDirty,
} from "@/lib/admin/person/personDrawerSummaryDraft";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { confirmDiscardPersonDrawerUnsavedLegacy } from "@/lib/admin/person/personDrawerUnsavedGuard";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

describe("person drawer hardening phase 2", () => {
    it("global search open resolves person seeds for parents and children", () => {
        const parent = resolveGlobalSearchOpenFromHit({
            entity_type: "persons",
            entity_id: "p1",
            group: "parents",
            name: "Jordan Chen",
            type_label: "Parent",
            household_name: "Chen",
            opportunity_name: null,
            lead_short_label: null,
            status_label: null,
            location_label: null,
            person_id: "p1",
        });
        expect(parent.detail?.personDrawerOpenSeed?.presentation_emphasis).toBe(
            PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS
        );

        const child = resolveGlobalSearchOpenFromHit({
            entity_type: "persons",
            entity_id: "c1",
            group: "children",
            name: "Mia Chen",
            type_label: "Child",
            household_name: "Chen",
            opportunity_name: "Lead",
            lead_short_label: "Chen",
            status_label: null,
            location_label: "North",
            person_id: "c1",
        });
        expect(child.detail?.personDrawerOpenSeed?.presentation_emphasis).toBe(
            PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS
        );
    });

    it("AdminEntityDrawer recognizes global_search chrome hints", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("GLOBAL_SEARCH_DRAWER_OPEN_SOURCE");
        expect(drawer).toContain("PersonDrawerOperatingActivityTab");
    });

    it("parent and child summaries defer save to drawer-level footer", () => {
        expect(read("components/admin/entity/PersonDrawerParentSummary.tsx")).toContain(
            "registerPersonDrawerEditSection"
        );
        expect(read("components/admin/entity/PersonDrawerParentSummary.tsx")).not.toContain("onBlur");
        expect(read("components/admin/entity/PersonDrawerChildSummary.tsx")).toContain(
            "registerPersonDrawerEditSection"
        );
        expect(read("components/admin/entity/PersonDrawerChildSummary.tsx")).not.toContain("onBlur");
        expect(read("components/admin/AdminEntityDrawer.tsx")).toContain("PersonDrawerOperatingSaveHeaderActions");
    });

    it("summary draft detects dirty state and builds patch on save only", () => {
        const record = { id: "p1", first_name: "A", last_name: "B", email: "", phone: "" };
        expect(
            parentSummaryDraftIsDirty(record, {
                first_name: "A",
                last_name: "B",
                email: "x@example.com",
                phone: "",
                preferred_contact_method: "",
                communication_opt_out: false,
            })
        ).toBe(true);
        expect(
            buildChildSummaryPatch(
                { id: "c1", first_name: "Mia", date_of_birth: "2020-01-01" },
                {
                    first_name: "Mia",
                    last_name: "",
                    date_of_birth: "2020-01-02",
                    gender: "",
                    enrollment_date: "",
                    start_date: "",
                }
            )
        ).toEqual({ date_of_birth: "2020-01-02" });
        expect(
            childSummaryDraftIsDirty(
                { id: "c1", date_of_birth: "2020-01-01" },
                {
                    first_name: "",
                    last_name: "",
                    date_of_birth: "2020-01-01",
                    gender: "",
                    enrollment_date: "",
                    start_date: "",
                }
            )
        ).toBe(false);
    });

    it("formats US phones as (XXX) XXX-XXXX", () => {
        expect(formatPhoneUS("4444444444")).toBe("(444) 444-4444");
    });

    it("household grid keeps paired guardian and children columns", () => {
        const section = read("components/admin/entity/PersonDrawerHouseholdSection.tsx");
        expect(section).toContain('data-person-drawer-household-columns="paired"');
        expect(section).toContain('<HouseholdColumn title="Guardians">');
        expect(section).toContain('<HouseholdColumn title="Children">');
    });

    it("employee status has no doctrine explanatory copy", () => {
        const placement = read("components/admin/entity/PersonEmployeePlacementSection.tsx");
        expect(placement).toContain("compactOperatingSurface");
        expect(placement).not.toContain("generic identity profiles");
        expect(placement).not.toContain("waitlist employee-family priority");
        expect(placement).not.toContain("opportunity child section");
        expect(read("components/admin/AdminEntityDrawer.tsx")).toContain("compactOperatingSurface");
    });

    it("parent summary does not render redundant On file phone copy", () => {
        const summary = read("components/admin/entity/PersonDrawerParentSummary.tsx");
        expect(summary).not.toContain("On file:");
        expect(summary).not.toContain("data-person-drawer-phone-formatted");
    });

    it("drawer context guards navigation when summary is dirty", () => {
        expect(read("contexts/AdminDrawerContext.tsx")).toContain("confirmDiscardPersonDrawerUnsaved");
        expect(read("contexts/AdminDrawerContext.tsx")).toContain("PersonDrawerUnsavedChangesModal");
        expect(typeof confirmDiscardPersonDrawerUnsavedLegacy()).toBe("boolean");
    });
});
