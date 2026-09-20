/**
 * COMPOSITION AND THE CARD PRODUCERS MUST NOT RUN IN SERIES.
 *
 * Measured on deployed d1b8f1319 the Work Unit route ran three awaits strictly in order —
 * route identity ~170ms, composition ~742ms, card producers ~858ms — and those plus ~252ms of glue
 * are the entire 2,022ms document wall. Navigation timing showed TTFB at ~32ms, so the browser was
 * never waiting on the network; it was waiting because nothing readable is emitted until the last
 * await returns.
 *
 * The serialization is not semantically required. `projectFocusPanelCardProducers` declares its
 * input as a narrowed Pick carrying `participantScope` only, with `financialSubjectId` as a scalar
 * — shaped that way so the drawer route could start them before its view model existed. This route
 * waited purely because it built those values out of the finished answer.
 *
 * These gates hold the overlap in place AND hold the guards that keep speculation from becoming
 * truth. The child-grain case is the dangerous one: `householdCustomerId` can fall back to the
 * family row after the subject row is read, so an early household answer may not be the final one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTE = codeOf(read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"));
const ANSWER = codeOf(read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts"));
const PRODUCERS = read("lib/adminV2/runtime/focusPanel/focusPanelCardProducers.ts");

/** The listener body — where the early run is started. */
const LISTENER = (() => {
    const start = ROUTE.indexOf("onSubjectResolved: (");
    expect(start).toBeGreaterThan(-1);
    return ROUTE.slice(start, ROUTE.indexOf("\n        },", start));
})();

describe("producers start at participant, not after composition", () => {
    it("the early run is created in the listener and awaited later", () => {
        const create = ROUTE.indexOf("earlyRef.run = (async ()");
        const join = ROUTE.indexOf("await earlyRef.run");
        expect(create).toBeGreaterThan(-1);
        expect(join).toBeGreaterThan(create);
    });

    it("the early run reaches the producers, not just the participant read", () => {
        // Starting only the participant read leaves the 858ms producer block in series.
        expect(LISTENER).toContain("projectFocusPanelCardProducers(");
        expect(LISTENER).toContain("resolveSoleEnrollmentParticipantForOpportunity(");
    });

    it("B — no partial OperationalContext is fabricated", () => {
        // The producers' declared input is already the narrowed Pick; passing a cast-up context
        // would be inventing a shape the type does not promise.
        expect(PRODUCERS).toContain("participantScope?: Pick<");
        expect(LISTENER).not.toMatch(/as unknown as OperationalContext|as OperationalContext/);
        expect(LISTENER).toContain("participantScope:");
    });

    it("the announcement carries BOTH halves of the producer contract", () => {
        expect(ANSWER).toContain("customerId:");
        expect(ANSWER).toMatch(/onSubjectResolved\?:\s*\(args:\s*\{[^}]*customerId/);
    });

    it("M — the announcement is guarded on the subject, not a constant", () => {
        const at = ANSWER.indexOf("req.onSubjectResolved?.(");
        const guard = ANSWER.slice(ANSWER.lastIndexOf("if (", at), at);
        expect(guard).toContain("chosen.entityId");
        expect(guard).not.toMatch(/if \(\s*(false|true)\s*\)/);
    });
});

describe("speculation is verified, never assumed", () => {
    it("E — a different settled subject discards the early run", () => {
        expect(ROUTE).toContain("early.subjectId === attentionId");
    });

    it("F/O — a different canonical household discards it too (child-grain fallback)", () => {
        // `householdCustomerId` can fall back to childComposition.family.customerId AFTER the
        // subject row is read, so the subject check alone is not sufficient.
        expect(ROUTE).toContain("early!.financialSubjectId === canonicalFinancialSubjectId");
        expect(ROUTE).toContain("earlySubjectMatches &&");
    });

    it("G/H — mismatch discards the WHOLE run and falls back canonically", () => {
        // Participant and cards travel together; keeping half would mix identities.
        expect(ROUTE).toMatch(/earlyRunUsable\s*\n?\s*\?\s*early!\.cards\s*\n?\s*:\s*await projectFocusPanelCardProducers\(\{/);
        expect(ROUTE).toMatch(/earlySubjectMatches\s*\n?\s*\?\s*early!\.participant/);
    });

    it("the canonical fallback still resolves the participant for the real subject", () => {
        // Anchored on the LAST call site: the speculative one is created in the listener above.
        const at = ROUTE.lastIndexOf("resolveSoleEnrollmentParticipantForOpportunity({");
        expect(at).toBeGreaterThan(-1);
        const call = ROUTE.slice(at, ROUTE.indexOf("})", at));
        expect(call).toContain("opportunityId: attentionId");
    });
});

describe("single execution and isolation", () => {
    it("D — the matching path builds producers once", () => {
        // Two call sites only: the speculative start and the mismatch fallback.
        expect((ROUTE.match(/projectFocusPanelCardProducers\(\{/g) ?? []).length).toBe(2);
        expect((ROUTE.match(/resolveSoleEnrollmentParticipantForOpportunity\(\{/g) ?? []).length).toBe(2);
    });

    it("J — producer failure stays one-card failure", () => {
        expect(PRODUCERS).toContain("allSettled");
        expect(PRODUCERS).not.toMatch(/Promise\.all\(/);
    });

    it("L — a failing early run cannot break composition", () => {
        expect(ROUTE).toMatch(/\)\(\)\.catch\(\(\) => null\)/);
    });

    it("K — the early run does not mutate the answer", () => {
        expect(LISTENER).not.toContain("answer.");
    });
});

describe("authorization is unchanged", () => {
    it("C/P — the early run uses the route gate's authority and carries no verdict", () => {
        expect(LISTENER).toContain("access: gate.access");
        for (const forbidden of ["canMutate", "permissionKeys", "roleKeys", "canView"]) {
            expect(LISTENER).not.toContain(forbidden);
        }
    });

    it("N — the canonical fallback keeps the gate's org", () => {
        const at = ROUTE.lastIndexOf("resolveSoleEnrollmentParticipantForOpportunity({");
        const call = ROUTE.slice(at, ROUTE.indexOf("})", at));
        const orgBindings = call.match(/orgId:\s*[^,\n]+/g) ?? [];
        expect(orgBindings).toEqual(["orgId: gate.orgId"]);
    });
});
