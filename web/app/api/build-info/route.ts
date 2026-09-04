import { NextResponse } from "next/server";

/**
 * Public build-identity probe. Reads the RUNNING deployment's identity from Vercel system env vars
 * so the deployed commit can be proven from the live server — never inferred from a URL or a GitHub
 * deployment record. Use this to confirm which build a domain/preview is actually serving before
 * treating any trace as authoritative:
 *
 *   curl https://<host>/api/build-info
 *
 * No auth, no tenant data — build metadata only. `force-dynamic` so it reflects the live process.
 */
export const dynamic = "force-dynamic";

/**
 * The Supabase PROJECT REF this deployment is wired to — never the URL, never a key.
 *
 * WHY THIS FIELD EXISTS. A managed browser session for a deployed target is minted from a trusted
 * credential environment held on the host. Nothing on the host can prove that environment belongs
 * to THIS deployment: the two are configured in different places by different people. Minting from
 * the wrong project fails in one of two ways, and the second is worse — the session authenticates
 * against a different environment that happens to share the identity, and a tester then certifies
 * the wrong system while everything looks green.
 *
 * So the deployment states its own project and the host compares. The ref is the subdomain of
 * NEXT_PUBLIC_SUPABASE_URL: `NEXT_PUBLIC_` is client-exposed by definition and this value already
 * appears in every browser bundle, so publishing it here reveals nothing new. The anon key and the
 * full URL are deliberately NOT returned — the ref alone is what an identity comparison needs.
 *
 * This is preferable to scraping the value out of a JS chunk, which is a heuristic that breaks
 * whenever the bundler changes.
 */
function supabaseProjectRef(): string | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null;
    if (!url) return null;
    try {
        const ref = new URL(url).hostname.split(".")[0];
        return /^[a-z0-9]{16,32}$/.test(ref) ? ref : null;
    } catch {
        return null;
    }
}

export function GET() {
    const body = {
        gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        gitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        gitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
        vercelEnv: process.env.VERCEL_ENV ?? null,
        vercelUrl: process.env.VERCEL_URL ?? null,
        vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
        supabaseProjectRef: supabaseProjectRef(),
    };
    return NextResponse.json(body, {
        headers: {
            "cache-control": "no-store, max-age=0",
            "x-alloy-build-sha": body.gitSha ?? "unknown",
            "x-alloy-git-branch": body.gitBranch ?? "unknown",
            "x-alloy-vercel-env": body.vercelEnv ?? "unknown",
        },
    });
}
