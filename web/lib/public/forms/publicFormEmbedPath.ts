/** Public iframe embed surface (`/forms/embed/[token]`). */
export function isPublicFormEmbedPath(pathname: string | null | undefined): boolean {
    if (!pathname) return false;
    return pathname === "/forms/embed" || pathname.startsWith("/forms/embed/");
}
