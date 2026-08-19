/**
 * Admission before retrieval — the twenty cases the sprint pressure-tested.
 *
 * Each case asserts the DECISION, not a downstream effect: which lane admitted it (or
 * which refusal declined it), what the caller is authorized to fetch, and what may be
 * believed about the sender. A refusal asserting `retrieval: "none"` is the whole point —
 * it is the machine-checkable form of "Alloy never requested the body".
 */

import { describe, expect, it } from "vitest";

import {
    carriesAlloyThreadToken,
    evaluateEmailIngressEligibility,
    resolveAddressedIdentity,
    type EmailIngressContext,
    type EmailIngressEnvelope,
    type EmailIngressPolicy,
    type IngressIdentity,
    type SenderRelationship,
} from "@/lib/communications/ingress/emailIngressEligibility";

const ORG = "11111111-1111-1111-1111-111111111111";

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
        hasResolvableAlloyThread: false,
        ...overrides,
    };
}

const guardian = (personIds: string[] = ["p-1"]): SenderRelationship => ({
    kind: "guardian",
    status: "active",
    personIds,
});

describe("addressed identity", () => {
    it("prefers the most specific dedication when several identities are named", () => {
        const resolved = resolveAddressedIdentity(
            envelope({ recipients: ["kelly@school.com", "enrollment@school.com"] }),
            policy().identities
        );
        expect(resolved).toEqual(ENROLLMENT);
    });

    it("prefers a purpose address over an acquisition address", () => {
        const resolved = resolveAddressedIdentity(
            envelope({ recipients: ["enrollment@school.com", "subsidy@school.com"] }),
            policy().identities
        );
        expect(resolved).toEqual(SUBSIDY);
    });

    it("matches case-insensitively and through angle brackets", () => {
        const resolved = resolveAddressedIdentity(
            envelope({ recipients: ["Director <KELLY@School.com>"] }),
            policy().identities
        );
        expect(resolved).toEqual(DIRECTOR);
    });
});

describe("Alloy thread token", () => {
    it("is recognised in References as well as In-Reply-To", () => {
        expect(carriesAlloyThreadToken(envelope({ references: ALLOY_THREAD_TOKEN }))).toBe(true);
        expect(carriesAlloyThreadToken(envelope({ inReplyTo: ALLOY_THREAD_TOKEN }))).toBe(true);
    });

    it("is not claimed by a foreign Message-ID", () => {
        expect(
            carriesAlloyThreadToken(envelope({ inReplyTo: "<CAF=abc123@mail.gmail.com>" }))
        ).toBe(false);
    });
});

