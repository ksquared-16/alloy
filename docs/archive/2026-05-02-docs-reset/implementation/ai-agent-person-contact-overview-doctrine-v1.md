# AI agent — person / contact / relationship overview doctrine (job overview v1)

**Status:** Doctrine (design). **No code in this document.** No LLM. No new mutation rails. **Scope:** job record **overview** only (`record_overview_layouts.config`).

**Purpose:** Give product and engineering a shared rulebook for how the **semantic layout planner** should interpret **person**, **contact**, **customer**, and **relationship** language — and where those concepts may legally appear in overview config — so proposals feel like what a careful admin would choose, not a mechanical key dump.

**Related:** [overview-layout-doctrine.md](../architecture/overview-layout-doctrine.md) · [ai-agent-semantic-layout-planner-v1.md](./ai-agent-semantic-layout-planner-v1.md) · [record-rendering-system-spec.md](../architecture/record-rendering-system-spec.md)

---

## 1. Summary

Alloy’s job overview is a **structured summary**: a **header strip**, a **summary band** for high-signal facts, and **optional bands** (people, operational, financial, relationships, service property). **Relationship groups** (`relationship_group_keys`) filter which **relationship UI slices** the resolver may emit on the overview — they are not a substitute for “contact fields” when those fields do not exist as overview keys.

At planning time, **“contact”** should mean: **who to talk about in the job story** (identity + relationship context), **not** a guarantee that **phone, email, or arbitrary channels** can be placed on the overview. Channels without canonical overview keys are **capability gaps**: the planner records them as **unresolved targets** and explains limits in **rationale** — it does **not** invent `system_field` keys.

**Person identity** is represented with registry-backed keys (e.g. `_primary_person_name`) in the **people** band and, only under explicit **customer-focused** emphasis rules, coordinated with **header** identity ordering. **Relationship context** is represented by enabling the **relationships** band and selecting **relationship_group_keys** where the product supports it. **Account/customer context** uses summary/header keys such as `_customer_name` when the request is customer-centric.

This doctrine intentionally separates **concepts** (what the user means) from **config primitives** (`header_keys`, `bands`, `relationship_group_keys`) so the deterministic planner can stay testable and strict-schema-safe.

---

## 2. Definitions

### 2.1 What “contact” means at overview-planning time

**Contact** (in user language) usually bundles:

- **Who** (a person or role tied to the job)
- **How to reach them** (phone, email — often **not** modeled as overview fields)
- **Where / when** (address, schedule — often **summary** fields)

For the **semantic planner**, **contact** should be interpreted as:

1. **Primary person identity** — “main contact,” “primary person,” “their contact” → map to **person identity** keys the job overview resolver actually supplies (e.g. `_primary_person_name` in the **people** band).
2. **Relationship story** — “customer account,” “primary customer person” → map to **relationship groups** and the **relationships** band when the user wants **context** (who the job is for in relationship terms), not raw PII channels.
3. **Channels** — “phone,” “email,” “contact details” (when meaning channels) → **do not** assume a `system_field` exists; treat as **contact channels** (see §4).

“Contact details” is **ambiguous**: it may mean **identity** (name) or **channels** (phone/email). The planner should prefer **identity + people band** first; **channels** fall through to capability gaps unless catalog/registry extends later.

### 2.2 Persons-first and relationship doctrine (overview)

Alloy’s overview doctrine emphasizes **structured summary** and **relationship summaries** as **semantic groups**, not every column on the job. The planner should **align** with that: **people** and **relationships** bands are for **narrative grouping**; the **header** is for **quick identity/status** when doctrine says so — not for duplicating every band field.

### 2.3 Person identity vs relationship context vs contact channels vs account context

| Concept | Meaning | Typical config levers (job overview v1) |
|--------|---------|----------------------------------------|
| **Person identity** | Named person associated with the job (e.g. primary contact person) | `_primary_person_name` in **people** band; optional coordinated **header** placement only per §3 |
| **Relationship context** | Which relationship groups matter for this overview (customer person, customer account) | `relationship_group_keys`; **relationships** band **enabled** when emphasis requests it |
| **Contact channels** | Phone, email, messaging — reachability | **No canonical overview keys** in v1 catalog → **unresolved** / gap; future: custom fields or relationship/detail UI |
| **Account / customer context** | Who the commercial relationship is with | `_customer_name` in **summary** (and header strip under **customer-focused** rules) |

