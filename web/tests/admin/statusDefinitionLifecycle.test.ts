import { describe, expect, it } from "vitest";
import { parseLifecycleStageFromMetadata } from "@/lib/admin/statusDefinitionLifecycle";

describe("parseLifecycleStageFromMetadata", () => {
    it("returns null for missing or invalid lifecycle_stage", () => {
        expect(parseLifecycleStageFromMetadata(null)).toBe(null);
        expect(parseLifecycleStageFromMetadata({})).toBe(null);
        expect(parseLifecycleStageFromMetadata({ lifecycle_stage: "unknown" })).toBe(null);
        expect(parseLifecycleStageFromMetadata({ lifecycle_stage: 1 } as Record<string, unknown>)).toBe(null);
    });

    it("parses known stages", () => {
        expect(parseLifecycleStageFromMetadata({ lifecycle_stage: "intake" })).toBe("intake");
        expect(parseLifecycleStageFromMetadata({ lifecycle_stage: "successx" })).toBe(null);
        expect(parseLifecycleStageFromMetadata({ lifecycle_stage: "execution" })).toBe("execution");
        expect(parseLifecycleStageFromMetadata({ lifecycle_stage: "  intake  " })).toBe("intake");
    });
});
