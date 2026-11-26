# Phase 7 Stage B — OCR production deployment verification

Verification that the governed OCR path (scanned image + scanned PDF → reviewed published form) runs
in the **shipping Next server runtime**, not just a library spike. Every item below was found or
confirmed by running the real managed server (`:3011`) and a real `next build`.

## Runtime & dependencies

| Concern | Finding / decision |
|---|---|
| Node runtime | OCR runs in the Node.js runtime of the `POST /api/admin/documents/upload` route (not edge). |
| OCR engine | `tesseract.js@^5` (WASM). Core `tesseract.js-core` from node_modules; English model in-repo at `ocr-data/eng.traineddata` (4.1MB), loaded via a **local `langPath`** — no CDN, fully offline. |
| Scanned-PDF rasterizer | `mupdf@^1.28` (self-contained single-threaded **WASM**, ~10.4MB). No worker, no native addon, no canvas. Renders a page → PNG (`pixmap.asPNG()`). |
| No remote OCR service | Confirmed. Everything is local/offline (mandate: don't add a remote service unless local is genuinely unsuitable — it isn't). |

## Bundling defects found in-server, and their fixes

1. **tesseract.js bundled by webpack → worker path broke.** Its Node worker thread loads a sibling
   `worker-script/node/index.js` by path; webpack rewrote that to `/ROOT/node_modules/...` (missing)
   → the worker hung and uploads took **107s–2.9min** with `uncaughtException`. **Fix:**
   `serverExternalPackages += "tesseract.js"` → loaded from node_modules, on-disk layout intact.
   Upload dropped to **~8s**.

2. **pdf.js cannot rasterize in the Next server.** Both `unpdf.renderPageAsImage` and
   `unpdf.extractImages` throw **"Cannot transfer object of unsupported type"** once bundled/transpiled
   (webpack AND esbuild/tsx AND vitest) — they only work in raw Node ESM. **Fix:** rasterize with
   **mupdf** instead (WASM, no worker/transfer). Verified in-server; OCR confidence rose 73 → 91.

3. **Runtime-loaded assets are invisible to Next's file tracer.** `eng.traineddata`, the tesseract
   worker script + core WASM, and `mupdf-wasm.wasm` are all referenced by **runtime path strings**, so
   `@vercel/nft` cannot detect them → they would be missing from a serverless function bundle. **Fix:**
   `outputFileTracingIncludes["/api/admin/documents/upload"]` force-includes:
   - `./ocr-data/**`
   - `./node_modules/tesseract.js/src/worker-script/**`
   - `./node_modules/tesseract.js-core/**`
   - `./node_modules/mupdf/dist/*.wasm`

## Worker lifecycle, memory, duration, concurrency, limits

- **Worker lifecycle:** exactly one tesseract worker per document, **reused across all PDF pages**,
  `terminate()` in a `finally`. mupdf `Document`/`Page`/`Pixmap` are each `destroy()`'d.
- **Bounds:** `OCR_MAX_INPUT_BYTES = 25MB` (over-cap input refused before any work);
  `OCR_MAX_PDF_PAGES = 8` (pages beyond the cap are skipped and flagged `truncated`, logged — never
  silently dropped). Render scale ≈ 144 DPI (enough for printed text, bounded memory).
- **Duration / concurrency:** OCR is inline and CPU-bound (~7–9s per image/page). Correct for the
  governed **single-document** flow. A large multi-page scan approaches serverless duration limits even
  at the 8-page cap → **production should move OCR to an async worker/queue** (documented, not required
  for this slice).
- **Failure behavior (user-visible):** every OCR/rasterize failure is best-effort → returns `null`; the
  document is still stored and the operator sees an honest "We could not reliably read this page" state
  — never a silent empty form. Missing/corrupt language data or an unreadable PDF degrades the same way.

## Build

- `ALLOY_PROD_CERT_DIST=1 next build` (isolated `.next-prodcert`, so it never clobbers the running dev
  server; in-build TypeScript typecheck ON — `SKIP_BUILD_TYPECHECK` unset). **Result: green** — compiled
  successfully, 331/331 static pages generated, 0 errors.
- **Traced-asset confirmation:** `.next-prodcert/server/app/api/admin/documents/upload/route.js.nft.json`
  lists every runtime OCR asset, proving they are included in the serverless function bundle:
  `ocr-data/eng.traineddata`, `tesseract.js/src/worker-script/node/index.js`, all `tesseract.js-core/*.wasm`,
  and `mupdf/dist/mupdf-wasm.wasm`.

## Non-goals (held)

Printed-text OCR only — no handwriting recognition, no complex-table reconstruction, no perfect layout
fidelity, no auto-publish. Low-confidence findings gate direct publication behind an explicit operator
"Generate anyway" confirmation.
