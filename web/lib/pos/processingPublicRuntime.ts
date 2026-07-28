/**
 * Processing public runtime presentation — slug, share URL, iframe embed HTML.
 */

export function slugifyProcessingPublicFormSlug(input: string): string {
    const base = input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return base || "form";
}

export function resolveProcessingPublicSlug(
    formKey: string,
    formName: string,
    existingMeta?: Record<string, unknown> | null
): string {
    const fromMeta =
        typeof existingMeta?.processing_public_slug === "string" ? existingMeta.processing_public_slug.trim() : "";
    if (fromMeta) return fromMeta;
    const fromKey = formKey.trim();
    if (fromKey) return slugifyProcessingPublicFormSlug(fromKey);
    return slugifyProcessingPublicFormSlug(formName || "form");
}

export function buildProcessingPublicFormIframeHtml(args: {
    embedUrl: string;
    formTitle: string;
    minHeightPx?: number;
}): string {
    const title = args.formTitle.trim() || "Alloy form";
    const height = args.minHeightPx ?? 720;
    const src = args.embedUrl.replace(/"/g, "&quot;");
    const safeTitle = title.replace(/"/g, "&quot;");
    // `loading="eager"`: the form must start loading with the host page, not after it (it is primary
    // content, not a below-the-fold widget). Lazy loading was deferring the form until scroll.
    return `<iframe src="${src}" title="${safeTitle}" style="width:100%;min-height:${height}px;border:0;" loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

export function resolveProcessingPublicShareUrl(args: {
    embedUrl: string | null;
    embedPath: string;
    origin?: string | null;
}): string {
    if (args.embedUrl?.trim()) return args.embedUrl.trim();
    if (args.origin?.trim()) return `${args.origin.replace(/\/$/, "")}${args.embedPath}`;
    return args.embedPath;
}
