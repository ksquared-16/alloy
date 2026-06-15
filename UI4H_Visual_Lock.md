# Communications UI-4H — Final Visual Lock

**Commit:** `d88e280` (UI-4G) → `3ca14a6` (UI-4H). Two files: `CommandCenterShell.tsx` + dev `fixtures.ts`. Presentation only — modal shell, drawer geometry, modal size, BOS, APIs, data models, routes, providers, flags all untouched; only the 3 existing endpoints referenced; fixture mode unchanged.

## Before vs after (layout)

**Before — UI-4G**
```
┌ KPI (3): Needs reply · Overdue · Unread ────────────────────────────────┐
├──────────┬──────────────────────────────────────────────────────────────┤
│          │  ── Family header band (full width, monogram+name+chips+...) ─ │
│  Queue   ├───────────────────────────────┬──────────────────────────────┤
│  ~25%    │  Thread LIST (2fr)            │  Composer (1fr)               │
│          │  • Tour confirmation · 6 msgs │  To / Subject / toolbar / body│
│          │  • Enrollment Qs · 3 msgs     │  Send · Later · BOS           │
└──────────┴───────────────────────────────┴──────────────────────────────┘
```

**After — UI-4H**
```
┌ KPI (4): Needs reply · Overdue · Unread · Response rate ─────────────────┐
├──────────┬─────────────────────────────┬────────────────────────────────┤
│          │ Family Snapshot (1 band):   │  COMPOSER (~43%, top-anchored)  │
│  Queue   │ Rivera Family · Elena·Mateo │  Email|SMS|Note                 │
│  ~25%    │ Healthy·Assigned·E✓S✓M✗     │  To: Sarah Rivera  +Add recip.  │
│          ├─────────────────────────────┤  Subject ____________________   │
│          │ CONVERSATION (chat, ~32%)   │  [B I • 🔗 ☺]        📎 Tmpl    │
│          │  Sarah: Is the spot open?   │  ┌────────────────────────────┐ │
│          │       Jane: Yes, it is. ▸   │  │  message body (dominant)   │ │
│          │  Sarah: What days?          │  │                            │ │
│          │       Jane: Mon/Wed/Fri ▸   │  └────────────────────────────┘ │
│          │                             │  Send now · Later · BOS Enhance │
└──────────┴─────────────────────────────┴────────────────────────────────┘
```

## What changed (exact)

- **Center column is now the selected conversation**, not a thread list. It is a single compact **Family Snapshot band** (name + children chips + one line: Health • Assigned • E/S/M consent • program/stage — no separate Health/Consent/Assignment cards), followed by the **conversation history rendered as a chat** (sender names, inbound/outbound bubbles; system & internal-note events shown inline).
- **Composer ~43%, top-anchored, owns full column height**; the message body is the largest surface. To / Add recipient / Subject / formatting toolbar / Attach / Templates / Send now / Later / BOS Enhance all retained on one row.
- **Queue ~25%** unchanged (family cards, status groups, search, channel filter).
- **KPI strip = 4** compact cards: Needs reply · Overdue · Unread · Response rate (computed as the replied share, `(total − needs-reply)/total`). The large reporting-style strip stays retired.

## Why this is the final visual baseline before UI-5

1. **It matches the operator's mental model.** Queue = *what needs attention*, Conversation = *context*, Composer = *action*. Each column has one job; nothing competes.
2. **Action-first.** The composer is the dominant surface, because the operator's output is a reply — not a dashboard read.
3. **Context reads as a conversation,** so an operator "understands the family" at a glance instead of parsing activity cards.
4. **It's a stable component contract.** The shapes the UI consumes (family, children, contacts, consent, conversation history, health, composer draft) are now fixed. UI-5 only swaps **fixtures → real data** into these same components — no further layout churn. That's the point of locking now: the next phase is wiring, not redesign.
5. **No dashboard creep.** KPIs are minimal and operational; the workspace feels like a communication operating center.

## Separate experiment (NOT part of the UI-4H lock): pine-tinted focus wash

Proposed as its own toggleable experiment, not included here: a **very faint pine wash (~2–4%) + soft vignette behind the drawer/workspace shell only** (not the page) to signal "you're inside a focused operating environment" when a drawer/Communications workspace is open. The earlier sample was too heavy; the right version is barely perceptible. I'd prototype it as a separate flagged pass on the shell so it can be A/B'd and tuned independently, and reverted without touching UI-4H. Say the word and I'll mock 2–3 intensities for you to pick from.

## Deliverables status

1. ✅ Updated implementation — bundle `communications-v2-ui4h-visual-lock.bundle`.
2. ⏳ Screenshot — one-step capture on your machine (the sandbox can't run Next): import the bundle, keep `NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=1` + `NEXT_PUBLIC_COMMS_V2_FIXTURES=1`, `npm run dev`, open the modal.
3. ✅ Before/after comparison (above).
4. ✅ Rationale (above).
