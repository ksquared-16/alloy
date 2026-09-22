/**
 * OUTER-COMPOSE SPAN DECOMPOSITION (P0-7.6 / Slice 12C).
 *
 * ── WHAT SLICE 12B GOT WRONG, AND WHY THIS SUITE EXISTS ──
 *
 * 12B measured `compose_wall_ms` minus the inner composer's `total_ms` at ~3,869 ms median — half
 * the entire document — and named it a PRELUDE. Source tracing for this slice shows that name was
 * wrong in a way that matters: the gap straddles the inner composer.
 * `composeProvisioningAnswerForRoute` has exactly three awaits, and one of them,
 * `projectFocusPanelCardProducers`, runs AFTER the inner composer returns and performs its own
 * database reads. Half the measured block was being attributed to "work before the compose" when
 * some of it is work after it.
 *
 * Had the repair been chosen from that label, it would have targeted route resolution — possibly
 * the wrong term entirely. These gates pin the decomposition so the dominant wait is chosen from
 * measurement, and so the two synchronous steps are proven cheap rather than assumed cheap.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE = readFileSync(
    join(process.cwd(), "lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"),
    "utf8",
);
const DIAG = readFileSync(join(process.cwd(), "lib/perf/routeTimingDiagnostic.ts"), "utf8");

/** Comments explain what was removed; only code may satisfy a "must not appear" assertion. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE_CODE = strip(ROUTE);
const DIAG_CODE = strip(DIAG);

describe("the outer compose names every await it performs", () => {
    it("THE GATE: all three awaits are measured, plus the two synchronous steps", () => {
        for (const span of [
            "route_identity_ms",   // await resolveWorkUnitRouteIdentity — BEFORE
            "inner_compose_ms",    // await composeWorkUnitProvisioningAnswer
            "card_producers_ms",   // await projectFocusPanelCardProducers — AFTER
            "admin_client_ms",     // sync — measured so "not this" is evidence, not assumption
            "document_actor_ms",   // sync — same
        ]) {
            expect(ROUTE_CODE, `outer compose must measure ${span}`).toContain(span);
            expect(DIAG_CODE, `payload must carry ${span}`).toContain(span);
        }
    });

    it("THE GATE: route identity is timed around the await, not around the call site", () => {
        const block = ROUTE_CODE.slice(
            ROUTE_CODE.indexOf("const tIdentity"),
            ROUTE_CODE.indexOf("if (!gate.ok)"),
        );
        expect(block).toContain("await resolveWorkUnitRouteIdentity");
        expect(block).toMatch(/routeIdentityMs\s*=\s*timing\s*\?\s*performance\.now\(\)\s*-\s*tIdentity/);
    });

    it("THE GATE: the card-producers span is the POSTLUDE — measured after the inner composer", () => {
        // The correction this slice exists to make. If this span were placed before the inner
        // compose, the decomposition would reproduce 12B's mislabelling.
        const innerAt = ROUTE_CODE.indexOf("await composeWorkUnitProvisioningAnswer");
        const producersAt = ROUTE_CODE.indexOf("await projectFocusPanelCardProducers");
        expect(innerAt).toBeGreaterThan(-1);
        expect(producersAt).toBeGreaterThan(innerAt);
        expect(ROUTE_CODE).toMatch(/cardProducersMs\s*=\s*timing\s*\?\s*performance\.now\(\)\s*-\s*tProducers/);

        /*
         * THE POSITION, NOT MERELY THE PRESENCE.
         *
         * An earlier version of this gate asserted only that the two awaits appear in order and
         * that the span is computed. Both stay true if `tProducers` is started BEFORE the inner
         * compose — which makes `card_producers_ms` silently include the entire inner composer and
         * reproduces exactly the mislabelling this slice exists to correct. The planted-defect run
         * proved that version green against that defect. The clock must START after the inner
         * compose has been measured.
         */
        const innerMeasuredAt = ROUTE_CODE.indexOf("const innerComposeMs");
        const producersClockAt = ROUTE_CODE.indexOf("const tProducers = mark()");
        expect(innerMeasuredAt).toBeGreaterThan(-1);
        expect(producersClockAt).toBeGreaterThan(-1);
        expect(
            producersClockAt,
            "the card-producers clock must start AFTER the inner compose is measured",
        ).toBeGreaterThan(innerMeasuredAt);
    });

    it("card_producers_ms is NULL when the producers step genuinely did not run", () => {
        // A non-operational answer skips it. Reporting 0 there would claim a measurement of work
        // that never happened — the same class of error as the stale literals 12A removed.
        expect(ROUTE_CODE).toMatch(/let cardProducersMs: number \| null = null/);
        expect(ROUTE_CODE).toMatch(/card_producers_ms: cardProducersMs == null \? null :/);
        expect(DIAG_CODE).toMatch(/card_producers_ms: number \| null/);
    });

    it("the outer boundaries remain authoritative — these spans are reported alongside, not instead", () => {
        expect(DIAG_CODE).toContain("compose_wall_ms");
        expect(DIAG_CODE).toContain("compose_total_ms");
        expect(DIAG_CODE).toContain("route_compose_spans");
    });
});

