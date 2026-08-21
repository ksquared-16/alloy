/**
 * WORK UNIT CONVERGENCE — the subscription contract.
 *
 * The refresh POLICY was already tested. What went wrong is that nothing consumed it: the three
 * decision functions had zero production callers, the Work Unit route registered no listener, and the
 * guard that claimed otherwise read a route file deleted in a route move — so it threw ENOENT and
 * certified nothing. A placement change converged KPIs and the record VM and left the operator's rows
 * stale.
 *
 * These guards therefore assert two different things:
 *   1. the PLAN each canonical event produces (behavioural, no DOM), and
 *   2. that a production consumer exists at all — the failure mode a policy-only test cannot see.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { planWorkUnitConvergence } from "@/lib/presentation/runtime/workUnitConvergencePlan";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const VISIBLE = ["opp-visible-1", "opp-visible-2"];

describe("work unit convergence plan", () => {
    it("a placement membership mutation refreshes rows AND counts", () => {
        // The live defect: the broadcast fired, counts moved, rows did not.
        const plan = planWorkUnitConvergence({
            detail: { action_key: "placement_manual_order" },
            visibleOpportunityIds: VISIBLE,
        });
        expect(plan.refetchRows).toBe(true);
        expect(plan.refreshSummaries).toBe(true);
    });

    it("a child identity rename converges the queue row that displays the name", () => {
        const plan = planWorkUnitConvergence({
            detail: { id: "opp-visible-1", action_key: "inquiry_child_identity" },
            visibleOpportunityIds: VISIBLE,
        });
        expect(plan.refetchRows).toBe(true);
    });

    it("an unrelated person edit on an OFF-SCREEN record refreshes nothing", () => {
        // Independence: a signal that cannot affect this surface must not cost it a request.
        const plan = planWorkUnitConvergence({
            detail: { id: "opp-not-here", action_key: "person_record_updated" },
            visibleOpportunityIds: VISIBLE,
        });
        expect(plan.refetchRows).toBe(false);
        expect(plan.refreshSummaries).toBe(false);
        expect(plan.patchRowsOnly).toBe(false);
    });

    it("a surface that CAN patch a visible row does not refetch it", () => {
        const plan = planWorkUnitConvergence({
            detail: {
                id: "opp-visible-1",
                action_key: "person_record_updated",
                queue_row_patch: { customer_name: "New Name" },
            },
            visibleOpportunityIds: VISIBLE,
            canPatchRows: true,
        });
        expect(plan.patchRowsOnly).toBe(true);
        expect(plan.refetchRows).toBe(false);
        expect(plan.refreshSummaries).toBe(false);
    });

    it("a surface that CANNOT patch refetches rather than leaving the row stale", () => {
        // The committed Work Unit surface composes rows from the provisioning answer and has no
        // in-place patcher. Honouring the patch-eligible "false" would leave the row wrong.
        const plan = planWorkUnitConvergence({
            detail: {
                id: "opp-visible-1",
                action_key: "person_record_updated",
                queue_row_patch: { customer_name: "New Name" },
            },
            visibleOpportunityIds: VISIBLE,
            canPatchRows: false,
        });
        expect(plan.patchRowsOnly).toBe(false);
        expect(plan.refetchRows).toBe(true);
    });

    it("an event with no detail does nothing", () => {
        const plan = planWorkUnitConvergence({ detail: null, visibleOpportunityIds: VISIBLE });
        expect(plan).toEqual({ refetchRows: false, refreshSummaries: false, patchRowsOnly: false });
    });
});

describe("a production consumer exists", () => {
    const runtimePath = "lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts";

    it("the Work Unit runtime subscribes to the canonical mutation bus", () => {
        expect(existsSync(resolve(root, runtimePath))).toBe(true);
        const src = read(runtimePath);
        expect(src).toContain("addEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT");
        expect(src).toContain("planWorkUnitConvergence");
    });

    it("rows converge by re-preparing the committed answer, not by a second row store", () => {
        const src = read(runtimePath);
        expect(src).toContain("provisioning.invalidate(provisioningKey(current))");
        // Subject scope first: a LENS re-commit clears the subject and would deselect the record.
        expect(src).toContain("ATTENTION_SCOPE.SUBJECT");
    });

    it("Work View totals refresh on a Work Unit route, not only on /workspace", () => {
        expect(read(runtimePath)).toContain("setSettlementRefreshToken");
        expect(read("lib/presentation/runtime/useWorkUnitSettlement.ts")).toContain(
            "refreshToken: options?.refreshToken",
        );
    });

    it("the policy functions are consumed by production code, not only by tests", () => {
        const plan = read("lib/presentation/runtime/workUnitConvergencePlan.ts");
        for (const fn of [
            "shouldRefetchWorkUnitQueueRowsForEvent",
            "shouldRefreshQueueSummariesForEvent",
            "shouldPatchWorkUnitQueueRowsForEvent",
        ]) {
            expect(plan).toContain(fn);
        }
        // …and the consumer is reachable from the runtime.
        expect(read(runtimePath)).toContain("./workUnitConvergencePlan");
    });
});

describe("identity mutation emits the convergence signal", () => {
    it("a name change signals the queue; a profile-only save does not", () => {
        const src = read("lib/adminV2/runtime/focusPanel/focusPanelMutation.ts");
        expect(src).toContain('dispatchOpportunityQueueUpdated(opportunityId, "inquiry_child_identity")');
        // The condition is the blast-radius contract: identity only, never every save.
        expect(src).toContain("if (Object.keys(patch.identityPatch).length > 0) {");
    });

    it("the durable-child host converges the same fact the case host does", () => {
        const src = read(
            "lib/adminV2/runtime/focusPanel/durableSubject/buildDurableChildFocusPanelMutation.ts",
        );
        expect(src).toContain('broadcastWorkspaceMutation("inquiry_child_identity")');
        expect(src).toContain("if (Object.keys(patch.identityPatch).length > 0) {");
    });
});

describe("a source-reading guard cannot certify a file that does not exist", () => {
    /*
     * The whole class of failure, guarded generically: a guard that reads a deleted path throws
     * ENOENT and is indistinguishable from "this contract is unprotected" unless someone is watching
     * that suite. Every repo path a guard reads must resolve.
     */
    const GUARD_FILES = [
        "tests/admin/opportunityInquiryChildrenQueueRefresh.test.ts",
        "tests/runtime/workUnitConvergenceContract.test.ts",
    ];

    it("every path passed to read() in these guards exists", () => {
        const missing: string[] = [];
        for (const guard of GUARD_FILES) {
            const src = read(guard);
            for (const m of src.matchAll(/\bread\("([^"]+)"\)/g)) {
                const rel = m[1]!;
                if (!existsSync(resolve(root, rel))) missing.push(`${guard} → ${rel}`);
            }
        }
        expect(missing).toEqual([]);
    });
});
