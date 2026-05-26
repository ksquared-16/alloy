# Forms intake — embed / iframe doctrine

**Status:** Active (FD-6 foundation)  
**Scope:** Architecture boundaries for embeddable intake — no public renderer redesign in this phase.

---

## Goals

- Allow partners and vertical sites to host intake in an iframe without breaking Alloy security or branding contracts.
- Keep authoritative submission, prefill, and linkage paths on existing public APIs.
- Isolate chrome, navigation, and org branding from the intake shell.

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
              ├── IntakeFormRenderer (existing)
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
| FD-6 | This doctrine + shell component stub + metadata keys documented |
| Next | Dedicated `/public/forms/embed/[token]` route with `IntakeEmbedShell` |
| Next | CSP / `frame-ancestors` from org config |
| Later | Optional `postMessage` completion contract for hosts |

---

## Non-goals (FD-6)

- Full public UI redesign
- Custom CSS injection from untrusted hosts
- Cross-origin CRM reads from the iframe parent