describe("pressure test — the twenty cases", () => {
    it("1. parent replies to an Alloy enrollment email", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com", inReplyTo: ALLOY_THREAD_TOKEN }),
                senderRelationships: [guardian()],
                hasResolvableAlloyThread: true,
            })
        );
        expect(decision).toMatchObject({
            admitted: true,
            lane: "conversation_continuity",
            retrieval: "full",
        });
        expect(decision.admitted && decision.senderAssertion).toEqual({
            kind: "verified_relationship",
            relationship: guardian(),
            personId: "p-1",
        });
    });

    it("2. parent starts a fresh email to the Director — admitted on the watched relationship", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com" }),
                senderRelationships: [guardian()],
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "relationship_watch" });
    });

    it("3. unknown parent emails enrollment@ — acquisition, and nobody is asserted", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    recipients: ["enrollment@school.com"],
                    sender: "newfamily@gmail.com",
                }),
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "acquisition", retrieval: "full" });
        expect(decision.admitted && decision.senderAssertion.kind).toBe("unknown");
    });

    it("4. known subsidy worker emails the Director — refused while agencies are unwatched", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "worker@county.gov" }),
                senderRelationships: [{ kind: "agency", status: "active", personIds: ["p-9"] }],
            })
        );
        expect(decision).toMatchObject({
            admitted: false,
            refusal: "relationship_not_watched",
            retrieval: "none",
        });
    });

    it("4b. the same message is admitted once the administrator watches agencies", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "worker@county.gov" }),
                policy: policy({ watchedRelationshipKinds: ["guardian", "agency"] }),
                senderRelationships: [{ kind: "agency", status: "active", personIds: ["p-9"] }],
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "relationship_watch" });
    });

    it("5. unknown subsidy worker emails subsidy@ — purpose intake carries the purpose", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    recipients: ["subsidy@school.com"],
                    sender: "unknown@county.gov",
                }),
            })
        );
        expect(decision).toMatchObject({
            admitted: true,
            lane: "purpose_intake",
            intakePurposeKey: "subsidy_intake",
        });
    });

    it("6. known vendor emails the Director with an invoice — refused; vendors are not watched", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "ap@vendor.com", hasAttachments: true }),
                senderRelationships: [{ kind: "vendor", status: "active", personIds: ["p-4"] }],
            })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "relationship_not_watched" });
    });

    it("7. unknown vendor emails invoices@ — admitted with the invoice purpose", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    recipients: ["invoices@school.com"],
                    sender: "billing@unknownvendor.com",
                    hasAttachments: true,
                }),
            })
        );
        expect(decision).toMatchObject({
            admitted: true,
            lane: "purpose_intake",
            intakePurposeKey: "invoice_intake",
        });
    });

    it("8. bank emails the Director a statement — never reaches Alloy", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "no-reply@bank.com", hasAttachments: true }) })
        );
        expect(decision).toMatchObject({
            admitted: false,
            refusal: "no_admitting_evidence",
            retrieval: "none",
        });
    });

    it("9. payroll provider emails the Director — never reaches Alloy", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "notices@payroll.com" }) })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "no_admitting_evidence" });
    });

    it("10. staff member emails the Director — refused; staff is its own permission", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "teacher@school.com" }),
                senderRelationships: [{ kind: "staff", status: "active", personIds: ["p-7"] }],
            })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "relationship_not_watched" });
    });

    it("11. newsletter to the Director — never reaches Alloy", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "news@industry.example" }) })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "no_admitting_evidence" });
    });

    it("12. parent emails from a NEW address not yet on their Person — refused, honestly", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "parent.new@work.com" }), senderRelationships: [] })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "no_admitting_evidence" });
    });

    it("12b. …but the same new address IS admitted when it replies to an Alloy thread", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent.new@work.com", references: ALLOY_THREAD_TOKEN }),
                hasResolvableAlloyThread: true,
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "conversation_continuity" });
        expect(decision.admitted && decision.senderAssertion.kind).toBe("unknown");
    });

    it("13. two Persons share an email endpoint — admitted, but asserts nobody", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "household@gmail.com" }),
                senderRelationships: [guardian(["p-1", "p-2"])],
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "relationship_watch" });
        expect(decision.admitted && decision.senderAssertion.kind).toBe("shared_endpoint");
    });

    it("14. a forward rewrites the apparent sender to a staff member — not admitted as staff", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    sender: "kelly@school.com",
                    envelopeSender: "kelly@school.com",
                    recipients: ["kelly@school.com"],
                }),
                senderRelationships: [{ kind: "staff", status: "active", personIds: ["p-0"] }],
            })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "relationship_not_watched" });
    });

    it("15. parent sends an absence note with an immunization attachment — one admission, no AI", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com", hasAttachments: true }),
                senderRelationships: [guardian()],
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "relationship_watch", retrieval: "full" });
    });

    it("16. agency sends an encrypted PDF to subsidy@ — admission is unaffected by readability", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    recipients: ["subsidy@school.com"],
                    sender: "case@county.gov",
                    hasAttachments: true,
                }),
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "purpose_intake" });
    });

    it("17. a reply on an existing Alloy conversation carries an attachment", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    sender: "parent@gmail.com",
                    inReplyTo: ALLOY_THREAD_TOKEN,
                    hasAttachments: true,
                }),
                senderRelationships: [guardian()],
                hasResolvableAlloyThread: true,
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "conversation_continuity" });
    });

    it("18. confidential HR/legal mail to the Director — never reaches Alloy", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ sender: "counsel@lawfirm.com", subject: "Privileged" }) })
        );
        expect(decision).toMatchObject({
            admitted: false,
            refusal: "no_admitting_evidence",
            retrieval: "none",
        });
    });

    it("19. spoofed sender claiming a known parent's address — refused on authentication", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com", authentication: "fail" }),
                senderRelationships: [guardian()],
            })
        );
        expect(decision).toMatchObject({
            admitted: false,
            refusal: "relationship_unauthenticated",
            retrieval: "none",
        });
    });

    it("19b. an unreported authentication result is treated exactly like a failure", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com", authentication: "unknown" }),
                senderRelationships: [guardian()],
            })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "relationship_unauthenticated" });
    });

    it("20. a compromised but genuine parent account is admitted — and that is the honest answer", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com", authentication: "pass" }),
                senderRelationships: [guardian()],
            })
        );
        // Authentication proves the mailbox sent it, never that its owner meant to.
        // Admission is correct; detecting takeover is not an ingress-gate problem.
        expect(decision).toMatchObject({ admitted: true, lane: "relationship_watch" });
    });
});

