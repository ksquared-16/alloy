/**
 * THE BROWSER'S STRIPE KEY — one name resolved in one place.
 *
 * This platform had TWO environment variables for one value, and nobody noticed because each half
 * of the product read the one it was written with:
 *
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE       the original. `/debug/stripe` still tells an operator to
 *                                        set exactly this, and it is what the deployed environment
 *                                        actually carries.
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY   introduced later by W2's card field and the collection
 *                                        field, and never provisioned anywhere.
 *
 * So Add card refused with "payment processing is not configured for this environment" while the
 * key sat correctly configured in Vercel, correctly scoped to Preview, correctly embedded in the
 * build — under the other name. The operator was told to provision something they already had.
 *
 * ── WHY BOTH NAMES ARE READ STATICALLY ──
 *
 * `NEXT_PUBLIC_*` is substituted into the browser bundle at BUILD time, and only for a STATIC
 * member expression. `process.env[someVariable]` is not substituted — it compiles to a lookup on a
 * shim that is empty in the browser. A "tidy" helper taking the name as an argument would therefore
 * resolve to nothing in production while passing every test in Node. Both names are spelled out
 * here for that reason, and that is the whole trick.
 *
 * The canonical name wins when both are set, so provisioning it later migrates this cleanly and the
 * legacy read can then be deleted.
 */

/** The publishable key for the browser, or "" when neither name is configured. */
export function stripePublishableKey(): string {
    const canonical = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();
    if (canonical) return canonical;
    return (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE ?? "").trim();
}

/**
 * The same rule for a caller holding an environment object — the configuration-health route, which
 * runs on the server and must also report WHICH name supplied the value.
 *
 * Reporting the source name is the point: "present" alone is what let one name be configured and
 * the other one read for however long this divergence has existed.
 */
export function resolvePublishableFromEnv(env: Record<string, string | undefined>): {
    key: string;
    variable: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" | "NEXT_PUBLIC_STRIPE_PUBLISHABLE" | null;
} {
    const canonical = (env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();
    if (canonical) return { key: canonical, variable: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" };
    const legacy = (env.NEXT_PUBLIC_STRIPE_PUBLISHABLE ?? "").trim();
    if (legacy) return { key: legacy, variable: "NEXT_PUBLIC_STRIPE_PUBLISHABLE" };
    return { key: "", variable: null };
}
