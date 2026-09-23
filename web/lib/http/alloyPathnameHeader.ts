/**
 * The request header middleware uses to tell SERVER COMPONENTS which address is being rendered.
 *
 * Next gives a layout params only for its own dynamic segments, and never `searchParams`. The
 * workspace layout owns Focus Panel rendering but has neither the work-unit slug (a child segment)
 * nor the query, so without this it cannot know what it is rendering — and the frame could only be
 * composed by a descendant, which is too late to server-render anything above it.
 *
 * One definition, imported by the writer (middleware) and every reader, so the two cannot drift.
 */
export const ALLOY_PATHNAME_HEADER = "x-alloy-pathname" as const;

/** Split the forwarded address into the parts a composer needs. `null` when it was not forwarded. */
export function readForwardedAddress(value: string | null | undefined): {
    pathname: string;
    searchParams: URLSearchParams;
} | null {
    if (!value) return null;
    const q = value.indexOf("?");
    return q === -1
        ? { pathname: value, searchParams: new URLSearchParams() }
        : { pathname: value.slice(0, q), searchParams: new URLSearchParams(value.slice(q + 1)) };
}
