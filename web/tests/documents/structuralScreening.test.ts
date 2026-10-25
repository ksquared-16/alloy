/**
 * D1c-1 structural screening engine. Pure, deterministic, fail-closed.
 *
 * Positive controls are real artifacts, never hand-waved bytes:
 *   * PDFs produced by pdf-lib (the platform's own PDF writer), with compressed object streams and a fillable form;
 *   * a PNG encoded here with real zlib-compressed scanlines;
 *   * a real baseline JPEG.
 * Negative controls each target one rule.
 */
import { deflateSync } from "zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

import {
    DEFAULT_SCREENING_LIMITS,
    PDF_ACTIVE_CONTENT_NAMES,
    screenDocumentBytes,
    SCREENING_ENGINE,
} from "@/lib/documents/structuralScreening";

const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));

/** A minimal, well-formed PDF whose catalog carries `extra` (e.g. an /OpenAction). */
function pdfWith(extra = "", { eof = true }: { eof?: boolean } = {}) {
    return enc(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R " + extra + " >>\nendobj\n" +
        "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n" + (eof ? "%%EOF\n" : ""),
    );
}

/** A PDF whose only active content is hidden inside a Flate-compressed object stream. */
function pdfWithCompressedJs() {
    const hidden = deflateSync(Buffer.from("<< /S /JavaScript /JS (app.alert(1)) >>", "latin1"));
    const head = Buffer.from("%PDF-1.5\n3 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length " + hidden.length + " >>\nstream\n", "latin1");
    const tail = Buffer.from("\nendstream\nendobj\ntrailer\n<< >>\n%%EOF\n", "latin1");
    return new Uint8Array(Buffer.concat([head, hidden, tail]));
}

function crc(buf: Buffer): number {
    let c = 0xffffffff;
    for (const b of buf) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
}
/** A real 3x2 RGB PNG: filter byte 0 + 3 pixels per row, zlib-compressed. */
function png({ corruptCrc = false, truncateData = false, trailing = false } = {}) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(3, 0);
    ihdr.writeUInt32BE(2, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const raw = Buffer.concat([Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 255]), Buffer.from([0, 9, 9, 9, 8, 8, 8, 7, 7, 7])]);
    let idat = deflateSync(raw);
    if (truncateData) idat = idat.subarray(0, idat.length - 4);
    const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))];
    if (corruptCrc) parts[2] = Buffer.concat([parts[2].subarray(0, parts[2].length - 1), Buffer.from([parts[2][parts[2].length - 1] ^ 0xff])]);
    if (trailing) parts.push(Buffer.from("<html><script>x</script>"));
    return new Uint8Array(Buffer.concat(parts));
}

/** A real 1x1 baseline JPEG (as written by libjpeg). */
const JPEG_1x1 = new Uint8Array(Buffer.from(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd3ffd9",
    "hex",
));

describe("positive controls: clean files pass", () => {
    it("a PDF written by pdf-lib (compressed object streams, text) is clean", async () => {
        const doc = await PDFDocument.create();
        const page = doc.addPage([200, 100]);
        page.drawText("QA screening control", { x: 10, y: 50, size: 10, font: await doc.embedFont(StandardFonts.Helvetica) });
        const bytes = await doc.save({ useObjectStreams: true });
        expect(screenDocumentBytes(bytes, "pdf")).toMatchObject({ verdict: "clean", engine: SCREENING_ENGINE });
    });

    it("a fillable PDF form written by pdf-lib is clean (form fields are not active content)", async () => {
        const doc = await PDFDocument.create();
        doc.addPage([200, 200]);
        doc.getForm().createTextField("child.name").addToPage(doc.getPage(0), { x: 10, y: 10, width: 100, height: 20 });
        expect(screenDocumentBytes(await doc.save(), "pdf")).toMatchObject({ verdict: "clean" });
    });

    it("a real PNG decodes and is clean", () => {
        expect(screenDocumentBytes(png(), "png")).toMatchObject({ verdict: "clean" });
    });

    it("a real JPEG walks to end-of-image and is clean", () => {
        expect(screenDocumentBytes(JPEG_1x1, "jpeg")).toMatchObject({ verdict: "clean" });
    });
});

