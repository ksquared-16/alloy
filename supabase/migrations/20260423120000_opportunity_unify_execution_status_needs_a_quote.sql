-- =============================================================================
-- Unify opportunity execution status: public book-v2 now uses needs_a_quote
-- (same configurable status as admin/Growth/specialty). Deprecate quote_started
-- as a status_key — workflow events may still use event_type 'quote_started'.
-- =============================================================================

UPDATE public.opportunities
SET status_key = 'needs_a_quote',
    updated_at = now()
WHERE status_key = 'quote_started';

UPDATE public.status_definitions
SET
    is_active = false,
    metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
            'deprecated',
            true,
            'replaced_by_status_key',
            'needs_a_quote',
            'note',
            'Use needs_a_quote for execution-phase quoting; event_type quote_started unchanged for workflows.'
        ),
    updated_at = now()
WHERE entity_type = 'opportunities'
  AND status_key = 'quote_started';
