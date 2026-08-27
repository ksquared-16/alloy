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

    /*
     * This guard used to read `app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`.
     * That route was DELETED in a route move, so the guard threw ENOENT and certified nothing while the
     * Work Unit surface quietly stopped consuming the refresh policy altogether. Repointed at the
     * runtime that actually owns the subscription today; the behavioural contract lives in
     * `tests/runtime/workUnitConvergenceContract.test.ts`.
     */
    it("the current work-unit runtime consumes the queue refresh policy", () => {
        const runtime = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
        expect(runtime).toContain("subscribeWorkUnitConvergence");
        // Rows converge by re-preparing the committed answer; summaries by the totals refresh token.
        expect(runtime).toContain("provisioningKey");
        expect(runtime).toContain("setSettlementRefreshToken");
    });
});
