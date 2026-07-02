import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { queueUrgencyChipLabel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { resolveQueueOperationalReadSlot } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";

describe("queue operational read display (fix pass 2)", () => {
    it("hides urgency chip for medium severity with p2 band", () => {
        expect(queueUrgencyChipLabel("p2_soon", { primarySeverity: "medium", slaTier: "ok" })).toBeNull();
        expect(queueUrgencyChipLabel("p1_today", { primarySeverity: "medium", slaTier: "ok" })).toBeNull();
        expect(queueUrgencyChipLabel("p1_today", { primarySeverity: "medium", slaTier: "breached" })).toBe(
            "Today"
        );
        expect(queueUrgencyChipLabel("p0_urgent", { primarySeverity: "medium", slaTier: "ok" })).toBe("Urgent");
    });

    it("do-next line is not merged with long why text", () => {
        const slot = resolveQueueOperationalReadSlot({
            _operational_recommendation_preview: {
                next_label: "Send a warm first response and confirm the family's preferred next step",
                why_line: "Response window exceeded · 24 days since the inquiry was created",
                urgency_band: "p2_soon",
            },
        });
        expect(slot?.operationalRead).toContain("Send a warm first response");
        expect(slot?.whyNow).toContain("24 days since the inquiry was created");
        expect(slot?.operationalRead).not.toContain("24 days since");
    });
});

describe("drawer primary BOS payload", () => {
    it("drawer_primary defers operational attention off the critical path", () => {
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
        const src = readFileSync(join(webRoot, "lib/admin/opportunityEntityRecord.ts"), "utf8");
        const primaryStart = src.indexOf('surfaceParamEarly === "drawer_primary"');
        const primaryBlock = src.slice(
            primaryStart,
            src.indexOf("return NextResponse.json(out", primaryStart)
        );
        // Attention bundle must NOT run synchronously in drawer_primary; it attaches on surface=full.
        expect(primaryBlock).not.toContain("attachOpportunityAttentionSuggestionBundle");
        expect(primaryBlock).toContain("_operational_attention_deferred = true");
    });
});
