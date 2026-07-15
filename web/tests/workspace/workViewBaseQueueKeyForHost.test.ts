import { describe, expect, it, vi } from "vitest";

import { workViewBaseQueueKeyForHost } from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

/**
 * The grouped-totals fan-out resolver must obey the SAME canonical contract as the runtime resolver:
 * never emit a queue key absent from the target host's definition (deployed: lifecycle_qualification /
 * pipeline_total 404s came from a stale key reaching the totals fan-out).
 */
describe("workViewBaseQueueKeyForHost — no stale/absent key reaches the server", () => {
    const def = RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2;

    it("uses the bound compat lane when present on the host definition", () => {
        expect(workViewBaseQueueKeyForHost({ compat_queue_key: "new_leads" }, def)).toBe("new_leads");
    });

    it("degrades a STALE compat lane not on the host to the all-records lane (never emits it)", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(workViewBaseQueueKeyForHost({ compat_queue_key: "lifecycle_qualification" }, def)).toBe("pipeline_total");
        expect(warn).toHaveBeenCalled(); // diagnostic emitted, not a silent swallow
        warn.mockRestore();
    });

    it("predicate-only view (no compat) resolves to the all-records lane", () => {
        expect(workViewBaseQueueKeyForHost({ compat_queue_key: undefined }, def)).toBe("pipeline_total");
    });

    it("no definition to validate against → null (never a possibly-stale key that would 404)", () => {
        expect(workViewBaseQueueKeyForHost({ compat_queue_key: "lifecycle_qualification" }, null)).toBeNull();
        expect(workViewBaseQueueKeyForHost({ compat_queue_key: undefined }, null)).toBeNull();
    });
});
