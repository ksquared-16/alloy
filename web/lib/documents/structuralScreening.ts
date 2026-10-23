/**
 * Structural screening of an incoming document file (Documents V1, D1c-1).
 *
 * WHAT THIS IS, AND IS NOT. It is a deterministic structural inspection. It checks that a file is the format it claims, that it
 * can be decoded, and whether a PDF carries active or unsafe content (JavaScript, launch actions, embedded files, XFA,
 * rich media, data import, embedded go-to). It is **not antivirus**. It has no signature database and makes no claim that a
 * file is malware-free. Signature-based scanning is D1c-2, deferred to a separate provider decision.
 *
 * VERDICTS.
 *   clean       stored and available as usual.
 *   quarantine  stored with `documents.status = 'quarantined'`. Every byte path refuses it until an authorized reviewer
 *               releases it. Used for content that is well-formed but carries active content, or that this engine
 *               cannot fully inspect (encrypted, an uninspectable stream, a limit reached, an internal error).
 *   refuse      not stored at all: the bytes are not the declared format, or they are corrupt or unsupported.
 *
 * FAIL CLOSED. No path returns `clean` unless every check ran to completion. A timeout, a size or stream limit, or any thrown
 * error yields `quarantine` (`inspection_incomplete` / `inspection_error`), never `clean`.
 *
 * Pure and synchronous. No I/O, no network, no new runtime. Node's zlib only.
 */
import { inflateSync } from "zlib";

import { bytesMatchDocumentKind, type DocumentContentKind } from "@/lib/documents/documentContentSignature";

export const SCREENING_ENGINE = "alloy-structural-screening-v1";

export type ScreeningLimits = {
    /** Wall-clock budget for one file. */
    deadlineMs: number;
    /** PDF: most streams inspected. */
    maxStreams: number;
    /** PDF and PNG: most bytes inflated in total. */
    maxInflatedBytes: number;
    /** PNG: largest decoded image (pixels). */
    maxPixels: number;
};

export const DEFAULT_SCREENING_LIMITS: ScreeningLimits = Object.freeze({
    deadlineMs: 4000,
    maxStreams: 20000,
    maxInflatedBytes: 96 * 1024 * 1024,
    maxPixels: 120_000_000,
});

/** PDF names that mark active or unsafe content. Matched after #xx name-escape decoding. */
export const PDF_ACTIVE_CONTENT_NAMES: readonly string[] = Object.freeze([
    "JavaScript",
    "JS",
    "Launch",
    "EmbeddedFile",
    "EmbeddedFiles",
    "XFA",
    "RichMedia",
    "ImportData",
    "GoToE",
]);

export type QuarantineReason = "active_content" | "encrypted" | "inspection_incomplete" | "inspection_error";
export type RefuseReason = "type_mismatch" | "corrupt" | "unsupported";

export type ScreeningResult =
    | { verdict: "clean"; engine: string; kind: DocumentContentKind; findings: string[] }
    | { verdict: "quarantine"; engine: string; kind: DocumentContentKind; reason: QuarantineReason; findings: string[] }
    | { verdict: "refuse"; engine: string; kind: DocumentContentKind; reason: RefuseReason; detail: string };

class Incomplete extends Error {}

/** CRC-32 (IEEE), local so the result never depends on the runtime's zlib version. */
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(data: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

const latin1 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("latin1");

// ── PDF ──────────────────────────────────────────────────────────────────────────────────────────

/** Every /Name token, with #xx escapes decoded (so /J#61vaScript is JavaScript). */
function pdfNames(text: string): Set<string> {
    const out = new Set<string>();
    for (const m of text.matchAll(/\/([^\s/<>[\]()%{}]+)/g)) {
        const raw = m[1];
        out.add(raw.includes("#") ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) : raw);
    }
    return out;
}

const INSPECTABLE_SKIP_FILTERS = new Set(["DCTDecode", "DCT", "JPXDecode", "CCITTFaxDecode", "CCF", "JBIG2Decode"]);

