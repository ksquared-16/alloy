/**
 * Experience Builder — full-screen studio mode detection (presentation layer).
 */

export function isExperienceBuilderStudioPath(pathname: string): boolean {
    // Canonical user-facing route is `/organization/surfaces`.
    // `/settings/surfaces` and `/settings/layouts` remain redirect sources (back-compat).
    return (
        pathname.includes("/organization/surfaces")
        || pathname.includes("/settings/surfaces")
        || pathname.includes("/settings/layouts")
    );
}

export function isExperienceBuilderStudioActive(
    pathname: string,
    searchParams: Pick<URLSearchParams, "get">,
): boolean {
    if (!isExperienceBuilderStudioPath(pathname)) return false;
    // Surfaces embeds Edit inside the Collection → Selected Surface workspace —
    // never activate full-bleed studio chrome on the Surfaces product path.
    if (pathname.includes("/organization/surfaces") || pathname.includes("/settings/surfaces")) {
        return false;
    }
    if (searchParams.get("editor") !== "1") return false;
    if (!searchParams.get("layout")?.trim()) return false;
    if (searchParams.get("advanced") === "1") return false;
    if (searchParams.get("legacy") === "1") return false;
    return true;
}
