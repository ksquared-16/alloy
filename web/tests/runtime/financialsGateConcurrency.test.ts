/**
 * THE FINANCIALS GATE MUST NOT SERIALIZE THE OTHER PRODUCERS (P0-7.6 / Slice 12D).
 *
 * ── WHAT WAS MEASURED, AND WHY THIS IS THE REPAIR ──
 *
 * Deployed `7e0d399ef`, five cold entries. The outer compose decomposes as:
 *
 *   card_producers_ms   median 2,791  (2,290–3,317)   ← DOMINANT, and the most stable span
 *   inner_compose_ms    median 1,984  (1,584–3,935)
 *   route_identity_ms   median   234  (173–1,704)
 *   admin_client / document_actor ~0
 *   outer unattributed  ~1
 *
 * `projectFocusPanelCardProducers` is the dominant wait. Three of its producers — Attendance,
 * Health & Safety and Financials — are three of the four CRITICAL cards, so deferring them is not
 * available: it would turn a 0 ms coherence window into a multi-second waterfall, which the
 * programme's own doctrine forbids. Caching across operators is not available either, because
 * operator access is an INPUT (Health evaluates `health.view`, Financials gates on `fin.read`).
 *
 * What WAS available is scheduling. `assertFinancialsReadAllowed` was awaited ABOVE
 * `Promise.allSettled`, so a permission round trip only Financials needs ran to completion before
 * Attendance and Health were allowed to start. No data dependency requires that.
 *
 * These gates assert the OUTCOME — that the gate actually overlaps the other producers — rather
 * than that the call was moved, and they pin every authorization property the move must preserve.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
    join(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelCardProducers.ts"),
    "utf8",
);
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/*
 * Address the CALL, never the bare identifier — `assertFinancialsReadAllowed` also appears in the
 * import at the top of the file, and an `indexOf` on the name finds that instead, which made an
 * earlier version of these gates fail against a correct repair.
 */
const ALL_SETTLED_AT = CODE.indexOf("await Promise.allSettled(");
const GATE_CALL_AT = CODE.indexOf("assertFinancialsReadAllowed({");
/** The Financials producer branch, sliced from its own start so an earlier IIFE cannot end it. */
const BRANCH_AT = CODE.indexOf("FinancialsProducerOutcome> =>");
const BRANCH = CODE.slice(BRANCH_AT, CODE.indexOf("})()", BRANCH_AT));

describe("the gate no longer precedes the parallel region", () => {
    it("THE GATE: assertFinancialsReadAllowed is inside Promise.allSettled, not above it", () => {
        expect(ALL_SETTLED_AT).toBeGreaterThan(-1);
        expect(GATE_CALL_AT).toBeGreaterThan(-1);
        // The defect, precisely: the await sitting BEFORE the parallel region.
        expect(
            GATE_CALL_AT,
            "the Financials gate must run inside the parallel region, not ahead of it",
        ).toBeGreaterThan(ALL_SETTLED_AT);
    });

    it("THE GATE: no awaited statement remains between the subject resolution and allSettled", () => {
        const head = CODE.slice(CODE.indexOf("const financialSubjectId"), ALL_SETTLED_AT);
        // Any `await` here is a serial preamble in front of three parallel reads — the thing repaired.
        expect(head).not.toMatch(/\bawait\b/);
    });
});

