-- Canonical phone identity for Person resolution.
--
-- THE DEFECT. A live inbound SMS from a number a Person already owns resolved to
-- `unknown_sender`. `persons.phone` held `6022904816`; the inbound number
-- normalized to `+16022904816`; the resolver compared them with string equality.
-- One canonical Person owned the endpoint and Alloy could not see it.
--
-- WHY A GENERATED COLUMN rather than a lookup-variant list. The repo already has
-- the right ANSWER for this — `lib/identity/phoneLookupVariants.ts`, which expands
-- a number into the legacy shapes it might be stored as, and is used by intake
-- person matching. It cannot be reused here: the inbound SMS resolver is Python
-- and speaks to PostgREST, so importing the TypeScript authority is impossible,
-- and reimplementing it in Python would give Communications the private
-- phone-normalization algorithm this fix exists to avoid.
--
-- Putting the canonical form in the DATA MODEL lets both runtimes ask the same
-- question of the same authority. It also fixes history for free: the column is
-- generated from whatever `phone` already holds, so every differently-formatted
-- legacy row becomes matchable without a backfill, and future writes converge
-- because the database computes it rather than a caller remembering to.
--
-- SEMANTICS match `phoneDigitsNanp`: the last ten digits. Deliberately NULL below
-- ten digits, so a short or malformed value cannot collide with a real number —
-- a false match here would file one family's message on another family's record.
-- International numbers beyond NANP are out of scope, exactly as they are for the
-- existing TypeScript authority; this does not make them worse.

ALTER TABLE public.persons
    ADD COLUMN IF NOT EXISTS phone_canonical text
    GENERATED ALWAYS AS (
        CASE
            WHEN length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
                THEN right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10)
            ELSE NULL
        END
    ) STORED;

COMMENT ON COLUMN public.persons.phone_canonical IS
    'Last ten digits of `phone`, or NULL below ten. The canonical form Person lookup matches on, so stored formatting cannot change identity. Generated — never written directly.';

-- Org-scoped, because a lookup must never cross tenants.
CREATE INDEX IF NOT EXISTS persons_org_phone_canonical_idx
    ON public.persons (org_id, phone_canonical)
    WHERE phone_canonical IS NOT NULL;
