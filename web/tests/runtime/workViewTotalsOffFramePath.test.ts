/**
 * P0-7.6 CANDIDATE A — the Work View totals leave the frame's critical path.
 *
 * ── WHAT CHANGED ────────────────────────────────────────────────────────────────────────────────
 *
 * The route used to `await seedRef.run` before emitting the answer. Measured on deployed 31fb4b0c
 * that wait was `join_wait_ms` P50 252ms of a 1,273ms frame — the largest remaining bounded term on
 * the path, and the last one with a mechanism.
 *
 * Work View totals are FACTS. Membership and order come from configuration and are final at the
 * frame; only the VALUES are outstanding, and a value may begin UNKNOWN. The seed is still computed,
 * still started from the composer's own announcement, and still delivered when it has landed. What
 * is gone is the frame waiting for it.
 *
 * ── WHAT MUST NOT HAPPEN ────────────────────────────────────────────────────────────────────────
 *
 * An unresolved total is not zero. `workViewTotalsSeed: null` is the state the client has always
 * handled by resolving the counts itself; a zero would be an authoritative claim nobody computed,
 * and it would look right on screen.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ROUTE = read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts");
const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("plant: the frame does not wait for Work View totals", () => {
    it("the seed is observed, never awaited", () => {
        /*
         * The specific regression: restoring the await puts the frame back behind the totals and
         * every latency number still looks healthy, because the cost moves into the stream hold
         * where it is not attributed to this join.
         */
        expect(code).not.toContain("await seedRef.run");
        expect(code).toContain("const seed = seedSettled.value");
        expect(code).toContain("seedSettled.value = v");
    });

    it("the totals are still computed and still started from the announcement", () => {
        // Candidate A removes a WAIT, not the work. If the seed stopped being requested, the client
        // would pay a round trip this slice originally existed to remove.
        expect(code).toContain("onWorkViewCountTargetsResolved");
        expect(code).toContain("resolveWorkViewTotalsSeed");
    });

    it("join_wait_ms stays reported, so a reintroduced wait is visible", () => {
        expect(code).toContain("seedDiag.join_wait_ms = 0");
        expect(code).toContain("seed_at_commit");
    });
});

describe("plant: an unresolved Work View total is UNKNOWN, never zero", () => {
    it("an absent seed leaves the field null rather than an empty totals set", () => {
        const tail = code.slice(code.indexOf("const seed = seedSettled.value"));
        // Null is the honest state. The failure this guards is `totals: []`, or a zeroed shape,
        // which reads as "this Work View has none" — an answer nobody computed.
        expect(tail).toContain("answer.workViewTotalsSeed = null");
        expect(tail).not.toMatch(/workViewTotalsSeed\s*=\s*\{\s*totals:\s*\[\s*\]/);
        expect(tail).not.toMatch(/workViewTotalsSeed\s*=\s*0/);
    });

    it("an UNAVAILABLE seed is carried as its unresolved shape, not flattened to empty", () => {
        // The pre-existing contract, preserved: a seed that resolved to unavailable still reaches
        // the client as unavailable, which is distinguishable from both null and zero.
        const tail = code.slice(code.indexOf("const seed = seedSettled.value"));
        expect(tail).toContain('seed.status === "resolved"');
        expect(tail).toContain("answer.workViewTotalsSeed = seed");
    });
});

describe("plant: Candidate A introduces no global settlement barrier", () => {
    it("nothing new is awaited between the settlement fork and the answer", () => {
        /*
         * The whole progressive architecture rests on the frame awaiting only what selects
         * geometry. A new await here would reintroduce the barrier two-phase emission removed.
         */
        const fork = code.slice(
            code.indexOf("if (input.deferSettlement)"),
            code.indexOf("return { ok: true, answer"),
        );
        const awaits = [...fork.matchAll(/await\s+([A-Za-z_$][\w$.]*)/g)].map((m) => m[1]);
        // The inline settlement join is the only legal await here, and only on the non-deferred
        // path the HTTP seam uses.
        expect(awaits.filter((a) => a !== "runSettlement")).toEqual([]);
    });
});
