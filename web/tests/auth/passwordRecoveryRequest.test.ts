import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
    PASSWORD_RECOVERY_FAILURE_MESSAGES,
    createRecoverySessionCache,
    createSingleFlight,
    establishRecoverySession,
    RECOVERY_WRITER_REFRESH_PLACEHOLDER,
    recoveryWriterFactory,
    updatePasswordWithCredential,
    type RecoveryCredential,
    passwordRecoveryFailureMessage,
    passwordRecoveryRequestOutcome,
    readRecoveryLink,
    recoverySessionState,
    type RecoveryAuthClient,
    withoutRecoveryLink,
} from "@/lib/auth/passwordRecoveryRequest";

const webRoot = join(__dirname, "..", "..");
const source = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

/** Shapes supabase-js actually returns from resetPasswordForEmail. */
const authError = (message: string, status: number, name = "AuthApiError") => Object.assign(new Error(message), { name, status });

describe("F-1 — forgot-password outcome: anti-enumeration", () => {
    it("no error is the uniform confirmation", () => {
        expect(passwordRecoveryRequestOutcome(null)).toBe("accepted");
        expect(passwordRecoveryRequestOutcome(undefined)).toBe("accepted");
    });

    it("account-state answers never surface: unknown user, unconfirmed email", () => {
        expect(passwordRecoveryRequestOutcome(authError("User not found", 400))).toBe("accepted");
        expect(passwordRecoveryRequestOutcome(authError("Email not confirmed", 400))).toBe("accepted");
    });

    it("a mailer failure is accepted, because only an existing account gets mailed", () => {
        expect(passwordRecoveryRequestOutcome(authError("Error sending recovery email", 500, "AuthApiError"))).toBe("accepted");
    });

    it("a per-address rate limit is accepted, because it only trips on an address that was mailed", () => {
        expect(passwordRecoveryRequestOutcome(authError("For security purposes, you can only request this after 60 seconds.", 429))).toBe("accepted");
        expect(passwordRecoveryRequestOutcome(authError("email rate limit exceeded", 429))).toBe("accepted");
    });

    it("an unrecognised provider string defaults to accepted, never to a pass-through", () => {
        expect(passwordRecoveryRequestOutcome(authError("Some brand new account state", 422))).toBe("accepted");
        expect(passwordRecoveryRequestOutcome("weird string")).toBe("accepted");
    });
});

