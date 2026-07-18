import { describe, it, expect } from "vitest";
import { resolveQueueRowVariant } from "@/lib/presentation/runtime/resolveQueueRowVariant";
import type { QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";

/**
 * P2-D — Queue row-variant applicability certification.
 *
 * The queue-LEVEL variant selection is certified through `resolveSurfaceVariant`
 * (see resolveSurfaceVariant.test.ts / headerVariantApplicability.test.ts). This file certifies the
 * per-ROW variant resolution (`resolveQueueRowVariant`): priority precedence, Work-View match,
 * deterministic fallback, order independence, and no-stale after Work-View movement.
 */

let n = 0;
const variant = (over: Partial<QueueRowVariant> = {}): QueueRowVariant => ({
    id: `V${++n}`,
    label: "v",
    priority: 100,
    appliesWhen: undefined,
    columns: [],
    ...over,
});

describe("P2-D Queue row-variant applicability", () => {
    it("no variants → null (caller renders the queue-level default)", () => {
        expect(resolveQueueRowVariant(undefined, { workViewId: "new_leads" })).toBeNull();
        expect(resolveQueueRowVariant([], { workViewId: "new_leads" })).toBeNull();
    });

    it("no matching variant → null (deterministic fallback to default)", () => {
        const v = variant({ appliesWhen: { work_view_id: ["all_leads"] } });
        expect(resolveQueueRowVariant([v], { workViewId: "new_leads" })).toBeNull();
    });

    it("Work View match: a New-Leads-scoped variant applies for that view", () => {
        const v = variant({ id: "V_nl", appliesWhen: { work_view_id: ["new_leads"] } });
        expect(resolveQueueRowVariant([v], { workViewId: "new_leads" })?.id).toBe("V_nl");
    });

    it("priority precedence: the lowest-priority matching variant wins (evaluated first)", () => {
        const low = variant({ id: "LOW", priority: 1, appliesWhen: { work_view_id: ["new_leads"] } });
        const high = variant({ id: "HIGH", priority: 9, appliesWhen: { work_view_id: ["new_leads"] } });
        expect(resolveQueueRowVariant([high, low], { workViewId: "new_leads" })?.id).toBe("LOW");
    });

    it("stage + status precedence: a more-specific rule that matches is honored by priority", () => {
        const stageOnly = variant({ id: "STAGE", priority: 5, appliesWhen: { stage_key: ["lead"] } });
        const stageStatus = variant({ id: "STAGE_STATUS", priority: 1, appliesWhen: { stage_key: ["lead"], status_key: ["open"] } });
        expect(resolveQueueRowVariant([stageOnly, stageStatus], { stageKey: "lead", statusKey: "open" })?.id).toBe("STAGE_STATUS");
    });

    it("order independence: result does not depend on the variants array order", () => {
        const a = variant({ id: "A", priority: 2, appliesWhen: { work_view_id: ["new_leads"] } });
        const b = variant({ id: "B", priority: 1, appliesWhen: { work_view_id: ["new_leads"] } });
        expect(resolveQueueRowVariant([a, b], { workViewId: "new_leads" })?.id).toBe("B");
        expect(resolveQueueRowVariant([b, a], { workViewId: "new_leads" })?.id).toBe("B");
    });

    it("no stale row variant after Work View movement (pure — no memory)", () => {
        const nl = variant({ id: "NL", priority: 1, appliesWhen: { work_view_id: ["new_leads"] } });
        const al = variant({ id: "AL", priority: 1, appliesWhen: { work_view_id: ["all_leads"] } });
        const set = [nl, al];
        expect(resolveQueueRowVariant(set, { workViewId: "new_leads" })?.id).toBe("NL");
        expect(resolveQueueRowVariant(set, { workViewId: "all_leads" })?.id).toBe("AL");
        expect(resolveQueueRowVariant(set, { workViewId: "new_leads" })?.id).toBe("NL");
        // A view with no scoped variant falls back to null (→ default), never the prior view's variant.
        expect(resolveQueueRowVariant(set, { workViewId: "registration" })).toBeNull();
    });
});
