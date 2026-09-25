/**
 * THE DOCUMENT'S AUTHORITATIVE CHILDREN ANSWER.
 *
 * Children was the last blocking first-order area that genuinely required the second round trip.
 * The tempting fix — routing the intake metadata the queue already carries into commit truth — was
 * rejected on CORRECTNESS, not cost: the card's headline count is
 * `rows.filter(r => r.outcome_status_key !== "declined")`, and intake metadata has no
 * `outcome_status_key`, so a declined child would be counted as enrolling. A wrong number presented
 * as authoritative is worse than a reserved cell.
 *
 * These gates hold four things the first attempt (#1086, reverted) got wrong or never proved:
 *   1. the canonical owner runs, and no second children model appears;
 *   2. NO new columns ride on the population read — that is what broke staging;
 *   3. the answer is awaited BEFORE the commit context is built, and reaches BOTH consumers;
 *   4. "not loaded" stays distinct from the authoritative empty answer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments must not satisfy a gate: every assertion below reads CODE. */
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ANSWER = codeOf(read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts"));
const POP = codeOf(read("lib/runtime/provisioning/workUnitProcessPopulation.ts"));

describe("gate A — the canonical owner, not a parallel children model", () => {
    it("the document runs the same children-shell owner the drawer runs", () => {
        expect(ANSWER).toContain("attachOpportunityInquiryChildrenShell(");
    });

    it("no second children mapper or metadata substitution is introduced", () => {
        // #1075's failure mode, and the reason the cheap metadata transport was refused.
        expect(ANSWER).not.toContain("mapRawInquiryChildrenToDrawerRows");
        expect(ANSWER).not.toContain("readMetadataInquiryChildren");
    });
});

describe("gate B — the stale-query class that broke staging stays closed", () => {
    /*
     * THIS GATE IS INVERTED FROM THE ONE THAT SHIPPED WITH #1086.
     *
     * That gate asserted the population select CONTAINED `program_type` and `schedule_type`, on the
     * reasoning that the shell reads them as the opportunity-level defaults a child falls back to.
     * Neither column exists on `opportunities`. The deployed answer became
     * "records unavailable: column opportunities.program_type does not exist", rows=0, valid=false,
     * and staging lost every card — while this gate stayed green, because it was asserting the
     * defect was present.
     *
     * They are vestigial on the DRAWER path too: OPPORTUNITY_CANONICAL_ADMIN_SELECT does not carry
     * them either, so `oppDefaultProgramType` has always resolved to null in production. Adding
     * them was not merely wrong, it was unnecessary.
     */
    it("the population select names no column that does not exist on opportunities", () => {
        const select = /PROCESS_POPULATION_SELECT\s*=\s*\n?\s*"([^"]+)"/.exec(POP)?.[1] ?? "";
        expect(select.length).toBeGreaterThan(0);
        const columns = select.split(",").map((c) => c.trim());
        expect(columns).not.toContain("program_type");
        expect(columns).not.toContain("schedule_type");
    });

    it("the children slice adds no column to the population read at all", () => {
        // Tokenised, not substring: `program_type` is a substring of nothing here, but a future
        // `desired_program_type` would pass a naive `.includes` check.
        for (const banned of ["program_type", "schedule_type"]) {
            expect(POP.split(/[^a-z_]/).filter((t) => t === banned)).toHaveLength(0);
        }
    });
});

