---
owner: platform
status: active
last_reviewed: 2026-08-05
supersedes: []
---

# Marketing website — layout compression deliverable

**Sprint:** `marketing-website-locked-spec`  
**Localhost:** http://localhost:3012  
**Screenshots / metrics:** `.alloy-agent-evidence/marketing-compression-qa/`

This pass compressed typography, column width, section padding, and homepage composition. Positioning, navigation, brand colors, and approved messages were preserved. Placeholders were not replaced.

---

## 1. Files changed

- `web/app/globals.css`
- `web/app/page.tsx`
- `web/app/platform/page.tsx`
- `web/app/vision/page.tsx`
- `web/app/about/page.tsx`
- `web/app/contact/page.tsx`
- `web/components/marketing/HeroCapabilityStrip.tsx`
- `web/components/marketing/MarketingHeader.tsx`
- `docs/marketing/ALLOY-MARKETING-COMPRESSION-DELIVERABLE.md` (this file)

---

## 2. Typography before → after

| Token | Before (refinement) | After (compression) |
|-------|---------------------|---------------------|
| Display / hero | `clamp(2.25rem, 4.2vw, 4.625rem)` · LH 1.08 · LS -0.038em | `clamp(2.375rem, 1.75rem + 2.5vw, 4.5rem)` · LH 1.05 · LS -0.035em |
| Measured 1440 | ~74px class max path | **64px** |
| Measured 1280 | — | **60px** |
| Measured 390 | — | **38px** |
| Section H2 | `clamp(1.75rem, 2.6vw, 2.875rem)` · LH 1.15 | `clamp(2rem, 1.55rem + 1.1vw, 2.625rem)` · LH 1.12 · max ~42px |
| Page H1 | `clamp(2rem, 3.2vw, 3.25rem)` | `clamp(2rem, 1.6rem + 1.2vw, 2.75rem)` |
| Statement band | (used section headline) | `clamp(1.75rem … 2.5rem)` (~28–40px) |
| Body large | up to 1.1875rem · LH 1.7 | up to 1.125rem · LH 1.65 |
| Copy measure | `max-w-xl` (~576px) often narrower in practice | `.marketing-copy-measure` ~620px |
| Hero headline wrap | Forced `block` phrases | Natural inline wrap; Bend Pine on second sentence only |

Hero H1 line count (measured): 1440 **5** · 1280 **5** · 390 **4**.

---

## 3. Section padding before → after

| Density | Before desktop | After desktop | Mobile after |
|---------|----------------|---------------|--------------|
| Default | `clamp(88px, 8vw, 128px)` | `clamp(72px, 6vw, 96px)` | 56px |
| Compact | `clamp(64px, 6vw, 88px)` | `clamp(52px, 4.5vw, 72px)` | 48px |
| Spacious | `clamp(112px, 10vw, 168px)` | `clamp(72px, 5.5vw, 88px)` | 64px |
| Pillar row | N/A (full sections) | `clamp(44px, 4vw, 60px)` | 36px |
| Hero shell | spacious + large overrides | compact + `!pt-8…!pt-11` | tighter |
| Capability strip | `py-12 md:py-14` | `py-7 md:py-8` | — |

---

## 4. Homepage structure before → after

### Before
A. Hero (narrow ~42–46% copy, forced line breaks)  
B. Capability strip  
C. Problem (full section)  
D. Business Processes (full section)  
E. Processing (full section)  
F. Operational Intelligence (full section)  
G. Communications (full section)  
H. AI / BOS (full section)  
I. OS statement (full section)  
J. Built to expand (full section)  
K. Final CTA (spacious)

### After
A. Hero — ~50/50 grid, natural headline wrap, CTAs in first viewport  
B. Capability / principle strip (compact)  
C. Problem — “Stop stitching software together”  
D. **One pillars chapter** — intro + three tighter pillar rows (BP / Processing / OI)  
E. **Supporting capabilities** — Communications + AI side-by-side  
F. OS statement band (short)  
G. Built to expand (compact)  
H. Final CTA (compact)

Copy note: strip titles unchanged. Optional rename not applied: “Connected Work” → “Advancing Work”. Bodies already avoid repetitive “connected” phrasing.

---

## 5–6. Homepage height + reduction

Baseline = post-refinement build (pre-compression).

| Width | Before (px) | After (px) | Reduction |
|-------|-------------|------------|-----------|
| 1440 | 6672 | **5032** | **24.6%** |
| 1280 | 6391 | **4873** | **23.8%** |
| 390 | 8024 | **6710** | **16.4%** |

Hero CTA visibility @ 1440×900 / 1280×800 / 390×844: **both CTAs visible** (measured).

No horizontal overflow at 1440, 1280, 1024, 768, 390, 360.

---

## 7. Screenshots

`.alloy-agent-evidence/marketing-compression-qa/`

- `home-1440-top.png` / `home-1440-full.png`
- `home-390-top.png` / `home-390-full.png`
- `home-1280-top.png` / `home-1280-full.png`
- `platform-1440.png`
- `vision-1440.png`
- `about-1440.png`
- `contact-1440.png`
- `metrics.json`

---

## 8. Remaining punch list

1. Illustrations (hero operational-flow + remaining generated art)  
2. Product screenshots (Processing, OI, Communications, BOS)  
3. Favicon polish (multi-size / apple-touch if needed)  
4. SEO / meta + Open Graph once imagery exists  
5. Micro animation (later)

Imagery and SEO remain before calling the marketing site production-complete. Structure, type scale, and chapter compression are ready for review.
