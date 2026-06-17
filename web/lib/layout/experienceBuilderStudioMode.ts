/**
 * Experience Builder — full-screen studio mode detection (presentation layer).
 */

export function isExperienceBuilderStudioPath(pathname: string): boolean {
    return (
        pathname.includes("/settings/layouts")
        || pathname.endsWith("/settings/layouts")
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