describe("authorization is unchanged — the move is scheduling only", () => {
    it("the gate still runs BEFORE the ledger read, inside the branch", () => {
        const branch = BRANCH;
        const gateAt = branch.indexOf("assertFinancialsReadAllowed({");
        const buildAt = branch.indexOf("buildFinancialsCardVM(");
        expect(gateAt).toBeGreaterThan(-1);
        expect(buildAt).toBeGreaterThan(gateAt);
    });

    it("THE GATE: a denied caller still causes no ledger read at all", () => {
        expect(BRANCH).toMatch(/if \(!gate\.ok\) return \{ gateOk: false, vm: null \}/);
        // The early return must precede the build, or a refusal would still read the ledger.
        expect(BRANCH.indexOf("if (!gate.ok)")).toBeLessThan(BRANCH.indexOf("buildFinancialsCardVM("));
    });

    it("a failed grant read is still a REFUSAL, never an empty grant set", () => {
        expect(CODE).toMatch(/\.catch\(\(\) => \(\{[\s\S]{0,80}ok: false as const/);
    });

    it("the gate is still the canonical one, with the route-resolved org and caller", () => {
        expect(BRANCH).toContain("orgId,");
        expect(BRANCH).toContain("userId: access.userId");
        // No second permission model, and `fin.read` is not restated here.
        expect(BRANCH).not.toContain("fin.read");
    });

    it("Health still evaluates its own grant — no authorization was hoisted or shared", () => {
        expect(CODE).toContain("buildHealthSafetyCardVM");
        expect(CODE).toContain("access: { permissionKeys: access.permissionKeys }");
    });
});

describe("forbidden and unavailable remain different answers", () => {
    it("THE GATE: the gate verdict travels with the VM so a refusal cannot read as an absence", () => {
        expect(CODE).toContain("type FinancialsProducerOutcome = { gateOk: boolean; vm: FinancialsCardVM | null }");
        expect(CODE).toMatch(/!financials\.value\?\.gateOk[\s\S]{0,80}state: "forbidden"/);
        // No household is still ordinary, and still checked first.
        expect(CODE.indexOf("!financialSubjectId")).toBeLessThan(CODE.indexOf("!financials.value?.gateOk"));
    });

    it("a rejected producer is still an error, not a refusal", () => {
        expect(CODE).toMatch(/financials\.status === "rejected"[\s\S]{0,60}state: "error"/);
    });

    it("denied Health still carries no data", () => {
        expect(CODE).toMatch(/permissionDenied[\s\S]{0,120}state: "forbidden", data: null/);
    });
});

describe("the concurrency is real, not merely rearranged", () => {
    /**
     * BEHAVIOURAL, and it corrected an overclaim of mine.
     *
     * The first version of this gate asserted the concurrent shape is simply faster. It failed —
     * 125 vs 125 — because in that model the Financials chain (gate + read) WAS the long pole, and
     * `allSettled` waits for the longest branch either way. The real relationship is:
     *
     *     serial      = gate + max(A, H, F)
     *     concurrent  =        max(A, H, gate + F)
     *
     * so the saving is the full gate duration when Attendance or Health is the long pole, and
     * ZERO when Financials is. Which of those holds on staging is not yet measured — the sub-spans
     * added in this slice are what will settle it.
     *
     * What is unconditionally true, and what these gates assert, is that the concurrent shape is
     * NEVER WORSE. That is the honest claim for this repair.
     */
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const serial = async (gate: number, a: number, h: number, f: number) => {
        const t0 = Date.now();
        await sleep(gate);
        await Promise.allSettled([sleep(a), sleep(h), sleep(f)]);
        return Date.now() - t0;
    };
    const concurrent = async (gate: number, a: number, h: number, f: number) => {
        const t0 = Date.now();
        await Promise.allSettled([
            sleep(a),
            sleep(h),
            (async () => { await sleep(gate); await sleep(f); })(),
        ]);
        return Date.now() - t0;
    };

    it("THE GATE: when Attendance or Health is the long pole, the gate cost disappears", async () => {
        // The case the repair exists for: a slow independent read absorbs the permission round trip.
        const serialMs = await serial(60, 120, 120, 20);
        const concurrentMs = await concurrent(60, 120, 120, 20);
        expect(serialMs).toBeGreaterThan(concurrentMs);
        expect(serialMs - concurrentMs).toBeGreaterThan(30);
    });

    it("when Financials is the long pole the repair is NEUTRAL — never worse, and not claimed better", async () => {
        const serialMs = await serial(60, 20, 20, 120);
        const concurrentMs = await concurrent(60, 20, 20, 120);
        // Equal within scheduler noise. The point is that it does not regress.
        expect(concurrentMs).toBeLessThanOrEqual(serialMs + 25);
    });

    it("the repaired branch really is one awaited chain inside the settled region", () => {
        // gate → build, as a single producer, so allSettled owns all three concurrently.
        expect((BRANCH.match(/await /g) ?? []).length).toBe(2);
    });
});

describe("the orchestrator's blast-radius promise survives", () => {
    it("all three producers still settle independently", () => {
        expect(CODE).toContain("Promise.allSettled([");
        expect(CODE).toContain("buildAttendanceCardVM");
        expect(CODE).toContain("buildHealthSafetyCardVM");
        expect(CODE).toContain("buildFinancialsCardVM");
    });

    it("one card can still never cost the operator the panel", () => {
        /*
         * THE GUARD MOVED WITH THE DERIVATION, AND THAT IS THE POINT.
         *
         * The producers no longer scan truth for the household id: the drawer route starts them
         * before a context exists, so the caller resolves it and states it. That relocated the
         * throw risk from the producers — where it cost one card — onto the compose path, where it
         * would have cost the whole drawer. So the same invariant is asserted at both places the
         * scan now happens, rather than deleted along with the line it used to describe.
         */
        const CONTRACT = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/operationalContext/buildOperationalContext.ts"),
            "utf8",
        );
        expect(CONTRACT).toMatch(
            /try \{[\s\S]{0,120}resolveFinancialSubjectIdFromTruth\(truth\)[\s\S]{0,80}catch/,
        );
        const COMMIT = readFileSync(
            join(process.cwd(), "lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"),
            "utf8",
        );
        expect(COMMIT).toMatch(
            /try \{[\s\S]{0,160}resolveFinancialSubjectId\(commitContext\)[\s\S]{0,80}catch/,
        );
        // And the producers must not have quietly regrown their own scan.
        expect(CODE).not.toContain("resolveFinancialSubjectId(context)");
    });
});
