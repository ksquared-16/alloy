import { createHash } from "crypto";

/**
 * **StubFormPdfGenerator** — minimal valid PDF bytes for compliance-style artifacts.
 * Not a layout engine: embeds slot key/value lines as text for audit / pipeline proof only.
 */
export function buildStubFormPdfBuffer(input: { title: string; templateKey: string; slots: Record<string, string> }): Buffer {
    const lines: string[] = [
        `Form PDF stub — ${input.title}`,
        `template_key: ${input.templateKey}`,
        `content_hash: ${contentHashForSlots(input.slots)}`,
        "",
        "Mapped slots:",
    ];
    const keys = Object.keys(input.slots).sort();
    for (const k of keys) {
        lines.push(`- ${k}: ${sanitizeOneLine(input.slots[k] ?? "")}`);
    }
    const body = lines.join("\n");
    return buildMinimalPdfWithText(body);
}

function contentHashForSlots(slots: Record<string, string>): string {
    const keys = Object.keys(slots).sort();
    const payload = keys.map((k) => `${k}=${slots[k]}`).join("|");
    return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}

function sanitizeOneLine(s: string): string {
    return s.replace(/\r|\n/g, " ").slice(0, 500);
}

/**
 * Smallest single-page PDF with a text stream (ASCII). Avoids external PDF libraries.
 */
function buildMinimalPdfWithText(unicodeText: string): Buffer {
    const textBytes = Buffer.from(unicodeText, "utf8");
    const hex = textBytes.toString("hex").toUpperCase();
    const streamContent = `BT /F1 10 Tf 72 720 Td <${hex}> Tj ET`;

    const objects: string[] = [];
    objects.push("1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n");
    objects.push("2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n");
    objects.push("4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n");

    const pageObjIndex = objects.length;
    const contentIndex = objects.length + 1;

    const pageObj = `3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents ${contentIndex + 1} 0 R>>endobj\n`;
    const contentObj = `${contentIndex + 1} 0 obj<</Length ${Buffer.byteLength(streamContent, "utf8")}>>stream\n${streamContent}\nendstream\nendobj\n`;

    objects.push(pageObj);
    objects.push(contentObj);

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (const part of objects) {
        offsets.push(Buffer.byteLength(pdf, "binary"));
        pdf += part;
    }
    const xrefPos = Buffer.byteLength(pdf, "binary");
    const total = objects.length + 1;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) {
        xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    const trailer = `trailer<</Size ${total}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;
    return Buffer.from(pdf + xref + trailer, "binary");
}
