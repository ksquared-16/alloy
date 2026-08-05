---
owner: platform
status: canonical
last_reviewed: 2026-08-05
supersedes: []
---

# Alloy Marketing Website

## Locked Product, Content, Structure, and Implementation Specification

**Brand source of truth:** [`ALLOY-BRAND-DOCTRINE.md`](./ALLOY-BRAND-DOCTRINE.md)

This document owns page structure and implementation only. Visual language, messaging, color, typography, logo usage, illustration style, photography, and tone are defined in the brand doctrine. Do not redefine those rules here.

Amendments locked 2026-08-05:

- Prefer “moves work forward” language over “connected platform” language.
- Elevate Business Processes, Processing, and Operational Intelligence as primary conceptual pillars.
- Hero illustration represents operational flow, not a capability catalog.

---

# 1. IMPLEMENTATION PRINCIPLES

The marketing website must be implemented as a real responsive website.

Do not use full-page mockup screenshots as website sections.

All headings, paragraphs, buttons, navigation elements, lists, forms, and links must be native HTML.

Generated imagery is used only for illustrations and supporting artwork.

Actual Alloy product screenshots are used for product sections.

Follow brand doctrine for expression. Follow this document for structure.

---

# 2. BRAND ASSET PLACEMENT

Copy official SVGs exactly into:

- `/public/marketing/brand/alloy-gradient-wordmark.svg`
- `/public/marketing/brand/alloy-gradient-wordmark-lockup.svg`
- `/public/marketing/brand/alloy-gradient-brandmark.svg`
- `/public/marketing/favicon/alloy-gradient-brandmark.svg`

Browser title:

`Where Work Happens`

Header uses the gradient wordmark. Favicon uses the gradient brandmark.

See brand doctrine for logo rules.

---

# 3. DESIGN TOKEN APPLICATION

Apply brand doctrine colors, type scale, buttons, surfaces, and spacing through the existing repository styling system (`web/app/globals.css` `@theme` tokens and marketing-scoped utilities).

Do not create an isolated second design system.

Prefer canonical token names already in the app:

- `alloy-bend-pine`
- `alloy-midnight-forge`
- `alloy-stone` (River Stone)
- `alloy-blue`
- `alloy-ember` (Juniper Ember)

Keep Poppins as the established typeface.

---

# 4. HERO SECTION STRUCTURE

## Eyebrow

THE MODERN OPERATING SYSTEM FOR OPERATIONS

## Headline

# Most software stores information.

# Alloy moves work forward.

The second line may use the official Alloy gradient or Bend Pine emphasis.

Do not apply gradient styling to the complete headline.

## Body

Work doesn't happen inside one application.

It moves between people, decisions, communications, documents, approvals, and Business Processes.

Alloy connects them into one operating system so your team can focus on the work—not the software.

## Primary CTA

Book a Demo

## Secondary CTA

Explore the Platform

## Layout

Desktop:

- Two-column layout.
- Copy occupies approximately 42%.
- Illustration occupies approximately 58%.
- Content vertically centered.
- Illustration may extend slightly beyond the standard content column but must not touch viewport edges.

Mobile:

- Copy first.
- Buttons stack or wrap.
- Illustration follows beneath the copy.
- No text should be embedded in the hero image.

## Hero illustration slot

Asset destination:

`/public/marketing/hero/alloy-work-forward-hero.webp`

The illustration must follow brand doctrine §8 (operational flow, official brandmark when present, no capability catalog).

Until the production asset is approved, use an intentional aspect-ratio placeholder labeled by asset key.

Do **not** place the complete generated webpage screenshot inside the hero.

---

# 5. HERO SUPPORTING CAPABILITIES

Render these as native HTML beneath the hero, not as part of the illustration:

## One Record

One source of truth.

## Secure by Design

Permissions, security, and audit are built in.

## Connected Work

Every action moves the Business Process forward.

## Clear Communication

Every conversation stays connected to the work.

## Operational Intelligence

Know what matters and what requires attention.

## Open and Configurable

Built to adapt without creating disconnected systems.

Desktop:

- Six equal columns or three-by-two depending on available width.
- Thin dividers.
- Small, restrained line icons.
- No separate heavy card around each item.

Mobile:

- Two columns or stacked rows.
- Remove vertical dividers.
- Preserve comfortable tap and reading spacing.

---

# 6. HOMEPAGE CONTENT STRUCTURE

Homepage narrative order (native HTML sections):

1. Hero + supporting capabilities
2. Stop stitching software together
3. Built around Business Processes
4. Processing turns information into action
5. Operational Intelligence tells you what needs attention
6. Every conversation stays connected
7. AI that understands your business
8. One operating system, endless possibilities
9. Built to expand
10. Where Work Happens CTA