function screenPdf(bytes: Uint8Array, limits: ScreeningLimits, deadline: number): Extract<ScreeningResult, { verdict: "clean" | "quarantine" }> | { corrupt: string } {
    const text = latin1(bytes);
    if (!/%PDF-\d\.\d/.test(text.slice(0, 1024))) return { corrupt: "no PDF header" };
    if (!text.slice(Math.max(0, text.length - 2048)).includes("%%EOF")) return { corrupt: "truncated: no end-of-file marker" };

    const findings = new Set<string>();
    const flag = (names: Set<string>) => {
        for (const n of PDF_ACTIVE_CONTENT_NAMES) if (names.has(n)) findings.add(`pdf:/${n}`);
    };
    const top = pdfNames(text);
    flag(top);
    if (top.has("Encrypt")) {
        return { verdict: "quarantine", engine: SCREENING_ENGINE, kind: "pdf", reason: "encrypted", findings: [...findings, "pdf:/Encrypt"] };
    }

    // Streams: object streams and content can hide names from a raw scan, so Flate streams are inflated and scanned too.
    let streams = 0;
    let inflated = 0;
    let incomplete: string | null = null;
    const re = /stream\r?\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        if (Date.now() > deadline) throw new Incomplete("deadline");
        // "endstream" also matches /stream\r?\n/; skip it.
        if (text.slice(Math.max(0, m.index - 3), m.index) === "end") continue;
        streams += 1;
        if (streams > limits.maxStreams) throw new Incomplete("stream limit");
        const start = m.index + m[0].length;
        const end = text.indexOf("endstream", start);
        if (end < 0) return { corrupt: "unterminated stream" };
        re.lastIndex = end + 9;
        const dictStart = text.lastIndexOf("<<", m.index);
        const dict = dictStart >= 0 ? text.slice(dictStart, m.index) : "";
        const dictNames = pdfNames(dict);
        const filters = [...dict.matchAll(/\/(FlateDecode|Fl|DCTDecode|DCT|JPXDecode|CCITTFaxDecode|CCF|JBIG2Decode|LZWDecode|LZW|ASCII85Decode|A85|ASCIIHexDecode|AHx|RunLengthDecode|RL|Crypt)\b/g)].map((x) => x[1]);
        if (filters.length === 0) {
            flag(pdfNames(text.slice(start, end)));
        } else if (filters.every((f) => f === "FlateDecode" || f === "Fl")) {
            const raw = bytes.subarray(start, end);
            let out: Buffer;
            try {
                out = inflateSync(raw, { maxOutputLength: Math.max(1, limits.maxInflatedBytes - inflated) });
            } catch (e) {
                // A Flate stream that will not inflate (or exceeds the budget) cannot be inspected.
                incomplete = (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ? "inflate budget" : "undecodable Flate stream";
                if ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") throw new Incomplete(incomplete);
                continue;
            }
            inflated += out.length;
            if (inflated > limits.maxInflatedBytes) throw new Incomplete("inflate budget");
            flag(pdfNames(out.toString("latin1")));
        } else if (filters.every((f) => INSPECTABLE_SKIP_FILTERS.has(f)) || dictNames.has("Image")) {
            // Image codecs carry pixels, not PDF objects.
        } else {
            incomplete = `uninspectable stream filter ${filters.join("+")}`;
        }
    }

    if (findings.size > 0) return { verdict: "quarantine", engine: SCREENING_ENGINE, kind: "pdf", reason: "active_content", findings: [...findings] };
    if (incomplete) return { verdict: "quarantine", engine: SCREENING_ENGINE, kind: "pdf", reason: "inspection_incomplete", findings: [incomplete] };
    return { verdict: "clean", engine: SCREENING_ENGINE, kind: "pdf", findings: [] };
}

// ── PNG: a real decode of the compressed image data, not a header check ─────────────────────────────

const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const PNG_DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

