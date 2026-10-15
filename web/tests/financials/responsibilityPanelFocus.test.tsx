// @vitest-environment jsdom
/**
 * W7-F003C — A FIXED-AMOUNT FIELD MUST KEEP FOCUS ACROSS MORE THAN ONE CHARACTER.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────────────────────
 *
 * The panel's root was `<section tabIndex={-1} ref={(el) => el?.focus({ preventScroll: true })}>`.
 * An inline ref callback is a NEW FUNCTION IDENTITY on every render, so React detaches and
 * re-attaches it each time — calling `.focus()` again. The amount being typed is the panel's own
 * state, so every keystroke re-rendered the panel and the section took focus back.
 *
 * Reproduced on the deployed build before the repair: typing `1` left `document.activeElement` as
 * the SECTION, and the following `3` went nowhere — the field still read `1`. That is the
 * Director's report exactly: "entering 13 requires re-entering after the first digit".
 *
 * ── WHY THIS TEST DRIVES THE REAL COMPONENT ──────────────────────────────────────────────────
 *
 * A source lock asserting "no inline focusing ref" would pass against any number of other ways to
 * steal focus. The only claim worth making is the operator's: two characters typed in sequence stay
 * in the field and produce the number that was typed. So this mounts the panel and types.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinancialsResponsibilityPanel from "@/app/adminV2/financials/FinancialsResponsibilityPanel";

const CUSTOMER = "c0000000-0000-4000-8000-000000000001";
const PARTY_A = "p0000000-0000-4000-8000-00000000000a";
const PARTY_B = "p0000000-0000-4000-8000-00000000000b";
const PARTY_C = "p0000000-0000-4000-8000-00000000000c";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    /*
     * The panel reads its candidates and the scope arrangement over fetch. Neither is what this
     * test is about, so both answer immediately and deterministically — the point is what typing
     * does once rows exist.
     */
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("responsibility-candidates")) {
            return new Response(JSON.stringify({
                ok: true,
                candidates: [
                    { personId: PARTY_A, name: "Dana Alvarez", roleLabel: null },
                    { personId: PARTY_B, name: "Rosa Alvarez", roleLabel: null },
                ],
            }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }));
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

function amountInputs(): HTMLInputElement[] {
    return Array.from(
        document.querySelectorAll('input[data-financials-responsibility-share][data-share-method="fixed"]'),
    ) as HTMLInputElement[];
}

