/**
 * The observe-only decision matrix, over a synthetic Director-inbox corpus.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 *
 * This is a MODEL, not a measurement. No real mailbox has been connected, and the
 * certified inbound runtime has received no production traffic to observe. What it does
 * is run 1,000 synthetic messages — mixed to the proportions the capability audit assumed
 * for a childcare Director — through the REAL gate, so the shape of the answer is known
 * before any live corpus exists, and so a later live corpus has something to be compared
 * against.
 *
 * The counts are asserted exactly. That makes this an executable specification of the
 * policy's behaviour at population scale: any change to precedence, lane mapping or
 * authentication handling moves a number here, visibly, rather than shifting a
 * distribution nobody re-reads.
 *
 * ---------------------------------------------------------------------------
 * THE AUTHENTICATION SPLIT IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * The corpus is evaluated TWICE — once as it arrives through Resend today, where the
 * retrieval payload carries no `Authentication-Results` header and every sender is
 * therefore `unknown`, and once as it would arrive from a transport that stamps one.
 *
 * The difference between those two runs is the single most important number this sprint
 * produced, and it is not a modelling artefact: it is the whole of Lane B moving between
 * "ingest" and "review".
 */

import { describe, expect, it } from "vitest";

import {
    evaluateEmailIngressEligibility,
    type EmailIngressDecision,
    type EmailIngressPolicy,
    type IngressIdentity,
    type SenderAuthentication,
    type SenderRelationship,
} from "@/lib/communications/ingress/emailIngressEligibility";
import { OBSERVE_ONLY_DEFAULT_WATCHED_KINDS } from "@/lib/communications/ingress/observeEmailIngressEligibility";

const ORG = "11111111-1111-1111-1111-111111111111";
const THREAD = "33333333-3333-3333-3333-333333333333";

const DIRECTOR: IngressIdentity = { address: "kelly@school.com", role: "conversation" };
const SUBSIDY: IngressIdentity = { address: "subsidy@school.com", role: "purpose", intakePurposeKey: "subsidy_intake" };
const INVOICES: IngressIdentity = { address: "invoices@school.com", role: "purpose", intakePurposeKey: "invoice_intake" };
const ENROLLMENT: IngressIdentity = { address: "enrollment@school.com", role: "acquisition" };

const POLICY: EmailIngressPolicy = {
    orgId: ORG,
    identities: [DIRECTOR, SUBSIDY, INVOICES, ENROLLMENT],
    watchedRelationshipKinds: OBSERVE_ONLY_DEFAULT_WATCHED_KINDS,
};

type CorpusMessage = {
    /** What the message actually is, independent of what the gate concludes. */
    truth:
        | "thread_reply"
        | "known_guardian"
        | "prospective_family"
        | "purpose_intake"
        | "acquisition"
        | "shared_household"
        | "former_family"
        | "staff"
        | "vendor_invoice"
        | "agency_direct"
        | "bank"
        | "payroll"
        | "newsletter"
        | "legal"
        | "parent_new_address"
        | "spoofed_parent";
    recipient: string;
    relationships: SenderRelationship[];
    resolvedAlloyThreadId: string | null;
    authentication: SenderAuthentication;
};

const guardian = (personIds = ["p"]): SenderRelationship => ({ kind: "guardian", status: "active", personIds });
const prospective: SenderRelationship = { kind: "prospective_guardian", status: "active", personIds: ["p"] };
const former: SenderRelationship = { kind: "former_guardian", status: "inactive", personIds: ["p"] };
const staff: SenderRelationship = { kind: "staff", status: "active", personIds: ["p"] };

/**
 * 1,000 messages in the proportions the capability audit assumed.
 *
 * 5% replies to Alloy conversations · 20% eligible relationships · 5% purpose and
 * acquisition · 70% unrelated. The 70% is deliberately not one homogeneous blob: a
 * rejection for "we do not watch staff" and a rejection for "nobody here has ever heard of
 * this sender" are different findings, and a corpus that could not tell them apart would
 * hide the only false negatives worth arguing about.
 */
