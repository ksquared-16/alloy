import { describe, expect, it } from "vitest";
import {
    buildConversationSignals,
    detectMissingInformation,
    detectCommunicationRisk,
    analyzeReadReceipts,
    estimateResponseLikelihood,
    recommendFollowUp,
} from "@/lib/communications/v2/bosIntelligence";

const MSGS = [
    { direction: "outbound", created_at: "2026-06-01", opened_at: "2026-06-01", replied_at: null },
    { direction: "outbound", created_at: "2026-06-02", opened_at: null, replied_at: null },
    { direction: "inbound", created_at: "2026-06-03" },
];

describe("conversation signals", () => {
    it("computes counts, awaiting, receipts, rates", () => {
        const s = buildConversationSignals(MSGS);
        expect(s.inbound).toBe(1);
        expect(s.outbound).toBe(2);
        expect(s.lastInboundAt).toBe("2026-06-03");
        expect(s.awaitingResponse).toBe(true); // inbound is latest
        expect(s.openedNotReplied).toBe(1);
        expect(s.sentNotOpened).toBe(1);
        expect(s.responseRate).toBe(0.5);
        expect(s.openRate).toBe(0.5);
    });
});

describe("missing info + risk + receipts", () => {
    it("detects missing required fields", () => {
        expect(detectMissingInformation({ child_dob: "", parent_email: "a@b.com" }, ["child_dob", "parent_email", "program"]))
            .toEqual(["child_dob", "program"]);
    });
    it("flags risks", () => {
        const s = buildConversationSignals(MSGS);
        const flags = detectCommunicationRisk({ signals: s, slaState: "overdue" });
        expect(flags).toContain("awaiting_response");
        expect(flags).toContain("opened_not_replied");
        expect(flags).toContain("sla_overdue");
    });
    it("stale silence only when not awaiting", () => {
        const s = buildConversationSignals([{ direction: "outbound", created_at: "2026-06-01" }]);
        const flags = detectCommunicationRisk({ signals: s, nowMs: Date.parse("2026-06-30"), lastMessageMs: Date.parse("2026-06-01"), staleHours: 72 });
        expect(flags).toContain("stale_silence");
    });
    it("analyzes read receipts", () => {
        expect(analyzeReadReceipts(MSGS)).toEqual({ openedNotReplied: 1, sentNotOpened: 1, replied: 0 });
    });
});

describe("likelihood + follow-up", () => {
    it("deterministic likelihood 0..1", () => {
        const s = buildConversationSignals(MSGS);
        expect(estimateResponseLikelihood(s)).toBeCloseTo(0.5); // 0.6*0.5 + 0.4*0.5
    });
    it("recommends by risk priority", () => {
        const s = buildConversationSignals(MSGS);
        expect(recommendFollowUp(s, ["awaiting_response"]).action).toBe("respond_now");
        expect(recommendFollowUp(s, ["opened_not_replied"]).action).toBe("send_follow_up");
        expect(recommendFollowUp(s, ["stale_silence"]).action).toBe("re_engage");
        expect(recommendFollowUp(s, []).action).toBe("monitor");
    });
});
