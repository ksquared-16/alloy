/**
 * Which stored sources may be shown as text, and as what.
 *
 * Deliberately an allow-list of three. The review pane needs HTML readable because the importer
 * accepts hosted-form captures; plain text and CSV come along because they are the other formats
 * whose bytes ARE their presentation. Everything else — PDF, images, Word — has its own viewer, and
 * returning null here is what stops this becoming a general-purpose byte proxy.
 *
 * The declared mime type is only believed when it is one of these; otherwise the extension decides.
 * A mislabelled upload therefore cannot talk its way into being served as something else.
 */
const BY_EXTENSION: ReadonlyArray<{ readonly ext: string; readonly contentType: string }> = [
    { ext: ".html", contentType: "text/html; charset=utf-8" },
    { ext: ".htm", contentType: "text/html; charset=utf-8" },
    { ext: ".txt", contentType: "text/plain; charset=utf-8" },
    { ext: ".csv", contentType: "text/plain; charset=utf-8" },
];

const BY_MIME: Readonly<Record<string, string>> = {
    "text/html": "text/html; charset=utf-8",
    "application/xhtml+xml": "text/html; charset=utf-8",
    "text/plain": "text/plain; charset=utf-8",
    "text/csv": "text/plain; charset=utf-8",
};

/**
 * Extensions that have their own viewer. A path ending in one is refused BEFORE the declared mime is
 * consulted, so an upload labelled `text/html` cannot talk a `.pdf` into being served as a document the
 * browser will render. The declared type is the weaker evidence and only decides when the path says
 * nothing at all.
 */
const NON_TEXT_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".heic", ".heif", ".docx", ".doc"] as const;

/** The content type to serve a text source as, or null when it is not a text source. */
export function sourcePreviewContentType(storagePath: string, mimeType: string | null): string | null {
    const path = (storagePath ?? "").toLowerCase();
    for (const { ext, contentType } of BY_EXTENSION) {
        if (path.endsWith(ext)) return contentType;
    }
    if (NON_TEXT_EXTENSIONS.some((ext) => path.endsWith(ext))) return null;
    const mime = (mimeType ?? "").split(";")[0]!.trim().toLowerCase();
    return BY_MIME[mime] ?? null;
}

/** Is this source one the review pane should frame as text rather than hand to the PDF viewer? */
export function isTextSourcePreview(fileName: string | null, mimeType: string | null): boolean {
    return sourcePreviewContentType(fileName ?? "", mimeType) !== null;
}
