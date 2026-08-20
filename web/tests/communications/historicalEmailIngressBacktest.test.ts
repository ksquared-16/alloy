/**
 * The backtest must be a measurement instrument, not a second ingestion path.
 *
 * Three properties carry that, and each is asserted rather than described: the
 * reconstruction cannot invent evidence history does not hold, the summary cannot silently
 * drop a row it failed on, and the audit sample is stable so two runs over one corpus are
 * comparable.
 */

import { describe, expect, it } from "vitest";

import {
    backtestMessage,
    reconstructEnvelope,
    selectAuditSample,
    summarizeBacktest,
    type BacktestOutcome,
    type HistoricalInboundEmail,
} from "@/lib/communications/ingress/historicalEmailIngressBacktest";
import type { EmailIngressPolicy, SenderRelationship } from "@/lib/communications/ingress/emailIngressEligibility";

const ORG = "11111111-1111-1111-1111-111111111111";
const THREAD = "33333333-3333-3333-3333-333333333333";
const DIRECTOR = "kelly@school.com";

const POLICY: EmailIngressPolicy = {
    orgId: ORG,
    identities: [{ address: DIRECTOR, role: "conversation" }],
    watchedRelationshipKinds: ["guardian"],
};

const guardian: SenderRelationship = { kind: "guardian", status: "active" };

function message(over: Partial<HistoricalInboundEmail> = {}): HistoricalInboundEmail {
    return {
        messageId: "m-1",
        orgId: ORG,
        provider: "resend",
        providerMessageId: "prov-1",
        canonicalThreadId: THREAD,
        fromAddress: "parent@gmail.com",
        toAddress: DIRECTOR,
        subject: "Field trip",
        emailMessageId: "<x@mail.example>",
        emailInReplyTo: null,
        emailReferences: null,
        attachmentCount: 0,
        resolvedAlloyThreadId: null,
        canonicalThreadMessageCount: 1,
        canonicalThreadOutboundCount: 0,
        canonicalThreadOutboundBeforeCount: 0,
        inboundResolution: "single_person_match",
        correlationMethod: "none",
        receivedAt: "2026-08-01T00:00:00.000Z",
        ...over,
    };
}

describe("reconstruction cannot invent evidence", () => {
    it("reports authentication as unknown, because history never captured it", () => {
        expect(reconstructEnvelope(message()).authentication).toBe("unknown");
    });

    it("only the explicit counterfactual claims a pass, and it is opt-in", () => {
        expect(reconstructEnvelope(message(), { counterfactualAuthenticated: true }).authentication).toBe("pass");
    });

    it("carries only to_address as a recipient — narrowing, never widening", () => {
        // cc and the provider's received_for are not in canonical storage. Missing them can
        // only make a message match FEWER identities, so a reconstruction under-admits and
        // never over-admits. That direction is what makes the measurement trustworthy.
        expect(reconstructEnvelope(message()).recipients).toEqual([DIRECTOR]);
    });

    it("does not treat the thread ingestion FILED it into as thread evidence", () => {
        // canonicalThreadId is set; resolvedAlloyThreadId is not. Ingestion also files by
        // endpoint provenance, and conflating the two would manufacture Lane A.
        const outcome = backtestMessage({ message: message(), policy: POLICY, senderRelationships: [], senderPersonIds: [] });
        expect(outcome.decision.lane).not.toBe("conversation_continuity");
        expect(outcome.decision.matchedThreadId).toBeNull();
    });
});

