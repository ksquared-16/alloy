# Financial Experience — Screen 5: Accounting ("Where the Money Lands")

**Type:** Implementation-ready Operator Experience Specification (design sprint, no code).
**Scope:** The Accounting section of Alloy Financial Configuration. Deep expansion of §6 ("Screen 5 — Accounting") of `financial_configuration_product_spec.md` — the canonical parent. Nothing here invents new doctrine; it composes the frozen Configuration Runtime V1 primitives and the global patterns P1–P7.
**Author posture:** Principal Product Designer / UX Architect / Operator — not engineer.
**Date:** June 2026.

> **Governing test (inherited):** Does this feel like configuring *where the business's income belongs* — or like configuring an accounting database? If it reads as a chart of accounts, a ledger grid, or a journal, it is wrong and is redesigned here. Operators map *what they charge for* to *where its income lands*, in business language. The words **debit, credit, journal, journal line, chart of accounts, GL** never appear on the operator surface (they live in the platform, beneath posting).

This document honors every parent decision (§6.1–§6.15): reframe to "where the money lands"; a coverage answer card that *names the gaps*; a scannable Category→Account relationship map (not a node graph, not a ledger grid); income accounts framed as income buckets; Charge Categories remain **code-owned** platform invariants, surfaced as reference and marked *"managed by Alloy — not editable."* Mappings are **current-state config in V1** (not effective-dated), with the extensibility path noted should they later gain history.

---

## 1. Purpose

Ensure **every kind of charge has a revenue home** so that money posts cleanly when posting later runs — and make any gap obvious *before* it bites. Accounting is the **destination end** of the financial graph: Services and Charges produce charges that carry a Charge Category; Accounting is where each Category is told *which income account it lands in*. This screen does not post money and is not posting — it is the configuration that posting will consume.

The operator leaves this screen able to answer one question with confidence: **"Is our money mapped — and if not, what's missing and what would break?"**

---

## 2. Why this must NOT feel like accounting software

QuickBooks and NetSuite present accounting as **the accountant's model**: a chart of accounts, account types (asset/liability/equity/income/expense), debit/credit pairs, journal entries, and a ledger you reconcile. That model is correct for an accountant and *alien* to a childcare director, who thinks: *"field-trip money should land in program fees."* The director never thinks in debits.

Concrete anti-patterns this screen refuses (per parent §11 and §6):

