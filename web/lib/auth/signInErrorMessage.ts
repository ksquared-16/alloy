/**
 * W-32 / `I-33`, `S-4` — authentication error text stops surfacing provider strings verbatim.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §18.
 *
 * **The defect.** `04…§6.3`: *"authentication error text MUST NOT surface provider strings verbatim;
 * the sign-in path MUST match the anti-enumeration discipline already applied at
 * `send-password-reset:35-37`."* The sign-in page rendered `signInError.message` straight to the
 * screen, so the product's answer to a sign-in attempt distinguished *this address has no account*
 * from *this password is wrong* whenever the provider chose to — `Email not confirmed` is the clearest
 * case, and it is an account-existence oracle for any address an attacker cares to type.
 *
 * **This is a consistency fix, not a design.** The discipline already exists in this codebase and is
 * applied unevenly (`01…§14.2`): `send-password-reset` deliberately reports the same sentence whether
 * or not the account exists, with the comment *"Do not leak success/failure (prevent enumeration)."*
 * W-32 states that same rule on the sign-in path.
 *
 * **What is deliberately preserved.** Two of the page's branches are not provider account signals and
 * are load-bearing for anyone standing up an environment: a missing `NEXT_PUBLIC_SUPABASE_*` value,
 * and an unreachable Supabase origin. Neither says anything about an account, both are true of every
 * caller regardless of the address typed, and collapsing them into "email or password is incorrect"
 * would send an operator with a misconfigured `.env` hunting for a credential problem. They are
 * recognised by SHAPE and mapped to their own fixed strings rather than passed through, so the
 * exception's own text still never reaches the screen.
 *
 * `W-39` carries the two public routes that serialize `e.message` (`field-definitions`,
 * `booking-config`). `W-32` carries the sign-in path — the split §18 states.
 */

/** The classes of failure the sign-in surface may distinguish. None of them names an account. */
export type SignInFailureKind =
    /** Anything about the credentials or the account. One answer, always. */
    | "credentials"
    /** The provider refused for volume. Worth saying, because retrying immediately will also fail. */
    | "rate_limited"
    /** This deployment is missing its Supabase configuration. Not about the caller at all. */
    | "misconfigured"
    /** The provider could not be reached. Also not about the caller. */
    | "unreachable";

const CREDENTIAL_MESSAGE =
    "Email or password is incorrect. If you have not signed in before, check with your administrator.";

const MESSAGES: Record<SignInFailureKind, string> = {
    credentials: CREDENTIAL_MESSAGE,
    rate_limited: "Too many sign-in attempts. Wait a moment and try again.",
    misconfigured:
        "This environment is missing its Supabase configuration (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    unreachable:
        "Could not reach the authentication service. Check your connection, and that NEXT_PUBLIC_SUPABASE_URL points at a reachable Supabase URL.",
};

/** Every message this module can produce. Exported so a lock can assert the set is closed. */
export const SIGN_IN_MESSAGES: readonly string[] = Object.freeze(Object.values(MESSAGES));

const RATE_LIMIT = /rate limit|too many requests|429/i;
const MISCONFIGURED = /NEXT_PUBLIC_SUPABASE/;
const UNREACHABLE = /failed to fetch|network ?error|ECONNREFUSED|ENOTFOUND|fetch failed/i;

/**
 * Classify a sign-in failure.
 *
 * **The default is `credentials`, and that is the whole point.** An unrecognised provider string is
 * far more likely to be a new account-state message than a new infrastructure message — Supabase has
 * added several — so an unknown must fall to the answer that reveals nothing. A classifier whose
 * default is "pass it through" is the defect with a function wrapped around it.
 */
export function classifySignInFailure(error: unknown): SignInFailureKind {
    const raw =
        error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : typeof (error as { message?: unknown } | null)?.message === "string"
                ? ((error as { message: string }).message)
                : "";

    if (MISCONFIGURED.test(raw)) return "misconfigured";
    if (UNREACHABLE.test(raw)) return "unreachable";
    if (RATE_LIMIT.test(raw)) return "rate_limited";
    return "credentials";
}

/** The sentence to show. Never contains any part of the provider's own text. */
export function signInErrorMessage(error: unknown): string {
    return MESSAGES[classifySignInFailure(error)];
}

/**
 * The message for a failed password update on the recovery path.
 *
 * Same rule, different surface: `reset-password` rendered `updateError.message` verbatim, which on
 * this path leaks the provider's password-policy and session-state text to an unauthenticated
 * caller. A recovery session either works or has expired, and the page already has an `expired`
 * state for the latter, so there is nothing an operator can do with the provider's wording.
 */
export function passwordUpdateErrorMessage(error: unknown): string {
    const kind = classifySignInFailure(error);
    if (kind === "misconfigured" || kind === "unreachable") return MESSAGES[kind];
    if (kind === "rate_limited") return MESSAGES.rate_limited;
    return "The password could not be updated. Your reset link may have expired — request a new one and try again.";
}
