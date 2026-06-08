import { describe, expect, it } from "vitest";
import { ATTENTION_REASON_CRITERIA_CATALOG } from "@/lib/opportunities/attentionReasonCriteriaCatalog";
import { CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED } from "@/lib/opportunities/attentionPlatformCatalog";

describe("attentionReasonCriteriaCatalog", () => {
    it("defines UI copy for every canonical attention reason code", () => {
        for (const code of CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED) {
            const row = ATTENTION_REASON_CRITERIA_CATALOG[code];
            expect(row, code).toBeDefined();
            expect(row.title.trim().length).toBeGreaterThan(0);
            expect(row.meaning.trim().length).toBeGreaterThan(0);
            expect(row.configSource.trim().length).toBeGreaterThan(0);
        }
    });
});
