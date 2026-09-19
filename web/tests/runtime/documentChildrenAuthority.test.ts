/**
 * THE DOCUMENT'S AUTHORITATIVE CHILDREN ANSWER.
 *
 * Children was the last blocking area that required the second round trip. The tempting fix —
 * routing the intake metadata the queue already carries into commit truth — was rejected on
 * correctness, not cost: the card's headline count is
 * `rows.filter(r => r.outcome_status_key !== "declined")`, and intake metadata has no
 * `outcome_status_key`, so a declined child would be counted as enrolling. A wrong number
 * presented as authoritative is worse than a reserved cell.
 *
 * These gates hold the authority, the single owner, and the distinction between "not loaded" and
 * the authoritative empty answer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ANSWER = codeOf(read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts"));
const POP = codeOf(read("lib/runtime/provisioning/workUnitProcessPopulation.ts"));
const PLATFORM = codeOf(read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts"));

describe("gate A — the canonical owner, not intake metadata", () => {
    it("the document runs the same children-shell owner the drawer runs", () => {
        expect(ANSWER).toContain("attachOpportunityInquiryChildrenShell");
    });

    it("no second children mapper or metadata substitution is introduced", () => {
        // #1075's failure mode, and the reason the cheap transport was refused.
        expect(ANSWER).not.toContain("readMetadataInquiryChildren");
        expect(ANSWER).not.toContain("mapRawInquiryChildrenToDrawerRows");
    });
});

describe("gate B — the shell's real inputs are supplied, not defaulted away", () => {
    it("the population read carries the opportunity-level program and schedule defaults", () => {
        /*
         * The shell uses these as the values a child row falls back to when it names none. Absent,
         * every child silently loses its program/schedule label — a presentation defect that looks
         * like missing data rather than a bug.
         */
        expect(POP).toContain("program_type");
        expect(POP).toContain("schedule_type");
    });
});

describe("gate C — not-loaded is not the same answer as no children", () => {
    it("the identity bag carries the rows only when the chain actually returned them", () => {
        const guard = ANSWER.slice(ANSWER.indexOf("subjectIdentityTruthWithChildren"));
        expect(guard.slice(0, 400)).toContain("documentChildren");
        // A ternary, not a spread of a possibly-null value: absent must leave the bag untouched.
        expect(guard.slice(0, 400)).toContain("?");
    });

    it("a failed chain resolves to null rather than to an empty roster", () => {
        const chain = ANSWER.slice(ANSWER.indexOf("const documentChildrenP"));
        expect(chain.slice(0, 500)).toContain(".catch(() => null)");
        // `[]` from the shell is a real loaded-empty answer and must survive as `[]`, not null.
        expect(chain.slice(0, 500)).toContain("Array.isArray");
    });
});

describe("gate D — the domain owns its truth keys, the platform stays opaque", () => {
    it("the platform work-mode builder never names a domain children key", () => {
        /*
         * The first attempt put `_inquiry_children` in the platform builder and the
         * domain/platform boundary gate rejected it. Keeping that assertion here too, next to the
         * code that would be tempted to reintroduce it.
         */
        expect(PLATFORM).not.toContain("_inquiry_children");
    });

    it("the domain composer is the one that states the key", () => {
        expect(ANSWER).toContain("_inquiry_children");
    });
});

describe("gate E — concurrency, not serialization", () => {
    it("the chain starts before the composition it must not wait for", () => {
        const start = ANSWER.indexOf("const documentChildrenP");
        const awaited = ANSWER.indexOf("await documentChildrenP");
        expect(start).toBeGreaterThan(-1);
        expect(awaited).toBeGreaterThan(start);
        // Anything other than a wide gap means it was quietly serialised back.
        expect(ANSWER.slice(start, awaited).length).toBeGreaterThan(2000);
    });

    it("the chain is started without being immediately awaited", () => {
        const start = ANSWER.indexOf("const documentChildrenP");
        expect(ANSWER.slice(start, start + 60)).not.toContain("await");
    });
});

describe("gate F — authorization and actor are the document's own", () => {
    it("the same document actor is used, so photo semantics are unchanged", () => {
        const chain = ANSWER.slice(ANSWER.indexOf("const documentChildrenP"));
        expect(chain.slice(0, 500)).toContain("req.documentActor");
    });

    it("no permission answer rides with the children rows", () => {
        const guard = ANSWER.slice(ANSWER.indexOf("subjectIdentityTruthWithChildren"));
        for (const forbidden of ["access", "grants", "roleKeys", "permission"]) {
            expect(guard.slice(0, 400)).not.toContain(forbidden);
        }
    });
});
