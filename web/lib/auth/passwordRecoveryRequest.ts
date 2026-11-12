/**
 * F-1 (Access & Roles V3) — what the forgot-password page may say after a reset request.
 *
 * **The defect.** `/forgot-password` awaited `resetPasswordForEmail` and never read its `{ error }`, so every
 * outcome — a refused connection, a missing environment value, a provider outage — told the operator "Check
 * your email". Anti-enumeration was preserved by accident: the page reported nothing because it read nothing.
 *
 * **The rule.** The page may distinguish only failures that are true of every caller and say nothing about
 * an account — the same carve-out `signInErrorMessage` makes for `misconfigured` and `unreachable`. Everything
 * else is `accepted`:
 *
 * - *Account-state errors* (unknown user, unconfirmed email) are existence oracles. Accepted.
 * - *Send failures* (`Error sending recovery email`, a 5xx from the mailer) only happen when there IS an
 *   account to send to, so reporting them is also an oracle. Accepted.
 * - *Rate limits.* The provider's recovery limit is per address and only trips on an address it actually
 *   mailed, so "too many requests" would confirm the account. Accepted — and the confirmation copy tells
 *   every caller, uniformly, that only the most recent link works. That sentence is true whether or not the
 *   address exists, so it is not an oracle.
 * - *Anything unrecognised* falls to `accepted`, for the reason `classifySignInFailure` defaults to
 *   `credentials`: a new provider string is likelier to be account state than infrastructure.
 *
 * Abuse limits (AD-14) and server-side policy are open decisions and are not changed here.
 */
import { classifySignInFailure } from "@/lib/auth/signInErrorMessage";

export type PasswordRecoveryRequestOutcome =
    /** Show the uniform "if an account exists" confirmation. */
    | "accepted"
    /**
     * No answer came back. The request may or may not have been processed — a dropped response looks the
     * same as a refused connection — so the page must not claim either.
     */
    | "unreachable"
    /** This deployment cannot build a reset link or a client. Not about the caller. */
    | "misconfigured";

const FAILURE_MESSAGES: Record<Exclude<PasswordRecoveryRequestOutcome, "accepted">, string> = {
    unreachable:
        "We couldn't confirm your request. Check your connection and try again. If more than one email arrives, use the newest link.",
    misconfigured:
        "Password reset isn't available in this environment right now. Contact your administrator.",
};

/** Every failure sentence the page can show. Exported so a lock can assert none names an account. */
export const PASSWORD_RECOVERY_FAILURE_MESSAGES: readonly string[] = Object.freeze(Object.values(FAILURE_MESSAGES));

/** The provider's `{ error }` (or a thrown value) → the one outcome the page may act on. */
export function passwordRecoveryRequestOutcome(error: unknown): PasswordRecoveryRequestOutcome {
    if (error == null) return "accepted";
    const kind = classifySignInFailure(error);
    if (kind === "unreachable") return "unreachable";
    if (kind === "misconfigured") return "misconfigured";
    return "accepted";
}

/** The sentence for a failed request, or null when the uniform confirmation is the answer. */
export function passwordRecoveryFailureMessage(outcome: PasswordRecoveryRequestOutcome): string | null {
    return outcome === "accepted" ? null : FAILURE_MESSAGES[outcome];
}

/**
 * One submission at a time. A double click, an Enter held down, or a second press while a slow request is
 * still in flight must not send a second reset email — each new email invalidates the previous link, so a
 * duplicate turns the first message an operator opens into an "expired link".
 *
 * Returns `null` when a run is already in flight; otherwise the task's result. The guard always releases,
 * including when the task throws, so an interrupted request never locks the form.
 */
export function createSingleFlight() {
    let inFlight = false;
    return {
        get busy() {
            return inFlight;
        },
        async run<T>(task: () => Promise<T>): Promise<T | null> {
            if (inFlight) return null;
            inFlight = true;
            try {
                return await task();
            } finally {
                inFlight = false;
            }
        },
    };
}

/** What the reset page may say about the recovery link it was opened with. */
export type RecoverySessionState = "ready" | "expired" | "unavailable";

/**
 * Classify `getSession()`'s answer on the reset page — its RETURNED `{ data, error }` or a thrown value.
 *
 * - A session is a usable recovery link: `ready`.
 * - No session, or a provider error about the link (invalid, expired, already used): `expired`.
 * - No answer at all (service unreachable, environment missing): `unavailable`. The page cannot know whether
 *   the link is still good, so its copy must not claim it was or was not used.
 */
