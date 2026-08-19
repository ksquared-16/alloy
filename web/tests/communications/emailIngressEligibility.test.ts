/**
 * What the gate WOULD do — asserted case by case, while it does nothing.
 *
 * Every case asserts the DECISION: disposition, lane, reason code, and what may be
 * believed about the sender. Two properties are asserted structurally rather than
 * case-by-case, because they are the ones that would fail silently:
 *
 *   · every decision is `deterministic` — no path produces any other basis;
 *   · every WOULD_REJECT grants `retrieval: "none"` — the machine-checkable form of
 *     "under enforcement, no body would have been requested".
 *
 * Behaviour non-interference is asserted separately, against the real ingestion path,
 * in `inboundEmailIngestionObserveOnly.test.ts`. Nothing here can prove that.
 */

import { describe, expect, it } from "vitest";

import {
    carriesAlloyThreadToken,
    evaluateEmailIngressEligibility,
    resolveAddressedIdentity,
    wouldAdmit,
    EMAIL_INGRESS_POLICY_VERSION,
    type EmailIngressContext,
    type EmailIngressEnvelope,
    type EmailIngressPolicy,
    type IngressIdentity,
    type SenderRelationship,
} from "@/lib/communications/ingress/emailIngressEligibility";

const ORG = "11111111-1111-1111-1111-111111111111";
const THREAD = "33333333-3333-3333-3333-333333333333";

const DIRECTOR: IngressIdentity = { address: "kelly@school.com", role: "conversation" };
const SUBSIDY: IngressIdentity = {
    address: "subsidy@school.com",
    role: "purpose",
    intakePurposeKey: "subsidy_intake",
};
const INVOICES: IngressIdentity = {
    address: "invoices@school.com",
    role: "purpose",
    intakePurposeKey: "invoice_intake",
};
const ENROLLMENT: IngressIdentity = { address: "enrollment@school.com", role: "acquisition" };

const ALLOY_THREAD_TOKEN = "<alloy.aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@school.com>";

function policy(overrides: Partial<EmailIngressPolicy> = {}): EmailIngressPolicy {
    return {
        orgId: ORG,
        identities: [DIRECTOR, SUBSIDY, INVOICES, ENROLLMENT],
        watchedRelationshipKinds: ["guardian", "prospective_guardian"],
        ...overrides,
    };
}

function envelope(overrides: Partial<EmailIngressEnvelope> = {}): EmailIngressEnvelope {
    return {
        recipients: ["kelly@school.com"],
        sender: "stranger@example.com",
        authentication: "pass",
        ...overrides,
    };
}

function ctx(overrides: Partial<EmailIngressContext> = {}): EmailIngressContext {
    return {
        envelope: envelope(),
        policy: policy(),
        senderRelationships: [],
        senderPersonIds: [],
        resolvedAlloyThreadId: null,
        ...overrides,
    };
}

const guardian: SenderRelationship = { kind: "guardian", status: "active" };
/** A relationship plus the endpoint that holds it — the two are now separate inputs. */
const held = (personIds: string[] = ["p-1"]) => ({ senderRelationships: [guardian], senderPersonIds: personIds });

describe("addressed identity", () => {
    it("prefers the most specific dedication when several identities are named", () => {
        expect(
            resolveAddressedIdentity(
                envelope({ recipients: ["kelly@school.com", "enrollment@school.com"] }),
                policy().identities
            )
        ).toEqual(ENROLLMENT);
    });

    it("prefers a purpose address over an acquisition address", () => {
        expect(
            resolveAddressedIdentity(
                envelope({ recipients: ["enrollment@school.com", "subsidy@school.com"] }),
                policy().identities
            )
        ).toEqual(SUBSIDY);
    });

    it("matches case-insensitively and through angle brackets", () => {
        expect(
            resolveAddressedIdentity(envelope({ recipients: ["Director <KELLY@School.com>"] }), policy().identities)
        ).toEqual(DIRECTOR);
    });
});

