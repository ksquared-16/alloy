/**
 * LOCAL-ONLY CERTIFICATION FIXTURES REFUSE ANY DATABASE THAT IS NOT ON THIS MACHINE.
 *
 * The scripts that `vac certify-fixture` runs (`dev:seed:operational-cards-certification`,
 * `dev:seed:enrollment-certification`, `dev:certify:enrollment-e2e`) create and DELETE rows with a
 * service-role client. The toolkit documents them as local-stack setup ("Governed actions remain the
 * right shape for anything that leaves this machine", certification-fixture.mjs), but the only
 * boundary in front of them was the toolkit's `alloy_is_production_supabase_url`, which permits any
 * remote project unless `ALLOY_BLOCK_REMOTE_SUPABASE=1` — and this host sets it to `0`, with the
 * trusted server env pointing at the hosted staging project. The scripts also load the worktree's
 * own `.env.local`, so they could reach a hosted database even when run directly. (Authorization QA
 * Q0 finding; containment is Q1.0.)
 *
 * THE BOUNDARY IS HERE, IN THE CODE THAT MUTATES. It does not read `ALLOY_BLOCK_REMOTE_SUPABASE` or
 * any other flag: there is no override, so no environment variable can widen it. Hosted fixtures
 * belong to governed reconciliation actions, which carry their own target proof and operator
 * approval.
 *
 * Every URL the service-role client could use is checked (`SUPABASE_URL`, then
 * `NEXT_PUBLIC_SUPABASE_URL`, as `createAdminClient` resolves them). Both must be local when present,
 * and at least one must be present — an absent URL is refused rather than left to fail later.
 */

/** Exit code a refused certification target produces. Distinct from a fixture's own failures (1). */
export const NON_LOCAL_TARGET_EXIT_CODE = 5;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Is this a URL on this machine? Parsed, never pattern-matched, so look-alike hosts cannot pass. */
export function isLoopbackDatabaseUrl(raw: string | null | undefined): boolean {
    if (!raw || !raw.trim()) return false;
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    // Userinfo can disguise a host (`http://127.0.0.1@evil.example`); a local stack never needs it.
    if (url.username || url.password) return false;
    return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
}

export type CertificationTargetVerdict =
    | { ok: true; host: string }
    | { ok: false; reason: "certification_target_unknown" | "certification_target_not_local"; host: string | null };

/** The verdict for the environment a fixture is about to run with. Never returns a key or a full URL. */
export function certificationTargetVerdict(env: NodeJS.ProcessEnv = process.env): CertificationTargetVerdict {
    const candidates = [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL]
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v) => v.length > 0);
    if (candidates.length === 0) return { ok: false, reason: "certification_target_unknown", host: null };
    for (const candidate of candidates) {
        if (!isLoopbackDatabaseUrl(candidate)) {
            return { ok: false, reason: "certification_target_not_local", host: hostOf(candidate) };
        }
    }
    return { ok: true, host: hostOf(candidates[0]) ?? "local" };
}

function hostOf(raw: string): string | null {
    try {
        return new URL(raw).host || null;
    } catch {
        return "<unparseable>";
    }
}

/**
 * Call at the top of a local-only fixture entry point, after env files load and before any client
 * exists. Refuses by exiting the process: nothing after it runs, so nothing is written.
 */
export function exitUnlessLocalCertificationTarget(fixture: string, env: NodeJS.ProcessEnv = process.env): void {
    const verdict = certificationTargetVerdict(env);
    if (verdict.ok) return;
    console.error(
        JSON.stringify({
            ok: false,
            fixture,
            code: verdict.reason,
            target_host: verdict.host,
            detail: "local-only certification fixtures run only against a database on this machine; hosted fixtures go through governed reconciliation",
        }),
    );
    process.exit(NON_LOCAL_TARGET_EXIT_CODE);
}