/** One character, through the path React listens on, with the element focused as a user leaves it. */
function typeChar(input: HTMLInputElement, char: string) {
    input.focus();
    const next = `${input.value}${char}`;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("W7-F003C — the responsibility amount field keeps focus while it is typed into", () => {
    it("accepts two characters in sequence and keeps them both", async () => {
        await act(async () => {
            root.render(
                <FinancialsResponsibilityPanel
                    customerId={CUSTOMER}
                    customerMemberId={null}
                    parties={[{ personId: PARTY_A, name: "Dana Alvarez" }]}
                    hostedOpen
                    onCommitted={() => {}}
                />,
            );
        });
        /* Let the candidate load resolve and the rows appear. */
        await act(async () => { await Promise.resolve(); });
        await act(async () => { await Promise.resolve(); });

        const inputs = amountInputs();
        expect(inputs.length, "the panel rendered amount fields").toBeGreaterThan(0);
        const field = inputs[0]!;

        await act(async () => { typeChar(field, "1"); });

        /*
         * THE ASSERTION THE DEFECT FAILED. Before the repair the section had taken focus back by
         * this point, so the next character was typed into nothing.
         */
        const live = amountInputs()[0]!;
        expect(
            document.activeElement,
            "focus stayed in the amount field after the first character",
        ).toBe(live);

        await act(async () => { typeChar(live, "3"); });

        const settled = amountInputs()[0]!;
        expect(settled.value, "both characters landed").toBe("13");
        expect(document.activeElement, "focus is still in the field").toBe(settled);
    });
});

describe("W7-F003A — eligible is not the same as responsible", () => {
    /**
     * A charge split between two people opened showing THREE editable parties, the third holding no
     * responsibility at all and indistinguishable from the two who did. The rows are now what the
     * arrangement says today; everyone else eligible is offered as an explicit act.
     */
    it("seeds the rows from the CURRENT arrangement and offers the rest to add", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("responsibility-candidates")) {
                return new Response(JSON.stringify({
                    ok: true,
                    candidates: [
                        { personId: PARTY_A, name: "Dana Alvarez", roleLabel: null },
                        { personId: PARTY_B, name: "Rosa Alvarez", roleLabel: null },
                        { personId: PARTY_C, name: "Corinne Vasquez", roleLabel: null },
                    ],
                }), { status: 200, headers: { "content-type": "application/json" } });
            }
            if (url.includes("responsibility-arrangement")) {
                /* The Director's case: 50/50 between two of the three. */
                return new Response(JSON.stringify({
                    requestedScope: { grain: "household" },
                    authoredAtRequestedScope: true,
                    arrangement: {
                        id: "arr-1",
                        customerMemberId: null,
                        effectiveStart: "2026-01-01",
                        effectiveEnd: null,
                        shares: [
                            { id: "s1", responsiblePartyId: PARTY_A, name: "Dana Alvarez", amountCents: 900, percentBasisPoints: null, method: "fixed" },
                            { id: "s2", responsiblePartyId: PARTY_B, name: "Rosa Alvarez", amountCents: 900, percentBasisPoints: null, method: "fixed" },
                        ],
                    },
                }), { status: 200, headers: { "content-type": "application/json" } });
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
        }));

        await act(async () => {
            root.render(
                <FinancialsResponsibilityPanel
                    customerId={CUSTOMER}
                    customerMemberId={null}
                    parties={[{ personId: PARTY_A, name: "Dana Alvarez" }]}
                    hostedOpen
                    onCommitted={() => {}}
                />,
            );
        });
        for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });

        const rows = Array.from(document.querySelectorAll("[data-financials-responsibility-share]"));
        const parties = rows.map((el) => el.getAttribute("data-financials-responsibility-share"));

        /* Only the two who actually hold responsibility are editable rows. */
        expect(parties).toContain(PARTY_A);
        expect(parties).toContain(PARTY_B);
        expect(parties, "the third eligible person is not presented as already responsible").not.toContain(PARTY_C);

        /* And their CURRENT split is what is shown, not a blank field. */
        const amounts = (rows.filter((e) => e.tagName === "INPUT") as HTMLInputElement[]).map((e) => e.value);
        expect(amounts, "the current split seeds the fields").toEqual(["9.00", "9.00"]);

        /* The third is reachable, as a deliberate act. */
        const add = document.querySelector(`[data-financials-responsibility-add="${PARTY_C}"]`);
        expect(add, "the eligible non-party is offered through an explicit add").not.toBeNull();
        expect((add as HTMLElement).innerText || (add as HTMLElement).textContent).toContain("Corinne Vasquez");
    });
});

