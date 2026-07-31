-- Law 4, editor slice 2 — an optimistic-concurrency token for the DRAFT itself.
--
-- `base_revision_id` answers "was this draft based on the current publication?". It cannot answer
-- "did someone else edit this draft while my editor had it open?", because it only moves at publish.
-- Two operators editing the same department between publishes would silently last-write-wins each
-- other — the exact defect Law 4 forbids, one level down from the one it already fixed.
--
-- So the two conflicts are now distinct and separately reportable:
--
--   draft-edit conflict       -> `draft_revision` moved since the editor loaded it
--   publication conflict      -> `base_revision_id` no longer matches the current publication
--
-- Mechanism: a monotonically increasing counter written by a conditional UPDATE
-- (`... WHERE draft_revision = <expected>`). A single UPDATE statement is atomic, so no RPC is
-- needed for the compare-and-set itself.
--
-- The trigger below is what makes the token STRUCTURAL rather than conventional. Law 6's lesson in
-- this codebase is that a safety mechanism depending on every caller remembering to participate is
-- not a guarantee (docs/platform/governance/configuration-integrity-laws.md). A future writer that
-- changes `payload` without advancing the counter is therefore rejected, not silently accepted.

ALTER TABLE public.business_process_drafts
    ADD COLUMN IF NOT EXISTS draft_revision bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.business_process_drafts.draft_revision IS
    'Optimistic-concurrency token for draft EDITS. Advances by exactly 1 on every payload change; compare-and-set with UPDATE ... WHERE draft_revision = <expected>. Distinct from base_revision_id, which is the PUBLICATION conflict token.';

CREATE OR REPLACE FUNCTION public.guard_business_process_draft_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    -- Only a payload change needs the token. Publish rebases `base_revision_id` and the validate
    -- action rewrites `validation_errors`; neither is an edit to the configuration itself.
    IF NEW.payload IS NOT DISTINCT FROM OLD.payload THEN
        RETURN NEW;
    END IF;

    IF NEW.draft_revision <> OLD.draft_revision + 1 THEN
        RAISE EXCEPTION
            'business_process_draft_revision_not_advanced (current=% attempted=%)',
            OLD.draft_revision, NEW.draft_revision
            USING ERRCODE = '40001',
                  HINT = 'Change the payload with UPDATE ... SET draft_revision = <loaded> + 1 WHERE draft_revision = <loaded>.';
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_business_process_draft_revision() IS
    'Makes the draft optimistic-concurrency token structural: a payload change must advance draft_revision by exactly 1, so a writer cannot opt out of compare-and-set.';

DROP TRIGGER IF EXISTS trg_business_process_drafts_revision_guard ON public.business_process_drafts;
CREATE TRIGGER trg_business_process_drafts_revision_guard
    BEFORE UPDATE ON public.business_process_drafts
    FOR EACH ROW EXECUTE FUNCTION public.guard_business_process_draft_revision();
