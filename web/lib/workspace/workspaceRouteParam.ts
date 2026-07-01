/** Normalize Next.js `useParams()` segment (string | string[] | undefined) to a single trimmed id. */
export function workspaceRouteParam(v: string | string[] | undefined): string {
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim();
    return "";
}
