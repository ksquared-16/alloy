import { describe, expect, it } from "vitest";
import { OPPORTUNITY_ATTENTION_RESOLVER_VERSION } from "@/lib/opportunities/opportunityAttentionResolver";
import {
    NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP,
    NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP,
} from "@/lib/queues/QueueService";
import { OPPORTUNITY_ATTENTION_QUEUE_BUILDER_MAX_ROWS } from "@/lib/workspace/buildOpportunityAttentionQueueItems";
import {
    buildQueueServiceAttentionSemantics,
    buildStandaloneAttentionEvaluation,
} from "@/lib/workspace/opportunityAttentionCountSemantics";

describe("opportunityAttentionCountSemantics", () => {
    it("standalone evaluation marks saturation at the row window cap", () => {
        const ev = buildStandaloneAttentionEvaluation({
            rowWindowCap: OPPORTUNITY_ATTENTION_QUEUE_BUILDER_MAX_ROWS,
            rawCandidatesFetched: OPPORTUNITY_ATTENTION_QUEUE_BUILDER_MAX_ROWS,
            cohort: "work_unit_attention_config",
        });
        expect(ev.row_window_saturated).toBe(true);
        expect(ev.resolver_version).toBe(OPPORTUNITY_ATTENTION_RESOLVER_VERSION);
    });

    it("QueueService semantics uses list vs summary caps (documented constants)", () => {
        expect(NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP).toBe(5000);
        expect(NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP).toBe(800);
        const list = buildQueueServiceAttentionSemantics({
            candidateFetchCap: NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP,
            rawCandidatesFetched: NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP,
            fetchMode: "list_cap",
        });
        expect(list.candidate_window_saturated).toBe(true);
        const summary = buildQueueServiceAttentionSemantics({
            candidateFetchCap: NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP,
            rawCandidatesFetched: 100,
            fetchMode: "summary_cap",
        });
        expect(summary.candidate_window_saturated).toBe(false);
    });
});
