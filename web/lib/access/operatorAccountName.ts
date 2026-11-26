/**
 * The operator's human-readable account name.
 *
 * **The decision this implements, and its boundary.** Access uses the existing authenticated account
 * identity as the canonical source for an operator's display name. It does not create a Person ↔ User
 * relationship, does not open an Access-owned profile store, and does not add `title` anywhere. That
 * is a decision about *account display identity* for Access — not a claim that `auth.users` metadata
 * is Alloy's permanent canonical Person model.
 *
 * **First and last are inputs, not storage.** An operator types two fields because that is how people
 * think about a name; the canonical representation stays `full_name`, derived here. Persisting first
 * and last separately would be the parallel store the decision forbids, and it would immediately
 * disagree with `full_name` the first time either was edited elsewhere.
 *
 * **An unknown name is unknown.** The Users rail rendered `display_name || email`, so an account with
 * no name showed its address as the heading and again as the subtitle — the same string twice, and a
 * name presented for someone who has not got one. {@link operatorIdentity} returns `name: null`
 * instead, and the surface says so. `IA-R1`'s rule, applied to identity: an uncomputed value renders
 * as unknown rather than as a plausible substitute.
 */

/** Collapse whitespace and trim — the shape both halves of a name go through. */
function tidy(part: unknown): string {
    return typeof part === "string" ? part.trim().replace(/\s+/g, " ") : "";
}

/**
 * The canonical `full_name` for a first/last pair, or `null` when neither carries anything.
 *
 * Deterministic and order-stable: the same inputs always produce the same stored value, so an
 * account created twice with the same name is not two different names.
 */
export function fullNameFromParts(firstName: unknown, lastName: unknown): string | null {
    const joined = [tidy(firstName), tidy(lastName)].filter(Boolean).join(" ");
    return joined || null;
}

/** What a surface should show for an account. `name` is `null` when no name is on file. */
export type OperatorIdentity = {
    /** The human-readable name, or `null` — NEVER the email address standing in for one. */
    name: string | null;
    /** The login address, or `null` when it could not be read. */
    email: string | null;
};

/**
 * Project an account's identity for display.
 *
 * The email is never promoted into `name`. That substitution is what produced the duplicated line,
 * and it also quietly asserts that an address is a person's name — which it is not, and which reads
 * as carelessness on a screen whose whole job is telling an administrator who someone is.
 */
export function operatorIdentity(account: {
    display_name?: string | null;
    email?: string | null;
}): OperatorIdentity {
    const name = tidy(account.display_name);
    const email = tidy(account.email);
    return { name: name || null, email: email || null };
}

/**
 * The single line to show when only one line fits — a rail row's heading, say.
 *
 * Falls back to the address when there is no name, because a row still has to identify the account,
 * and then the caller must NOT also print the address underneath: {@link identitySubtitle} returns
 * `null` in exactly that case so the two cannot repeat each other.
 */
export function identityHeadline(identity: OperatorIdentity): string {
    return identity.name ?? identity.email ?? "Unnamed account";
}

/**
 * The secondary line, or `null` when it would repeat the headline.
 *
 * This pairing is the fix. `identityHeadline` may fall back to the address; `identitySubtitle` then
 * withholds it, so an account without a name shows its address once rather than twice.
 */
export function identitySubtitle(identity: OperatorIdentity): string | null {
    if (identity.name && identity.email) return identity.email;
    if (identity.name && !identity.email) return "No email on file";
    // Headline is already the email (or "Unnamed account") — saying it again is the defect.
    return null;
}

/** True when the account has no name on file, so a surface can say so rather than imply one. */
export function nameIsUnknown(identity: OperatorIdentity): boolean {
    return identity.name === null;
}
