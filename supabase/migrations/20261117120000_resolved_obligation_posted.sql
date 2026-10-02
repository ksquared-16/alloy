-- =============================================================================
-- AN OBLIGATION THAT PRODUCED REAL MONEY SAYS SO
--
-- `resolved_obligations.status` admitted previewed | drafted | no_charge | superseded, and none of
-- them means "the canonical charge posted". So an obligation stayed `drafted` forever after its
-- charge became real: the deployed census found 21 sitting `drafted` / `pending`, and ONE of those
-- held a charge that was already posted. State that cannot distinguish "an economic candidate" from
-- "real money" is not state truth.
--
-- ── WHY NOT `reviewed` ──
--
-- `review_status` answers whether a human or a policy reviewed the obligation. Automatic posting is
-- not review, and marking an auto-posted obligation `reviewed` would record a review that never
-- happened — a lie that would then justify skipping one. The two axes stay separate: `status` is
-- what the obligation BECAME, `review_status` is whether anyone looked.
--
-- ── THE SMALLEST TRUTHFUL ADDITION ──
--
-- One value. `previewed`, `no_charge` and `superseded` keep their meanings, `drafted` keeps its own
-- and now means what it always should have — a candidate that is not real yet — because `posted` is
-- available to mean the rest. No transition is removed and no other column changes.
-- =============================================================================

ALTER TABLE public.resolved_obligations
    DROP CONSTRAINT IF EXISTS resolved_obligations_status_check;
ALTER TABLE public.resolved_obligations
    ADD CONSTRAINT resolved_obligations_status_check
        CHECK (status = ANY (ARRAY['previewed'::text, 'drafted'::text, 'no_charge'::text,
                                   'superseded'::text, 'posted'::text]));

COMMENT ON COLUMN public.resolved_obligations.status IS
    'Resolution lifecycle: previewed | drafted | no_charge | superseded | posted. `posted` is terminal and means this obligation''s canonical charge successfully posted and became real economics — it is set from the SUCCESS of postChildcareCharge, never from an attempt. Distinct from review_status, which says whether anyone reviewed it: automatic posting is not review.';
