# Card Lab — isolated specification namespace

Everything under `lib/cardLab`, `components/cardLab`, and `app/dev/operational-card-lab` is
**specification and review material** for the Operational Card System Expansion.

It is deliberately isolated:

- No file here is imported by any production module.
- No card key here is registered in `FOCUS_PANEL_CARD_KEYS`, `FOCUS_PANEL_CARDS`,
  `FOCUS_PANEL_CARD_CATALOG`, `SYSTEM5_CARD_ARCHETYPE`, or `focusPanelCardProviders.ts`.
- The review surface is dev-only (`notFound()` in production).

Consequently these cards **cannot** be added to a Surface, cannot appear in the Surfaces
builder catalog, and cannot enter a Focus Panel composition until a later mission makes those
registry edits deliberately.

Spec: `docs/platform/operator/operational-card-system-expansion.md`