function pngExpectedBytes(w: number, h: number, bitsPerPixel: number, interlace: number): number {
    const row = (pw: number) => (pw > 0 ? Math.ceil((pw * bitsPerPixel) / 8) + 1 : 0);
    if (interlace === 0) return h * row(w);
    const passes = [
        [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
    ];
    let total = 0;
    for (const [x0, y0, dx, dy] of passes) {
        const pw = Math.ceil((w - x0) / dx);
        const ph = Math.ceil((h - y0) / dy);
        if (pw > 0 && ph > 0) total += ph * row(pw);
    }
    return total;
}

function screenPng(bytes: Uint8Array, limits: ScreeningLimits): string | null {
    const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!SIG.every((b, i) => buf[i] === b)) return "no PNG signature";
    let p = 8;
    let ihdr: { w: number; h: number; depth: number; color: number; interlace: number } | null = null;
    let sawPalette = false;
    let sawEnd = false;
    const idat: Buffer[] = [];
    while (p + 12 <= buf.length) {
        const len = buf.readUInt32BE(p);
        const type = buf.toString("latin1", p + 4, p + 8);
        if (p + 12 + len > buf.length) return `chunk ${type} overruns the file`;
        const data = buf.subarray(p + 8, p + 8 + len);
        const crc = buf.readUInt32BE(p + 8 + len);
        if (crc32(Buffer.concat([buf.subarray(p + 4, p + 8), data])) !== crc) return `chunk ${type} fails its CRC`;
        if (!ihdr && type !== "IHDR") return "IHDR is not the first chunk";
        if (type === "IHDR") {
            if (len !== 13 || ihdr) return "invalid IHDR";
            const w = data.readUInt32BE(0);
            const h = data.readUInt32BE(4);
            const depth = data[8];
            const color = data[9];
            if (w < 1 || h < 1 || w * h > limits.maxPixels) return "image dimensions out of range";
            if (!(color in PNG_CHANNELS) || !PNG_DEPTHS[color].includes(depth)) return "invalid colour type or bit depth";
            if (data[10] !== 0 || data[11] !== 0 || data[12] > 1) return "invalid compression, filter or interlace method";
            ihdr = { w, h, depth, color, interlace: data[12] };
        } else if (type === "PLTE") {
            sawPalette = true;
        } else if (type === "IDAT") {
            idat.push(data);
        } else if (type === "IEND") {
            sawEnd = true;
            p += 12 + len;
            break;
        }
        p += 12 + len;
    }
    if (!ihdr) return "no IHDR";
    if (!sawEnd) return "no IEND";
    if (p !== buf.length) return "data after IEND";
    if (ihdr.color === 3 && !sawPalette) return "palette image without PLTE";
    if (idat.length === 0) return "no image data";
    const expected = pngExpectedBytes(ihdr.w, ihdr.h, PNG_CHANNELS[ihdr.color] * ihdr.depth, ihdr.interlace);
    if (expected > limits.maxInflatedBytes) throw new Incomplete("PNG larger than the inflate budget");
    let raw: Buffer;
    try {
        raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected + 1 });
    } catch {
        return "image data does not decompress";
    }
    if (raw.length !== expected) return "image data is not the size its header declares";
    // Every scanline begins with a filter type 0..4 (non-interlaced, where scanline offsets are fixed).
    if (ihdr.interlace === 0) {
        const rowBytes = expected / ihdr.h;
        for (let y = 0; y < ihdr.h; y++) if (raw[y * rowBytes] > 4) return "invalid scanline filter";
    }
    return null;
}

// ── JPEG: a full marker walk through the entropy-coded data to EOI ───────────────────────────────

function screenJpeg(bytes: Uint8Array): string | null {
    const b = bytes;
    if (!(b[0] === 0xff && b[1] === 0xd8)) return "no JPEG start-of-image";
    let p = 2;
    let sawFrame = false;
    let sawScan = false;
    while (p < b.length) {
        if (b[p] !== 0xff) return "marker expected";
        while (b[p] === 0xff) p++;
        const marker = b[p++];
        if (marker === undefined) return "truncated marker";
        if (marker === 0xd9) {
            if (!sawFrame || !sawScan) return "image ends before a frame and scan";
            return null; // EOI. Trailing bytes (e.g. camera motion-photo payloads) are tolerated; the stored type is fixed.
        }
        if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
        if (p + 2 > b.length) return "truncated segment";
        const len = (b[p] << 8) | b[p + 1];
        if (len < 2 || p + len > b.length) return "segment overruns the file";
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            const h = (b[p + 3] << 8) | b[p + 4];
            const w = (b[p + 5] << 8) | b[p + 6];
            const comps = b[p + 7];
            if (w < 1 || h < 1 || comps < 1 || comps > 4) return "invalid frame header";
            sawFrame = true;
        }
        p += len;
        if (marker === 0xda) {
            if (!sawFrame) return "scan before frame";
            sawScan = true;
            // Entropy-coded data: runs until a marker that is not a stuffed 0xFF00 or a restart marker.
            while (p < b.length) {
                if (b[p] === 0xff && b[p + 1] !== 0x00 && !(b[p + 1] >= 0xd0 && b[p + 1] <= 0xd7)) break;
                p++;
            }
        }
    }
    return "no end-of-image marker";
}

