/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { resolveQueueRowWarmTarget } from "@/lib/presentation/runtime/queueRowWarmTarget";
import type { QueueRowModel } from "@/lib/presentation/runtime/types";

/**
 * A child-grain queue row must not warm an OPPORTUNITY view model with its own id.
 *
 * `QueueRowModel.entityType` stays `"opportunity"` for Enrollment rows including child-grain
 * subjects — that is documented doctrine, and the canonical child discriminator is
 * `context.row_subject.subject_type`. The warm resolver only checked `entityType`, so on a
 * child-grain view it fell back to `row.entityId`, which is a PARTICIPATION id.
 *
 * Observed on Firefly's Waitlist view (rowGrain child, two real children):
 *   GET /api/admin/view-models/drawer/opportunity/93722453-… → 404
 * fired from the row's hover/focus/pointer-down warm.
 */
const scope = { departmentId: "dept-1", workUnitId: "wu-1", workViewId: "new_work_view_4" };

const row = (context: unknown): QueueRowModel =>
    ({ id: "r1", entityId: "participation-1", entityType: "opportunity", context } as unknown as QueueRowModel);

describe("queue row warm target — child subjects", () => {
    it("does NOT warm an opportunity VM for a child row with no case anchor", () => {
        expect(resolveQueueRowWarmTarget(row({ row_subject: { subject_type: "child" } }), scope)).toBeNull();
    });

    it("does not warm for a candidate subject either", () => {
        expect(resolveQueueRowWarmTarget(row({ row_subject: { subject_type: "candidate" } }), scope)).toBeNull();
    });

    it("DOES warm the anchored case opportunity when the child row carries one", () => {
        const t = resolveQueueRowWarmTarget(
            row({ row_subject: { subject_type: "child", display_name: "Lennon Kurzman" }, drawer_open: { entity_id: "opp-9" } }),
            scope,
        );
        expect(t?.id).toBe("opp-9");
    });

    it("family rows are unchanged — they still warm their own entity id", () => {
        const t = resolveQueueRowWarmTarget(row({ row_subject: { subject_type: "opportunity", display_name: "Kurzman Family" } }), scope);
        expect(t?.id).toBe("participation-1");
    });

    it("a row with no subject context is unchanged", () => {
        expect(resolveQueueRowWarmTarget(row(undefined), scope)?.id).toBe("participation-1");
    });
});