Pillars **Business Processes**, **Processing**, and **Operational Intelligence** must read as first-class differentiators in section hierarchy and emphasis.

No section should reposition Alloy as an enrollment product.

Enrollment may appear only as evidence or a reference implementation, never as the primary product identity.

Use “Business Process” rather than “workflow” in operator-facing marketing copy.

Use “Automation” for the automation capability itself.

Prefer “moves work forward” language over “connected platform” language wherever practical.

Retain previously approved homepage copy for the named sections above when available; do not invent enrollment-centric replacements.

---

# 7. SITE ROUTES

Preserve and implement:

| Route | Purpose |
| ----- | ------- |
| `/` | Homepage |
| `/platform` | Platform |
| `/vision` | Vision |
| `/about` | About |
| `/contact` | Request Demo |

Preserve approved Platform, Vision, About, and Request Demo content intent while aligning language to brand doctrine (Business Processes, Processing, Operational Intelligence, moves work forward).

Do not expand marketing IA to Solutions / Customers / Resources in this implementation unless separately approved.

---

# 8. IMAGE OWNERSHIP AND FOLDER LAYOUT

```text
public/marketing/
├── brand/
│   ├── alloy-gradient-brandmark.svg
│   ├── alloy-gradient-wordmark.svg
│   └── alloy-gradient-wordmark-lockup.svg
├── hero/
│   └── alloy-work-forward-hero.webp
├── product/
│   ├── processing.webp
│   ├── operational-intelligence.webp
│   ├── communications.webp
│   └── bos.webp
├── illustrations/
│   ├── disconnected-to-unified.webp
│   ├── business-processes.webp
│   ├── platform-expansion.webp
│   └── final-cta.webp
└── favicon/
    └── alloy-gradient-brandmark.svg
```

## Generated illustrations

- Hero operating-system / operational-flow illustration
- Disconnected systems becoming one operating system
- Business Processes illustration
- Platform expansion / vision illustration
- Final CTA artwork

## Actual product screenshots

- Processing
- Operational Intelligence
- Communications
- BOS / operational AI

For images not yet approved, use intentional aspect-ratio placeholders labeled internally by asset key. Do not invent final art.

---

# 9. ASSET STATUS

| Asset                             | Type               | Status                                        |
| --------------------------------- | ------------------ | --------------------------------------------- |
| Official gradient wordmark        | Brand              | Supplied                                      |
| Official gradient brandmark       | Brand              | Supplied                                      |
| Gradient favicon                  | Brand              | Supplied                                      |
| Hero illustration                 | Generated          | Direction approved (operational flow); production asset required |
| Disconnected systems illustration | Generated          | Pending                                       |
| Business Processes illustration   | Generated          | Pending                                       |
| Processing image                  | Product screenshot | Pending selection                             |
| Operational Intelligence image    | Product screenshot | Pending selection                             |
| Communications image              | Product screenshot | Pending selection                             |
| BOS image                         | Product screenshot | Pending selection                             |
| Platform expansion illustration   | Generated          | Pending                                       |
| Final CTA artwork                 | Generated          | Pending                                       |

---

# 10. ACCESSIBILITY AND RESPONSIVE ACCEPTANCE

Follow brand doctrine accessibility rules.

Validate at:

- 1440px desktop
- 1280px desktop
- 1024px tablet landscape
- 768px tablet
- 390px mobile
- 360px mobile

Requirements:

- No horizontal overflow.
- No clipped headlines.
- No image-over-text overlap.
- No buttons below minimum tap size.
- No unreadable capability labels.
- Header navigation collapses intentionally.
- Hero illustration remains understandable at every width.
- Browser title and favicon correct.
- Exact official header logo.
- Form validation on Request Demo.
- No generated text baked into image placements.

---

# 11. IMPLEMENTATION ORDER

1. Commit brand doctrine, then this website specification.
2. Copy the official brand SVGs into `public/marketing/brand/` and favicon.
3. Update the header wordmark and favicon.
4. Implement design-token application and global marketing primitives.
5. Implement the complete homepage content with placeholders.
6. Build the hero layout natively.
7. Add the isolated hero illustration asset when approved (operational flow).
8. Align Platform, Vision, About, and Contact.
9. Validate desktop and mobile.
10. Return to the remaining images one at a time.
11. Replace placeholders as each image is approved.

---

# 12. OUT OF SCOPE

- `/services` and other legacy home-services marketing surfaces
- AdminV2 / authenticated product chrome
- Inventing final illustration artwork
- Presenting generated UI as shipped product screenshots
- Push, merge, PR, or Vercel deploy without explicit Kelly authorization
