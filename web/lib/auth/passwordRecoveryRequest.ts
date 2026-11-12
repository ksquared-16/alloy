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

/**
 * The ONLY authority the password write may use: the access token of the session established for this form.
 * Held in memory, never logged, never rendered. It carries no refresh token, so it can never be renewed or
 * rotated, and it lapses with that access token.
 */
export interface RecoveryCredential {
    accessToken: string;
    /** Seconds since the epoch, as the provider issued it. */
    expiresAt: number;
    userId: string;
}

export interface RecoverySessionResult {
    state: RecoverySessionState;
    failure: unknown;
    mode: RecoveryMode;
    /** The account the form was opened for. */
    userId: string | null;
    email: string | null;
    credential: RecoveryCredential | null;
}

function sessionUser(session: unknown): { id: string | null; email: string | null } {
    const user = (session as { user?: { id?: unknown; email?: unknown } } | null)?.user;
    return { id: typeof user?.id === "string" ? user.id : null, email: typeof user?.email === "string" ? user.email : null };
}

function sessionCredential(session: unknown, userId: string): RecoveryCredential | null {
    const s = session as { access_token?: unknown; expires_at?: unknown } | null;
    if (typeof s?.access_token !== "string" || !s.access_token || typeof s.expires_at !== "number") return null;
    return { accessToken: s.access_token, expiresAt: s.expires_at, userId };
}

function result(state: RecoverySessionState, failure: unknown, mode: RecoveryMode, session: unknown = null): RecoverySessionResult {
    // Only a ready answer names an account; a session behind an expired or unavailable answer is not offered.
    const user = state === "ready" ? sessionUser(session) : { id: null, email: null };
    const credential = state === "ready" && user.id ? sessionCredential(session, user.id) : null;
    if (state === "ready" && !credential) return { state: "expired", failure, mode, userId: null, email: null, credential: null };
    return { state, failure, mode, userId: user.id, email: user.email, credential };
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

/**
 * The refresh token the private writer is seeded with. Not a credential: the provider can never accept it, so
 * if the library ever tries to refresh (an access token that lapsed mid-write), the attempt fails and A's REAL
 * refresh token is never sent, used or rotated. `setSession` requires a non-empty value.
 */
export const RECOVERY_WRITER_REFRESH_PLACEHOLDER = "alloy-unrefreshable-recovery-writer";

/** The part of an auth client the write needs. */
export interface PasswordWriteClient {
    /** Seed the private writer with the credential once; resolves to the account the provider says it is. */
    seeded(): Promise<{ userId: string | null; error: unknown }>;
    updateUser(attributes: { password: string }): Promise<{ error: unknown }>;
}

export type BoundPasswordUpdate = { ok: true } | { ok: false; reason: "expired" } | { ok: false; reason: "failed"; error: unknown };

/** The slice of a supabase-js client the private writer uses. */
export interface RecoveryWriterAuth {
    setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ data: { user?: { id?: string } | null } | null; error: unknown }>;
    updateUser(attributes: { password: string }): Promise<{ error: unknown }>;
}
/** Builds an ISOLATED client (never the shared one); in the app, supabase-js `createClient`. */
export type RecoveryWriterClientFactory = (
    supabaseUrl: string,
    anonKey: string,
    options: { auth: { storageKey: string; persistSession: false; autoRefreshToken: false; detectSessionInUrl: false } },
) => { auth: RecoveryWriterAuth };

/**
 * One private writer per credential — the page's only route to a password write.
 *
 * `persistSession: false`: the session lives only in this client's memory, the library opens no
 * BroadcastChannel (the token is never announced to other same-origin pages) and writes nothing to browser
 * storage. Seeded once with `setSession`; a seed that failed is retried on the next submit. It never refreshes
 * (`RECOVERY_WRITER_REFRESH_PLACEHOLDER`). NEVER `signOut` it — every scope calls the provider's logout with
 * the recovering account's live session. Dropping the reference is the teardown.
 */
