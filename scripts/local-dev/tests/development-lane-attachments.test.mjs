#!/usr/bin/env node
/**
 * Image attachments on an operator prompt.
 *
 * The properties that matter, and why each one is here:
 *
 *  - A prompt is text PLUS its images. "look at this" with yesterday's
 *    screenshot and "look at this" with today's are DIFFERENT instructions, and
 *    a text-only hash would have deduplicated the second one away.
 *  - Nothing the client says about a file is believed. The type is sniffed from
 *    the bytes, the name is a display label that never touches the filesystem,
 *    and a client-supplied path is never accepted at all.
 *  - Text is never delivered without the images the operator attached to it.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = mkdtempSync(join(tmpdir(), "vac-att-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";

const A = await import("../lib/vacilando/lane-attachments.mjs");
const V = await import("../apps/vacilando/public/gateway-view.mjs");

const LANE = "lane_aaaaaaaaaaaa";
const OTHER = "lane_bbbbbbbbbbbb";

/** A real PNG header with honest dimensions, so sniffing is actually exercised. */
function png(w = 4, h = 3, pad = 64) {
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(w, 16);
  head.writeUInt32BE(h, 20);
  return Buffer.concat([head, Buffer.alloc(pad, 1)]);
}
function jpeg() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2),
    Buffer.from("JFIF\0", "ascii"),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x60]),
    Buffer.alloc(32),
  ]);
}
const reset = () => A.resetAttachmentsForTests();
const add = (laneId = LANE, bytes = png(), name = "shot.png") =>
  A.createAttachment({ laneId, bytes, filename: name });

// ------------------------------------------------------------ type detection

test("the type comes from the bytes, not the filename", () => {
  reset();
  // A php script called screenshot.png is not a PNG.
  const evil = Buffer.concat([Buffer.from("<?php system($_GET[0]); ?>", "ascii"), Buffer.alloc(64)]);
  const out = A.createAttachment({ laneId: LANE, bytes: evil, filename: "screenshot.png" });
  assert.equal(out.ok, false);
  assert.equal(out.error, "unsupported_media_type");
  assert.equal(out.detected, "unknown");
});

test("each supported format is detected", () => {
  assert.equal(A.sniffImageMime(png()), "image/png");
  assert.equal(A.sniffImageMime(jpeg()), "image/jpeg");
  assert.equal(A.sniffImageMime(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)])), "image/webp");
  assert.equal(A.sniffImageMime(Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(20)])), "image/gif");
});

test("dimensions are read from the header", () => {
  assert.deepEqual(A.readImageDimensions(png(1920, 1080), "image/png"), { width: 1920, height: 1080 });
  assert.deepEqual(A.readImageDimensions(jpeg(), "image/jpeg"), { width: 96, height: 64 });
});

// ------------------------------------------------------- documents

function pdf() { return Buffer.concat([Buffer.from("%PDF-1.7\n", "ascii"), Buffer.alloc(96, 1)]); }
function html(body = "<!DOCTYPE html><html><body><h1>Report</h1></body></html>") {
  return Buffer.from(body, "utf8");
}

test("a PDF is detected by its magic number", () => {
  assert.equal(A.sniffAttachmentMime(pdf()), "application/pdf");
});

test("HTML is detected structurally, since it has no magic number", () => {
  assert.equal(A.sniffAttachmentMime(html()), "text/html");
  assert.equal(A.sniffAttachmentMime(html("<html><body>x</body></html>")), "text/html");
  assert.equal(A.sniffAttachmentMime(html("<div><p>a fragment</p></div>")), "text/html");
});

test("a binary renamed .html is still refused", () => {
  // The case a filename check would wave through: NUL bytes mean it is not text.
  const binary = Buffer.concat([Buffer.from([0x00, 0x01, 0x02]), Buffer.from("<html>")]);
  assert.equal(A.sniffAttachmentMime(binary), null);
  const out = A.createAttachment({ laneId: LANE, bytes: binary, filename: "report.html" });
  assert.equal(out.error, "unsupported_media_type");
});

test("invalid UTF-8 is not accepted as HTML", () => {
  const bad = Buffer.concat([Buffer.from([0xff, 0xfe, 0xfd]), Buffer.from("<html>")]);
  assert.equal(A.sniffAttachmentMime(bad), null);
});

test("plain prose is not HTML", () => {
  assert.equal(A.sniffAttachmentMime(Buffer.from("just some notes, no markup at all here")), null);
});