---

## 3. Placement rules

Rules are **defaults**; the planner may refine based on utterance (e.g. “higher” = reorder bands, not necessarily header).

### 3.1 `_primary_person_name`

- **Default:** Prefer **people** band as the **home** for primary person identity on the overview.
- **Header:** Surface in **header** only when:
  - the user asks for **customer-focused** / identity-strip emphasis (see §5), **or**
  - product policy explicitly ties “main contact” to the identity ribbon **without** duplicating a weak people band (see §6).
- **Summary:** Generally **not** the home for primary person name unless a future registry entry explicitly models it there; avoid duplicating identity across summary and people without reason.

### 3.2 `people` band

- Enable when the user asks to **show contact / main contact / contact details** (identity) or **customer-focused** emphasis that includes person narrative.
- **Items** should reflect **resolver-backed** keys only; do not pad with invented keys.
- **Order:** “Contact details higher” / “put contact higher” → raise **people** band **early** (e.g. immediately after **summary**), not necessarily every field into the header.

### 3.3 `relationship_group_keys`

- Use when the user wants **relationship context** on the overview: e.g. **customer-focused**, “show customer + account,” or explicit relationship wording aligned with the registry (`primary_customer_person`, `customer_account`).
- **Do not** use relationship groups as a workaround for **phone/email** — they filter **which relationship groups render**, not channel fields.

### 3.4 Header placement

- **Header** = **identity + status + short identifiers** per [overview-layout-doctrine.md](../architecture/overview-layout-doctrine.md).
- **Include** `_customer_name` / `_primary_person_name` in the header **primarily** under **customer-focused** template behavior (ordered after `title` where applicable).
- **Exclude** from header (summary-first) for **purely narrative / scheduling / location** facts unless doctrine explicitly promotes them: e.g. **address** (`_location_label`), **next service** (`_next_schedule`), **service line** (`service_key`) — these should stay in **summary** to avoid a crowded ribbon.

### 3.5 Summary placement

- **Address, next service, service line, scheduled time** → **summary** band as the default home.
- **Customer name** often appears in **summary** as well as header under customer-focused templates — duplication across header and summary should follow §6.

---

## 4. Contact channel rules

### 4.1 Phone and email

- **Planner behavior:** Treat as **capability gaps** if no `system_field` key exists in the **job overview resolution catalog** for phone/email.
- **Output:** **Unresolved targets** with stable concept ids (e.g. `phone`, `email`) and a **reason** string (no canonical overview key; use relationship UI, person drawer, or org custom fields elsewhere).
- **Do not** invent keys or write to non-overview config rails.

### 4.2 “Contact info” / “contact details” (ambiguous)

- If the utterance also names **identity** (main contact, primary person) → prioritize **people** band + `_primary_person_name`.
- If the utterance emphasizes **reachability** (phone, email) → add **unresolved** channel targets; do not imply they were added to layout.
- **Rationale** should state what was **resolved** vs **unresolved**.

### 4.3 When to suggest relationship UI or custom fields

- In **rationale** (and optionally in gap **reason** copy), steer admins toward:
  - **Relationship** surfaces / **person** drawer for **phone/email** when not on overview.
  - **Org custom field definitions** when the org wants those facts on the job record — still **not** invented by the planner without catalog entries.

---

## 5. Customer-focused rules

### 5.1 What “customer-focused” should mean on the overview

- **Emphasize:** **Who the job is for** (customer/account) and **who matters on site** (primary person), plus **relationship context** (both relationship groups where product allows).
- **De-emphasize:** Operational noise only **within** layout policy (e.g. do not delete truth; may avoid enabling **operational** band unless asked).

### 5.2 Reordering

- **Header:** Order identity keys in a predictable strip: e.g. `title`, then `_customer_name`, then `_primary_person_name`, then remaining keys — without duplicating band-only narrative.
- **Bands:** Enable **people** and **relationships**; ensure **summary** carries `_customer_name` when template expects it.

