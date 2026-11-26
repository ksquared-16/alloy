/**
 * The commit SHA this bundle was built from — the single source both client and server read to
 * prove which deploy is actually running. Set at build time by next.config.ts (`NEXT_PUBLIC_BUILD_SHA`,
 * inlined). "unknown" only if the build had no git/env SHA available.
 *
 * Exposed three ways so staleness is provable without the authenticated browser:
 *  - `data-build-sha` on the Work Unit surface + Focus Panel boundary (DOM),
 *  - `GET /api/runtime-info` (curl-able),
 *  - a one-line console marker on the operator surfaces.
 */
export const BUILD_SHA: string = (process.env.NEXT_PUBLIC_BUILD_SHA || "unknown").slice(0, 12);
