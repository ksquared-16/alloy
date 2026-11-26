/**
 * W-31 (PARTIAL) / `I-34`, `07/AU-3` — the password policy acquires one definition.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §18. §18's
 * finding, re-verified this session at `reset-password:42-45`: *"`length >= 6`, client-side only, in
 * a submit handler; the server accepts anything."*
 *
 * **What this module is, and what it is honestly not.** §18's remedy is *"ship a server-side
 * validator with the current values as defaults"*, and `W-31`'s exit is *"a policy expressed only in
 * a submit handler no longer exists."* This module is the validator, with the current value as its
 * default, and it is the only definition of the policy in the product. It is **not** server-side
 * enforcement, and W-31 is therefore NOT closed by it.
 *
 * **The reason is a correction to §18's sizing, established from source this session.** §18 assumes
 * an enforcement point on the server exists to move the check to. It does not. The product's only
 * password-setting path is `reset-password/page.tsx:50` — `supabase.auth.updateUser({ password })` —
 * a call from the browser straight to the provider. Grepping the whole tree for a server-side
 * password write (`auth.admin.createUser`, `updateUserById`, any route accepting a `password` field)
 * returns **nothing outside test fixtures**. So there is no server the policy can be enforced at
 * until one is introduced, and introducing a server-mediated password-set path is an authentication
 * architecture change rather than the S–M validator §18 priced. That is escalated rather than
 * performed — see the execution record's `OD-9`.
 *
 * Keeping the policy here anyway is not a consolation prize: it is the prerequisite. When the
 * enforcement point lands it imports this, and the two cannot then disagree — which is the failure
 * mode `W-42` closed for role keys and `W-52` for the authority model.
 */

/** The policy as it stands. `W-33`'s per-org record makes these configurable; it does not own them. */
export const PASSWORD_POLICY = Object.freeze({
    minLength: 6,
});

/**
 * Why this password is unacceptable, or `null` when it satisfies the policy.
 *
 * Returns the operator-facing sentence directly, so a caller cannot restate the rule in its own
 * words and drift from it — the drift that put `>= 6` in a submit handler and nowhere else.
 */
export function passwordPolicyViolation(password: unknown): string | null {
    if (typeof password !== "string" || password.length === 0) {
        return "Enter a password.";
    }
    if (password.length < PASSWORD_POLICY.minLength) {
        return `Password must be at least ${PASSWORD_POLICY.minLength} characters.`;
    }
    return null;
}

/** Why this pair is unacceptable, including the confirmation mismatch. */
export function passwordChangeViolation(password: unknown, confirmation: unknown): string | null {
    if (password !== confirmation) return "Passwords do not match.";
    return passwordPolicyViolation(password);
}
