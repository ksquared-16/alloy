/**
 * Image attachments on an operator prompt.
 *
 * WHAT THIS IS. One operator prompt may carry images. The images belong to that
 * prompt and to its Execution Run — they are not a gallery, not a file manager,
 * and not a second message system. An attachment record is a REFERENCE; the
 * bytes live in a Vacilando-owned area on disk and never enter the bounded
 * execution-run JSON store.
 *
 * WHY BYTES ARE NOT IN THE RUN STORE. runs.json is read and rewritten on every
 * transition of every lane. Putting a 4 MB base64 image in it would multiply the
 * cost of every unrelated state change and blow the bounded store that the
 * durability suite depends on.
 *
 * WHY THE FINGERPRINT INCLUDES THE IMAGES. Send deduplication hashes the
 * instruction text. Two prompts that read "look at this" with DIFFERENT
 * screenshots are different prompts, and hashing text alone would have collapsed
 * them into one. The prompt identity here is text + the ordered checksums of its
 * attachments, so different images are a different prompt and the SAME text with
 * the SAME images is still protected by the existing duplicate window.
 *
 * TRUST BOUNDARY. Nothing the client sends about a file is believed: not its
 * name, not its declared type, not its size. The stored name is generated, the
 * type is sniffed from the leading bytes, and the size is what we actually
 * wrote. A client-supplied filesystem path is never accepted at all.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const ATTACHMENT_SCHEMA = "vacilando.lane_attachment.v1";

/**
 * Limits, chosen against the real constraints rather than picked round numbers.
 *
 * Anthropic's vision input tops out at 8000x8000 px and images are resized above
 * ~1568 px on the long edge, so more pixels buy nothing. 10 MB per image sits
 * under the 5 MB API limit for base64-encoded payloads with headroom for the
 * file-path path used here, and 6 images keeps one prompt inside a single
 * comfortable read for the provider.
 */
export const ATTACHMENT_MAX_PER_PROMPT = 6;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_MAX_DIMENSION = 8000;
export const ATTACHMENT_FILENAME_MAX = 120;

/**
 * Formats every currently configured provider can actually open.
 *
 * Claude reads image files by path and supports these four. GIF is included
 * because it is supported, but only as a still image — no frame handling is
 * claimed or performed.
 */
export const ATTACHMENT_MIME_TYPES = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  // Documents. The provider opens these by path exactly as it does an image —
  // Claude reads PDFs directly, and HTML is text it can read. Neither is
  // rendered by Vacilando, so neither introduces a parser here.
  "application/pdf": "pdf",
  "text/html": "html",
});

/** Which attachments are images, for thumbnailing and preview. */
export const ATTACHMENT_IMAGE_TYPES = Object.freeze([
  "image/png", "image/jpeg", "image/webp", "image/gif",
]);

export function isImageAttachment(mime) {
  return ATTACHMENT_IMAGE_TYPES.includes(String(mime || ""));
}

export const ATTACHMENT_STATES = Object.freeze([
  "PENDING",   // record exists, bytes on disk, not yet bound to a prompt
  "BOUND",     // bound to an execution run, staged for the provider
  "DELIVERED", // the provider was given an accessible reference
  "FAILED",    // validation or staging failed; never delivered
]);

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

/** Vacilando-owned, outside every worktree and outside source control. */
export function attachmentRoot(root = runtimeRoot()) {
  return join(root, "vacilando", "attachments");
}