test("PDF and HTML upload, store and bind like any attachment", () => {
  reset();
  const p = A.createAttachment({ laneId: LANE, bytes: pdf(), filename: "spec.pdf" });
  const h = A.createAttachment({ laneId: LANE, bytes: html(), filename: "report.html" });
  assert.equal(p.ok, true, p.error);
  assert.equal(h.ok, true, h.error);
  assert.equal(p.attachment.mime_type, "application/pdf");
  assert.equal(h.attachment.mime_type, "text/html");
  // Documents have no pixel dimensions, and that is not a failure.
  assert.equal(p.attachment.width, null);
  assert.equal(h.attachment.height, null);
  const bound = A.bindAttachmentsToRun([p.attachment.attachment_id, h.attachment.attachment_id],
    { laneId: LANE, runId: "erun_docs" });
  assert.equal(bound.ok, true, bound.error);
  assert.ok(bound.attachments[0].provider_path.endsWith(".pdf"));
  assert.ok(bound.attachments[1].provider_path.endsWith(".html"));
});

test("the provider gets document paths in the same ordered block", () => {
  const list = A.listRunAttachments("erun_docs", { includePath: true });
  const block = A.providerAttachmentBlock(list);
  assert.match(block, /Attached images:/);
  assert.ok(block.includes(".pdf") && block.includes(".html"));
  assert.equal(/base64/i.test(block), false);
});

test("documents render as a labelled chip, never a broken thumbnail", () => {
  const draft = V.renderAttachmentDrafts([
    { attachment_id: "a1", filename: "spec.pdf", mime_type: "application/pdf", byte_size: 4096, url: "/api/attachments/a1" },
  ]);
  assert.ok(draft.includes("gw-att-doc"), "a chip");
  assert.equal(/<img[^>]*gw-att-thumb/.test(draft), false, "and no img element to break");
  assert.ok(draft.includes("PDF"));

  const sent = V.renderMessageAttachments([
    { attachment_id: "a1", filename: "spec.pdf", mime_type: "application/pdf", url: "/api/attachments/a1" },
  ]);
  assert.ok(sent.includes("gw-msg-att-doc"));
  assert.ok(sent.includes('href="/api/attachments/a1"'));
  assert.equal(sent.includes("data-gw-att-open"), false, "a document does not open a lightbox");
});

test("images still thumbnail", () => {
  const sent = V.renderMessageAttachments([
    { attachment_id: "i1", filename: "shot.png", mime_type: "image/png", url: "/api/attachments/i1" },
  ]);
  assert.ok(sent.includes("data-gw-att-open"));
  assert.ok(sent.includes("<img"));
});

test("the picker accepts documents as well as images", () => {
  const html = V.renderComposer({});
  for (const t of ["image/png", "application/pdf", "text/html"]) assert.ok(html.includes(t), t);
});

// ------------------------------------------------------------ path safety

test("a traversal filename is reduced to a harmless label", () => {
  for (const [raw, want] of [
    ["../../etc/passwd", "passwd"],
    ["....//shot.png", "shot.png"],
    ["C:\\Windows\\System32\\evil.png", "evil.png"],
    ["/absolute/path.png", "path.png"],
    ["", "image"],
  ]) assert.equal(A.sanitizeFilename(raw), want, raw);
});

test("the stored file is named by id, never by the operator's filename", () => {
  reset();
  const out = add(LANE, png(), "../../evil.png");
  assert.equal(out.ok, true);
  const rec = A.getAttachment(out.attachment.attachment_id);
  const path = A.attachmentFilePath(rec);
  assert.ok(path.endsWith(`${rec.attachment_id}.png`), path);
  assert.equal(path.includes(".."), false);
  assert.ok(path.startsWith(A.attachmentRoot()), "stays inside the Vacilando-owned area");
});

test("the client is never handed a filesystem path", () => {
  reset();
  const pub = add().attachment;
  assert.equal(pub.url, `/api/attachments/${pub.attachment_id}`);
  assert.equal("provider_path" in pub, false);
});

// ------------------------------------------------------------------- limits

test("an oversized image is rejected with its limit", () => {
  reset();
  const big = Buffer.concat([png(), Buffer.alloc(A.ATTACHMENT_MAX_BYTES)]);
  const out = A.createAttachment({ laneId: LANE, bytes: big, filename: "big.png" });
  assert.equal(out.error, "attachment_too_large");
  assert.equal(out.limit, A.ATTACHMENT_MAX_BYTES);
});

test("an over-dimension image is rejected", () => {
  reset();
  const out = A.createAttachment({ laneId: LANE, bytes: png(9000, 9000), filename: "huge.png" });
  assert.equal(out.error, "attachment_dimensions_too_large");
});

