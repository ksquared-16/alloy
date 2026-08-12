import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { formatPhoneUS, formatPhoneUSForEdit } from "@/lib/adminFormatters";
import { applyHouseholdPrimaryContactToRecord } from "@/lib/admin/person/applyHouseholdPrimaryContactToRecord";
import {
    resolvePersonDrawerHouseholdModel,
    resolveViewingPersonGuardianForCustomer,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import { parentSummaryDraftFromRecord } from "@/lib/admin/person/personDrawerSummaryDraft";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

const householdRecord = {
    id: "kevin-1",
    first_name: "Kevin",
    last_name: "Mitchell",
    _household_context: [{ customer_id: "cust-1", customer_name: "Mitchell" }],
    _household_adult_links: [
        {
            person_id: "kevin-1",
            customer_id: "cust-1",
            display_name: "Kevin Mitchell",
            role_type: "parent",
            is_primary: false,
            is_household_primary_contact: false,
        },
        {
            person_id: "kelly-1",
            customer_id: "cust-1",
            display_name: "Kelly Mitchell",
            role_type: "guardian",
            is_primary: true,
            is_household_primary_contact: true,
        },
    ],
    _household_child_links: [
        {
            customer_member_id: "m-mia",
            customer_id: "cust-1",
            person_id: "mia-1",
            display_name: "Mia Mitchell",
        },
    ],
    _enrollment_mirror: [],
};

describe("layout config audit sprint", () => {
    describe("parent drawer primary contact control", () => {
        it("resolves viewing parent guardian membership even when excluded from guardians column", () => {
            const viewing = resolveViewingPersonGuardianForCustomer(householdRecord, "cust-1", "kevin-1");
            expect(viewing?.person_id).toBe("kevin-1");
            expect(viewing?.is_primary).toBe(false);

            const model = resolvePersonDrawerHouseholdModel(householdRecord, { viewing_person_id: "kevin-1" });
            expect(model.groups[0]?.guardians.map((g) => g.person_id)).toEqual(["kelly-1"]);
        });

        it("changing primary from parent drawer updates household relationship optimistically", () => {
            const next = applyHouseholdPrimaryContactToRecord(householdRecord, "cust-1", "kevin-1");
            const kevin = (next._household_adult_links as { person_id: string; is_household_primary_contact: boolean }[]).find(
                (l) => l.person_id === "kevin-1"
            );
            const kelly = (next._household_adult_links as { person_id: string; is_household_primary_contact: boolean }[]).find(
                (l) => l.person_id === "kelly-1"
            );
            expect(kevin?.is_household_primary_contact).toBe(true);
            expect(kelly?.is_household_primary_contact).toBe(false);

            const viewingAfter = resolveViewingPersonGuardianForCustomer(next, "cust-1", "kevin-1");
            expect(viewingAfter?.is_primary).toBe(true);
        });
    });

    describe("phone formatting", () => {
        it("formats E.164 for edit fields and display", () => {
            expect(formatPhoneUS("+14444444444")).toBe("(444) 444-4444");
            expect(formatPhoneUSForEdit("+14444444444")).toBe("(444) 444-4444");
            expect(formatPhoneUSForEdit("")).toBe("");
        });

        it("parent summary draft normalizes stored phone for edit", () => {
            const draft = parentSummaryDraftFromRecord({ id: "p1", phone: "+15551234567" });
            expect(draft.phone).toBe("(555) 123-4567");
        });
    });

    describe("audit documentation", () => {
        it("documents audit + hardening scope and deferred Supabase migration work", () => {
            const doc = readFileSync(
                join(root, "..", "docs/sprints/archive/05_2026/layout_config_audit_hardening_sprint.md"),
                "utf8"
            );
            expect(doc).toContain("Audit + Hardening Pass");
            expect(doc).toContain("What this sprint was NOT");
            expect(doc).toContain("Person drawer layout runtime");
            expect(doc).toContain("Supabase migration work");
            expect(doc).toContain("Required Fields");
        });
    });
});
