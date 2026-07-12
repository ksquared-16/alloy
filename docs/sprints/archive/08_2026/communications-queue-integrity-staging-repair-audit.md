# Communications Queue Integrity — Staging Repair Audit (Read-Only)

**Branch:** `fix/communications-queue-integrity`  
**Base:** `staging` @ `6daf032ce`  
**Status:** Read-only classification template — run against staging before executing repairs.

## Purpose

Classify every Communications Inbox row that fails the canonical queue contract:

```text
org_id + customer_id  → family grouping
org_id + customer_id + topic  → selectable topic row
scope_status = resolved     → loadable runtime handoff
```

Do **not** delete or merge customer records from this audit alone.

## SQL — Inventory problematic threads

Run in staging Supabase SQL editor (org-scoped; replace `:org_id`).

```sql
-- 1) Threads missing resolvable customer scope
SELECT
  t.id AS thread_id,
  t.org_id,
  t.channel,
  t.primary_entity_type,
  t.primary_entity_id,
  t.recipient_key,
  t.metadata->>'customer_id' AS metadata_customer_id,
  t.metadata->>'family_label' AS metadata_family_label,
  t.last_message_at,
  CASE
    WHEN t.primary_entity_type IN ('customers', 'customer')
      AND EXISTS (SELECT 1 FROM customers c WHERE c.id = t.primary_entity_id::uuid AND c.org_id = t.org_id)
      THEN 'valid_direct_customer'
    WHEN t.primary_entity_type IN ('opportunities', 'opportunity')
      AND EXISTS (
        SELECT 1 FROM opportunities o
        WHERE o.id = t.primary_entity_id::uuid AND o.org_id = t.org_id AND o.customer_id IS NOT NULL
      )
      THEN 'opportunity_with_customer'
    WHEN t.primary_entity_type IN ('persons', 'person')
      AND EXISTS (
        SELECT 1 FROM customer_persons cp
        WHERE cp.person_id = t.primary_entity_id::uuid AND cp.org_id = t.org_id
      )
      THEN 'person_with_household'
    WHEN (t.metadata->>'customer_id')::uuid IS NOT NULL
      AND EXISTS (SELECT 1 FROM customers c WHERE c.id = (t.metadata->>'customer_id')::uuid AND c.org_id = t.org_id)
      THEN 'metadata_customer_only'
    ELSE 'unresolved_or_orphan'
  END AS classification
FROM communication_threads t
WHERE t.org_id = :org_id
ORDER BY t.last_message_at DESC NULLS LAST
LIMIT 200;
```

```sql
-- 2) Generic "Family" label sources (metadata + customer name gaps)
SELECT
  t.id AS thread_id,
  COALESCE(c.name, t.metadata->>'family_label', '(blank)') AS display_source,
  t.primary_entity_type,
  t.primary_entity_id,
  t.metadata->>'customer_id' AS metadata_customer_id
FROM communication_threads t
LEFT JOIN customers c ON c.id = COALESCE(
  NULLIF(t.primary_entity_id, '')::uuid,
  (t.metadata->>'customer_id')::uuid
) AND c.org_id = t.org_id
WHERE t.org_id = :org_id
  AND (
    COALESCE(c.name, '') = ''
    OR LOWER(COALESCE(t.metadata->>'family_label', '')) = 'family'
    OR COALESCE(c.name, '') ILIKE 'family'
  );
```

```sql
-- 3) Kurzman duplicate investigation
SELECT
  t.id AS thread_id,
  COALESCE(c.id::text, t.metadata->>'customer_id') AS customer_id,
  c.name AS customer_name,
  t.metadata->>'topic' AS topic,
  t.metadata->>'subject' AS subject,
  t.channel,
  t.last_message_at
FROM communication_threads t
LEFT JOIN customers c ON c.org_id = t.org_id AND (
  c.id = NULLIF(t.primary_entity_id, '')::uuid
  OR c.id = (t.metadata->>'customer_id')::uuid
)
WHERE t.org_id = :org_id
  AND (
    c.name ILIKE '%kurzman%'
    OR t.metadata->>'family_label' ILIKE '%kurzman%'
  )
ORDER BY customer_id, t.last_message_at DESC;
```

```sql
-- 4) Duplicate projection candidates (same customer + topic + channel)
WITH enriched AS (
  SELECT
    t.id AS thread_id,
    COALESCE(
      CASE WHEN t.primary_entity_type IN ('customers','customer') THEN t.primary_entity_id::uuid END,
      o.customer_id,
      cp.customer_id,
      (t.metadata->>'customer_id')::uuid
    ) AS customer_id,
    LOWER(COALESCE(t.metadata->>'topic', 'general')) AS topic_key,
    LOWER(COALESCE(t.channel, 'unknown')) AS channel_key,
    t.last_message_at
  FROM communication_threads t
  LEFT JOIN opportunities o ON o.id = t.primary_entity_id::uuid AND o.org_id = t.org_id
  LEFT JOIN customer_persons cp ON cp.person_id = t.primary_entity_id::uuid AND cp.org_id = t.org_id
  WHERE t.org_id = :org_id
)
SELECT customer_id, topic_key, channel_key, COUNT(*) AS row_count, array_agg(thread_id ORDER BY last_message_at DESC) AS thread_ids
FROM enriched
WHERE customer_id IS NOT NULL
GROUP BY customer_id, topic_key, channel_key
HAVING COUNT(*) > 1;
```

## Classification buckets (expected counts)

| Category | Detection signal | Hotfix behavior |
|----------|------------------|-----------------|
| valid family + distinct topic | same `customer_id`, different `topic_label` | both rows in normal inbox |
| duplicate projection | same `customer_id` + topic + channel | dedupe keeps newest activity |
| valid thread missing `customer_id` | resolvable via opp/person/metadata | auto-resolve in enrichment if unique |
| person/opportunity without customer | entity anchor, no `customer_persons` / `opportunities.customer_id` | quarantine |
| orphaned thread | no entity, no metadata customer | quarantine |
| legacy conversation | metadata-only linkage | resolve if unique metadata customer |
| ambiguous family resolution | multiple customer candidates | quarantine + review label |
| inactive/deleted family | `customerExists = false` | quarantine + inactive message |
| separate customers, same display name | two `customer_id`s, same `name` | report; **no auto-merge** |

## Safe auto-fix candidates

- Populate `communication_threads.metadata.customer_id` when linkage is unique and provable from opportunity or person join.
- Stamp canonical topic metadata when subject/action_label exists but topic is blank.
- Invalidate derived queue cache rows only (no message/thread deletion).

## Requires human review

- Merging duplicate `customers` records (e.g. two Kurzman households).
- Reassigning ambiguous participant ownership.
- Deleting threads/messages.
- Cross-tenant record moves.

## Post-hotfix validation checklist

- [ ] Normal inbox rows load workspace (no blank failure pane)
- [ ] Generic `Family` rows absent from normal queue
- [ ] Kurzman: one family count, multiple topics if legitimately distinct
- [ ] Unresolved rows appear under **Needs resolution**
- [ ] Transient load failures show Retry affordance