describe("Alloy thread token", () => {
    it("is recognised in References as well as In-Reply-To", () => {
        expect(carriesAlloyThreadToken(envelope({ references: ALLOY_THREAD_TOKEN }))).toBe(true);
        expect(carriesAlloyThreadToken(envelope({ inReplyTo: ALLOY_THREAD_TOKEN }))).toBe(true);
    });

    it("is not claimed by a foreign Message-ID", () => {
        expect(carriesAlloyThreadToken(envelope({ inReplyTo: "<CAF=abc123@mail.gmail.com>" }))).toBe(false);
    });
});

describe("pressure tests — the sixteen cases", () => {
    it("1. known parent replying to an Alloy email → INGEST, Lane A, thread evidence", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com", inReplyTo: ALLOY_THREAD_TOKEN }),
                ...held(),
                resolvedAlloyThreadId: THREAD,
            })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_INGEST",
            lane: "conversation_continuity",
            reasonCode: "ADMIT_ALLOY_THREAD",
            matchedThreadId: THREAD,
        });
        expect(d.senderAssertion).toEqual({ kind: "verified_relationship", relationship: guardian, personId: "p-1" });
    });

    it("2. known parent starting a fresh email → INGEST, Lane B", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "parent@gmail.com" }), ...held() })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_INGEST",
            lane: "relationship_watch",
            reasonCode: "ADMIT_WATCHED_RELATIONSHIP",
            matchedThreadId: null,
        });
    });

    it("3. unknown sender to the enrollment identity → REVIEW, Lane D, no Lead", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ recipients: ["enrollment@school.com"], sender: "newfamily@gmail.com" }) })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_REQUIRE_REVIEW",
            lane: "acquisition",
            reasonCode: "REVIEW_ACQUISITION_CANDIDATE",
        });
        expect(d.senderAssertion.kind).toBe("unknown");
    });

    it("4. known subsidy worker to the Director identity → REJECT while agencies are unwatched", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "worker@county.gov" }),
                senderRelationships: [{ kind: "agency", status: "active" }],
            })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_REJECT",
            lane: "none",
            reasonCode: "REJECT_RELATIONSHIP_NOT_WATCHED",
            retrieval: "none",
        });
    });

    it("4b. …and is admitted once the administrator watches agencies — a setting, not a rebuild", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "worker@county.gov" }),
                policy: policy({ watchedRelationshipKinds: ["guardian", "agency"] }),
                senderRelationships: [{ kind: "agency", status: "active" }],
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_INGEST", lane: "relationship_watch" });
    });

    it("5. unknown subsidy worker to the subsidy identity → INGEST, Lane C, purpose carried", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ recipients: ["subsidy@school.com"], sender: "unknown@county.gov" }) })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_INGEST",
            lane: "purpose_intake",
            reasonCode: "ADMIT_PURPOSE_IDENTITY",
            intakePurposeKey: "subsidy_intake",
        });
    });

    it("6. known vendor to the Director → REJECT; vendors are not watched", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "ap@vendor.com", hasAttachments: true }),
                senderRelationships: [{ kind: "vendor", status: "active" }],
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_REJECT", reasonCode: "REJECT_RELATIONSHIP_NOT_WATCHED" });
    });

    it("7. unknown vendor to the invoices identity → INGEST, Lane C", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    recipients: ["invoices@school.com"],
                    sender: "billing@unknownvendor.com",
                    hasAttachments: true,
                }),
            })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_INGEST",
            lane: "purpose_intake",
            intakePurposeKey: "invoice_intake",
        });
    });

    it("8. bank / financial sender to the Director → REJECT, no admitting evidence", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "statements@bank.com", hasAttachments: true }) })
        );
        expect(d).toMatchObject({ disposition: "WOULD_REJECT", reasonCode: "REJECT_NO_ADMITTING_EVIDENCE" });
    });

    it("9. payroll provider → REJECT", () => {
        const d = evaluateEmailIngressEligibility(ctx({ envelope: envelope({ sender: "notices@payroll.com" }) }));
        expect(d).toMatchObject({ disposition: "WOULD_REJECT", reasonCode: "REJECT_NO_ADMITTING_EVIDENCE" });
    });

    it("10. staff member → REJECT; staff is its own permission, never a side effect of employment", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "teacher@school.com" }),
                senderRelationships: [{ kind: "staff", status: "active" }],
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_REJECT", reasonCode: "REJECT_RELATIONSHIP_NOT_WATCHED" });
    });

    it("11. newsletter → REJECT", () => {
        const d = evaluateEmailIngressEligibility(ctx({ envelope: envelope({ sender: "news@industry.example" }) }));
        expect(d).toMatchObject({ disposition: "WOULD_REJECT", reasonCode: "REJECT_NO_ADMITTING_EVIDENCE" });
    });

    it("12. known parent from a NEW address → REJECT, and that is the honest answer", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "parent.new@work.com" }), senderRelationships: [] })
        );
        expect(d).toMatchObject({ disposition: "WOULD_REJECT", reasonCode: "REJECT_NO_ADMITTING_EVIDENCE" });
    });

    it("12b. …the same new address IS admitted when it replies to an Alloy thread, sender still unknown", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent.new@work.com", references: ALLOY_THREAD_TOKEN }),
                resolvedAlloyThreadId: THREAD,
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_INGEST", lane: "conversation_continuity" });
        expect(d.senderAssertion.kind).toBe("unknown");
    });

    it("13. ambiguous shared email endpoint → REVIEW; the relationship is real and names nobody", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "household@gmail.com" }),
                ...held(["p-1", "p-2"]),
            })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_REQUIRE_REVIEW",
            lane: "relationship_watch",
            reasonCode: "REVIEW_SHARED_ENDPOINT",
        });
        expect(d.senderAssertion.kind).toBe("shared_endpoint");
    });

    it("14a. spoofed display name, sender address matches nothing → REJECT", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                // The display name claims a parent; the address behind it is a stranger's,
                // and normalization strips the name before anything looks at it.
                envelope: envelope({ sender: '"Dana Whitfield" <attacker@evil.example>' }),
                senderRelationships: [],
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_REJECT", reasonCode: "REJECT_NO_ADMITTING_EVIDENCE" });
    });

    it("14b. spoofed ADDRESS of a known parent, authentication fails → REVIEW, never silent ingest", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: '"Dana Whitfield" <parent@gmail.com>', authentication: "fail" }),
                ...held(),
            })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_REQUIRE_REVIEW",
            reasonCode: "REVIEW_UNAUTHENTICATED_RELATIONSHIP",
        });
    });

    it("15. existing Alloy-thread reply with an attachment → INGEST, Lane A", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com", inReplyTo: ALLOY_THREAD_TOKEN, hasAttachments: true }),
                ...held(),
                resolvedAlloyThreadId: THREAD,
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_INGEST", lane: "conversation_continuity", retrieval: "full" });
    });

    it("16. mixed parent message + operational attachment → ONE admission, no AI, extraction is downstream", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    sender: "parent@gmail.com",
                    subject: "Lennon absent Friday + immunization form",
                    hasAttachments: true,
                }),
                ...held(),
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_INGEST", lane: "relationship_watch" });
        expect(d.confidenceBasis).toBe("deterministic");
    });
});

