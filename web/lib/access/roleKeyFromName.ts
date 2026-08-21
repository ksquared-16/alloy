/**
 * The technical role key, derived from the name an operator actually types.
 *
 * **Why this exists.** Role creation asked for a "Key" beside the label, with the help text
 * *"Technical identifier only — operators see the label, not this key."* If operators are not
 * supposed to see it, they should not have to invent it: a field whose own caption explains that it
 * is not for you is an implementation detail wearing a form control. Worse, it is a field an
 * operator can get *wrong* in ways the product then carries forever, because the key is the
 * membership vocabulary `W-16`'s foreign key enforces.
 *
 * So the key is generated. It stays stable, it stays the canonical identifier underneath, and it
 * appears to an operator only in advanced diagnostics.
 *
 * **The slug rule matches the server's exactly**, and that is deliberate rather than convenient:
 * `POST /api/admin/rbac/roles` normalises with
 * `toLowerCase().replace(/[^a-z0-9_]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"")`. Deriving with a
 * different rule would mean the key the client believes it created is not the key the server stored
 * — the two-answers-to-one-question defect this program has closed repeatedly. If the server's rule
 * changes, this must change with it; `roleKeyFromName.test.ts` asserts the two agree.
 */

/** The server's normalisation, applied to a candidate. Exported so a test can compare the two. */
export function slugifyRoleKey(input: string): string {
    return String(input || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

/**
 * A stable key for `name`, unique against `existing`.
 *
 * Collisions are resolved deterministically — `_2`, `_3`, … — rather than with a random suffix or a
 * timestamp. Two operators typing the same role name in the same organization should get the same
 * answer, and a key that embeds the moment it was created is unreadable in the diagnostics it exists
 * for.
 *
 * Returns `null` when the name yields no slug at all (punctuation only, say). The caller refuses to
 * submit rather than inventing a name — a role called `_` helps nobody, and the server would reject
 * it anyway.
 */
export function roleKeyFromName(name: string, existing: readonly string[] = []): string | null {
    const base = slugifyRoleKey(name);
    if (!base) return null;

    const taken = new Set(existing.map((k) => slugifyRoleKey(k)));
    if (!taken.has(base)) return base;

    // Bounded rather than unbounded: a thousand identically-named roles is not a case worth looping
    // over, and returning null makes the surface say so instead of hanging.
    for (let n = 2; n <= 999; n += 1) {
        const candidate = `${base}_${n}`;
        if (!taken.has(candidate)) return candidate;
    }
    return null;
}