describe("W7-F003D — the primary control states what it will do, and nothing commits unseen", () => {
    /**
     * The Director's finding was a dead primary action with no visible unmet requirement. The first
     * repair stated the requirement; the Director then asked whether a separate mandatory Preview
     * click was needed at all. It is not — so the panel now has ONE primary control in two stages,
     * and these cases drive it the way an operator does.
     */
    function primary(): HTMLButtonElement {
        return document.querySelector("[data-financials-responsibility-stage]") as HTMLButtonElement;
    }
    function label(el: HTMLElement): string {
        return (el.textContent ?? "").trim();
    }

    /** A 50/50 arrangement, so the shares seed to a split that reconciles. */
    function arrangementResponse(): Response {
        return new Response(JSON.stringify({
            requestedScope: { grain: "household" },
            authoredAtRequestedScope: true,
            arrangement: {
                id: "arr-1",
                customerMemberId: null,
                effectiveStart: "2026-01-01",
                effectiveEnd: null,
                shares: [
                    { id: "s1", responsiblePartyId: PARTY_A, name: "Dana Alvarez", amountCents: 900, percentBasisPoints: null, method: "fixed" },
                    { id: "s2", responsiblePartyId: PARTY_B, name: "Rosa Alvarez", amountCents: 900, percentBasisPoints: null, method: "fixed" },
                ],
            },
        }), { status: 200, headers: { "content-type": "application/json" } });
    }

    /** Whatever the command is asked, it answers with a preview. */
    function commandPreview(summary: string): Response {
        return new Response(JSON.stringify({
            ok: true,
            data: { execution_result: { preview: { summary, changes: ["Dana 9.00", "Rosa 9.00"] } } },
        }), { status: 200, headers: { "content-type": "application/json" } });
    }

    async function mount() {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("responsibility-candidates")) {
                return new Response(JSON.stringify({
                    ok: true,
                    candidates: [
                        { personId: PARTY_A, name: "Dana Alvarez", roleLabel: null },
                        { personId: PARTY_B, name: "Rosa Alvarez", roleLabel: null },
                    ],
                }), { status: 200, headers: { "content-type": "application/json" } });
            }
            if (url.includes("responsibility-arrangement")) return arrangementResponse();
            return commandPreview("Two parties, 50/50.");
        }));
        await act(async () => {
            root.render(
                <FinancialsResponsibilityPanel
                    customerId={CUSTOMER}
                    customerMemberId={null}
                    parties={[{ personId: PARTY_A, name: "Dana Alvarez" }]}
                    hostedOpen
                    onCommitted={() => {}}
                />,
            );
        });
        for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); });
    }

    it("opens live, named for the review it is about to perform — not disabled and silent", async () => {
        await mount();
        const button = primary();
        expect(button, "there is one primary control").not.toBeNull();
        expect(button.getAttribute("data-financials-responsibility-stage")).toBe("review");
        expect(label(button)).toBe("Review this change");
        /*
         * THE ASSERTION THE DEFECT FAILED. Before the repair the primary was Confirm, disabled,
         * with no sentence anywhere saying why — measured on deployed as `confirmDisabled: true`,
         * `reconciliationMessage: null`, `anyVisibleRequirement: false`. A reconcilable split now
         * opens with a live primary and no hidden precondition at all.
         */
        expect(button.disabled, "the primary is live when nothing is unmet").toBe(false);
        /* And it says which half of the sequence it performs, before being pressed. */
        const hint = document.querySelector("[data-financials-responsibility-stage-hint]") as HTMLElement;
        expect(hint, "the stage is stated").not.toBeNull();
        expect(hint.textContent).toContain("Nothing is saved yet");
    });

    it("whenever the primary IS disabled, the unmet requirement is on screen", async () => {
        /*
         * The rule the Director set, asserted against the state that actually produces it: a split
         * with no amounts cannot reconcile, so the control is refused — and the reason is rendered
         * beside it rather than left for the operator to deduce.
         */
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("responsibility-candidates")) {
                return new Response(JSON.stringify({
                    ok: true,
                    candidates: [{ personId: PARTY_A, name: "Dana Alvarez", roleLabel: null }],
                }), { status: 200, headers: { "content-type": "application/json" } });
            }
            /* No arrangement exists, so the rows seed blank and the split cannot reconcile. */
            return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
        }));
        await act(async () => {
            root.render(
                <FinancialsResponsibilityPanel
                    customerId={CUSTOMER}
                    customerMemberId={null}
                    parties={[{ personId: PARTY_A, name: "Dana Alvarez" }]}
                    hostedOpen
                    onCommitted={() => {}}
                />,
            );
        });
        for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); });

        const button = primary();
        expect(button.disabled, "a split that cannot reconcile is refused").toBe(true);
        const blocker = document.querySelector("[data-financials-responsibility-confirm-blocker]") as HTMLElement;
        expect(blocker, "and the requirement is visible, not deduced").not.toBeNull();
        expect((blocker.textContent ?? "").trim().length, "with an actual sentence in it").toBeGreaterThan(10);
    });

    it("becomes the commit control once the review has answered, and never before", async () => {
        await mount();
        expect(primary().getAttribute("data-financials-responsibility-stage")).toBe("review");

        await act(async () => { primary().click(); });
        for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); });

        const button = primary();
        expect(button.getAttribute("data-financials-responsibility-stage")).toBe("commit");
        expect(label(button)).toContain("Confirm");
        expect(button.disabled).toBe(false);
        /* The operator can see what they are committing. */
        expect(document.querySelector("[data-financials-responsibility-preview]")).not.toBeNull();
    });

    it("falls back to review when the split is edited after being reviewed", async () => {
        /*
         * A preview describes ONE split. Pressing Review, editing an amount, then pressing Confirm
         * used to commit a split nobody had seen — the panel went on displaying the old numbers,
         * which is worse than displaying nothing.
         */
        await mount();
        await act(async () => { primary().click(); });
        for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); });
        expect(primary().getAttribute("data-financials-responsibility-stage")).toBe("commit");

        const field = amountInputs()[0]!;
        await act(async () => { typeChar(field, "5"); });
        for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });

        expect(
            primary().getAttribute("data-financials-responsibility-stage"),
            "an edit returns the control to review",
        ).toBe("review");
        expect(
            document.querySelector("[data-financials-responsibility-preview]"),
            "and the stale preview is gone rather than describing a split that changed",
        ).toBeNull();
    });
});
