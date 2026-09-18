/**
 * A send key names an ATTEMPT, not a message.
 *
 * ## The defect this pins
 *
 * On the ordinary operator path — child Process Card → Send enrollment paperwork → Send → Confirm —
 * the send failed with *"This send key was already used with different content or recipient. Use a
 * new key."* Kelly supplied no key, altered no request and did nothing unsupported. Reproduced on
 * the certified specimen: preflight `ready: 1`, confirm `failed: 1` with that reason.
 *
 * The key was `family_send:<hash of subject+body>:<personId>`, derived from CONTENT because nothing
 * in the product ever sent the `client_token` the route already accepted. For a message the product
 * GENERATES identically every time, that key is the same forever, so it was wrong in both
 * directions: an intentional resend of identical paperwork was swallowed as an idempotent replay,
 * and once the server's fingerprint changed — it includes the recipient ADDRESS — the key conflicted
 * permanently, on a path where the operator cannot reach the key at all.
 *
 * ## What is asserted
 *
 * The composer now names one confirmation episode and re-mints at every point a human means "this is
 * a different communication". Live matrix, run against the real API:
 *
 *   same token confirmed twice  → one delivery, identical message id
 *   new token, edited body      → new delivery
 *   same token, new content     → refused, in product language
 *   same token, other recipient → admitted by idempotency (refused later, honestly, by suppression)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
/** Prose removed: these modules document the defect, so a naive scan matches the explanation. */
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const HOOK = "lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts";
const SEND = "lib/communications/send/canonicalSend.ts";

describe("the composer names the send attempt", () => {
    const hook = code(HOOK);

    it("mints a token and sends it as the client token", () => {
        expect(hook).toContain("beginSendAttempt");
        expect(hook).toContain("client_token: attemptToken");
    });

    it("keeps ONE token across retries of the same confirmation", () => {
        // A confirm that times out and is pressed again must not become a second delivery, so the
        // token is minted only when there is none.
        expect(hook).toMatch(/if \(attemptTokenRef\.current\) return attemptTokenRef\.current;/);
    });

    it("re-mints at every point a human means a different communication", () => {
        /*
         * Back to edit, Done on a completed send, New Message, and opening another thread. Miss any
         * one of these and an intentional resend is silently swallowed as a replay — which is the
         * other half of the original defect, and the half that produces no error at all.
         */
        const boundaries = [
            "dismissSendResult",
            "acknowledgeSendSuccess",
            "startNewMessage",
            "openThread",
        ];
        for (const name of boundaries) {
            const at = hook.indexOf(name + " = useCallback");
            expect(at, `${name} must exist`).toBeGreaterThan(-1);
            /*
             * Bounded to THIS callback. A fixed-width slice reached into the next function, which
             * also ends the attempt — so removing the call here left the assertion green. The
             * planted defect is what found that; the window now stops at the callback's own
             * dependency array.
             */
            const end = hook.indexOf("}, [", at);
            const closer = hook.indexOf("});", at);
            const stop = Math.min(end === -1 ? Infinity : end, closer === -1 ? Infinity : closer);
            expect(stop, `${name} must close`).toBeLessThan(Infinity);
            expect(hook.slice(at, stop), `${name} must end the attempt`).toContain("endSendAttempt()");
        }
    });
});

describe("the operator never meets our bookkeeping", () => {
    it("the send conflict speaks product language", () => {
        const src = read(SEND);
        const messages = src.split("\n").filter((l) => /return fail\(|"[A-Z][^"]{20,}"/.test(l)).join("\n");
        expect(messages).not.toMatch(/use a new key/i);
        expect(code(SEND)).not.toMatch(/"[^"]*send key[^"]*"/i);
        expect(code(SEND)).toContain("A message has already been sent for this attempt.");
    });

    it("no Communications surface tells an operator to manage a key", () => {
        for (const rel of [SEND, HOOK, "app/api/admin/communications/family-send/route.ts"]) {
            const body = code(rel);
            for (const term of ["idempotency key", "content token", "send key"]) {
                expect(body.toLowerCase(), `${rel} must not surface "${term}"`).not.toContain(`"${term}`);
            }
        }
    });
});
