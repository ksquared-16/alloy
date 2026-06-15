import { describe, expect, it } from "vitest";
import { buildCommsRailCards } from "@/lib/communications/v2/bosRailCards";
import { buildConversationSignals, detectCommunicationRisk, recommendFollowUp, estimateResponseLikelihood } from "@/lib/communications/v2/bosIntelligence";

describe("buildCommsRailCards", () => {
    it("always includes summary, follow-up, likelihood; risk + missing only when present", () => {
        const signals = buildConversationSignals([
            { direction: "outbound", created_at: "2026-06-01", opened_at: "2026-06-01" },
            { direction: "inbound", created_at: "2026-06-02" },
        ]);
        const riskFlags = detectCommunicationRisk({ signals, slaState: "overdue" });
        const cards = buildCommsRailCards({
            signals,
            riskFlags,
            followUp: recommendFollowUp(signals, riskFlags),
            likelihood: estimateResponseLikelihood(signals),
            missingInfo: ["child_dob"],
        });
        const kinds = cards.map((c) => c.kind);
        expect(kinds).toContain("summary");
        expect(kinds).toContain("follow_up");
        expect(kinds).toContain("likelihood");
        expect(kinds).toContain("risk");
        expect(kinds).toContain("missing_info");
    });
    it("omits risk + missing cards when none", () => {
        const signals = buildConversationSignals([{ direction: "outbound", created_at: "2026-06-01" }]);
        const cards = buildCommsRailCards({ signals, riskFlags: [], followUp: recommendFollowUp(signals, []), likelihood: 0 });
        expect(cards.map((c) => c.kind)).toEqual(["summary", "follow_up", "likelihood"]);
    });
});
