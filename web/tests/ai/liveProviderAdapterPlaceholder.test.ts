import { describe, expect, it } from "vitest";

import { createLiveProviderAdapterPlaceholder, LIVE_PROVIDER_ADAPTER_NOT_CONFIGURED } from "@/lib/ai/liveProviderAdapterPlaceholder";

describe("createLiveProviderAdapterPlaceholder", () => {
    it("never performs a successful structured completion", async () => {
        const p = createLiveProviderAdapterPlaceholder();
        const res = await p.completeStructured({
            schema_version: 1,
            request_id: "r1",
            correlation_id: "c1",
            feature: "needs_attention_draft_enrichment",
            org_id: "o1",
            payload: {},
            requested_at_iso: "2026-05-13T12:00:00.000Z",
        });
        expect(res.outcome).toBe("disabled");
        expect(res.error?.code).toBe(LIVE_PROVIDER_ADAPTER_NOT_CONFIGURED);
    });
});
