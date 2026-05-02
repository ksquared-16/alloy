# Known gaps (working list)

## Purpose

Lightweight companion to **`execution/roadmap-and-gaps.md`**: verified unknowns and identity-policy pointers without duplicating the full roadmap.

## Person vs contact (canonical identity)

**Policy:** `persons` are canonical; `customer_persons` is the canonical customer↔person relationship; `contacts` and related FKs (`primary_contact_id`, `to_contact_id`, `owner_contact_id`, etc.) are **legacy/compatibility**. New application logic should prefer **`primary_person_id`** when populated; contact-based messaging/document/vendor integrations remain **explicit exceptions**.

**Inventory + follow-ups:** `docs/audits/person-vs-contact-audit.md`

## Opportunities: legacy rows

Some `opportunities` rows may still have **`primary_contact_id`** set without **`primary_person_id`** (historical ingest, GHL sync, or pre-migration data). **Reads** must tolerate this; **writes** normalize toward **`primary_person_id`** where resolvable. A full backfill/migration of legacy rows is a follow-up project — not blocked on day-to-day operations.

## Where `docs/execution/known-gaps.md` must be updated

When verified in code or DB, fold conclusions into **`docs/system/entity-model.md`**, **`docs/product/crm-system.md`**, or **`docs/core/glossary.md`** and shorten or remove the matching bullet here.
