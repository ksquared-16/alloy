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

export function GET() {
    const body = {
        gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        gitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        gitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
        vercelEnv: process.env.VERCEL_ENV ?? null,
        vercelUrl: process.env.VERCEL_URL ?? null,
        vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
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