describe("one instrumentation authority", () => {
    it("THE GATE: the spans go through the EXISTING collector, not a new mechanism", () => {
        expect(ROUTE_CODE).toContain("recordRouteTiming({");
        expect(ROUTE_CODE).toContain("route_compose_spans:");
        // A second emitter or a private store would recreate the two-authority defect 12A removed.
        expect(ROUTE_CODE).not.toMatch(/new Map\(|globalThis\.__|RouteTimingSeed/);
    });

    it("every clock is behind the flag, and the flag is read once", () => {
        expect(ROUTE_CODE).toMatch(/const timing = routeTimingEnabled\(\)/);
        expect(ROUTE_CODE).toMatch(/const mark = \(\) => \(timing \? performance\.now\(\) : 0\)/);
        expect(ROUTE_CODE).toMatch(/if \(timing\) \{/);
    });

    it("THE GATE: diagnostics can never break the product path", () => {
        // This function also serves the HTTP seam, whose route handler may not provide the React
        // request scope the collector is built on. A diagnostic must not be load-bearing.
        const rec = ROUTE_CODE.slice(ROUTE_CODE.indexOf("if (timing) {"), ROUTE_CODE.length);
        expect(rec).toContain("try {");
        expect(rec).toMatch(/\} catch \{/);
    });

    it("no business or identifying value reaches the payload", () => {
        const block = ROUTE_CODE.slice(
            ROUTE_CODE.indexOf("route_compose_spans: {"),
            ROUTE_CODE.indexOf("return { ok: true, answer }"),
        );
        for (const forbidden of ["gate.orgId", "rawSlug", "recordOfAttention", "subjectId", "roleKeys"]) {
            expect(block, `payload must not carry ${forbidden}`).not.toContain(forbidden);
        }
    });
});

describe("the compose's own semantics are untouched", () => {
    it("THE GATE: the await list is exactly this, in this order", () => {
        /*
         * This began as "timing must observe the route, never change it" and caught exactly that:
         * it failed the moment Option A added a fourth await, which is what it is for.
         *
         * The fourth is deliberate and architectural, not instrumentation. The document resolves
         * the authoritative participation so the producers BELOW IT can answer Attendance and
         * Health — measured, both returned `unavailable` on every sample without it, and the
         * browser paid a second ~3,700ms round trip to learn what one indexed read already knew.
         * It cannot start earlier: `recordOfAttention` is CHOSEN by the compose, so the subject
         * does not exist until the compose returns. It is therefore one serial indexed read on
         * `process_instances`, knowingly added, in exchange for retiring the second trip.
         *
         * The list stays exact so the next addition has to argue for itself too.
         */
        /*
         * RE-ANCHORED, AND THE GATE WAS FOUND RED ON DEPLOYED STAGING.
         *
         * Slice 12F's producer overlap added `await earlyRef.run` and did not update this list, so
         * this gate has been failing on staging since that merge. It went unnoticed because no
         * REQUIRED CI check runs the general vitest suite — which is precisely the argument for
         * keeping the list exact rather than loosening it.
         *
         * It is also widened. The old pattern was `await (\w+)`, which sees only awaits on a bare
         * identifier: the two counted fallbacks this slice introduced are `await (async () => …)()`
         * and were invisible to it. A gate that cannot see a new await cannot make it argue for
         * itself, so every await is captured now and the IIFEs are named.
         *
         * The list, and why each one is allowed to exist:
         *   1 route identity        — the gate and the slug→unit read; nothing can precede it.
         *   2 composition           — the answer itself.
         *   3 participant (early)   — INSIDE the subject announcement, so it runs BESIDE 2.
         *   4 producers   (early)   — likewise; this is the overlap.
         *   5 earlyRef.run          — the join; it awaits work already in flight, not new work.
         *   6 participant fallback  — canonical re-read, only on a discarded speculation.
         *   7 producer fallback     — likewise. 6 and 7 are IIFEs ONLY so they can count
         *                             themselves for the overlap diagnostic.
         *
         * Awaits 3 and 4 are not serial additions to the critical path: they are the two that
         * moved off it. 6 and 7 do not run at all on the matching path.
         */
        const awaits = [...ROUTE_CODE.matchAll(/await\s+([A-Za-z_$][\w$.]*|\(async)/g)].map(
            (m) => m[1],
        );
        /*
         * EXTENDED for the WU-03 count seed, which is why this list is kept exact: it failed the
         * moment the seed added awaits, and each one has to argue for itself here.
         *
         *   3 Promise.all           — scope constraints + viewer timezone, the only two facts the
         *                             seed needs that the composer does not already hold. They are
         *                             gate-derived, so the route must resolve them; concurrent
         *                             with each other, and the whole listener runs BESIDE
         *                             composition rather than after it.
         *   4 resolveWorkViewTotalsSeed
         *                           — the counts themselves, inside the announcement listener.
         *   9  tourRef.run         — the tour signal's join. Started from the SAME
         *                             `onSubjectResolved` announcement as the participant read, so
         *                             it too awaits work already in flight. It is listed here
         *                             because it drifted in without argument once: the gate went
         *                             red, the list was not updated, and a red gate stops guarding
         *                             anything. `null` from it means NOT ESTABLISHED — never
         *                             "no tour" — so the join can settle honestly either way.
         *   11 seedRef.run          — the join. It awaits work already in flight, and whatever it
         *                             waits is published as `join_wait_ms`, the ADDED DOCUMENT
         *                             WAIT, rather than disappearing into page_total.
         *
         * None of these is a new serial step ahead of the answer: 3 and 4 run inside a listener
         * the composer fires mid-composition, and 9 and 11 are the joins for that work.
         */
        expect(awaits).toEqual([
            "resolveWorkUnitRouteIdentity",
            "composeWorkUnitProvisioningAnswer",
            "Promise.all",
            "resolveWorkViewTotalsSeed",
            "resolveSoleEnrollmentParticipantForOpportunity",
            "projectFocusPanelCardProducers",
            "earlyRef.run",
            "(async",
            "tourRef.run",
            "(async",
            /*
             * 11 runSettlement — the INLINE settlement join, taken only when the caller did NOT ask
             *                    for `deferSettlement`. The HTTP seam's consumer has no second
             *                    delivery to wait for, so it still receives one fully settled
             *                    answer and this await is how it gets one. The RSC route asks to
             *                    defer, and then this branch is not taken at all — pinned by the
             *                    next gate, which is the architectural property that moved
             *                    FIRST_AUTHORITATIVE_FRAME off the producer join.
             */
            "runSettlement",
            "seedRef.run",
        ]);
        /*
         * THE SEED MUST START FROM THE ANNOUNCEMENT, NOT FROM THE FINISHED ANSWER.
         *
         * If `resolveWorkViewTotalsSeed` were awaited after `composeWorkUnitProvisioningAnswer`
         * returned, the document would simply pay the old ~1.6s count wall serially — the exact
         * failure this slice exists to avoid, and one that every duration above would still look
         * healthy under.
         */
        const listenerAt = ROUTE_CODE.indexOf("onWorkViewCountTargetsResolved:");
        const seedCallAt = ROUTE_CODE.indexOf("await resolveWorkViewTotalsSeed(");
        const composeAt = ROUTE_CODE.indexOf("await composeWorkUnitProvisioningAnswer(");
        expect(listenerAt).toBeGreaterThan(-1);
        expect(seedCallAt).toBeGreaterThan(listenerAt);
        // The listener is an ARGUMENT to the compose call, so the seed sits inside it.
        expect(seedCallAt).toBeGreaterThan(composeAt);
        expect(ROUTE_CODE.indexOf("await seedRef.run")).toBeGreaterThan(seedCallAt);
        // The two IIFEs exist to COUNT, and for nothing else. An IIFE that wrapped real new work
        // would be a serial addition wearing a diagnostic's clothes.
        expect((ROUTE_CODE.match(/await \(async \(\) => \{/g) ?? []).length).toBe(2);
        for (const m of ROUTE_CODE.matchAll(/await \(async \(\) => \{([\s\S]{0,200}?)return /g)) {
            expect(m[1]).toMatch(/overlapDiag\.(producer_invocations|participant_reads) \+= 1;/);
        }
    });

    it("THE GATE: the deferred path starts the settlement and does NOT await it", () => {
        /*
         * The whole of two-phase emission rests on this. If `deferSettlement` ever came to await
         * `runSettlement()`, the frame would go back to waiting behind the card producers (740ms on
         * deployed a5eb2f29) and every measurement would look healthy while the architecture had
         * silently reverted.
         */
        const fork = ROUTE_CODE.slice(
            ROUTE_CODE.indexOf("if (input.deferSettlement) {"),
            ROUTE_CODE.indexOf("const tSeedJoin = mark();"),
        );
        expect(fork).toContain("deferredSettlement = runSettlement()");
        const deferredBranch = fork.slice(0, fork.indexOf("} else {"));
        expect(deferredBranch).not.toContain("await runSettlement");
        // and the inline branch must still settle, or the HTTP seam would ship an unsettled answer
        const inlineBranch = fork.slice(fork.indexOf("} else {"));
        expect(inlineBranch).toContain("await runSettlement()");
        expect(inlineBranch).toContain("applyProvisioningSettlement");
    });

    it("the document actor is still derived from the same gate, just measured", () => {
        expect(ROUTE_CODE).toContain("const documentActor = documentActorFromAdminGate(gate)");
        expect(ROUTE_CODE).toContain("documentActor: documentActor");
    });

    it("no sleep, delay or artificial serialization was introduced", () => {
        expect(ROUTE_CODE).not.toMatch(/setTimeout|await new Promise|sleep\(/);
    });
});

describe("the emission path preserves every span a deeper boundary stashed", () => {
    /**
     * THE DEFECT THIS EXISTS FOR, FOUND ON THE DEPLOYED BUILD AND NOT BY A TEST.
     *
     * `recordRouteTiming` replaces whole fields, so the outer compose has to rebuild
     * `route_compose_spans` from whatever the producers already stashed there. It used to restate
     * `producers` BY NAME. Slice 12E added `financials` one level deeper; the build recorded it
     * correctly, nineteen local gates passed — and every deployed sample carried `financials: null`,
     * because this one line dropped it on the way out.
     *
     * Nothing proved EMISSION. The gates proved the spans were RECORDED, which is the same class of
     * mistake this programme has now made often enough to name: a test that asserts a mechanism
     * EXISTS cannot certify that it TAKES EFFECT.
     */
    it("THE GATE: the outer write spreads the stashed object rather than naming its fields", () => {
        const block = ROUTE_CODE.slice(
            ROUTE_CODE.indexOf("const already = collectedRouteTiming()"),
            ROUTE_CODE.indexOf("card_producers_ms:", ROUTE_CODE.indexOf("const already = collectedRouteTiming()")),
        );
        expect(block).toMatch(/\.\.\.\(already \?\? \{\}\)/);
        // A by-name restatement is exactly the defect: it survives review, passes every recorder
        // test, and silently drops the next field somebody adds.
        expect(block, "a nested span is being restated by name and will drop the next one")
            .not.toMatch(/already\?\.\w+ \? \{/);
    });

    it("the collector's merge cannot be exercised in-process — and that is recorded, not hidden", () => {
        /*
         * `routeTimingCollector` is a React `cache()`. Under vitest there is no request scope, so a
         * write and a read return DIFFERENT objects and any behavioural assertion here would be
         * testing the harness, not the seam. An earlier version of this test did exactly that and
         * failed for that reason.
         *
         * So the binding assertion is the source gate above — it fails on the exact line that
         * dropped `financials` — and the OUTCOME proof is the deployed payload, which is owed with
         * the next promotion. Stating the limit is the point: a green test here would have been the
         * same false comfort that let the defect reach staging.
         */
        expect(DIAG_CODE).toContain("export const routeTimingCollector = cache(");
        expect(ROUTE_CODE).toContain("collectedRouteTiming()");
    });
});