describe("F-1 — forgot-password outcome: truthful failures that are true of every caller", () => {
    it("a request that never reached the service is reported, not confirmed", () => {
        expect(passwordRecoveryRequestOutcome(authError("", 0, "AuthRetryableFetchError"))).toBe("unreachable");
        expect(passwordRecoveryRequestOutcome(new TypeError("Failed to fetch"))).toBe("unreachable");
    });

    it("a missing environment is reported, not confirmed", () => {
        expect(passwordRecoveryRequestOutcome(new Error("Missing NEXT_PUBLIC_SUPABASE_URL"))).toBe("misconfigured");
    });

    it("failure copy is fixed, never names an account, and is absent for accepted", () => {
        expect(passwordRecoveryFailureMessage("accepted")).toBeNull();
        expect(PASSWORD_RECOVERY_FAILURE_MESSAGES).toHaveLength(2);
        for (const message of PASSWORD_RECOVERY_FAILURE_MESSAGES) {
            expect(message).not.toMatch(/not found|no account|does not exist|unconfirmed|not confirmed|registered/i);
        }
        // A dropped response looks like a refused connection, so the copy claims neither outcome.
        const unreachable = passwordRecoveryFailureMessage("unreachable")!;
        expect(unreachable).toMatch(/couldn't confirm/i);
        expect(unreachable).not.toMatch(/no reset link was requested|was not sent|wasn't sent|has been sent|we sent/i);
    });

    it("never echoes the provider's own text", () => {
        const secret = "AuthApiError: user 4f1c… not found in tenant";
        for (const outcome of ["accepted", "unreachable", "misconfigured"] as const) {
            expect(passwordRecoveryFailureMessage(outcome) ?? "").not.toContain(secret);
        }
        expect(passwordRecoveryFailureMessage(passwordRecoveryRequestOutcome(new TypeError(secret)))).not.toContain(secret);
    });
});

describe("F-1 — reset page reads its recovery link truthfully", () => {
    it("a session is a usable link", () => {
        expect(recoverySessionState({ session: { user: {} }, error: null })).toBe("ready");
    });

    it("no session, or a RETURNED link error, is an expired link", () => {
        expect(recoverySessionState({ session: null, error: null })).toBe("expired");
        expect(recoverySessionState({ session: null, error: authError("Email link is invalid or has expired", 403) })).toBe("expired");
    });

    it("a RETURNED transport error is unavailable, not expired — the link state is unknown", () => {
        expect(recoverySessionState({ session: null, error: authError("", 0, "AuthRetryableFetchError") })).toBe("unavailable");
        expect(recoverySessionState({ session: { user: {} }, error: new TypeError("Failed to fetch") })).toBe("unavailable");
    });

    it("a THROWN transport or configuration error is unavailable; any other throw is expired", () => {
        expect(recoverySessionState({ thrown: new TypeError("Failed to fetch") })).toBe("unavailable");
        expect(recoverySessionState({ thrown: new Error("Missing NEXT_PUBLIC_SUPABASE_URL") })).toBe("unavailable");
        expect(recoverySessionState({ thrown: new Error("something about the token") })).toBe("expired");
    });

    it("the reset page classifies both the returned and the thrown answer, and its copy claims nothing about link use", () => {
        const reset = source("app/reset-password/page.tsx");
        const lib = source("lib/auth/passwordRecoveryRequest.ts");
        expect(reset).toContain("establishRecoverySessionOnce(() => createClient().auth");
        expect(reset).toMatch(/^const establishRecoverySessionOnce = createRecoverySessionCache\(\);$/m);
        // The link is read only through establishRecoverySessionOnce; the page itself never asks the shared client.
        expect(reset).not.toMatch(/auth\.getSession\(\)/);
        expect(lib).toContain("recoverySessionState({ session, error })");
        expect(lib).toContain("recoverySessionState({ thrown })");
        expect(reset).not.toMatch(/has not been used|was not used|wasn't used/i);
    });
});

describe("F-1 — repeated and interrupted submission", () => {
    it("a second submission while one is in flight sends nothing", async () => {
        const flight = createSingleFlight();
        let calls = 0;
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const first = flight.run(async () => {
            calls += 1;
            await gate;
            return "sent";
        });
        expect(flight.busy).toBe(true);
        const second = await flight.run(async () => {
            calls += 1;
            return "duplicate";
        });
        expect(second).toBeNull();
        release();
        expect(await first).toBe("sent");
        expect(calls).toBe(1);
        expect(flight.busy).toBe(false);
    });

    it("an interrupted (thrown) request releases the form so the operator can retry", async () => {
        const flight = createSingleFlight();
        await expect(
            flight.run(async () => {
                throw new TypeError("network dropped");
            }),
        ).rejects.toThrow("network dropped");
        expect(flight.busy).toBe(false);
        expect(await flight.run(async () => "retried")).toBe("retried");
    });
});

describe("F-1 — the recovery pages use the shared sign-in shell and the mapped outcome", () => {
    const forgot = source("app/forgot-password/page.tsx");
    const reset = source("app/reset-password/page.tsx");
    const login = source("app/login/page.tsx");

    it("all three account pages render inside AuthShell with the login button", () => {
        for (const page of [forgot, reset, login]) {
            expect(page).toContain("<AuthShell>");
            expect(page).toContain("CTAButton");
            expect(page).not.toContain("PrimaryButton");
            expect(page).not.toContain("alloy-blue");
        }
    });

    it("forgot-password reads the provider's error and routes it through the outcome mapper", () => {
        expect(forgot).toMatch(/const \{ error: resetError \} = await createClient\(\)\.auth\.resetPasswordForEmail/);
        expect(forgot).toContain("passwordRecoveryRequestOutcome(providerError)");
        expect(forgot).toContain("If an account exists for that email");
        expect(forgot).not.toMatch(/resetError\.message|providerError\.message/);
    });

    it("both recovery pages guard against duplicate submission", () => {
        expect(forgot).toContain("flight.current.run(");
        expect(reset).toContain("flight.current.run(");
    });

    it("errors are announced to assistive tech and tied to their fields", () => {
        const shell = source("components/auth/AuthShell.tsx");
        expect(shell).toMatch(/role="alert"/);
        expect(forgot).toContain('aria-describedby={error ? "forgot-password-error" : undefined}');
        expect(reset).toContain("reset-password-error");
        expect(forgot).toContain("aria-busy={isLoading}");
        expect(reset).toContain("aria-busy={isLoading}");
    });
});

/*
 * HOTFIX — administrator-sent and self-requested links both reach a recovery session.
 *
 * The values below are fixtures, not credentials: nothing here reaches a provider.
 */
/** A provider session shape with synthetic token values. */
const sess = (user: { id: string; email?: string }) => ({
    access_token: `fixture-access-${user.id}`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
});
const BASE = "https://alloy.test/reset-password";
const FRAGMENT = "#access_token=fixture-access&expires_in=3600&refresh_token=fixture-refresh&token_type=bearer&type=recovery";

function fakeLocation(href: string) {
    let current = href;
    let cleared = 0;
    return {
        location: {
            href: () => current,
            clearLink: () => {
                cleared += 1;
                const url = new URL(current);
                for (const key of ["code", "error", "error_code", "error_description"]) url.searchParams.delete(key);
                url.hash = "";
                current = url.toString();
            },
        },
        get href() {
            return current;
        },
        get cleared() {
            return cleared;
        },
        /** What the auth client does on a successful PKCE exchange: drops `code`. */
        consumeCode() {
            const url = new URL(current);
            url.searchParams.delete("code");
            current = url.toString();
        },
    };
}

function fakeAuth(overrides: Partial<{ getSession: RecoveryAuthClient["getSession"]; setSession: RecoveryAuthClient["setSession"] }> = {}) {
    const calls = { getSession: 0, setSession: [] as Array<{ access_token: string; refresh_token: string }> };
    const client: RecoveryAuthClient = {
        getSession: async () => {
            calls.getSession += 1;
            return overrides.getSession ? overrides.getSession() : { data: { session: null }, error: null };
        },
        setSession: async (tokens) => {
            calls.setSession.push(tokens);
            return overrides.setSession ? overrides.setSession(tokens) : { data: { session: sess({ id: "recovering" }) }, error: null };
        },
    };
    return { client, calls };
}

describe("HOTFIX — the reset page reads both recovery link shapes", () => {
    it("parses an implicit-flow fragment, a PKCE code, a provider error, and no link", () => {
        expect(readRecoveryLink(BASE + FRAGMENT)).toEqual({ kind: "tokens", accessToken: "fixture-access", refreshToken: "fixture-refresh" });
        expect(readRecoveryLink(BASE + "?code=abc")).toEqual({ kind: "code" });
        expect(readRecoveryLink(BASE + "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toEqual({ kind: "error" });
        expect(readRecoveryLink(BASE + "?error=access_denied&error_code=otp_expired")).toEqual({ kind: "error" });
        expect(readRecoveryLink(BASE + "#access_token=only")).toEqual({ kind: "error" });
        expect(readRecoveryLink(BASE)).toEqual({ kind: "none" });
        expect(readRecoveryLink("not a url")).toEqual({ kind: "none" });
    });

    it("an administrator-sent (fragment) link becomes the recovery session, and the tokens leave the address bar first", async () => {
        const loc = fakeLocation(BASE + FRAGMENT);
        const { client, calls } = fakeAuth();
        const result = await establishRecoverySession(() => client, loc.location);
        expect(result.state).toBe("ready");
        expect(calls.setSession).toEqual([{ access_token: "fixture-access", refresh_token: "fixture-refresh" }]);
        expect(calls.getSession).toBe(0);
        expect(loc.cleared).toBe(1);
        expect(loc.href).toBe(BASE);
    });

    it("a fragment link the provider refuses is expired — never the session the browser already held", async () => {
        const loc = fakeLocation(BASE + FRAGMENT);
        const { client, calls } = fakeAuth({
            setSession: async () => ({ data: { session: null }, error: Object.assign(new Error("Invalid Refresh Token: Already Used"), { name: "AuthApiError", status: 400 }) }),
            getSession: async () => ({ data: { session: sess({ id: "someone-else" }) }, error: null }),
        });
        const result = await establishRecoverySession(() => client, loc.location);
        expect(result.state).toBe("expired");
        expect(calls.getSession).toBe(0);
    });

    it("a fragment link that cannot reach the provider is unavailable", async () => {
        const loc = fakeLocation(BASE + FRAGMENT);
        const { client } = fakeAuth({ setSession: async () => { throw new TypeError("Failed to fetch"); } });
        expect((await establishRecoverySession(() => client, loc.location)).state).toBe("unavailable");
    });

    it("a PKCE code the client exchanged (code removed from the URL) is ready", async () => {
        const loc = fakeLocation(BASE + "?code=abc");
        const { client } = fakeAuth({
            getSession: async () => {
                loc.consumeCode();
                return { data: { session: sess({ id: "recovering" }) }, error: null };
            },
        });
        expect((await establishRecoverySession(() => client, loc.location)).state).toBe("ready");
    });

    it("a PKCE code that was NOT exchanged (another browser, used link) is expired even if a session exists", async () => {
        const loc = fakeLocation(BASE + "?code=abc");
        const { client } = fakeAuth({ getSession: async () => ({ data: { session: sess({ id: "someone-else" }) }, error: null }) });
        const result = await establishRecoverySession(() => client, loc.location);
        expect(result.state).toBe("expired");
        expect(loc.href).toBe(BASE);
    });

    it("a provider error in the URL is expired without asking the client for a session", async () => {
        const loc = fakeLocation(BASE + "#error=access_denied&error_code=otp_expired");
        const { client, calls } = fakeAuth();
        expect((await establishRecoverySession(() => client, loc.location)).state).toBe("expired");
        expect(calls.getSession + calls.setSession.length).toBe(0);
    });

    it("with no link, a signed-in operator may still change their own password", async () => {
        const loc = fakeLocation(BASE);
        const { client } = fakeAuth({ getSession: async () => ({ data: { session: sess({ id: "self" }) }, error: null }) });
        expect((await establishRecoverySession(() => client, loc.location)).state).toBe("ready");
        const none = fakeAuth();
        expect((await establishRecoverySession(() => none.client, fakeLocation(BASE).location)).state).toBe("expired");
    });

    it("the administrator route still sends to /reset-password, gated, same-org, non-enumerating", () => {
        const route = source("app/api/admin/send-password-reset/route.ts");
        expect(route).toContain("requireAccessAdministration(ADMIN_USERS_WRITE)");
        expect(route).toContain("refuseQaOrgOutbound(orgId)");
        expect(route).toContain('.eq("org_id", orgId)');
        expect(route).toContain("/reset-password");
        expect(route.indexOf("refuseQaOrgOutbound(orgId)")).toBeLessThan(route.indexOf("auth.resetPasswordForEmail(email"));
    });
});

/*
 * SOURCE REVIEW — the link is cleared before the answer settles. A StrictMode replay (effect run, cancelled,
 * run again) or a remount must not re-read the cleared address and adopt a session the browser already held.
 */
describe("HOTFIX — repeat initialisation never turns an invalid link into a ready unrelated session", () => {
    const otherUser = async () => ({ data: { session: sess({ id: "someone-else" }) }, error: null });

    /** Effect run 1 starts and is cancelled (its result ignored); run 2 starts at once; run 2's answer is shown. */
    async function strictModeReplay(once: ReturnType<typeof createRecoverySessionCache>, client: RecoveryAuthClient, loc: ReturnType<typeof fakeLocation>) {
        const first = once(() => client, loc.location);
        const second = once(() => client, loc.location);
        await first;
        return second;
    }

    it("the hazard is real without the cache: a second run after an error link adopts the held session", async () => {
        const loc = fakeLocation(BASE + "#error=access_denied&error_code=otp_expired");
        const { client } = fakeAuth({ getSession: otherUser });
        expect((await establishRecoverySession(() => client, loc.location)).state).toBe("expired");
        expect((await establishRecoverySession(() => client, loc.location)).state).toBe("ready");
    });

    it("an error link stays expired across StrictMode replay with another user's session held", async () => {
        const loc = fakeLocation(BASE + "#error=access_denied&error_code=otp_expired");
        const { client, calls } = fakeAuth({ getSession: otherUser });
        const result = await strictModeReplay(createRecoverySessionCache(), client, loc);
        expect(result.state).toBe("expired");
        expect(calls.getSession).toBe(0);
    });

    it("a refused fragment link stays expired across replay; setSession is asked once and getSession never", async () => {
        const loc = fakeLocation(BASE + FRAGMENT);
        const { client, calls } = fakeAuth({
            setSession: async () => ({ data: { session: null }, error: Object.assign(new Error("Invalid Refresh Token: Already Used"), { name: "AuthApiError", status: 400 }) }),
            getSession: otherUser,
        });
        const result = await strictModeReplay(createRecoverySessionCache(), client, loc);
        expect(result.state).toBe("expired");
        expect(calls.setSession).toHaveLength(1);
        expect(calls.getSession).toBe(0);
    });

    it("an unexchanged PKCE code stays expired across replay, before or after the address is cleared", async () => {
        const loc = fakeLocation(BASE + "?code=abc");
        const { client } = fakeAuth({ getSession: otherUser });
        const once = createRecoverySessionCache();
        expect((await strictModeReplay(once, client, loc)).state).toBe("expired");
        expect(loc.href).toBe(BASE);
        // A remount in the same page load, now on the cleared address, reuses the answer.
        expect((await once(() => client, loc.location)).state).toBe("expired");
    });

    it("a valid fragment link is still ready across replay, with one setSession", async () => {
        const loc = fakeLocation(BASE + FRAGMENT);
        const { client, calls } = fakeAuth({ getSession: otherUser });
        expect((await strictModeReplay(createRecoverySessionCache(), client, loc)).state).toBe("ready");
        expect(calls.setSession).toHaveLength(1);
    });

    it("a visit with no link is not cached, so a later sign-in is evaluated afresh", async () => {
        const once = createRecoverySessionCache();
        const signedOut = fakeAuth();
        expect((await once(() => signedOut.client, fakeLocation(BASE).location)).state).toBe("expired");
        const signedIn = fakeAuth({ getSession: async () => ({ data: { session: sess({ id: "self" }) }, error: null }) });
        expect((await once(() => signedIn.client, fakeLocation(BASE).location)).state).toBe("ready");
    });

    it("withoutRecoveryLink removes only the link", () => {
        expect(withoutRecoveryLink(BASE + "?code=abc&next=%2Fx" + FRAGMENT)).toBe(BASE + "?next=%2Fx");
        expect(withoutRecoveryLink("not a url")).toBe("not a url");
    });
});


/*
 * WRITE BOUNDARY — the account is fixed THROUGH the actual password request. These drive the INSTALLED
 * supabase-js client against a fake fetch, so what is asserted is the token on the real `PUT /auth/v1/user`
 * request the library sends. Synthetic tokens and passwords only; nothing reaches a provider.
 */
describe("HOTFIX — write boundary: the password request carries only the form's credential", () => {
    const URL_ = "https://project.example.test";
    const ANON = "synthetic-anon-key";
    const now = () => Math.floor(Date.now() / 1000);
    /** A synthetic, unsigned JWT: `setSession` reads `exp` from the token itself. Never a real credential. */
    const synthJwt = (sub: string, expSeconds = now() + 3600) =>
        [{ alg: "none", typ: "JWT" }, { sub, aud: "authenticated", exp: expSeconds }].map((o) => Buffer.from(JSON.stringify(o)).toString("base64url")).join(".") + ".c3ludGhldGlj"; // base64url("synthetic")
    const subOf = (bearer: string | null) => {
        if (!bearer) return "anonymous";
        if (bearer.startsWith("fixture-access-")) return bearer.replace("fixture-access-", "");
        try {
            return (JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString("utf8")) as { sub?: string }).sub ?? "unknown";
        } catch {
            return "unknown";
        }
    };
    const credA: RecoveryCredential = { accessToken: synthJwt("account-a"), expiresAt: now() + 3600, userId: "account-a" };

    /** Records every auth request: method, path, bearer, body. Answers like the provider would. */
    function fakeProvider(opts: { failFirstUserGet?: boolean; answerAs?: string } = {}) {
        const requests: Array<{ method: string; path: string; bearer: string | null; body: unknown }> = [];
        let userGets = 0;
        const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
        const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(String(input));
            const headers = new Headers(init?.headers);
            const bearer = headers.get("Authorization")?.replace(/^Bearer /, "") ?? null;
            const method = init?.method ?? "GET";
            requests.push({ method, path: url.pathname, bearer, body: init?.body ? JSON.parse(String(init.body)) : null });
            // The placeholder refresh token is never a valid grant.
            if (url.pathname === "/auth/v1/token") return json(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
            if (method === "GET" && url.pathname === "/auth/v1/user" && opts.failFirstUserGet && ++userGets === 1) return json(500, { msg: "synthetic outage" });
            const id = opts.answerAs ?? subOf(bearer);
            return json(200, { id, aud: "authenticated", email: `${id}@example.test` });
        };
        return { requests, fetch: fetch as typeof globalThis.fetch };
    }

    /** The PRODUCT writer (`recoveryWriterFactory`), over the installed supabase-js and the fake provider. */
    function writeClientOver(provider: ReturnType<typeof fakeProvider>) {
        return recoveryWriterFactory(
            (supabaseUrl, anonKey, options) => {
                const supabase = createSupabaseClient(supabaseUrl, anonKey, { ...options, global: { fetch: provider.fetch } });
                return { auth: { setSession: (tokens) => supabase.auth.setSession(tokens), updateUser: (attributes) => supabase.auth.updateUser(attributes) } };
            },
            URL_,
            ANON,
        );
    }
    const seededAs = (userId: string) => async () => ({ userId, error: null });

    /** A shared client whose storage another "tab" can replace at any moment. */
    function sharedClientOver(provider: ReturnType<typeof fakeProvider>) {
        const items = new Map<string, string>();
        const key = "sb-shared-auth-token";
        const hold = (id: string) => items.set(key, JSON.stringify({ access_token: `fixture-access-${id}`, refresh_token: "fixture-refresh", token_type: "bearer", expires_at: now() + 3600, expires_in: 3600, user: { id } }));
        const supabase = createSupabaseClient(URL_, ANON, {
            auth: { storage: { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) }, storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
            global: { fetch: provider.fetch },
        });
        return { supabase, hold };
    }

    it("the hazard is real on the installed client: a shared-client write sends whoever is held at request time", async () => {
        const provider = fakeProvider();
        const shared = sharedClientOver(provider);
        shared.hold("account-a");
        const { data } = await shared.supabase.auth.getSession();
        expect((data.session?.user as { id: string }).id).toBe("account-a");
        shared.hold("account-b"); // B replaces the shared session immediately before the request
        await shared.supabase.auth.updateUser({ password: "synthetic-password-hazard" });
        expect(provider.requests.filter((r) => r.method === "PUT").map((r) => r.bearer)).toEqual(["fixture-access-account-b"]);
    });

    it("A captured; the shared session is replaced by B immediately before the request; the write carries only A", async () => {
        const provider = fakeProvider();
        const shared = sharedClientOver(provider);
        shared.hold("account-a");
        const writeClientFor = writeClientOver(provider);
        const writer = writeClientFor; // created for A's credential at submit
        shared.hold("account-b");
        const outcome = await updatePasswordWithCredential((c) => {
            shared.hold("account-b"); // and again at the last instant before the library resolves its session
            return writer(c);
        }, credA, "synthetic-password-bound");
        expect(outcome).toEqual({ ok: true });
        // The seed asks the provider who the credential is (A), then the write carries A.
        expect(provider.requests.map((r) => [r.method, r.path, subOf(r.bearer)])).toEqual([
            ["GET", "/auth/v1/user", "account-a"],
            ["PUT", "/auth/v1/user", "account-a"],
        ]);
        expect(provider.requests.find((r) => r.method === "PUT")?.body).toMatchObject({ password: "synthetic-password-bound" });
        expect(provider.requests.some((r) => r.bearer === "fixture-access-account-b")).toBe(false);
    });

    it("no credential, or one inside the expiry margin, never sends a request", async () => {
        const provider = fakeProvider();
        const writeClientFor = writeClientOver(provider);
        expect(await updatePasswordWithCredential(writeClientFor, null, "synthetic-password-x")).toEqual({ ok: false, reason: "expired" });
        const lapsing = { ...credA, expiresAt: now() + 30 };
        expect(await updatePasswordWithCredential(writeClientFor, lapsing, "synthetic-password-y")).toEqual({ ok: false, reason: "expired" });
        expect(provider.requests).toEqual([]);
    });

    it("a token that lapses mid-write only ever offers the placeholder refresh token, and reads as expired", async () => {
        const provider = fakeProvider();
        const writer = writeClientOver(provider)(credA);
        expect(await writer.seeded()).toEqual({ userId: "account-a", error: null });
        vi.useFakeTimers({ toFake: ["Date"] });
        let outcome;
        try {
            vi.setSystemTime(Date.now() + 2 * 3600 * 1000);
            outcome = await updatePasswordWithCredential(() => writer, { ...credA, expiresAt: now() + 3600 }, "synthetic-password-z");
        } finally {
            vi.useRealTimers();
        }
        expect(outcome).toEqual({ ok: false, reason: "expired" });
        const refreshes = provider.requests.filter((x) => x.path === "/auth/v1/token");
        expect(refreshes.length).toBeGreaterThan(0); // the library did try to refresh — and could only offer the placeholder
        for (const r of refreshes) expect(r.body).toMatchObject({ refresh_token: RECOVERY_WRITER_REFRESH_PLACEHOLDER });
        expect(provider.requests.some((r) => r.method === "PUT")).toBe(false);
    });

    it("a seed the provider attributes to another account writes nothing", async () => {
        const provider = fakeProvider({ answerAs: "account-b" });
        expect(await updatePasswordWithCredential(writeClientOver(provider), credA, "synthetic-password-m")).toEqual({ ok: false, reason: "expired" });
        expect(provider.requests.some((r) => r.method === "PUT")).toBe(false);
    });

    it("a seed that failed is retried on the next submit, still as A", async () => {
        const provider = fakeProvider({ failFirstUserGet: true });
        const writeClientFor = writeClientOver(provider); // one writer per credential, as in the page
        expect(await updatePasswordWithCredential(writeClientFor, credA, "synthetic-password-r")).toMatchObject({ ok: false, reason: "failed" });
        expect(await updatePasswordWithCredential(writeClientFor, credA, "synthetic-password-r")).toEqual({ ok: true });
        expect(provider.requests.map((r) => [r.method, subOf(r.bearer)])).toEqual([
            ["GET", "account-a"],
            ["GET", "account-a"],
            ["PUT", "account-a"],
        ]);
    });

    it("a seed that throws is not memoised: the next submit seeds again and writes as A", async () => {
        let calls = 0;
        const writeClientFor = recoveryWriterFactory(
            () => ({
                auth: {
                    setSession: async () => {
                        calls += 1;
                        if (calls === 1) throw new SyntaxError("synthetic malformed payload");
                        return { data: { user: { id: "account-a" } }, error: null };
                    },
                    updateUser: async () => ({ error: null }),
                },
            }),
            URL_,
            ANON,
        );
        expect(await updatePasswordWithCredential(writeClientFor, credA, "synthetic-password-t")).toMatchObject({ ok: false, reason: "failed" });
        expect(await updatePasswordWithCredential(writeClientFor, credA, "synthetic-password-t")).toEqual({ ok: true });
        expect(calls).toBe(2);
    });

    it("the helper maps a lapsed credential to expired and a provider refusal to failure", async () => {
        const missing = Object.assign(new Error("Auth session missing!"), { name: "AuthSessionMissingError" });
        expect(await updatePasswordWithCredential(() => ({ seeded: seededAs("account-a"), updateUser: async () => ({ error: missing }) }), credA, "p")).toEqual({ ok: false, reason: "expired" });
        const same = Object.assign(new Error("New password should be different from the old password."), { name: "AuthApiError", status: 422, code: "same_password" });
        expect(await updatePasswordWithCredential(() => ({ seeded: seededAs("account-a"), updateUser: async () => ({ error: same }) }), credA, "p")).toMatchObject({ ok: false, reason: "failed" });
    });

    it("a recovery link captures A's credential; StrictMode/remount reuse keeps A's credential, never a later held session", async () => {
        const b = fakeAuth({
            setSession: async () => ({ data: { session: sess({ id: "account-a", email: "a@example.test" }) }, error: null }),
            getSession: async () => ({ data: { session: sess({ id: "account-b" }) }, error: null }),
        });
        const once = createRecoverySessionCache();
        const loc = fakeLocation(BASE + FRAGMENT);
        const first = await once(() => b.client, loc.location);
        const remount = await once(() => b.client, loc.location);
        for (const r of [first, remount]) expect(r).toMatchObject({ state: "ready", mode: "recovery", userId: "account-a", credential: { userId: "account-a", accessToken: "fixture-access-account-a" } });
    });

    it("a ready session without an access token or expiry is not offered", async () => {
        const { client } = fakeAuth({ getSession: async () => ({ data: { session: { user: { id: "self" } } }, error: null }) });
        expect((await establishRecoverySession(() => client, fakeLocation(BASE).location)).state).toBe("expired");
    });

    it("invalid link → URL scrubbed → full reload with B held: the labelled signed-in change for B, with B's own credential", async () => {
        const b = fakeAuth({ getSession: async () => ({ data: { session: sess({ id: "account-b", email: "b@example.test" }) }, error: null }) });
        const loc = fakeLocation(BASE + "#error=access_denied&error_code=otp_expired");
        expect(await createRecoverySessionCache()(() => b.client, loc.location)).toMatchObject({ state: "expired", mode: "recovery", credential: null });
        const reloaded = await createRecoverySessionCache()(() => b.client, fakeLocation(loc.href).location);
        expect(reloaded).toMatchObject({ state: "ready", mode: "signed_in", userId: "account-b", credential: { userId: "account-b" } });
    });

    it("the page writes only through the product writer, never the shared client, and never signs it out", () => {
        const reset = source("app/reset-password/page.tsx");
        const lib = source("lib/auth/passwordRecoveryRequest.ts");
        expect(reset).toContain("updatePasswordWithCredential(writeClientFor, credential.current, password)");
        expect(reset).toContain("recoveryWriterFactory(");
        // The page's only auth calls are the thin adapter handed to the factory.
        expect(reset.match(/\.updateUser\(/g)).toHaveLength(1);
        expect(reset).toContain("updateUser: (attributes) => supabase.auth.updateUser(attributes)");
        expect(reset).toContain("setSession: (tokens) => supabase.auth.setSession(tokens)");
        expect(reset).not.toMatch(/createClient\(\)\.auth\.updateUser|auth\.getSession\(\)|persistSession|storage:/);
        // The isolation itself lives in the product module.
        expect(lib).toContain("persistSession: false");
        expect(lib).toContain("autoRefreshToken: false");
        expect(lib).toContain("refresh_token: RECOVERY_WRITER_REFRESH_PLACEHOLDER");
        expect(lib).not.toMatch(/boundSessionStorage|persistSession: true/);
        // Teardown is dropping the reference: signOut would log the recovering account out at the provider.
        for (const src of [reset, lib]) expect(src).not.toMatch(/\.signOut\(/);
        expect(reset).not.toMatch(/console\.(log|info|warn|error)/);
        expect(reset).toContain('bound.mode === "signed_in"');
        expect(reset).toContain("data-reset-target");
    });
});
