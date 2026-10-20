/**
 * Does this storage path live inside this organization's prefix?
 *
 * Every route that reaches `org_documents` does so with the service-role client, which can read,
 * sign or remove ANY tenant's object. The only thing tying a `documents` row to its own tenant's file
 * is that the row's `storage_path` starts with `<org_id>/` — a convention the upload route has always
 * followed and nothing ever checked. Documents V1 / D1a makes it the precondition for signing,
 * reading or removing an object (deployed census 2026-10-20: 279 of 279 rows conform).
 *
 * Refuses traversal and absolute forms outright, so a path cannot satisfy the prefix and still
 * escape it. Dependency-free so server helpers outside the route layer can use it too.
 */
export function isStoragePathWithinOrg(storagePath: string, orgId: string): boolean {
    const path = String(storagePath ?? "");
    const org = String(orgId ?? "").trim();
    if (!org || !path) return false;
    if (path.includes("\\") || path.includes("\0")) return false;
    const segments = path.split("/");
    if (segments.some((s) => s === ".." || s === ".")) return false;
    return segments.length >= 2 && segments[0] === org && segments.slice(1).every((s) => s.length > 0);
}
