/**
 * The words actually drawn on a composed PDF.
 *
 * A test that asserts on the composer's RETURN VALUE proves the composer was called; only reading
 * the bytes back proves a parent would see the name. pdf-lib flate-compresses its content streams,
 * so this inflates every stream and collects the string literals the text operators draw.
 *
 * Deliberately crude — it is a reader for documents this repository just produced, not a general
 * PDF parser, and a crude reader that can be trusted beats a clever one that cannot.
 */

import { inflateSync } from "zlib";

export function composedDocumentText(bytes: Uint8Array): string {
    const buf = Buffer.from(bytes);
    const raw = buf.toString("latin1");
    const out: string[] = [];

    const streamRe = /stream\r?\n/g;
    let m: RegExpExecArray | null;
    while ((m = streamRe.exec(raw)) !== null) {
        const start = m.index + m[0].length;
        const end = raw.indexOf("endstream", start);
        if (end < 0) continue;
        const slice = buf.subarray(start, end);
        let text: string;
        try {
            text = inflateSync(slice).toString("latin1");
        } catch {
            text = slice.toString("latin1");
        }
        /*
         * `<48656C6C6F> Tj` — pdf-lib writes a HEX string for drawText, not a literal. A reader
         * that only understood `(...)` returned nothing at all, which would have made every
         * assertion below vacuously true: an empty haystack contains no defect either.
         */
        for (const hex of text.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
            out.push(Buffer.from(hex[1].replace(/\s+/g, ""), "hex").toString("latin1"));
        }
        // Literal strings, for a future writer that emits them.
        for (const lit of text.matchAll(/\(((?:\\.|[^()\\])*)\)\s*Tj/g)) {
            out.push(lit[1].replace(/\\([()\\])/g, "$1"));
        }
    }
    return out.join("\n");
}

/** Every drawn line, trimmed and in order — for asserting one entry follows another. */
export function composedDocumentLines(bytes: Uint8Array): string[] {
    return composedDocumentText(bytes)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
}
