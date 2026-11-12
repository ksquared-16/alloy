import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    PASSWORD_RECOVERY_FAILURE_MESSAGES,
    createRecoverySessionCache,
    createSingleFlight,
    establishRecoverySession,
    updatePasswordForBoundAccount,
    type PasswordUpdateClient,
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
        // The link is read only through establishRecoverySessionOnce; getSession appears once, in the bound-update adapter.
        expect(reset.match(/auth\.getSession\(\)/g)).toHaveLength(1);
        expect(reset).toContain("getSession: () => supabase.auth.getSession()");
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
            return overrides.setSession ? overrides.setSession(tokens) : { data: { session: { user: { id: "recovering" } } }, error: null };
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
            getSession: async () => ({ data: { session: { user: { id: "someone-else" } } }, error: null }),
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
                return { data: { session: { user: { id: "recovering" } } }, error: null };
            },
        });
        expect((await establishRecoverySession(() => client, loc.location)).state).toBe("ready");
    });

    it("a PKCE code that was NOT exchanged (another browser, used link) is expired even if a session exists", async () => {
        const loc = fakeLocation(BASE + "?code=abc");
        const { client } = fakeAuth({ getSession: async () => ({ data: { session: { user: { id: "someone-else" } } }, error: null }) });
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
        const { client } = fakeAuth({ getSession: async () => ({ data: { session: { user: { id: "self" } } }, error: null }) });
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
    const otherUser = async () => ({ data: { session: { user: { id: "someone-else" } } }, error: null });

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
        const signedIn = fakeAuth({ getSession: async () => ({ data: { session: { user: { id: "self" } } }, error: null }) });
        expect((await once(() => signedIn.client, fakeLocation(BASE).location)).state).toBe("ready");
    });

    it("withoutRecoveryLink removes only the link", () => {
        expect(withoutRecoveryLink(BASE + "?code=abc&next=%2Fx" + FRAGMENT)).toBe(BASE + "?next=%2Fx");
        expect(withoutRecoveryLink("not a url")).toBe("not a url");
    });
});

/*
 * REVIEW — submit must change the account the form was opened for, never whichever session the browser holds
 * at submit time. Sessions live in shared browser storage, so another tab can replace A with B under an open
 * form, and a remount reuses a cached `ready`. Synthetic accounts only; nothing reaches a provider.
 */
