---
owner: platform
status: canonical
last_reviewed: 2026-08-05
supersedes: []
---

# Alloy Brand Doctrine

**Status:** Canonical brand source of truth for Alloy marketing and public surfaces.

**Purpose:** Own visual language, messaging, color, typography, logo usage, illustration style, photography, and tone.

**Companion:** [`ALLOY-MARKETING-WEBSITE.md`](./ALLOY-MARKETING-WEBSITE.md) owns page structure and implementation only. It must reference this doctrine — not redefine brand rules.

---

# 1. Brand promise

Alloy moves work forward.

Most software stores information. Alloy turns information, decisions, communications, documents, and Business Processes into connected operational progress.

## Primary conceptual pillars

Elevate these three ideas in marketing narrative, section hierarchy, and product storytelling:

1. **Business Processes** — how work is organized and advanced
2. **Processing** — how information becomes action
3. **Operational Intelligence** — how teams know what needs attention

Do not position Alloy as an enrollment product. Enrollment may appear only as evidence or a reference implementation.

Prefer **Business Process** over **workflow** in operator-facing marketing copy. Use **Automation** when referring to the automation capability itself.

## Messaging posture

Prefer:

- “moves work forward”
- “operating system for operations”
- “Business Processes”
- “Processing”
- “Operational Intelligence”
- calm operational clarity

Avoid:

- “connected platform” as the primary identity phrase
- “suite of tools”
- enrollment-first product framing
- generic SaaS productivity language
- “workflows” as the default operator noun (unless referring to Automation)

Browser title / brand line:

`Where Work Happens`

---

# 2. Tone

The brand must feel:

- Calm
- Clear
- Premium
- Architectural
- Confident
- Spacious
- Operational rather than decorative

Communicate operational meaning before technical architecture.

Write as if operators are under pressure and need clarity — not as if the audience wants more software features.

---

# 3. Official brand assets

Use only the official supplied Alloy brand files.

## Source assets

- `Alloy Gradient - Wordmark.svg`
- `Alloy Gradient - Wordmark Lockup.svg`
- `Alloy Gradient - Brandmark (1).svg`

## Implementation destinations

- `/public/marketing/brand/alloy-gradient-wordmark.svg`
- `/public/marketing/brand/alloy-gradient-wordmark-lockup.svg`
- `/public/marketing/brand/alloy-gradient-brandmark.svg`
- `/public/marketing/favicon/alloy-gradient-brandmark.svg`

## Logo rules

- Never redraw the Alloy brandmark.
- Never generate an approximation of the brandmark.
- Never replace the brandmark with a cube, letter, abstract loop, or invented shape.
- Never add “Services” beneath the wordmark.
- Preserve the official gradient.
- Preserve the official geometry and whitespace.
- Use the gradient brandmark as the favicon.
- Use the gradient wordmark in the site header.

---

# 4. Color system

## Primary brand colors

### River Stone

Primary page background and subtle section contrast.

```css
--alloy-river-stone: rgb(244, 246, 249);
--alloy-river-stone-hex: #F4F6F9;
```

### Midnight Forge

Primary text, headings, navigation, structural icons, and dark interface elements.

```css
--alloy-midnight-forge: rgb(39, 63, 82);
--alloy-midnight-forge-hex: #273F52;
```

### Bend Pine

Primary action color, active state, links, selected objects, and healthy operational progress.

```css
--alloy-bend-pine: rgb(0, 162, 131);
--alloy-bend-pine-hex: #00A283;
```

### Alloy Blue

Supporting structure, selected secondary controls, connections, and the blue side of the official gradient.

```css
--alloy-blue: rgb(0, 69, 140);
--alloy-blue-hex: #00458C;
```

### Juniper Ember

Attention and warning accents only.

```css
--alloy-juniper-ember: rgb(188, 67, 0);
--alloy-juniper-ember-hex: #BC4300;
```

### Secondary deep accent

Reserved for rare, deliberate emphasis.

```css
--alloy-deep-accent: rgb(124, 39, 58);
--alloy-deep-accent-hex: #7C273A;
```

## Semantic usage

| Role                          | Color                            |
| ----------------------------- | -------------------------------- |
| Page background               | White                            |
| Alternate section background  | River Stone                      |
| Primary heading               | Midnight Forge                   |
| Primary body text             | Midnight Forge at 72–78% opacity |
| Muted copy                    | Midnight Forge at 52–60% opacity |
| Primary CTA                   | Bend Pine                        |
| Primary CTA text              | White                            |
| Secondary CTA                 | White                            |
| Secondary CTA text            | Alloy Blue or Midnight Forge     |
| Secondary CTA border          | Alloy Blue at 65–80%             |
| Text links                    | Bend Pine                        |
| Active navigation             | Bend Pine                        |
| Structural illustration lines | Alloy Blue                       |
| Progress and healthy state    | Bend Pine                        |
| Attention                     | Juniper Ember                    |
| Card borders                  | Midnight Forge at 8–12%          |
| Soft shadows                  | Midnight Forge at 6–10%          |

Bend Pine represents action or active operational state. It is not a decorative fill applied everywhere.

Alloy Blue supports structure and connectivity.

Juniper Ember is not a general theme color.