test("an empty file is rejected", () => {
  reset();
  assert.equal(A.createAttachment({ laneId: LANE, bytes: Buffer.alloc(0) }).error, "empty_file");
});

test("more than the per-prompt maximum is refused", () => {
  reset();
  for (let i = 0; i < A.ATTACHMENT_MAX_PER_PROMPT; i += 1) assert.equal(add().ok, true);
  const out = add();
  assert.equal(out.error, "too_many_attachments");
  assert.equal(out.limit, A.ATTACHMENT_MAX_PER_PROMPT);
});

// -------------------------------------------------------- prompt identity

test("same text with DIFFERENT images is a different prompt", () => {
  const a = A.promptFingerprint("look at this", [{ checksum_sha256: "aaa" }]);
  const b = A.promptFingerprint("look at this", [{ checksum_sha256: "bbb" }]);
  assert.notEqual(a, b);
});

test("same text with the SAME images is the same prompt", () => {
  const a = A.promptFingerprint("look at this", [{ checksum_sha256: "aaa" }]);
  const b = A.promptFingerprint("look at this", [{ checksum_sha256: "aaa" }]);
  assert.equal(a, b);
});

test("attachment ORDER changes prompt identity", () => {
  const a = A.promptFingerprint("x", [{ checksum_sha256: "1" }, { checksum_sha256: "2" }]);
  const b = A.promptFingerprint("x", [{ checksum_sha256: "2" }, { checksum_sha256: "1" }]);
  assert.notEqual(a, b);
});

test("text-only prompts keep their existing identity semantics", () => {
  assert.equal(A.promptFingerprint("hello", []), A.promptFingerprint("hello"));
});

// ------------------------------------------------------------ lane boundary

test("one lane cannot read another lane's attachment", () => {
  reset();
  const mine = add(LANE).attachment;
  const out = A.readAttachmentBytes(mine.attachment_id, { laneId: OTHER });
  assert.equal(out.ok, false);
  assert.equal(out.error, "attachment_lane_mismatch");
  // ...and the owning lane still can.
  assert.equal(A.readAttachmentBytes(mine.attachment_id, { laneId: LANE }).ok, true);
});

test("one lane cannot bind another lane's attachment to its run", () => {
  reset();
  const mine = add(LANE).attachment;
  const out = A.bindAttachmentsToRun([mine.attachment_id], { laneId: OTHER, runId: "erun_x" });
  assert.equal(out.error, "attachment_lane_mismatch");
});

test("one lane cannot delete another lane's attachment", () => {
  reset();
  const mine = add(LANE).attachment;
  assert.equal(A.deleteAttachment(mine.attachment_id, { laneId: OTHER }).error, "attachment_lane_mismatch");
  assert.equal(A.getAttachment(mine.attachment_id) !== null, true);
});

// -------------------------------------------------------- binding + ordering

test("binding fixes order and stages a provider-accessible path", () => {
  reset();
  const one = add(LANE, png(10, 10), "one.png").attachment;
  const two = add(LANE, png(20, 20), "two.png").attachment;
  const out = A.bindAttachmentsToRun([two.attachment_id, one.attachment_id], { laneId: LANE, runId: "erun_1" });
  assert.equal(out.ok, true);
  assert.deepEqual(out.attachments.map((a) => a.order), [0, 1]);
  assert.deepEqual(out.attachments.map((a) => a.filename), ["two.png", "one.png"], "operator order, not upload order");
  for (const a of out.attachments) assert.ok(existsSync(a.provider_path), a.provider_path);
});

test("the run projection lists its attachments in order", () => {
  reset();
  const one = add(LANE, png(10, 10), "one.png").attachment;
  const two = add(LANE, png(20, 20), "two.png").attachment;
  A.bindAttachmentsToRun([one.attachment_id, two.attachment_id], { laneId: LANE, runId: "erun_2" });
  assert.deepEqual(A.listRunAttachments("erun_2").map((a) => a.filename), ["one.png", "two.png"]);
});

test("a missing file fails the bind and is never handed to a provider", () => {
  reset();
  const rec = add().attachment;
  const stored = A.attachmentFilePath(A.getAttachment(rec.attachment_id));
  writeFileSync(stored, Buffer.alloc(0));
  const out = A.bindAttachmentsToRun([rec.attachment_id], { laneId: LANE, runId: "erun_3" });
  assert.equal(out.error, "attachment_corrupt");
  assert.equal(A.getAttachment(rec.attachment_id).state, "FAILED");
});

