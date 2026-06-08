/**
 * Layout runtime environment — staging defaults on, production defaults off.
 *
 * Staging detection uses `NEXT_PUBLIC_APP_ENV=staging` (set on Vercel staging deploys)
 * and server-side `VERCEL_ENV=preview` for non-production branch previews.
 * Explicit env vars always override defaults via readFlag.
 */

function isProductionDeployServer(): boolean {
    if (process.env.NEXT_PUBLIC_APP_ENV === "production") return true;
    if (process.env.APP_ENV === "production") return true;
    if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_APP_ENV !== "staging") {
        return true;
    }
    return false;
}

/** Server: layout runtime flags default ON on staging, OFF on production. */
export function isLayoutRuntimeStagingDefaultOnServer(): boolean {
    if (isProductionDeployServer()) return false;
    if (process.env.NEXT_PUBLIC_APP_ENV === "staging") return true;
    if (process.env.APP_ENV === "staging") return true;
    if (process.env.VERCEL_ENV === "preview") return true;
    return false;
}

/** Client: relies on build-time NEXT_PUBLIC_APP_ENV (same as StagingBanner). */
export function isLayoutRuntimeStagingDefaultOnClient(): boolean {
    if (process.env.NEXT_PUBLIC_APP_ENV === "production") return false;
    return process.env.NEXT_PUBLIC_APP_ENV === "staging";
}