// ── DOCX / DOC (operator uploads only): macros are active content ──────────────────────────────────

function screenOffice(bytes: Uint8Array, kind: "docx" | "doc"): string[] {
    const t = latin1(bytes);
    if (kind === "docx") return /vbaProject\.bin|vbaData\.xml|\.bin"\s*ContentType="application\/vnd\.ms-office\.vbaProject/i.test(t) ? ["docx:macros"] : [];
    // OLE compound files name their VBA storage in UTF-16LE.
    const utf16 = (s: string) => s.split("").join("\u0000");
    return t.includes(utf16("_VBA_PROJECT")) || t.includes(utf16("Macros")) ? ["doc:macros"] : [];
}

/**
 * Screen one file against the format it is declared to be. Deterministic for a given input and limits.
 *
 * `declaredKind` is what the upload path decided the file is (from its extension or allowed set). A file whose bytes
 * are a different format is refused before any deeper inspection.
 */
export function screenDocumentBytes(
    bytes: Uint8Array,
    declaredKind: DocumentContentKind,
    limits: ScreeningLimits = DEFAULT_SCREENING_LIMITS,
): ScreeningResult {
    const deadline = Date.now() + limits.deadlineMs;
    const r = screenWithin(bytes, declaredKind, limits, deadline);
    // The budget is a gate on CLEAN, not just a loop guard: an inspection that overran is not a completed inspection.
    if (r.verdict === "clean" && Date.now() > deadline) {
        return { verdict: "quarantine", engine: SCREENING_ENGINE, kind: declaredKind, reason: "inspection_incomplete", findings: ["deadline"] };
    }
    return r;
}

function screenWithin(
    bytes: Uint8Array,
    declaredKind: DocumentContentKind,
    limits: ScreeningLimits,
    deadline: number,
): ScreeningResult {
    const engine = SCREENING_ENGINE;
    try {
        if (!bytesMatchDocumentKind(bytes, declaredKind)) {
            return { verdict: "refuse", engine, kind: declaredKind, reason: "type_mismatch", detail: `bytes are not ${declaredKind}` };
        }
        switch (declaredKind) {
            case "pdf": {
                const r = screenPdf(bytes, limits, deadline);
                if ("corrupt" in r) return { verdict: "refuse", engine, kind: "pdf", reason: "corrupt", detail: r.corrupt };
                return r;
            }
            case "png": {
                const bad = screenPng(bytes, limits);
                return bad
                    ? { verdict: "refuse", engine, kind: "png", reason: "corrupt", detail: bad }
                    : { verdict: "clean", engine, kind: "png", findings: [] };
            }
            case "jpeg": {
                const bad = screenJpeg(bytes);
                return bad
                    ? { verdict: "refuse", engine, kind: "jpeg", reason: "corrupt", detail: bad }
                    : { verdict: "clean", engine, kind: "jpeg", findings: [] };
            }
            case "docx":
            case "doc": {
                const found = screenOffice(bytes, declaredKind);
                return found.length
                    ? { verdict: "quarantine", engine, kind: declaredKind, reason: "active_content", findings: found }
                    : { verdict: "clean", engine, kind: declaredKind, findings: [] };
            }
            case "txt":
            case "csv":
            case "html":
                // Text: proven to be text above. HTML captures are only ever previewed under a sandbox CSP, never executed.
                return { verdict: "clean", engine, kind: declaredKind, findings: [] };
        }
    } catch (e) {
        if (e instanceof Incomplete) {
            return { verdict: "quarantine", engine, kind: declaredKind, reason: "inspection_incomplete", findings: [e.message] };
        }
        return { verdict: "quarantine", engine, kind: declaredKind, reason: "inspection_error", findings: [e instanceof Error ? e.name : "error"] };
    }
    return { verdict: "refuse", engine, kind: declaredKind, reason: "unsupported", detail: `${declaredKind} is not screened` };
}

/** The record kept on `documents.metadata.screening`. */
export function screeningMetadata(r: ScreeningResult, at: Date = new Date()): Record<string, unknown> {
    return {
        engine: r.engine,
        verdict: r.verdict,
        kind: r.kind,
        ...(r.verdict === "quarantine" ? { reason: r.reason, findings: r.findings } : {}),
        screened_at: at.toISOString(),
    };
}