---

# 5. Typography

Use the existing Alloy website typeface when it is already established in the application (Poppins).

Do not introduce a new external font merely to imitate a generated mockup.

## Display headline

```css
font-size: clamp(3.25rem, 5.4vw, 5.75rem);
line-height: 0.98;
font-weight: 700;
letter-spacing: -0.045em;
color: var(--alloy-midnight-forge);
```

## Section headline

```css
font-size: clamp(2.25rem, 3.5vw, 4rem);
line-height: 1.05;
font-weight: 700;
letter-spacing: -0.035em;
color: var(--alloy-midnight-forge);
```

## Card headline

```css
font-size: 1.125rem;
line-height: 1.3;
font-weight: 650;
color: var(--alloy-midnight-forge);
```

## Large body

```css
font-size: clamp(1.125rem, 1.4vw, 1.35rem);
line-height: 1.65;
font-weight: 400;
color: rgba(39, 63, 82, 0.76);
```

## Standard body

```css
font-size: 1rem;
line-height: 1.65;
font-weight: 400;
color: rgba(39, 63, 82, 0.72);
```

## Eyebrow

```css
font-size: 0.75rem;
line-height: 1;
font-weight: 700;
letter-spacing: 0.16em;
text-transform: uppercase;
color: var(--alloy-bend-pine);
```

---

# 6. Buttons and interactive language

## Primary button

Background: Bend Pine (`#00A283`)  
Text: White  

Behavior:

- Darken slightly on hover.
- Use a restrained shadow.
- Never use a neon glow.
- Minimum height: 48px.
- Minimum horizontal padding: 22px.

```css
background: #00A283;
color: #FFFFFF;
border: 1px solid #00A283;
border-radius: 10px;
box-shadow: 0 8px 22px rgba(39, 63, 82, 0.10);
```

## Secondary button

Background: White  
Text: Alloy Blue or Midnight Forge  
Border: Alloy Blue at approximately 70% opacity  

```css
background: #FFFFFF;
color: #00458C;
border: 1px solid rgba(0, 69, 140, 0.72);
border-radius: 10px;
box-shadow: none;
```

## Text link

```css
color: #00A283;
font-weight: 650;
```

---

# 7. Surfaces and spacing

## Content width

```css
max-width: 1280px;
margin-inline: auto;
padding-inline: clamp(24px, 5vw, 72px);
```

## Section rhythm

Desktop:

```css
padding-block: clamp(96px, 10vw, 160px);
```

Mobile:

```css
padding-block: 72px;
```

## Cards

```css
background: #FFFFFF;
border: 1px solid rgba(39, 63, 82, 0.10);
border-radius: 16px;
box-shadow: 0 18px 50px rgba(39, 63, 82, 0.08);
```

Shadows must remain soft and quiet.

Avoid heavy elevation and stacked glass effects.

---

# 8. Illustration style

Generated imagery is used only for illustrations and supporting artwork.

## Required qualities

- Quiet central operating-system surface
- Restrained connective paths
- River Stone, white, Midnight Forge, Bend Pine, and Alloy Blue
- Genuine official Alloy gradient brandmark when the mark appears
- Operational movement and clarity

## Hero illustration intent

The hero illustration must represent **operational flow**, not a capability catalog.

Conceptual direction:

```text
Information enters
    ↓
Alloy understands context
    ↓
Business Processes organize work
    ↓
People make decisions
    ↓
Actions produce outcomes
```

The illustration may include the official brandmark and a quiet platform surface with restrained connective paths. It must communicate movement and operational clarity.

## Hard exclusions

- Full-page mockup screenshots used as website sections
- Headline, body copy, navigation, or buttons baked into illustrations
- Browser chrome inside illustrations
- Fake Alloy wordmarks or alternative brandmarks
- Decorative glow, neon, cinematic lighting
- Capability orbit / floating application-icon catalog as the hero idea
- Generic SaaS imagery
- Superhero compositions
- Dense infographics
- Stock photography
- Raw technical diagrams
- Recreated or approximated Alloy logos

## Product imagery

Actual Alloy product screenshots are used for product sections.

Generated product interfaces must never be presented as real shipped software.

---

# 9. Photography

Prefer none for core marketing narrative.

If photography is ever introduced later:

- Real operational environments only
- No staged stock smiles or generic office sets
- Must support operational meaning, not decorate empty space

Default: illustration + product screenshots, not photography.

---

# 10. Accessibility of brand expression

- Meaningful images require descriptive alt text.
- Decorative backgrounds use empty alt text.
- Text must not be baked into generated illustrations.
- Never rely on Bend Pine alone to communicate status.
- Body copy must meet WCAG contrast.
- Respect reduced-motion preferences.

---

# 11. Ownership boundary

| Concern | Owner |
| ------- | ----- |
| Visual language, messaging, color, type, logo, illustration, photography, tone | This doctrine |
| Routes, page structure, section order, asset folder layout, implementation sequence, responsive acceptance | [`ALLOY-MARKETING-WEBSITE.md`](./ALLOY-MARKETING-WEBSITE.md) |
| Product platform doctrine | `docs/platform/**` |

When brand and implementation conflict, brand doctrine wins for expression; website spec wins for structure.