describe("the endpoint decides ambiguity, not the relationship", () => {
    it("a shared endpoint with NO relationship reviews instead of vanishing into 'unknown'", () => {
        // The defect the first historical backtest found. Two Persons held the address and
        // neither was watched, so the gate said `unknown` and refused — while ingestion had
        // correctly flagged it ambiguous. Ambiguity is a fact about the endpoint.
        const d = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "household@gmail.com" }), senderPersonIds: ["p-1", "p-2"] })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_REQUIRE_REVIEW",
            lane: "none",
            reasonCode: "REVIEW_SHARED_ENDPOINT",
        });
        expect(d.senderAssertion).toMatchObject({ kind: "shared_endpoint", relationship: null, personIds: ["p-1", "p-2"] });
    });

    it("that review authorizes NO retrieval — sharing a mailbox is not permission to read it", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "household@gmail.com" }), senderPersonIds: ["p-1", "p-2"] })
        );
        expect(d.retrieval).toBe("none");
    });

    it("but a review that rests on a LANE does authorize retrieval", () => {
        for (const c of [
            ctx({ envelope: envelope({ recipients: ["enrollment@school.com"] }) }),
            ctx({ envelope: envelope({ sender: "p@g.com" }), ...held(["p-1", "p-2"]) }),
        ]) {
            const d = evaluateEmailIngressEligibility(c);
            expect(d.disposition).toBe("WOULD_REQUIRE_REVIEW");
            expect(d.retrieval).toBe("full");
        }
    });

    it("a single-Person endpoint is never ambiguous, however many relationships it holds", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "p@g.com" }),
                senderRelationships: [guardian, { kind: "emergency_contact", status: "active" }],
                senderPersonIds: ["p-1"],
            })
        );
        expect(d.senderAssertion.kind).toBe("verified_relationship");
    });
});

