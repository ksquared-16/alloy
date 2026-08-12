import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    applyPersonIdentityPatchToOpportunityHost,
    applyPersonIdentityPatchToPersonRecord,
    applyPersonPatchToOpportunityInquiryChildren,
} from "@/lib/admin/person/applyPersonPatchToOpportunityInquiryChildren";
import { buildPersonIdentityPatch } from "@/lib/admin/drawer/inquiryChildFieldEdit";
import { dispatchPersonRecordUpdated } from "@/lib/admin/person/dispatchPersonRecordUpdated";
import { personDrawerChildAgeLabel } from "@/lib/admin/person/personDrawerChildIdentity";

const webRoot = join(__dirname, "..", "..", "..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("person drawer ↔ opportunity person identity sync", () => {
    it("buildPersonIdentityPatch maps inquiry DOB to person date_of_birth", () => {
        const patch = buildPersonIdentityPatch(
            { first_name: "A", last_name: "B", dob: "2019-06-01" },
            { first_name: "A", last_name: "B", dob: "2018-01-01" }
        );
        expect(patch.date_of_birth).toBe("2019-06-01");
        expect(patch).not.toHaveProperty("dob");
    });

    it("applyPersonIdentityPatchToOpportunityHost patches inquiry child and primary person mirrors", () => {
        const host = {
            _primary_person_id: "p1",
            _primary_person_name: "Old Name",
            _primary_person_email: "old@example.com",
            _primary_person_phone: "5551112222",
            _opportunity_persons: [{ person_id: "p1", name: "Old Name", email: "old@example.com", phone: "5551112222" }],
            _inquiry_children: [
                { person_id: "p1", first_name: "Sam", last_name: "Lee", dob: "2018-01-01", age: "8y" },
            ],
        };
        const next = applyPersonIdentityPatchToOpportunityHost(
            host,
            "p1",
            { email: "new@example.com", phone: "(555) 999-0000" },
            { first_name: "Sam", last_name: "Lee", email: "new@example.com", phone: "(555) 999-0000" }
        );
        expect(next._primary_person_email).toBe("new@example.com");
        expect((next._opportunity_persons as { email?: string }[])[0]?.email).toBe("new@example.com");
    });

    it("applyPersonPatchToOpportunityInquiryChildren updates matching child row DOB and age", () => {
        const host = {
            _inquiry_children: [
                {
                    person_id: "p1",
                    first_name: "Sam",
                    last_name: "Lee",
                    dob: "2018-01-01",
                    age: "8y",
                },
                { person_id: "p2", dob: "2020-01-01", age: "6y" },
            ],
        };
        const next = applyPersonPatchToOpportunityInquiryChildren(
            host,
            "p1",
            { date_of_birth: "2019-06-01" },
            { first_name: "Sam", last_name: "Lee", date_of_birth: "2019-06-01" }
        );
        const row = (next._inquiry_children as { dob?: string; age?: string }[])[0];
        expect(row.dob).toBe("2019-06-01");
        expect(row.age).toBeTruthy();
        expect((next._inquiry_children as { dob?: string }[])[1].dob).toBe("2020-01-01");
    });

    it("applyPersonIdentityPatchToPersonRecord merges DOB for open person drawer", () => {
        const merged = applyPersonIdentityPatchToPersonRecord(
            { id: "p1", first_name: "Sam" },
            { date_of_birth: "2019-06-01" }
        );
        expect(merged.date_of_birth).toBe("2019-06-01");
        expect(merged.dob).toBe("2019-06-01");
        expect(personDrawerChildAgeLabel(merged)).toBeTruthy();
    });

    it("dispatchPersonRecordUpdated dispatches admin-entity-saved and queue row patch", () => {
        const src = read("lib/admin/person/dispatchPersonRecordUpdated.ts");
        expect(src).toContain('type: "persons"');
        expect(src).toContain("admin-entity-saved");
        expect(src).toContain("opportunity_id");
        expect(src).toContain("buildQueueRowDisplayPatchFromPersonSave");
        expect(src).toContain("dispatchOpportunityQueueUpdated");
        expect(typeof dispatchPersonRecordUpdated).toBe("function");
    });

    it("inquiry children save dispatches person record updated after person PATCH", () => {
        const section = read("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(section).toContain("patchInquiryChildIdentityFromDrawer");
        expect(section).toContain("dispatchPersonRecordUpdated");
        expect(section).toContain("inquiry_child_identity");
    });

    it("person identity PATCH routes to persons API not OCM", () => {
        const edit = read("lib/admin/drawer/inquiryChildFieldEdit.ts");
        expect(edit).toContain("patchLinkedPersonFromOpportunityDrawer");
        expect(edit).toContain("date_of_birth");
        expect(edit).not.toMatch(/patchOpportunityCustomerMember[\s\S]*date_of_birth/);
    });

    it("uses Alloy unsaved modal instead of window.confirm", () => {
        expect(read("lib/admin/person/personDrawerUnsavedGuard.ts")).not.toContain("window.confirm");
        expect(read("contexts/AdminDrawerContext.tsx")).toContain("PersonDrawerUnsavedChangesModal");
        expect(read("components/admin/entity/PersonDrawerUnsavedChangesModal.tsx")).toContain("Unsaved Changes");
    });

    it("drawer backdrop captures pointer events", () => {
        const drawer = read("components/admin/Drawer.tsx");
        expect(drawer).toContain("adminv2-drawer-backdrop-hit");
        expect(drawer).toContain("pointer-events-auto");
        expect(drawer).toContain("closeOnBackdropMouseDown");
    });

    it("save actions live in drawer header and hide when clean", () => {
        const header = read("components/admin/entity/PersonDrawerOperatingSaveHeaderActions.tsx");
        const shared = read("components/admin/entity/DrawerHeaderRecordSaveActions.tsx");
        expect(shared).toContain("data-person-drawer-save-changes");
        expect(shared).toContain("if (!canMutate || !isDirty) return null");
        expect(shared).toContain("RecordDrawerHeaderActionButton");
        expect(header).toContain("DrawerHeaderRecordSaveActions");
        expect(read("components/admin/AdminEntityDrawer.tsx")).toContain("personDrawerOperatingSaveActive");
    });
});