describe("gate C — awaited before commit, delivered to both consumers", () => {
    /*
     * THE EXACT DEFECT OF THE FIRST ATTEMPT. It awaited the chain AFTER
     * `buildCommitCriticalOperationalContext` and folded the rows only into the answer payload —
     * and then never referenced the folded value at all. Even with a working query the commit
     * context would have carried the children-less bag, the predicate would have stayed false, and
     * the card would still have waited for the drawer. The slice would have measured as a no-op.
     */
    /*
     * THE WAIT WAS REMOVED ON PURPOSE, AND THE ORDERING REQUIREMENT SURVIVED IT.
     *
     * These two gates used to assert `await documentChildrenP` before the commit context, and that
     * await is gone: P0-7.6 made the roster OBSERVED rather than awaited, because
     * `document_children_tail_ms` was P50 786ms of the 1,596ms the frame spent holding an
     * already-decided geometry. The card's absent state was always the honest one — absent means
     * "not loaded", never the authoritative `[]`.
     *
     * What did NOT change is the ordering the original slice discovered the hard way: whatever HAS
     * landed must be READ and folded before the commit context is built, or the context carries the
     * children-less bag and folding buys nothing. That is what these now assert.
     */
    it("the children answer is READ before the commit-critical context is built", () => {
        const read = ANSWER.indexOf("documentChildrenSettled.value");
        const commitCtx = ANSWER.indexOf("buildCommitCriticalOperationalContext(");
        expect(read).toBeGreaterThan(-1);
        expect(commitCtx).toBeGreaterThan(-1);
        expect(read).toBeLessThan(commitCtx);
    });

    it("the frame does not WAIT for it — the roster is observed, not awaited", () => {
        // The specific regression this guards: restoring the await would silently put the frame
        // back behind the roster and every latency measurement would still look healthy.
        expect(ANSWER).not.toContain("await documentChildrenP");
        expect(ANSWER).toContain("settledNow(documentChildrenP)");
    });

    it("the chain STARTS well before it is read, so it overlaps the composition", () => {
        const started = ANSWER.indexOf("attachOpportunityInquiryChildrenShell(");
        const read = ANSWER.indexOf("documentChildrenSettled.value");
        expect(started).toBeGreaterThan(-1);
        expect(started).toBeLessThan(read);
    });

    it("the folded bag — not the bare one — reaches the commit context AND the answer", () => {
        const uses = ANSWER.split("subjectIdentityTruth: subjectIdentityTruthWithChildren").length - 1;
        expect(uses).toBe(2);
        // And the bare binding is no longer handed to either consumer.
        expect(ANSWER).not.toMatch(/\n\s+subjectIdentityTruth,\n\s+subjectGrain,\n\s+\}\);/);
    });
});

describe("gate D — not loaded is not the same answer as no children", () => {
    it("a failed chain resolves to null, never to an empty array", () => {
        /*
         * Anchored to THIS chain. An unanchored `/\.catch\(/` matched the first of several
         * identical handlers elsewhere in the composer and asserted nothing about the children
         * answer — green while the branch it names could say anything.
         */
        const chain = ANSWER.slice(
            ANSWER.indexOf("const documentChildrenP"),
            ANSWER.indexOf("const t_children_join"),
        );
        expect(chain.length).toBeGreaterThan(0);
        const catchBlock = /\.catch\([\s\S]*$/.exec(chain)?.[0] ?? "";
        expect(catchBlock).toContain("return null");
        expect(catchBlock).not.toContain("return []");
    });

    it("the bag is folded only when rows came back, so absent leaves the predicate false", () => {
        const fold = /subjectIdentityTruthWithChildren[\s\S]{0,260}?;/.exec(ANSWER)?.[0] ?? "";
        expect(fold).toContain("documentChildren");
        expect(fold).toContain("_inquiry_children: documentChildren");
        // The false branch must hand back the ORIGINAL bag, not an empty children key.
        expect(fold).toMatch(/:\s*subjectIdentityTruth\s*;/);
    });

    it("the loaded-empty answer [] still folds — it is authoritative, not absent", () => {
        /*
         * `[]` is truthy in JS, so the ternary carries it. Stated as a gate because a reviewer
         * reaching for `documentChildren?.length` would silently convert the authoritative "this
         * family has no children" into "not loaded", and the card would reserve forever.
         */
        const fold = /subjectIdentityTruthWithChildren[\s\S]{0,260}?;/.exec(ANSWER)?.[0] ?? "";
        expect(fold).not.toContain("documentChildren?.length");
        expect(fold).not.toContain("documentChildren.length");
    });
});

describe("gate E — the document carries rows whole; the card decides the headline", () => {
    it("the document does not pre-filter declined children", () => {
        /*
         * The headline count excludes declined, but that exclusion belongs to the card
         * (`deriveOpportunityFocusPanelCards`). If the document filtered too, the ROW LIST would
         * silently lose declined children, which the card is supposed to still show.
         */
        const slice = ANSWER.slice(
            ANSWER.indexOf("const childrenHost"),
            ANSWER.indexOf("await documentChildrenP"),
        );
        expect(slice.length).toBeGreaterThan(0);
        expect(slice).not.toContain("declined");
    });

    it("the shell writes onto a COPY, so page rows never acquire the children key", () => {
        expect(ANSWER).toMatch(/const childrenHost[\s\S]{0,120}\.\.\.\(subjectRow as Record<string, unknown>\)/);
    });
});
