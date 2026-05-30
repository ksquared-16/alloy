import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PERSON_DRAWER_CHILD_STATUS_ENTITY_TYPE } from "@/lib/admin/person/personDrawerChildStatusEntityType";
import { personDrawerGenderSelectOptions } from "@/lib/admin/person/personDrawerGenderField";

describe("child drawer cleanup pass", () => {
    it("summary uses 50/50 columns with BOS on the right", () => {
        const summary = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildSummary.tsx"),
            "utf8"
        );
        expect(summary).toContain('data-person-drawer-child-summary-columns="true"');
        expect(summary).toContain("md:grid-cols-2");
        expect(summary).toContain("PersonDrawerChildSummaryBosPanel");
        const bos = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildSummaryBosPanel.tsx"),
            "utf8"
        );
        expect(bos).toContain("INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS");
    });

    it("family section uses ordered hierarchy blocks", () => {
        const src = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerVisibilitySections.tsx"),
            "utf8"
        );
        expect(src).toContain("Parents / guardians");
        expect(src).toContain("Siblings");
        expect(src).toContain("Emergency contacts");
        expect(src).toContain("Other household adults");
        const householdIdx = src.indexOf("Parents / guardians");
        const siblingsIdx = src.indexOf('title="Siblings"');
        const emergencyIdx = src.indexOf("Emergency contacts");
        expect(householdIdx).toBeGreaterThan(-1);
        expect(siblingsIdx).toBeGreaterThan(householdIdx);
        expect(emergencyIdx).toBeGreaterThan(siblingsIdx);
    });

    it("module nav stays in child drawer — no opportunity comms navigation", () => {
        const rail = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildLifecycleRail.tsx"),
            "utf8"
        );
        expect(rail).not.toContain("onOpenOpportunityCommunications");
        expect(rail).not.toContain("openDrawer");
        expect(rail).toContain('onSelectTab("communications")');

        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("PersonDrawerChildCommunicationsPlaceholder");
        expect(drawer).not.toContain("onOpenOpportunityCommunications");
    });

    it("child status dropdown uses persons entity type — not customer_members or opportunity", () => {
        expect(PERSON_DRAWER_CHILD_STATUS_ENTITY_TYPE).toBe("persons");
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("PERSON_DRAWER_CHILD_STATUS_ENTITY_TYPE");
        expect(drawer).toContain("personDrawerChildHeaderStatus");
        const resolve = readFileSync(
            join(process.cwd(), "lib/admin/statusDefinitionsResolve.ts"),
            "utf8"
        );
        expect(resolve).toContain('t === "child" || t === "children") return "persons"');
    });

    it("gender renders as select with configured/fallback options", () => {
        const summary = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildSummary.tsx"),
            "utf8"
        );
        expect(summary).toMatch(/Gender[\s\S]{0,240}<select/);
        expect(personDrawerGenderSelectOptions({}).length).toBeGreaterThan(0);
    });

    it("opportunity lifecycle rail uses adminV2 modal fallback", () => {
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toMatch(
            /allowEnrollmentFallback:\s*isOpportunityRecordModalTarget/
        );
    });

    it("documents demo reseed plan is documented — no reseed scripts changed", () => {
        const doctrine = readFileSync(
            join(process.cwd(), "../docs/sprints/05_2026/child_profile_person_drawer_doctrine.md"),
            "utf8"
        );
        expect(doctrine).toContain("Demo seed plan");
        expect(doctrine).toContain("Do not reseed");
    });
});