function buildCorpus(authentication: SenderAuthentication): CorpusMessage[] {
    const base = { recipient: DIRECTOR.address, relationships: [], resolvedAlloyThreadId: null, authentication } as const;
    // `authentication` FIRST, so a message that names its own (the spoofed ones) keeps it.
    const repeat = (n: number, m: Partial<CorpusMessage> & Omit<CorpusMessage, "authentication">): CorpusMessage[] =>
        Array.from({ length: n }, () => ({ authentication, ...m }) as CorpusMessage);

    return [
        // --- 5% conversation continuity ------------------------------------------------
        ...repeat(40, { ...base, truth: "thread_reply", relationships: [guardian()], resolvedAlloyThreadId: THREAD }),
        ...repeat(10, { ...base, truth: "thread_reply", recipient: ENROLLMENT.address, resolvedAlloyThreadId: THREAD }),

        // --- 20% eligible relationships -------------------------------------------------
        ...repeat(150, { ...base, truth: "known_guardian", relationships: [guardian()] }),
        ...repeat(35, { ...base, truth: "prospective_family", relationships: [prospective] }),
        ...repeat(15, { ...base, truth: "shared_household", relationships: [guardian(["p1", "p2"])] }),

        // --- 5% purpose and acquisition -------------------------------------------------
        ...repeat(15, { ...base, truth: "purpose_intake", recipient: SUBSIDY.address }),
        ...repeat(15, { ...base, truth: "purpose_intake", recipient: INVOICES.address }),
        ...repeat(20, { ...base, truth: "acquisition", recipient: ENROLLMENT.address }),

        // --- 70% unrelated to Alloy -----------------------------------------------------
        ...repeat(250, { ...base, truth: "newsletter" }),
        ...repeat(120, { ...base, truth: "bank" }),
        ...repeat(60, { ...base, truth: "payroll" }),
        ...repeat(90, { ...base, truth: "vendor_invoice", relationships: [{ kind: "vendor", status: "active", personIds: ["p"] }] }),
        ...repeat(60, { ...base, truth: "staff", relationships: [staff] }),
        ...repeat(40, { ...base, truth: "agency_direct" }),
        ...repeat(30, { ...base, truth: "legal" }),
        ...repeat(30, { ...base, truth: "former_family", relationships: [former] }),
        ...repeat(15, { ...base, truth: "parent_new_address" }),
        ...repeat(5, { ...base, truth: "spoofed_parent", relationships: [guardian()], authentication: "fail" }),
    ];
}

function decide(message: CorpusMessage): EmailIngressDecision {
    return evaluateEmailIngressEligibility({
        envelope: {
            recipients: [message.recipient],
            sender: "sender@example.invalid",
            authentication: message.authentication,
        },
        policy: POLICY,
        senderRelationships: message.relationships,
        resolvedAlloyThreadId: message.resolvedAlloyThreadId,
    });
}

function matrix(authentication: SenderAuthentication) {
    const corpus = buildCorpus(authentication);
    const decisions = corpus.map(decide);
    const count = (p: (d: EmailIngressDecision) => boolean) => decisions.filter(p).length;
    return {
        total: corpus.length,
        wouldIngest: count((d) => d.disposition === "WOULD_INGEST"),
        wouldReject: count((d) => d.disposition === "WOULD_REJECT"),
        wouldReview: count((d) => d.disposition === "WOULD_REQUIRE_REVIEW"),
        laneA: count((d) => d.lane === "conversation_continuity"),
        laneB: count((d) => d.lane === "relationship_watch"),
        laneC: count((d) => d.lane === "purpose_intake"),
        laneD: count((d) => d.lane === "acquisition"),
        unmatched: count((d) => d.reasonCode === "REJECT_NO_ADMITTING_EVIDENCE"),
        ambiguous: count((d) => d.senderAssertion.kind === "shared_endpoint"),
        decisions,
        corpus,
    };
}

describe("observe-only decision matrix — as Resend delivers today (no authentication header)", () => {
    const m = matrix("unknown");

    it("classifies the whole corpus, with nothing unaccounted for", () => {
        expect(m.total).toBe(1000);
        expect(m.wouldIngest + m.wouldReject + m.wouldReview).toBe(1000);
    });

    it("produces the matrix", () => {
        expect({
            total: m.total,
            wouldIngest: m.wouldIngest,
            wouldReject: m.wouldReject,
            wouldReview: m.wouldReview,
            laneA: m.laneA,
            laneB: m.laneB,
            laneC: m.laneC,
            laneD: m.laneD,
            unmatched: m.unmatched,
            ambiguous: m.ambiguous,
        }).toEqual({
            total: 1000,
            wouldIngest: 80,
            wouldReject: 695,
            wouldReview: 225,
            laneA: 50,
            laneB: 205,
            laneC: 30,
            laneD: 20,
            unmatched: 515,
            ambiguous: 15,
        });
    });

    it("THE FINDING: without an authentication header, every Lane B message lands in review", () => {
        // 150 guardians + 35 prospective + 15 shared + 5 spoofed = 205 messages whose only
        // admitting evidence is a `From` address the transport did not vouch for. None of
        // them can be ingested, and none of them can be safely refused either.
        const laneB = m.decisions.filter((d) => d.lane === "relationship_watch");
        expect(laneB).toHaveLength(205);
        expect(laneB.every((d) => d.disposition === "WOULD_REQUIRE_REVIEW")).toBe(true);
    });

    it("admits nothing on evidence a sender could manufacture", () => {
        const admitted = m.decisions.filter((d) => d.disposition === "WOULD_INGEST");
        expect(new Set(admitted.map((d) => d.lane))).toEqual(
            new Set(["conversation_continuity", "purpose_intake"])
        );
    });
});

