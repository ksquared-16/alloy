import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adaptSourceToRelatedRecordProposals } from "@/lib/intake/sources/adaptSourceToRelatedRecordProposals";

describe("neutral source proposal orchestrator", () => {
    it("has no Processing evidence or UI imports", () => {
        const content = readFileSync(join(process.cwd(), "lib/intake/sources/adaptSourceToRelatedRecordProposals.ts"), "utf8");
        expect(content).not.toContain("processingCase/collection");
        expect(content).not.toContain("ProcessingCollection");
        expect(content).not.toContain("@/components");
        expect(content).not.toContain("executeExistingChild");
    });

    it("returns typed diagnostic for unsupported sources without touching evidence projection", () => {
        const result = adaptSourceToRelatedRecordProposals({ sourceKind: "api", sourceRecordId: "api-1" });
        expect(result.collections).toEqual([]);
        expect(result.diagnostics[0]?.code).toBe("missing_source_context");
    });
});
