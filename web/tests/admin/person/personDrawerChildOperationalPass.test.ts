import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY,
    PERSON_DRAWER_CHILD_START_DATE_KEY,
} from "@/lib/admin/person/personDrawerChildLifecycleFields";
import { personDrawerGenderSelectOptions } from "@/lib/admin/person/personDrawerGenderField";

describe("child drawer operational pass", () => {
    it("StatusesClient auto-generates status_key from label with advanced override", () => {
        const src = readFileSync(
            join(process.cwd(), "app/admin/system/statuses/StatusesClient.tsx"),
            "utf8"
        );
        expect(src).toContain("uniqueStatusKey");
        expect(src).toContain("modalAdvancedKey");
        expect(src).toContain("Status key will be");
    });

    it("child header status dropdown matches opportunity title rail pattern", () => {
        const src = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(src).toContain("personDrawerChildHeaderStatus");
        expect(src).toContain("data-person-drawer-child-header-status");
        expect(src).toContain('aria-label="Child status"');
        expect(src).toContain("rounded-full border border-alloy-stone/30");
        expect(src).not.toMatch(
            /personChildLifecycleChrome[\s\S]{0,400}opportunity_status_key[\s\S]{0,120}personDrawerChildHeaderStatus/
        );
    });

    it("gender always renders as select in child summary", () => {
        const summary = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildSummary.tsx"),
            "utf8"
        );
        expect(summary).toContain('data-person-drawer-gender-select="true"');
        expect(summary).not.toContain("personDrawerGenderDisplayLabel");
        expect(summary).toMatch(/Gender[\s\S]{0,240}<select/);

        const options = personDrawerGenderSelectOptions({});
        expect(options.length).toBeGreaterThan(0);
        expect(options.some((o) => o.label === "Female")).toBe(true);
    });

    it("enrollment_date and start_date render in child summary", () => {
        const summary = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildSummary.tsx"),
            "utf8"
        );
        expect(summary).toContain("PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY");
        expect(summary).toContain("PERSON_DRAWER_CHILD_START_DATE_KEY");
        expect(summary).toContain("Enrollment date");
        expect(summary).toContain("Start date");
        expect(PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY).toBe("enrollment_date");
        expect(PERSON_DRAWER_CHILD_START_DATE_KEY).toBe("start_date");
    });

    it("BOS panel renders in child summary", () => {
        const summary = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildSummary.tsx"),
            "utf8"
        );
        expect(summary).toContain("PersonDrawerChildSummaryBosPanel");
        const bos = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildSummaryBosPanel.tsx"),
            "utf8"
        );
        expect(bos).toContain('data-person-drawer-child-bos="true"');
        expect(bos).toContain("No urgent action flagged");
    });

    it("header lead pill uses Lead label — not child status text", () => {
        const executive = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildHeaderExecutive.tsx"),
            "utf8"
        );
        expect(executive).toContain("personDrawerChildLeadPillLabel");
        expect(executive).not.toContain("Family Lead:");
        expect(executive).not.toContain("Enrollment Tour Scheduled");
        expect(executive).not.toContain('aria-label="Enrollment"');
    });

    it("family section uses shared household projection on operating surface", () => {
        const src = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerHouseholdSection.tsx"),
            "utf8"
        );
        expect(src).toContain("resolvePersonDrawerHouseholdModel");
        expect(src).toContain("data-person-drawer-household");
        expect(src).toContain("data-person-drawer-household-child-link");
    });

    it("opportunity lifecycle rail uses work-unit queue with enrollment fallback", () => {
        const src = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(src).toContain("resolveOpportunityDrawerQueueDefinition");
        expect(src).toMatch(
            /allowEnrollmentFallback:\s*isOpportunityRecordModalTarget/
        );
        expect(src).not.toMatch(
            /drawerPostTabStrip[\s\S]{0,180}opportunityInquiryWorkflowDrawer[\s\S]{0,80}opportunityDrawerLifecycleRail/
        );
    });

    it("seeds person child lifecycle statuses and date fields", () => {
        const migration = readFileSync(
            join(process.cwd(), "../supabase/migrations/20260530120000_person_child_lifecycle_statuses_and_dates.sql"),
            "utf8"
        );
        expect(migration).toContain("'persons'");
        expect(migration).toContain("'future_start'");
        expect(migration).toContain("'enrollment_date'");
        expect(migration).toContain("'start_date'");
    });
});
