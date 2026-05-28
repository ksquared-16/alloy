import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("inquiry child placement save refreshes waitlist queue", () => {
    it("dispatches adminv2:opportunity-updated when placement scope fields change", () => {
        const src = read("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(src).toContain("adminv2:opportunity-updated");
        expect(src).toContain("affects_waitlist: true");
        expect(src).toContain("location_id");
        expect(src).toContain("program_room_cohort_key");
    });

    it("work-unit page listens for opportunity-updated and busts queue cache", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain('"adminv2:opportunity-updated"');
        expect(page).toContain("deleteQueueRowCacheKeysForWorkUnit");
        expect(page).toContain("fetchQueueSummaries");
    });
});
