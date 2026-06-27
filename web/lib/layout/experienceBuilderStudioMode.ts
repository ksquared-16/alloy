/**
 * Experience Builder — full-screen studio mode detection (presentation layer).
 */

export function isExperienceBuilderStudioPath(pathname: string): boolean {
    // Canonical user-facing route is `/settings/surfaces`. `/settings/layouts`
    // is retained only as a redirect source (back-compat); detect both.
    return (
        pathname.includes("/settings/surfaces")
        || pathname.includes("/settings/layouts")
    );
}

export function isExperienceBuilderStudioActive(
    pathname: string,
    searchParams: Pick<URLSearchParams, "get">,
): boolean {
    if (!isExperienceBuilderStudioPath(pathname)) return false;
    if (searchParams.get("editor") !== "1") return false;
    if (!searchParams.get("layout")?.trim()) return false;
    if (searchParams.get("advanced") === "1") return false;
    if (searchParams.get("legacy") === "1") return false;
    return true;
}