test("a corrupted file is refused at read time too", () => {
  reset();
  const rec = add().attachment;
  writeFileSync(A.attachmentFilePath(A.getAttachment(rec.attachment_id)), png(1, 1, 128));
  assert.equal(A.readAttachmentBytes(rec.attachment_id).error, "attachment_corrupt");
});

test("validation does not mutate: a preflight leaves records PENDING", () => {
  reset();
  const rec = add().attachment;
  const out = A.validateAttachmentsForPrompt([rec.attachment_id], { laneId: LANE });
  assert.equal(out.ok, true);
  assert.equal(A.getAttachment(rec.attachment_id).state, "PENDING", "preflight must not bind");
  assert.equal(A.getAttachment(rec.attachment_id).run_id, null);
});

// -------------------------------------------------------------- draft removal

test("removing a draft attachment deletes its bytes and excludes it", () => {
  reset();
  const keep = add(LANE, png(10, 10), "keep.png").attachment;
  const drop = add(LANE, png(20, 20), "drop.png").attachment;
  const path = A.attachmentFilePath(A.getAttachment(drop.attachment_id));
  assert.equal(A.deleteAttachment(drop.attachment_id, { laneId: LANE }).ok, true);
  assert.equal(existsSync(path), false, "bytes are gone");
  assert.deepEqual(A.listPendingAttachments(LANE).map((a) => a.attachment_id), [keep.attachment_id]);
});

test("a delivered attachment is history and cannot be removed", () => {
  reset();
  const rec = add().attachment;
  A.bindAttachmentsToRun([rec.attachment_id], { laneId: LANE, runId: "erun_4" });
  A.markAttachmentsDelivered("erun_4");
  const out = A.deleteAttachment(rec.attachment_id, { laneId: LANE });
  assert.equal(out.error, "attachment_not_removable");
  assert.equal(out.state, "DELIVERED");
});

// ------------------------------------------------------- provider delivery

test("the provider gets ordered absolute paths, never base64", () => {
  reset();
  const one = add(LANE, png(10, 10), "one.png").attachment;
  const two = add(LANE, png(20, 20), "two.png").attachment;
  const bound = A.bindAttachmentsToRun([one.attachment_id, two.attachment_id], { laneId: LANE, runId: "erun_5" });
  const block = A.providerAttachmentBlock(bound.attachments);
  assert.match(block, /Attached images:/);
  assert.match(block, /Image 1 — .*one\.png|Image 1 — .*\.png/);
  assert.ok(block.indexOf("Image 1") < block.indexOf("Image 2"), "order is preserved");
  for (const a of bound.attachments) assert.ok(block.includes(a.provider_path));
  assert.equal(/base64|data:image/i.test(block), false, "no image data in the terminal");
});

test("no attachments means no attachment block at all", () => {
  assert.equal(A.providerAttachmentBlock([]), "");
  assert.equal(A.providerAttachmentBlock(), "");
});

test("delivery marking only moves BOUND records", () => {
  reset();
  const rec = add().attachment;
  A.bindAttachmentsToRun([rec.attachment_id], { laneId: LANE, runId: "erun_6" });
  assert.deepEqual(A.markAttachmentsDelivered("erun_6").marked, [rec.attachment_id]);
  assert.equal(A.getAttachment(rec.attachment_id).state, "DELIVERED");
  assert.deepEqual(A.markAttachmentsDelivered("erun_6").marked, [], "already delivered stays put");
});

// ------------------------------------------------------------------ privacy

test("log fields carry metadata only — never bytes or paths", () => {
  reset();
  const rec = A.getAttachment(add().attachment.attachment_id);
  const fields = A.attachmentLogFields(rec);
  assert.deepEqual(Object.keys(fields).sort(),
    ["attachment_id", "byte_size", "error", "lane_id", "mime_type", "run_id", "state"]);
  const json = JSON.stringify(fields);
  assert.equal(/\/Users\/|\/tmp\/|base64/.test(json), false);
});

// ---------------------------------------------------------------- retention

test("abandoned drafts expire; sent images are kept as history", () => {
  reset();
  const draft = add(LANE, png(10, 10), "draft.png").attachment;
  const sent = add(LANE, png(20, 20), "sent.png").attachment;
  A.bindAttachmentsToRun([sent.attachment_id], { laneId: LANE, runId: "erun_7" });
  A.markAttachmentsDelivered("erun_7");
  const later = Date.now() + A.ATTACHMENT_DRAFT_TTL_MS + 1000;
  const out = A.cleanupAbandonedDrafts({ nowMs: later });
  assert.deepEqual(out.removed, [draft.attachment_id]);
  assert.ok(A.getAttachment(sent.attachment_id), "conversation history survives cleanup");
});