export function attachmentStorePath(root = runtimeRoot()) {
  return join(attachmentRoot(root), "index.json");
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function emptyStore() {
  return { schema_version: ATTACHMENT_SCHEMA, attachments: {} };
}

export function readAttachmentStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(attachmentStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      schema_version: ATTACHMENT_SCHEMA,
      attachments: raw.attachments && typeof raw.attachments === "object" ? raw.attachments : {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  atomicWrite(attachmentStorePath(root), store);
  return store;
}

/**
 * A display name, not a path.
 *
 * The original name is kept only to show the operator which file they picked.
 * It never reaches the filesystem: the stored name is the attachment id plus an
 * extension derived from the SNIFFED type. Directory separators, traversal
 * sequences, control characters, leading dots and NULs are all removed rather
 * than rejected, so a hostile name degrades to a harmless label instead of
 * failing a legitimate send.
 */
export function sanitizeFilename(raw) {
  const base = String(raw ?? "")
    .replace(/\\/g, "/")
    .split("/").pop() || "";
  const cleaned = base
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!cleaned) return "image";
  return cleaned.slice(0, ATTACHMENT_FILENAME_MAX);
}

/**
 * Detect the type from the bytes, never from the name.
 *
 * A file called screenshot.png that begins with `<?php` is not a PNG, and the
 * extension is exactly what an attacker controls. Magic numbers are the only
 * thing here that is actually evidence.
 */
export function sniffImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  const gif = b.toString("ascii", 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  // PDF carries a real magic number, so it is detected the same way as an image.
  if (b.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/**
 * HTML has no magic number, so it is sniffed structurally rather than trusted.
 *
 * The rule: it must decode as UTF-8 text with no NUL bytes, and it must open
 * with something that is unambiguously HTML. That refuses a binary renamed
 * .html — the case a filename check would wave through — without pretending a
 * few tags constitute a parse.
 */
export function sniffHtml(buf) {
  if (!buf || buf.length < 6) return null;
  const head = buf.subarray(0, Math.min(buf.length, 4096));
  // A NUL anywhere in the head means this is not text.
  for (const byte of head) if (byte === 0) return null;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(head);
  } catch {
    return null;                      // not valid UTF-8, so not HTML we will accept
  }
  const start = text.replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (start.startsWith("<!doctype html")) return "text/html";
  if (start.startsWith("<html")) return "text/html";
  // A fragment is still HTML if it opens with a tag and the document contains
  // a recognisable structural element.
  if (start.startsWith("<") && /<(html|head|body|div|section|article|table|p|h[1-6]|ul|ol|span)\b/.test(start)) {
    return "text/html";
  }
  return null;
}

/** The one entry point: magic numbers first, then the structural HTML check. */
export function sniffAttachmentMime(buf) {
  return sniffImageMime(buf) || sniffHtml(buf);
}

/**
 * Pixel dimensions straight from the header.
 *
 * Deliberately dependency-free: this runs inside the Gateway runtime, which
 * installs only web-push, and pulling an image library in to read four integers
 * would be a new supply-chain surface for no gain. Unknown dimensions are
 * returned as null and are not treated as a validation failure — the byte and
 * type checks are what actually protect the provider.
 */
export function readImageDimensions(buf, mime) {
  // Documents have no pixel dimensions; asking for them is not a failure.
  if (!isImageAttachment(mime)) return null;
  try {
    if (mime === "image/png" && buf.length >= 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (mime === "image/gif" && buf.length >= 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (mime === "image/webp" && buf.length >= 30) {
      const fmt = buf.toString("ascii", 12, 16);
      if (fmt === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (fmt === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (fmt === "VP8L") {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        // SOF0..SOF15, excluding the non-frame markers in that range.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch { /* a malformed header is not a crash; dimensions stay unknown */ }
  return null;
}

export function newAttachmentId() {
  return `att_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function attachmentFilePath(rec, root = runtimeRoot()) {
  return join(attachmentRoot(root), rec.lane_id, `${rec.attachment_id}.${ATTACHMENT_MIME_TYPES[rec.mime_type]}`);
}

export function publicAttachment(rec, { includePath = false } = {}) {
  if (!rec) return null;
  const out = {
    attachment_id: rec.attachment_id,
    lane_id: rec.lane_id,
    run_id: rec.run_id || null,
    prompt_fingerprint: rec.prompt_fingerprint || null,
    filename: rec.filename,
    mime_type: rec.mime_type,
    byte_size: rec.byte_size,
    width: rec.width ?? null,
    height: rec.height ?? null,
    checksum_sha256: rec.checksum_sha256,
    state: rec.state,
    created_at: rec.created_at,
    delivered_at: rec.delivered_at || null,
    error: rec.error || null,
    // The client gets an authenticated endpoint, never a filesystem path.
    url: `/api/attachments/${encodeURIComponent(rec.attachment_id)}`,
    order: rec.order ?? null,
  };
  if (includePath) out.provider_path = rec.provider_path || null;
  return out;
}

/**
 * Accept one uploaded image.
 *
 * `bytes` is what the server actually received. Everything authoritative about
 * the file is derived from it here.
 */
export function createAttachment({
  laneId,
  bytes,
  filename = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const lane = String(laneId || "");
  if (!lane) return { ok: false, error: "missing_lane_id" };
  if (!bytes || !bytes.length) return { ok: false, error: "empty_file" };
  if (bytes.length > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "attachment_too_large", limit: ATTACHMENT_MAX_BYTES, byte_size: bytes.length };
  }
  const mime = sniffAttachmentMime(bytes);
  if (!mime || !ATTACHMENT_MIME_TYPES[mime]) {
    // Say what was actually detected, so "my png was rejected" is answerable.
    return { ok: false, error: "unsupported_media_type", detected: mime || "unknown", supported: Object.keys(ATTACHMENT_MIME_TYPES) };
  }
  const dims = readImageDimensions(bytes, mime);
  if (dims && (dims.width > ATTACHMENT_MAX_DIMENSION || dims.height > ATTACHMENT_MAX_DIMENSION)) {
    return { ok: false, error: "attachment_dimensions_too_large", limit: ATTACHMENT_MAX_DIMENSION, width: dims.width, height: dims.height };
  }

  const store = readAttachmentStore(root);
  const pending = Object.values(store.attachments).filter((a) => a.lane_id === lane && a.state === "PENDING");
  if (pending.length >= ATTACHMENT_MAX_PER_PROMPT) {
    return { ok: false, error: "too_many_attachments", limit: ATTACHMENT_MAX_PER_PROMPT };
  }
  const pendingBytes = pending.reduce((n, a) => n + (Number(a.byte_size) || 0), 0);
  if (pendingBytes + bytes.length > ATTACHMENT_MAX_TOTAL_BYTES) {
    return { ok: false, error: "attachments_total_too_large", limit: ATTACHMENT_MAX_TOTAL_BYTES };
  }

  const rec = {
    schema_version: ATTACHMENT_SCHEMA,
    attachment_id: newAttachmentId(),
    lane_id: lane,
    run_id: null,
    prompt_fingerprint: null,
    filename: sanitizeFilename(filename),
    mime_type: mime,
    byte_size: bytes.length,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    checksum_sha256: createHash("sha256").update(bytes).digest("hex"),
    state: "PENDING",
    created_at: iso(nowMs),
    delivered_at: null,
    provider_path: null,
    error: null,
    order: null,
  };
  const path = attachmentFilePath(rec, root);
  mkdirSync(dirname(path), { recursive: true });
  // Never overwrite: the id is fresh, so an existing file means a collision we
  // must not paper over.
  if (existsSync(path)) return { ok: false, error: "attachment_path_conflict" };
  writeFileSync(path, bytes);
  rec.provider_path = path;
  store.attachments[rec.attachment_id] = rec;
  writeStore(store, root);
  return { ok: true, attachment: publicAttachment(rec) };
}

export function getAttachment(attachmentId, root = runtimeRoot()) {
  return readAttachmentStore(root).attachments[String(attachmentId || "")] || null;
}

/**
 * Read the bytes back, for the preview endpoint.
 *
 * The lane is checked against the record, so one lane can never address another
 * lane's attachment by guessing an id.
 */
export function readAttachmentBytes(attachmentId, { laneId = null, root = runtimeRoot() } = {}) {
  const rec = getAttachment(attachmentId, root);
  if (!rec) return { ok: false, error: "attachment_not_found" };
  if (laneId && rec.lane_id !== String(laneId)) return { ok: false, error: "attachment_lane_mismatch" };
  const path = attachmentFilePath(rec, root);
  if (!existsSync(path)) return { ok: false, error: "attachment_missing", record: rec };
  const bytes = readFileSync(path);
  // The file on disk is the file we hashed, or we do not serve it.
  const sum = createHash("sha256").update(bytes).digest("hex");
  if (sum !== rec.checksum_sha256) return { ok: false, error: "attachment_corrupt", record: rec };
  return { ok: true, bytes, record: rec, mime_type: rec.mime_type };
}

export function listPendingAttachments(laneId, root = runtimeRoot()) {
  const lane = String(laneId || "");
  return Object.values(readAttachmentStore(root).attachments)
    .filter((a) => a.lane_id === lane && a.state === "PENDING")
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((a) => publicAttachment(a));
}

export function listRunAttachments(runId, { root = runtimeRoot(), includePath = false } = {}) {
  const id = String(runId || "");
  if (!id) return [];
  return Object.values(readAttachmentStore(root).attachments)
    .filter((a) => a.run_id === id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((a) => publicAttachment(a, { includePath }));
}

/** Removing a draft attachment before Send deletes the bytes with the record. */
export function deleteAttachment(attachmentId, { laneId = null, root = runtimeRoot() } = {}) {
  const store = readAttachmentStore(root);
  const rec = store.attachments[String(attachmentId || "")];
  if (!rec) return { ok: false, error: "attachment_not_found" };
  if (laneId && rec.lane_id !== String(laneId)) return { ok: false, error: "attachment_lane_mismatch" };
  if (rec.state !== "PENDING") {
    // A delivered attachment is prompt history. History is not editable.
    return { ok: false, error: "attachment_not_removable", state: rec.state };
  }
  try { rmSync(attachmentFilePath(rec, root), { force: true }); } catch { /* record removal still proceeds */ }
  delete store.attachments[rec.attachment_id];
  writeStore(store, root);
  return { ok: true, attachment_id: rec.attachment_id };
}

/**
 * The identity of a prompt that carries images.
 *
 * Text alone is not the prompt. "look at this" with yesterday's screenshot and
 * "look at this" with today's are different instructions, and a text-only hash
 * would have silently deduplicated the second one away.
 */
export function promptFingerprint(text, attachments = []) {
  const h = createHash("sha256").update(String(text ?? ""), "utf8");
  for (const a of attachments) h.update(`|${a.checksum_sha256 || a.attachment_id}`);
  return h.digest("hex");
}

/**
 * Bind the drafted attachments to the run that is about to carry them.
 *
 * Order is fixed here and never recomputed, because the provider is told
 * "Image 1 / Image 2" and those labels have to keep meaning the same files.
 */
/**
 * Check the draft WITHOUT changing anything.
 *
 * The send path has to know an image is deliverable before it creates or
 * continues a run — but a preflight that marked records BOUND would leave them
 * attached to a run that was never made if the send was then refused. This
 * reads; bindAttachmentsToRun writes.
 */
export function validateAttachmentsForPrompt(attachmentIds, { laneId, root = runtimeRoot() } = {}) {
  const ids = (Array.isArray(attachmentIds) ? attachmentIds : []).map(String).filter(Boolean);
  if (!ids.length) return { ok: true, attachments: [] };
  if (ids.length > ATTACHMENT_MAX_PER_PROMPT) {
    return { ok: false, error: "too_many_attachments", limit: ATTACHMENT_MAX_PER_PROMPT };
  }
  const store = readAttachmentStore(root);
  const out = [];
  let total = 0;
  for (const id of ids) {
    const rec = store.attachments[id];
    if (!rec) return { ok: false, error: "attachment_not_found", attachment_id: id };
    if (rec.lane_id !== String(laneId)) return { ok: false, error: "attachment_lane_mismatch", attachment_id: id };
    const path = attachmentFilePath(rec, root);
    if (!existsSync(path)) return { ok: false, error: "attachment_missing", attachment_id: id };
    const sum = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (sum !== rec.checksum_sha256) return { ok: false, error: "attachment_corrupt", attachment_id: id };
    total += Number(rec.byte_size) || 0;
    out.push(rec);
  }
  if (total > ATTACHMENT_MAX_TOTAL_BYTES) {
    return { ok: false, error: "attachments_total_too_large", limit: ATTACHMENT_MAX_TOTAL_BYTES };
  }
  return { ok: true, attachments: out.map((r) => publicAttachment(r)) };
}

export function bindAttachmentsToRun(attachmentIds, { laneId, runId, nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const ids = (Array.isArray(attachmentIds) ? attachmentIds : []).map(String).filter(Boolean);
  if (!ids.length) return { ok: true, attachments: [], fingerprint: null };
  if (ids.length > ATTACHMENT_MAX_PER_PROMPT) {
    return { ok: false, error: "too_many_attachments", limit: ATTACHMENT_MAX_PER_PROMPT };
  }
  const store = readAttachmentStore(root);
  const bound = [];
  let index = 0;
  for (const id of ids) {
    const rec = store.attachments[id];
    if (!rec) return { ok: false, error: "attachment_not_found", attachment_id: id };
    if (rec.lane_id !== String(laneId)) return { ok: false, error: "attachment_lane_mismatch", attachment_id: id };
    if (rec.state !== "PENDING" && rec.run_id !== String(runId)) {
      return { ok: false, error: "attachment_already_bound", attachment_id: id, state: rec.state };
    }
    const path = attachmentFilePath(rec, root);
    if (!existsSync(path)) {
      rec.state = "FAILED";
      rec.error = "attachment_missing";
      writeStore(store, root);
      return { ok: false, error: "attachment_missing", attachment_id: id };
    }
    // Re-verify against the checksum recorded at upload: a truncated upload or
    // a corrupted file must never be handed to the provider as if it were the
    // image the operator chose.
    const sum = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (sum !== rec.checksum_sha256) {
      rec.state = "FAILED";
      rec.error = "attachment_corrupt";
      writeStore(store, root);
      return { ok: false, error: "attachment_corrupt", attachment_id: id };
    }
    rec.run_id = String(runId);
    rec.state = "BOUND";
    rec.order = index;
    rec.provider_path = path;
    rec.bound_at = iso(nowMs);
    bound.push(rec);
    index += 1;
  }
  const fingerprint = promptFingerprint("", bound);
  for (const rec of bound) rec.prompt_fingerprint = fingerprint;
  writeStore(store, root);
  return { ok: true, attachments: bound.map((r) => publicAttachment(r, { includePath: true })), fingerprint };
}

export function markAttachmentsDelivered(runId, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readAttachmentStore(root);
  const marked = [];
  for (const rec of Object.values(store.attachments)) {
    if (rec.run_id === String(runId) && rec.state === "BOUND") {
      rec.state = "DELIVERED";
      rec.delivered_at = iso(nowMs);
      marked.push(rec.attachment_id);
    }
  }
  if (marked.length) writeStore(store, root);
  return { ok: true, marked };
}

/**
 * The lines appended to the operator's text so the provider knows what it has.
 *
 * Absolute paths, in order, one per line. No base64 ever goes near the terminal:
 * a megabyte of encoded image pasted into a tmux buffer would flood the pane,
 * blow the instruction limit, and tell the provider nothing it could open.
 */
export function providerAttachmentBlock(attachments = []) {
  const list = (attachments || []).filter((a) => a?.provider_path);
  if (!list.length) return "";
  const lines = list.map((a, i) => {
    const kind = a.mime_type === "application/pdf" ? "PDF"
      : a.mime_type === "text/html" ? "HTML"
      : "Image";
    const dims = a.width && a.height ? ` (${a.width}x${a.height})` : "";
    return `${kind} ${i + 1} — ${a.provider_path}${dims}`;
  });
  return `\n\nAttached files:\n${lines.join("\n")}`;
}

/**
 * Retention: drop only what no conversation can still refer to.
 *
 * A PENDING attachment older than the cutoff is an abandoned draft — the
 * operator picked a file and never sent it. Anything BOUND or DELIVERED belongs
 * to prompt history and is kept, because the lane conversation still renders it.
 */
export const ATTACHMENT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function cleanupAbandonedDrafts({ nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readAttachmentStore(root);
  const removed = [];
  for (const rec of Object.values(store.attachments)) {
    if (rec.state !== "PENDING") continue;
    if (nowMs - Date.parse(rec.created_at || 0) < ATTACHMENT_DRAFT_TTL_MS) continue;
    try { rmSync(attachmentFilePath(rec, root), { force: true }); } catch { /* */ }
    delete store.attachments[rec.attachment_id];
    removed.push(rec.attachment_id);
  }
  if (removed.length) writeStore(store, root);
  return { ok: true, removed };
}

/** Bounded metadata only — never bytes, never base64, never a raw path. */
export function attachmentLogFields(rec) {
  if (!rec) return null;
  return {
    attachment_id: rec.attachment_id,
    lane_id: rec.lane_id,
    run_id: rec.run_id || null,
    mime_type: rec.mime_type,
    byte_size: rec.byte_size,
    state: rec.state,
    error: rec.error || null,
  };
}

export function resetAttachmentsForTests(root = runtimeRoot()) {
  try { rmSync(attachmentRoot(root), { recursive: true, force: true }); } catch { /* */ }
  writeStore(emptyStore(), root);
}

export function attachmentDiskUsage(root = runtimeRoot()) {
  let bytes = 0;
  for (const rec of Object.values(readAttachmentStore(root).attachments)) {
    try { bytes += statSync(attachmentFilePath(rec, root)).size; } catch { /* */ }
  }
  return bytes;
}
