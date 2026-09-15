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
        expect(await page()).toContain("{isDev && error === signInErrorMessage(null) ?");
    });

    it("names an environment without naming an address", async () => {
        /*
         * THIS ASSERTION INVERTED, AND THE INVERSION IS THE POINT.
         *
         * It used to require the hint to print `getPublicSupabaseAuthDebug().origin`. On a
         * certification host that origin is a loopback address on the SERVER, and printing it told a
         * remote operator their browser should reach their own machine. The hint keeps its job —
         * telling you that accounts are per environment — and loses the URL.
         */
        const src = await page();
        const hint = src.slice(src.indexOf("This server signs in against its own"));
        expect(hint.slice(0, 300)).not.toMatch(/\{supabaseOrigin\}|127\.0\.0\.1|NEXT_PUBLIC_SUPABASE_URL/);
        expect(hint.slice(0, 300)).toMatch(/per\s+environment/i);
        expect(src).not.toMatch(/ANON_KEY\}|anonKey\}/);
    });

    it("attaches only to the credential answer, which is the ambiguous one", async () => {
        // Bound to the message itself rather than a kind, so a fifth message cannot silently inherit it.
        expect(await page()).toContain("error === signInErrorMessage(null)");
    });

    it("says nothing that varies with the address typed", async () => {
        const src = await page();
        const hint = src.slice(src.indexOf("This server signs in against its own"));
        expect(hint.slice(0, 300)).not.toMatch(/email|account exists|user/i);
    });
});

describe("the login surface carries no internal connectivity detail", () => {
    const page = () => read("../../app/login/page.tsx");

    it("renders no diagnostics panel", async () => {
        /*
         * An operator browsing the tailnet address was shown "Password sign-in expects: POST
         * http://127.0.0.1:54421/auth/v1/token" and reasonably concluded their browser was being
         * pointed at their own machine. The diagnostics were real and useful; the login product was
         * the wrong place for them, and they now live at /dev/supabase-connectivity.
         */
        const src = await page();
        expect(src).not.toContain("login-supabase-env-debug");
        expect(src).not.toContain("Password sign-in expects");
        expect(src).not.toContain("Dev: Supabase connectivity");
        expect(src).not.toContain("Server says:");
        expect(src).not.toContain("STALE BUNDLE");
    });

    it("keeps the stale-bundle repair, which was never a diagnostic", async () => {
        const src = await page();
        expect(src).toContain('fetch("/api/dev/supabase-origin"');
        expect(src).toContain("setServerSupabaseConfig");
        expect(src).toContain("useServerConfig");
    });

    it("the repair cannot aim a remote browser at the host's loopback address", async () => {
        /*
         * The repair built its client from the server's RAW url. On a certification host that is
         * loopback, so the fix for one browser-side defect introduced another: an unreachable target
         * and the library's derived cookie name instead of the pinned one. Transport belongs to
         * browserTransport, here as everywhere else.
         */
        const src = await page();
        const repair = src.slice(src.indexOf("const supabase = useServerConfig"));
        expect(repair.slice(0, 500)).toContain("browserSupabaseUrl(");
        expect(repair.slice(0, 500)).toContain("authCookieNameFor(");
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

describe("a stale client bundle announces itself", () => {
    const panel = () => read("../../app/dev/supabase-connectivity/SupabaseConnectivityPanel.tsx");
    const route = () => read("../../app/api/dev/supabase-origin/route.ts");

    it("compares this page's target against the server's own view", async () => {
        const src = await panel();
        expect(src).toContain('fetch("/api/dev/supabase-origin"');
        expect(src).toContain("debug.origin !== serverOrigin");
    });

    it("always shows the server's view, so the line doubles as a build marker", async () => {
        /*
         * "Did the reload take?" was guessed at repeatedly during that incident and the guesses kept
         * pointing at the wrong half. An absent line is now the answer.
         */
        const src = await panel();
        expect(src).toContain("Server-side origin");
        expect(src).toContain("serverOrigin");
    });

    it("says so loudly rather than letting it present as a wrong password", async () => {
        const src = await panel();
        expect(src).toContain("Stale bundle");
        // Names BOTH origins: one alone would not tell you which half is wrong.
        const banner = src.slice(src.indexOf("Stale bundle"));
        expect(banner.slice(0, 400)).toContain("{debug.origin}");
        expect(banner.slice(0, 400)).toContain("{serverOrigin}");
    });

    it("separates the browser's transport from the database's identity", async () => {
        /*
         * The defect this whole change exists for: one origin, one label, and a reader who concluded
         * the wrong thing. Three origins now, each named for what it is.
         */
        const src = await panel();
        expect(src).toContain("Browser transport");
        expect(src).toContain("Database identity");
        expect(src).toContain("browserSupabaseUrl(");
    });

    it("the route refuses to exist in production", async () => {
        expect(await route()).toContain('process.env.NODE_ENV === "production"');
        expect(await route()).toContain("not_available");
    });

    it("the route returns the PUBLIC config and never a server secret", async () => {
        /*
         * This deliberately changed. The route now returns the anon key as well, so a stale bundle
         * can sign in against the project the server is actually configured for. Neither the URL nor
         * the anon key is a secret -- both already ship to every browser that loads the app -- and
         * the route does not exist in production. The line that matters is the service role key,
         * which is a real secret and must never leave the server.
         */
        const src = await route();
        expect(src).toContain("new URL(raw).origin");
        expect(src).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
        expect(src).not.toContain("SERVICE_ROLE");
    });
});

describe("a stale bundle cannot send credentials to the wrong project", () => {
    const page = () => read("../../app/login/page.tsx");
    const route = () => read("../../app/api/dev/supabase-origin/route.ts");

    it("signs in against the SERVER's config when the bundle disagrees", async () => {
        const src = await page();
        // Still the server's config — now sent through the transport owners, so the repair
        // cannot aim a remote browser at the host's loopback address.
        expect(src).toContain("browserSupabaseUrl(serverSupabaseConfig!.url");
        expect(src).toContain("serverSupabaseConfig!.anonKey");
    });

    it("only when they actually disagree, and only in development", async () => {
        const src = await page();
        const block = src.slice(src.indexOf("const useServerConfig"));
        expect(block.slice(0, 400)).toContain("isDev");
        expect(block.slice(0, 400)).toContain("!== clientOrigin");
    });

    it("falls back to the normal client on the ordinary path", async () => {
        // A normal dev session must not take the recovery path, or the recovery becomes the design.
        expect(await page()).toContain(": createClient();");
    });

    it("the route supplies url and anon key, and still refuses in production", async () => {
        const src = await route();
        expect(src).toContain("anonKey");
        expect(src).toContain('process.env.NODE_ENV === "production"');
        // Never the service role key -- that one is not public and must never leave the server.
        expect(src).not.toContain("SERVICE_ROLE");
    });
});