describe("observe-only decision matrix — with a transport that stamps authentication", () => {
    const m = matrix("pass");

    it("produces the matrix", () => {
        expect({
            total: m.total,
            wouldIngest: m.wouldIngest,
            wouldReject: m.wouldReject,
            wouldReview: m.wouldReview,
            laneA: m.laneA,
            laneB: m.laneB,
            laneC: m.laneC,
            laneD: m.laneD,
            unmatched: m.unmatched,
            ambiguous: m.ambiguous,
        }).toEqual({
            total: 1000,
            wouldIngest: 265,
            wouldReject: 695,
            wouldReview: 20 + 15 + 5,
            laneA: 50,
            laneB: 205,
            laneC: 30,
            laneD: 20,
            unmatched: 515,
            ambiguous: 15,
        });
    });

    it("the spoofed messages stay in review even when the rest of Lane B is admitted", () => {
        const spoofed = m.corpus
            .map((c, i) => ({ c, d: m.decisions[i]! }))
            .filter(({ c }) => c.truth === "spoofed_parent");
        expect(spoofed).toHaveLength(5);
        expect(spoofed.every(({ d }) => d.reasonCode === "REVIEW_UNAUTHENTICATED_RELATIONSHIP")).toBe(true);
    });

    it("authentication moves 185 messages from review to ingest and refuses none", () => {
        const without = matrix("unknown");
        expect(m.wouldIngest - without.wouldIngest).toBe(185);
        expect(m.wouldReject).toBe(without.wouldReject);
    });
});

describe("surprising or likely-wrong results — read these before enforcing", () => {
    const m = matrix("unknown");
    const byTruth = (truth: CorpusMessage["truth"]) =>
        m.corpus.map((c, i) => ({ c, d: m.decisions[i]! })).filter(({ c }) => c.truth === truth);

    it("FALSE NEGATIVE: a known agency writing to the Director is refused, and cannot be fixed by a setting", () => {
        // 40 messages. `agency` is watchable in the policy type and derivable from nothing:
        // Alloy has no table, column or vocabulary for an agency relationship. Ticking
        // "Agencies" in the administrator UI would change nothing at all.
        const agency = byTruth("agency_direct");
        expect(agency).toHaveLength(40);
        expect(agency.every(({ d }) => d.reasonCode === "REJECT_NO_ADMITTING_EVIDENCE")).toBe(true);
    });

    it("FALSE NEGATIVE: a known vendor's invoice to the Director is refused for the same reason", () => {
        // 90 messages. These carry a vendor relationship in the corpus, but the loader
        // cannot derive one from a sender address at all — vendors hang off `contacts`,
        // not `persons`. In production these would present as REJECT_NO_ADMITTING_EVIDENCE
        // rather than the REJECT_RELATIONSHIP_NOT_WATCHED shown here, which is a WORSE
        // signal: it hides that a relationship exists.
        const vendor = byTruth("vendor_invoice");
        expect(vendor.every(({ d }) => d.reasonCode === "REJECT_RELATIONSHIP_NOT_WATCHED")).toBe(true);
    });

    it("FALSE NEGATIVE: a parent writing from a new address is indistinguishable from a stranger", () => {
        const fresh = byTruth("parent_new_address");
        expect(fresh).toHaveLength(15);
        expect(fresh.every(({ d }) => d.reasonCode === "REJECT_NO_ADMITTING_EVIDENCE")).toBe(true);
    });

    it("FALSE POSITIVE RISK: purpose and acquisition addresses admit every unknown sender, spam included", () => {
        // 50 messages, admitted on the recipient alone. That is the lane working as
        // designed — and it means a purpose address published on a website inherits the
        // full spam load. Nothing in this gate limits that; the mail provider must.
        const open = m.decisions.filter((d) => d.lane === "purpose_intake" || d.lane === "acquisition");
        expect(open).toHaveLength(50);
        expect(open.every((d) => d.retrieval === "full")).toBe(true);
    });

    it("FALSE POSITIVE RISK: an unforgeable thread token admits a sender nobody has verified", () => {
        // Lane A admits on evidence the sender cannot manufacture — but anyone in
        // possession of a forwarded Alloy email holds that token. Admission is right;
        // treating the sender as the original participant would not be.
        const laneA = m.decisions.filter((d) => d.lane === "conversation_continuity");
        expect(laneA.filter((d) => d.senderAssertion.kind === "unknown").length).toBe(10);
    });

    it("former families are refused distinguishably, which is the one rejection an operator can act on", () => {
        const gone = byTruth("former_family");
        expect(gone).toHaveLength(30);
        expect(gone.every(({ d }) => d.reasonCode === "REJECT_RELATIONSHIP_INACTIVE")).toBe(true);
    });
});
