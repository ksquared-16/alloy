# Forms intake — embed / iframe doctrine

**Status:** Active (FD-6 foundation · FD-12 clarification)  
**Scope:** Architecture boundaries for embeddable intake — no public renderer redesign in this phase.

---

## What is NOT iframe

| Surface | Runtime | Notes |
|---------|---------|-------|
| **AdminV2 form authoring** | Native React in Alloy shell | Document composition editor, field cards, live preview — never iframe |
| **AdminV2 submission review** | Native Alloy case-file UI | Operator review, linkage, outputs — never iframe |
| **AdminV2 composition preview** | Native React sidebar | Layout fidelity for operators; not the public embed |

Iframe/embed is **only** for external/public distribution when intake runs outside the Alloy admin shell.

---

## Goals

- Allow partners and vertical sites to host intake in an iframe without breaking Alloy security or branding contracts.
- Keep authoritative submission, prefill, and linkage paths on existing public APIs.
- Isolate chrome, navigation, and org branding from the intake shell.

---

## Shared layout contract (staging)

`document_composition` on form schema is the **common layout contract** across:

1. **Admin native preview** (shipped — FD-12 live preview sidebar)
2. **Public form runtime** (future staged pass — still reads `fields` today)
3. **Embed / iframe runtime** (future — same renderer engine as public)

Field semantics remain in `fields[]`; composition defines document structure and region layout only.

---

## Render boundaries

| Layer | Responsibility | Must not |
|-------|----------------|----------|
| **Host page** | iframe sizing, parent analytics, CSP | Mutate submission payload or bypass token auth |
| **Intake shell** (`embed` route family) | Minimal chrome, org branding tokens, error states | Load admin modules or service-role clients |
| **Form renderer** | Field display, validation, draft PATCH | Assume top-level window; must work in iframe |
| **Post-submit** | Thank-you / redirect from link metadata | Leak PII in `postMessage` without explicit contract |

Public renderer continues to own field semantics. Embed shell only wraps layout and passes through link token + theme config.

---

## Shell architecture (staging)

```
Host site
  └── iframe[src=/public/forms/embed/:token]
        └── IntakeEmbedShell
              ├── branding zone (logo, colors from link metadata)
              ├── IntakeFormRenderer (shared with public runtime)
              └── footer / legal (optional, config-driven)
```

**Config hooks** (link metadata or org vertical config — no new migrations required for doctrine):

- `embed_mode: true` — suppress global nav, reduce padding
- `theme_primary`, `theme_logo_url` — branding-aware public experiences
- `parent_origin_allowlist` — future `postMessage` handshake for height resize / completion events
- `frame_ancestors` — enforced at CDN / middleware (CSP `frame-ancestors`)

---

## Security

- Tokens remain one-time or scoped public links; never expose service role to iframe.
- `X-Frame-Options` / CSP must allow only declared partner origins when embed is enabled.
- Prefill and CRM hydration follow [forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md) — embed does not widen prefill sources.

---

## Implementation staging

| Stage | Deliverable |
|-------|-------------|
| FD-6 | This doctrine + metadata keys documented |
| FD-12 | Admin native preview; iframe clarified as external-only |
| Next | Dedicated `/public/forms/embed/[token]` route with `IntakeEmbedShell` |
| Next | CSP / `frame-ancestors` from org config |
| Later | Public runtime reads `document_composition`; embed shares renderer |

---

## Non-goals

- Full public UI redesign in doctrine-only phases
- Custom CSS injection from untrusted hosts
- Cross-origin CRM reads from the iframe parent
- Iframe-wrapping AdminV2 authoring or review

---

## Related

- [forms-intake-runtime-phase.md](./forms-intake-runtime-phase.md) — phase operating model + Tests 2–5
- [forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md)
- [forms-intake-runtime-validation.md](./forms-intake-runtime-validation.md)