export function recoverySessionState(result: { session: unknown; error: unknown } | { thrown: unknown }): RecoverySessionState {
    if ("thrown" in result) return infrastructureFailure(result.thrown) ? "unavailable" : "expired";
    if (result.error != null) return infrastructureFailure(result.error) ? "unavailable" : "expired";
    return result.session ? "ready" : "expired";
}

function infrastructureFailure(error: unknown): boolean {
    const kind = classifySignInFailure(error);
    return kind === "unreachable" || kind === "misconfigured";
}

/**
 * What the reset page was opened with. Read from the URL BEFORE anything else answers for it.
 *
 * **The defect.** Recovery links arrive in two shapes, and the page understood one. `/forgot-password` asks
 * from the browser client, which is PKCE (`@supabase/ssr` pins it), so its email lands on `?code=…` and the
 * client exchanges it — but only in the browser holding that request's code verifier. The administrator
 * route (`/api/admin/send-password-reset`) asks from the service-role client, which is implicit-flow, so its
 * email lands on `#access_token=…&refresh_token=…&type=recovery`. A PKCE client refuses a fragment session
 * ("Not a valid PKCE flow url"), so every administrator-sent link opened as "expired" — or, worse, as
 * `ready` on whatever session the browser already held, so the form would change THAT account's password.
 *
 * Tokens are only ever returned to the caller to be handed to `setSession`; they are never logged or shown.
 */
export type RecoveryLink =
    | { kind: "none" }
    /** The provider redirected with an error (expired, already used, denied). */
    | { kind: "error" }
    /** An implicit-flow recovery session in the fragment. */
    | { kind: "tokens"; accessToken: string; refreshToken: string }
    /** A PKCE code the auth client must exchange itself. */
    | { kind: "code" };

export function readRecoveryLink(href: string): RecoveryLink {
    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return { kind: "none" };
    }
    const query = url.searchParams;
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    const either = (key: string) => fragment.get(key) ?? query.get(key);
    if (either("error") || either("error_code") || either("error_description")) return { kind: "error" };
    const accessToken = fragment.get("access_token");
    if (accessToken) {
        const refreshToken = fragment.get("refresh_token");
        return refreshToken ? { kind: "tokens", accessToken, refreshToken } : { kind: "error" };
    }
    if (query.get("code")) return { kind: "code" };
    return { kind: "none" };
}

/** The slice of the auth client the reset page needs. */
export interface RecoveryAuthClient {
    getSession(): Promise<{ data: { session: unknown } | null; error: unknown }>;
    setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ data: { session: unknown } | null; error: unknown }>;
}

/**
 * Who the form is for, and why it may change their password.
 *
 * - `recovery`: the page was opened with a recovery link and THAT link produced this session.
 * - `signed_in`: no link — an operator already signed in is changing their own password. A different,
 *   explicitly labelled path; never the continuation of a link that failed (a failed link is `expired`).
 */
export type RecoveryMode = "recovery" | "signed_in";

export interface RecoverySessionResult {
    state: RecoverySessionState;
    failure: unknown;
    mode: RecoveryMode;
    /** The account the form was opened for. Bound at establishment; checked again at submit. */
    userId: string | null;
    email: string | null;
}

function sessionUser(session: unknown): { id: string | null; email: string | null } {
    const user = (session as { user?: { id?: unknown; email?: unknown } } | null)?.user;
    return { id: typeof user?.id === "string" ? user.id : null, email: typeof user?.email === "string" ? user.email : null };
}

function result(state: RecoverySessionState, failure: unknown, mode: RecoveryMode, session: unknown = null): RecoverySessionResult {
    // Only a ready answer names an account; a session behind an expired or unavailable answer is not offered.
    const user = state === "ready" ? sessionUser(session) : { id: null, email: null };
    if (state === "ready" && !user.id) return { state: "expired", failure, mode, userId: null, email: null };
    return { state, failure, mode, userId: user.id, email: user.email };
}

export interface RecoveryLocation {
    href(): string;
    /** Drop the link (fragment, `code`, error parameters) from the address bar and history. */
    clearLink(): void;
}

/**
 * Turn the link the page was opened with into a recovery session, or say truthfully why not.
 *
 * - **Fragment tokens** go to `setSession`, which works whatever flow the client was built for. The fragment
 *   is cleared first, so the tokens do not stay in the address bar or history.
 * - **A PKCE code** is exchanged by the client during initialisation, which removes `code` from the URL on
 *   success. A code still in the URL after `getSession()` means no exchange happened (no verifier in this
 *   browser, or the provider refused it); that is `expired` even if the browser holds some other session.
 * - **No link** keeps the existing behaviour: a signed-in operator may change their own password.
 */
