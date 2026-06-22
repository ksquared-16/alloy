/**
 * Stable layout titles vs version numbers — avoid chained "(copy)" names.
 */

const COPY_SUFFIX = /\s*\(copy\)\s*$/i;
const VERSION_SUFFIX = /\s*(?:[—–-]\s*)?(?:Draft\s+)?(?:copy\s+)?V\d+\s*$/i;
const PAREN_VERSION_SUFFIX = /\s*\(V\d+\)\s*$/i;

/** Strip duplicate/copy/version suffixes from a stored layout name. */
export function resolveLayoutStableTitle(name: string | null | undefined): string {
    let title = (name ?? "").trim();
    if (!title) return "Layout";

    let changed = true;
    while (changed) {
        changed = false;
        if (COPY_SUFFIX.test(title)) {
            title = title.replace(COPY_SUFFIX, "").trim();
            changed = true;
        }
        if (PAREN_VERSION_SUFFIX.test(title)) {
            title = title.replace(PAREN_VERSION_SUFFIX, "").trim();
            changed = true;
        }
        if (VERSION_SUFFIX.test(title)) {
            title = title.replace(VERSION_SUFFIX, "").trim();
            changed = true;
        }
    }

    return title || "Layout";
}

/** Name stored on duplicate — stable title; version lives in `version` column. */
export function buildDuplicatedLayoutName(sourceName: string | null | undefined, explicitName?: string | null): string {
    if (explicitName?.trim()) return resolveLayoutStableTitle(explicitName);
    return resolveLayoutStableTitle(sourceName);
}

export function formatLayoutVersionLabel(version: number): string {
    return `V${version}`;
}

/** Gallery / toolbar: "Lead Drawer · V27" */
export function formatLayoutTitleWithVersion(title: string | null | undefined, version: number): string {
    const stable = resolveLayoutStableTitle(title);
    return `${stable} · ${formatLayoutVersionLabel(version)}`;
}

/** Draft row hint: "Lead Drawer · Draft V28" */
export function formatLayoutDraftTitleWithVersion(title: string | null | undefined, version: number): string {
    const stable = resolveLayoutStableTitle(title);
    return `${stable} · Draft ${formatLayoutVersionLabel(version)}`;
}

/** Published row hint: "Lead Drawer · Published V27" */
export function formatLayoutPublishedTitleWithVersion(title: string | null | undefined, version: number): string {
    const stable = resolveLayoutStableTitle(title);
    return `${stable} · Published ${formatLayoutVersionLabel(version)}`;
}
