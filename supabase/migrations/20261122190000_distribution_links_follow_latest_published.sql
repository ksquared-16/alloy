-- Distribution links follow the latest published version.
--
-- "Create distribution link(s)" minted each link pinned to the version published at that moment, so a
-- republish never reached a website that had already embedded the link: Firefly's three campus links
-- kept serving v1 after v2 and v3 were published. A distribution link is a standing URL, so it must
-- not be pinned. The route now never pins one (and un-pins a reused one); this repairs the links
-- minted before that.
--
-- Scope: active Processing-intake links carrying a persisted share path — exactly the links the
-- distribution panel mints and reuses. One-time and packet links are untouched.
-- Re-runnable: a second run matches no rows.

UPDATE public.form_public_links
SET pinned_form_definition_version_id = NULL,
    updated_at = now()
WHERE pinned_form_definition_version_id IS NOT NULL
  AND is_active
  AND metadata->>'form_context_mode' = 'processing_intake'
  AND metadata ? 'share_embed_path';
