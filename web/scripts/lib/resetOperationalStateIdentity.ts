/**
 * Target-identity guards for resetOperationalState.
 *
 * A reset is authorised against a NAMED database and a NAMED organization. The destructive
 * decision is made by reading a dry run, and a dry run is only meaningful if it ran against the
 * thing the operator thought it ran against. These helpers make the operator declare the target
 * and refuse when the connection disagrees — the failure mode being guarded is not a malformed
 * flag, it is a correct-looking run pointed at the wrong tenant.
 *
 * Pure and side-effect free so the refusal logic is unit-testable without a database.
 */

/** `https://abcdefghijklmnop.supabase.co` -> `abcdefghijklmnop`. Null when not a project URL. */
export function parseSupabaseProjectRef(supabaseUrl: string | null | undefined): string | null {
    const raw = supabaseUrl?.trim();
    if (!raw) return null;
    let host: string;
    try {
        host = new URL(raw).hostname;
    } catch {
        return null;
    }
    // Local stacks (127.0.0.1, localhost, host.docker.internal) have no project ref.
    const match = /^([a-z0-9]{20})\.supabase\.(co|in|net)$/i.exec(host);
    return match ? match[1].toLowerCase() : null;
}

export type ResetIdentityInput = {
    /** The connection actually configured (NEXT_PUBLIC_SUPABASE_URL). */
    supabaseUrl: string | null | undefined;
    /** What the operator declared they are resetting (RESET_SUPABASE_PROJECT_REF). Optional. */
    expectedProjectRef: string | null | undefined;
    /** The org the reset is scoped to (RESET_ORG_ID). */
    orgId: string;
    /**
     * The org actually found in that database, or null when no such org exists there.
     * A null here is the project/org mismatch: the id is real somewhere, just not here.
     */
    foundOrgId: string | null;
    /** Display name of the found org, for the operator-facing report. */
    foundOrgName?: string | null;
};

export type ResetIdentityVerdict = {
    ok: boolean;
    projectRef: string | null;
    problems: string[];
};

/**
 * Refuse unless the connection is the declared project AND the org exists inside it.
 *
 * `expectedProjectRef` is optional so local/isolated stacks keep working without ceremony, but
 * when it IS supplied a mismatch is fatal — that is the whole point of supplying it.
 */
export function assertResetTargetIdentity(input: ResetIdentityInput): ResetIdentityVerdict {
    const problems: string[] = [];
    const projectRef = parseSupabaseProjectRef(input.supabaseUrl);
    const expected = input.expectedProjectRef?.trim() || null;

    if (expected) {
        if (!projectRef) {
            problems.push(
                `RESET_SUPABASE_PROJECT_REF=${expected} was declared, but NEXT_PUBLIC_SUPABASE_URL ` +
                    `(${input.supabaseUrl ?? "(unset)"}) is not a hosted Supabase project URL.`
            );
        } else if (projectRef !== expected.toLowerCase()) {
            problems.push(
                `Project identity mismatch: declared RESET_SUPABASE_PROJECT_REF=${expected}, ` +
                    `connected to ${projectRef}.`
            );
        }
    }

    if (input.foundOrgId === null) {
        problems.push(
            `Organization ${input.orgId} does not exist in ${projectRef ?? "the connected database"}. ` +
                `Refusing: the org id and the database do not belong together.`
        );
    } else if (input.foundOrgId !== input.orgId) {
        problems.push(`Organization lookup returned ${input.foundOrgId}, expected ${input.orgId}.`);
    }

    return { ok: problems.length === 0, projectRef, problems };
}
