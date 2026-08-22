/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveQueueRowOpportunityId } from "@/lib/presentation/runtime/queueRowWarmTarget";
import type { QueueRowModel } from "@/lib/presentation/runtime/types";

/**
 * R3 — an opportunity view model may only be warmed with an OPPORTUNITY id.
 *
 * `prewarmRecordWork` builds `GET /api/admin/view-models/drawer/opportunity/<id>`. Handing it a
 * queue row's own `entityId` on a child-grain view hands it a PARTICIPATION id, and the request can
 * only 404. Measured on Firefly, one Waitlist journey produced **18** such 404s across 7 distinct
 * ids — every one of them a row id that resolves on no drawer endpoint, while the row's
 * `context.drawer_open.entity_id` (the case) resolves 200.
 *
 * ── WHY THIS GUARD IS NOT JUST THE RESOLVER'S TRUTH TABLE ──
 *
 * The rule was already correct and already tested (`queueRowWarmChildSubject.test.ts`). It lived
 * inside `resolveQueueRowWarmTarget`, and the two call sites that produced the 404s never called
 * it — they re-derived eligibility from `row.entityType === "opportunity"`, which is TRUE for every
 * Enrollment row including child-grain ones. A rule nothing consults is not a rule, so this asserts
 * the WIRING as well as the truth.
 */

const ROOT = join(process.cwd(), "lib", "presentation", "runtime");
const workUnitRuntime = readFileSync(join(ROOT, "useCommittedWorkUnitSurfaceRuntime.ts"), "utf8");
const workspaceRuntime = readFileSync(join(ROOT, "useWorkspaceSurfaceRuntime.ts"), "utf8");

const row = (over: Partial<Record<string, unknown>>, context: unknown): QueueRowModel =>
    ({ id: "r1", entityId: "participation-1", entityType: "opportunity", context, ...over } as unknown as QueueRowModel);

describe("the opportunity VM warm refuses a non-opportunity identity", () => {
    it("a child row with no case anchor has no opportunity to warm", () => {
        expect(resolveQueueRowOpportunityId(row({}, { row_subject: { subject_type: "child" } }))).toBeNull();
    });

    it("a candidate row with no case anchor has none either", () => {
        expect(resolveQueueRowOpportunityId(row({}, { row_subject: { subject_type: "candidate" } }))).toBeNull();
    });

    it("a child row anchored to its case warms THE CASE, never the row id", () => {
        const resolved = resolveQueueRowOpportunityId(
            row({}, { row_subject: { subject_type: "child" }, drawer_open: { entity_id: "case-1" } }),
        );
        expect(resolved).toBe("case-1");
        expect(resolved).not.toBe("participation-1");
    });

    it("a plain opportunity row still warms its own id — valid preparation is preserved", () => {
        expect(resolveQueueRowOpportunityId(row({ entityId: "opp-1" }, { row_subject: { subject_type: "case" } }))).toBe(
            "opp-1",
        );
    });

    it("a non-opportunity row warms nothing", () => {
        expect(resolveQueueRowOpportunityId(row({ entityType: "job" }, {}))).toBeNull();
    });
});

describe("the call sites consume the rule instead of re-deriving it", () => {
    it("the hover/focus intent resolves the opportunity from the canonical rule", () => {
        expect(workUnitRuntime).toContain("resolveQueueRowOpportunityId(row)");
    });

    it("the neighbour window resolves it the same way", () => {
        expect(workUnitRuntime).toContain("resolveQueueRowOpportunityId(r)");
    });

    it("no WARM path still gates on entityType and then passes the row id", () => {
        /*
         * The discredited guard: `entityType` is `"opportunity"` for every child-grain Enrollment
         * row, so it admits the row and the participation id goes to the opportunity endpoint.
         *
         * Scoped to the WARM paths on purpose. `visibleOpportunityIds` reads the same field for the
         * convergence subscription, where the row id is exactly the right thing to compare against —
         * queue mutation events carry row ids. Forbidding the field outright would have "fixed"
         * correct convergence code to satisfy a prefetch rule.
         */
        expect(workUnitRuntime).not.toContain('row.entityType !== "opportunity" || row.entityId == null');
        expect(workUnitRuntime).not.toContain("neighbours.push(String(r.entityId))");
    });

    it("the subject warm takes an explicit opportunity and never defaults it from the subject", () => {
        expect(workUnitRuntime).toContain("opportunityId: string | null");
        // The VM warm must be reached through the explicit opportunity, not the subject id.
        expect(workUnitRuntime).toContain("if (opportunity) void prewarmRecordWork(opportunity)");
        expect(workUnitRuntime).not.toContain("void prewarmRecordWork(id);");
    });

    it("provisioning preparation is NOT gated by the opportunity — it takes any subject grain", () => {
        expect(workUnitRuntime).toContain(
            "void prefetchWorkUnitProvisioning(target, { lens: lens ?? null, subject: id });",
        );
    });

    it("the workspace idle chain asks the answer for its subject grain", () => {
        expect(workspaceRuntime).toContain("answer.subjectGrain?.subjectType");
        expect(workspaceRuntime).toContain('subjectType !== "opportunity"');
        expect(workspaceRuntime).not.toContain(
            "if (answer && answer.terminal === \"operational\" && answer.recordOfAttention?.id) {\n                    void prewarmRecordWork(",
        );
    });
});
