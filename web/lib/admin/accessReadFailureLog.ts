/**
 * W-43's read-failure channel, in one module because two modules now deny on it.
 *
 * The line format is load-bearing: it is grepped as `[access-identity][W-43][read-failure]` and its
 * fields are identifiers only, never free text about the principal. It was defined inside
 * `resolveAdminAccessCore`; `W-13` gave portal admission its own resolver
 * ({@link import("./portalAdmission")}), which must deny on the same class of failure and must say
 * so in the same words. Re-typing the format in the second module is how two channels that are
 * supposed to be one drift apart — `M2-5` is this initiative's record of exactly that, for the
 * legacy fallback — so the format lives here and neither caller owns it.
 *
 * `outcome=deny` is not decoration. A read failure is not an empty result, and the whole point of
 * the W-43 class is that the caller refuses rather than resolving the failure to "no access" and
 * letting a surface that never consults capability sail through.
 */
export function logAccessReadFailure(
    where: string,
    table: string,
    userId: string,
    orgId: string | null,
    message: string
): void {
    console.error(
        `[access-identity][W-43][read-failure] where=${where} table=${table} user_id=${userId} ` +
            `org_id=${orgId ?? "unresolved"} outcome=deny reason=read_error message=${message}`
    );
}