// --------------------------------------------------------------------- UI

test("the composer offers an attach control scoped to supported types", () => {
  const html = V.renderComposer({});
  assert.ok(html.includes("data-gw-attach-input"));
  // Images and the two document types — never a bare accept="*".
  for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/html"]) {
    assert.ok(html.includes(t), t);
  }
  assert.equal(html.includes('accept="*'), false);
  assert.ok(html.includes("multiple"));
});

test("a draft preview shows thumbnail, name, size and a remove control", () => {
  const html = V.renderAttachmentDrafts([
    { attachment_id: "att_1", filename: "shot.png", mime_type: "image/png", byte_size: 20480, width: 800, height: 600, url: "/api/attachments/att_1" },
  ]);
  assert.ok(html.includes("gw-att-thumb"));
  assert.ok(html.includes("shot.png"));
  assert.ok(html.includes("20 KB"));
  assert.ok(html.includes("800"));
  assert.ok(html.includes('data-gw-att-remove="att_1"'));
  assert.match(html, /aria-label="Remove shot\.png"/);
});

test("Send is disabled while an upload is still in flight", () => {
  const busy = V.renderComposer({ attachmentsUploading: 1 });
  assert.match(busy, /class="btn primary gw-send"[^>]*disabled/);
  const idle = V.renderComposer({ attachments: [] });
  assert.equal(/class="btn primary gw-send"[^>]*disabled/.test(idle), false);
});

test("an attachment error is shown without clearing the draft text", () => {
  const html = V.renderComposer({ draft: "my careful prompt", attachmentError: "That image is too large." });
  assert.ok(html.includes("my careful prompt"), "the draft survives the error");
  assert.ok(html.includes("That image is too large."));
});

test("a sent prompt renders bounded thumbnails that open a preview", () => {
  const html = V.renderMessageAttachments([{ attachment_id: "att_9", filename: "a.png", mime_type: "image/png", url: "/api/attachments/att_9" }]);
  assert.ok(html.includes('data-gw-att-open="att_9"'));
  assert.ok(html.includes('loading="lazy"'), "no eager full-resolution fetch");
});

test("an undelivered attachment says so instead of showing a broken image", () => {
  const html = V.renderMessageAttachments([{ attachment_id: "x", filename: "a.png", state: "FAILED", url: "/u" }]);
  assert.ok(html.includes("not delivered"));
  assert.equal(html.includes("<img"), false);
});

test("the prompt meta line says images were included", () => {
  assert.equal(V.attachmentMetaSuffix("Sent", [{}, {}]), "Sent · 2 images");
  assert.equal(V.attachmentMetaSuffix("Sent", [{}]), "Sent · 1 image");
  assert.equal(V.attachmentMetaSuffix("Sent", []), "Sent");
});

test("the lightbox is dismissible and labelled", () => {
  const html = V.renderAttachmentLightbox({ attachment_id: "a", filename: "shot.png", url: "/u" });
  assert.ok(html.includes("data-gw-lightbox-close"));
  assert.match(html, /aria-modal="true"/);
  assert.ok(html.includes("shot.png"));
  assert.equal(V.renderAttachmentLightbox(null), "");
});

test("copying prompt text never carries binary or internal paths", () => {
  const rec = { instruction: "look at this", status: "delivered", delivered_at: new Date().toISOString() };
  const html = V.renderLastInstruction(rec, Date.now(), {
    attachments: [{ attachment_id: "a", filename: "s.png", url: "/api/attachments/a" }],
  });
  const text = html.match(/data-gw-msg-text>([^<]*)</)?.[1];
  assert.equal(text, "look at this");
  assert.equal(/base64|\/Users\//.test(html), false);
});

test("the send body carries attachment ids in order; text-only stays unchanged", () => {
  assert.deepEqual(V.buildSendBody("hi", { attachmentIds: ["b", "a"] }),
    { instruction: "hi", attachment_ids: ["b", "a"] });
  assert.deepEqual(V.buildSendBody("hi"), { instruction: "hi" });
});

test("every attachment refusal has operator-facing copy", () => {
  for (const e of ["unsupported_media_type", "attachment_too_large", "attachments_total_too_large",
    "attachment_dimensions_too_large", "too_many_attachments", "empty_file", "attachment_missing",
    "attachment_corrupt", "attachment_lane_mismatch", "attachment_not_found", "attachment_not_removable"]) {
    const text = V.attachmentErrorText(e, { limit: 10 * 1024 * 1024 });
    assert.ok(text && !text.includes("_"), `${e} -> ${text}`);
  }
});
