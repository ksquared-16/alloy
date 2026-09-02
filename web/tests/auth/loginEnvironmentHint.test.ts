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