describe("boundaries the gate must hold", () => {
    it("mail naming no Alloy identity is 'not ours', distinct from 'we declined it'", () => {
        const d = evaluateEmailIngressEligibility(ctx({ envelope: envelope({ recipients: ["someone.else@school.com"] }) }));
        expect(d).toMatchObject({
            disposition: "WOULD_REJECT",
            reasonCode: "REJECT_NOT_ADDRESSED_TO_ALLOY",
            identity: null,
        });
    });

    it("an inactive watched relationship refuses distinguishably from an unwatched kind", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "former@gmail.com" }),
                senderRelationships: [{ kind: "guardian", status: "inactive" }],
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_REJECT", reasonCode: "REJECT_RELATIONSHIP_INACTIVE" });
    });

    it("Lane B is off by default — an empty watch list admits no relationship", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com" }),
                policy: policy({ watchedRelationshipKinds: [] }),
                ...held(),
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_REJECT", reasonCode: "REJECT_RELATIONSHIP_NOT_WATCHED" });
    });

    it("the administrator's watch order decides which relationship admits a dual-role sender", () => {
        const both: SenderRelationship[] = [
            { kind: "vendor", status: "active" },
            { kind: "guardian", status: "active" },
        ];
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "dual@gmail.com" }),
                policy: policy({ watchedRelationshipKinds: ["guardian"] }),
                senderRelationships: both,
                senderPersonIds: ["p-5"],
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_INGEST", lane: "relationship_watch" });
        expect(d.senderAssertion).toMatchObject({ kind: "verified_relationship", relationship: { kind: "guardian" } });
    });

    it("continuity outranks a purpose address, and the purpose is still reported", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    recipients: ["invoices@school.com"],
                    sender: "billing@vendor.com",
                    references: ALLOY_THREAD_TOKEN,
                }),
                resolvedAlloyThreadId: THREAD,
            })
        );
        expect(d).toMatchObject({
            disposition: "WOULD_INGEST",
            lane: "conversation_continuity",
            intakePurposeKey: "invoice_intake",
        });
    });

    it("a reply arriving at the acquisition address is continuity, not a second candidate", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    recipients: ["enrollment@school.com"],
                    sender: "family@gmail.com",
                    inReplyTo: ALLOY_THREAD_TOKEN,
                }),
                resolvedAlloyThreadId: THREAD,
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_INGEST", lane: "conversation_continuity" });
    });

    it("ORG ISOLATION: a well-formed Alloy token resolving to nothing in this org does not admit", () => {
        // The caller's lookup is org-scoped, so a token naming another tenant's message
        // arrives here as null. Shape is recognised; admission is refused.
        const e = envelope({ sender: "attacker@example.com", inReplyTo: ALLOY_THREAD_TOKEN });
        expect(carriesAlloyThreadToken(e)).toBe(true);
        expect(evaluateEmailIngressEligibility(ctx({ envelope: e, resolvedAlloyThreadId: null }))).toMatchObject({
            disposition: "WOULD_REJECT",
            reasonCode: "REJECT_NO_ADMITTING_EVIDENCE",
            matchedThreadId: null,
        });
    });

    it("an explicit allow admits only when no stronger lane applies", () => {
        const d = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "licensing@state.gov" }),
                policy: policy({ explicitAllowAddresses: ["Licensing@State.gov"] }),
            })
        );
        expect(d).toMatchObject({ disposition: "WOULD_INGEST", lane: "explicit_allow" });
    });

    it("authentication is not required for lanes whose evidence the sender cannot forge", () => {
        for (const c of [
            ctx({
                envelope: envelope({ recipients: ["subsidy@school.com"], sender: "x@county.gov", authentication: "fail" }),
            }),
            ctx({
                envelope: envelope({ sender: "x@example.com", inReplyTo: ALLOY_THREAD_TOKEN, authentication: "unknown" }),
                resolvedAlloyThreadId: THREAD,
            }),
        ]) {
            expect(evaluateEmailIngressEligibility(c).disposition).toBe("WOULD_INGEST");
        }
    });
});

