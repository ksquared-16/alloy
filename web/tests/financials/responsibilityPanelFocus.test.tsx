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
