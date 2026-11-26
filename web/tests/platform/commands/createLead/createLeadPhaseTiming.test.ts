import { describe, expect, it } from "vitest";
import { createLeadPhaseTimer } from "@/lib/platform/commands/createLead/createLeadPhaseTiming";

describe("createLeadPhaseTimer", () => {
    it("records measured phase spans", () => {
        const timer = createLeadPhaseTimer({ correlationId: "corr-1", mode: "ingest" });
        timer.mark("case_open_start");
        timer.measure("case_open", "case_open_start");
        timer.mark("facts_start");
        timer.measure("facts_extract", "facts_start");
        const spans = timer.spans();
        expect(spans.case_open).toBeGreaterThanOrEqual(0);
        expect(spans.facts_extract).toBeGreaterThanOrEqual(0);
        expect(timer.elapsedMs()).toBeGreaterThanOrEqual(0);
    });
});