- ❌ A **chart-of-accounts grid** (account number · name · type · balance) as the primary surface. Replaced by the coverage answer + a Category→Account map.
- ❌ **Debit/credit, journal entries, posting lines** anywhere on the operator surface. These belong to platform posting, deferred.
- ❌ A **node-graph visualization** of accounts and categories. Operators scan a list, not a diagram (Visual Language #2).
- ❌ **Account-type taxonomy** (forcing operators to choose "Income" vs "Other Income" vs "Liability"). In V1 every account here *is* an income bucket; type is not an operator decision.
- ❌ **A blank chart you must build before you're billable.** Accounting opens onto an *answer* (coverage), not an empty ledger.
- ❌ **Reconciliation, opening balances, fiscal periods, trial balance.** Not an operator concern here; deferred to real GL-sync (§19).

What replaces them: a single **coverage answer card**, a **Category→Account map** read as "the thing you charge for → where it lands," a short **Income accounts** list framed as business income buckets, and a **read-only Categories reference** that explains *why* categories are fixed. The whole screen is calm, scannable, and answers one operational worry.

---

## 3. Operator mindset

The operator arriving here is a director or finance admin who has just defined Services (what we sell), Rate Plans (how we price recurring), Policies (the money rules), and Charges (the non-tuition things). Their mental sentence is:

> *"I've set up what we charge for. Now — does each kind of money have a place to land, so nothing falls on the floor when we bill?"*

They do **not** want to learn accounting. They want to be told: everything's mapped, or here's the one thing that isn't and here's what it would break. They expect to fix a gap in one click (pick a home), and they trust BOS to *suggest* the obvious home but never to file it for them.

This is an **ambient-understanding** surface (Visual Language #4): you land in a read of the current reality (coverage + map), and editing (mapping a category, adding an account) is a deliberate, focused act.

---

## 4. Primary question being answered

**"Is our money mapped?"** — i.e. *does every kind of charge have a revenue home, and if not, what's missing and what would it break?*

Every card on this screen exists to answer that question or a direct sub-question of it:

| Card (the question it answers) | Family | Role |
|---|---|---|
| *Is our money mapped?* | Intelligence (BOS) | The headline answer + named gaps + consequence. |
| *Where does each kind of charge land?* | Financial | The Category→Account map; per-row mapped/unmapped state; the fix. |
| *What income buckets do we have?* | Financial | The income accounts list (name + number); add/edit. |
| *What are these charge categories?* | Identity (reference) | Code-owned categories with description + example; read-only. |

---

## 5. "Is our money mapped?" — the coverage answer card

The first thing on the workspace, below the `ConfigurationContext` band and the persistent `ConfigReadonlyNotice` (P2). This is a `ConfigurationDetailCard{title:"Is our money mapped?"}` rendering the BOS coverage answer (Intelligence family). It is an **answer and an attention surface — never a blocker** (parent §1.2): the org can be partially mapped and still operate; this card tells the truth about the gap.

### 5.1 The headline (mapped / unmapped counts)

The card leads with a single scannable sentence + a coverage figure. Three states:

**A. Fully mapped (complete — Bend Pine `#00a283`):**
> **"Every kind of charge has a revenue home."**
> *10 of 10 charge categories are mapped. Money from any charge has a place to land.*
>
> Glyph: Bend Pine check. Tone: calm completion.

**B. Partially mapped (attention — ember):**
> **"Almost — 1 kind of charge has no home yet."**
> *9 of 10 charge categories are mapped. 1 is unmapped:*
> - **Field trips** → no revenue account. *Field-trip charges couldn't post.*
>
> Glyph: ember attention dot. Each named gap is a link that scrolls to and focuses its row in the map (§6).

**C. Multiple gaps (attention — ember):**
> **"3 kinds of charge have no home yet."**
> *7 of 10 charge categories are mapped. These are unmapped:*
> - **Field trips** → no revenue account. *Field-trip charges couldn't post.*
> - **Late pickup fees** → no revenue account. *Late-pickup fees couldn't post.*
> - **Supplies** → no revenue account. *Supply charges couldn't post.*
>
> Sort named gaps **in-use-first** (see 5.3), then alphabetically.

### 5.2 Copy rules for the coverage card (exact)

- The count phrasing is always **"{mapped} of {total} charge categories are mapped."** `total` is the count of code-owned categories (§8). `mapped` is the count with a non-null account.
- Each named gap is exactly: **"{Category plural label} → no revenue account."** followed by the **consequence sentence** in muted weight: **"{Category}-style charges couldn't post."** rendered with the category's real example noun where it reads naturally (e.g. "Field-trip charges couldn't post.", "Late-pickup fees couldn't post.").
- Never list more than the unmapped ones. A mapped category is never named here (it's visible in the map). The card answers *what's wrong*, not *what's right*.
- The completion state (A) shows **no list** — just the green sentence and the figure. Absence of a list *is* the reassurance.

### 5.3 Severity & ordering (consequence-driven, P7)

Not all unmapped categories are equal. The card separates and orders by operational consequence:

1. **Unmapped *and in use*** (a Service or Charge currently references this category) — **high attention (ember)**. Consequence is real and imminent: those charges "couldn't post." These sort first and drive the section's queue glyph to ember.
2. **Unmapped *and not yet in use*** (a valid code-owned category nothing references yet) — **advisory (gold)**, phrased softer: *"Meals has no home yet — nothing charges to it today, so nothing breaks, but map it before you start charging for meals."* These sort after in-use gaps and do **not** turn the queue glyph ember (calm under pressure, Visual Language #8).

The headline count (5.1) always reflects *all* unmapped categories; the *tone* and the queue glyph reflect only the in-use ones.

### 5.4 BOS proposal inside the card (propose-and-approve, P6)

When BOS has a high-confidence mapping suggestion for a named gap, the gap row carries a **proposal chip**:

> **Field trips** → no revenue account. *Field-trip charges couldn't post.* — **[ BOS suggests: 4000 Program Fees · Map ]** **[ Not this ]**

- "Map" applies the suggested mapping (a single approved write through the authoring service) and the row flips to mapped (Bend Pine) with a brief completion motion (Visual Language #6).
- "Not this" dismisses the suggestion for that category; the gap remains, no auto-retry.
- The chip never appears for *not-in-use* gaps (BOS does not nag about categories nothing uses).
- BOS proposal copy is specified in §16.

### 5.5 What the card never does

It never blocks save elsewhere, never auto-maps, and never shows account *types* or numbers. It is the operator's single worry ("is our money mapped?") rendered as one answer.

---

## 6. The Category → Account relationship map

The heart of the screen: a `ConfigurationDetailCard{title:"Where does each kind of charge land?"}` containing a **scannable, two-column relationship list** — left: *the thing you charge for*; right: *where it lands* — with a per-row connecting state. This is **not** a node graph and **not** a ledger grid (parent §6.7). It reads top-to-bottom like a sentence list: *"Tuition lands in 4000 Tuition Revenue. Field trips land in… nowhere yet."*

### 6.1 Row anatomy (what each row shows)

Each row is one **charge category** (code-owned, §8) and renders three regions left→right:

```
[ state ]   THE THING YOU CHARGE FOR              →   WHERE IT LANDS
 ✓ (pine)   Tuition                                    4000 · Tuition Revenue
            recurring care & enrollment fees
```

- **State glyph (far left):** Bend Pine check `#00a283` when mapped; ember attention dot when unmapped. (Advisory/gold for unmapped-not-in-use per §5.3.)
- **Left — the thing you charge for:** the category's **plain label** (e.g. "Tuition", "Program fees", "Field trips", "Late pickup fees", "Meals", "Supplies"), with a one-line example/description in muted `config-typo-*` caption weight beneath it (sourced from the code-owned reference, §8). This is meaning-first (Visual Language #1) — the operator reads *what it is*, not a category key.
- **Connector:** a quiet `→` (or a thin stone rule) — directional, not a graph edge. No crossing lines, no SVG.
- **Right — where it lands:** for a **mapped** row, the income account as **`{number} · {name}`** in business framing (e.g. "4000 · Tuition Revenue"); for an **unmapped** row, an ember **"Pick an income account"** affordance in place of the account.

### 6.2 Mapped row state (Bend Pine)

> ✓  **Program fees** · field trips, activities, enrichment        →   **4000 · Program Fees**   [ change ]

- Pine check; account shown as `number · name`; a quiet **[ change ]** affordance (secondary, low-emphasis) on hover/focus to re-map.
- If account numbers are hidden (default, see §13 Progressive disclosure), the right side shows just the **name** ("Program Fees"); the number appears only when "Advanced" is on.

### 6.3 Unmapped row state (ember attention)

> ●  **Field trips** · zoo, museum, day excursions                →   **Pick an income account ▾**   *(ember)*

- Ember dot; the right region is the inline **account picker** affordance, styled as attention (ember accent), labeled **"Pick an income account."**
- If a BOS suggestion exists, the picker is pre-annotated: **"Pick an income account ▾  ·  BOS suggests 4000 Program Fees"** with the suggestion as the first, pre-highlighted option (still requires the operator to confirm — P6).

### 6.4 Unmapped-not-in-use row state (advisory gold)

Same shape as 6.3 but the dot is **gold** and a muted tag reads **"not used yet"** after the label. No ember, no consequence shouting — it's a heads-up, not an alarm (§5.3).

### 6.5 The inline "pick an account" interaction (exact)

Clicking the picker (or "change") opens a `ConfigSelectInput` rooted **in the row** (not a modal, not a route — P3 inline editing):

1. The select lists **existing income accounts** as **`{name}`** (number shown only in Advanced), each a calm stone option; the BOS-suggested account (if any) is first and marked *"suggested."*
2. A persistent final option: **"+ Add a new income account…"** which expands the **add-an-account** inline form (§9.3) *without* leaving the row; on save the new account is selected and the row maps.
3. Selecting an account writes the mapping immediately (current-state config, §17), the row flips to mapped (Bend Pine), the coverage card (§5) recomputes its counts, and the section queue glyph updates. A brief completion motion confirms (Visual Language #6) — no page reload, no jump.
4. Escape / click-away cancels with no write; the row returns to its prior state.

There is **no separate "save mappings" button** — each pick is an atomic, immediate, reversible mapping (you can re-pick or clear at any time). This matches "editing is intentional but light" and avoids a form-submit feeling.

### 6.6 Map ordering

Rows sort **unmapped-in-use first** (ember, top — so the gap is the first thing you see), then **unmapped-not-in-use** (gold), then **mapped** (pine), each block alphabetical by label. Within a calm fully-mapped org, the whole list is pine and alphabetical. (Rationale: the map should *lead with the gap* it shares with the coverage card, then settle into the reassuring mapped body.)

### 6.7 What the map is not

No drag-to-connect, no many-to-many web, no balances, no totals, no account-type columns. One category → one account, read as a sentence. (Many categories *may* land in the same account — that's expected and fine; the map shows it plainly by repeating the account on the right.)

---

## 7. Income accounts

A `ConfigurationDetailCard{title:"What income buckets do we have?"}` — secondary to the map, placed below it. This is the list of the **income accounts** themselves, framed as **business income buckets** ("where money lands"), never as a chart of accounts.

### 7.1 List anatomy

Each account renders as a calm row:

```
4000 · Tuition Revenue          lands: Tuition                          [ edit ]
4000 · Program Fees             lands: Program fees · Field trips · Meals [ edit ]
4100 · Late & NSF Fees          lands: Late pickup fees · Returned-payment fees [ edit ]
4200 · Supplies & Materials     (nothing lands here yet)                 [ edit ]
```

- **Identity:** `{number} · {name}`. With Advanced off (default), the **number is hidden** and only the name shows; the number is an Advanced detail (§13).
- **"lands:" reverse-reference:** the list of categories currently mapped to this account, in plain labels — so the operator reads each bucket as *"this is what falls in here."* This is the inverse of the map and reinforces the one-question framing ("what's in this bucket?").
- An account with no categories mapped reads **"(nothing lands here yet)"** in muted weight — this is the **orphan account** state (§12), info-level, not an error.
- **[ edit ]** opens inline editing of name (and number, in Advanced) — §18.

### 7.2 Add / edit (framed as buckets, not ledger accounts)

- A primary **`ConfigPrimaryButton` "Add income account"** sits in the card header / `ConfigButtonRow`.
- The add form (§9.3) asks for **name** (required) and, under Advanced, **number** (optional in V1). Copy frames it as a bucket: *"Name this income bucket the way your bookkeeper would recognize it — e.g. 'Tuition Revenue', 'Program Fees'."*
- Accounts are **org-scoped** in V1 (no per-location accounts). Extensibility note in §19.

### 7.3 No account types in V1

Every account created here is, implicitly, an **income (revenue) bucket**. The operator never chooses a type. If/when GL-sync arrives (§19), an imported account may carry a type from the external system, surfaced read-only — but the operator is never asked to classify.

---

## 8. Charge Categories reference (code-owned)

A `ConfigurationDetailCard{title:"What are these charge categories?"}` carrying a prominent `ConfigReadonlyNotice`-style banner: **"Managed by Alloy — not editable."** This card exists so operators understand *why they can't add or rename categories* (parent §6.5): categories are **platform invariants** owned by code; the operator's job is to give each one a revenue home, not to define the set.

### 8.1 Why categories are code-owned (the explanation operators get)

A short lead paragraph, in operator words:

> *"Charge categories are the kinds of money Alloy knows how to bill — tuition, program fees, late fees, and so on. Alloy manages this list so that pricing, charges, and posting all agree on the same vocabulary. You can't add or remove a category, but you decide **where each one's income lands** in the map above."*

### 8.2 Reference row anatomy

Each code-owned category is one read-only row: **plain label · one-line description · a concrete example · current mapping status.**

| Category (label) | Description | Example | Status |
|---|---|---|---|
| **Tuition** | Recurring care and enrollment fees. | "$285/week Toddler full-time." | ✓ mapped → Tuition Revenue |
| **Registration** | One-time fees to enroll or re-enroll. | "$75 annual registration." | ✓ mapped → Program Fees |
| **Program fees** | Charges for programs, activities, enrichment. | "$45 field trip to the zoo." | ✓ mapped → Program Fees |
| **Field trips** | Off-site excursion charges. | "$45 museum trip." | ● **unmapped** |
| **Late pickup fees** | Penalties for late pickup. | "$25 after 6:05pm." | ✓ mapped → Late & NSF Fees |
| **Returned-payment fees** | NSF / failed-payment penalties. | "$30 returned ACH." | ✓ mapped → Late & NSF Fees |
| **Meals** | Food and meal-plan charges. | "$5/day lunch." | gold **not used yet** |
| **Supplies** | Materials, consumables, supply fees. | "$30 supply fee." | ✓ mapped → Supplies & Materials |
| **Deposits** | Refundable/holding deposits. | "$200 enrollment deposit." | ✓ mapped → Program Fees |
| **Adjustments & credits** | Corrections, discounts, write-offs (income-affecting). | "−$50 goodwill credit." | ✓ mapped → Tuition Revenue |

*(The exact category set is whatever the platform ships; the table above is illustrative of the row shape and copy register. Descriptions and examples are sourced from code-owned metadata, not authored here.)*

### 8.3 Read-only behavior (exact)

- **No add, no rename, no delete, no reorder.** The card carries `ConfigReadonlyNotice` semantics and shows no edit affordances on label/description/example.
- The **only** interactive thing on a reference row is its **status chip**, which deep-links to that category's row in the map (§6) — so "I see Field trips is unmapped here" → one click → "now I'm picking its account." Reference *explains*; the map *acts*.
- If an operator tries to do something the card can't do (there's no affordance, but for completeness), the framing already answers it: *"managed by Alloy — not editable."*

### 8.4 Relationship to the map

The reference card and the map show the **same set** of categories. The map is the *action* surface (map/change the home); the reference is the *understanding* surface (what this category means + why it's fixed). Status stays in sync between them.

---

## 9. Operational language translation (jargon → Alloy words)

This screen's slice of the global P1 contract (parent §9). Left column **never appears**; right column always does.

| Accounting / schema term | Alloy operator word |
|---|---|
| Chart of accounts | "Income accounts" / "income buckets" |
| GL account / ledger account | "Income account" / "where money lands" |
| Account type (income/asset/liability) | (hidden in V1; every account *is* an income bucket) |
| Debit / credit / journal / journal line | (never shown — platform posting only) |
| GL code / account code | "number" (Advanced only) |
| Map / mapping / `charge_category_id → gl_account_id` | "where does each kind of charge land?" / "revenue home" |
| Charge category enum / `charge_type` | the category's **plain label** |
| Unmapped category | "no revenue account" / "no home yet" |
| Orphan account (no mappings) | "(nothing lands here yet)" |
| Posting / post to ledger | "post" (only as a future consequence: "couldn't post"); no journal mechanics |
| Reconciliation / trial balance / fiscal period | (not present — deferred to GL-sync) |

This table is the **acceptance test** for P1 on this screen: if any left-column term renders, the screen has failed.

---

## 10. Setup journey

Where Accounting sits in the parent's guided progression (parent §1.1): it is the **5th step** ("Money movement → Accounting — where money lands"), reached after Services, Rate Plans, Policies, and Charges exist. The journey *into* and *through* Accounting:

1. **Arrive with context.** The operator comes from the Overview journey rail or from a deep-link ("field-trip revenue has no home" on the Overview readiness card, or "[ change ] where it lands" from a Service/Charge). The section opens in **Summary mode** (P3).
2. **Read the answer first.** The coverage card (§5) is the first thing seen: mapped/unmapped count + named gaps + consequence. The operator instantly knows whether there's anything to do.
3. **If complete:** the card is green, the map is all pine — the operator confirms and leaves. No mandatory work.
4. **If gaps exist:** the operator clicks a named gap (or the matching ember row in the map), picks an income account (§6.5) — adding a new bucket inline if needed (§9.3) — and the gap closes with a completion motion. The coverage count ticks up.
5. **Repeat per gap** until the coverage card goes green. The reference card (§8) is there if they wonder *what a category means* or *why they can't add one*.
6. **Leave reassured.** The queue glyph for Accounting flips to a Bend Pine check once no *in-use* category is unmapped.

The journey is **gap-driven and short**: the operator does exactly as much as the named gaps require, and the screen tells them when they're done.

---

## 11. Information hierarchy

Top to bottom in the Workspace (flex column), inside the frozen shell `Context → Queue → Workspace → BOS`:

1. **`ConfigurationContext` band** — title *"Accounting — where money lands"* + one-line purpose: *"Give every kind of charge a revenue home so money posts cleanly later."*
2. **`ConfigReadonlyNotice` (P2)** — *"This is configuration. It does not post money. Posting is a separate, controlled process."*
3. **Coverage answer card** (§5) — *"Is our money mapped?"* The headline answer. **Highest priority.**
4. **Category → Account map** (§6) — *"Where does each kind of charge land?"* The action surface. **Primary working area.**
5. **Income accounts** (§7) — *"What income buckets do we have?"* Secondary; supports the map.
6. **Charge Categories reference** (§8) — *"What are these charge categories?"* Read-only understanding; bottom.
7. **Advanced disclosure** (§13) — account numbers, future GL-sync — collapsed by default.

The **Object Queue (320px)** is *not* used as a lineage list here (Accounting has no per-item lineage like rate plans/policies). The whole section is a single Workspace view. (If categories ever grow large enough to warrant a queue, the map itself becomes the scannable list — no shell change needed.)

---

## 12. Cards (the answer set)

| Card (question) | Component | Family | Content |
|---|---|---|---|
| *Is our money mapped?* | `ConfigurationDetailCard{title}` + BOS | Intelligence | Coverage figure, named gaps, consequence sentences, BOS map chips (§5). |
| *Where does each kind of charge land?* | `ConfigurationDetailCard{title}` | Financial | Category→Account map rows; per-row mapped (pine) / unmapped (ember) / not-used-yet (gold); inline `ConfigSelectInput` picker (§6). |
| *What income buckets do we have?* | `ConfigurationDetailCard{title}` | Financial | Income accounts list (`number · name`), "lands:" reverse refs, `ConfigPrimaryButton` add, inline edit (§7). |
| *What are these charge categories?* | `ConfigurationDetailCard{title}` + `ConfigReadonlyNotice` | Identity | Code-owned categories, description + example + status; "managed by Alloy — not editable" (§8). |

Each card answers exactly one operator question in its title (P5). No card is a field-group with a noun label.

---

## 13. Mapping workflow (step-by-step)

**Map a category (the core task):**

1. Operator sees an **ember row** in the map (or clicks a named gap in the coverage card / Overview readiness card, which scrolls to and focuses that row).
2. Operator clicks **"Pick an income account"** on the row → inline `ConfigSelectInput` opens *in the row* (§6.5).
3. Operator either:
   a. selects an existing bucket (BOS suggestion first if present), **or**
   b. chooses **"+ Add a new income account…"** → inline add form (name; number under Advanced) → save → new bucket auto-selected.
4. The mapping writes immediately (atomic, current-state — §17). Row flips to **mapped (Bend Pine)**, completion motion plays.
5. Coverage card (§5) recomputes (`mapped` +1, gap removed from the named list); section queue glyph updates if that was the last in-use gap.
6. No global save. The operator can **[ change ]** or clear the mapping later with the same inline interaction.

**Add an income account (standalone):**

1. Operator clicks **`ConfigPrimaryButton` "Add income account"** in the Income accounts card.
2. Inline form: **Name** (`ConfigTextInput`, required); under **Advanced**: **Number** (`ConfigTextInput`/`ConfigNumberInput`, optional in V1). Copy: bucket framing (§7.2).
3. `ConfigButtonRow`: `ConfigPrimaryButton` "Add account" / `ConfigSecondaryButton` "Cancel."
4. On save the account appears in the Income accounts list and becomes selectable in every map picker. It starts with **"(nothing lands here yet)"** until a category is mapped to it.

**Fix coverage (from the answer card):** each named gap in the coverage card links to its map row; if BOS has a suggestion, an inline **"Map [4000 Program Fees]"** chip resolves the gap in one approved click (§5.4, §16).

---

## 14. Validation & warnings (every message in operator words)

All validation speaks **operational consequence** and routes to a fix (P7). Three severities, rendered with the cross-cutting attention model (parent §8.1): **Attention (ember)**, **Advisory (gold)**, **Info (stone)**.

| Condition | Severity | Message (exact operator words) | Where it surfaces | Fix path |
|---|---|---|---|---|
| **Unmapped category, in use** (a Service or Charge references it) | Attention (ember) | *"Field trips have no revenue home. {N} field-trip charges couldn't post."* | Coverage card named gap; ember row in map; section queue glyph; Overview readiness card | Click the row → pick an income account (§13) |
| **Unmapped category, not in use** | Advisory (gold) | *"Meals has no home yet — nothing charges to it today, so nothing breaks. Map it before you start charging for meals."* | Coverage card (soft, below in-use gaps); gold row in map | Optional: pick an account now |
| **Income account with no number** (Advanced; export/GL-sync may need one) | Advisory (gold) | *"'Tuition Revenue' has no account number. That's fine for now, but your bookkeeping system may need one when you connect it."* | Income accounts row; Advanced detail | Add a number (Advanced) |
| **Orphan account** (account mapped to nothing) | Info (stone) | *"Nothing lands in 'Supplies & Materials' yet. That's okay — it's ready when a charge needs it."* | Income accounts row ("(nothing lands here yet)") | None required; or map a category to it, or remove it |
| **Removing an account that's in use** | Attention (ember) — guard | *"3 kinds of charge land in 'Program Fees'. Remove this and they'd have no home. Re-map them first."* (names the categories) | On delete attempt | Re-map the listed categories, then remove |
| **Mapping an account that was just deleted / no longer exists** (race) | Info (stone) | *"That income account is no longer available. Pick another."* | Inline picker | Re-pick |

**Tone rules:** every message names the **thing** ("field trips", "Program Fees"), states the **consequence** ("couldn't post", "would have no home"), and offers the **next move**. No "value required", no "invalid mapping", no error codes.

---

## 15. Coverage model

The single computed model behind the coverage card, the map glyphs, and the queue glyph. Defined once, consumed everywhere (so all three always agree).

- **Universe:** the set of code-owned charge categories (§8). `total` = its count.
- **Mapped(category):** the category has a non-null income-account mapping.
- **InUse(category):** at least one Service or Charge currently references the category as its revenue home (read from the financial graph — §16-parent §6.11).
- **Coverage figure:** `mapped = count(Mapped)`, displayed as *"{mapped} of {total} charge categories are mapped."*
- **Gap classification per unmapped category:**
  - `Mapped=false AND InUse=true` → **Attention (ember)**, named first, drives queue glyph.
  - `Mapped=false AND InUse=false` → **Advisory (gold)**, named after, does *not* drive queue glyph.
- **Section completeness (queue glyph):** Bend Pine check **iff** there are zero *in-use unmapped* categories. (Not-used-yet gaps do not block completion — the org is fully billable for what it actually charges.)
- **Account-side signals (do not affect coverage figure):** orphan accounts (info) and number-less accounts (advisory) are surfaced on the Income accounts card, not in the coverage count.

This model is the screen's source of truth for "is our money mapped?" and is recomputed live on every mapping write, account add/remove, and on any change to which categories are in use.

---

## 16. Relationships (to Services, Charges, Posting)

Accounting is the **destination end** of the financial graph (parent §6.11):

- **Services → Accounting.** A Service's default revenue category reads *through* to its mapped income account. The Service detail's *"Where does its revenue land?"* card (parent §2.4) shows `Category → Account` read from here, with a "change" that deep-links **into** this screen's map. Accounting owns the mapping; Services reference it.
- **Charges → Accounting.** Each Charge Definition carries a Charge Category; its *"Where does its revenue land?"* card (parent §5.5) reads the same mapping. A Charge pointing at an **unmapped** category surfaces the §14 ember warning here *and* an attention on the Charge ("this charge has no revenue home"), routed to Accounting.
- **Charge Categories ↔ Income accounts.** The mapping itself: many categories may land in one account; each category lands in at most one account (V1).
- **Accounting → Posting (deferred).** Posting (parent §1.1, deferred) **consumes** these mappings to write the ledger. Accounting never posts; it only declares *where* posting should land. The truth boundary (P2) is absolute: this screen is configuration, posting is a separate controlled process.
- **InUse signal** is computed from Services + Charges (§15), which is what makes an unmapped category "in use" (ember) vs "not yet" (gold).

---

## 17. Editing & versioning behavior

- **Mappings are current-state config in V1 — not effective-dated** (parent §6.10). Changing a mapping changes **future** posting from that point; there is no scheduled-mapping, no supersede, no history rail. This is deliberate: a revenue home is a present fact ("field trips land in Program Fees"), and V1 keeps it simple.
- **No `EffectiveDatedConfigurationEditor`, no `ConfigVersionBadge`** on this screen (unlike Rate Plans / Policies / Charges). The map shows *current* state only.
- **Account edits are inline** (name; number under Advanced) — §18.
- **Atomic writes:** each mapping pick and each account add/edit is an immediate, individually-reversible write through the authoring service. There is no batch "save mappings" step.

---

## 18. Progressive disclosure

Default view = **the coverage card + the Category→Account map (names only)**. Everything ledger-flavored is tucked under **"Advanced"** (collapsed):

- **Account numbers.** Hidden by default; the map's right side shows account *names* only; the Income accounts list shows *names* only. Turning on **Advanced** reveals `{number} · {name}` everywhere and the **Number** field in the add/edit account form. (Rationale: a director thinks "Program Fees," not "4000.")
- **Export / GL-integration detail.** The future "synced to QuickBooks/Sage" per-account state (§19) and any export affordance live under Advanced. Absent in V1; the disclosure is the reserved home so adding it later changes nothing structural.
- **Account-with-no-number advisory** (§14) only appears when Advanced is on (it's a bookkeeping-system concern, irrelevant until you care about numbers).

Advanced is a per-section toggle in the Workspace, remembered per operator. Calm by default; depth on demand (Visual Language #8).

---

## 19. Empty / first-run

There is no true blank ledger to build, but two first-run shapes:

**A. No income accounts yet (fresh org).** The Income accounts card shows a `ConfigurationEmptyState`:
> *"No income accounts yet. Tell Alloy where different kinds of income belong — tuition, program fees, late fees — so charges can post to the right place."*
> Primary: **`ConfigPrimaryButton` "Add income account."**

Simultaneously the coverage card reads the all-unmapped state honestly:
> **"Nothing has a revenue home yet."** *0 of {total} charge categories are mapped. Add at least one income account and map your in-use charges so they can post.*

**B. Accounts exist, gaps remain.** Coverage card in its partial state (§5.1.B/C), map leading with ember rows. This is the normal working state.

**BOS first-run proposal (propose-and-approve, P6, §16):** when accounts are empty, BOS may offer to seed a sensible starting set as drafts for approval:
> *"Most childcare orgs use a few income buckets: Tuition Revenue, Program Fees, Late & NSF Fees, Supplies. Want these as a starting set? You can rename or remove any."* — **[ Add these ]** **[ No thanks ]**

Approving creates the accounts (not the mappings — those stay the operator's call, surfaced as the next gaps to close). No dead-ends (parent §8.4): every empty state explains the business concept, gives one primary action, and offers an optional BOS draft.

---

## 20. Editing workflow (accounts)

**Edit an income account:**
1. **[ edit ]** on an Income accounts row → inline edit (P3): **Name** (`ConfigTextInput`); under Advanced, **Number** (`ConfigTextInput`/`ConfigNumberInput`).
2. `ConfigButtonRow`: `ConfigPrimaryButton` "Save" / `ConfigSecondaryButton` "Cancel."
3. Renaming an account updates it everywhere it's referenced (the map's right side, every "lands:" list, every Service/Charge read-through) — because the mapping points at the account, not its name. No re-mapping needed.

**Remove an income account:**
1. Remove affordance on the row (low-emphasis, in edit mode).
2. If the account is **in use** (categories map to it), the §14 ember guard fires, names the categories, and blocks until they're re-mapped.
3. If the account is an **orphan** (nothing lands in it), removal is allowed with a quiet confirm: *"Remove 'Supplies & Materials'? Nothing lands here, so nothing is affected."*

**Re-map / clear a mapping:** **[ change ]** on a mapped map row re-opens the inline picker (§6.5); choosing a different account re-maps; an explicit **"Clear"** option in the picker returns the row to unmapped (which, if the category is in use, re-raises the ember gap — with its consequence — so the operator can't silently strand money).

---

## 21. Versioning / extensibility

V1 keeps mappings **current-state** (§17). Two forward paths are reserved without changing the operator model:

- **If mappings gain history.** Should the business need *"field trips landed in Program Fees until March, then in a new Field Trip Revenue account,"* mappings adopt the **same effective-dated pattern** used by Rate Plans / Policies / Charges: the shared `EffectiveDatedConfigurationEditor`, `ConfigVersionBadge` (Current / Scheduled / Superseded / Retired), the verb **"Schedule a change"** (never "edit" — parent §8.2), void-before-start, and "as of" viewing. The map row gains a state badge; the coverage model evaluates "as of" a date. Operators who learned versioning elsewhere get it for free. **This is a deliberate non-goal for V1** and is mentioned only so the data and UI shapes don't preclude it.
- **Future GL-sync state.** When real posting / external GL integrations (QuickBooks, Sage, NetSuite) arrive, the **same map and account list** gain a per-account **"synced to {system}"** state under Advanced (§18) — a quiet status chip ("synced to QuickBooks · 4000 Program Fees"), an imported account-type shown read-only, and a connection panel under Advanced. The operator model — *categories land in income buckets* — does not change; sync is an *attribute of a bucket*, not a new mental model. New code-owned categories appear in the reference (§8) with a mapping prompt in the coverage card.

---

## 22. Operator mistakes (anticipated, designed-for)

| Mistake | How the design prevents / softens it |
|---|---|
| Tries to **add or rename a charge category** | The reference card states *"managed by Alloy — not editable"* up front and offers no affordance; the operator's energy is redirected to *mapping* (the thing they can do). |
| Tries to **build a chart of accounts** before mapping | The screen leads with the *coverage answer* and the *map*, not a blank account grid; accounts are added *as needed* (often inline while mapping, §6.5), so the operator never faces "design your ledger." |
| **Strands an in-use category** by clearing a mapping | Clearing re-raises the ember gap with its consequence ("field-trip charges couldn't post"); the queue glyph goes ember; the Overview readiness card flags it. The mistake is loud and reversible, never silent. |
| **Deletes an account that's in use** | Hard guard (§14, §20): named categories must be re-mapped first. |
| **Maps everything to one bucket** (over-collapsing) | Allowed (it's valid) but the "lands:" reverse list (§7.1) makes it visible — the operator *sees* that ten categories all land in one bucket and can split if they want. No nag, just legibility. |
| **Worries the screen posts money** | Persistent `ConfigReadonlyNotice` (P2) on every visit: *"This is configuration. It does not post money."* |
| **Thinks they're done when a not-yet-used category is unmapped** | Gold advisory (not ember) tells them it's fine for now and to map it before charging — and the section can still show complete (§15), so they're not falsely blocked. |
| **Expects account numbers and panics they're missing** | Numbers are an Advanced detail with a calm advisory, never a required field (§14, §18). |

---

## 23. How BOS assists (propose-and-approve only, P6)

Every BOS touch on this screen is a **proposal an operator approves** — never an auto-write (parent §8.3, §6.8):

- **Mapping proposal (the headline assist).** For an in-use unmapped category, BOS proposes the most likely home, inline in both the coverage card and the map row:
  > *"Field-trip revenue → 4000 Program Fees?"* — **[ Map ]** **[ Not this ]**

  More fully phrased in the coverage card: *"Field trips have no home. Most orgs land field-trip revenue in Program Fees. Map it there?"* "Map" performs one approved write; "Not this" dismisses without retry. BOS suggests only for **in-use** gaps and only when confidence is high; otherwise the plain "Pick an income account" stands with no suggestion.
- **First-run account seeding** (§19): proposes a common starter set of income buckets as drafts for approval — never the mappings.
- **Over-collapse nudge (advisory, optional):** if an implausible number of distinct categories land in one bucket, BOS may *softly* note it — *"10 kinds of charge all land in one bucket. That's allowed — want to split fees out?"* — as a dismissible advisory, not an error.
- **What BOS never does here:** never auto-maps, never creates an account silently, never posts, never patches the code-owned category set, never edits a mapping without an explicit approve. BOS *proposes*; the human's click is the write.

The mapping proposal copy register is always: name the **category**, name the **likely account**, end in a **question** the operator answers with one click.

---

## 24. Questions answered

- **Is our money mapped?** — the coverage card, with the exact count and named gaps.
- **What's missing, and what would it break?** — named gaps + consequence sentences ("field-trip charges couldn't post").
- **Where does each kind of charge land?** — the Category→Account map, read as a sentence list.
- **What income buckets do we have, and what falls in each?** — the Income accounts list with reverse "lands:" references.
- **What do these categories mean, and why can't I change them?** — the code-owned reference card ("managed by Alloy — not editable").
- **How do I fix a gap?** — click the row, pick (or add) an income account; one approved click if BOS suggests.
- **Does this post money?** — no; the persistent read-only notice says so.

## 25. Questions introduced (and where each lands)

- **"Can two kinds of charge share one income bucket?"** — yes; shown plainly by the repeated account on the right of the map and the multi-item "lands:" list. (Answered in-surface.)
- **"What if a category is unmapped but nothing uses it?"** — gold advisory, doesn't block completion (§15). (Answered in-surface.)
- **"Where do account numbers come from / do I need them?"** — Advanced, advisory-only in V1 (§14, §18). (Answered in-surface, deferred in depth to GL-sync.)
- **"When does this actually move money?"** — posting, deferred; this screen only declares the destination (§16). (Answered by the read-only boundary; mechanics out of scope.)

## 26. Questions intentionally deferred

- **Posting mechanics** (journals, debit/credit, ledger writes) — belong to platform Posting (parent §1.1, deferred); never on this operator surface.
- **Effective-dated mapping history** — out of V1 scope; reserved pattern documented (§21).
- **Account types / non-income accounts** (liabilities, deposits-as-liability, clearing accounts) — V1 treats every account as an income bucket; richer typing waits for GL-sync.
- **Multi-entity / per-location accounts, fund accounting, class/department tracking** — not modeled in V1; org-scoped only.
- **Reconciliation, opening balances, fiscal periods, trial balance, financial statements** — accountant-domain, never an operator concern here.
- **Live GL-sync (QuickBooks/Sage/NetSuite)** — future; reserved as a per-account Advanced state (§21) that doesn't change the operator model.
- **Tax mapping / tax accounts** — follows from Services/Charges tax treatment (parent §2.13, §3.14) when that lands; out of scope here.

---

## 27. Component mapping (exact, per part)

| Surface part | Component(s) |
|---|---|
| Section context band | `ConfigurationContext` |
| Shell geometry | `ConfigurationShell` (frozen `Context → Queue → Workspace → BOS`) |
| Section nav entry ("Accounting") | `ConfigurationQueue` / `ConfigurationQueueItem` (260px Section Queue) with Bend-Pine completion glyph |
| Workspace column | `ConfigurationWorkspace` |
| Coverage answer card | `ConfigurationDetailCard{title:"Is our money mapped?"}` (+ BOS proposal chips) |
| Category→Account map card | `ConfigurationDetailCard{title:"Where does each kind of charge land?"}` |
| Inline account picker (per row) | `ConfigSelectInput` |
| Income accounts card | `ConfigurationDetailCard{title:"What income buckets do we have?"}` |
| Add/edit account fields | `ConfigFieldGrid` · `ConfigField` · `ConfigFieldLabel` · `ConfigTextInput` · (Advanced) `ConfigNumberInput` |
| Add/edit/save/cancel buttons | `ConfigButtonRow` · `ConfigPrimaryButton` · `ConfigSecondaryButton` |
| Charge Categories reference card | `ConfigurationDetailCard{title:"What are these charge categories?"}` + `ConfigReadonlyNotice` ("managed by Alloy — not editable") |
| Persistent truth-boundary notice | `ConfigReadonlyNotice` (P2) |
| First-run empties | `ConfigurationEmptyState` |
| Scope framing (org-scoped accounts) | `ConfigScopeBadge` (org default) where useful |
| **Deliberately absent in V1** | `EffectiveDatedConfigurationEditor`, `ConfigVersionBadge`, `ConfigEffectiveBadge` (mappings are current-state, §17) |

Tokens & color: white canvas, stone borders, `1rem` card radius, `config-typo-*` type; **Bend Pine `#00a283`** for mapped/complete, **ember** for in-use gaps (attention), **gold** for not-yet-used advisory, **stone** for info. No new design language (parent §0).