export function recoveryWriterFactory(createIsolatedClient: RecoveryWriterClientFactory, supabaseUrl: string, anonKey: string) {
    const writers = new WeakMap<RecoveryCredential, PasswordWriteClient>();
    return (credential: RecoveryCredential): PasswordWriteClient => {
        const existing = writers.get(credential);
        if (existing) return existing;
        const { auth } = createIsolatedClient(supabaseUrl, anonKey, {
            auth: {
                storageKey: `alloy-recovery-write-${credential.userId}`,
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        });
        let seeding: Promise<{ userId: string | null; error: unknown }> | null = null;
        const writer: PasswordWriteClient = {
            seeded: () =>
                (seeding ??= auth
                    .setSession({ access_token: credential.accessToken, refresh_token: RECOVERY_WRITER_REFRESH_PLACEHOLDER })
                    .then(
                        ({ data, error }) => {
                            if (error) seeding = null;
                            return { userId: data?.user?.id ?? null, error };
                        },
                        // A seed that throws (not an AuthError) is a failed seed too: never memoised, never a write.
                        (thrown: unknown) => {
                            seeding = null;
                            return { userId: null, error: thrown };
                        },
                    )),
            updateUser: (attributes) => auth.updateUser(attributes),
        };
        writers.set(credential, writer);
        return writer;
    };
}

/** Seconds of validity a credential must still have to be used; matches the library's own expiry margin. */
const CREDENTIAL_MARGIN_SECONDS = 90;

/** A credential the provider no longer honours: the operator must re-open their link, not retry. */
function credentialLapsed(error: unknown): boolean {
    const e = error as { name?: unknown; code?: unknown } | null;
    if (e?.name === "AuthSessionMissingError") return true;
    return ["refresh_token_not_found", "session_not_found", "session_expired", "bad_jwt"].includes(String(e?.code ?? ""));
}

/**
 * Change the password of the account the form was opened for — through the actual request, not just before it.
 *
 * **The defect.** The form called `updateUser` on the shared browser client. supabase-js resolves the session
 * INSIDE that call, from shared storage, and sends that session's token: a session replaced by another tab
 * between any earlier check and the request received the write.
 *
 * **The binding.** The write runs on a client created for `credential` alone, with `persistSession: false`:
 * the library keeps that session in the client's own memory, opens no BroadcastChannel (so the token is never
 * announced to other same-origin pages) and writes nothing to browser storage. It is seeded once with
 * `setSession`; the provider's answer must name the bound account or nothing is written. It cannot refresh
 * (`RECOVERY_WRITER_REFRESH_PLACEHOLDER`) and never falls back to the shared client.
 *
 * **Never `signOut` it.** Every scope of `signOut` calls the provider's logout with the session's access token
 * — for this writer, the recovering account's live session. Teardown is dropping the reference.
 */
export async function updatePasswordWithCredential(
    writeClientFor: (credential: RecoveryCredential) => PasswordWriteClient,
    credential: RecoveryCredential | null,
    password: string,
    nowSeconds = Math.floor(Date.now() / 1000),
): Promise<BoundPasswordUpdate> {
    if (!credential || credential.expiresAt - nowSeconds < CREDENTIAL_MARGIN_SECONDS) return { ok: false, reason: "expired" };
    const writer = writeClientFor(credential);
    const seed = await writer.seeded();
    if (seed.error != null) return credentialLapsed(seed.error) ? { ok: false, reason: "expired" } : { ok: false, reason: "failed", error: seed.error };
    if (seed.userId !== credential.userId) return { ok: false, reason: "expired" };
    const { error } = await writer.updateUser({ password });
    if (error == null) return { ok: true };
    if (credentialLapsed(error)) return { ok: false, reason: "expired" };
    return { ok: false, reason: "failed", error };
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
 * an operator who signs in and returns is evaluated afresh. A cached `ready` carries the credential it was
 * established with, and the write uses only that (`updatePasswordWithCredential`), so reusing it never
 * extends to a session that has since replaced that account.
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
