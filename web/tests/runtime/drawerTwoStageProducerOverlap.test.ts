/**
 * THE TWO-STAGE PRODUCER OVERLAP — the one authorized new mechanism, gated.
 *
 * The Attendance, Health and Financials producers used to run after the entire drawer compose,
 * although everything they consume settles once the children shell has. The composer now publishes
 * a bounded participant contract as stage one, the route starts the producers on it, and stage two
 * (the view model) resolves alongside them.
 *
 * Every gate here corresponds to a way that change could be silently undone or could quietly widen
 * into something it was not authorized to be. Several are read from source: the invariants are
 * about ORDERING and about what is NOT reachable, which is what the repo's other architecture
 * gates (financialsGateConcurrency, producerAuthorizationParity) already assert this way.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    canonicalParticipantScopeFromTruth,
    participantCardProducerContract,
} from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/**
 * CODE, NOT PROSE. These files carry long explanatory comments that legitimately NAME the things
 * the gates below forbid — `_inquiry_children`, the old ordering, the resolver. Asserting against
 * raw text made three gates fail on their own documentation, which is a gate that reports the
 * wrong thing rather than a gate that works.
 */
const codeOf = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE = codeOf(read("app/api/admin/view-models/drawer/opportunity/[id]/route.ts"));
const COMPOSER = codeOf(read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts"));
const PRODUCERS = codeOf(read("lib/adminV2/runtime/focusPanel/focusPanelCardProducers.ts"));
/** The handler body only — the import block names the two-stage entry before the gate runs. */
const ROUTE_BODY = ROUTE.slice(ROUTE.indexOf("export async function GET"));

describe("gate A — one participant owner", () => {
    it("the route never derives participant identity itself", () => {
        // #1075 died of exactly this: identity assembled somewhere other than the canonical owner.
        expect(ROUTE).not.toContain("participantCandidatesFromTruth");
        expect(ROUTE).not.toContain("resolveParticipantScope");
        expect(ROUTE).not.toContain("_inquiry_children");
    });

    it("the route consumes what the composer publishes", () => {
        expect(ROUTE).toContain("staged.participantForCardProducers");
    });
});

describe("gate B — the early contract stays bounded", () => {
    it("carries exactly the three scalars the producers need", () => {
        const c = participantCardProducerContract(
            { participationId: "p1", customerMemberId: "cm-1", personId: "per-1", displayName: "Child A",
              imageUrl: "https://signed/photo.png", stageKey: "lead", stageLabel: "Lead" },
            { "customer.id": "cust-1" },
        );
        expect(Object.keys(c).sort()).toEqual(["customerMemberId", "displayName", "financialSubjectId"]);
        // imageUrl is NOT settled when this is published — the photo projection writes it later.
        expect(c).not.toHaveProperty("imageUrl");
        expect(c).not.toHaveProperty("participationId");
    });

    it("never hands out the operational context or composer internals", () => {
        expect(ROUTE).not.toContain("staged.result.operationalContext");
        const published = COMPOSER.slice(COMPOSER.indexOf("publishOnce("));
        expect(published).not.toContain("_inquiry_children");
    });
});

describe("gate C — producers start only after the contract is authoritative", () => {
    it("awaits stage one before starting them", () => {
        const awaitAt = ROUTE.indexOf("await staged.participantForCardProducers");
        const startAt = ROUTE.indexOf("projectFocusPanelCardProducers({");
        expect(awaitAt).toBeGreaterThan(-1);
        expect(startAt).toBeGreaterThan(awaitAt);
    });
});

describe("gate D — exactly one producer execution", () => {
    it("the route invokes the producers once", () => {
        expect(ROUTE.split("projectFocusPanelCardProducers(").length - 1).toBe(1);
    });

    it("the old post-compose invocation is gone", () => {
        expect(ROUTE).not.toContain("context: settledContext");
    });
});

describe("gate E — the early contract is immutable", () => {
    it("is frozen, so later enrichment cannot change what the producers were given", () => {
        const c = participantCardProducerContract(
            { participationId: "p1", customerMemberId: "cm-1", personId: null, displayName: "Child A",
              imageUrl: null, stageKey: null, stageLabel: null },
            { "customer.id": "cust-1" },
        );
        expect(Object.isFrozen(c)).toBe(true);
        expect(() => {
            (c as unknown as { customerMemberId: string }).customerMemberId = "cm-2";
        }).toThrow();
    });

    it("the fields it carries are not written by later children enrichment", () => {
        // The shell tail writes preferred_name and the photo URL; it writes neither of these.
        const attach = codeOf(read("lib/admin/drawer/attachCustomerMemberProfileToInquiryChildren.ts"));
        expect(attach).not.toMatch(/\bchild_name:/);
        expect(attach).not.toMatch(/\bdisplay_name:/);
        expect(attach).not.toMatch(/customer_member_id:\s*[^?]/);
    });
});

describe("gate F — ambiguity is refused, never resolved to the first child", () => {
    it("two candidates with no selection yield no scope", () => {
        const scope = canonicalParticipantScopeFromTruth({
            truth: {
                _inquiry_children: [
                    { id: "p1", customer_member_id: "cm-1", child_name: "Child A" },
                    { id: "p2", customer_member_id: "cm-2", child_name: "Child B" },
                ],
            },
            selectedParticipationId: null,
            resolvedParticipant: null,
        });
        expect(scope).toBeNull();
    });

    it("a sole participant still resolves", () => {
        const scope = canonicalParticipantScopeFromTruth({
            truth: { _inquiry_children: [{ id: "p1", customer_member_id: "cm-1", child_name: "Child A" }] },
            selectedParticipationId: null,
            resolvedParticipant: null,
        });
        expect(scope?.customerMemberId).toBe("cm-1");
    });
});

describe("gate G — authorization is unchanged and still request-time", () => {
    it("the producers receive the route's own resolved authority", () => {
        expect(ROUTE).toContain("access: gate.access");
    });

    it("the gate is resolved before anything else in the handler", () => {
        expect(ROUTE_BODY.indexOf("await loadAdminRouteGate()")).toBeLessThan(
            ROUTE_BODY.indexOf("startOpportunityDrawerViewModelCompose("),
        );
    });
});

describe("gate H — failure semantics are unchanged", () => {
    it("producers still settle independently", () => {
        expect(PRODUCERS).toContain("Promise.allSettled([");
    });
});

describe("gate I — the response still joins producer completion", () => {
    it("awaits the producers before assembling the view model", () => {
        const joinAt = ROUTE.indexOf("await producedCardsP");
        const assembleAt = ROUTE.indexOf("operational_projection: { ...projection, cards: producedCards }");
        expect(joinAt).toBeGreaterThan(-1);
        expect(assembleAt).toBeGreaterThan(joinAt);
    });
});

describe("gate J — no extra reads", () => {
    it("the participant resolver is still called exactly once per request", () => {
        expect(ROUTE.split("resolveParticipationSubjectForOpportunity(").length - 1).toBe(1);
    });

    it("the early contract performs no database work", () => {
        const contract = codeOf(read("lib/adminV2/runtime/operationalContext/buildOperationalContext.ts"));
        expect(contract).not.toContain("supabase");
    });
});

describe("gate K — a bounded two-stage result, not an emitter", () => {
    it("the public stage-one surface is a promise", () => {
        expect(COMPOSER).toContain("participantForCardProducers: Promise<");
        expect(COMPOSER).toContain("result: Promise<OpportunityDrawerViewModelResult>");
    });

    it("no caller outside the composer passes a callback", () => {
        expect(ROUTE).not.toContain("onParticipantContract");
    });

    it("no scheduler, background task, stream or module-level mutable state was added", () => {
        for (const forbidden of ["setTimeout", "setInterval", "EventEmitter", "ReadableStream", "globalThis."]) {
            expect(COMPOSER).not.toContain(forbidden);
        }
    });
});
