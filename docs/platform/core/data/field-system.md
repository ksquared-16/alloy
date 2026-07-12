---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Universal Field System Specification

**Status:** Platform spec (Phase 5 — June 2026)  
**Scope:** Field type behavior contract — not a UI redesign.

This document defines how each field type behaves across Alloy surfaces. Implementation spans layout runtime, forms, drawer field renderers, and configuration field editors.

---

## Surfaces (shared contract)

| Surface | Role |
|---------|------|
| **Queue rendering** | Compact preview — truncated text, status chips, relative dates |
| **Card rendering** | Focus panel / summary — label + value, optional edit affordance |
| **Form rendering** | Full input controls with validation |
| **Config rendering** | Settings field definition editor — type, options, visibility flags |

All surfaces read **canonical values** from entity GET / composed payloads — never invent storage.

---

## Cross-cutting behavior

| Concern | Rule |
|---------|------|
| **Empty state** | Show em dash or configured placeholder; queues may omit empty optional fields |
| **Error state** | Inline field error + aria-invalid; block submit on hard validation |
| **Read-only** | Display formatted value; no edit affordance unless policy allows |
| **Responsive** | Stack label/value on narrow widths; preserve tap targets ≥ 44px |
| **Accessibility** | Label association, aria-describedby for hints/errors, keyboard navigation |

---

## Field types

### text

| Mode | Behavior |
|------|----------|
| Display | Plain string; trim trailing whitespace for display |
| Edit | Single-line input; max length from field_definitions config |
| Validation | Optional regex / min-max length |
| Queue | Truncate with ellipsis (~40 chars) |

### number

| Mode | Behavior |
|------|----------|
| Display | Locale-formatted integer or decimal per config |
| Edit | Numeric input; reject non-numeric |
| Validation | min, max, step |

### currency

| Mode | Behavior |
|------|----------|
| Display | `$X,XXX.XX` (org locale) |
| Edit | Currency input; store cents or decimal per storage class |
| Validation | Non-negative unless configured |

### percentage

| Mode | Behavior |
|------|----------|
| Display | `NN%` |
| Edit | 0–100 input or 0–1 decimal per config |

### phone

| Mode | Behavior |
|------|----------|
| Display | Formatted national/international per org setting |
| Edit | Tel input with masking optional |
| Validation | E.164 or relaxed digit count |

### email

| Mode | Behavior |
|------|----------|
| Display | Lowercase trim for display |
| Edit | Email input type |
| Validation | RFC5322 relaxed pattern |

### URL

| Mode | Behavior |
|------|----------|
| Display | Link with external icon when http(s) |
| Edit | URL input |
| Validation | Valid URL scheme |

### date

| Mode | Behavior |
|------|----------|
| Display | Org date format (e.g. Mar 1, 2026) |
| Edit | Date picker; ISO storage |
| Queue | Relative optional ("in 3 days") for near dates |

### datetime

| Mode | Behavior |
|------|----------|
| Display | Date + time in org timezone |
| Edit | Datetime picker |
| Validation | Timezone-aware storage (UTC) |

### time

| Mode | Behavior |
|------|----------|
| Display | 12h/24h per org |
| Edit | Time picker |

### dropdown / select

| Mode | Behavior |
|------|----------|
| Display | Resolved label from option_set or entity reference |
| Edit | Single select; searchable when >10 options |
| Config | option_set_key or entity reference source |
| Queue | Chip or short label |

### multi-select

| Mode | Behavior |
|------|----------|
| Display | Comma-separated labels or chip list |
| Edit | Multi select with checkboxes |
| Storage | JSON array in field_values |

### radio

| Mode | Behavior |
|------|----------|
| Display | Selected option label |
| Edit | Mutually exclusive radio group |
| Form | Preferred for ≤5 options |

### checkbox

| Mode | Behavior |
|------|----------|
| Display | Yes/No or checked state |
| Edit | Single boolean |
| Storage | boolean |

### toggle

| Mode | Behavior |
|------|----------|
| Display | On/Off label |
| Edit | Switch control |
| Accessibility | role=switch, aria-checked |

### lookup / relationship picker

| Mode | Behavior |
|------|----------|
| Display | Resolved display label from target entity |
| Edit | Search picker with debounced query |
| Validation | Must resolve to valid entity id in org scope |

### person picker

| Mode | Behavior |
|------|----------|
| Display | Person full name |
| Edit | Search `persons` scoped by org |
| Storage | person_id FK or field_values reference |

### child picker

| Mode | Behavior |
|------|----------|
| Display | Child display_name or first + last |
| Edit | Search active `customer_members` for household |
| Storage | customer_member_id |

### household picker

| Mode | Behavior |
|------|----------|
| Display | Customer name |
| Edit | Search `customers` |
| Storage | customer_id |

### address

| Mode | Behavior |
|------|----------|
| Display | Formatted multi-line or single line |
| Edit | Structured subfields (line1, city, state, postal) |
| Storage | JSON object in field_values or native columns |

### rich text

| Mode | Behavior |
|------|----------|
| Display | Sanitized HTML or markdown render |
| Edit | Rich text editor |
| Queue | Plain text excerpt |

### file

| Mode | Behavior |
|------|----------|
| Display | Filename + link |
| Edit | Upload control → storage ref |
| Validation | MIME / size limits |

### timeline

| Mode | Behavior |
|------|----------|
| Display | Chronological activity list |
| Edit | Read-only in forms; append via actions/events |
| Storage | Not a field_values type — activity feed |

### metric

| Mode | Behavior |
|------|----------|
| Display | Formatted KPI value |
| Edit | Read-only |
| Source | Analytics resolver |

### computed

| Mode | Behavior |
|------|----------|
| Display | Derived from canonical inputs (age from dob, full_name) |
| Edit | Never directly editable |
| Config | Not in field_definitions as operator-writable |
| Examples | child.full_name, child.age |

### repeater

| Mode | Behavior |
|------|----------|
| Display | List of sub-rows (inquiry children, relationships) |
| Edit | Add/remove/reorder sub-rows via actions |
| Storage | Child entities or join rows — not a scalar field |

---

## Implementation references

| Area | Module |
|------|--------|
| Layout field catalog | `web/lib/layout/childcareLayoutFieldCatalog.ts` |
| Layout runtime edit | `web/lib/layout/runtime/layoutRuntimeChildFieldEdit.ts` |
| Forms system fields | `web/lib/forms/systemFieldRegistry.ts` |
| Field definitions API | Settings → Fields |
| Drawer field policy | Entity PATCH routes + field ownership guards |

---

## Non-goals (Phase 5)

- Redesigning Runtime or Configuration UI components
- Adding new field types without platform review
- Storing computed values as authoritative truth
