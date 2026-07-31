-- Phase 0 / P0-3 (commit 5) — immutable rendered send snapshot.
--
-- SMALLEST ADDITIVE CHANGE: one nullable jsonb column. Template lineage lives
-- INSIDE the snapshot rather than as separate template_id / template_version
-- columns, because Phase 0 needs to PROVE what was sent, not to enable template
-- analytics (that is Phase 4, where a real FK earns its keep).
--
-- WHY EXISTING FIELDS ARE INSUFFICIENT
-- `communication_messages.metadata` was the obvious candidate and was rejected:
-- it is MUTATED after enqueue. web/lib/communications/providerDeliveryPersistence.ts:9-18
-- merges the last 30 provider webhook events into metadata on every delivery
-- callback. A snapshot that must be immutable cannot live in a column that a
-- webhook rewrites.
--
-- `body` is also insufficient: it holds only the plain-text result, with no
-- subject, no html, no resolved-token record, and no lineage — so it cannot
-- answer "what exactly did this family receive, from which template version,
-- with which values substituted?"
--
-- FRESH REPLAY: the column is created empty; new sends populate it.
-- UPGRADE:      additive and nullable, so existing rows are untouched and every
--               current reader keeps working. `body` continues to be written.
-- COMPATIBILITY: nothing reads the column until the renderer writes it.
-- ROLLBACK:     drop the column; the send path falls back to `body` alone.
--
-- Deliberately NOT included: the Phase 1 structured-content model
-- (authored blocks, attachments, interactive actions). Phase 0 adds only what
-- is needed to prove and retain the rendered result.

ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS rendered_snapshot jsonb NULL;

COMMENT ON COLUMN public.communication_messages.rendered_snapshot IS
    'Immutable record of what was approved and enqueued: subject, plain text, sanitized html, the exact resolved token values, template lineage (id + version), render contract version, and a fingerprint used for stale-preview detection. Written ONCE by the canonical renderer at enqueue and never updated - later template edits or record changes must not mutate an already-enqueued message. Deliberately NOT stored in metadata, which the provider delivery webhook rewrites.';
