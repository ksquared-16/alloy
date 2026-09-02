/**
 * The dev-only environment hint on the sign-in failure, and the rule it must not break.
 *
 * A correct password failed at localhost:3014 because the server authenticates against a hosted
 * project the account had never existed in, and the screen said "Email or password is incorrect" --
 * which is exactly what W-32 requires it to say. The ambiguity is deliberate and stays; the
 * environment it happened in is not a secret and now gets named in development.
 */

import { describe, expect, it } from "vitest";

import { SIGN_IN_MESSAGES, classifySignInFailure, signInErrorMessage } from "@/lib/auth/signInErrorMessage";

const read = (rel: string) =>
    import("node:fs/promises").then((fs) => fs.readFile(new URL(rel, import.meta.url), "utf8"));

describe("the anti-enumeration rule is untouched", () => {
    it("a nonexistent account and a wrong password still produce the same sentence", () => {
        const noAccount = signInErrorMessage({ message: "Invalid login credentials" });
        const unconfirmed = signInErrorMessage({ message: "Email not confirmed" });
        const unknown = signInErrorMessage({ message: "some new provider string nobody has seen" });
        expect(noAccount).toBe(unconfirmed);
        expect(noAccount).toBe(unknown);
        expect(noAccount).toBe(signInErrorMessage(null));
    });

    it("the message set is still closed and still says nothing about an account", () => {
        expect(SIGN_IN_MESSAGES).toHaveLength(4);
        for (const m of SIGN_IN_MESSAGES) {
            expect(m).not.toMatch(/not found|no account|does not exist|unconfirmed|not confirmed/i);
        }
    });

    it("infrastructure failures are still distinguished from the credential answer", () => {
        expect(classifySignInFailure({ message: "fetch failed" })).toBe("unreachable");
        expect(classifySignInFailure({ message: "NEXT_PUBLIC_SUPABASE_URL is required" })).toBe("misconfigured");
        expect(classifySignInFailure({ message: "rate limit exceeded" })).toBe("rate_limited");
    });
});

describe("the hint is development-only and names an environment, never an account", () => {
    const page = () => read("../../app/login/page.tsx");

    it("renders only under isDev", async () => {
        expect(await page()).toContain("{isDev && error === signInErrorMessage(null) && supabaseOrigin ?");
    });

    it("shows only the origin, never key material", async () => {
        const src = await page();
        expect(src).toContain("getPublicSupabaseAuthDebug().origin");
        expect(src).not.toMatch(/ANON_KEY\}|anonKey\}/);
    });

    it("attaches only to the credential answer, which is the ambiguous one", async () => {
        // Bound to the message itself rather than a kind, so a fifth message cannot silently inherit it.
        expect(await page()).toContain("error === signInErrorMessage(null)");
    });

    it("says nothing that varies with the address typed", async () => {
        const src = await page();
        const hint = src.slice(src.indexOf("Dev: this server signs in against"));
        expect(hint.slice(0, 240)).not.toMatch(/email|account exists|user/i);
    });
});

describe("an already-signed-in operator is not shown a login form", () => {
    const page = () => read("../../app/login/page.tsx");

    it("redirects away when a session is present", async () => {
        const src = await page();
        expect(src).toContain("router.replace(POST_SIGN_IN_PATH)");
    });

    it("asks the auth server, not the local cookie", async () => {
        /*
         * getSession() reads the cookie locally and can return a session the middleware then
         * rejects, which sends the browser straight back here. getUser() verifies, so a redirect
         * only fires for a session the rest of the app also accepts.
         */
        const src = await page();
        expect(src).toContain("auth.getUser()");
        expect(src).not.toContain("auth.getSession()");
    });

    it("does NOT redirect on error=unauthorized, which would loop and hide the reason", async () => {
        const src = await page();
        const effect = src.slice(src.indexOf("ALREADY SIGNED IN?"));
        expect(effect).toContain('if (errorParam === "unauthorized") return;');
    });

    it("sends the operator to the same place a fresh sign-in does", async () => {
        // One constant for both paths: a redirect that disagreed with the sign-in handler would send
        // signed-in and just-signed-in operators to different pages.
        const src = await page();
        expect(src).toContain("router.push(POST_SIGN_IN_PATH)");
        expect(src.match(/POST_SIGN_IN_PATH/g)?.length).toBeGreaterThanOrEqual(3);
    });
});

describe("an unreachable auth service is never reported as a wrong password", () => {
    /*
     * The incident this exists for: a dev server pointing at a Supabase that was not running. Every
     * sign-in posted into a refused connection and the page said the password was incorrect, so the
     * operator retyped a correct password for hours. supabase-js reports that as
     * AuthRetryableFetchError with status 0, and its message need not contain "fetch" -- so matching
     * on prose alone missed it and the credentials default took over.
     */
    it("classifies AuthRetryableFetchError by NAME, whatever its message says", () => {
        const e = Object.assign(new Error("Request failed"), { name: "AuthRetryableFetchError", status: 0 });
        expect(classifySignInFailure(e)).toBe("unreachable");
    });

    it("classifies a browser TypeError from a refused connection", () => {
        const e = Object.assign(new Error("Load failed"), { name: "TypeError" });
        expect(classifySignInFailure(e)).toBe("unreachable");
    });

    it("classifies any error that never received an HTTP answer", () => {
        expect(classifySignInFailure({ message: "something opaque", status: 0 })).toBe("unreachable");
    });

    it("still defaults an unrecognised PROVIDER string to credentials", () => {
        // The anti-enumeration default is the point and must survive this change.
        expect(classifySignInFailure({ message: "Email not confirmed", status: 400 })).toBe("credentials");
        expect(classifySignInFailure({ message: "a new provider string", status: 400 })).toBe("credentials");
    });
});
