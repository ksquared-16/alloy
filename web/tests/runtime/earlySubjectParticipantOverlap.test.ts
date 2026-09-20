/**
 * THE PARTICIPANT READ MUST NOT QUEUE BEHIND THE WHOLE ANSWER.
 *
 * `composeProvisioningAnswerForRoute` has exactly three serial awaits — route identity ~170ms,
 * composition ~742ms, card producers ~858ms — and measured on deployed d1b8f1319 they sum to the
 * 2,022ms document wall. Nothing the operator can read crosses the wire until the last finishes,
 * even though the response itself opens at ~32ms.
 *
 * The producers' participant read needs only the SUBJECT, which composition resolves BEFORE the
 * ~616ms children shell. These gates hold that overlap in place, and hold the guards that keep it
 * an optimisation rather than a new source of truth.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ANSWER = codeOf(read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts"));
const ROUTE = codeOf(read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"));

describe("the composer announces the subject early", () => {
    it("fires the announcement where the subject resolves, before the children shell", () => {
        const fire = ANSWER.indexOf("req.onSubjectResolved?.(");
        const chosen = ANSWER.indexOf("const chosen =");
        const children = ANSWER.indexOf("t_document_children");
        expect(chosen).toBeGreaterThan(-1);
        expect(fire).toBeGreaterThan(chosen);
        // The whole point: ahead of the single largest remaining composition phase.
        expect(fire).toBeLessThan(children);
    });

    it("the announcement is guarded on the SUBJECT, not on a constant", () => {
        /*
         * A position-only assertion cannot see an announcement that never fires: replacing the
         * guard with `if (false)` leaves the call exactly where it was. The guard itself is the
         * live wire, so it is what gets pinned.
         */
        const at = ANSWER.indexOf("req.onSubjectResolved?.(");
        const guard = ANSWER.slice(ANSWER.lastIndexOf("if (", at), at);
        expect(guard).toContain("chosen.entityId");
        expect(guard).not.toMatch(/if \(\s*(false|true)\s*\)/);
    });

    it("announces only — composition never awaits the listener", () => {
        // A value returned into composition would let route-side work deadlock the answer.
        expect(ANSWER).not.toMatch(/await\s+req\.onSubjectResolved/);
        expect(ANSWER).toMatch(/onSubjectResolved\?:\s*\(args:\s*\{[^}]*\}\)\s*=>\s*void/);
    });

    it("a throwing listener cannot cost the document its answer", () => {
        const at = ANSWER.indexOf("req.onSubjectResolved?.(");
        // The announcement now spans several lines (subject + household), so the window widened.
        const around = ANSWER.slice(at - 300, at + 420);
        expect(around).toContain("try");
        expect(around).toContain("catch");
    });
});

describe("the route overlaps the participant read", () => {
    it("starts the read inside the announcement, not after the answer", () => {
        const start = ROUTE.indexOf("onSubjectResolved:");
        const join = ROUTE.indexOf("const resolvedParticipant");
        expect(start).toBeGreaterThan(-1);
        expect(join).toBeGreaterThan(start);
        const listener = ROUTE.slice(start, ROUTE.indexOf("\n        },", start));
        expect(listener).toContain("resolveSoleEnrollmentParticipantForOpportunity");
        // The read is awaited INSIDE the detached async run, never in composition's flow.
        expect(listener).toContain("earlyRef.run = (async ()");
    });

    it("settles the promise at creation so a rejection cannot escape mid-composition", () => {
        const start = ROUTE.indexOf("onSubjectResolved:");
        expect(ROUTE.slice(start, ROUTE.indexOf("\n        },", start))).toContain(".catch(");
    });

    it("discards the speculative read when the answer settled on a different record", () => {
        // The early read is an optimisation, never a source. A different subject must re-read.
        expect(ROUTE).toContain("early.subjectId === attentionId");
        expect(ROUTE).toMatch(/await resolveSoleEnrollmentParticipantForOpportunity\(\{/);
    });

    it("falls back cleanly when no announcement ever fired", () => {
        // No announcement means no early run, and the join takes the canonical branch.
        expect(ROUTE).toContain("earlyRef.run ? await earlyRef.run : null");
    });

    it("issues no second read when the speculative one is used", () => {
        // Exactly two call sites: the early start and the mismatch/no-announcement fallback.
        expect((ROUTE.match(/resolveSoleEnrollmentParticipantForOpportunity\(\{/g) ?? []).length).toBe(2);
    });

    it("keeps one authorization boundary — the route gate's org for the canonical read", () => {
        /*
         * Scoped to the FALLBACK READ itself. Asserting that "gate.orgId" appears somewhere in the
         * file survives swapping it at the one call site that matters, which a plant proved.
         */
        // The LAST call site is the canonical fallback; the first is the speculative start.
        const at = ROUTE.lastIndexOf("resolveSoleEnrollmentParticipantForOpportunity({");
        expect(at).toBeGreaterThan(-1);
        const call = ROUTE.slice(at, ROUTE.indexOf("})", at));
        // Enumerate the bindings rather than pattern-match around them: `\s*` matching zero
        // characters made an earlier negative lookahead fire on the correct code.
        const orgBindings = call.match(/orgId:\s*[^,\n]+/g) ?? [];
        expect(orgBindings).toEqual(["orgId: gate.orgId"]);
        expect(ROUTE).not.toMatch(/persist|cacheParticipant|globalThis/);
    });
});