describe("boundaries the gate must hold", () => {
    it("mail naming no Alloy identity is 'not ours', distinct from 'we declined it'", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({ envelope: envelope({ recipients: ["someone.else@school.com"] }) })
        );
        expect(decision).toMatchObject({
            admitted: false,
            refusal: "not_addressed_to_alloy",
            identity: null,
        });
    });

    it("every refusal grants no retrieval", () => {
        const refusals = [
            ctx({ envelope: envelope({ recipients: ["nobody@school.com"] }) }),
            ctx(),
            ctx({
                envelope: envelope({ sender: "parent@gmail.com", authentication: "fail" }),
                senderRelationships: [guardian()],
            }),
            ctx({
                envelope: envelope({ sender: "teacher@school.com" }),
                senderRelationships: [{ kind: "staff", status: "active", personIds: ["p-7"] }],
            }),
            ctx({
                envelope: envelope({ sender: "old@gmail.com" }),
                senderRelationships: [{ kind: "guardian", status: "inactive", personIds: ["p-3"] }],
            }),
        ];
        for (const c of refusals) {
            const decision = evaluateEmailIngressEligibility(c);
            expect(decision.admitted).toBe(false);
            expect(decision.retrieval).toBe("none");
        }
    });

    it("an inactive watched relationship refuses distinguishably from an unwatched kind", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "former@gmail.com" }),
                senderRelationships: [{ kind: "guardian", status: "inactive", personIds: ["p-3"] }],
            })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "relationship_inactive" });
    });

    it("Lane B is off by default — an empty watch list admits no relationship", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "parent@gmail.com" }),
                policy: policy({ watchedRelationshipKinds: [] }),
                senderRelationships: [guardian()],
            })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "relationship_not_watched" });
    });

    it("the administrator's watch order decides which relationship admits a dual-role sender", () => {
        const both: SenderRelationship[] = [
            { kind: "vendor", status: "active", personIds: ["p-5"] },
            { kind: "guardian", status: "active", personIds: ["p-5"] },
        ];
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "dual@gmail.com" }),
                policy: policy({ watchedRelationshipKinds: ["guardian"] }),
                senderRelationships: both,
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "relationship_watch" });
        expect(decision.admitted && decision.senderAssertion).toMatchObject({
            kind: "verified_relationship",
            relationship: { kind: "guardian" },
        });
    });

    it("continuity outranks a purpose address, and the purpose is still reported", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    recipients: ["invoices@school.com"],
                    sender: "billing@vendor.com",
                    references: ALLOY_THREAD_TOKEN,
                }),
                hasResolvableAlloyThread: true,
            })
        );
        expect(decision).toMatchObject({
            admitted: true,
            lane: "conversation_continuity",
            intakePurposeKey: "invoice_intake",
        });
    });

    it("a reply arriving at the acquisition address is continuity, not a second candidate", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({
                    recipients: ["enrollment@school.com"],
                    sender: "family@gmail.com",
                    inReplyTo: ALLOY_THREAD_TOKEN,
                }),
                hasResolvableAlloyThread: true,
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "conversation_continuity" });
    });

    it("a well-formed Alloy token that resolves to nothing in this org does not admit", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "attacker@example.com", inReplyTo: ALLOY_THREAD_TOKEN }),
                hasResolvableAlloyThread: false,
            })
        );
        expect(decision).toMatchObject({ admitted: false, refusal: "no_admitting_evidence" });
    });

    it("an explicit allow admits only when no stronger lane applies", () => {
        const decision = evaluateEmailIngressEligibility(
            ctx({
                envelope: envelope({ sender: "licensing@state.gov" }),
                policy: policy({ explicitAllowAddresses: ["Licensing@State.gov"] }),
            })
        );
        expect(decision).toMatchObject({ admitted: true, lane: "explicit_allow" });
    });

    it("authentication is not required for lanes whose evidence the sender cannot forge", () => {
        for (const c of [
            ctx({
                envelope: envelope({
                    recipients: ["subsidy@school.com"],
                    sender: "x@county.gov",
                    authentication: "fail",
                }),
            }),
            ctx({
                envelope: envelope({
                    sender: "x@example.com",
                    inReplyTo: ALLOY_THREAD_TOKEN,
                    authentication: "unknown",
                }),
                hasResolvableAlloyThread: true,
            }),
        ]) {
            expect(evaluateEmailIngressEligibility(c).admitted).toBe(true);
        }
    });
});