### 5.3 When to enable people and relationships

- **Enable** when customer-focused intent is detected and the template calls for **both** person narrative and relationship story.
- **Relationship group keys:** Set to the **allowed registry set** for job overview v1 (both groups when “full” customer context is intended).

### 5.4 Empty bands

- Avoid enabling **relationships** with **no items** and **no effective relationship rendering** — see §6. If the resolver would render nothing, enabling the band is **weak value**; prefer leaving disabled unless relationship groups + resolver contract guarantee content.

---

## 6. Duplication and empty-state rules

### 6.1 Duplication (header / summary / people / relationships)

- **Do not** place the same **identity** field in **header** and **people** without justification — prefer **people** for “show main contact” style requests; use **header** for identity strip under **customer-focused** or explicit doctrine.
- **Do not** duplicate **summary** narrative fields (address, next service, service line) in the **header** — summary is their primary home.
- **Relationship groups** are not duplicates of **people** items — they answer different questions (group filters vs band items).

### 6.2 Weak people band

- Avoid a **people** band that contains **only** one field that is **already** prominently shown in the **header** with no added narrative — either **consolidate** to one surface or **prefer band** over ribbon** per product policy (current implementation leans: **band for contact-only** requests; **header+template** for customer-focused).

### 6.3 Empty or cosmetic relationships band

- Do not enable **relationships** solely for “effect” if **items** are empty and **relationship_group_keys** would still yield no meaningful overview content — **empty-state rules** should gate enablement.

### 6.4 Cosmetic config churn

- If the **grounded layout** already satisfies the request, **effective layout change** should be **false** (or rationale should explain **already satisfied**), and the planner should **not** reorder or re-add keys unnecessarily — version bumps for identical shapes should be discouraged in product UX even if the rail allows a write.

---

## 7. Planner implications

### 7.1 Rules that should remain **deterministic**

- Phrase → **catalog field** resolution (synonyms, longest match, boundaries).
- **Capability gaps** for phone/email (unresolved, never invented keys).
- **Band enablement** and **relationship_group_keys** for **customer-focused** template.
- **Summary-first** placement for **location, schedule, service line** vs **header** for identity strip under customer-focused.
- **Strict validation** before any proposal is considered legal.

### 7.2 Rules that should **update** planner behavior next (implementation backlog)

1. **Disambiguate “contact details”** — split heuristics: identity-first vs channel-first using cue words (phone, email, call).
2. **Empty-state gating** — enable **relationships** only when `relationship_group_keys` + resolver contract imply visible content; same for **people** if only duplicate of header.
3. **Churn reduction** — if fingerprint of layout body is unchanged after edits, avoid redundant rationale noise; keep **effective_layout_change** aligned with admin-meaningful diffs.
4. **Tests** — lock doctrine with utterances:
   - “Show the main contact, their phone, email, address, what service they got, and next service date”
   - “Make the overview more customer-focused”
   - “Show contact details higher”
   - “Put service details higher”
   - Plus gap-only: “show phone and email” → unresolved only, no invented fields.

### 7.3 Test utterances to verify this doctrine

| Utterance | What to verify |
|-----------|----------------|
| Composite contact + address + service + next + phone/email | Resolved fields in **summary/people**; **phone/email** unresolved; **no** fake keys; strict pass |
| Customer-focused | Header identity order; **relationship_group_keys**; people + relationships enabled meaningfully |
| Contact details higher | **People** band position; **no** redundant header identity unless template says so |
| Service details higher | **service_property** order; **service line** in summary, not header spam |
| Phone/email only | Unresolved targets; **effective_layout_change** false when layout unchanged |

---

## Output index (for readers)

1. **Summary** — §1  
2. **Definitions** — §2  
3. **Placement rules** — §3  
4. **Contact channel rules** — §4  
5. **Customer-focused rules** — §5  
6. **Duplication / empty-state rules** — §6  
7. **Recommended planner changes next** — §7  

---

*Cross-link when implementing:* update [ai-agent-semantic-layout-planner-v1.md](./ai-agent-semantic-layout-planner-v1.md) with a pointer to this doctrine under “resolution rules / contact semantics.”