describe("unsafe PDF structure is quarantined", () => {
    for (const name of PDF_ACTIVE_CONTENT_NAMES) {
        it(`/${name}`, () => {
            const r = screenDocumentBytes(pdfWith(`/X << /${name} (x) >>`), "pdf");
            expect(r).toMatchObject({ verdict: "quarantine", reason: "active_content" });
            expect(r.verdict === "quarantine" && r.findings).toContain(`pdf:/${name}`);
        });
    }

    it("a name hidden with #xx escapes (/J#61vaScript) is still found", () => {
        expect(screenDocumentBytes(pdfWith("/OpenAction << /S /J#61vaScript /JS (x) >>"), "pdf")).toMatchObject({ verdict: "quarantine", reason: "active_content" });
    });

    it("JavaScript hidden inside a Flate-compressed object stream is still found", () => {
        expect(screenDocumentBytes(pdfWithCompressedJs(), "pdf")).toMatchObject({ verdict: "quarantine", reason: "active_content" });
    });

    it("an encrypted PDF cannot be inspected, so it is quarantined", () => {
        expect(screenDocumentBytes(pdfWith("/Encrypt 9 0 R"), "pdf")).toMatchObject({ verdict: "quarantine", reason: "encrypted" });
    });

    it("an uninspectable stream filter is quarantined as incomplete, never clean", () => {
        const b = enc("%PDF-1.5\n3 0 obj\n<< /Filter /LZWDecode /Length 4 >>\nstream\nabcd\nendstream\nendobj\n%%EOF\n");
        expect(screenDocumentBytes(b, "pdf")).toMatchObject({ verdict: "quarantine", reason: "inspection_incomplete" });
    });

    it("a limit reached is quarantine (inspection_incomplete), never clean", () => {
        expect(screenDocumentBytes(pdfWithCompressedJs(), "pdf", { ...DEFAULT_SCREENING_LIMITS, maxInflatedBytes: 4 })).toMatchObject({
            verdict: "quarantine",
            reason: "inspection_incomplete",
        });
        expect(screenDocumentBytes(pdfWith(), "pdf", { ...DEFAULT_SCREENING_LIMITS, deadlineMs: -1 })).not.toMatchObject({ verdict: "clean" });
    });
});

describe("invalid, mismatched and corrupted content is refused (nothing stored)", () => {
    it("bytes that are not the declared format", () => {
        expect(screenDocumentBytes(png(), "pdf")).toMatchObject({ verdict: "refuse", reason: "type_mismatch" });
        expect(screenDocumentBytes(JPEG_1x1, "png")).toMatchObject({ verdict: "refuse", reason: "type_mismatch" });
    });

    it("a truncated PDF (no end-of-file marker)", () => {
        expect(screenDocumentBytes(pdfWith("", { eof: false }), "pdf")).toMatchObject({ verdict: "refuse", reason: "corrupt" });
    });

    it("a PNG with a broken chunk CRC, truncated image data, or data after IEND", () => {
        expect(screenDocumentBytes(png({ corruptCrc: true }), "png")).toMatchObject({ verdict: "refuse", reason: "corrupt" });
        expect(screenDocumentBytes(png({ truncateData: true }), "png")).toMatchObject({ verdict: "refuse", reason: "corrupt" });
        expect(screenDocumentBytes(png({ trailing: true }), "png")).toMatchObject({ verdict: "refuse", reason: "corrupt" });
    });

    it("a JPEG that never reaches end-of-image, or has no frame", () => {
        expect(screenDocumentBytes(JPEG_1x1.subarray(0, JPEG_1x1.length - 2), "jpeg")).toMatchObject({ verdict: "refuse", reason: "corrupt" });
        expect(screenDocumentBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), "jpeg")).toMatchObject({ verdict: "refuse", reason: "corrupt" });
    });
});

describe("determinism", () => {
    it("the same bytes always give the same verdict", () => {
        const b = pdfWithCompressedJs();
        expect(screenDocumentBytes(b, "pdf")).toEqual(screenDocumentBytes(b, "pdf"));
    });
});