describe("the authentication gap is isolated, not averaged away", () => {
    const m = message();
    it("a watched relationship reviews without authentication and ingests with it", () => {
        expect(
            backtestMessage({ message: m, policy: POLICY, senderRelationships: [guardian], senderPersonIds: ["p"] }).decision.reasonCode
        ).toBe("REVIEW_UNAUTHENTICATED_RELATIONSHIP");
        expect(
            backtestMessage({
                message: m,
                policy: POLICY,
                senderRelationships: [guardian], senderPersonIds: ["p"],
                counterfactualAuthenticated: true,
            }).decision.reasonCode
        ).toBe("ADMIT_WATCHED_RELATIONSHIP");
    });

    it("lanes that do not rest on the sender are identical either way", () => {
        const laneA = message({ resolvedAlloyThreadId: THREAD });
        for (const counterfactualAuthenticated of [false, true]) {
            expect(
                backtestMessage({ message: laneA, policy: POLICY, senderRelationships: [], senderPersonIds: [], counterfactualAuthenticated })
                    .decision.reasonCode
            ).toBe("ADMIT_ALLOY_THREAD");
        }
    });
});

describe("failures are results, never omissions", () => {
    const broken: BacktestOutcome = {
        message: message({ messageId: "m-broken" }),
        decision: null as never,
        error: "policy exploded",
    };

    it("a gate error is counted and does not shrink the corpus", () => {
        const good = backtestMessage({ message: message(), policy: POLICY, senderRelationships: [], senderPersonIds: [] });
        const matrix = summarizeBacktest([good, broken]);
        expect(matrix.totalEvaluated).toBe(2);
        expect(matrix.gateErrors).toBe(1);
        expect(matrix.wouldIngest + matrix.wouldReject + matrix.wouldRequireReview).toBe(1);
    });

    it("backtestMessage returns rather than throws when the policy is malformed", () => {
        const outcome = backtestMessage({
            message: message(),
            policy: null as unknown as EmailIngressPolicy,
            senderRelationships: [], senderPersonIds: [],
        });
        expect(outcome.error).not.toBeNull();
    });
});

describe("the audit sample is by rule and is stable", () => {
    const corpus: BacktestOutcome[] = [
        backtestMessage({ message: message({ messageId: "a", resolvedAlloyThreadId: THREAD }), policy: POLICY, senderRelationships: [], senderPersonIds: [] }),
        backtestMessage({ message: message({ messageId: "b" }), policy: POLICY, senderRelationships: [guardian], senderPersonIds: ["p"] }),
        ...Array.from({ length: 30 }, (_, i) =>
            backtestMessage({
                message: message({ messageId: `r${i}`, fromAddress: `x${i}@nowhere.example` }),
                policy: POLICY,
                senderRelationships: [], senderPersonIds: [],
            })
        ),
    ];

    it("takes every Lane A and every REVIEW without sampling them", () => {
        const sample = selectAuditSample(corpus);
        expect(sample.find((s) => s.message.messageId === "a")?.auditReason).toBe("every Lane A");
        expect(sample.find((s) => s.message.messageId === "b")?.auditReason).toBe("every WOULD_REQUIRE_REVIEW");
    });

    it("bounds the unmatched sample and returns the same rows every run", () => {
        const first = selectAuditSample(corpus, { unmatchedSample: 5 }).map((s) => s.message.messageId);
        const second = selectAuditSample(corpus, { unmatchedSample: 5 }).map((s) => s.message.messageId);
        expect(first).toEqual(second);
        expect(first.filter((id) => id.startsWith("r"))).toHaveLength(5);
    });

    it("selects a rejection the organization REPLIED to, and not merely one with a thread", () => {
        // Every message in a real corpus has a canonical thread, because ingestion makes
        // one. Only an outbound message in that thread says the organization engaged.
        const replied = backtestMessage({
            message: message({ messageId: "replied", fromAddress: "x@nowhere.example", canonicalThreadOutboundCount: 1 }),
            policy: POLICY,
            senderRelationships: [], senderPersonIds: [],
        });
        const sample = selectAuditSample([...corpus, replied], { unmatchedSample: 1 });
        expect(sample.find((s) => s.message.messageId === "replied")?.auditReason).toBe(
            "WOULD_REJECT although the organization replied in this thread"
        );
    });

    it("never lists one message twice, whichever rules select it", () => {
        const sample = selectAuditSample(corpus);
        expect(new Set(sample.map((s) => s.message.messageId)).size).toBe(sample.length);
    });
});