export async function establishRecoverySession(
    auth: () => RecoveryAuthClient,
    location: RecoveryLocation,
): Promise<RecoverySessionResult> {
    const link = readRecoveryLink(location.href());
    const mode: RecoveryMode = link.kind === "none" ? "signed_in" : "recovery";
    if (link.kind === "error") {
        location.clearLink();
        return result("expired", null, mode);
    }
    if (link.kind === "tokens") location.clearLink();
    try {
        if (link.kind === "tokens") {
            const { data, error } = await auth().setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
            const session = data?.session ?? null;
            return result(recoverySessionState({ session, error }), error, mode, session);
        }
        const { data, error } = await auth().getSession();
        if (link.kind === "code" && readRecoveryLink(location.href()).kind === "code") {
            location.clearLink();
            return result(error != null && infrastructureFailure(error) ? "unavailable" : "expired", error, mode);
        }
        const session = data?.session ?? null;
        return result(recoverySessionState({ session, error }), error, mode, session);
    } catch (thrown) {
        return result(recoverySessionState({ thrown }), thrown, mode);
    }
}

export interface PasswordUpdateClient {
    getSession(): Promise<{ data: { session: unknown } | null; error: unknown }>;
    updateUser(attributes: { password: string }): Promise<{ error: unknown }>;
}

export type BoundPasswordUpdate = { ok: true } | { ok: false; reason: "account_changed" } | { ok: false; reason: "failed"; error: unknown };

/**
 * Change the password of the account the form was opened for — and no other.
 *
 * **The defect.** The form called `updateUser` on whatever session the auth client held at submit time.
 * Sessions live in shared browser storage: signing in as B in another tab while A's recovery form is open,
 * or a remount that reuses A's cached `ready`, would have changed B's password with no sign that B was the
 * target. The session is read again here and must still belong to the account bound at establishment.
 * (A switch in the instant between this read and the update is not excluded; the window is one round trip.)
 */
export async function updatePasswordForBoundAccount(
    auth: PasswordUpdateClient,
    boundUserId: string | null,
    password: string,
): Promise<BoundPasswordUpdate> {
    if (!boundUserId) return { ok: false, reason: "account_changed" };
    const { data, error: sessionError } = await auth.getSession();
    if (sessionError != null) return { ok: false, reason: "failed", error: sessionError };
    if (sessionUser(data?.session ?? null).id !== boundUserId) return { ok: false, reason: "account_changed" };
    const { error } = await auth.updateUser({ password });
    return error == null ? { ok: true } : { ok: false, reason: "failed", error };
}

/** `href` without the recovery link: no `code`, no provider error parameters, no fragment. */
export function withoutRecoveryLink(href: string): string {
    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return href;
    }
    for (const key of ["code", "error", "error_code", "error_description"]) url.searchParams.delete(key);
    url.hash = "";
    return url.toString();
}

/**
 * One answer per recovery link, however many times the page initialises.
 *
 * **The defect.** `establishRecoverySession` clears the link from the address bar before it settles. React
 * StrictMode (development) runs the effect, cancels it, and runs it again; a remount does the same. The second
 * run read the CLEARED address — no link — and fell through to `getSession()`, so an expired, refused or
 * unexchanged link the first run had judged `expired` was shown as `ready` on whatever session the browser
 * already held. A failed `setSession` repeated the same way.
 *
 * The first run's link and its pending answer are kept. A later run whose address is that link, or that link
 * with the link removed, gets the SAME promise — it never asks again. A visit with no link is not cached, so
 * an operator who signs in and returns is evaluated afresh. A cached `ready` carries the account it was
 * established for and submit re-checks it (`updatePasswordForBoundAccount`), so reusing it never extends to
 * a session that has since replaced that account.
 */
export function createRecoverySessionCache(establish: typeof establishRecoverySession = establishRecoverySession) {
    let entry: { originalHref: string; clearedHref: string; result: Promise<RecoverySessionResult> } | null = null;
    return (auth: () => RecoveryAuthClient, location: RecoveryLocation) => {
        const href = location.href();
        if (entry && (href === entry.originalHref || href === entry.clearedHref)) return entry.result;
        if (readRecoveryLink(href).kind === "none") return establish(auth, location);
        const pending = establish(auth, location);
        entry = { originalHref: href, clearedHref: withoutRecoveryLink(href), result: pending };
        return pending;
    };
}
