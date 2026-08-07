---
owner: platform
status: active
last_reviewed: 2026-08-07
supersedes: []
---

# Alloy Marketing Asset Rendering Audit

**Date:** 2026-08-07  
**Surface:** Homepage (`http://localhost:3012/`) — slot 2 worktree  
**Method:** Playwright Chromium inspection (`deviceScaleFactor` 1 / 2 / 3)  
**Evidence:** `.alloy-agent-evidence/marketing-crisp-assets/audit-raw.json` + viewport screenshots

## Summary

Softness on the value-prop banner, Business Processes flow, and process-benefits icon strip is **not** caused by Next/Image optimization downsizing. All three use `unoptimized` and load the public WebP path directly (`currentSrc` = `/marketing/...webp`, no `/_next/image`, no `srcset` candidates).

Primary causes:

1. **Physical under-resolution on Retina** — CSS width ≈ source width, but DPR 2 needs ~2× pixels.
2. **Baked-in small type / thin linework in lossy WebP** — rasterizes labels and stroke art.
3. **Fractional CSS dimensions** — nearly every measured box is non-integer (subpixel interpolation).
4. **Slight CSS upscale** on the process-benefits strip at desktop (~1.02×).

Hero remains acceptable for this pass (richer illustration; out of scope).

---

## Rendering rules (Phase 4 — locked)

| Content type | Preferred rendering |
|---|---|
| Diagrams, process flows, banners, icon systems, line art, anything with labels/small type, UI-like illustrations | **SVG / native HTML+CSS** — copy stays HTML |
| Richer hero artwork, photographic/composited scenes where thin-line fidelity is not critical | **Raster OK** |

If raster is unavoidable:

- Export at ~**2×** max CSS display size
- Prefer lossless **PNG** for line art over compressed WebP
- Never upscale above intrinsic dimensions
- Verify the high-DPI browser candidate in DevTools

---

## Live assets inspected (2026-08-07)

| Slot | Source file | Intrinsic | Notes |
|---|---|---|---|
| Value-prop banner | `value-prop-banner-v2.webp` | **971 × 326** | Baked headings + body copy |
| Business Processes flow | `business-processes-v3.webp` | **1024 × 444** | Baked stage labels + titles |
| Process benefits icons | `process-benefits-icons-v1.webp` | **992 × 267** | Icons only; HTML text below |
| Hero (control) | `alloy-work-forward-hero-v3.webp` | **1024 × 577** | Out of scope |

Copy note: Phase 2 brief listed “Clear ownership…” for the value-prop banner. **Live approved copy** on the stitched section banner is still “From siloed to streamlined / Save time / Reduce risk / Drive impact.” The “Clear ownership…” copy lives under the Business Processes benefits row. Rebuilds preserve live copy.

---

## Browser measurements

### Shared facts (all affected imgs)

- `object-fit`: `contain`
- Ancestor `transform` / `zoom`: **none**
- Next/Image optimizer: **not rewriting** dimensions (`unoptimized`, direct public URL)
- `srcset`: empty / unused
- Fractional CSS boxes: **yes** on every viewport tested

### Value-prop banner (`value-prop-banner-v2.webp`)

| Viewport | DPR | CSS size | Natural | CSS scale | Physical scale (CSS×DPR / natural) |
|---|---:|---|---|---:|---:|
| 1440 | 1 | 894 × 300.14 | 971 × 326 | 0.92 | **0.92** |
| 1440 | 2 | 894 × 300.14 | 971 × 326 | 0.92 | **1.84** ⚠️ |
| 1280 | 2 | 894 × 300.14 | 971 × 326 | 0.92 | **1.84** ⚠️ |
| 1024 | 2 | 894 × 300.14 | 971 × 326 | 0.92 | **1.84** ⚠️ |
| 768 | 2 | 697 × 234 | 971 × 326 | 0.72 | **1.44** ⚠️ |
| 390 | 3 | 348 × 117 | 971 × 326 | 0.36 | **1.08** |
| 360 | 3 | 318 × 107 | 971 × 326 | 0.33 | **0.98** |

**Verdict:** Not CSS-upscaled on desktop, but **~1.8× physically undersampled on Retina**. Small baked type cannot stay sharp.

### Business Processes flow (`business-processes-v3.webp`)

| Viewport | DPR | CSS size | Natural | CSS scale | Physical scale |
|---|---:|---|---|---:|---:|
| 1440 | 1 | 1012 × 438.8 | 1024 × 444 | 0.99 | **0.99** |
| 1440 | 2 | 1012 × 438.8 | 1024 × 444 | 0.99 | **1.98** ⚠️ |
| 1024 | 2 | 920 × 399 | 1024 × 444 | 0.90 | **1.80** ⚠️ |
| 768 | 2 | 687 × 298 | 1024 × 444 | 0.67 | **1.34** ⚠️ |
| 390 | 3 | 338 × 147 | 1024 × 444 | 0.33 | **0.99** |

**Verdict:** Near 1:1 CSS on desktop max-width, but **~2× physical upscale on DPR 2**. Thin icons + baked labels look soft.

### Process benefits icons (`process-benefits-icons-v1.webp`)

| Viewport | DPR | CSS size | Natural | CSS scale | Physical scale |
|---|---:|---|---|---:|---:|
| 1440 | 1 | 1012 × 272.4 | 992 × 267 | **1.02** ⚠️ | **1.02** |
| 1440 | 2 | 1012 × 272.4 | 992 × 267 | **1.02** ⚠️ | **2.04** ⚠️ |

**Verdict:** Mild CSS upscale plus Retina physical upscale. Icons should be SVG.

### Hero (control — leave alone)

| Viewport | DPR | CSS size | Natural | Physical scale |
|---|---:|---|---|---:|
| 1440 | 2 | 707 × 422 | 1024 × 577 | **1.38** |

Acceptable for this pass; richer illustration, no tiny baked UI type as the primary readability path.

---

## Root-cause ranking

1. Raster WebP for UI/vector-style diagrams with thin strokes  
2. Small marketing copy baked into those rasters  
3. Retina physical pixel demand ≫ intrinsic width  
4. Fractional layout boxes (secondary)  
5. Next/Image optimizer — **not implicated** for these assets

---

## Rebuild plan (post-diagnosis)

1. **Value-prop banner** → native 4-column HTML + Lucide outline icons (preserve live siloed/save-time/risk/impact copy)  
2. **Business Processes flow** → SVG icon+connector composition + HTML stage labels  
3. **Process benefits strip** → SVG icons + existing HTML copy (drop raster)  
4. Keep hero raster  
5. Responsive QA + evidence screenshots

---

## Certification checklist (Phase 6)

Viewports: 1440, 1280, 1024, 768, 390, 360 (+ DPR 2 where available)

- [x] Icons crisp (native SVG / Lucide)
- [x] Connectors crisp (CSS)
- [x] HTML text sharp
- [x] No rasterized small copy in rebuilt components
- [x] No unintended upscaling of rebuilt assets (rasters removed from DOM)
- [x] No horizontal overflow
- [x] Mobile compact (value-prop 2×2; BP flow horizontal snap)
- [x] No unrelated redesign

Post-rebuild QA: `.alloy-agent-evidence/marketing-crisp-assets/after-*.png` + `after-qa.json`  
Confirmed: `rasterOffenders: []` at all certified viewports; only remaining marketing rasters are hero WebP + wordmark SVG.