describe("properties that must hold on every path", () => {
    // One corpus, exercised by both structural assertions. Adding a case here strengthens
    // both at once, which is the point: a new lane cannot be added without being covered.
    const corpus: EmailIngressContext[] = [
        ctx(),
        ctx({ envelope: envelope({ recipients: ["nobody@school.com"] }) }),
        ctx({ envelope: envelope({ sender: "p@g.com", inReplyTo: ALLOY_THREAD_TOKEN }), resolvedAlloyThreadId: THREAD }),
        ctx({ envelope: envelope({ recipients: ["subsidy@school.com"] }) }),
        ctx({ envelope: envelope({ recipients: ["enrollment@school.com"] }) }),
        ctx({ envelope: envelope({ sender: "p@g.com" }), ...held() }),
        ctx({ envelope: envelope({ sender: "p@g.com" }), ...held(["a", "b"]) }),
        ctx({ envelope: envelope({ sender: "p@g.com" }), senderPersonIds: ["a", "b"] }),
        ctx({
            envelope: envelope({ sender: "p@g.com", authentication: "fail" }),
            ...held(),
        }),
        ctx({
            envelope: envelope({ sender: "t@school.com" }),
            senderRelationships: [{ kind: "staff", status: "active" }],
        }),
        ctx({
            envelope: envelope({ sender: "old@g.com" }),
            senderRelationships: [{ kind: "guardian", status: "inactive" }],
        }),
        ctx({ envelope: envelope({ sender: "ok@x.com" }), policy: policy({ explicitAllowAddresses: ["ok@x.com"] }) }),
    ];

    it("NO AI: every decision on every path is deterministic and stamped with the policy version", () => {
        for (const c of corpus) {
            const d = evaluateEmailIngressEligibility(c);
            expect(d.confidenceBasis).toBe("deterministic");
            expect(d.policyVersion).toBe(EMAIL_INGRESS_POLICY_VERSION);
        }
    });

    it("retrieval follows the LANE, not the disposition", () => {
        // A review that rests on a lane has already been authorized to look. A review that
        // rests only on the endpoint being shared has authorized nothing.
        for (const c of corpus) {
            const d = evaluateEmailIngressEligibility(c);
            expect(d.retrieval).toBe(d.lane === "none" ? "none" : "full");
            expect(wouldAdmit(d)).toBe(d.disposition !== "WOULD_REJECT");
        }
    });

    it("DETERMINISM: the same context evaluated twice yields an identical decision", () => {
        for (const c of corpus) {
            expect(evaluateEmailIngressEligibility(c)).toEqual(evaluateEmailIngressEligibility(c));
        }
    });

    it("a rejection is always lane 'none'; an admission never is", () => {
        // REVIEW may be either — an ambiguity-only review carries no lane, because
        // ambiguity is not a reason we are allowed in.
        for (const c of corpus) {
            const d = evaluateEmailIngressEligibility(c);
            if (d.disposition === "WOULD_REJECT") expect(d.lane).toBe("none");
            if (d.disposition === "WOULD_INGEST") expect(d.lane).not.toBe("none");
        }
    });
});
