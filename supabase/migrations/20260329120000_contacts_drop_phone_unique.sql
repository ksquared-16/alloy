-- Allow multiple contacts with the same normalized phone when email differs (book-v2
-- identity: phone alone must not merge records with incompatible emails).
-- Drops redundant partial unique indexes from remote_schema; non-unique indexes remain / are ensured.

DROP INDEX IF EXISTS public.contacts_phone_unique;
DROP INDEX IF EXISTS public.ux_contacts_phone_not_null;

-- Typical queries filter org_id + phone; composite supports that path efficiently.
CREATE INDEX IF NOT EXISTS idx_contacts_org_phone ON public.contacts USING btree (org_id, phone);

-- Broad phone lookup (legacy / admin); remote_schema already defines idx_contacts_phone.
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts USING btree (phone);
