/**
 * @vitest-environment jsdom
 *
 * P0-7.6 PART 0 — THE CONVERGENCE ORACLE MUST SEE TEXT CHANGES.
 *
 * ── THE DEFECT THIS PINS ────────────────────────────────────────────────────────────────────────
 *
 * A `characterData` mutation has NO added or removed nodes. Downstream convergence analysis
 * compared `addedFp` with `removedFp` and, finding both empty, scored the mutation "same-value".
 *
 * The Business Process collapsed activity count is exactly such a mutation. So a real
 * authoritative correction — the count changing when the drawer settled — read as convergence,
 * and a Gate A "0 CHANGED" was reported on that basis for two runs.
 *
 * The probe's own classifier was never wrong: it has `characterDataOldValue` and compares the text
 * (`now === was ? IDENTICAL_RERENDER : AUTHORITATIVE_CONTENT_CHANGE`). What was missing was the
 * EVIDENCE in the record, so no consumer could check.
 *
 * These tests pin both halves: the classification, and the evidence that makes it auditable.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { installVisibleCompletionProbe } from "../../playwright/support/visibleCompletionProbe";

type Rec = Record<string, unknown>;
const post = () => (window as unknown as { __p076post?: { armed: boolean; records: Rec[] } }).__p076post!;

/** MutationObserver batches on a microtask; let it flush. */
const flush = () => new Promise((r) => setTimeout(r, 20));

function mountActivityCount(text: string, stage2 = false) {
    document.body.innerHTML = `
        <div data-alloy-section-id="WU-09" data-alloy-section-blocking="true">
            <article data-universal-card-key="business_process">
                <p class="alloy-os-process__stage">Lead</p>
                <div class="alloy-os-process__foot-right"${stage2 ? ' data-alloy-stage2-enrichment="true"' : ""}>
                    <button class="alloy-os-process__activity-trigger">
                        Recent activity<span class="alloy-os-process__activity-count">${text}</span>
                    </button>
                </div>
            </article>
        </div>`;
    return document.querySelector(".alloy-os-process__activity-count")!.firstChild!;
}

beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as unknown as Rec).__p076;
    delete (window as unknown as Rec).__p076post;
});

describe("a changed activity count is an AUTHORITATIVE_CONTENT_CHANGE", () => {
    it('"1" -> "2" is classified as a content change, not a same-value rerender', async () => {
        const node = mountActivityCount("1");
        installVisibleCompletionProbe();
        post().armed = true;

        node.nodeValue = "2";
        await flush();

        const cd = post().records.filter((r) => r.type === "characterData");
        expect(cd.length, "the mutation must be recorded at all").toBeGreaterThan(0);
        const hit = cd.find((r) => r.textAfter === "2")!;
        expect(hit, "a record carrying the new text must exist").toBeTruthy();
        expect(hit.kind21).toBe("AUTHORITATIVE_CONTENT_CHANGE");
        expect(hit.advancesFinality).toBe(true);
    });

    it("carries the text either side, so the claim is auditable", async () => {
        const node = mountActivityCount("1");
        installVisibleCompletionProbe();
        post().armed = true;

        node.nodeValue = "2";
        await flush();

        const hit = post().records.find((r) => r.type === "characterData" && r.textAfter === "2")!;
        expect(hit.textBefore).toBe("1");
        expect(hit.textAfter).toBe("2");
    });

    it('an unchanged rewrite ("1" -> "1") stays IDENTICAL_RERENDER', async () => {
        const node = mountActivityCount("1");
        installVisibleCompletionProbe();
        post().armed = true;

        node.nodeValue = "1";
        await flush();

        const cd = post().records.filter((r) => r.type === "characterData");
        for (const r of cd) {
            expect(r.kind21).toBe("IDENTICAL_RERENDER");
            expect(r.advancesFinality).not.toBe(true);
        }
    });
});

describe("PLANT — the old fingerprint-only rule must fail here", () => {
    it("a characterData record cannot be judged by added/removed fingerprints", async () => {
        const node = mountActivityCount("1");
        installVisibleCompletionProbe();
        post().armed = true;

        node.nodeValue = "2";
        await flush();

        const hit = post().records.find((r) => r.type === "characterData" && r.textAfter === "2")!;

        /*
         * THE OLD CLASSIFIER, verbatim: "both fingerprint lists are equal, therefore same value".
         * On a characterData record both are empty, so it returns TRUE — which is exactly how a
         * real correction was scored as convergence.
         */
        const oldRuleSaysSameValue = (hit.addedFp ?? "") === (hit.removedFp ?? "");
        expect(oldRuleSaysSameValue, "the old rule is wrong here by construction").toBe(true);

        // And the record now refutes it outright.
        expect(hit.textBefore).not.toBe(hit.textAfter);
        expect(hit.kind21).toBe("AUTHORITATIVE_CONTENT_CHANGE");

        /*
         * `identical` is deliberately NULL for characterData rather than `true`, so a consumer
         * reading it cannot repeat the mistake by accident.
         */
        expect(hit.identical).toBeNull();
    });
});


/**
 * THE PRODUCT CONTRACT, ENFORCED.
 *
 * `firstOrderWorkUnitProjection` names "Recent activity" among the things Stage 2 may supply and
 * first order deliberately omits, and `business_process` declares six firstOrderFields, none of
 * them activity. So the count's late arrival may not decide when the first-order surface became
 * authoritative.
 */
describe("Stage-2 enrichment does not own first-order finality", () => {
    it("the activity count inside a declared Stage-2 subtree does NOT advance finality", async () => {
        const node = mountActivityCount("1", true);
        installVisibleCompletionProbe();
        post().armed = true;

        node.nodeValue = "2";
        await flush();

        const cd = post().records.filter((r) => r.type === "characterData");
        expect(cd.length).toBeGreaterThan(0);
        for (const r of cd) {
            expect(r.kind21).toBe("STAGE2_ENRICHMENT");
            expect(r.advancesFinality).not.toBe(true);
        }
    });

    it("PLANT — without the marker the same mutation DOES advance finality", async () => {
        const node = mountActivityCount("1", false);
        installVisibleCompletionProbe();
        post().armed = true;

        node.nodeValue = "2";
        await flush();

        const hit = post().records.find((r) => r.type === "characterData" && r.textAfter === "2")!;
        expect(hit.kind21).toBe("AUTHORITATIVE_CONTENT_CHANGE");
        expect(hit.advancesFinality).toBe(true);
    });

    it("the marker's reach is EXACTLY its subtree — a sibling correction still advances", async () => {
        /*
         * The danger of an exclusion marker is over-reach: mark too much and the metric goes quiet
         * about a real correction. A change to the stage label — first-order, and a sibling of the
         * marked affordance — must still count.
         */
        mountActivityCount("1", true);
        installVisibleCompletionProbe();
        post().armed = true;

        document.querySelector(".alloy-os-process__stage")!.firstChild!.nodeValue = "New Lead";
        await flush();

        const hit = post().records.find((r) => r.type === "characterData" && r.textAfter === "New Lead")!;
        expect(hit, "the sibling mutation must be recorded").toBeTruthy();
        expect(hit.kind21).toBe("AUTHORITATIVE_CONTENT_CHANGE");
        expect(hit.advancesFinality).toBe(true);
    });
});
