/**
 * FIRST-ORDER PRODUCER OWNERSHIP — and the retirement of the overlap that preceded it.
 *
 * This file used to gate a two-stage compose that started the drawer's card producers as early as
 * possible. That was the right move while the drawer OWNED first-order card truth. It no longer
 * does: measured on f67114ca4 the drawer's producers recomputed answers the document had already
 * made — Financials arrived as an identical rerender — at a median 772ms on the settlement path.
 *
 * So the overlap is not optimised, it is GONE, along with the two-stage machinery that existed to
 * serve it. The document owns first-order producer truth for a navigation; the drawer owns the
 * view model, the process/current-work projections, and enrichment.
 *
 * These gates hold that ownership from both ends, because the failure mode is silent: if the
 * settled context ever substitutes its own cards again, the surface still renders — it just
 * re-renders, recomputes, and pays for it twice.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTE = codeOf(read("app/api/admin/view-models/drawer/opportunity/[id]/route.ts"));
const COMPOSER = codeOf(read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts"));
const CONTEXT = codeOf(read("lib/adminV2/runtime/operationalContext/buildOperationalContext.ts"));
const BODY = codeOf(read("components/admin/focusPanel/OpportunityFocusPanelBody.tsx"));

describe("the drawer no longer produces first-order card truth", () => {
    it("the route runs no card producers", () => {
        expect(ROUTE).not.toContain("projectFocusPanelCardProducers");
    });

    it("the route ships no producer cards on its projection", () => {
        // Absent `cards` is the contract's "provisioning" state, and that is now correct: the
        // browser keeps the document's, rather than being handed a second copy.
        expect(ROUTE).not.toContain("cards: producedCards");
    });

    it("the two-stage machinery that served the overlap is retired, not left dangling", () => {
        expect(COMPOSER).not.toContain("startOpportunityDrawerViewModelCompose");
        expect(COMPOSER).not.toContain("onParticipantContract");
        expect(ROUTE).not.toContain("staged.");
    });
});

describe("the document owns first-order producer truth", () => {
    it("the panel states the document's cards as the owner", () => {
        expect(BODY).toContain("firstOrderProducerCards");
        expect(BODY).toContain("commitCritical?.operationalProjection?.cards");
    });

    it("the context applies the stated owner to `cards` and nothing else", () => {
        /*
         * businessProcess and currentWork are pure projections of whichever context builds them,
         * and the settled one is legitimately richer. Only `cards` changes hands.
         */
        /*
         * The CALL SITE, not the symbol. Asserting the helper merely EXISTS passed while the
         * context had gone back to assigning the drawer's projection directly — the exact defect
         * this gate is for, sitting green.
         */
        const assignment = CONTEXT.slice(CONTEXT.indexOf("operationalProjection:"));
        expect(assignment.slice(0, 200)).toContain("firstOrderProducerCardsOwned(");
        const fn = CONTEXT.slice(CONTEXT.indexOf("function firstOrderProducerCardsOwned"));
        const body = fn.slice(0, fn.indexOf("\n}"));
        expect(body).toContain("cards: owned");
        expect(body).not.toContain("businessProcess");
        expect(body).not.toContain("currentWork");
    });

    it("states no opinion when the document produced no cards", () => {
        // `undefined` must stay distinguishable from "explicitly none": a frame that never ran the
        // producers must not be read as a frame that found nothing.
        const fn = CONTEXT.slice(CONTEXT.indexOf("function firstOrderProducerCardsOwned"));
        expect(fn.slice(0, fn.indexOf("\n}"))).toContain("owned === undefined");
    });
});

describe("ownership is stated, never merged", () => {
    it("no generic structural merge of the two projections exists", () => {
        for (const forbidden of [
            "...commitProjection",
            "...drawerProjection",
            "preferNonNull",
            "keepOldWhenMissing",
        ]) {
            expect(CONTEXT, `must not use ${forbidden}`).not.toContain(forbidden);
            expect(BODY, `must not use ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("cards change hands wholesale, never card-by-card", () => {
        /*
         * A half-owned producer set cannot say whether a missing card was "not rerun" or
         * "legitimately gone", so the owner replaces the set or states nothing at all.
         */
        const fn = CONTEXT.slice(CONTEXT.indexOf("function firstOrderProducerCardsOwned"));
        const body = fn.slice(0, fn.indexOf("\n}"));
        expect(body).not.toContain("attendance");
        expect(body).not.toContain("health");
        expect(body).not.toContain("financials");
    });
});

describe("authorization is untouched by the ownership change", () => {
    it("the route still resolves the gate before anything else", () => {
        expect(ROUTE.indexOf("await loadAdminRouteGate()")).toBeGreaterThan(-1);
    });

    it("no permission verdict rides with the owned cards", () => {
        const fn = CONTEXT.slice(CONTEXT.indexOf("function firstOrderProducerCardsOwned"));
        const body = fn.slice(0, fn.indexOf("\n}"));
        for (const forbidden of ["access", "grants", "roleKeys", "permission"]) {
            expect(body).not.toContain(forbidden);
        }
    });
});
