/**
 * The participant surface must survive every render transition with a stable hook order.
 *
 * ## What a parent actually saw
 *
 * Opening their Enrollment link crashed:
 *
 *   "React has detected a change in the order of Hooks called by FormEmbedClient"
 *
 * The V1.2 effect that loads the Enrollment objective was written immediately above its consumer,
 * which put it BELOW six early returns — `phase === "loading"`, `phase === "error"`,
 * `packetAlreadyDone`, `packetFinalThankYou`, `!schema`, `submitted`. The first render of any link
 * is the loading one, so the effect did not run; the second render reached it. Hook #33 appeared out
 * of nowhere and React threw.
 *
 * This is asserted structurally rather than by rendering, because the failure is a property of WHERE
 * the hook sits in the function body — a render test would have to reproduce six distinct
 * early-return states to cover what one position check covers completely, and would still pass if
 * the hook were merely moved above a different early return.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
    resolve(__dirname, "../../app/forms/embed/[token]/FormEmbedClient.tsx"),
    "utf8",
);

/** Body of the component, so module-level helpers above it are not mistaken for early returns. */
const BODY = SRC.slice(SRC.indexOf("export function FormEmbedClient"));

const HOOK = /\n\s{4}(?:const \[[^\]]+\]\s*=\s*)?(?:const \w+\s*=\s*)?use(?:State|Effect|Memo|Callback|Ref|LayoutEffect)\(/g;
/** An early return at component-body indentation: `    if (…) {` followed by `        return (`. */
const EARLY_RETURN = /\n {4}if \([^)]*\) \{\n {8}return \(/g;

function firstIndex(re: RegExp, text: string): number {
    re.lastIndex = 0;
    const m = re.exec(text);
    return m ? m.index : -1;
}

function lastIndex(re: RegExp, text: string): number {
    re.lastIndex = 0;
    let idx = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) idx = m.index;
    return idx;
}

describe("FormEmbedClient hook order", () => {
    it("has early returns — otherwise this control proves nothing", () => {
        expect(firstIndex(EARLY_RETURN, BODY)).toBeGreaterThan(-1);
    });

    it("calls every hook before the first early return", () => {
        const firstEarlyReturn = firstIndex(EARLY_RETURN, BODY);
        const lastHook = lastIndex(HOOK, BODY);

        expect(lastHook).toBeGreaterThan(-1);
        // The whole invariant in one comparison: no hook may sit below a path that can skip it.
        expect(
            lastHook,
            "a hook is declared after an early return — it will be skipped on the renders that take " +
                "that path, and React will throw on the render that does not",
        ).toBeLessThan(firstEarlyReturn);
    });

    it("loads the Enrollment objective unconditionally, for every token", () => {
        const effect = BODY.slice(BODY.indexOf("enrollment-objective") - 900, BODY.indexOf("enrollment-objective"));
        // Not gated on phase, on schema, or on the token being an Enrollment token: an ordinary
        // public Form link simply resolves non-ok and leaves the objective null. Gating the HOOK on
        // any of those would reintroduce the crash in a new disguise.
        expect(effect).not.toMatch(/if \(phase[^)]*\) return;[\s\S]*$/);
        expect(BODY).toContain("useEffect");
    });

    it("mounts the conversation card on the objective, not on a hook condition", () => {
        // The card's presence is a RENDER decision. That is the correct place for a condition, and
        // it is what keeps an ordinary form link unaffected: no objective, no card, same hooks.
        expect(BODY).toContain("{enrollmentObjective ? (");
        expect(BODY).toContain("<EnrollmentConversationCard");
    });
});