describe("HOTFIX — submit is bound to the account the form was opened for", () => {
    const A = { id: "account-a", email: "a@example.test" };
    const B = { id: "account-b", email: "b@example.test" };

    /** Shared browser storage: whoever signed in last is "the session". */
    function browser(initial: { id: string; email: string } | null) {
        let held: { id: string; email: string } | null = initial;
        const updated: Array<{ userId: string | null; password: string }> = [];
        const client: RecoveryAuthClient & PasswordUpdateClient = {
            getSession: async () => ({ data: { session: held ? { user: held } : null }, error: null }),
            setSession: async () => ({ data: { session: (held = A) && { user: A } }, error: null }),
            updateUser: async ({ password }) => {
                updated.push({ userId: held?.id ?? null, password });
                return { error: null };
            },
        };
        return { client, signInAs: (u: typeof held) => (held = u), updated };
    }

    it("the hazard is real: an unbound update changes whichever account is held", async () => {
        const b = browser(B);
        await establishRecoverySession(() => b.client, fakeLocation(BASE + FRAGMENT).location);
        b.signInAs(B); // another tab signs in as B while A's form is open
        await b.client.updateUser({ password: "synthetic-password-1" });
        expect(b.updated).toEqual([{ userId: "account-b", password: "synthetic-password-1" }]);
    });

    it("a recovery link binds account A and names it", async () => {
        const b = browser(B);
        const r = await establishRecoverySession(() => b.client, fakeLocation(BASE + FRAGMENT).location);
        expect(r).toMatchObject({ state: "ready", mode: "recovery", userId: "account-a", email: "a@example.test" });
    });

    it("A's form, session switched to B before submit: refused, nothing updated", async () => {
        const b = browser(null);
        const r = await establishRecoverySession(() => b.client, fakeLocation(BASE + FRAGMENT).location);
        b.signInAs(B);
        expect(await updatePasswordForBoundAccount(b.client, r.userId, "synthetic-password-2")).toEqual({ ok: false, reason: "account_changed" });
        expect(b.updated).toEqual([]);
    });

    it("A's form, signed out before submit: refused, nothing updated", async () => {
        const b = browser(null);
        const r = await establishRecoverySession(() => b.client, fakeLocation(BASE + FRAGMENT).location);
        b.signInAs(null);
        expect(await updatePasswordForBoundAccount(b.client, r.userId, "synthetic-password-3")).toEqual({ ok: false, reason: "account_changed" });
        expect(b.updated).toEqual([]);
    });

    it("remount reuses A's cached ready, but with B now held the submit is still refused", async () => {
        const b = browser(null);
        const once = createRecoverySessionCache();
        const loc = fakeLocation(BASE + FRAGMENT);
        await once(() => b.client, loc.location);
        b.signInAs(B);
        const remounted = await once(() => b.client, loc.location); // cleared address, same page load
        expect(remounted).toMatchObject({ state: "ready", userId: "account-a" });
        expect(await updatePasswordForBoundAccount(b.client, remounted.userId, "synthetic-password-4")).toEqual({ ok: false, reason: "account_changed" });
        expect(b.updated).toEqual([]);
    });

    it("A's form with A still held: updates A, once", async () => {
        const b = browser(null);
        const r = await establishRecoverySession(() => b.client, fakeLocation(BASE + FRAGMENT).location);
        expect(await updatePasswordForBoundAccount(b.client, r.userId, "synthetic-password-5")).toEqual({ ok: true });
        expect(b.updated).toEqual([{ userId: "account-a", password: "synthetic-password-5" }]);
    });

    it("no bound account (expired / unavailable answer) never updates", async () => {
        const b = browser(B);
        const r = await establishRecoverySession(() => b.client, fakeLocation(BASE + "#error=access_denied&error_code=otp_expired").location);
        expect(r).toMatchObject({ state: "expired", userId: null });
        expect(await updatePasswordForBoundAccount(b.client, r.userId, "synthetic-password-6")).toEqual({ ok: false, reason: "account_changed" });
        expect(b.updated).toEqual([]);
    });

    it("a ready session with no user id is not offered", async () => {
        const { client } = fakeAuth({ getSession: async () => ({ data: { session: { user: {} } }, error: null }) });
        expect((await establishRecoverySession(() => client, fakeLocation(BASE).location)).state).toBe("expired");
    });

    it("invalid link → URL scrubbed → full reload with B held: the explicitly labelled signed-in change for B, not recovery", async () => {
        const b = browser(B);
        const loc = fakeLocation(BASE + "#error=access_denied&error_code=otp_expired");
        const first = await createRecoverySessionCache()(() => b.client, loc.location);
        expect(first).toMatchObject({ state: "expired", mode: "recovery", userId: null });
        expect(loc.href).toBe(BASE);
        // A full reload starts a new module scope: a fresh cache, on the scrubbed address.
        const reloaded = await createRecoverySessionCache()(() => b.client, fakeLocation(loc.href).location);
        expect(reloaded).toMatchObject({ state: "ready", mode: "signed_in", userId: "account-b", email: "b@example.test" });
    });

    it("the page binds submit to the established account and labels which account and why", () => {
        const reset = source("app/reset-password/page.tsx");
        // updateUser is reachable only as the adapter handed to the bound helper, never called directly.
        const bindingCall = reset.match(/updatePasswordForBoundAccount\(\s*\{[^}]*\},\s*bound\.userId,\s*password,?\s*\)/);
        expect(bindingCall?.[0]).toContain("updateUser: (attributes) => supabase.auth.updateUser(attributes)");
        expect(reset.match(/\.updateUser\(/g)).toHaveLength(1);
        expect(reset).toContain('status === "account_changed"');
        expect(reset).toContain('bound.mode === "signed_in"');
        expect(reset).toContain("data-reset-target");
    });
});
