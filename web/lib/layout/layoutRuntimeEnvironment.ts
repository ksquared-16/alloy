/**
 * Layout runtime environment helpers.
 *
 * Layout runtime defaults ON in all deploy environments (see featureFlag.ts).
 * These helpers remain for callers that branch on deploy target; they no longer
 * gate layout runtime adoption.
 */

function isProductionDeployServer(): boolean {
    if (process.env.NEXT_PUBLIC_APP_ENV === "production") return true;
    if (process.env.APP_ENV === "production") return true;
    if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_APP_ENV !== "staging") {
        return true;
    }
    return false;
}

/** @deprecated Layout runtime defaults on — use isLayoutRuntimeEnabled* from featureFlag.ts. */
export function isLayoutRuntimeStagingDefaultOnServer(): boolean {
    return true;
}

/** @deprecated Layout runtime defaults on — use isLayoutRuntimeEnabled* from featureFlag.ts. */
export function isLayoutRuntimeStagingDefaultOnClient(): boolean {
    return true;
}
