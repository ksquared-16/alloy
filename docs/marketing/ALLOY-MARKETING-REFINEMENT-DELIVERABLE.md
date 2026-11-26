---
owner: platform
status: active
last_reviewed: 2026-08-05
supersedes: []
---

# Marketing website refinement — deliverable

**Sprint:** `marketing-website-locked-spec` (refinement phase)  
**Localhost:** http://localhost:3012  
**Screenshots:** `.alloy-agent-evidence/marketing-refinement-qa/`

This pass did **not** redesign IA, messaging, navigation, section order, brand colors, type family, or placeholders. It elevated visual polish toward a calm, premium operating-system site.

---

## 1. Before / After

| Area | Before | After |
|------|--------|-------|
| Hero display type | `clamp(2.75rem … 5.75rem)`, LH 0.98 | ~18% smaller `clamp(2.25rem … 4.625rem)`, LH 1.08 |
| Section headlines | Up to 4rem, tight | Cap ~2.875rem, LH 1.15 |
| Header logo | `h-8` / `h-9` | ~20% larger `h-10` / `h-11` with breathing room |
| Section rhythm | Equal padding + every-other gray | Compact / default / spacious densities; sparse muted chapters |
| Capability strip | Feature-row feel, larger icons | Principle stack: quieter icons, shorter lines, vertical hierarchy |
| Buttons | Semibold, 10px radius, stronger shadow | Medium weight, 12px radius, quieter shadow/hover |
| Placeholders | Tight frames | Soft outer frame padding, quieter internal label |
| Copy | Slightly wordy / “connects” | Tightened readability; favor moves work / OS / pillars |

---

## 2. Visual refinements made

1. Reduced display and section headline scales; improved line-height and letter-spacing.
2. Added `marketing-page-headline` for interior page H1s.
3. Enlarged header wordmark ~20%; taller header; more logo padding; quieter nav weight.
4. Introduced section `density` (`compact` / `default` / `spacious`) for chapter pacing.
5. Stopped strict white/River Stone alternation — muted only for problem, communications, and close chapters; pillars stay on white.
6. Increased content↔image gaps; slightly narrowed content max-width (1200px) for premium line length.
7. Capability strip reframed as operating principles (layout + shortened supporting lines).
8. Button system: medium weight, `rounded-xl`, refined padding, softer primary shadow, quieter secondary border.
9. Placeholder frames: outer padding class, softer border, quieter “Pending” treatment.
10. Platform: lighter cards (no heavy elevation), clearer hierarchy.
11. Vision: denser list rows, less visual noise, tightened supporting copy.
12. About: narrative spacing as prose chapters, not stacked equal blocks.
13. Contact: form label/input spacing, rounded-xl fields, calmer success state.
14. Footer: slightly larger brandmark, quieter borders/copy.
15. Minor copy tightening without changing story or section titles.

---

## 3. Screenshots

All routes × breakpoints (no horizontal overflow detected):

- Home, Platform, Vision, About, Contact
- 1440 · 1280 · 1024 · 768 · 390 · 360

Path:

`/.alloy-agent-evidence/marketing-refinement-qa/{page}-{width}.png`

Primary review set:

- `home-1440.png`, `home-390.png`
- `platform-1440.png`
- `vision-1440.png`
- `about-1440.png`
- `contact-1440.png`

---

## 4. Remaining punch list

Only deferred work remains:

1. **Illustrations** — hero operational-flow art + remaining generated illustrations  
2. **Product screenshots** — Processing, Operational Intelligence, Communications, BOS  
3. **Favicon polish** (if needed after multi-size / apple-touch pass)  
4. **SEO / meta polish** — per-route descriptions, Open Graph images once art exists  
5. **Micro animation** — optional later; intentionally out of this sprint  

Everything else in the locked marketing structure is treated as production-ready pending those assets.
