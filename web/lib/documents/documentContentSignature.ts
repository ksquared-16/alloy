/**
 * What a stored document IS, decided from its bytes. The caller's label does not decide it.
 *
 * D1b.3 / D1b.4. The `org_documents` bucket accepts exactly eight content types
 * (migration 20261207181600). Every upload path therefore stores the CANONICAL type of the format the
 * bytes prove, never a client-supplied `file.type`, an `image/jpg` alias or `application/octet-stream`.
 * Binary formats must carry their signature. Text formats must not carry binary content.
 *
 * The public enrollment routes used to have their own inline copy of the PDF/PNG/JPEG check. This is
 * the one shared definition now.
 */

export type DocumentContentKind = "pdf" | "png" | "jpeg" | "docx" | "doc" | "txt" | "csv" | "html";

export const CANONICAL_DOCUMENT_MIME: Readonly<Record<DocumentContentKind, string>> = Object.freeze({
    pdf: "application/pdf",
    png: "image/png",
    jpeg: "image/jpeg",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    txt: "text/plain",
    csv: "text/csv",
    html: "text/html",
});

/** The governed bucket allowlist. It must equal the migration's `allowed_mime_types`. */
export const GOVERNED_DOCUMENT_MIME_TYPES: readonly string[] = Object.freeze(Object.values(CANONICAL_DOCUMENT_MIME));

export const DOCUMENT_CONTENT_EXT: Readonly<Record<DocumentContentKind, string>> = Object.freeze({
    pdf: "pdf",
    png: "png",
    jpeg: "jpg",
    docx: "docx",
    doc: "doc",
    txt: "txt",
    csv: "csv",
    html: "html",
});

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function startsWith(bytes: Uint8Array, sig: readonly number[], at = 0): boolean {
    if (bytes.length < at + sig.length) return false;
    for (let i = 0; i < sig.length; i++) if (bytes[at + i] !== sig[i]) return false;
    return true;
}

/** PDF allows junk before the header. Readers accept "%PDF-" anywhere in the first 1024 bytes. */
function hasPdfHeader(bytes: Uint8Array): boolean {
    const limit = Math.min(bytes.length - PDF.length, 1024);
    for (let i = 0; i <= limit; i++) if (startsWith(bytes, PDF, i)) return true;
    return false;
}

/** Text: no NUL byte and no other C0 control besides tab/LF/CR/FF, in the first 8 KiB. */
function looksLikeText(bytes: Uint8Array): boolean {
    const n = Math.min(bytes.length, 8192);
    for (let i = 0; i < n; i++) {
        const b = bytes[i];
        if (b === 0) return false;
        if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c) return false;
    }
    return true;
}

/** The binary kind the bytes prove, or null. Text kinds are never inferred from bytes alone. */
export function sniffBinaryDocumentKind(bytes: Uint8Array): Extract<DocumentContentKind, "pdf" | "png" | "jpeg" | "docx" | "doc"> | null {
    if (startsWith(bytes, PNG)) return "png";
    if (startsWith(bytes, JPEG)) return "jpeg";
    if (startsWith(bytes, OLE)) return "doc";
    if (startsWith(bytes, ZIP)) return "docx";
    if (hasPdfHeader(bytes)) return "pdf";
    return null;
}

/**
 * Do these bytes really hold a document of the CLAIMED kind? The claim comes from the extension or the
 * declared format.
 *
 * Binary claims need their signature. Text claims (txt/csv/html) need text, and must not be a binary
 * document relabelled to slip past a check.
 */
export function bytesMatchDocumentKind(bytes: Uint8Array, claimed: DocumentContentKind): boolean {
    if (bytes.length === 0) return false;
    switch (claimed) {
        case "pdf":
        case "png":
        case "jpeg":
        case "doc":
        case "docx":
            return sniffBinaryDocumentKind(bytes) === claimed;
        case "txt":
        case "csv":
        case "html":
            return sniffBinaryDocumentKind(bytes) === null && looksLikeText(bytes);
    }
}

/** Kinds a PUBLIC (unauthenticated or tokenized) caller may upload: PDF and photos only. */
export const PUBLIC_UPLOAD_KINDS: readonly DocumentContentKind[] = Object.freeze(["pdf", "png", "jpeg"]);

/**
 * For public uploads: the accepted kind the bytes prove, or null.
 *
 * Stricter than the operator path: a public PDF must begin with its header. A prefix tolerance has no
 * legitimate use from a parent's phone and is how a polyglot file would be smuggled in.
 */
export function sniffPublicUploadKind(bytes: Uint8Array): "pdf" | "png" | "jpeg" | null {
    if (startsWith(bytes, PDF)) return "pdf";
    if (startsWith(bytes, PNG)) return "png";
    if (startsWith(bytes, JPEG)) return "jpeg";
    return null;
}
